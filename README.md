# Blef

A browser-based Polish bluffing card game (liar's poker with a shared community table),
played in real time with friends. Bid a count of a rank, convince the table you are right —
or call "SPRAWDZAM!" and expose the bluffer.

## How it plays

- Everyone starts with **2 cards**; the hand grows as you lose checks (2 → 6).
- Every **full rotation** of bids flips **3 face-up cards** onto the table — they count
  towards the pool together with all active hands.
- A **check** flips the final **5 cards**, counts the rank and punishes the wrong side:
  the loser draws **+1 card**, losing with **6 cards is an elimination**.
- The last player at the table wins the game. Round 1 starts with a random player,
  later rounds start with the previous loser.
- **Jokers are wild** and count as any rank.
- Bids: raise the count (3×7 > 2×A) or keep the count and raise the rank (2×K > 2×Q).
  Max bid is **6×** with one deck and **12×** with two decks.

## Tech stack

| Part    | Tech                                                    |
|---------|---------------------------------------------------------|
| Client  | React + Vite + Tailwind CSS                             |
| Server  | Express + Socket.io (ESM)                               |
| Engine  | `client/src/lib/game.js` — **shared** by client & server |
| Tests   | `client/test-engine.mjs` (Node, no dependencies)         |

The server is authoritative: it runs the shared engine and sends every player a
sanitized snapshot (`snapshot(room, pid)`), so nobody ever sees an opponent's hand.
Actions travel over `emitAck` (ack + timeout); the client renders server snapshots.

## Run locally

```bash
# client
cd client
npm install
npm run dev          # http://localhost:5173

# server (separate terminal)
cd server
npm install
npm start            # http://localhost:3001
```

Production build:

```bash
cd client && npm run build   # outputs to dist/ (server's static root)
cd server && npm start       # serves the built client + the socket API on :3001
```

> **Updating a live server (important):** `dist/` is gitignored, so `git pull`
> alone changes NOTHING on the site - it only updates the source. After every
> pull you must rebuild the client and restart the server:
>
> ```bash
> git pull
> npm --prefix client ci     # devDependencies are needed for the Vite build
> npm run build              # creates a fresh dist/
> # restart the node process (pm2/systemd/service or just node server/index.js)
> ```
>
> Then hard-refresh the browser (Ctrl+F5) so it drops the cached `index.html`.
> The build is served both from `/` and from `/blef/` (the Socket.io path is
> `/blef/socket.io`), so it works behind a reverse-proxy subpath as well.

Engine tests:

```bash
cd client && node test-engine.mjs
```

Docker (builds the client and packages it with the server in one image):

```bash
git pull
docker compose up -d             # http://localhost:3001
```

> **Docker updates:** `docker-compose.yml` sets `pull_policy: build`, so a plain
> `docker compose up -d` **rebuilds the image every time** - after `git pull` the
> new code is picked up automatically (requires Docker Compose v2.22+; check with
> `docker compose version`). On older Compose versions the setting is rejected,
> use `docker compose up -d --build` instead.

## Structure

```
client/
  src/lib/game.js        shared game engine (bidding, checks, rounds, AI)
  src/lib/socket.js      one shared socket + emitAck helper
  src/screens/           Landing, Lobby, Game
  src/components/        PlayingCard, BidGrid, CheckOverlay, History, HelpModal, …
  test-engine.mjs        engine tests
server/
  index.js               Express + Socket.io: rooms, seats, snapshots, timers
```

## Features

- Password-protected tables, shareable code/link, fixed seat grids (5 seats / 1 deck,
  10 seats / 2 decks)
- Emoji avatar + nickname (max 14 characters)
- Customizable card backs (presets or your own image), card face styles, icon sets and
  table themes — all personal: stored locally per player, everyone renders the table
  their own way, and any of it can be switched **live mid-game** from the gear menu
- Uploaded card decks: pick a whole folder (or a ZIP) of card images named like
  QS.svg / 10H.png / AS.svg / joker.svg in settings — purely a personal view (no
  server upload), missing cards fall back to the standard fronts
- Turn alert (opt-in): a soft chime when the turn comes to you while the window is in
  the background, plus a flashing favicon + tab title so the taskbar shows it too
- Quick rejoin: the main menu lands on "Stwórz stół" with the last table's code and
  password prefilled in the join tab, and a `?room=CODE` invite link joins the table
  automatically (nick, avatar and seat remembered)
- Staged check-reveal overlay: first the hands and the table cards fit on screen with no
  scrolling, then the counting and the verdict stage; the loser clicks "Następna runda"
  (10 s auto-advance otherwise)
- Responsive layout: on phones the card fan is replaced with a count badge, the own
  hand collapses to the card tops (tap to expand) and the table collapses into a
  clickable pile sooner
- Scales with the screen: the root font size grows on large/ultrawide monitors
  (rem-based cards, avatars and the bid grid scale together), pixel math follows via
  `uiScale()`, and the table automatically switches to bigger cards when there is room
- Accessibility options (per player, stored locally): popup showing the cards revealed
  after a full rotation, highlight ring around the checked rank, reduced motion and a
  manual interface scale (Auto / 100% / 125% / 150%)
- Natural bots: they bid figures they actually hold (jokers count as wild, a small +1
  bluff now and then), check when a claim looks thin instead of constantly, and never
  push absurd counts without a reason — each bot has a stable temperament
- The host fills empty seats with bots (server-driven AI); every human joins by code/link
  (only the deck count 1/2 is a host setting — it changes seats and the bid limit)
- "Kupka" pile mode: batch the table rows while they fit and keep a readable pile
  (tap a card to pop it up), or spread the cards left to right showing their corners
- Rejoin that always syncs: a reload or reconnect drops you back into your seat (stored
  seat token), the same nickname + table code takes the seat back from any device
  (password tables still demand the password), reconnects have no attempt cap, and
  whoever leaves mid-game has the AI play their seat until they return — the others
  just keep playing
- Leaving a table always releases the seat server-side, and a waiting table left with
  only bots is cleaned up; a finished game lingers 90 s so everyone can read the result
