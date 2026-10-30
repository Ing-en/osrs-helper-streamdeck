# OSRS Helper for Stream Deck

Old School RuneScape keys for your Elgato Stream Deck. Needs the **Stream Deck** plugin from the RuneLite Plugin Hub ([source](https://github.com/Ingelberg/stream-deck)).

## Keys

**Idle Alert** flashes red with a timer when RuneLite's Idle Notifier says you're idle, stopped moving or out of combat, and orange when you're about to be logged out. Press it to stop the flashing until the next alert.

**Time Tracking** shows one thing from RuneLite's Time Tracking plugin. Pick it in the key's settings:

- Farming: herb, tree, fruit tree, special, flower, allotment, bush, grape and hops patches, and the farming contract
- Hunter: bird houses
- Timers: the next timer to finish, or any timer you've made
- Stopwatches: any stopwatch you've made

It counts down to when it's ready, then flashes green. Press it to stop the flashing.

Both keys can bring RuneLite to the front when pressed, and can watch one account or any account. With several clients open, an Idle Alert set to *Any account* shows whichever account needs you most and names it on the key. The Idle Alert's flashing can be turned off so it just turns red.

## Building

Requires Node.js 24 and Stream Deck 7.1 or newer.

```bash
npm install
npm run build
npx streamdeck link com.ingelberg.osrs-helper.sdPlugin
```

`npm run pack` creates `dist/com.ingelberg.osrs-helper.streamDeckPlugin` for distribution.
