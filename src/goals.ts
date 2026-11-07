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
