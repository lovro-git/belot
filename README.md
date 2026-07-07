# Belot ♠ ♥ ♦ ♣

Serverless **Belot** — the Croatian trick-taking card game — played with friends straight in
the browser. No accounts, no backend, no database. One person creates a table and shares a
link; three others open it and play. The whole app is a static site on GitHub Pages, with
real-time play relayed peer-to-peer through a public message broker.

**Play:** open the link → enter a name → **Napravi stol** (create) → share the invite link.
Three friends open it, pick seats, and the host starts the match. Or type the room key
**`TEST`** to play a full table against three bots.

## The game

Standard belot as played on tportal's playtoy, to the literal rules:

- **4 players, 2 fixed partnerships** — partners sit across (0+2 vs 1+3); pick and swap
  seats in the lobby, teams lock on the first deal.
- **32-card deck** with two valuations: in trumps the **Jack (20)** and **Nine (14)** top
  the order; off-trump it's A T K Q J.
- **Deal 6 + 2** — bid trump seeing only 6 of your 8 cards (*zvanje aduta*, dealer forced on
  a full pass — *mus*); the last two arrive once trump is set.
- **Strict play** — follow suit and over-take (*iber*), else trump and over-trump, else
  discard. No partner-winning exception.
- **Declarations** (*zvanja*): sequences 20/50/100 and four-of-a-kind J=200/9=150/others=100
  — only the strongest team's declarations score. **Bela** (K+Q of trump) = 20.
- **Scoring** — 162 per hand + 10 for the last trick; the calling team must take more than
  half the points or it **falls (*pao*)** and opponents take everything. **Štiglja** (all
  eight tricks) = +90. First team to **501 / 701 / 1001** wins.

## How it works

There's no server that owns the game. The app uses a **host-authority** model over a public
**MQTT** broker as a dumb message relay:

- **The host** (whoever created the room) runs the entire game engine and holds the deck.
- **Guests** publish intent — `join`, `chooseSeat`, `bid`, `play` — to the room's command
  topic.
- **The host** validates each command, advances the state machine, then publishes a
  **redacted view to each player** — you only ever see your own cards (during bidding, only
  your six visible cards; the hidden two arrive when trump is set).
- **Disconnect pauses the match** until that player reconnects and reclaims their seat.
  State snapshots to `localStorage` between hands (no cards persisted), so a refresh resumes.

## Tech stack

**TypeScript** with no UI framework (a tiny hand-rolled DOM builder), built with **Vite**
into a single static bundle. Transport is **MQTT over WebSocket** (`mqtt` — the only
production dependency); audio is the **Web Audio API** with bundled CC0 samples; UI is
**Croatian** by default with an **English** toggle; tests run on **Vitest**; hosting is
**GitHub Pages** via GitHub Actions.

The layering is strict — `engine/` (pure belot logic) knows nothing about the DOM or network.

```
src/
  engine/   cards (dual values, trick compare), deal (6 then 2), declarations, rules
            (legal-move ladder + winner), scoring, game (match state machine), bots, types
  net/      protocol.ts (commands + redacted views), room.ts (HostClient/GuestClient over MQTT)
  ui/       dom, cards, i18n, sound, screens (lobby/join/table), styles.css
  main.ts   app wiring: identity, routing, client lifecycle, sound cues
```

## Develop

```bash
npm install
npm run dev      # local dev server
npm test         # engine + protocol + render tests (Vitest)
npm run build    # typecheck + production build to dist/
```

Add `#room=TEST` to the dev URL to play a full table against bots. Pushing to `main` triggers
`.github/workflows/deploy.yml`, which typechecks, builds, and publishes to GitHub Pages
(enable once under **Settings → Pages → Source: GitHub Actions**).

## Credits

Rules per [playtoy.tportal.hr](https://playtoy.tportal.hr/belot/rules/124). Card art:
**mađarice** (Hungarian Tell-pattern) from
[tomasdrus/hungarian-playing-cards](https://github.com/tomasdrus/hungarian-playing-cards)
(public domain). Sound effects: [Kenney "Casino Audio"](https://kenney.nl/assets/casino-audio)
(CC0). Fonts: Space Grotesk + Inter.
