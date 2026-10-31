// Compiles the window watcher (src/helper/RuneLiteWatcher.cs) with the C# compiler that ships with Windows' .NET Framework.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

// Absolute Windows paths: csc reads a leading "/" in a relative path as a switch
const out = path.resolve("com.ingelberg.osrs-helper.sdPlugin", "bin", "osrs-helper-windows.exe");
const source = path.resolve("src", "helper", "RuneLiteWatcher.cs");

if (process.platform !== "win32") {
	console.warn("Skipping the window watcher: it can only be built on Windows.");
	process.exit(0);
}

const csc = path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
if (!existsSync(csc)) {
	console.error(`C# compiler not found at ${csc}`);
	process.exit(1);
}

// The running plugin keeps the exe open, so only rebuild it when its source has changed
if (existsSync(out) && statSync(out).mtimeMs >= statSync(source).mtimeMs) {
	console.log(`${out} is up to date`);
	process.exit(0);
}

mkdirSync(path.dirname(out), { recursive: true });
execFileSync(
	csc,
	["/nologo", "/optimize+", "/target:exe", "/reference:System.Windows.Forms.dll", `/out:${out}`, source],
	{ stdio: "inherit" }
);
console.log(`Built ${out}`);
