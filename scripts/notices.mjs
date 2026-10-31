// Writes THIRD-PARTY-NOTICES.txt into the plugin folder: OSRS Helper's own licence plus the notices the bundled code
// requires (the ported RuneLite farming logic and the npm packages rollup bundles into bin/plugin.js).
import { readFileSync, writeFileSync } from "node:fs";

const out = "com.ingen.osrs-helper.sdPlugin/THIRD-PARTY-NOTICES.txt";
const BUNDLED = ["@elgato/streamdeck", "@elgato/utils", "@elgato/schemas", "ws"];
const RULE = "=".repeat(78);

const RUNELITE = `Farming, bird house and farming contract predictions are ported from RuneLite's Time Tracking plugin
(https://github.com/runelite/runelite), and src/farming-data.json is exported from it.

Copyright (c) 2018-2019 Abex
Copyright (c) 2018, NotFoxtrot <https://github.com/NotFoxtrot>
Copyright (c) 2018, Daniel Teo <https://github.com/takuyakanbr>
Copyright (c) 2019, Koekkruimels <https://github.com/koekkruimels>
Copyright (c) 2020, melky <https://github.com/melkypie>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

const sections = [
	["OSRS Helper", readFileSync("LICENSE", "utf8").trim()],
	["RuneLite Time Tracking (BSD-2-Clause)", RUNELITE],
	...BUNDLED.map((name) => {
		const pkg = JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8"));
		return [`${name} ${pkg.version} (${pkg.license})`, readFileSync(`node_modules/${name}/LICENSE`, "utf8").trim()];
	}),
	[
		"sdpi-components 4.0.1 (MIT) and Lit (BSD-3-Clause)",
		"Used by the settings pages. Their copyright and licence notices are kept at the top of ui/sdpi-components.js."
	]
];

writeFileSync(out, sections.map(([title, text]) => `${RULE}\n${title}\n${RULE}\n\n${text}\n`).join("\n"));
console.log(`Wrote ${out}`);
