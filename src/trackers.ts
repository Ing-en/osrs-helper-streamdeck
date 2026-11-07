/** The XP tracker sites an update key can send a player to. */
export type TrackerId = "wom" | "temple";

/** How an update request ended. `recent` means the site updated this player in the last minute and refused. */
export type UpdateResult = { outcome: "updated" | "recent" | "notfound" | "failed"; message: string };

type Tracker = {
	/** Short name, for the log. */
	label: string;
	update(player: string): Promise<UpdateResult>;
	/** Epoch millis the site last updated the player, or undefined if it hasn't tracked them yet. */
	lastUpdated(player: string): Promise<number | undefined>;
	profileUrl(player: string): string;
};

const USER_AGENT = "osrs-helper-streamdeck (github.com/Ing-en/osrs-helper-streamdeck)";
const TIMEOUT_MILLIS = 60_000;

export async function request(url: string, method = "GET"): Promise<Response> {
	return fetch(url, { method, headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MILLIS) });
}

const name = (player: string) => encodeURIComponent(player.trim());

type UpdatedListener = (tracker: TrackerId, player: string) => void;
const updatedListeners: UpdatedListener[] = [];

/** Called whenever any key gets a site to update a player, so other keys showing that player can refresh. */
export function onUpdated(listener: UpdatedListener): void {
	updatedListeners.push(listener);
}

/** Asks a site to update a player, telling `onUpdated` listeners when it did. Never throws. */
export async function updatePlayer(tracker: TrackerId, player: string): Promise<UpdateResult> {
	let result: UpdateResult;
	try {
		result = await TRACKERS[tracker].update(player);
	} catch (e) {
		result = { outcome: "failed", message: e instanceof Error ? e.message : String(e) };
	}
	if (result.outcome === "updated") {
		for (const listener of updatedListeners) {
			listener(tracker, player);
		}
	}
	return result;
}

export const TRACKERS: Record<TrackerId, Tracker> = {
	wom: {
		label: "WOM",
		async update(player) {
			const res = await request(`https://api.wiseoldman.net/v2/players/${name(player)}`, "POST");
			if (res.ok) {
				return { outcome: "updated", message: "" };
			}
			const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
			const message = body.message ?? `HTTP ${res.status}`;
			if (body.code === "PLAYER_IS_RATE_LIMITED") {
				return { outcome: "recent", message };
			}
			// Unknown names come back as 400 (bad name) or 404 (not on the hiscores)
			return { outcome: res.status === 400 || res.status === 404 ? "notfound" : "failed", message };
		},
		async lastUpdated(player) {
			const res = await request(`https://api.wiseoldman.net/v2/players/${name(player)}`);
			if (!res.ok) {
				return undefined;
			}
			const body = (await res.json()) as { updatedAt?: string };
			return body.updatedAt ? Date.parse(body.updatedAt) : undefined;
		},
		profileUrl: (player) => `https://wiseoldman.net/players/${name(player)}`
	},
	temple: {
		label: "TEMPLE",
		async update(player) {
			// Always 200: success is plain text, errors are an HTML page with the reason in it
			const res = await request(`https://templeosrs.com/php/add_datapoint.php?player=${name(player)}`);
			const body = await res.text();
			if (!res.ok) {
				return { outcome: "failed", message: `HTTP ${res.status}` };
			}
			if (/Datapoint added/i.test(body)) {
				return { outcome: "updated", message: "" };
			}
			if (/already been updated/i.test(body)) {
				return { outcome: "recent", message: "Updated in the last 60 seconds" };
			}
			// A name that failed recently is refused for five minutes with a different message
			if (/not found|unsuccessfully attempted/i.test(body)) {
				return { outcome: "notfound", message: "Not on the official hiscores" };
			}
			return { outcome: "failed", message: "Unexpected reply" };
		},
		async lastUpdated(player) {
			const res = await request(`https://templeosrs.com/api/player_info.php?player=${name(player)}`);
			const body = (await res.json().catch(() => ({}))) as { data?: { "Last checked"?: string } };
			// "2026-11-01 19:58:34", in UTC
			const checked = body.data?.["Last checked"];
			return checked ? Date.parse(checked.replace(" ", "T") + "Z") : undefined;
		},
		profileUrl: (player) => `https://templeosrs.com/player/overview.php?player=${name(player)}`
	}
};
