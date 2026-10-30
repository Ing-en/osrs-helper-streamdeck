import { action, DidReceiveSettingsEvent, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";

import { focusRuneLite } from "../focus";
import { idleLook, renderKey } from "../render";
import { isFlashing, type Snapshot } from "../state";
import { refresh, snapshot, type Ticking } from "../ticker";

type Settings = {
	flash?: boolean;
	speed?: "slow" | "normal" | "fast";
	focusOnPress?: boolean;
};

// Flash half-period in ticks; the logout warning always flashes at the fastest rate
export const HALF_PERIOD: Record<string, number> = { slow: 4, normal: 2, fast: 1 };

const OFFLINE = { state: "offline", label: "", message: "", since: 0 } as const;

/**
 * A key that flashes while RuneLite's Idle Notifier says the player is idle.
 */
@action({ UUID: "com.ingelberg.osrs-helper.idle" })
export class IdleAlert extends SingletonAction<Settings> implements Ticking {
	private readonly settings = new Map<string, Settings>();
	private readonly lastImage = new Map<string, string>();
	// The `since` of the alert the user dismissed by pressing the key; a new alert flashes again
	private dismissedSince = -1;

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
		const idle = snapshot()?.idle;
		if (idle && isFlashing(idle.state)) {
			this.dismissedSince = idle.since;
		}
		if (ev.payload.settings.focusOnPress !== false) {
			focusRuneLite();
		}
	}

	async tick(snap: Snapshot | undefined, tick: number): Promise<void> {
		const idle = snap?.idle ?? OFFLINE;
		const dismissed = idle.since === this.dismissedSince;

		for (const a of this.actions) {
			if (!a.isKey()) {
				continue;
			}
			const speed = idle.state === "logout" ? "fast" : this.settings.get(a.id)?.speed ?? "normal";
			const half = HALF_PERIOD[speed] ?? HALF_PERIOD.normal;
			// With flashing off the key stays solid in the alert colour
			const on = this.settings.get(a.id)?.flash === false || Math.floor(tick / half) % 2 === 0;

			const image = renderKey(idleLook(idle, on, dismissed));
			if (this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await a.setImage(image);
			}
		}
	}
}
