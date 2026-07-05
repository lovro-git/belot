import { suitOf, teamOf, type Suit } from "./cards";
import { deal } from "./deal";
import { belaHolder, detectDeclarations, isBelaCard, resolveAnnounced } from "./declarations";
import { legalCards, trickWinnerSeat } from "./rules";
import { scoreHand } from "./scoring";
import type { BidChoice, Config, Declaration, GameState, HandState, Target } from "./types";

export function defaultConfig(target: Target = 1001): Config {
  return { target };
}

export function createGame(config: Config): GameState {
  return {
    config,
    seats: [null, null, null, null],
    scores: [0, 0],
    phase: "waiting",
    hand: null,
    handNumber: 0,
    firstDealer: -1,
    result: null,
    matchWinner: -1,
    matchStarted: false,
  };
}

export function isHandInProgress(s: GameState): boolean {
  return s.phase === "bidding" || s.phase === "declaring" || s.phase === "playing";
}

export function seatCount(s: GameState): number {
  return s.seats.filter(Boolean).length;
}

/** Seat a player into `preferred` (if free) or the first free seat. Returns the seat, or -1. */
export function seatPlayer(s: GameState, playerId: string, name: string, preferred?: number): number {
  const existing = s.seats.findIndex((x) => x?.playerId === playerId);
  if (existing >= 0) {
    s.seats[existing]!.name = name;
    return existing;
  }
  if (preferred != null && preferred >= 0 && preferred < 4 && !s.seats[preferred]) {
    s.seats[preferred] = { playerId, name };
    return preferred;
  }
  const free = s.seats.findIndex((x) => !x);
  if (free < 0) return -1;
  s.seats[free] = { playerId, name };
  return free;
}

/** Move a player to a specific empty seat — pre-match lobby only. */
export function chooseSeat(s: GameState, playerId: string, target: number): boolean {
  if (s.matchStarted || target < 0 || target >= 4) return false;
  if (s.seats[target] && s.seats[target]!.playerId !== playerId) return false; // taken
  const from = s.seats.findIndex((x) => x?.playerId === playerId);
  if (from === target) return true;
  const player = from >= 0 ? s.seats[from] : null;
  if (from >= 0) s.seats[from] = null;
  s.seats[target] = player ?? { playerId, name: playerId };
  return true;
}

/** Remove a player from their seat — pre-match lobby only (mid-match uses pause instead). */
export function removePlayer(s: GameState, playerId: string): void {
  if (s.matchStarted) return;
  const idx = s.seats.findIndex((x) => x?.playerId === playerId);
  if (idx >= 0) s.seats[idx] = null;
}

export function readyToStart(s: GameState): boolean {
  return !s.matchStarted && seatCount(s) === 4;
}

export function startMatch(s: GameState, rng: () => number = Math.random): void {
  if (!readyToStart(s)) return;
  s.matchStarted = true;
  s.scores = [0, 0];
  s.matchWinner = -1;
  s.firstDealer = Math.floor(rng() * 4);
  s.handNumber = 0;
  startHand(s, s.firstDealer, rng);
}

function biddingOrder(dealer: number): number[] {
  // First to the dealer's right, then around, dealer last (forced — "mus").
  return [(dealer + 1) % 4, (dealer + 2) % 4, (dealer + 3) % 4, dealer];
}

export function startHand(s: GameState, dealer: number, rng: () => number = Math.random): void {
  const hands = deal(rng);
  s.handNumber++;

  // "Belot": a full suit of 8 in one hand is an automatic match win.
  for (let seat = 0; seat < 4; seat++) {
    if (hands[seat].every((c) => suitOf(c) === suitOf(hands[seat][0]))) {
      s.matchWinner = teamOf(seat);
      s.phase = "matchOver";
      s.hand = null;
      return;
    }
  }

  const hand: HandState = {
    dealer,
    hands,
    revealed: false,
    trump: null,
    caller: -1,
    callerTeam: -1,
    bidOrder: biddingOrder(dealer),
    bidTurn: 0,
    passes: 0,
    turn: -1,
    leader: -1,
    currentTrick: [],
    tricks: [],
    trickWinners: [],
    declarations: [],
    declDecided: [],
    declResolved: false,
    declWinnerTeam: -1,
    declPoints: [0, 0],
    belaSeat: -1,
    belaShown: false,
  };
  s.hand = hand;
  s.phase = "bidding";
}

/** Whose seat is currently to act (bid or play), or -1. */
export function currentActor(s: GameState): number {
  const h = s.hand;
  if (!h) return -1;
  if (s.phase === "bidding") return h.bidOrder[h.bidTurn];
  if (s.phase === "declaring") return declActor(s);
  if (s.phase === "playing") return h.turn;
  return -1;
}

/** Is `seat` the forced dealer who cannot pass (everyone before them passed)? */
export function isForcedBidder(s: GameState): boolean {
  const h = s.hand;
  return !!h && s.phase === "bidding" && h.bidTurn === 3;
}

export function applyBid(s: GameState, seat: number, choice: BidChoice): boolean {
  const h = s.hand;
  if (!h || s.phase !== "bidding" || h.bidOrder[h.bidTurn] !== seat) return false;

  if (choice.type === "pass") {
    if (isForcedBidder(s)) return false; // dealer must call (mus)
    h.passes++;
    h.bidTurn++;
    return true;
  }
  finalizeTrump(s, seat, choice.suit);
  return true;
}

function finalizeTrump(s: GameState, seat: number, trump: Suit): void {
  const h = s.hand!;
  h.trump = trump;
  h.caller = seat;
  h.callerTeam = teamOf(seat);
  h.revealed = true; // the two hidden cards are now picked up
  h.belaSeat = belaHolder(h.hands, trump);

  // Detect every player's declarations, but none count until announced.
  const all: Declaration[] = [];
  for (let sd = 0; sd < 4; sd++) {
    const order = h.bidOrder.indexOf(sd);
    for (const d of detectDeclarations(h.hands[sd], sd, order)) all.push(d);
  }
  h.declarations = all;
  h.declDecided = [0, 1, 2, 3].map((sd) => !all.some((d) => d.seat === sd));
  h.declResolved = false;
  h.declWinnerTeam = -1;
  h.declPoints = [0, 0];

  if (all.length === 0) startPlay(s);
  else s.phase = "declaring";
}

/** Seat currently deciding whether to announce its zvanje, in bidding order (-1 if none). */
export function declActor(s: GameState): number {
  const h = s.hand;
  if (!h || s.phase !== "declaring" || h.declResolved) return -1;
  for (const seat of h.bidOrder) if (!h.declDecided[seat]) return seat;
  return -1;
}

/** A player with a zvanje announces it (announce=true) or keeps it hidden (false). */
export function applyDeclare(s: GameState, seat: number, announce: boolean): boolean {
  const h = s.hand;
  if (!h || s.phase !== "declaring" || declActor(s) !== seat) return false;
  h.declDecided[seat] = true;
  if (announce) for (const d of h.declarations) if (d.seat === seat) d.announced = true;

  if (declActor(s) === -1) {
    // Everyone has decided — resolve the winner from the announced zvanja.
    const r = resolveAnnounced(h.declarations);
    h.declWinnerTeam = r.winnerTeam;
    h.declPoints = r.points;
    if (h.declarations.some((d) => d.announced)) h.declResolved = true; // brief reveal before play
    else startPlay(s);
  }
  return true;
}

/** After the announced zvanja have been shown to everyone, begin trick play. */
export function beginPlay(s: GameState): boolean {
  const h = s.hand;
  if (!h || s.phase !== "declaring" || !h.declResolved) return false;
  startPlay(s);
  return true;
}

function startPlay(s: GameState): void {
  const h = s.hand!;
  h.leader = h.bidOrder[0];
  h.turn = h.leader;
  h.currentTrick = [];
  s.phase = "playing";
}

/** Legal cards for the acting seat during play (empty if it's not their turn). */
export function legalPlays(s: GameState, seat: number): string[] {
  const h = s.hand;
  if (!h || s.phase !== "playing" || h.turn !== seat) return [];
  return legalCards(h.hands[seat], h.currentTrick, h.trump!);
}

export function playCard(s: GameState, seat: number, card: string): boolean {
  const h = s.hand;
  if (!h || s.phase !== "playing" || h.turn !== seat) return false;
  if (!legalCards(h.hands[seat], h.currentTrick, h.trump!).includes(card)) return false;

  h.hands[seat] = h.hands[seat].filter((c) => c !== card);
  h.currentTrick.push({ seat, card });

  // Bela announcement: the first of the K/Q of trump held by the bela seat.
  if (!h.belaShown && seat === h.belaSeat && isBelaCard(card, h.trump!)) h.belaShown = true;

  if (h.currentTrick.length < 4) {
    h.turn = (seat + 1) % 4;
  } else {
    h.turn = -1; // trick complete — all four cards stay on the table until resolveTrick()
  }
  return true;
}

/** Is a completed 4-card trick sitting on the table, waiting to be gathered? */
export function trickPending(s: GameState): boolean {
  return s.phase === "playing" && !!s.hand && s.hand.currentTrick.length === 4;
}

/** Gather a completed trick to its winner (called after a short display pause). */
export function resolveTrick(s: GameState): boolean {
  if (!trickPending(s)) return false;
  const h = s.hand!;
  const winner = trickWinnerSeat(h.currentTrick, h.trump!);
  h.tricks.push(h.currentTrick);
  h.trickWinners.push(winner);
  h.currentTrick = [];

  if (h.tricks.length === 8) {
    finishHand(s);
  } else {
    h.leader = winner;
    h.turn = winner;
  }
  return true;
}

function finishHand(s: GameState): void {
  const h = s.hand!;
  const res = scoreHand(h);
  s.result = res;
  s.scores[0] += res.awarded[0];
  s.scores[1] += res.awarded[1];

  const winner = matchWinnerAfter(s);
  if (winner >= 0) {
    s.matchWinner = winner;
    s.phase = "matchOver";
  } else {
    s.phase = "handScored";
  }
}

/** Decide the match winner after a hand, honoring caller-priority on a double-cross. */
function matchWinnerAfter(s: GameState): 0 | 1 | -1 {
  const t = s.config.target;
  const a = s.scores[0] >= t;
  const b = s.scores[1] >= t;
  if (!a && !b) return -1;
  if (a && !b) return 0;
  if (b && !a) return 1;
  // Both crossed in the same hand.
  const res = s.result!;
  if (res.passed && s.scores[res.callerTeam] >= t) return res.callerTeam;
  if (s.scores[0] !== s.scores[1]) return s.scores[0] > s.scores[1] ? 0 : 1;
  return -1; // exact tie — play another hand
}

export function nextHand(s: GameState, rng: () => number = Math.random): void {
  if (s.phase !== "handScored" || !s.hand) return;
  const nextDealer = (s.hand.dealer + 1) % 4;
  startHand(s, nextDealer, rng);
}

export function rematch(s: GameState, rng: () => number = Math.random): void {
  if (!s.matchStarted) return;
  s.matchStarted = false;
  s.hand = null;
  s.result = null;
  s.matchWinner = -1;
  s.scores = [0, 0];
  s.phase = "waiting";
  startMatch(s, rng);
}
