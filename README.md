# Belot ♠ ♥ ♦ ♣

Serverless **Belot** — the Croatian trick-taking card game — that you play with
friends straight in the browser. One person creates a table and shares a
key/link; three others open it and play. No accounts, no backend, no database.
The whole app is a static site on GitHub Pages, and real-time play is relayed
peer-to-peer through a public message broker.

**Play:** open the deployed link → enter a name → **Napravi stol** (create) →
share the invite link. Three friends open it, pick their seats, and the host
starts the match. Or type the room key **`TEST`** to play a full table against
three bots.

---

## The game

Standard belot as played on tportal's playtoy, to the literal rules:

- **4 players, 2 fixed partnerships** — partners sit across (seats 0+2 vs 1+3).
  You pick and swap seats in the lobby; teams lock when the first hand is dealt.
- **32-card deck** (7 8 9 10 J Q K A) with belot's two valuations: in trumps the
  **Jack (20)** and **Nine (14)** leap to the top; off-trump it's A T K Q J.
- **Deal 6 + 2** — you bid trump seeing only 6 of your 8 cards; the last two are
  hidden even from you until trump is called (**zvanje aduta**, dealer forced on
  a full pass — *mus*).
- **Strict play obligations** — follow suit and over-take (*iber*), else you must
  trump and over-trump, else discard. No partner-winning exception.
- **Declarations** (zvanja): sequences 20/50/100, four-of-a-kind J=200/9=150/
  others=100 — only the team with the strongest declaration scores, all of it.
- **Bela** (K+Q of trump) = 20, announced when the first of the pair is played.
- **Scoring** — 162 per clean hand + last-trick 10; the calling team must reach
  more than half the points in play or it **falls (pao)** and the opponents take
  everything. **Štiglja** (all eight tricks) = +90. First team to **501 / 701 /
  1001** wins.

---

## Tech stack

| Concern    | Choice                                                             |
| ---------- | ------------------------------------------------------------------ |
| Language   | **TypeScript**, no UI framework — a tiny hand-rolled DOM builder   |
| Build      | **Vite** (ES modules, single static bundle)                        |
| Transport  | **MQTT over secure WebSocket** (MQTT.js) via a public broker       |
| Audio      | **Web Audio API** with bundled CC0 samples (no runtime network)    |
| i18n       | **Croatian** default, **English** toggle                          |
| Tests      | **Vitest** (+ jsdom render smoke test)                             |
| Hosting    | **GitHub Pages** via GitHub Actions                                |

The only production dependency is `mqtt`. Everything else — the belot engine,
rendering, theming, sound — is plain TypeScript.

---

## How it works

There is no server that owns the game. The app uses a **host-authority** model
over a public **MQTT** broker as a dumb message relay.

- **The host** is whoever created the room. Their browser runs the entire game
  engine and holds the shuffled deck.
- **Guests** publish intent — `join`, `chooseSeat`, `bid`, `play` — to the
  room's command topic.
- **The host** validates every command against the rules, advances the state
  machine, then publishes a **redacted view to each player's own topic**. Your
  view only ever contains **your own cards** — during bidding, only your six
  visible cards; the two hidden cards arrive when trump is set.
- **Disconnect pauses the match** for everyone until that player reconnects and
  reclaims their seat. Host state snapshots to `localStorage` between hands (no
  cards persisted), so a refresh resumes the match.

---

## Project structure

```
src/
  engine/        Pure belot logic — no DOM, no network (fully unit-tested)
    cards.ts       32-card deck, dual trump/plain values, trick comparison
    deal.ts        shuffle + deal 6 then 2
    declarations.ts sequences, four-of-a-kind, bela, tie-break
    rules.ts       legal-move ladder (follow/iber/trump/over-trump) + winner
    scoring.ts     162 + last-trick + declarations + bela + štiglja + pao
    game.ts        match/hand state machine (bidding, play, dealer rotation)
    bots.ts        TEST-room bot: bids and plays legally
    types.ts       shared domain types
  net/
    protocol.ts    commands + per-player redacted view builder
    room.ts        HostClient / GuestClient over MQTT
  ui/
    dom.ts, cards.ts, i18n.ts, sound.ts, screens.ts, styles.css
  main.ts        App wiring: identity, routing, client lifecycle, sound cues
  assets/sfx/    CC0 card sounds (Kenney)
```

The layering is strict: **`engine` knows nothing about the DOM or the network**.

---

## Develop

```bash
npm install
npm run dev        # local dev server
npm test           # engine + protocol + render unit tests (Vitest)
npm run build      # typecheck + production build to dist/
```

Open the dev URL and add `#room=TEST` to play a full table against bots.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which typechecks,
builds, and publishes `dist/` to GitHub Pages. Enable it once under
**Settings → Pages → Source: GitHub Actions**.

---

## Credits

Rules per [playtoy.tportal.hr](https://playtoy.tportal.hr/belot/rules/124).
Card art: **mađarice** (Hungarian Tell-pattern) from
[tomasdrus/hungarian-playing-cards](https://github.com/tomasdrus/hungarian-playing-cards) —
the Tell pattern design is public domain.
Sound effects: [Kenney "Casino Audio"](https://kenney.nl/assets/casino-audio)
(CC0). Fonts: Space Grotesk + Inter.
