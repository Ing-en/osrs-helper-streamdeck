# OSRS Helper for Stream Deck

Old School RuneScape keys for your Elgato Stream Deck. Works with RuneLite as it is: no RuneLite plugin needed. Windows only.

## Keys

**Idle Alert** flashes red with a timer when RuneLite's Idle Notifier fires, and orange if it fires again a minute or more later (usually the logout warning). Pressing a key or moving the mouse in RuneLite clears it, and so does pressing the Stream Deck key. If the client logs out while the alert is showing, the key turns purple.

**Time Tracking** shows one thing from RuneLite's Time Tracking plugin. Pick it in the key's settings:

- Farming: herb, tree, fruit tree, special, flower, allotment, bush, grape and hops patches, and the farming contract
- Hunter: bird houses
- Timers: the next timer to finish, or any timer you've made
- Stopwatches: any stopwatch you've made

It counts down to when it's ready, then flashes green. Press it to stop the flashing.

Both keys can watch one account or any account, and bring that account's RuneLite window to the front when pressed. With several clients open, an Idle Alert set to *Any account* shows whichever account needs you most and names it on the key.

## Setup in RuneLite

- **Idle Alert:** enable **Idle Notifier**, and set **Request focus** to **Taskbar** (RuneLite settings → Notification settings, or per notification in Idle Notifier). RuneLite then flashes its taskbar button when you go idle, which is what the key watches.
- **Time Tracking:** keep **Time Tracking** enabled. It learns your patches and bird houses when you visit them.

## How it works

- Each RuneLite window's title, `RuneLite - <name>`, tells the plugin which account is logged in where. A small helper program (`bin/osrs-helper-windows.exe`, built from `src/helper/RuneLiteWatcher.cs`) watches those windows, notices when one flashes for attention, and brings a window to the front.
- Time Tracking data is read from RuneLite's saved settings in `~/.runelite/profiles2`. RuneLite saves every 5 minutes and when it closes, so changes can take a few minutes to show up. Countdowns are absolute times, so they keep running while RuneLite is closed.
- Farming predictions are ported from RuneLite's Time Tracking plugin (BSD-2-Clause, Copyright (c) 2018 Abex and RuneLite contributors). The crop-stage tables in `src/farming-data.json` are exported from RuneLite with `tools/farming-data` (`gradlew run`), and should be re-exported when RuneLite adds new crops.

## Support

Found a bug or have an idea? [Open an issue](https://github.com/Ing-en/osrs-helper-streamdeck/issues).

## Licence

BSD-2-Clause. Third-party notices, including RuneLite's for the ported farming logic, are in
`com.ingen.osrs-helper.sdPlugin/THIRD-PARTY-NOTICES.txt`.

## Building

Requires Windows, Node.js 24 and Stream Deck 7.1 or newer. `npm run build` also compiles the window watcher (`src/helper/RuneLiteWatcher.cs`) with the C# compiler that comes with Windows.

```bash
npm install
npm run build
npx streamdeck link com.ingen.osrs-helper.sdPlugin
```

`npm run pack` creates `dist/com.ingen.osrs-helper.streamDeckPlugin` for distribution.
