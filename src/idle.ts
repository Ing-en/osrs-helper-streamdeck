import type { IdleState } from "./state";
import { type RuneLiteWindow, watchWindows } from "./windows";

/** A second flash this long after the first, while still idle, is taken as the logout warning. */
const LOGOUT_AFTER_MILLIS = 60_000;
/** Input this soon after a flash may be what triggered it; RuneLite only notifies once you've stopped. */
const INPUT_GRACE_MILLIS = 1500;

type Tracked = { idle?: IdleState; loggedIn: boolean; open: boolean };

const accounts = new Map<string, Tracked>();
/** The account each window last showed, so a client on the login screen can still be matched to one. */
const windowAccounts = new Map<number, string>();
let started = false;

function tracked(account: string): Tracked {
	const key = account.toLowerCase();
	let t = accounts.get(key);
	if (!t) {
		t = { loggedIn: false, open: false };
		accounts.set(key, t);
	}
	return t;
}

function alert(state: IdleState["state"], label: string, since = Date.now()): IdleState {
	return { state, label, message: "", since };
}

function accountFor(window: RuneLiteWindow): string | undefined {
	if (window.account) {
		windowAccounts.set(window.hwnd, window.account);
		return window.account;
	}
	return windowAccounts.get(window.hwnd);
}

export function startIdleWatch(): void {
	if (started) {
		return;
	}
	started = true;

	watchWindows({
		onWindows(windows, foreground, inputAt) {
			const seen = new Set<string>();
			for (const w of windows) {
				const account = accountFor(w);
				if (!account) {
					continue;
				}
				seen.add(account.toLowerCase());
				const t = tracked(account);
				const loggedIn = w.account !== undefined;
				if (t.loggedIn && !loggedIn) {
					// Logged out while an alert was showing: probably the idle logout
					t.idle = t.idle && t.idle.state !== "kicked" ? alert("kicked", "LOGGED OUT", t.idle.since) : t.idle;
				} else if (!t.loggedIn && loggedIn && t.idle?.state === "kicked") {
					t.idle = undefined;
				}
				t.loggedIn = loggedIn;
				t.open = true;
			}
			for (const [key, t] of accounts) {
				if (!seen.has(key)) {
					t.open = false;
					t.loggedIn = false;
					t.idle = undefined;
				}
			}
			// Pressing a key or moving the mouse in the client is the player coming back
			const front = windowAccounts.get(foreground);
			const t = front ? accounts.get(front.toLowerCase()) : undefined;
			if (t?.idle && t.idle.state !== "kicked" && inputAt > t.idle.since + INPUT_GRACE_MILLIS) {
				t.idle = undefined;
			}

			for (const hwnd of windowAccounts.keys()) {
				if (!windows.some((w) => w.hwnd === hwnd)) {
					windowAccounts.delete(hwnd);
				}
			}
		},

		onFlash(window) {
			const account = accountFor(window);
			if (!account) {
				return;
			}
			const t = tracked(account);
			if (t.idle && Date.now() - t.idle.since >= LOGOUT_AFTER_MILLIS && t.idle.state === "idle") {
				t.idle = alert("logout", "LOGOUT");
			} else if (!t.idle) {
				t.idle = alert("idle", "IDLE");
			}
		}
	});
}

/** The idle state of every account with an open RuneLite window. */
export function idleStates(): { name: string; idle: IdleState; online: boolean }[] {
	const result: { name: string; idle: IdleState; online: boolean }[] = [];
	for (const name of windowAccounts.values()) {
		const t = accounts.get(name.toLowerCase());
		if (!t || !t.open || result.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
			continue;
		}
		const idle = t.idle ?? (t.loggedIn ? alert("active", "", 0) : alert("loggedout", "", 0));
		result.push({ name, idle, online: true });
	}
	return result;
}
