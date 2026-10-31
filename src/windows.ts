import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

/**
 * Watches RuneLite's windows on Windows. A window titled "RuneLite - <name>" is that account logged in; plain "RuneLite"
 * is a client on the login screen. When Idle Notifier fires with "Request focus" set to Taskbar, RuneLite flashes its
 * taskbar button, which Windows reports to shell hooks; that flash is our idle signal. Input while RuneLite is in front
 * clears it. The helper also brings a window to the front when a key is pressed.
 */
/** Built from src/helper/RuneLiteWatcher.cs by scripts/build-helper.mjs, next to bin/plugin.js. */
const HELPER = fileURLToPath(new URL("osrs-helper-windows.exe", import.meta.url));

export type RuneLiteWindow = { hwnd: number; title: string; account?: string };

type Listener = {
	/** `foreground` is the window in front; `inputAt` is when the user last pressed a key or moved the mouse, epoch millis. */
	onWindows(windows: RuneLiteWindow[], foreground: number, inputAt: number): void;
	onFlash(window: RuneLiteWindow): void;
};

let helper: ChildProcessWithoutNullStreams | undefined;
let listener: Listener | undefined;

export function accountOf(title: string): string | undefined {
	const match = /^RuneLite - (.+)$/.exec(title.replace(/\u00A0/g, " "));
	return match ? match[1].trim() : undefined;
}

/** Starts the helper (Windows only) and reports window changes, flashes and activations to `l`. */
export function watchWindows(l: Listener): void {
	listener = l;
	if (process.platform !== "win32" || (helper && helper.exitCode === null)) {
		return;
	}

	const child = spawn(HELPER, [], { windowsHide: true });
	helper = child;
	child.on("error", () => (helper = undefined));
	child.on("exit", () => {
		helper = undefined;
		// Restart after a crash, but not in a tight loop
		setTimeout(() => listener && watchWindows(listener), 5000);
	});
	child.stderr.resume();

	let batch: RuneLiteWindow[] = [];
	let foreground = 0;
	let inputAt = 0;
	readline.createInterface({ input: child.stdout }).on("line", (line) => {
		const [type, hwnd, title = ""] = line.split("\t");
		const window = { hwnd: Number(hwnd), title, account: accountOf(title) };
		switch (type) {
			case "windows":
				batch = [];
				break;
			case "window":
				batch.push(window);
				break;
			case "input":
				foreground = Number(hwnd);
				inputAt = Date.now() - Number(title);
				break;
			case "end":
				listener?.onWindows(batch, foreground, inputAt);
				break;
			case "flash":
				listener?.onFlash(window);
				break;
		}
	});
}

/** Brings the RuneLite window for `account` (or any RuneLite window) to the front. */
export function focusRuneLite(account?: string): void {
	helper?.stdin.write(`focus\t${(account ?? "").replace(/[\r\n\t]/g, " ")}\n`);
}
