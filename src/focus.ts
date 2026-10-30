import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Finds the RuneLite window (preferring the one logged in to `account`, whose title is "RuneLite - <name>"), restores it if
 * minimised and brings it to the front. A small PowerShell helper stays running so a key press doesn't wait for it to start.
 */
const WINDOWS_HELPER = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Focus {
	[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
	[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
	[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
	[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
"@
while ($true) {
	$account = [Console]::In.ReadLine()
	if ($account -eq $null) { break }
	$account = $account.Replace([char]0xA0, ' ').Trim()
	$windows = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like 'RuneLite*' })
	$match = $null
	if ($account) { $match = $windows | Where-Object { $_.MainWindowTitle.Replace([char]0xA0, ' ') -like "RuneLite - $account" } | Select-Object -First 1 }
	if (-not $match) { $match = $windows | Select-Object -First 1 }
	if ($match) {
		$h = $match.MainWindowHandle
		if ([Focus]::IsIconic($h)) { [Focus]::ShowWindow($h, 9) | Out-Null }
		# Windows only lets the app that received the last input take the foreground; a synthetic Alt press counts
		[Focus]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
		[Focus]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
		[Focus]::SetForegroundWindow($h) | Out-Null
	}
}
`;

let helper: ChildProcessWithoutNullStreams | undefined;

function windowsHelper(): ChildProcessWithoutNullStreams {
	if (!helper || helper.exitCode !== null) {
		// Plugin files can't be changed after install, so the script lives in the temp folder
		const script = path.join(os.tmpdir(), "osrs-helper-focus.ps1");
		writeFileSync(script, WINDOWS_HELPER);
		helper = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
			windowsHide: true
		});
		helper.on("error", () => (helper = undefined));
		helper.stdout.resume();
		helper.stderr.resume();
	}
	return helper;
}

export function focusRuneLite(account?: string): void {
	if (process.platform === "win32") {
		windowsHelper().stdin.write(`${(account ?? "").replace(/[\r\n]/g, "")}\r\n`);
	} else if (process.platform === "darwin") {
		execFile("osascript", ["-e", 'tell application "RuneLite" to activate'], () => {});
	}
}
