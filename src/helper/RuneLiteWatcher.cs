// Watches RuneLite windows for the OSRS Helper Stream Deck plugin; built into bin/osrs-helper-windows.exe by
// scripts/build-helper.mjs. Writes tab-separated lines to stdout: once a second "windows", one "window <hwnd> <title>"
// per RuneLite window, "input <foreground hwnd> <ms since last input>" and "end"; and "flash <hwnd> <title>" whenever a
// RuneLite taskbar button flashes. Reads "focus <account>" lines from stdin, and exits when stdin closes.
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
			// stdin closes when the plugin stops; never outlive it
			Environment.Exit(0);
		}) { IsBackground = true };
		input.Start();
		Application.Run();
	}

	[STAThread]
	public static void Main() {
		Run();
	}
}
