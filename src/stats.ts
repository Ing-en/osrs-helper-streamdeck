import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { onUpdated, request, type TrackerId } from "./trackers";

/**
 * Player stats from Wise Old Man or TempleOSRS: skill XP plus boss and activity counts, keyed by Wise Old Man's metric
 * names. Every lookup is also saved to disk, so the goal key keeps working (and has a rate history) when the sites are
 * unreachable.
 */

export const SKILLS = [
	"overall", "attack", "defence", "strength", "hitpoints", "ranged", "prayer", "magic", "cooking", "woodcutting",
	"fletching", "fishing", "firemaking", "crafting", "smithing", "mining", "herblore", "agility", "thieving", "slayer",
	"farming", "runecrafting", "hunter", "construction", "sailing"
];

export type Period = "day" | "week" | "month";
const PERIOD_HOURS: Record<Period, number> = { day: 24, week: 168, month: 730 };

/** Values at one moment: XP for skills, kills or score for bosses and activities. */
export type Snapshot = { at: number; values: Record<string, number> };
/** What was gained over the last `hours`. */
export type Gains = { values: Record<string, number>; hours: number };

export class NotFound extends Error {}

const STATS_DIR = path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "osrs-helper", "stats");
const MAX_SAVED = 1000;
/** How long a lookup is reused before asking the site again. */
const REFRESH_MILLIS = 30 * 60_000;

const name = (player: string) => encodeURIComponent(player.trim());

// TempleOSRS names that don't normalise to Wise Old Man's
const TEMPLE_ALIASES: Record<string, string> = {
	runecraft: "runecrafting",
	clue_all: "clue_scrolls_all",
	clue_beginner: "clue_scrolls_beginner",
	clue_easy: "clue_scrolls_easy",
	clue_medium: "clue_scrolls_medium",
	clue_hard: "clue_scrolls_hard",
	clue_elite: "clue_scrolls_elite",
	clue_master: "clue_scrolls_master",
	lms: "last_man_standing",
	the_nightmare: "nightmare",
	theatre_of_blood_challenge_mode: "theatre_of_blood_hard_mode",
	rift: "guardians_of_the_rift",
	hueycoatl: "the_hueycoatl",
	collections: "collections_logged"
};

function templeValues(data: Record<string, unknown>): Record<string, number> {
	const values: Record<string, number> = {};
	for (const [key, value] of Object.entries(data)) {
		if (typeof value !== "number" || /_(rank|level|ehp|ehb)$/i.test(key) || /^(ehp|ehb)$/i.test(key)) {
			continue;
		}
		const metric = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
		values[TEMPLE_ALIASES[metric] ?? metric] = Math.max(0, value);
	}
	return values;
}

type WomMetric = { experience?: number | { gained: number }; kills?: number | { gained: number }; score?: number | { gained: number } };

function womValues(data: { skills?: Record<string, WomMetric>; bosses?: Record<string, WomMetric>; activities?: Record<string, WomMetric> }): Record<string, number> {
	const values: Record<string, number> = {};
	const read = (v: number | { gained: number } | undefined) => (typeof v === "number" ? v : v?.gained ?? 0);
	for (const [key, m] of Object.entries(data.skills ?? {})) values[key] = Math.max(0, read(m.experience));
	for (const [key, m] of Object.entries(data.bosses ?? {})) values[key] = Math.max(0, read(m.kills));
	for (const [key, m] of Object.entries(data.activities ?? {})) values[key] = Math.max(0, read(m.score));
	return values;
}

async function fetchSnapshot(source: TrackerId, player: string): Promise<Snapshot> {
	if (source === "wom") {
		const res = await request(`https://api.wiseoldman.net/v2/players/${name(player)}`);
		if (res.status === 404 || res.status === 400) {
			throw new NotFound(player);
		}
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const body = (await res.json()) as { updatedAt?: string; latestSnapshot?: { createdAt?: string; data?: Parameters<typeof womValues>[0] } };
		if (!body.latestSnapshot?.data) {
			throw new NotFound(player);
		}
		return { at: Date.parse(body.latestSnapshot.createdAt ?? body.updatedAt ?? "") || Date.now(), values: womValues(body.latestSnapshot.data) };
	}

	const res = await request(`https://templeosrs.com/api/player_stats.php?player=${name(player)}&bosses=1`);
	const body = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: unknown };
	if (!body.data) {
		if (body.error) {
			throw new NotFound(player);
		}
		throw new Error(`HTTP ${res.status}`);
	}
	// "2026-11-07 10:20:45", in UTC
	const date = typeof body.data.date === "string" ? Date.parse(body.data.date.replace(" ", "T") + "Z") : NaN;
	return { at: Number.isFinite(date) ? date : Date.now(), values: templeValues(body.data) };
}

async function fetchGains(source: TrackerId, player: string, period: Period): Promise<Gains> {
	if (source === "wom") {
		const res = await request(`https://api.wiseoldman.net/v2/players/${name(player)}/gained?period=${period}`);
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const body = (await res.json()) as { startsAt?: string; endsAt?: string; data?: Parameters<typeof womValues>[0] };
		const span = (Date.parse(body.endsAt ?? "") - Date.parse(body.startsAt ?? "")) / 3_600_000;
		return { values: womValues(body.data ?? {}), hours: Number.isFinite(span) && span > 0 ? span : PERIOD_HOURS[period] };
	}

	const res = await request(`https://templeosrs.com/api/player_gains.php?player=${name(player)}&time=${period}&bosses=1`);
	const body = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown> };
	if (!body.data) {
		throw new Error(`HTTP ${res.status}`);
	}
	return { values: templeValues(body.data), hours: PERIOD_HOURS[period] };
}

// ---- Local history

function fileFor(source: TrackerId, player: string): string {
	const safe = player.trim().toLowerCase().replace(/[^a-z0-9 _-]/g, "_");
	return path.join(STATS_DIR, source, `${safe}.json`);
}

async function loadSaved(source: TrackerId, player: string): Promise<Snapshot[]> {
	try {
		const json = JSON.parse(await readFile(fileFor(source, player), "utf8"));
		return Array.isArray(json.snapshots) ? json.snapshots : [];
	} catch {
		return [];
	}
}

async function save(source: TrackerId, player: string, snapshot: Snapshot): Promise<Snapshot[]> {
	const saved = await loadSaved(source, player);
	if (saved.at(-1)?.at !== snapshot.at) {
		saved.push(snapshot);
	}
	const kept = saved.slice(-MAX_SAVED);
	const file = fileFor(source, player);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(`${file}.tmp`, JSON.stringify({ player: player.trim(), source, snapshots: kept }));
	await rename(`${file}.tmp`, file);
	return kept;
}

/** Gains over the last `hours` from saved history, if it reaches back at least half that far. */
function localGains(saved: Snapshot[], hours: number): Gains | undefined {
	const latest = saved.at(-1);
	if (!latest) {
		return undefined;
	}
	const from = latest.at - hours * 3_600_000;
	const start = saved.find((s) => s.at >= from && s.at < latest.at);
	if (!start || (latest.at - start.at) / 3_600_000 < hours / 2) {
		return undefined;
	}
	const values: Record<string, number> = {};
	for (const [k, v] of Object.entries(latest.values)) {
		values[k] = Math.max(0, v - (start.values[k] ?? v));
	}
	return { values, hours: (latest.at - start.at) / 3_600_000 };
}

// ---- Cache shared by every key

export type PlayerStats = { snapshot?: Snapshot; gains?: Gains; notFound?: boolean; offline?: boolean };

type Entry = PlayerStats & { fetched: number; pending: boolean };
const cache = new Map<string, Entry>();
const cacheKey = (source: TrackerId, player: string, period: Period) => `${source}:${player.trim().toLowerCase()}:${period}`;

/** The latest known stats; starts a background refresh when they're missing or older than half an hour. */
export function playerStats(source: TrackerId, player: string, period: Period): PlayerStats | undefined {
	const key = cacheKey(source, player, period);
	const entry = cache.get(key);
	if (!entry || (!entry.pending && Date.now() - entry.fetched > REFRESH_MILLIS)) {
		void refreshStats(source, player, period, entry);
	}
	return entry;
}

/** Forgets cached stats for a player, e.g. after an update key has had the site refresh them. */
export function invalidateStats(source: TrackerId, player: string): void {
	for (const period of Object.keys(PERIOD_HOURS) as Period[]) {
		const entry = cache.get(cacheKey(source, player, period));
		if (entry) {
			entry.fetched = 0;
		}
	}
}

async function refreshStats(source: TrackerId, player: string, period: Period, previous: Entry | undefined): Promise<void> {
	const key = cacheKey(source, player, period);
	const entry: Entry = { ...(previous ?? {}), fetched: Date.now(), pending: true };
	cache.set(key, entry);
	try {
		const snapshot = await fetchSnapshot(source, player);
		const saved = await save(source, player, snapshot).catch(() => [snapshot]);
		const gains = await fetchGains(source, player, period).catch(() => localGains(saved, PERIOD_HOURS[period]));
		cache.set(key, { snapshot, gains, fetched: Date.now(), pending: false });
	} catch (e) {
		if (e instanceof NotFound) {
			cache.set(key, { notFound: true, fetched: Date.now(), pending: false });
			return;
		}
		// Offline or the site is down: fall back to what was saved last time
		const saved = previous?.snapshot ? undefined : await loadSaved(source, player);
		const snapshot = previous?.snapshot ?? saved?.at(-1);
		const gains = previous?.gains ?? (saved ? localGains(saved, PERIOD_HOURS[period]) : undefined);
		cache.set(key, { snapshot, gains, offline: true, fetched: Date.now(), pending: false });
	}
}

// Any key getting a site to update a player makes goal keys for that player fetch again
onUpdated((source, player) => invalidateStats(source, player));

// ---- Goals

/** Total XP needed for a level, 1–126. */
export function xpForLevel(level: number): number {
	let points = 0;
	for (let i = 1; i < level; i++) {
		points += Math.floor(i + 300 * 2 ** (i / 7));
	}
	return Math.floor(points / 4);
}

export type GoalProgress =
	| { state: "done" }
	| { state: "nogains"; remaining: number }
	| { state: "eta"; eta: number; remaining: number; perHour: number };

/**
 * For "gain N per day/week" goals: how much of `amount` is still to gain in the period the gains cover (the last 24 hours
 * or 7 days), and when it's reached at that period's rate.
 */
export function gainProgress(stats: PlayerStats, metric: string, amount: number): GoalProgress | undefined {
	if (!stats.snapshot || !stats.gains) {
		return undefined;
	}
	const gained = stats.gains.values[metric] ?? 0;
	const remaining = amount - gained;
	if (remaining <= 0) {
		return { state: "done" };
	}
	const perHour = stats.gains.hours > 0 ? gained / stats.gains.hours : 0;
	if (perHour <= 0) {
		return { state: "nogains", remaining };
	}
	return { state: "eta", eta: stats.snapshot.at + (remaining / perHour) * 3_600_000, remaining, perHour };
}

/** How far `target` is from the latest snapshot, and when it's reached at the recent rate. */
export function goalProgress(stats: PlayerStats, metric: string, target: number): GoalProgress | undefined {
	const current = stats.snapshot?.values[metric];
	if (current === undefined || !stats.snapshot) {
		return undefined;
	}
	const remaining = target - current;
	if (remaining <= 0) {
		return { state: "done" };
	}
	const gained = stats.gains?.values[metric] ?? 0;
	const perHour = stats.gains && stats.gains.hours > 0 ? gained / stats.gains.hours : 0;
	if (perHour <= 0) {
		return { state: "nogains", remaining };
	}
	return { state: "eta", eta: stats.snapshot.at + (remaining / perHour) * 3_600_000, remaining, perHour };
}
