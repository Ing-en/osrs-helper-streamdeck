import streamDeck from "@elgato/streamdeck";

import { IdleAlert } from "./actions/idle-alert";
import { options, TimeTracking } from "./actions/time-tracking";
import { startIdleWatch } from "./idle";
import { accountOptions } from "./state";
import { onSnapshot, register } from "./ticker";

streamDeck.logger.setLevel("info");

const idle = new IdleAlert();
const timeTracking = new TimeTracking();
register(idle);
register(timeTracking);
streamDeck.actions.registerAction(idle);
streamDeck.actions.registerAction(timeTracking);

// Keep an open settings page's dropdowns current: accounts appear after logging in, timers when they're made
let lastLists = "";
onSnapshot(async (snap) => {
	const lists = JSON.stringify(snap.accounts.map((a) => [a.name, a.tracking.map((t) => t.id)]));
	const current = streamDeck.ui.action;
	if (lists === lastLists || !current) {
		return;
	}
	lastLists = lists;

	await streamDeck.ui.sendToPropertyInspector({ event: "getAccounts", items: accountOptions(snap) });
	if (current.manifestId === "com.ingelberg.osrs-helper.timetracking") {
		const settings = (await current.getSettings()) as { account?: string };
		await streamDeck.ui.sendToPropertyInspector({ event: "getItems", items: options(snap, settings.account) });
	}
});

startIdleWatch();
streamDeck.connect();
