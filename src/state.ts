import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Written by the "Stream Deck" RuneLite plugin, one file per account. */
export const ACCOUNTS_DIR = path.join(os.homedir(), ".runelite", "streamdeck", "accounts");

/** RuneLite rewrites each file every 2 seconds; older than this means that client is closed or on another account. */
const STALE_MILLIS = 8000;

/** Key setting value for watching every account. */
export const ANY_ACCOUNT = "any";

export type IdleKind = "active" | "idle" | "logout" | "alert" | "loggedout" | "kicked" | "offline";

export type IdleState = {
	state: IdleKind;
	label: string;
	message: string;
	since: number;
};

export type TrackedKind =
	| "ready"
	| "countdown"
	| "running"
	| "paused"
	| "empty"
	| "occupied"
	| "diseased"
	| "dead"
	| "unknown"
	| "disabled";

export type TrackedItem = {
	id: string;
	name: string;
	label: string;
	state: TrackedKind;
	/** Epoch second a countdown ends. */
	end: number;
	/** Seconds shown on a paused timer or stopwatch. */
	seconds: number;
	/** Epoch second a running stopwatch counts up from. */
	start: number;
};

export type Account = {
	name: string;
	updated: number;
	/** Whether a client is still writing this account's file. */
	online: boolean;
	idle: IdleState;
	/** Last known Time Tracking data; still valid after RuneLite closes since end times are absolute. */
	tracking: TrackedItem[];
};

export type Snapshot = {
	/** Most recently updated first. */
	accounts: Account[];
};

export const OFFLINE: IdleState = { state: "offline", label: "", message: "", since: 0 };

export async function readSnapshot(now = Date.now()): Promise<Snapshot> {
	let files: string[];
	try {
		files = (await readdir(ACCOUNTS_DIR)).filter((f) => f.endsWith(".json"));
	} catch {
		// The RuneLite plugin hasn't run yet
		return { accounts: [] };
	}

	const accounts: Account[] = [];
	for (const file of files) {
		try {
			const json = JSON.parse(await readFile(path.join(ACCOUNTS_DIR, file), "utf8"));
			const online = typeof json.updated === "number" && now - json.updated <= STALE_MILLIS;
			accounts.push({
				name: typeof json.account === "string" ? json.account : file.slice(0, -5),
				updated: json.updated ?? 0,
				online,
				idle: online && json.idle && json.idle.state !== "offline" ? json.idle : OFFLINE,
				tracking: Array.isArray(json.tracking) ? json.tracking : []
			});
		} catch {
			// Caught mid-write; it'll be there next tick
		}
	}
	accounts.sort((a, b) => b.updated - a.updated);
	return { accounts };
}

export function isAny(account: string | undefined): boolean {
	return !account || account === ANY_ACCOUNT;
}

/** The chosen account, matched case-insensitively since RuneScape names are. */
export function findAccount(snap: Snapshot | undefined, account: string | undefined): Account | undefined {
	const wanted = account?.toLowerCase();
	return snap?.accounts.find((a) => a.name.toLowerCase() === wanted);
}

const URGENCY: Record<IdleKind, number> = { kicked: 5, logout: 4, idle: 3, alert: 3, active: 2, loggedout: 1, offline: 0 };

/**
 * The idle state to show and which account it belongs to. Watching every account shows the most urgent one,
 * so a second client going idle is never hidden by one you're playing on.
 */
export function pickIdle(snap: Snapshot | undefined, account: string | undefined): { idle: IdleState; account?: string } {
	if (!isAny(account)) {
		const found = findAccount(snap, account);
		return { idle: found?.idle ?? OFFLINE, account: found?.name ?? account };
	}

	let best: Account | undefined;
	for (const a of snap?.accounts ?? []) {
		if (a.online && (!best || URGENCY[a.idle.state] > URGENCY[best.idle.state])) {
			best = a;
		}
	}
	return { idle: best?.idle ?? OFFLINE, account: best?.name };
}

/** A tracked item from the chosen account, or from the most recently played account that has it. */
export function pickTracked(snap: Snapshot | undefined, account: string | undefined, id: string | undefined): TrackedItem | undefined {
	if (!id) {
		return undefined;
	}
	const accounts = isAny(account) ? snap?.accounts ?? [] : [findAccount(snap, account)].filter((a) => a !== undefined);
	for (const a of accounts) {
		const item = a.tracking.find((t) => t.id === id);
		if (item) {
			return item;
		}
	}
	return undefined;
}

/** Names for the account dropdown, with "Any account" first. */
export function accountOptions(snap: Snapshot | undefined): { label: string; value: string }[] {
	return [
		{ label: "Any account", value: ANY_ACCOUNT },
		...(snap?.accounts ?? []).map((a) => ({ label: a.name, value: a.name })).sort((a, b) => a.label.localeCompare(b.label))
	];
}

export function isFlashing(state: IdleKind): boolean {
	return state === "idle" || state === "logout" || state === "alert" || state === "kicked";
}

/** Countdowns that have run out are ready even if RuneLite hasn't said so yet (or is closed). */
export function effectiveState(item: TrackedItem, nowSeconds = Date.now() / 1000): TrackedKind {
	return item.state === "countdown" && item.end <= nowSeconds ? "ready" : item.state;
}

/** What can be picked before RuneLite has written anything. Matches the ids the RuneLite plugin uses. */
export const DEFAULT_ITEMS: Pick<TrackedItem, "id" | "name" | "label">[] = [
	{ id: "herb", name: "Herb Patches", label: "HERB" },
	{ id: "tree", name: "Tree Patches", label: "TREE" },
	{ id: "fruit_tree", name: "Fruit Tree Patches", label: "FRUIT TREE" },
	{ id: "special", name: "Special Patches", label: "SPECIAL" },
	{ id: "flower", name: "Flower Patches", label: "FLOWER" },
	{ id: "allotment", name: "Allotment Patches", label: "ALLOTMENT" },
	{ id: "bush", name: "Bush Patches", label: "BUSH" },
	{ id: "grape", name: "Grape Patches", label: "GRAPE" },
	{ id: "hops", name: "Hops Patches", label: "HOPS" },
	{ id: "contract", name: "Farming Contract", label: "CONTRACT" },
	{ id: "birdhouse", name: "Bird Houses", label: "BIRDHOUSES" },
	{ id: "timers", name: "Next timer to finish", label: "TIMERS" }
];
