import { describe, expect, it } from "vitest";
import { botBid, botPlay } from "../engine/bots";
import { applyBid, applyDeclare, beginPlay, createGame, currentActor, declActor, playCard, resolveTrick, seatPlayer, startMatch, trickPending } from "../engine/game";
import type { GameState } from "../engine/types";
import { viewFor, type ViewContext } from "./protocol";

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

function ctx(you: string): ViewContext {
  return { you, isHost: you === "p0", hostName: "A", connected: new Set(["p0", "p1", "p2", "p3"]), spectatorCount: 0 };
}

function newMatch(): GameState {
  const s = createGame({ target: 1001 });
  seatPlayer(s, "p0", "A");
  seatPlayer(s, "p1", "B");
  seatPlayer(s, "p2", "C");
  seatPlayer(s, "p3", "D");
  startMatch(s, rng(7));
  return s;
}

/** Clear the declaration phase (announce everything) to reach trick play. */
function settle(s: GameState) {
  let guard = 0;
  while (s.phase === "declaring" && guard++ < 10) {
    const a = declActor(s);
    if (a >= 0) applyDeclare(s, a, true);
    else beginPlay(s);
  }
}

describe("viewFor redaction", () => {
  it("hides the two face-down cards during bidding (you see only 6)", () => {
    const s = newMatch();
    expect(s.phase).toBe("bidding");
    for (let seat = 0; seat < 4; seat++) {
      const view = viewFor(s, ctx("p" + seat));
      expect(view.yourHand.length).toBe(6);
    }
  });

  it("reveals all 8 cards once trump is called, but never opponents' cards", () => {
    const s = newMatch();
    const bidder = currentActor(s);
    applyBid(s, bidder, { type: "call", suit: "s" }); // force trump
    settle(s);
    expect(s.phase).toBe("playing");

    const mine = viewFor(s, ctx("p0"));
    expect(mine.yourHand.length).toBe(8);
    expect(mine.trump).toBe("s");
    // The view never carries anyone else's hand — only your own.
    expect(Object.keys(mine)).not.toContain("hands");
    expect(mine.seats.every((seat) => !seat || !("holeCards" in seat))).toBe(true);
  });

  it("a spectator sees no hand and the public trick is identical for everyone", () => {
    const s = newMatch();
    applyBid(s, currentActor(s), { type: "call", suit: "h" });
    settle(s);
    // Play one card.
    const actor = currentActor(s);
    playCard(s, actor, botPlay(s, actor));

    const spectator = viewFor(s, ctx("pX"));
    expect(spectator.yourSeat).toBe(-1);
    expect(spectator.yourHand.length).toBe(0);
    expect(spectator.currentTrick.length).toBe(1);
    // The trick is public: same cards for a seated player and a spectator.
    expect(viewFor(s, ctx("p0")).currentTrick).toEqual(spectator.currentTrick);
  });

  it("drives a full bot hand end-to-end through the view pipeline", () => {
    const s = newMatch();
    let guard = 0;
    while ((s.phase === "bidding" || s.phase === "declaring" || s.phase === "playing") && guard++ < 90) {
      if (trickPending(s)) {
        resolveTrick(s);
        continue;
      }
      if (s.phase === "declaring") {
        settle(s);
        continue;
      }
      const actor = currentActor(s);
      if (s.phase === "bidding") applyBid(s, actor, botBid(s, actor));
      else playCard(s, actor, botPlay(s, actor));
      // Every step must still produce a valid view for each player.
      for (let seat = 0; seat < 4; seat++) expect(() => viewFor(s, ctx("p" + seat))).not.toThrow();
    }
    expect(["handScored", "matchOver"]).toContain(s.phase);
    expect(s.result).not.toBeNull();
  });
});
