import { readSnapshot, type Snapshot } from "./state";

export const TICK_MILLIS = 250;

export interface Ticking {
	/** Number of keys currently showing this action. */
	readonly visible: number;
	tick(snapshot: Snapshot | undefined, tick: number): Promise<void>;
}

const actions: Ticking[] = [];
const listeners: ((snapshot: Snapshot) => Promise<void>)[] = [];
let timer: NodeJS.Timeout | undefined;
let count = 0;
let latest: Snapshot | undefined;

/** The most recent read of RuneLite's state file. */
export function snapshot(): Snapshot | undefined {
	return latest;
}

export function register(action: Ticking): void {
	actions.push(action);
}

/** Called after every read of the state files. */
export function onSnapshot(listener: (snapshot: Snapshot) => Promise<void>): void {
	listeners.push(listener);
}

/** Starts or stops the shared timer depending on whether any key is visible; call after keys appear or disappear. */
export function refresh(): void {
	const needed = actions.some((a) => a.visible > 0);
	if (needed && !timer) {
		timer = setInterval(() => void run(), TICK_MILLIS);
		void run();
	} else if (!needed && timer) {
		clearInterval(timer);
		timer = undefined;
	}
}

let running = false;

async function run(): Promise<void> {
	// A slow read (RuneLite saving a big profile) must not start a second update on top of this one
	if (running) {
		return;
	}
	running = true;
	try {
		count++;
		latest = await readSnapshot();
		for (const listener of listeners) {
			await listener(latest);
		}
		for (const action of actions) {
			if (action.visible > 0) {
				await action.tick(latest, count);
			}
		}
	} finally {
		running = false;
	}
}
