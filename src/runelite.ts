import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import farming from "./farming-data.json";
import { parseProperties } from "./properties";
import type { TrackedItem } from "./state";

/**
 * Reads what RuneLite's Time Tracking plugin has saved to disk and makes the same predictions its Overview tab shows.
 * RuneLite writes its settings every 5 minutes and when it closes, so this can trail the game by a few minutes.
 *
 * The farming logic is ported from RuneLite's FarmingTracker and FarmingContractManager
 * (BSD-2-Clause, Copyright (c) 2018 Abex and RuneLite contributors).
 */

const PROFILES_DIR = path.join(os.homedir(), ".runelite", "profiles2");
const RS_PROFILES_FILE = path.join(PROFILES_DIR, "$rsprofile--1.properties");
const GROUP = "timetracking";
const BIRD_HOUSE_SECONDS = 50 * 60;
const BIRD_HOUSE_MAX_VARP = 4 * 3;
const AUTOWEED_ON = "2";
/** Accounts with no Time Tracking activity for this long are left out of the account list. */
const FORGOTTEN_SECONDS = 90 * 24 * 3600;

type PatchStateRow = [produce: string, crop: string, stage: number, stages: number, tickRate: number];
type Implementation = { tab: string | null; healthCheck: boolean; states: Record<string, PatchStateRow> };
type ProduceInfo = { name: string; itemId: number; impl: string | null };

const IMPLEMENTATIONS = farming.implementations as unknown as Record<string, Implementation>;
const PRODUCE = farming.produce as unknown as Record<string, ProduceInfo>;
const PATCHES = farming.patches as Record<string, { impl: string; region: string; name: string }>;
const TABS = farming.tabs as Record<string, string[]>;
const FARMING_GUILD = farming.farmingGuild as string[];

const TAB_NAMES: Record<string, string> = {
	HERB: "Herb Patches",
	TREE: "Tree Patches",
	FRUIT_TREE: "Fruit Tree Patches",
	SPECIAL: "Special Patches",
	FLOWER: "Flower Patches",
	ALLOTMENT: "Allotment Patches",
	BUSH: "Bush Patches",
	GRAPE: "Grape Patches",
	HOPS: "Hops Patches"
};

export type RuneLiteAccount = {
	name: string;
	/** Latest Time Tracking timestamp, epoch seconds. */
	lastSeen: number;
	tracking: TrackedItem[];
};

type Cached = { mtime: number; props: Map<string, string> };
const cache = new Map<string, Cached>();

/** Reads a properties file, reusing the last parse while it's unchanged on disk. */
async function load(file: string): Promise<Map<string, string>> {
	try {
		const mtime = (await stat(file)).mtimeMs;
		const cached = cache.get(file);
		if (cached && cached.mtime === mtime) {
			return cached.props;
		}
		const props = parseProperties(await readFile(file, "latin1"));
		cache.set(file, { mtime, props });
		return props;
	} catch {
		return new Map();
	}
}

/** The settings file of RuneLite's active profile, which holds timers and stopwatches. */
async function activeProfile(): Promise<Map<string, string>> {
	try {
		const json = JSON.parse(await readFile(path.join(PROFILES_DIR, "profiles.json"), "utf8"));
		const active = (json.profiles as { name: string; id: number; active?: boolean }[]).find((p) => p.active);
		return active ? await load(path.join(PROFILES_DIR, `${active.name}-${active.id}.properties`)) : new Map();
	} catch {
		return new Map();
	}
}

/** Every account RuneLite has Time Tracking data for, most recently played first. */
/** A goal from the user's Daily Goals RuneLite plugin, as it saves them. */
export type DailyGoal = {
	id: string;
	type: "XP" | "LEVEL" | "COUNT" | "KC";
	skill?: string;
	overall?: boolean;
	activity?: string;
	customName?: string;
	amount: number;
	period?: "DAILY" | "WEEKLY";
	enabled?: boolean;
};

/** The Daily Goals goals saved for an account (matched by name), or none. */
export async function readDailyGoals(account: string): Promise<DailyGoal[]> {
	const rs = await load(RS_PROFILES_FILE);
	const wanted = cleanName(account).toLowerCase();
	// Several profile keys can share a name; use the one whose goals list exists, preferring standard worlds
	let best: { goals: DailyGoal[]; standard: boolean } | undefined;
	for (const [prop, name] of rs) {
		const match = /^rsprofile\.rsprofile\.([^.]+)\.displayName$/.exec(prop);
		if (!match || cleanName(name).toLowerCase() !== wanted) {
			continue;
		}
		const raw = rs.get(`dailygoals.rsprofile.${match[1]}.goals`);
		if (!raw) {
			continue;
		}
		try {
			const goals = JSON.parse(raw);
			const standard = rs.get(`rsprofile.rsprofile.${match[1]}.type`) === "STANDARD";
			if (Array.isArray(goals) && (!best || (standard && !best.standard))) {
				best = { goals: goals.filter((g) => g && typeof g.id === "string"), standard };
			}
		} catch {
			// A half-written file; it'll be whole next time
		}
	}
	return best?.goals ?? [];
}

export async function readAccounts(nowSeconds = Date.now() / 1000): Promise<RuneLiteAccount[]> {
	const rs = await load(RS_PROFILES_FILE);
	const settings = await activeProfile();

	// Several profile keys can share a name (leagues, old logins); use the standard one with the newest data
	const best = new Map<string, { key: string; name: string; lastSeen: number }>();
	for (const [prop, rawName] of rs) {
		const match = /^rsprofile\.rsprofile\.([^.]+)\.displayName$/.exec(prop);
		if (!match || rs.get(`rsprofile.rsprofile.${match[1]}.type`) !== "STANDARD") {
			continue;
		}
		const name = cleanName(rawName);
		const lastSeen = latestTimestamp(rs, match[1]);
		const current = best.get(name.toLowerCase());
		if (lastSeen > 0 && (!current || lastSeen > current.lastSeen)) {
			best.set(name.toLowerCase(), { key: match[1], name, lastSeen });
		}
	}

	const clocks = clockItems(settings, nowSeconds);
	const preferSoonest = settings.get(`${GROUP}.preferSoonest`) === "true";
	const accounts: RuneLiteAccount[] = [];
	for (const { key, name, lastSeen } of best.values()) {
		if (nowSeconds - lastSeen > FORGOTTEN_SECONDS) {
			continue;
		}
		const profile = new Profile(rs, key);
		accounts.push({
			name,
			lastSeen,
			tracking: [...farmingItems(profile, preferSoonest, nowSeconds), birdHouses(profile, nowSeconds), contract(profile, nowSeconds), ...clocks]
		});
	}
	return accounts.sort((a, b) => b.lastSeen - a.lastSeen);
}

const NBSP = String.fromCharCode(0xa0);

/** RuneScape names can contain non-breaking spaces; window titles are matched with plain ones. */
function cleanName(name: string): string {
	return name.split(NBSP).join(" ").trim();
}

function latestTimestamp(rs: Map<string, string>, key: string): number {
	const prefix = `${GROUP}.rsprofile.${key}.`;
	let latest = 0;
	for (const [prop, value] of rs) {
		if (prop.startsWith(prefix)) {
			const time = Number(value.split(":")[1]);
			if (Number.isFinite(time) && time > latest) {
				latest = time;
			}
		}
	}
	return latest;
}

/** One account's Time Tracking settings. */
class Profile {
	constructor(
		private readonly rs: Map<string, string>,
		private readonly key: string
	) {}

	get(name: string): string | undefined {
		return this.rs.get(`${GROUP}.rsprofile.${this.key}.${name}`);
	}

	/** FarmingTracker.getTickTime: when the farming tick `ticks` after `time` happens, honouring the account's tick offset. */
	tickTime(tickRate: number, ticks: number, time: number): number {
		const precision = Number(this.get("farmTickOffsetPrecision"));
		const offset = Number(this.get("farmTickOffset"));
		let offsetSeconds = 0;
		if (Number.isFinite(precision) && Number.isFinite(offset) && this.get("farmTickOffset") !== undefined && (precision >= tickRate || precision >= 40)) {
			offsetSeconds = (offset % tickRate) * 60;
		}
		const now = time + offsetSeconds;
		const currentTick = now - (now % (tickRate * 60));
		return currentTick + ticks * tickRate * 60 - offsetSeconds;
	}
}

type Prediction = { produce: string; crop: string; done: number };

/** FarmingTracker.predictPatch */
function predict(profile: Profile, patchKey: string): Prediction | undefined {
	const stored = profile.get(patchKey);
	const patch = PATCHES[patchKey];
	if (!stored || !patch) {
		return undefined;
	}
	const [value, time] = stored.split(":").map(Number);
	if (!(time > 0)) {
		return undefined;
	}
	const row = IMPLEMENTATIONS[patch.impl]?.states[String(value)];
	if (!row) {
		return undefined;
	}

	const [produce, crop, stageAt, stagesAt, tickRateAt] = row;
	let stage = stageAt;
	let stages = stagesAt;
	let tickRate = tickRateAt;
	if (profile.get("autoweed") === AUTOWEED_ON && produce === "WEEDS") {
		stage = 0;
		stages = 1;
		tickRate = 0;
	}

	let done = 0;
	if (tickRate > 0) {
		const tickThen = profile.tickTime(tickRate, 0, time);
		done = profile.tickTime(tickRate, stages - 1 - stage, tickThen);
	}
	return { produce, crop, done };
}

/** FarmingTracker.updateCompletionTime, one item per patch type. */
function farmingItems(profile: Profile, preferSoonest: boolean, nowSeconds: number): TrackedItem[] {
	return Object.entries(TABS).map(([tab, patchKeys]) => {
		const id = tab.toLowerCase();
		const name = TAB_NAMES[tab] ?? tab;
		const label = name.replace(" Patches", "").toUpperCase();

		let extremum = preferSoonest ? Number.MAX_SAFE_INTEGER : 0;
		let allUnknown = true;
		let allEmpty = true;
		for (const key of patchKeys) {
			const p = predict(profile, key);
			if (!p || (PRODUCE[p.produce]?.itemId ?? -1) < 0) {
				continue;
			}
			allUnknown = false;
			if (p.produce !== "WEEDS" && p.produce !== "SCARECROW" && p.crop !== "EMPTY" && p.crop !== "FILLING") {
				allEmpty = false;
				extremum = preferSoonest ? Math.min(extremum, p.done) : Math.max(extremum, p.done);
			}
		}

		if (allUnknown) {
			return item(id, name, label, "unknown");
		}
		if (allEmpty) {
			return item(id, name, label, "empty");
		}
		return countdown(id, name, label, extremum, nowSeconds);
	});
}

/** BirdHouseTracker.updateCompletionTime */
function birdHouses(profile: Profile, nowSeconds: number): TrackedItem {
	const id = "birdhouse";
	const name = "Bird Houses";
	const label = "BIRDHOUSES";
	let any = false;
	let allEmpty = true;
	let latest = 0;
	for (const space of [1626, 1627, 1628, 1629]) {
		const stored = profile.get(`birdhouse.${space}`);
		if (!stored) {
			continue;
		}
		const [varp, time] = stored.split(":").map(Number);
		if (!Number.isFinite(varp) || !Number.isFinite(time)) {
			continue;
		}
		any = true;
		if (varp !== 0) {
			allEmpty = false;
		}
		if (varp > 0 && varp <= BIRD_HOUSE_MAX_VARP && varp % 3 === 0) {
			latest = Math.max(latest, time + BIRD_HOUSE_SECONDS);
		}
	}
	if (!any) {
		return item(id, name, label, "unknown");
	}
	return allEmpty ? item(id, name, label, "empty") : countdown(id, name, label, latest, nowSeconds);
}

/** FarmingContractManager.handleContractState */
function contract(profile: Profile, nowSeconds: number): TrackedItem {
	const id = "contract";
	const name = "Farming Contract";
	const itemId = Number(profile.get("contract"));
	const produceKey = Object.keys(PRODUCE).find((k) => PRODUCE[k].itemId === itemId);
	if (!produceKey) {
		return item(id, name, "CONTRACT", "unknown");
	}
	const wanted = PRODUCE[produceKey];
	const label = wanted.name.toUpperCase();
	const impl = wanted.impl ? IMPLEMENTATIONS[wanted.impl] : undefined;

	let state: TrackedItem["state"] = "unknown";
	let end = Number.MAX_SAFE_INTEGER;
	let hasEmpty = false;
	let hasDiseased = false;
	let hasDead = false;

	for (const key of FARMING_GUILD) {
		if (PATCHES[key]?.impl !== wanted.impl) {
			continue;
		}
		const p = predict(profile, key);
		if (!p) {
			continue;
		}

		if (end === Number.MAX_SAFE_INTEGER) {
			if (p.produce === "WEEDS") {
				if (!(hasDiseased || hasDead)) {
					state = "empty";
				}
				hasEmpty = true;
				continue;
			}
			if (impl?.healthCheck && p.crop === "HARVESTABLE" && !(hasEmpty || hasDiseased || hasDead)) {
				state = "occupied";
				continue;
			}
		}

		// Herbs always turn into ANYHERB when dead
		if (p.produce !== produceKey && p.produce !== "ANYHERB") {
			if (!(hasEmpty || hasDiseased || hasDead) && end === Number.MAX_SAFE_INTEGER) {
				state = "occupied";
			}
			continue;
		}
		if (p.crop === "DEAD" && (hasDiseased || end !== Number.MAX_SAFE_INTEGER)) {
			continue;
		}
		if (p.crop === "DISEASED" && end !== Number.MAX_SAFE_INTEGER) {
			continue;
		}

		if (p.crop === "DISEASED") {
			hasDiseased = true;
			state = "diseased";
		} else if (p.crop === "DEAD") {
			hasDead = true;
			state = "dead";
		} else {
			end = Math.min(p.done, end);
			if (end <= nowSeconds) {
				return { ...item(id, name, label, "ready"), end };
			}
			state = "countdown";
		}
	}

	return state === "countdown" ? countdown(id, name, label, end, nowSeconds) : item(id, name, label, state);
}

type Clock = { name?: string; lastUpdate?: number; active?: boolean; remaining?: number; elapsed?: number };

/** Timers and stopwatches, which RuneLite keeps per settings profile rather than per account. */
function clockItems(settings: Map<string, string>, nowSeconds: number): TrackedItem[] {
	const parse = (key: string): Clock[] => {
		try {
			const list = JSON.parse(settings.get(`${GROUP}.${key}`) ?? "[]");
			return Array.isArray(list) ? list.filter((c: Clock) => typeof c?.name === "string") : [];
		} catch {
			return [];
		}
	};

	const items: TrackedItem[] = [];
	const ids = new Set<string>();
	const unique = (id: string): string => {
		let result = id;
		for (let i = 2; ids.has(result); i++) {
			result = `${id}#${i}`;
		}
		ids.add(result);
		return result;
	};

	let next: TrackedItem | undefined;
	for (const timer of parse("timers")) {
		const name = timer.name!;
		const id = unique(`timer:${name}`);
		const remaining = timer.remaining ?? 0;
		let entry: TrackedItem;
		if (timer.active) {
			entry = countdown(id, `Timer: ${name}`, name.toUpperCase(), (timer.lastUpdate ?? 0) + remaining, nowSeconds);
		} else if (remaining <= 0) {
			entry = item(id, `Timer: ${name}`, name.toUpperCase(), "ready");
		} else {
			entry = { ...item(id, `Timer: ${name}`, name.toUpperCase(), "paused"), seconds: remaining };
		}
		items.push(entry);
		if (entry.state === "countdown" && (!next || entry.end < next.end)) {
			next = entry;
		}
	}

	for (const stopwatch of parse("stopwatches")) {
		const name = stopwatch.name!;
		const id = unique(`stopwatch:${name}`);
		const elapsed = stopwatch.elapsed ?? 0;
		items.push(
			stopwatch.active
				? { ...item(id, `Stopwatch: ${name}`, name.toUpperCase(), "running"), start: (stopwatch.lastUpdate ?? 0) - elapsed }
				: { ...item(id, `Stopwatch: ${name}`, name.toUpperCase(), "paused"), seconds: elapsed }
		);
	}

	items.unshift(next ? { ...next, id: "timers", name: "Next timer to finish" } : item("timers", "Next timer to finish", "TIMERS", "empty"));
	return items;
}

function item(id: string, name: string, label: string, state: TrackedItem["state"]): TrackedItem {
	return { id, name, label, state, end: 0, seconds: 0, start: 0 };
}

function countdown(id: string, name: string, label: string, end: number, nowSeconds: number): TrackedItem {
	// Keep the end time either way, so a ready key can still show when it became ready
	return { ...item(id, name, label, end <= nowSeconds ? "ready" : "countdown"), end };
}
