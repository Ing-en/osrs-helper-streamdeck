import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { combinedLook, renderKey, type CombinedStatus } from "../render";
import { accountOptions, type Snapshot } from "../state";
import { refresh, snapshot, type Ticking } from "../ticker";
import { onUpdated, TRACKERS, updatePlayer, type TrackerId, type UpdateResult } from "../trackers";
import { playerName } from "./tracker-update";

type Settings = {
	account?: string;
	player?: string;
	openProfile?: boolean;
};

const SITES: TrackerId[] = ["wom", "temple"];
const RESULT_MILLIS = 5000;
const LAST_UPDATED_REFRESH_MILLIS = 10 * 60_000;

/** "updated" or "recent" both mean the site now has fresh stats. */
const fresh = (r: UpdateResult) => r.outcome === "updated" || r.outcome === "recent";

/** One word for how updating both sites went. */
function combine(wom: UpdateResult, temple: UpdateResult): CombinedStatus {
	if (fresh(wom) && fresh(temple)) {
		return wom.outcome === "recent" && temple.outcome === "recent" ? "recent" : "updated";
	}
	if (fresh(wom)) {
		return "womonly";
	}
	if (fresh(temple)) {
		return "templeonly";
	}
	return wom.outcome === "notfound" && temple.outcome === "notfound" ? "notfound" : "failed";
}

/**
 * A key that updates a player on Wise Old Man and TempleOSRS at once, then shows how long ago the less recently updated
 * site last updated them.
 */
@action({ UUID: "com.ingen.osrs-helper.updateall" })
export class UpdateAll extends SingletonAction<Settings> implements Ticking {
	private readonly settings = new Map<string, Settings>();
	private readonly lastImage = new Map<string, string>();
	private readonly results = new Map<string, { status: CombinedStatus; until: number }>();
	private readonly updating = new Set<string>();
	/** Per site and player: when that site last updated them. */
	private readonly lastUpdated = new Map<string, { at?: number; fetched: number }>();

	constructor() {
		super();
		// Updates from the single-site keys and goal keys count too
		onUpdated((site, player) => this.lastUpdated.set(`${site}:${player.toLowerCase()}`, { at: Date.now(), fetched: Date.now() }));
	}

	get visible(): number {
		return this.settings.size;
	}

	override onWillAppear(ev: WillAppearEvent<Settings>): void {
		this.settings.set(ev.action.id, ev.payload.settings);
		this.lastImage.delete(ev.action.id);
		refresh();
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		this.settings.delete(ev.action.id);
		this.lastImage.delete(ev.action.id);
		refresh();
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
		this.settings.set(ev.action.id, ev.payload.settings);
		this.lastImage.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const player = playerName(snapshot(), ev.payload.settings);
		if (!player) {
			await ev.action.showAlert();
			return;
		}
		const key = player.toLowerCase();
		if (this.updating.has(key)) {
			return;
		}

		this.updating.add(key);
		this.results.delete(ev.action.id);
		const [wom, temple] = await Promise.all(SITES.map((site) => updatePlayer(site, player)));
		this.updating.delete(key);

		for (const [site, result] of [["WOM", wom], ["Temple", temple]] as const) {
			if (!fresh(result)) {
				streamDeck.logger.warn(`Update all: ${site} update of ${player}: ${result.outcome} (${result.message})`);
			}
		}
		// A refused update still means recent data; ask when
		for (const site of SITES) {
			if ((site === "wom" ? wom : temple).outcome === "recent") {
				this.lastUpdated.delete(`${site}:${key}`);
			}
		}
		const status = combine(wom, temple);
		this.results.set(ev.action.id, { status, until: Date.now() + RESULT_MILLIS });

		if (ev.payload.settings.openProfile) {
			for (const site of SITES) {
				if (fresh(site === "wom" ? wom : temple)) {
					await streamDeck.system.openUrl(TRACKERS[site].profileUrl(player));
				}
			}
		}
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event === "getAccounts") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getAccounts", items: accountOptions(snapshot()) });
		}
	}

	async tick(snap: Snapshot | undefined): Promise<void> {
		const now = Date.now();
		for (const a of this.actions) {
			if (!a.isKey()) {
				continue;
			}
			const player = playerName(snap, this.settings.get(a.id) ?? {});
			const key = player?.toLowerCase() ?? "";

			let oldest: number | undefined;
			if (player) {
				const times = SITES.map((site) => this.fetchLastUpdated(site, player, now));
				// Only once both are known, so the key never claims a fresher time than the staler site has
				oldest = times.every((t) => t !== undefined) ? Math.min(...(times as number[])) : undefined;
			}

			const result = this.results.get(a.id);
			const shown = result && result.until > now ? result.status : undefined;
			const status: CombinedStatus = !player ? "noname" : this.updating.has(key) ? "updating" : shown ?? "ready";
			const image = renderKey(combinedLook(status, player, oldest, now));
			if (this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await a.setImage(image);
			}
		}
	}

	/** When `site` last updated `player`, asking it at most every ten minutes. */
	private fetchLastUpdated(site: TrackerId, player: string, now: number): number | undefined {
		const key = `${site}:${player.toLowerCase()}`;
		const known = this.lastUpdated.get(key);
		if (!known || now - known.fetched >= LAST_UPDATED_REFRESH_MILLIS) {
			this.lastUpdated.set(key, { at: known?.at, fetched: now });
			TRACKERS[site]
				.lastUpdated(player)
				.then((at) => {
					const current = this.lastUpdated.get(key);
					if (!current?.at || (at !== undefined && at > current.at)) {
						this.lastUpdated.set(key, { at, fetched: now });
					}
				})
				.catch(() => {
					// Offline: keep what we had and try again later
				});
		}
		return known?.at;
	}
}
