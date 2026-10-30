import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Written by the "Stream Deck Idle Alert" RuneLite plugin. */
export const STATE_FILE = path.join(os.homedir(), ".runelite", "streamdeck-idle", "state.json");

/** RuneLite rewrites the file every 2 seconds; older than this means the client is closed. */
const STALE_MILLIS = 8000;

export type GameState = "active" | "idle" | "logout" | "alert" | "loggedout" | "kicked" | "offline";

export type IdleState = {
	state: GameState;
	label: string;
	message: string;
	since: number;
};

const OFFLINE: IdleState = { state: "offline", label: "", message: "", since: 0 };

export async function readState(now = Date.now()): Promise<IdleState> {
	try {
		const json = JSON.parse(await readFile(STATE_FILE, "utf8"));
		if (typeof json.updated !== "number" || now - json.updated > STALE_MILLIS) {
			return OFFLINE;
		}
		return { state: json.state, label: json.label ?? "", message: json.message ?? "", since: json.since ?? now };
	} catch {
		// Missing (plugin never ran) or caught mid-write; either way there's nothing to show yet
		return OFFLINE;
	}
}

export function isFlashing(state: GameState): boolean {
	return state === "idle" || state === "logout" || state === "alert" || state === "kicked";
}
