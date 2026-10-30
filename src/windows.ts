import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

/**
 * Watches RuneLite's windows on Windows. A window titled "RuneLite - <name>" is that account logged in; plain "RuneLite"
 * is a client on the login screen. When Idle Notifier fires with "Request focus" set to Taskbar, RuneLite flashes its
 * taskbar button, which Windows reports to shell hooks; that flash is our idle signal. Input while RuneLite is in front
 * clears it. The helper also brings a window to the front when a key is pressed.
 */
const HELPER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public class RuneLiteWatcher : NativeWindow {
	delegate bool EnumProc(IntPtr h, IntPtr l);
	[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
	[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
	[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
	[DllImport("user32.dll")] static extern bool RegisterShellHookWindow(IntPtr h);
	[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int RegisterWindowMessage(string s);
	[DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
	[DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
	[DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
	[DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
	[DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
	[StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
	[DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

	const int HSHELL_FLASH = 0x8006;
	int shellMessage;
	static readonly object output = new object();
	// NativeWindow only holds its window weakly: without this, garbage collection destroys the hook window
	// a few minutes in and flashes stop arriving
	static RuneLiteWatcher instance;

	static void Emit(string type, IntPtr h) {
		lock (output) {
			Console.Out.WriteLine(type + "\t" + h.ToInt64() + "\t" + Title(h));
			Console.Out.Flush();
		}
	}

	static string Title(IntPtr h) {
		var s = new StringBuilder(256);
		GetWindowText(h, s, 256);
		return s.ToString().Replace('\t', ' ');
	}

	static List<IntPtr> Windows() {
		var list = new List<IntPtr>();
		EnumWindows((h, l) => {
			if (IsWindowVisible(h) && Title(h).StartsWith("RuneLite")) list.Add(h);
			return true;
		}, IntPtr.Zero);
		return list;
	}

	public RuneLiteWatcher() {
		CreateHandle(new CreateParams());
		shellMessage = RegisterWindowMessage("SHELLHOOK");
		RegisterShellHookWindow(Handle);
	}

	protected override void WndProc(ref Message m) {
		if (m.Msg == shellMessage) {
			int code = m.WParam.ToInt32();
			if (code == HSHELL_FLASH && Title(m.LParam).StartsWith("RuneLite")) Emit("flash", m.LParam);
		}
		base.WndProc(ref m);
	}

	static void Focus(string account) {
		IntPtr match = IntPtr.Zero;
		foreach (var h in Windows()) {
			if (match == IntPtr.Zero) match = h;
			if (account.Length > 0 && Title(h).Replace('\u00A0', ' ') == "RuneLite - " + account) { match = h; break; }
		}
		if (match == IntPtr.Zero) return;
		if (IsIconic(match)) ShowWindow(match, 9);
		// Windows only lets the app that received the last input take the foreground; a synthetic Alt press counts
		keybd_event(0x12, 0, 0, UIntPtr.Zero);
		keybd_event(0x12, 0, 2, UIntPtr.Zero);
		SetForegroundWindow(match);
	}

	public static void Run() {
		instance = new RuneLiteWatcher();
		var timer = new System.Windows.Forms.Timer { Interval = 1000 };
		timer.Tick += (s, e) => {
			lock (output) {
				Console.Out.WriteLine("windows");
				foreach (var h in Windows()) Console.Out.WriteLine("window\t" + h.ToInt64() + "\t" + Title(h));
				// Which window is in front, and how long since the last key press or mouse move anywhere
				var info = new LASTINPUTINFO();
				info.cbSize = (uint)Marshal.SizeOf(info);
				GetLastInputInfo(ref info);
				Console.Out.WriteLine("input\t" + GetForegroundWindow().ToInt64() + "\t" + (uint)(Environment.TickCount - (int)info.dwTime));
				Console.Out.WriteLine("end");
				Console.Out.Flush();
			}
		};
		timer.Start();
		var input = new Thread(() => {
			string line;
			while ((line = Console.In.ReadLine()) != null) {
				if (line.StartsWith("focus\t")) Focus(line.Substring(6).Replace('\u00A0', ' ').Trim());
			}
			Application.Exit();
		}) { IsBackground = true };
		input.Start();
		Application.Run();
	}
}
"@
[RuneLiteWatcher]::Run()
`;

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

	// Plugin files can't be changed after install, so the script lives in the temp folder
	const script = path.join(os.tmpdir(), "osrs-helper-windows.ps1");
	writeFileSync(script, HELPER);
	const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA", "-File", script], {
		windowsHide: true
	});
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
