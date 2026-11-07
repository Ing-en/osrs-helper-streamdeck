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

import { compactNumber, isSkill, shortLabel } from "../goals";
import { goalLook, renderKey, type GoalStatus } from "../render";
import { accountOptions, type Snapshot } from "../state";
import { goalProgress, invalidateStats, playerStats, xpForLevel, type Period } from "../stats";
import { refresh, snapshot, type Ticking } from "../ticker";
import { TRACKERS, type TrackerId } from "../trackers";
import { playerName } from "./tracker-update";

type Settings = {
	account?: string;
	player?: string;
	source?: TrackerId;
	/** A skill, boss or activity, by Wise Old Man's metric name. */
	metric?: string;
	/** For skills: a level (1–126) or an XP amount. */
	goalType?: "level" | "xp";
	target?: string;
	period?: Period;
	openProfile?: boolean;
};

const PERIOD_WORDS: Record<Period, string> = { day: "TODAY", week: "THIS WEEK", month: "THIS MONTH" };

/** The goal as an amount of XP or kills, and the key's label for it, e.g. "WC 99" or "ZULRAH 500". */
function goal(settings: Settings): { target: number; label: string } | undefined {
	const metric = settings.metric;
	// "13034431", "13,034,431", "50m", "1.5m", "250k"
	const match = /^([\d.]+)([km]?)$/i.exec(String(settings.target ?? "").replace(/[\s,]/g, ""));
	const raw = match ? Number(match[1]) * ({ k: 1e3, m: 1e6 }[match[2].toLowerCase()] ?? 1) : NaN;
	if (!metric || !Number.isFinite(raw) || raw <= 0) {
		return undefined;
	}
	if (isSkill(metric) && metric !== "overall" && (settings.goalType ?? "level") === "level") {
		const level = Math.min(126, Math.floor(raw));
		return { target: xpForLevel(level), label: `${shortLabel(metric)} ${level}` };
	}
	return { target: raw, label: `${shortLabel(metric)} ${compactNumber(raw)}` };
}

/**
 * A key counting down, in hours and days, until a skill or kill count goal is reached at the player's recent rate on
 * Wise Old Man or TempleOSRS.
 */
@action({ UUID: "com.ingen.osrs-helper.goal" })
export class Goal extends SingletonAction<Settings> implements Ticking {
	private readonly settings = new Map<string, Settings>();
	private readonly lastImage = new Map<string, string>();
	private readonly updating = new Set<string>();

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

	/** Has the site update the player, then recalculates; optionally opens their profile. */
	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const settings = ev.payload.settings;
		const player = playerName(snapshot(), settings);
		const source = settings.source ?? "wom";
		if (!player) {
			await ev.action.showAlert();
			return;
		}
		const key = `${source}:${player.toLowerCase()}`;
		if (this.updating.has(key)) {
			return;
		}
		this.updating.add(key);
		try {
			const result = await TRACKERS[source].update(player);
			if (result.outcome === "failed") {
				streamDeck.logger.warn(`Goal key: ${source} update of ${player} failed (${result.message})`);
			}
		} catch {
			// Offline: the key keeps showing the saved stats
		} finally {
			this.updating.delete(key);
			invalidateStats(source, player);
		}
		if (settings.openProfile) {
			await streamDeck.system.openUrl(TRACKERS[source].profileUrl(player));
		}
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event === "getAccounts") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getAccounts", items: accountOptions(snapshot()) });
		}
	}

	async tick(snap: Snapshot | undefined): Promise<void> {
		for (const a of this.actions) {
			if (!a.isKey()) {
				continue;
			}
			const settings = this.settings.get(a.id) ?? {};
			const player = playerName(snap, settings);
			const image = renderKey(goalLook(this.status(settings, player), goal(settings)?.label ?? "GOAL", player));
			if (this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await a.setImage(image);
			}
		}
	}

	private status(settings: Settings, player: string | undefined): GoalStatus {
		if (!player) {
			return { state: "noname" };
		}
		const g = goal(settings);
		if (!g || !settings.metric) {
			return { state: "nogoal" };
		}
		const source = settings.source ?? "wom";
		const period = settings.period ?? "week";
		const stats = playerStats(source, player, period);
		if (this.updating.has(`${source}:${player.toLowerCase()}`) || !stats) {
			return { state: "loading" };
		}
		if (stats.notFound) {
			return { state: "notfound" };
		}
		const progress = goalProgress(stats, settings.metric, g.target);
		if (!progress) {
			return { state: "loading" };
		}
		if (progress.state === "done") {
			return { state: "done" };
		}
		if (progress.state === "nogains") {
			return { state: "nogains", period: PERIOD_WORDS[period] };
		}
		return { state: "eta", eta: progress.eta };
	}
}
