import type { TrackerId } from "./trackers";

// The wizard from Wise Old Man's logo (github.com/wise-old-man/wise-old-man, MIT), as [fill, path] in its own coordinates
const WOM_BOX = { x: 0, y: 11, width: 133, height: 345.5 };
const WOM_PATHS: [string, string][] = [
	["#ffffff", "M31.5 254.5V207L43.5 214L62 199H73.5L103.5 220.5L132.5 188.5L131 209V220.5L127 234L123.5 236.5V254.5L119.5 262V278.5L111 286.5L103.5 292L106.5 307L108.5 330.5H103.5L92.5 332.5L90.5 346.5L81.5 356.5L66 342L51 349.5L49 328.5L45.5 324.5L30 315.5L31.5 310V298L34.5 294V284.5L24.5 269.5L31.5 254.5Z"],
	["#0A4481", "M39 17.5L26.5 51.5L42 73.5H123L130 45L118.5 12.5L104 50.5L76.5 11L62.5 56L39 17.5Z"],
	["#0091FF", "M17.5 90.5V107C40.667 116.833 96 129 132 99C132.336 98.72 132.669 98.44 133 98.16V90.5H17.5ZM44.5 67.44L17.5 31V90.5H133V67.44L131 43L129 32.5L122 61.5L104.5 31L84.5 72L63 37L44.5 67.44Z"],
	["#544E4E", "M61 159C61 175.845 47.345 189.5 30.5 189.5C13.655 189.5 0 175.845 0 159C0 142.155 13.655 128.5 30.5 128.5C47.345 128.5 61 142.155 61 159ZM125 163C125 179.845 111.345 193.5 94.5 193.5C77.655 193.5 64 179.845 64 163C64 146.155 77.655 132.5 94.5 132.5C111.345 132.5 125 146.155 125 163Z"],
	["#544E4E", "M66.783 150.254L59.491 149.5L59.94 167L64.5 168L66.783 150.254Z"],
	["#C9CFCF", "M27 180.5C38.598 180.5 48 171.098 48 159.5C48 147.902 38.598 138.5 27 138.5C15.402 138.5 6 147.902 6 159.5C6 171.098 15.402 180.5 27 180.5Z"],
	["#C9CFCF", "M91 184.5C102.598 184.5 112 175.098 112 163.5C112 151.902 102.598 142.5 91 142.5C79.402 142.5 70 151.902 70 163.5C70 175.098 79.402 184.5 91 184.5Z"]
];

// TempleOSRS's temple, drawn in a 100 x 90 box in one colour
const TEMPLE_BOX = { x: 0, y: 0, width: 100, height: 90 };
const TEMPLE_SHAPES = [
	`<polygon points="50,0 100,22 0,22"/>`,
	`<rect x="4" y="26" width="92" height="8"/>`,
	...[10, 32, 56, 78].map((x) => `<rect x="${x}" y="38" width="12" height="34"/>`),
	`<rect x="4" y="76" width="92" height="6"/>`,
	`<rect x="0" y="84" width="100" height="6"/>`
];

/**
 * A tracker site's logo as an SVG fragment, centred on `cx` with its top at `top` and `height` tall. Wise Old Man keeps
 * its own colours; the temple is drawn in `colour`.
 */
export function logo(tracker: TrackerId, cx: number, top: number, height: number, colour: string): string {
	const box = tracker === "wom" ? WOM_BOX : TEMPLE_BOX;
	const scale = height / box.height;
	const x = cx - (box.width * scale) / 2 - box.x * scale;
	const y = top - box.y * scale;
	const body =
		tracker === "wom"
			? WOM_PATHS.map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join("")
			: `<g fill="${colour}">${TEMPLE_SHAPES.join("")}</g>`;
	return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)})">${body}</g>`;
}
