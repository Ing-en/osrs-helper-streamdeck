import type { IdleState } from "./state";

type Look = { background: string; text: string; line1: string; line2: string };

const DARK = "#1b1b1b";

/** Picks colours and text for the key. `on` is the current half of the flash cycle. */
export function look(state: IdleState, on: boolean, dismissed: boolean, now = Date.now()): Look {
	const elapsed = formatElapsed(now - state.since);
	switch (state.state) {
		case "active":
			return { background: "#14361f", text: "#7ee08f", line1: "ACTIVE", line2: "" };
		case "loggedout":
			return { background: DARK, text: "#8a8a8a", line1: "LOGGED", line2: "OUT" };
		case "offline":
			return { background: DARK, text: "#5c5c5c", line1: "RUNELITE", line2: "CLOSED" };
	}

	const colour = state.state === "logout" ? "#e65100" : state.state === "kicked" ? "#6a1b9a" : "#c62828";
	const line1 = state.label || "IDLE";
	if (dismissed) {
		return { background: DARK, text: colour, line1, line2: elapsed };
	}
	return on
		? { background: colour, text: "#ffffff", line1, line2: elapsed }
		: { background: DARK, text: colour, line1, line2: elapsed };
}

export function renderKey(l: Look): string {
	const line1Size = l.line1.length > 7 ? 22 : 30;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="${l.background}"/>
<text x="72" y="${l.line2 ? 66 : 82}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${line1Size}" fill="${l.text}" text-anchor="middle">${escape(l.line1)}</text>
${l.line2 ? `<text x="72" y="104" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="26" fill="${l.text}" text-anchor="middle">${escape(l.line2)}</text>` : ""}
</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

export function formatElapsed(millis: number): string {
	const seconds = Math.max(0, Math.floor(millis / 1000));
	const minutes = Math.floor(seconds / 60);
	return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function escape(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
