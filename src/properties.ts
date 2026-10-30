/**
 * Parses a Java .properties file, the format RuneLite saves its settings in.
 */
export function parseProperties(text: string): Map<string, string> {
	const result = new Map<string, string>();
	const lines = text.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		let line = lines[i].replace(/^[ \t\f]+/, "");
		if (line === "" || line.startsWith("#") || line.startsWith("!")) {
			continue;
		}
		// A line ending in an odd number of backslashes continues on the next one
		while (/(^|[^\\])(\\\\)*\\$/.test(line) && i + 1 < lines.length) {
			line = line.slice(0, -1) + lines[++i].replace(/^[ \t\f]+/, "");
		}

		let split = line.length;
		for (let j = 0; j < line.length; j++) {
			const c = line[j];
			if (c === "\\") {
				j++;
			} else if (c === "=" || c === ":" || c === " " || c === "\t" || c === "\f") {
				split = j;
				break;
			}
		}

		const key = unescape(line.slice(0, split));
		const value = line.slice(split).replace(/^[ \t\f]*[=:]?[ \t\f]*/, "");
		result.set(key, unescape(value));
	}
	return result;
}

function unescape(value: string): string {
	return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escaped: string) => {
		switch (escaped[0]) {
			case "u":
				return String.fromCharCode(parseInt(escaped.slice(1), 16));
			case "t":
				return "\t";
			case "n":
				return "\n";
			case "r":
				return "\r";
			case "f":
				return "\f";
			default:
				return escaped;
		}
	});
}
