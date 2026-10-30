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
import { renderKey, trackedLook } from "../render";
import { DEFAULT_ITEMS, effectiveState, type Snapshot, type TrackedItem } from "../state";
import { refresh, snapshot, type Ticking } from "../ticker";
import { HALF_PERIOD } from "./idle-alert";

type Settings = {
	item?: string;
	flashWhenReady?: boolean;
	focusOnPress?: boolean;
};

type Option = { label: string; value: string };

/**
 * A key showing one thing RuneLite's Time Tracking plugin tracks: a farming patch type, bird houses, the farming contract,
 * a timer or a stopwatch.
 */
@action({ UUID: "com.ingelberg.osrs-helper.timetracking" })
export class TimeTracking extends SingletonAction<Settings> implements Ticking {
	private readonly settings = new Map<string, Settings>();
	private readonly lastImage = new Map<string, string>();
	// Keys whose "ready" flash was stopped by pressing them; cleared once the item stops being ready
	private readonly dismissed = new Set<string>();

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
		const item = find(snapshot(), ev.payload.settings.item);
		if (item && effectiveState(item) === "ready") {
			this.dismissed.add(ev.action.id);
		}
		if (ev.payload.settings.focusOnPress !== false) {
			focusRuneLite();
		}
	}

	/** Fills the property inspector's dropdown (sdpi-select datasource="getItems"). */
	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event === "getItems") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getItems", items: options(snapshot()) });
		}
	}

	async tick(snap: Snapshot | undefined, tick: number): Promise<void> {
		const on = Math.floor(tick / HALF_PERIOD.normal) % 2 === 0;

		for (const a of this.actions) {
			if (!a.isKey()) {
				continue;
			}
			const settings = this.settings.get(a.id) ?? {};
			const item = find(snap, settings.item) ?? placeholder(settings.item);

			if (effectiveState(item) !== "ready") {
				this.dismissed.delete(a.id);
			}
			const flash = settings.flashWhenReady !== false && !this.dismissed.has(a.id);

			const image = renderKey(trackedLook(item, on, flash));
			if (this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await a.setImage(image);
			}
		}
	}
}

function find(snap: Snapshot | undefined, id: string | undefined): TrackedItem | undefined {
	return id ? snap?.tracking.find((t) => t.id === id) : undefined;
}

/** What to show before RuneLite has reported the chosen item, or after a timer was deleted. */
function placeholder(id: string | undefined): TrackedItem {
	const known = DEFAULT_ITEMS.find((d) => d.id === id);
	const label = known?.label ?? (id ? id.replace(/^(timer|stopwatch):/, "").replace(/#\d+$/, "").toUpperCase() : "PICK ITEM");
	return { id: id ?? "", name: label, label, state: "unknown", end: 0, seconds: 0, start: 0 };
}

function options(snap: Snapshot | undefined): { label: string; children: Option[] }[] {
	const items: Pick<TrackedItem, "id" | "name">[] = snap?.tracking.length ? snap.tracking : DEFAULT_ITEMS;
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
