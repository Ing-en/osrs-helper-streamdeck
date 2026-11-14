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

import { focusRuneLite } from "../windows";
import { renderKey, trackedLook } from "../render";
import {
	accountOptions,
	DEFAULT_ITEMS,
	effectiveState,
	findAccount,
	isAny,
	pickTracked,
	type Snapshot,
	type TrackedItem
} from "../state";
import { refresh, snapshot, type Ticking } from "../ticker";
import { HALF_PERIOD } from "./idle-alert";

type Settings = {
	account?: string;
	item?: string;
	flashWhenReady?: boolean;
	focusOnPress?: boolean;
};

type Option = { label: string; value: string };

/** Bird houses take 50 minutes to fill once seeded (RuneLite's BIRD_HOUSE_DURATION). */
const BIRD_HOUSE_MILLIS = 50 * 60_000;
/** Saved bird house data seeded this long before a press is taken as that reset having been saved. */
const RESET_SAVE_SLACK_MILLIS = 10 * 60_000;

/**
 * A key showing one thing RuneLite's Time Tracking plugin tracks: a farming patch type, bird houses, the farming contract,
 * a timer or a stopwatch.
 */
@action({ UUID: "com.ingen.osrs-helper.timetracking" })
export class TimeTracking extends SingletonAction<Settings> implements Ticking {
	private readonly settings = new Map<string, Settings>();
	private readonly lastImage = new Map<string, string>();
	// Keys whose "ready" flash was stopped by pressing them; cleared once the item stops being ready
	private readonly dismissed = new Set<string>();
	/**
	 * Bird house keys pressed after a reset, by when: RuneLite only writes to disk every 5 minutes, so until it has saved
	 * the new seeds, the key counts down from the press instead of still saying READY.
	 */
	private readonly birdHouseResets = new Map<string, number>();

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

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
		this.settings.set(ev.action.id, ev.payload.settings);
		this.lastImage.delete(ev.action.id);
		// Another account may track different timers
		await streamDeck.ui.sendToPropertyInspector({ event: "getItems", items: options(snapshot(), ev.payload.settings.account) });
	}

	override onKeyDown(ev: KeyDownEvent<Settings>): void {
		const { account, item: id } = ev.payload.settings;
		const item = pickTracked(snapshot(), account, id);
		const state = item && effectiveState(item);
		if (item?.id === "birdhouse" && (state === "ready" || state === "empty")) {
			// Pressed after collecting and re-seeding them in game
			this.birdHouseResets.set(ev.action.id, Date.now());
		} else if (state === "ready") {
			this.dismissed.add(ev.action.id);
		}
		if (ev.payload.settings.focusOnPress !== false) {
			focusRuneLite(isAny(account) ? snapshot()?.accounts[0]?.name : account);
		}
	}

	/** Fills the property inspector's dropdowns (sdpi-select datasource="getAccounts" / "getItems"). */
	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event === "getAccounts") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getAccounts", items: accountOptions(snapshot()) });
		} else if (payload?.event === "getItems") {
			const settings = await ev.action.getSettings();
			await streamDeck.ui.sendToPropertyInspector({ event: "getItems", items: options(snapshot(), settings.account) });
		}
	}

	async tick(snap: Snapshot | undefined, tick: number): Promise<void> {
		const on = Math.floor(tick / HALF_PERIOD.normal) % 2 === 0;

		for (const a of this.actions) {
			if (!a.isKey()) {
				continue;
			}
			const settings = this.settings.get(a.id) ?? {};
			const item = this.withBirdHouseReset(a.id, pickTracked(snap, settings.account, settings.item) ?? placeholder(settings.item));

			if (effectiveState(item) !== "ready") {
				this.dismissed.delete(a.id);
			}
			const flash = settings.flashWhenReady !== false && !this.dismissed.has(a.id);

			const look = trackedLook(item, on, flash);
			if (!isAny(settings.account)) {
				look.top = findAccount(snap, settings.account)?.name ?? settings.account;
			}

			const image = renderKey(look);
			if (this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await a.setImage(image);
			}
		}
	}

	/** The item, or for a bird house key pressed after a reset, a countdown from that press until RuneLite saves the reset. */
	private withBirdHouseReset(actionId: string, item: TrackedItem): TrackedItem {
		const pressed = this.birdHouseResets.get(actionId);
		if (pressed === undefined || item.id !== "birdhouse") {
			return item;
		}
		const savedSeededAt = item.end > 0 ? item.end * 1000 - BIRD_HOUSE_MILLIS : 0;
		if (savedSeededAt >= pressed - RESET_SAVE_SLACK_MILLIS || Date.now() > pressed + BIRD_HOUSE_MILLIS) {
			// RuneLite has saved the new seeds (or the provisional countdown has run out): back to the real data
			this.birdHouseResets.delete(actionId);
			return item;
		}
		return { ...item, state: "countdown", end: (pressed + BIRD_HOUSE_MILLIS) / 1000 };
	}
}

/** What to show before RuneLite has reported the chosen item, or after a timer was deleted. */
function placeholder(id: string | undefined): TrackedItem {
	const known = DEFAULT_ITEMS.find((d) => d.id === id);
	const label = known?.label ?? (id ? id.replace(/^(timer|stopwatch):/, "").replace(/#\d+$/, "").toUpperCase() : "PICK ITEM");
	return { id: id ?? "", name: label, label, state: "unknown", end: 0, seconds: 0, start: 0 };
}

/** Everything the chosen account (or any account) tracks, grouped for the dropdown. */
export function options(snap: Snapshot | undefined, account: string | undefined): { label: string; children: Option[] }[] {
	const accounts = isAny(account) ? snap?.accounts ?? [] : [findAccount(snap, account)].filter((a) => a !== undefined);
	const seen = new Set<string>();
	const items: Pick<TrackedItem, "id" | "name">[] = [];
	for (const item of [...accounts.flatMap((a) => a.tracking), ...DEFAULT_ITEMS]) {
		if (!seen.has(item.id)) {
			seen.add(item.id);
			items.push(item);
		}
	}

	const groups: Record<string, Option[]> = { Farming: [], Hunter: [], Timers: [], Stopwatches: [] };
	for (const item of items) {
		const group = item.id.startsWith("stopwatch:")
			? "Stopwatches"
			: item.id === "timers" || item.id.startsWith("timer:")
				? "Timers"
				: item.id === "birdhouse"
					? "Hunter"
					: "Farming";
		groups[group].push({ label: item.name, value: item.id });
	}

	return Object.entries(groups)
		.filter(([, children]) => children.length > 0)
		.map(([label, children]) => ({ label, children }));
}
