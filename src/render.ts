import { effectiveState, type IdleState, type TrackedItem } from "./state";

export type Look = { background: string; text: string; line1: string; line2: string };

const DARK = "#1b1b1b";
const GREY = "#8a8a8a";
const GREEN = "#2e7d32";

/** Picks colours and text for the idle key. `on` is the current half of the flash cycle. */
export function idleLook(state: IdleState, on: boolean, dismissed: boolean, now = Date.now()): Look {
	const elapsed = formatClock((now - state.since) / 1000);
	switch (state.state) {
		case "active":
			return { background: "#14361f", text: "#7ee08f", line1: "ACTIVE", line2: "" };
		case "loggedout":
			return { background: DARK, text: GREY, line1: "LOGGED", line2: "OUT" };
		case "offline":
			return { background: DARK, text: "#5c5c5c", line1: "RUNELITE", line2: "CLOSED" };
	}

	const colour = state.state === "logout" ? "#e65100" : state.state === "kicked" ? "#6a1b9a" : "#c62828";
	return flash(colour, state.label || "IDLE", elapsed, on && !dismissed);
}

/** Picks colours and text for a Time Tracking key. */
export function trackedLook(item: TrackedItem, on: boolean, flashReady: boolean, now = Date.now()): Look {
	const nowSeconds = now / 1000;
	const line1 = item.label;
	switch (effectiveState(item, nowSeconds)) {
		case "ready":
			return flash(GREEN, line1, "READY", flashReady && on);
		case "countdown":
			return { background: DARK, text: "#ffffff", line1, line2: formatDuration(item.end - nowSeconds) };
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

function flash(colour: string, line1: string, line2: string, on: boolean): Look {
	return on ? { background: colour, text: "#ffffff", line1, line2 } : { background: DARK, text: colour, line1, line2 };
}

export function renderKey(l: Look): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="${l.background}"/>
${text(l.line1, l.line2 ? 64 : 82, fontSize(l.line1, 30), l.text)}
${l.line2 ? text(l.line2, 106, fontSize(l.line2, 28), l.text) : ""}
</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function text(value: string, y: number, size: number, fill: string): string {
	return `<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${size}" fill="${fill}" text-anchor="middle">${escape(value)}</text>`;
}

/** Shrinks long text to fit the key's width; Arial bold capitals are about 0.72em wide. */
function fontSize(value: string, max: number): number {
	return Math.max(12, Math.min(max, Math.floor(132 / (Math.max(1, value.length) * 0.72))));
}

/** 0:42, 12:05, 1:02:03 */
export function formatClock(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = String(total % 60).padStart(2, "0");
	return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
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
