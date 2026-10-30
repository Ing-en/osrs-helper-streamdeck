import streamDeck from "@elgato/streamdeck";

import { IdleAlert } from "./actions/idle-alert";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new IdleAlert());
streamDeck.connect();
