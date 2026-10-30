# OSRS Idle Alert for Stream Deck

A Stream Deck key that flashes when your Old School RuneScape character goes idle, stops moving, leaves combat or is about to be logged out.

It needs the **Stream Deck Idle Alert** plugin from the RuneLite Plugin Hub ([source](https://github.com/Ingelberg/streamdeck-idle-alert)), which listens to RuneLite's Idle Notifier and writes its state to `~/.runelite/streamdeck-idle/state.json`.

## Using it

Drag **Idle Alert** onto a key. While you're idle it flashes red with a timer; the logout warning flashes orange and faster. Press the key to stop the flashing until the next alert and bring RuneLite to the front.

Settings per key: flash speed, and whether pressing it brings RuneLite to the front.

## Building

Requires Node.js 24 and Stream Deck 7.1 or newer.

```bash
npm install
npm run build
npx streamdeck link com.ingelberg.osrs-idle.sdPlugin
```

`npm run pack` creates `dist/com.ingelberg.osrs-idle.streamDeckPlugin` for distribution.
