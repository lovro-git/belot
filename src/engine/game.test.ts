import { describe, expect, it } from "vitest";
import {
  applyBid,
  applyDeclare,
  beginPlay,
  createGame,
  currentActor,
  declActor,
  defaultConfig,
  isForcedBidder,
  isHandInProgress,
  legalPlays,
  nextHand,
  playCard,
  readyToStart,
  resolveTrick,
  seatPlayer,
  startMatch,
  trickPending,
} from "./game";
import type { GameState } from "./types";

// Deterministic RNG (mulberry32) for reproducible deals.
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seatFour(s: GameState) {
  seatPlayer(s, "p0", "A");
  seatPlayer(s, "p1", "B");
  seatPlayer(s, "p2", "C");
  seatPlayer(s, "p3", "D");
}

/** Bid: the first player calls ♠ (keeps deals deterministic and short). */
function bidFirstCallsSpades(s: GameState) {
  const actor = currentActor(s);
  expect(applyBid(s, actor, { type: "call", suit: "s" })).toBe(true);
}

/** Walk through the declaration phase: everyone announces, then play begins. */
function settleDeclarations(s: GameState) {
  let guard = 0;
  while (s.phase === "declaring" && guard++ < 10) {
    const a = declActor(s);
    if (a >= 0) applyDeclare(s, a, true);
    else beginPlay(s);
  }
}

/** Bid ♠ then clear any declarations, ending in the playing phase. */
function bidThenPlay(s: GameState) {
  bidFirstCallsSpades(s);
  settleDeclarations(s);
}

/** Play every card by always choosing the first legal move, until the hand resolves. */
function playOutHand(s: GameState) {
  let guard = 0;
  while (s.phase === "playing" && guard++ < 80) {
    if (trickPending(s)) {
      resolveTrick(s);
      continue;
    }
    const actor = currentActor(s);
    const legal = legalPlays(s, actor);
    expect(legal.length).toBeGreaterThan(0);
    expect(playCard(s, actor, legal[0])).toBe(true);
  }
}

describe("seating & match start", () => {
  it("needs exactly four players", () => {
    const s = createGame(defaultConfig(701));
    seatPlayer(s, "p0", "A");
    seatPlayer(s, "p1", "B");
    expect(readyToStart(s)).toBe(false);
    seatPlayer(s, "p2", "C");
    seatPlayer(s, "p3", "D");
    expect(readyToStart(s)).toBe(true);
  });

  it("starts a match into bidding", () => {
    const s = createGame(defaultConfig(1001));
    seatFour(s);
    startMatch(s, rng(1));
    expect(s.phase).toBe("bidding");
    expect(s.firstDealer).toBeGreaterThanOrEqual(0);
    expect(isHandInProgress(s)).toBe(true);
  });
});

describe("bidding — mus", () => {
  it("forces the dealer to call when everyone passes", () => {
    const s = createGame(defaultConfig(1001));
    seatFour(s);
    startMatch(s, rng(2));
    // Three passes.
    for (let i = 0; i < 3; i++) {
      const actor = currentActor(s);
      expect(applyBid(s, actor, { type: "pass" })).toBe(true);
    }
    // Fourth (dealer) is forced — cannot pass.
    expect(isForcedBidder(s)).toBe(true);
    const dealerActor = currentActor(s);
    expect(applyBid(s, dealerActor, { type: "pass" })).toBe(false);
    expect(applyBid(s, dealerActor, { type: "call", suit: "h" })).toBe(true);
    expect(["declaring", "playing"]).toContain(s.phase);
    expect(s.hand!.caller).toBe(s.hand!.dealer);
  });
});

describe("trick display pause", () => {
  it("keeps the completed trick on the table until resolveTrick", () => {
    const s = createGame(defaultConfig(1001));
    seatFour(s);
    startMatch(s, rng(3));
    bidThenPlay(s);
    for (let i = 0; i < 4; i++) {
      const a = currentActor(s);
      playCard(s, a, legalPlays(s, a)[0]);
    }
    // All four cards are still shown; nobody is to act yet.
    expect(trickPending(s)).toBe(true);
    expect(s.hand!.currentTrick.length).toBe(4);
    expect(currentActor(s)).toBe(-1);
    expect(s.hand!.tricks.length).toBe(0);
    // Gathering the trick advances to the winner.
    expect(resolveTrick(s)).toBe(true);
    expect(s.hand!.currentTrick.length).toBe(0);
    expect(s.hand!.tricks.length).toBe(1);
    expect(currentActor(s)).toBeGreaterThanOrEqual(0);
  });
});

describe("declaration phase", () => {
  it("enters declaring when a player holds a zvanje, then announces into play", () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = createGame(defaultConfig(1001));
      seatFour(s);
      startMatch(s, rng(seed));
      applyBid(s, currentActor(s), { type: "call", suit: "s" });
      if (s.phase === "declaring") {
        expect(declActor(s)).toBeGreaterThanOrEqual(0);
        expect(s.hand!.declarations.length).toBeGreaterThan(0);
        settleDeclarations(s);
        expect(s.phase).toBe("playing");
        // Announced declarations were scored to a team.
        expect(s.hand!.declPoints[0] + s.hand!.declPoints[1]).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error("no declaring phase found across seeds");
  });
});

describe("full hand flow", () => {
  it("plays 8 tricks, scores, and rotates the dealer", () => {
    const s = createGame(defaultConfig(1001));
    seatFour(s);
    startMatch(s, rng(3));
    const firstDealer = s.hand!.dealer;
    bidThenPlay(s);
    expect(s.phase).toBe("playing");
    playOutHand(s);

    expect(["handScored", "matchOver"]).toContain(s.phase);
    expect(s.hand!.tricks.length).toBe(8);
    expect(s.result).not.toBeNull();
    // Every card was played out of every hand.
    for (const h of s.hand!.hands) expect(h.length).toBe(0);
    // Points went somewhere and totals are sane.
    expect(s.scores[0] + s.scores[1]).toBeGreaterThan(0);

    if (s.phase === "handScored") {
      nextHand(s, rng(4));
      expect(s.hand!.dealer).toBe((firstDealer + 1) % 4);
      expect(s.phase).toBe("bidding");
    }
  });

  it("reaches a match winner within many hands", () => {
    const s = createGame(defaultConfig(501));
    seatFour(s);
    startMatch(s, rng(5));
    let guard = 0;
    while (s.phase !== "matchOver" && guard++ < 200) {
      if (s.phase === "bidding") bidFirstCallsSpades(s);
      if (s.phase === "declaring") settleDeclarations(s);
      if (s.phase === "playing") playOutHand(s);
      if (s.phase === "handScored") nextHand(s, rng(guard + 10));
    }
    expect(s.phase).toBe("matchOver");
    expect([0, 1]).toContain(s.matchWinner);
    expect(s.scores[s.matchWinner as 0 | 1]).toBeGreaterThanOrEqual(501);
  });
});
