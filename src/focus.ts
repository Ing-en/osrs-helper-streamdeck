import { execFile } from "node:child_process";

/** Brings the RuneLite window to the front. Best effort: Windows may only flash the taskbar button. */
export function focusRuneLite(): void {
	if (process.platform === "win32") {
		execFile(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-Command", "(New-Object -ComObject WScript.Shell).AppActivate('RuneLite') | Out-Null"],
			{ windowsHide: true },
			() => {}
		);
	} else if (process.platform === "darwin") {
		execFile("osascript", ["-e", 'tell application "RuneLite" to activate'], () => {});
	}
}
