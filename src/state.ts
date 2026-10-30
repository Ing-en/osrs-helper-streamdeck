import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Written by the "Stream Deck" RuneLite plugin. */
export const STATE_FILE = path.join(os.homedir(), ".runelite", "streamdeck", "state.json");

/** RuneLite rewrites the file every 2 seconds; older than this means the client is closed. */
const STALE_MILLIS = 8000;

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

export type Snapshot = {
	idle: IdleState;
	/** Last known Time Tracking data; still valid after RuneLite closes since end times are absolute. */
	tracking: TrackedItem[];
};

const OFFLINE: IdleState = { state: "offline", label: "", message: "", since: 0 };

export async function readSnapshot(now = Date.now()): Promise<Snapshot | undefined> {
	try {
		const json = JSON.parse(await readFile(STATE_FILE, "utf8"));
		const stale = typeof json.updated !== "number" || now - json.updated > STALE_MILLIS;
		return {
			idle: stale || !json.idle ? OFFLINE : json.idle,
			tracking: Array.isArray(json.tracking) ? json.tracking : []
		};
	} catch {
		// Missing (plugin never ran) or caught mid-write
		return undefined;
	}
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
