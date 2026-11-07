import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
	type KeyAction
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { compactNumber, describeDailyGoal, importDailyGoal, isSkill, shortLabel, type GoalType } from "../goals";
import { goalLook, renderKey, type GoalStatus } from "../render";
import { readDailyGoals, type DailyGoal } from "../runelite";
import { accountOptions, type Snapshot } from "../state";
import { gainProgress, goalProgress, invalidateStats, playerStats, xpForLevel, type Period } from "../stats";
import { refresh, snapshot, type Ticking } from "../ticker";
import { TRACKERS, updatePlayer, type TrackerId } from "../trackers";
import { playerName } from "./tracker-update";

type Settings = {
	account?: string;
	player?: string;
	source?: TrackerId;
	/** A skill, boss or activity, by Wise Old Man's metric name. */
	metric?: string;
	/** Skills default to a level; anything else to a total. "gain" is an amount per `period`, like Daily Goals' XP goals. */
	goalType?: GoalType;
	target?: string;
	period?: Period;
	openProfile?: boolean;
	/** The Daily Goals goal last imported (by its id); picking another in the settings imports that one. */
	dailyGoal?: string;
	/** Set once the key has filled itself in from Daily Goals, so later edits aren't overwritten. */
	autoImported?: boolean;
};

const PERIOD_WORDS: Record<Period, string> = { day: "TODAY", week: "THIS WEEK", month: "THIS MONTH" };
/** How often a key without a goal looks for Daily Goals to import. */
const AUTO_IMPORT_RETRY_MILLIS = 10_000;

/** The goal as an amount of XP or kills, and the key's label for it, e.g. "WC 99", "ZULRAH 500" or "CON +100K". */
function goal(settings: Settings): { target: number; label: string; gain: boolean } | undefined {
	const metric = settings.metric;
	// "13034431", "13,034,431", "50m", "1.5m", "250k"
	const match = /^([\d.]+)([km]?)$/i.exec(String(settings.target ?? "").replace(/[\s,]/g, ""));
	const raw = match ? Number(match[1]) * ({ k: 1e3, m: 1e6 }[match[2].toLowerCase()] ?? 1) : NaN;
	if (!metric || !Number.isFinite(raw) || raw <= 0) {
		return undefined;
	}
	const type = settings.goalType ?? (isSkill(metric) && metric !== "overall" ? "level" : "xp");
	if (type === "gain") {
		return { target: raw, label: `${shortLabel(metric)} +${compactNumber(raw)}`, gain: true };
	}
	if (type === "level" && isSkill(metric) && metric !== "overall") {
		const level = Math.min(126, Math.floor(raw));
		return { target: xpForLevel(level), label: `${shortLabel(metric)} ${level}`, gain: false };
	}
	return { target: raw, label: `${shortLabel(metric)} ${compactNumber(raw)}`, gain: false };
}

/** The goal key fields for a Daily Goals goal, merged over the key's current settings. */
function withImported(settings: Settings, daily: DailyGoal): Settings | undefined {
	const imported = importDailyGoal(daily);
	return imported ? { ...settings, ...imported, dailyGoal: daily.id, autoImported: true } : undefined;
}

/**
 * A key counting down, in hours and days, until a skill or kill count goal is reached at the player's recent rate on
 * Wise Old Man or TempleOSRS. A new key fills its goal in from the player's Daily Goals; every field can be changed after.
 */
@action({ UUID: "com.ingen.osrs-helper.goal" })
export class Goal extends SingletonAction<Settings> implements Ticking {
	private readonly settings = new Map<string, Settings>();
	private readonly lastImage = new Map<string, string>();
	private readonly updating = new Set<string>();
	private readonly importTried = new Map<string, number>();

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
		const previous = this.settings.get(ev.action.id);
		const settings = ev.payload.settings;
		this.settings.set(ev.action.id, settings);
		this.lastImage.delete(ev.action.id);

		// Picking a Daily Goals goal in the settings imports it, replacing what the key had
		if (settings.dailyGoal && settings.dailyGoal !== previous?.dailyGoal) {
			const player = playerName(snapshot(), settings);
			const daily = player ? (await readDailyGoals(player)).find((g) => g.id === settings.dailyGoal) : undefined;
			const merged = daily && withImported(settings, daily);
			if (merged) {
				this.settings.set(ev.action.id, merged);
				await ev.action.setSettings(merged);
			}
		}
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
		const result = await updatePlayer(source, player);
		if (result.outcome === "failed") {
			streamDeck.logger.warn(`Goal key: ${source} update of ${player} failed (${result.message})`);
		}
		this.updating.delete(key);
		// Also when the site refused ("too soon"): its data is recent either way
		invalidateStats(source, player);
		if (settings.openProfile) {
			await streamDeck.system.openUrl(TRACKERS[source].profileUrl(player));
		}
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event === "getAccounts") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getAccounts", items: accountOptions(snapshot()) });
		} else if (payload?.event === "getDailyGoals") {
			const player = playerName(snapshot(), await ev.action.getSettings());
			const goals = player ? await readDailyGoals(player) : [];
			const items = goals.filter((g) => importDailyGoal(g)).map((g) => ({ label: describeDailyGoal(g), value: g.id }));
			await streamDeck.ui.sendToPropertyInspector({
				event: "getDailyGoals",
				items: items.length ? items : [{ label: player ? `No Daily Goals for ${player}` : "Pick an account first", value: "", disabled: true }]
			});
		}
	}

	async tick(snap: Snapshot | undefined): Promise<void> {
		for (const a of this.actions) {
			if (!a.isKey()) {
				continue;
			}
			const settings = this.settings.get(a.id) ?? {};
			const player = playerName(snap, settings);
			if (player && !settings.metric && !settings.autoImported) {
				void this.autoImport(a, settings, player);
			}
			const image = renderKey(goalLook(this.status(settings, player), goal(settings)?.label ?? "GOAL", player));
			if (this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await a.setImage(image);
			}
		}
	}

	/** Fills an empty key in from the player's first switched-on Daily Goals goal that the sites can measure. */
	private async autoImport(a: KeyAction<Settings>, settings: Settings, player: string): Promise<void> {
		const tried = this.importTried.get(a.id) ?? 0;
		if (Date.now() - tried < AUTO_IMPORT_RETRY_MILLIS) {
			return;
		}
		this.importTried.set(a.id, Date.now());
		const goals = await readDailyGoals(player);
		const daily = goals.find((g) => g.enabled !== false && importDailyGoal(g)) ?? goals.find((g) => importDailyGoal(g));
		const merged = daily && withImported(settings, daily);
		if (merged && !this.settings.get(a.id)?.metric) {
			this.settings.set(a.id, merged);
			await a.setSettings(merged);
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
		const period = settings.period ?? (g.gain ? "day" : "week");
		const stats = playerStats(source, player, period);
		if (this.updating.has(`${source}:${player.toLowerCase()}`) || !stats) {
			return { state: "loading" };
		}
		if (stats.notFound) {
			return { state: "notfound" };
		}
		const progress = g.gain ? gainProgress(stats, settings.metric, g.target) : goalProgress(stats, settings.metric, g.target);
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
