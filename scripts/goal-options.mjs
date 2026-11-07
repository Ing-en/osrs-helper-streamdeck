// Writes the goal key's settings page, with every skill, boss and activity Wise Old Man tracks as a dropdown option.
// Run after adding metrics: node scripts/goal-options.mjs
import { writeFileSync } from "node:fs";

const SKILLS = [
	"overall", "attack", "defence", "strength", "hitpoints", "ranged", "prayer", "magic", "cooking", "woodcutting",
	"fletching", "fishing", "firemaking", "crafting", "smithing", "mining", "herblore", "agility", "thieving", "slayer",
	"farming", "runecrafting", "hunter", "construction", "sailing"
];
const BOSSES = [
	"abyssal_sire", "alchemical_hydra", "amoxliatl", "araxxor", "artio", "barrows_chests", "brutus", "bryophyta", "callisto",
	"calvarion", "cerberus", "chambers_of_xeric", "chambers_of_xeric_challenge_mode", "chaos_elemental", "chaos_fanatic",
	"commander_zilyana", "corporeal_beast", "crazy_archaeologist", "dagannoth_prime", "dagannoth_rex", "dagannoth_supreme",
	"deranged_archaeologist", "doom_of_mokhaiotl", "duke_sucellus", "general_graardor", "giant_mole", "grotesque_guardians",
	"hespori", "kalphite_queen", "king_black_dragon", "kraken", "kreearra", "kril_tsutsaroth", "lunar_chests", "mad_angel",
	"maggot_king", "mimic", "nex", "nightmare", "phosanis_nightmare", "obor", "phantom_muspah", "sarachnis", "scorpia",
	"scurrius", "shellbane_gryphon", "skotizo", "sol_heredit", "spindel", "tempoross", "the_gauntlet", "the_corrupted_gauntlet",
	"the_fractured_archive", "the_hueycoatl", "the_leviathan", "the_royal_titans", "the_whisperer", "theatre_of_blood",
	"theatre_of_blood_hard_mode", "thermonuclear_smoke_devil", "tombs_of_amascut", "tombs_of_amascut_expert", "tzkal_zuk",
	"tztok_jad", "vardorvis", "venenatis", "vetion", "vorkath", "wintertodt", "yama", "zalcano", "zulrah"
];
const ACTIVITIES = [
	"clue_scrolls_all", "clue_scrolls_beginner", "clue_scrolls_easy", "clue_scrolls_medium", "clue_scrolls_hard",
	"clue_scrolls_elite", "clue_scrolls_master", "last_man_standing", "pvp_arena", "soul_wars_zeal", "guardians_of_the_rift",
	"colosseum_glory", "collections_logged", "bounty_hunter_hunter", "bounty_hunter_rogue"
];

const NAMES = {
	kreearra: "Kree'arra", kril_tsutsaroth: "K'ril Tsutsaroth", vetion: "Vet'ion", tzkal_zuk: "TzKal-Zuk", tztok_jad: "TzTok-Jad",
	phosanis_nightmare: "Phosani's Nightmare", theatre_of_blood_hard_mode: "Theatre of Blood: Hard Mode",
	chambers_of_xeric_challenge_mode: "Chambers of Xeric: Challenge Mode", tombs_of_amascut_expert: "Tombs of Amascut: Expert",
	runecrafting: "Runecraft", overall: "Overall (total XP)", pvp_arena: "PvP Arena", soul_wars_zeal: "Soul Wars Zeal"
};
const name = (key) =>
	NAMES[key] ??
	key
		.split("_")
		.map((w, i) => (i > 0 && ["of", "the"].includes(w) ? w : w[0].toUpperCase() + w.slice(1)))
		.join(" ");

const group = (label, keys) =>
	`\t\t\t\t<optgroup label="${label}">\n${keys.map((k) => `\t\t\t\t\t<option value="${k}">${name(k)}</option>`).join("\n")}\n\t\t\t\t</optgroup>`;

const html = `<!doctype html>
<html>
	<head lang="en">
		<title>Goal Settings</title>
		<meta charset="utf-8" />
		<script src="sdpi-components.js"></script>
	</head>

	<body>
		<sdpi-item label="Account">
			<sdpi-select setting="account" datasource="getAccounts" hot-reload default="any" loading="Loading..."></sdpi-select>
		</sdpi-item>
		<sdpi-item label="Or name">
			<sdpi-textfield setting="player" placeholder="Any player, e.g. one not on this PC"></sdpi-textfield>
		</sdpi-item>
		<sdpi-item label="Stats from">
			<sdpi-select setting="source" default="wom">
				<option value="wom">Wise Old Man</option>
				<option value="temple">TempleOSRS</option>
			</sdpi-select>
		</sdpi-item>
		<sdpi-item label="Goal">
			<sdpi-select setting="metric" placeholder="Pick a skill, boss or activity">
${group("Skills", SKILLS)}
${group("Bosses", BOSSES)}
${group("Activities", ACTIVITIES)}
			</sdpi-select>
		</sdpi-item>
		<sdpi-item label="Skill goal in">
			<sdpi-select setting="goalType" default="level">
				<option value="level">Level</option>
				<option value="xp">XP</option>
			</sdpi-select>
		</sdpi-item>
		<sdpi-item label="Target">
			<sdpi-textfield setting="target" placeholder="e.g. 99, 50m or 500"></sdpi-textfield>
		</sdpi-item>
		<sdpi-item label="Rate from">
			<sdpi-select setting="period" default="week">
				<option value="day">The last day</option>
				<option value="week">The last week</option>
				<option value="month">The last month</option>
			</sdpi-select>
		</sdpi-item>
		<sdpi-item label="On press">
			<sdpi-checkbox setting="openProfile" label="Also open the profile page"></sdpi-checkbox>
		</sdpi-item>
		<p style="color: #969696; font-size: 9pt; margin: 8px 16px">
			Counts down, in hours and days, until the goal is reached at the rate you gained over the chosen period. The bottom line
			is when that will be. Skill goals are a level (up to 126) or an XP amount; boss and activity goals a kill count or score.
			Pressing the key updates you on the site and recalculates. Stats are also saved on this PC, so the key keeps working
			offline.
		</p>
		<p style="font-size: 9pt; margin: 8px 16px">
			<a href="https://github.com/Ing-en/osrs-helper-streamdeck/issues" target="_blank">Help &amp; support</a>
		</p>
	</body>
</html>
`;

writeFileSync("com.ingen.osrs-helper.sdPlugin/ui/goal.html", html);
console.log("Wrote com.ingen.osrs-helper.sdPlugin/ui/goal.html");
