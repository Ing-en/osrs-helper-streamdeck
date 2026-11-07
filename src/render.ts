import { logo } from "./logos";
import { effectiveState, type IdleState, type TrackedItem } from "./state";
import type { TrackerId } from "./trackers";

/**
 * `top` is a small line above the rest, used for the account name; `line3` sits at the bottom, sized like `line1`.
 * With `logo`, the site's logo takes the place of `line1`.
 */
export type Look = { background: string; text: string; line1: string; line2: string; line3?: string; top?: string; logo?: TrackerId };

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const DARK = "#1b1b1b";
const GREY = "#8a8a8a";
const GREEN = "#2e7d32";

/** Picks colours and text for the idle key. `on` is the current half of the flash cycle. */
export function idleLook(state: IdleState, on: boolean, dismissed: boolean, now = Date.now()): Look {
	const elapsed = formatClock((now - state.since) / 1000);
	switch (state.state) {
		case "active":
			return { background: GREEN, text: "#ffffff", line1: "PLAYING", line2: "" };
		case "loggedout":
			return { background: DARK, text: GREY, line1: "LOGGED", line2: "OUT" };
		case "offline":
			return { background: DARK, text: "#5c5c5c", line1: "OFFLINE", line2: "" };
	}

	const colour = state.state === "logout" ? "#e65100" : state.state === "kicked" ? "#6a1b9a" : "#c62828";
	return flash(colour, state.label || "IDLE", elapsed, on && !dismissed);
}

/** Picks colours and text for a Time Tracking key. */
export function trackedLook(item: TrackedItem, on: boolean, flashReady: boolean, now = Date.now()): Look {
	const nowSeconds = now / 1000;
	const line1 = item.label;
	// When it is (or was) ready, if known
	const line3 = item.end > 0 ? formatWhen(item.end) : undefined;
	switch (effectiveState(item, nowSeconds)) {
		case "ready":
			// Solid green, blinking to grey while flashing
			return { background: flashReady && !on ? "#5f5f5f" : GREEN, text: "#ffffff", line1, line2: "READY", line3 };
		case "countdown":
			return { background: DARK, text: "#ffffff", line1, line2: formatDuration(item.end - nowSeconds), line3 };
		case "running":
			return { background: DARK, text: "#7ee08f", line1, line2: formatClock(nowSeconds - item.start) };
		case "paused":
			return { background: DARK, text: GREY, line1, line2: formatClock(item.seconds) };
		case "empty":
			return { background: DARK, text: GREY, line1, line2: "EMPTY" };
		case "occupied":
			return { background: DARK, text: "#e57373", line1, line2: "OCCUPIED" };
		case "diseased":
			return { background: DARK, text: "#ffb74d", line1, line2: "DISEASED" };
		case "dead":
			return { background: DARK, text: "#e57373", line1, line2: "DEAD" };
		case "disabled":
			return { background: DARK, text: "#5c5c5c", line1, line2: "PLUGIN OFF" };
		default:
			return { background: DARK, text: GREY, line1, line2: "?" };
	}
}

export type UpdateStatus = "ready" | "updating" | "updated" | "recent" | "notfound" | "failed" | "noname";

/** Picks colours and text for a Wise Old Man or TempleOSRS update key. `lastUpdated` is epoch millis, if known. */
export function updateLook(
	tracker: TrackerId,
	status: UpdateStatus,
	player: string | undefined,
	lastUpdated: number | undefined,
	now = Date.now()
): Look {
	const line3 = lastUpdated ? formatAgo((now - lastUpdated) / 1000) : undefined;
	const look = (background: string, text: string, line2: string): Look => ({ background, text, line1: "", line2, line3, top: player, logo: tracker });
	switch (status) {
		case "noname":
			return { background: DARK, text: GREY, line1: "", line2: "SET NAME", logo: tracker };
		case "ready":
			return look(DARK, "#ffffff", "UPDATE");
		case "updating":
			return look(DARK, GREY, "UPDATING");
		case "updated":
			return look(GREEN, "#ffffff", "UPDATED");
		case "recent":
			return look("#e65100", "#ffffff", "TOO SOON");
		case "notfound":
			return look("#c62828", "#ffffff", "NOT FOUND");
		default:
			return look("#c62828", "#ffffff", "FAILED");
	}
}

export type GoalStatus =
	| { state: "noname" | "nogoal" | "loading" | "notfound" | "done" }
	| { state: "nogains"; period: string }
	| { state: "eta"; eta: number };

/** Picks colours and text for a goal key: `label` is e.g. "WC 99", `eta` epoch millis. */
export function goalLook(status: GoalStatus, label: string, player: string | undefined, now = Date.now()): Look {
	const top = player;
	switch (status.state) {
		case "noname":
			return { background: DARK, text: GREY, line1: "GOAL", line2: "SET NAME" };
		case "nogoal":
			return { background: DARK, text: GREY, line1: "GOAL", line2: "SET GOAL", top };
		case "loading":
			return { background: DARK, text: GREY, line1: label, line2: "...", top };
		case "notfound":
			return { background: "#c62828", text: "#ffffff", line1: label, line2: "NOT FOUND", top };
		case "done":
			return { background: GREEN, text: "#ffffff", line1: label, line2: "DONE", top };
		case "nogains":
			return { background: DARK, text: GREY, line1: label, line2: "NO GAINS", line3: status.period, top };
		case "eta": {
			const seconds = (status.eta - now) / 1000;
			// Close dates by weekday and time, further ones by date
			const when = seconds < 6 * 86400 ? formatWhen(status.eta / 1000) : formatDate(status.eta / 1000);
			return { background: DARK, text: "#ffffff", line1: label, line2: seconds > 0 ? formatDuration(seconds) : "ANY TIME", line3: when, top };
		}
	}
}

function flash(colour: string, line1: string, line2: string, on: boolean): Look {
	return on ? { background: colour, text: "#ffffff", line1, line2 } : { background: DARK, text: colour, line1, line2 };
}

export function renderKey(l: Look): string {
	if (l.logo) {
		return renderLogo(l, l.logo);
	}
	if (l.line3) {
		return renderThreeLines(l);
	}
	// With an account line on top, everything shifts down and shrinks a little
	const top = l.top ? text(l.top, 28, fontSize(l.top, 18), l.text, 0.75) : "";
	const [y1, y2, max1, max2] = l.top
		? l.line2 ? [74, 112, 26, 26] : [92, 0, 28, 0]
		: l.line2 ? [64, 106, 30, 28] : [82, 0, 30, 0];
	return svgKey(l.background, `${top}
${text(l.line1, y1, fontSize(l.line1, max1), l.text)}
${l.line2 ? text(l.line2, y2, fontSize(l.line2, max2), l.text) : ""}`);
}

/** Name, value and a bottom line as big as the name (shrunk only if it wouldn't fit). */
function renderThreeLines(l: Look): string {
	const [yTop, y1, y2, y3, max] = l.top ? [22, 54, 90, 126, 24] : [0, 42, 82, 124, 28];
	const line3 = l.line3 ?? "";
	// The name and the bottom line share one size: a bit under the largest both fit at
	const size = Math.floor(Math.min(fontSize(l.line1, max), fontSize(line3, max)) * 0.85);
	return svgKey(
		l.background,
		`${l.top ? text(l.top, yTop, fontSize(l.top, 16), l.text, 0.75) : ""}
${text(l.line1, y1, size, l.text)}
${text(l.line2, y2, fontSize(l.line2, max), l.text)}
${text(line3, y3, size, l.text)}`
	);
}

/** Account name, the site's logo, then `line2` and an optional smaller `line3`. */
function renderLogo(l: Look, tracker: TrackerId): string {
	// Lines that are missing give their room to the logo
	const logoTop = l.top ? 26 : 12;
	const logoBottom = l.line3 ? 82 : 92;
	const y2 = l.line3 ? 108 : 124;
	// Temple's one-colour logo is gold on the dark keys and white on the coloured ones
	const colour = l.background === DARK ? "#e6a028" : "#ffffff";
	return svgKey(
		l.background,
		`${l.top ? text(l.top, 18, fontSize(l.top, 15), l.text === GREY ? GREY : "#ffffff", 0.75) : ""}
${logo(tracker, 72, logoTop, logoBottom - logoTop, colour)}
${text(l.line2, y2, fontSize(l.line2, 24), l.text)}
${l.line3 ? text(l.line3, 136, fontSize(l.line3, 20), l.text === GREY ? GREY : "#ffffff") : ""}`
	);
}

function svgKey(background: string, body: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="${background}"/>
${body}
</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function text(value: string, y: number, size: number, fill: string, opacity = 1): string {
	return `<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${size}" fill="${fill}" fill-opacity="${opacity}" text-anchor="middle">${escape(value)}</text>`;
}

/** Shrinks text to fit the key's width, using Arial Bold's character widths in em. */
function fontSize(value: string, max: number): number {
	let em = 0;
	for (const c of value) {
		em += c === " " ? 0.28 : c === ":" ? 0.33 : /[0-9]/.test(c) ? 0.56 : /[a-z]/.test(c) ? 0.58 : 0.72;
	}
	return Math.max(12, Math.min(max, Math.floor(132 / Math.max(0.72, em))));
}

/** 0:42, 12:05, 1:02:03 */
export function formatClock(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = String(total % 60).padStart(2, "0");
	return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Weekday and 24-hour local time of an epoch second, e.g. SAT 14:30. */
export function formatWhen(epochSeconds: number): string {
	const d = new Date(epochSeconds * 1000);
	return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** E.g. 12 NOV, for dates further away than a weekday can say. */
export function formatDate(epochSeconds: number): string {
	const d = new Date(epochSeconds * 1000);
	const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getMonth()];
	return d.getFullYear() === new Date().getFullYear() ? `${d.getDate()} ${month}` : `${month} ${d.getFullYear()}`;
}

/** NOW under a minute, then 5M AGO, 3H AGO, 2D AGO. */
export function formatAgo(seconds: number): string {
	if (seconds < 60) {
		return "NOW";
	}
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)}M AGO`;
	}
	return seconds < 2 * 86400 ? `${Math.floor(seconds / 3600)}H AGO` : `${Math.floor(seconds / 86400)}D AGO`;
}

/** 12:05 under an hour, 3h 05m under a day, then 2d 4h. */
export function formatDuration(seconds: number): string {
	const total = Math.max(0, Math.ceil(seconds));
	if (total < 3600) {
		return formatClock(total);
	}
	const d = Math.floor(total / 86400);
	const h = Math.floor((total % 86400) / 3600);
	const m = Math.floor((total % 3600) / 60);
	return d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

function escape(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
