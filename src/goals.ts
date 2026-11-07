import { SKILLS } from "./stats";

/** Short names for the key, where the full one wouldn't fit next to a number. */
const SHORT: Record<string, string> = {
	overall: "TOTAL",
	attack: "ATT",
	defence: "DEF",
	strength: "STR",
	hitpoints: "HP",
	ranged: "RANGE",
	prayer: "PRAY",
	magic: "MAGE",
	cooking: "COOK",
	woodcutting: "WC",
	fletching: "FLETCH",
	fishing: "FISH",
	firemaking: "FM",
	crafting: "CRAFT",
	smithing: "SMITH",
	mining: "MINE",
	herblore: "HERB",
	agility: "AGIL",
	thieving: "THIEV",
	slayer: "SLAY",
	farming: "FARM",
	runecrafting: "RC",
	hunter: "HUNT",
	construction: "CON",
	sailing: "SAIL",
	chambers_of_xeric: "COX",
	chambers_of_xeric_challenge_mode: "CM",
	theatre_of_blood: "TOB",
	theatre_of_blood_hard_mode: "HMT",
	tombs_of_amascut: "TOA",
	tombs_of_amascut_expert: "EXPERT",
	the_corrupted_gauntlet: "CG",
	the_gauntlet: "GAUNTLET",
	thermonuclear_smoke_devil: "THERMY",
	alchemical_hydra: "HYDRA",
	grotesque_guardians: "GG",
	commander_zilyana: "ZILYANA",
	general_graardor: "BANDOS",
	kril_tsutsaroth: "ZAMMY",
	kreearra: "ARMA",
	king_black_dragon: "KBD",
	kalphite_queen: "KQ",
	corporeal_beast: "CORP",
	dagannoth_prime: "PRIME",
	dagannoth_rex: "REX",
	dagannoth_supreme: "SUPREME",
	phosanis_nightmare: "PNM",
	tzkal_zuk: "ZUK",
	tztok_jad: "JAD",
	barrows_chests: "BARROWS",
	clue_scrolls_all: "CLUES",
	clue_scrolls_beginner: "BEGINNER",
	clue_scrolls_easy: "EASY",
	clue_scrolls_medium: "MEDIUM",
	clue_scrolls_hard: "HARD",
	clue_scrolls_elite: "ELITE",
	clue_scrolls_master: "MASTER",
	last_man_standing: "LMS",
	guardians_of_the_rift: "GOTR",
	soul_wars_zeal: "ZEAL",
	colosseum_glory: "GLORY",
	collections_logged: "CLOG"
};

/** How a goal key's target is read: a level, a total XP/count, or an amount to gain each period. */
export type GoalType = "level" | "xp" | "gain";

/** The goal key fields a Daily Goals goal translates to. */
export type ImportedGoal = { metric: string; goalType: GoalType; target: string; period: "day" | "week" };

// Daily Goals activity names that aren't Wise Old Man's metric names in upper case
const DAILY_ACTIVITIES: Record<string, string> = {
	CLUES_ALL: "clue_scrolls_all",
	CLUES_BEGINNER: "clue_scrolls_beginner",
	CLUES_EASY: "clue_scrolls_easy",
	CLUES_MEDIUM: "clue_scrolls_medium",
	CLUES_HARD: "clue_scrolls_hard",
	CLUES_ELITE: "clue_scrolls_elite",
	CLUES_MASTER: "clue_scrolls_master",
	RIFTS_CLOSED: "guardians_of_the_rift"
};

/**
 * Translates a Daily Goals goal (`{type, skill, overall, activity, customName, amount, period}`) into goal key fields.
 * Level goals become "reach level N"; XP and count goals, which Daily Goals sets per day or week, become "gain N per
 * day/week". Undefined for goals Wise Old Man and TempleOSRS can't measure, such as Hallowed Sepulchre floors.
 */
export function importDailyGoal(goal: {
	type: string;
	skill?: string;
	overall?: boolean;
	activity?: string;
	customName?: string;
	amount: number;
	period?: string;
}): ImportedGoal | undefined {
	const period = goal.period === "WEEKLY" ? "week" : "day";
	const target = String(goal.amount);
	if (goal.type === "LEVEL" && goal.skill) {
		// A level is a long-term goal: a week's rate is steadier than a day's
		return { metric: goal.skill.toLowerCase(), goalType: "level", target, period: "week" };
	}
	if (goal.type === "XP") {
		return { metric: goal.overall ? "overall" : (goal.skill ?? "").toLowerCase(), goalType: "gain", target, period };
	}
	const activity = goal.activity ?? "";
	if (activity === "SEPULCHRE_FLOORS" || !activity) {
		return undefined;
	}
	const metric =
		activity === "OTHER"
			? (goal.customName ?? "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
			: DAILY_ACTIVITIES[activity] ?? activity.toLowerCase();
	return metric ? { metric, goalType: "gain", target, period } : undefined;
}

/** E.g. "Crafting level 75", "Gain 100K Construction XP daily", "5 Zulrah daily". */
export function describeDailyGoal(goal: { type: string; skill?: string; overall?: boolean; activity?: string; customName?: string; amount: number; period?: string; enabled?: boolean }): string {
	const title = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
	const when = goal.period === "WEEKLY" ? "weekly" : "daily";
	const text =
		goal.type === "LEVEL"
			? `${title(goal.skill ?? "")} level ${goal.amount}`
			: goal.type === "XP"
				? `Gain ${compactNumber(goal.amount)} ${goal.overall ? "total" : title(goal.skill ?? "")} XP ${when}`
				: `${compactNumber(goal.amount)} ${goal.activity === "OTHER" ? goal.customName : title(goal.activity ?? "")} ${when}`;
	return goal.enabled === false ? `${text} (off)` : text;
}

export function isSkill(metric: string): boolean {
	return SKILLS.includes(metric);
}

/** E.g. "WC", or "ZULRAH" for metrics without a short name. */
export function shortLabel(metric: string): string {
	return SHORT[metric] ?? metric.replace(/^the_/, "").replace(/_/g, " ").toUpperCase();
}

/** 13034431 → 13M, 1250000 → 1.25M, 50000 → 50K. */
export function compactNumber(n: number): string {
	const fmt = (v: number, suffix: string) => `${Number(v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0))}${suffix}`;
	if (n >= 1_000_000) {
		return fmt(n / 1_000_000, "M");
	}
	if (n >= 10_000) {
		return fmt(n / 1000, "K");
	}
	return String(Math.round(n));
}
