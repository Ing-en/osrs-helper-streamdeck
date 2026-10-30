import { action, DidReceiveSettingsEvent, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";

import { focusRuneLite } from "../focus";
import { look, renderKey } from "../render";
import { isFlashing, readState, type IdleState } from "../state";

type Settings = {
	speed?: "slow" | "normal" | "fast";
	focusOnPress?: boolean;
};

const TICK_MILLIS = 250;
// Flash half-period in ticks; the logout warning always flashes at the fastest rate
const HALF_PERIOD: Record<string, number> = { slow: 4, normal: 2, fast: 1 };

/**
 * A key that flashes while RuneLite's Idle Notifier says the player is idle.
 */
@action({ UUID: "com.ingelberg.osrs-idle.alert" })
export class IdleAlert extends SingletonAction<Settings> {
	private readonly settings = new Map<string, Settings>();
	private readonly lastImage = new Map<string, string>();
	private timer: NodeJS.Timeout | undefined;
	private tick = 0;
	private state: IdleState | undefined;
	// The `since` of the alert the user dismissed by pressing the key; a new alert flashes again
	private dismissedSince = -1;

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		this.settings.set(ev.action.id, ev.payload.settings);
		this.lastImage.delete(ev.action.id);
		if (!this.timer) {
			this.timer = setInterval(() => void this.update(), TICK_MILLIS);
		}
		await this.update();
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		this.settings.delete(ev.action.id);
		this.lastImage.delete(ev.action.id);
		if (this.settings.size === 0 && this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
		this.settings.set(ev.action.id, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		if (this.state && isFlashing(this.state.state)) {
			this.dismissedSince = this.state.since;
		}
		if (ev.payload.settings.focusOnPress !== false) {
			focusRuneLite();
		}
		await this.update();
	}

	private async update(): Promise<void> {
		this.tick++;
		const state = await readState();
		this.state = state;
		const dismissed = state.since === this.dismissedSince;

		for (const a of this.actions) {
			if (!a.isKey()) {
				continue;
			}
			const speed = state.state === "logout" ? "fast" : this.settings.get(a.id)?.speed ?? "normal";
			const half = HALF_PERIOD[speed] ?? HALF_PERIOD.normal;
			const on = Math.floor(this.tick / half) % 2 === 0;

			const image = renderKey(look(state, on, dismissed));
			if (this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await a.setImage(image);
			}
		}
	}
}
