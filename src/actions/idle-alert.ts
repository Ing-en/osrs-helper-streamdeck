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

import { focusRuneLite } from "../focus";
import { idleLook, renderKey } from "../render";
import { accountOptions, isAny, isFlashing, pickIdle, type Snapshot } from "../state";
import { refresh, snapshot, type Ticking } from "../ticker";

type Settings = {
	account?: string;
	flash?: boolean;
	speed?: "slow" | "normal" | "fast";
	focusOnPress?: boolean;
};

// Flash half-period in ticks; the logout warning always flashes at the fastest rate
export const HALF_PERIOD: Record<string, number> = { slow: 4, normal: 2, fast: 1 };

/**
 * A key that flashes while RuneLite's Idle Notifier says the player is idle.
 */
@action({ UUID: "com.ingelberg.osrs-helper.idle" })
export class IdleAlert extends SingletonAction<Settings> implements Ticking {
	private readonly settings = new Map<string, Settings>();
	private readonly lastImage = new Map<string, string>();
	// Per key, the `since` of the alert the user dismissed by pressing it; a new alert flashes again
	private readonly dismissedSince = new Map<string, number>();

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

	override onKeyDown(ev: KeyDownEvent<Settings>): void {
		const { idle } = pickIdle(snapshot(), ev.payload.settings.account);
		if (isFlashing(idle.state)) {
			this.dismissedSince.set(ev.action.id, idle.since);
		}
		if (ev.payload.settings.focusOnPress !== false) {
			focusRuneLite();
		}
	}

	/** Fills the property inspector's account dropdown (sdpi-select datasource="getAccounts"). */
	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event === "getAccounts") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getAccounts", items: accountOptions(snapshot()) });
		}
	}

	async tick(snap: Snapshot | undefined, tick: number): Promise<void> {
		const online = snap?.accounts.filter((a) => a.online).length ?? 0;

		for (const a of this.actions) {
			if (!a.isKey()) {
				continue;
			}
			const settings = this.settings.get(a.id) ?? {};
			const { idle, account } = pickIdle(snap, settings.account);
			const dismissed = idle.since === this.dismissedSince.get(a.id);

			const speed = idle.state === "logout" ? "fast" : settings.speed ?? "normal";
			const half = HALF_PERIOD[speed] ?? HALF_PERIOD.normal;
			// With flashing off the key stays solid in the alert colour
			const on = settings.flash === false || Math.floor(tick / half) % 2 === 0;

			const look = idleLook(idle, on, dismissed);
			// Name the account when the key watches one, or when several are logged in and it could be any of them
			if (account && (!isAny(settings.account) || online > 1)) {
				look.top = account;
			}

			const image = renderKey(look);
			if (this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await a.setImage(image);
			}
		}
	}
}
