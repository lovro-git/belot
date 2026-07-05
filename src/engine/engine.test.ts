import { describe, expect, it } from "vitest";
import { cardValue, fullDeck, teamOf, trickBeats, type Card } from "./cards";
import { legalCards, trickWinnerSeat } from "./rules";
import { belaHolder, detectDeclarations, resolveAnnounced, resolveDeclarations } from "./declarations";
import type { Declaration } from "./types";
import { scoreHand } from "./scoring";
import type { HandState, PlayedCard } from "./types";

describe("card values", () => {
  it("values trumps high (J=20, 9=14) and plain suits normally", () => {
    expect(cardValue("Js", "s")).toBe(20);
    expect(cardValue("9s", "s")).toBe(14);
    expect(cardValue("As", "s")).toBe(11);
    expect(cardValue("Ts", "s")).toBe(10);
    expect(cardValue("Js", "h")).toBe(2); // jack is weak off-trump
    expect(cardValue("9h", "s")).toBe(0);
  });
  it("total deck card points sum to 152", () => {
    // With ♠ trump: three plain suits contribute 30 each (90) + trump suit 62 = 152.
    const total = fullDeck().reduce((n, c) => n + cardValue(c, "s"), 0);
    expect(total).toBe(152);
  });
});

describe("trickBeats", () => {
  it("trump beats non-trump; higher trump beats lower", () => {
    expect(trickBeats("7s", "Ah", "s", "h")).toBe(true); // trump beats plain ace
    expect(trickBeats("Js", "9s", "s", "s")).toBe(true); // J is top trump
    expect(trickBeats("9s", "Js", "s", "s")).toBe(false);
  });
  it("off-suit non-led card cannot win", () => {
    expect(trickBeats("Ad", "7h", "s", "h")).toBe(false); // diamonds neither led nor trump
    expect(trickBeats("Ah", "Kh", "s", "h")).toBe(true); // higher of led suit
  });
});

const trick = (...cs: Array<[number, Card]>): PlayedCard[] => cs.map(([seat, card]) => ({ seat, card }));

describe("legalCards — following suit & iber", () => {
  it("must follow suit and over-take when able", () => {
    expect(legalCards(["Ah", "7h", "Ks"], trick([0, "9h"]), "s")).toEqual(["Ah"]);
  });
  it("plays any led-suit card when unable to beat it", () => {
    expect(legalCards(["7h", "8h", "Ks"], trick([0, "Ah"]), "s").sort()).toEqual(["7h", "8h"]);
  });
  it("waives iber once a trump has cut the trick", () => {
    expect(legalCards(["Ah", "9h"], trick([0, "Kh"], [1, "7s"]), "s").sort()).toEqual(["9h", "Ah"]);
  });
});

describe("legalCards — trumping when void", () => {
  it("must cut when void in the led suit", () => {
    expect(legalCards(["7s", "8c", "Ac"], trick([0, "Kh"]), "s")).toEqual(["7s"]);
  });
  it("must over-trump when a trump is already down", () => {
    expect(legalCards(["9s", "7s", "Ac"], trick([0, "Kh"], [1, "8s"]), "s")).toEqual(["9s"]);
  });
  it("forces an under-trump when it cannot over-trump (no discard)", () => {
    expect(legalCards(["7s", "8s", "Ac"], trick([0, "Kh"], [1, "Js"]), "s").sort()).toEqual(["7s", "8s"]);
  });
  it("discards freely only when holding no trump", () => {
    expect(legalCards(["Ac", "7d"], trick([0, "Kh"], [1, "Js"]), "s").sort()).toEqual(["7d", "Ac"]);
  });
});

describe("legalCards — trump led", () => {
  it("must over-trump the led trump when able", () => {
    expect(legalCards(["As", "7s", "Kh"], trick([0, "Ks"]), "s")).toEqual(["As"]);
  });
  it("plays anything with no trump", () => {
    expect(legalCards(["Ah", "7d"], trick([0, "Ks"]), "s").sort()).toEqual(["7d", "Ah"]);
  });
  it("leading allows any card", () => {
    expect(legalCards(["Ah", "7d", "Ks"], [], "s").sort()).toEqual(["7d", "Ah", "Ks"]);
  });
});

describe("trickWinnerSeat", () => {
  it("highest trump wins a cut trick", () => {
    expect(trickWinnerSeat(trick([0, "9h"], [1, "Ah"], [2, "7s"], [3, "8s"]), "s")).toBe(3);
  });
  it("highest of led suit wins an un-cut trick", () => {
    expect(trickWinnerSeat(trick([0, "Ah"], [1, "Th"], [2, "Kh"], [3, "7c"]), "s")).toBe(0);
  });
});

describe("declarations", () => {
  it("detects four of a kind with correct points", () => {
    const d = detectDeclarations(["Js", "Jh", "Jd", "Jc", "7s", "8s", "9s", "Ac"], 0, 0);
    expect(d.find((x) => x.kind === "four")?.points).toBe(200);
  });
  it("detects a kvarta (4-run) as 50", () => {
    const d = detectDeclarations(["7s", "8s", "9s", "Ts", "Ah", "Kh", "Qc", "Jc"], 0, 0);
    const seq = d.find((x) => x.kind === "seq4");
    expect(seq?.points).toBe(50);
    expect(seq?.cards.length).toBe(4);
  });
  it("does not count a broken run", () => {
    const d = detectDeclarations(["7s", "8s", "Ts", "Js", "Ah", "Kh", "Qc", "9d"], 0, 0);
    expect(d.some((x) => x.kind.startsWith("seq"))).toBe(false);
  });
  it("resolves ties by earliest bidding order", () => {
    const hands = [
      ["7s", "8s", "9s", "Ah", "Kh", "Qc", "Jc", "Td"], // seat 0: terca ♠
      ["7h", "8h", "9h", "Ac", "Kc", "Qd", "Jd", "Ts"], // seat 1: terca ♥
      ["7c", "8c", "Ad", "Kd", "Qs", "Jh", "Th", "9d"],
      ["Js", "Ks", "As", "Qh", "7d", "8d", "9c", "Tc"], // seat 3: no declarations
    ];
    // dealer = 3 → bidOrder [0,1,2,3]; seat 0 earlier than seat 1.
    const r = resolveDeclarations(hands, [0, 1, 2, 3], "d");
    expect(r.winnerTeam).toBe(teamOf(0));
    expect(r.points[teamOf(0)]).toBe(20);
    // Same hands, but seat 1 gets the earlier right.
    const r2 = resolveDeclarations(hands, [1, 0, 3, 2], "d");
    expect(r2.winnerTeam).toBe(teamOf(1));
  });
  it("resolves only announced declarations", () => {
    const d = (seat: number, points: number, order: number, announced: boolean): Declaration => ({ seat, kind: "seq3", points, order, cards: [], announced });
    // Only seat 0's is announced → team 0 wins with 20 even though seat 1's is bigger.
    expect(resolveAnnounced([d(0, 20, 0, true), d(1, 50, 1, false)])).toEqual({ winnerTeam: 0, points: [20, 0] });
    // Both announced → the bigger (seat 1) wins.
    expect(resolveAnnounced([d(0, 20, 0, true), d(1, 50, 1, true)])).toEqual({ winnerTeam: 1, points: [0, 50] });
    // Equal points → earlier bidding order (seat 0) wins.
    expect(resolveAnnounced([d(0, 20, 0, true), d(1, 20, 1, true)])).toEqual({ winnerTeam: 0, points: [20, 0] });
    // Nothing announced → no winner.
    expect(resolveAnnounced([d(0, 20, 0, false)])).toEqual({ winnerTeam: -1, points: [0, 0] });
  });
  it("finds bela (K+Q of trump in one hand)", () => {
    expect(belaHolder([["Ks", "Qs", "7h", "8h", "9h", "Ac", "Kc", "Qc"], [], [], []], "s")).toBe(0);
    expect(belaHolder([["Ks", "Qh", "7h", "8h", "9h", "Ac", "Kc", "Qc"], [], [], []], "s")).toBe(-1);
  });
});

// --- Scoring -------------------------------------------------------------

function chunkedTricks(): { tricks: PlayedCard[][]; winners: number[] } {
  const deck = fullDeck();
  const tricks: PlayedCard[][] = [];
  for (let i = 0; i < 8; i++) {
    tricks.push(deck.slice(i * 4, i * 4 + 4).map((card, k) => ({ seat: k, card })));
  }
  return { tricks, winners: [] };
}

function makeHand(winners: number[], callerTeam: 0 | 1, extra: Partial<HandState> = {}): HandState {
  const { tricks } = chunkedTricks();
  return {
    dealer: 3,
    hands: [[], [], [], []],
    revealed: true,
    trump: "s",
    caller: callerTeam,
    callerTeam,
    bidOrder: [0, 1, 2, 3],
    bidTurn: 0,
    passes: 0,
    turn: -1,
    leader: 0,
    currentTrick: [],
    tricks,
    trickWinners: winners,
    declarations: [],
    declDecided: [true, true, true, true],
    declResolved: true,
    declWinnerTeam: -1,
    declPoints: [0, 0],
    belaSeat: -1,
    belaShown: false,
    ...extra,
  };
}

describe("scoreHand", () => {
  it("card points across a hand always total 162", () => {
    const res = scoreHand(makeHand([0, 1, 0, 1, 0, 1, 0, 1], 0));
    expect(res.cardPoints[0] + res.cardPoints[1]).toBe(162);
  });
  it("štiglja: sweeping all tricks pays +90 and passes", () => {
    const res = scoreHand(makeHand([0, 0, 0, 0, 0, 0, 0, 0], 0));
    expect(res.capot).toBe(0);
    expect(res.passed).toBe(true);
    expect(res.awarded).toEqual([252, 0]); // 162 + 90
  });
  it("pao: caller wins nothing when the opponents take everything", () => {
    const res = scoreHand(makeHand([0, 0, 0, 0, 0, 0, 0, 0], 1)); // team1 called, team0 swept
    expect(res.passed).toBe(false);
    expect(res.awarded).toEqual([252, 0]); // opponents (team0) get 162 + 90 capot
  });
  it("declarations and bela raise the total and the threshold", () => {
    const res = scoreHand(
      makeHand([0, 1, 0, 1, 0, 1, 0, 1], 0, {
        declPoints: [20, 0],
        declWinnerTeam: 0,
        belaSeat: 0, // team 0 holds bela → +20
      }),
    );
    // total in play = 162 + 20 + 20 = 202 → threshold = 102
    expect(res.threshold).toBe(102);
    expect(res.belaPoints).toEqual([20, 0]);
  });
});
