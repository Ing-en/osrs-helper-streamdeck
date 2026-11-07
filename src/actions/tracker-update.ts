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

import { renderKey, updateLook } from "../render";
import { accountOptions, findAccount, isAny, type Snapshot } from "../state";
import { refresh, snapshot, type Ticking } from "../ticker";
import { onUpdated, TRACKERS, updatePlayer, type TrackerId, type UpdateResult } from "../trackers";

type Settings = {
	account?: string;
	/** A typed name, for an account RuneLite hasn't seen; wins over `account`. */
	player?: string;
	openProfile?: boolean;
};

// How long a result stays on the key before it goes back to showing the last update
const RESULT_MILLIS: Record<UpdateResult["outcome"], number> = { updated: 4000, recent: 3000, notfound: 5000, failed: 5000 };
// How often to ask the site when the player was last updated, which also catches updates from elsewhere
const LAST_UPDATED_REFRESH_MILLIS = 10 * 60_000;

type LastUpdated = { at?: number; fetched: number };

/**
 * A key that asks an XP tracker site to update a player, then shows how long ago it last did.
 */
class TrackerUpdate extends SingletonAction<Settings> implements Ticking {
	private readonly settings = new Map<string, Settings>();
	private readonly lastImage = new Map<string, string>();
	private readonly results = new Map<string, { outcome: UpdateResult["outcome"]; until: number }>();
	// Per player, so two keys for the same player share one request
	private readonly updating = new Set<string>();
	private readonly lastUpdated = new Map<string, LastUpdated>();

	constructor(private readonly tracker: TrackerId) {
		super();
		// Another key (the combined one, or a goal key) updated a player this key may be showing
		onUpdated((tracker, player) => {
			if (tracker === this.tracker) {
				this.lastUpdated.set(player.toLowerCase(), { at: Date.now(), fetched: Date.now() });
			}
		});
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

		const tracker = TRACKERS[this.tracker];
		this.updating.add(key);
		this.results.delete(ev.action.id);
		const result = await updatePlayer(this.tracker, player);
		this.updating.delete(key);

		if (result.outcome !== "updated") {
			streamDeck.logger.warn(`${tracker.label} update of ${player}: ${result.outcome} (${result.message})`);
			// A refused update still tells us the site has recent data; look up when
			this.lastUpdated.delete(key);
		}
		this.results.set(ev.action.id, { outcome: result.outcome, until: Date.now() + RESULT_MILLIS[result.outcome] });

		if (ev.payload.settings.openProfile && result.outcome !== "notfound" && result.outcome !== "failed") {
			await streamDeck.system.openUrl(tracker.profileUrl(player));
		}
	}

	/** Fills the property inspector's account dropdown (sdpi-select datasource="getAccounts"). */
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
			if (player) {
				this.fetchLastUpdated(player, now);
			}

			const result = this.results.get(a.id);
			const shown = result && result.until > now ? result.outcome : undefined;
			const status = !player ? "noname" : this.updating.has(key) ? "updating" : shown ?? "ready";
			const image = renderKey(updateLook(this.tracker, status, player, this.lastUpdated.get(key)?.at, now));

			if (this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await a.setImage(image);
			}
		}
	}

	private fetchLastUpdated(player: string, now: number): void {
		const key = player.toLowerCase();
		const known = this.lastUpdated.get(key);
		if (known && now - known.fetched < LAST_UPDATED_REFRESH_MILLIS) {
			return;
		}
		// Marked as fetched up front so the next tick doesn't ask again while this request is out
		this.lastUpdated.set(key, { at: known?.at, fetched: now });
		TRACKERS[this.tracker]
			.lastUpdated(player)
			.then((at) => {
				// An update finished while this was out has the newer time
				const current = this.lastUpdated.get(key);
				if (!current?.at || (at !== undefined && at > current.at)) {
					this.lastUpdated.set(key, { at, fetched: now });
				}
			})
			.catch(() => {
				// Offline or the site is down: keep what we had and try again later
			});
	}
}

/** The typed name, else the chosen account, else the most recently played one. */
export function playerName(snap: Snapshot | undefined, settings: { account?: string; player?: string }): string | undefined {
	const typed = settings.player?.replace(/\s+/g, " ").trim();
	if (typed) {
		return typed;
	}
	const name = isAny(settings.account) ? snap?.accounts[0]?.name : findAccount(snap, settings.account)?.name ?? settings.account;
	// RuneLite keeps the non-breaking spaces the game puts in names
	return name?.replace(/\s+/g, " ").trim() || undefined;
}

@action({ UUID: "com.ingen.osrs-helper.wom" })
export class WiseOldManUpdate extends TrackerUpdate {
	constructor() {
		super("wom");
	}
}

@action({ UUID: "com.ingen.osrs-helper.temple" })
export class TempleUpdate extends TrackerUpdate {
	constructor() {
		super("temple");
	}
}
