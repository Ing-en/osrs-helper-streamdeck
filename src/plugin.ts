import streamDeck from "@elgato/streamdeck";

import { IdleAlert } from "./actions/idle-alert";
import { TimeTracking } from "./actions/time-tracking";
import { register } from "./ticker";

streamDeck.logger.setLevel("info");

const idle = new IdleAlert();
const timeTracking = new TimeTracking();
register(idle);
register(timeTracking);
streamDeck.actions.registerAction(idle);
streamDeck.actions.registerAction(timeTracking);

streamDeck.connect();
