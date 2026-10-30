import { idleStates } from "./idle";
import { readAccounts } from "./runelite";

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
	/** Epoch millis of the account's latest activity, for "most recently played". */
	updated: number;
	/** Whether a RuneLite window is open for this account. */
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

/**
 * Combines open RuneLite windows (idle alerts) with RuneLite's saved Time Tracking data. Saved data only changes every
 * few minutes, so it's re-read at most every few seconds.
 */
const TRACKING_REFRESH_MILLIS = 3000;
let trackingRead = 0;
let tracking: Awaited<ReturnType<typeof readAccounts>> = [];

export async function readSnapshot(now = Date.now()): Promise<Snapshot> {
	if (now - trackingRead >= TRACKING_REFRESH_MILLIS) {
		trackingRead = now;
		try {
			tracking = await readAccounts(now / 1000);
		} catch {
			// Keep the last good read
		}
	}

	const accounts = new Map<string, Account>();
	for (const a of tracking) {
		accounts.set(a.name.toLowerCase(), { name: a.name, updated: a.lastSeen * 1000, online: false, idle: OFFLINE, tracking: a.tracking });
	}
	for (const w of idleStates()) {
		const existing = accounts.get(w.name.toLowerCase());
		accounts.set(w.name.toLowerCase(), {
			name: existing?.name ?? w.name,
			updated: now,
			online: true,
			idle: w.idle,
			tracking: existing?.tracking ?? []
		});
	}
	return { accounts: [...accounts.values()].sort((a, b) => b.updated - a.updated) };
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
