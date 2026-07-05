// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { ClientView, PublicSeat } from "../net/protocol";
import type { HandResult } from "../engine/types";
import { renderLobby, renderTable, type TableHandlers, type UIState } from "./screens";

const noop = () => {};
const handlers: TableHandlers = {
  chooseSeat: noop,
  bid: noop,
  play: noop,
  start: noop,
  rematch: noop,
  copyLink: noop,
  leave: noop,
  rerender: noop,
};
const ui: UIState = { prevHand: 0, prevTrickCount: 0 };

function seat(name: string, i: number, over: Partial<PublicSeat> = {}): PublicSeat {
  return {
    playerId: "p" + i,
    name,
    team: (i % 2) as 0 | 1,
    connected: true,
    isDealer: false,
    isCaller: false,
    isActor: false,
    cards: 8,
    ...over,
  };
}

function baseView(over: Partial<ClientView> = {}): ClientView {
  return {
    you: "p0",
    yourSeat: 0,
    isHost: true,
    hostName: "A",
    config: { target: 1001 },
    phase: "waiting",
    scores: [0, 0],
    matchStarted: false,
    matchWinner: -1,
    handNumber: 0,
    seats: [seat("Ana", 0), seat("Bob", 1), seat("Cid", 2), seat("Dea", 3)],
    spectatorCount: 0,
    dealer: -1,
    trump: null,
    caller: -1,
    callerTeam: -1,
    actor: -1,
    forcedBid: false,
    yourHand: [],
    yourLegal: [],
    yourBela: false,
    currentTrick: [],
    leader: -1,
    tricksWon: [0, 0],
    handPoints: [0, 0],
    handThreshold: 0,
    lastTrickWinner: -1,
    declarations: [],
    declWinnerTeam: -1,
    declPoints: [0, 0],
    belaAnnouncedTeam: -1,
    result: null,
    disconnected: [],
    ...over,
  };
}

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
});

describe("renderLobby", () => {
  it("renders name input and create button", () => {
    renderLobby(root, "", "", { create: noop, join: noop });
    expect(root.querySelector(".lobby-card")).toBeTruthy();
    expect(root.querySelector("input.input")).toBeTruthy();
  });
});

describe("renderTable across phases", () => {
  it("waiting: shows seats and a start button for the host", () => {
    renderTable(root, baseView(), ui, handlers);
    expect(root.querySelectorAll(".pod").length).toBe(4);
    expect(root.querySelector(".deal-btn")).toBeTruthy();
  });

  it("bidding on your turn: four suit buttons + pass + 6 cards", () => {
    renderTable(
      root,
      baseView({
        matchStarted: true,
        phase: "bidding",
        dealer: 3,
        actor: 0,
        yourHand: ["As", "Ks", "9s", "7h", "8h", "Td"],
      }),
      ui,
      handlers,
    );
    expect(root.querySelectorAll(".bid-suit").length).toBe(4);
    expect(root.querySelector(".pass-btn")).toBeTruthy();
    expect(root.querySelectorAll(".hand-row .card").length).toBe(6);
  });

  it("playing on your turn: 8 cards with legal ones playable", () => {
    renderTable(
      root,
      baseView({
        matchStarted: true,
        phase: "playing",
        trump: "s",
        caller: 0,
        callerTeam: 0,
        actor: 0,
        yourHand: ["As", "Ks", "9s", "7h", "8h", "Td", "Jc", "Qc"],
        yourLegal: ["7h", "8h"],
        currentTrick: [{ seat: 3, card: "9h" }],
        tricksWon: [1, 2],
        handPoints: [28, 41],
        handThreshold: 82,
      }),
      ui,
      handlers,
    );
    expect(root.querySelectorAll(".hand-row .card").length).toBe(8);
    expect(root.querySelectorAll(".card--play").length).toBe(2);
    expect(root.querySelector(".trick-card")).toBeTruthy();
    expect(root.querySelector(".scoreboard")).toBeTruthy();
    // Live hand tally is shown for both teams, plus the caller's progress line.
    expect(root.querySelectorAll(".sb-hand").length).toBe(2);
    expect(root.querySelector(".sb-need")).toBeTruthy();
    // Opponents/partner show face-down fans (3 pods, not your own seat).
    expect(root.querySelectorAll(".pod-fan").length).toBe(3);
  });

  it("playing: renders all four cards of a completed trick", () => {
    renderTable(
      root,
      baseView({
        matchStarted: true,
        phase: "playing",
        trump: "s",
        actor: -1, // trick complete, being gathered
        yourHand: ["As"],
        currentTrick: [
          { seat: 0, card: "9h" },
          { seat: 1, card: "Ah" },
          { seat: 2, card: "7s" },
          { seat: 3, card: "8h" },
        ],
      }),
      ui,
      handlers,
    );
    expect(root.querySelectorAll(".trick-card").length).toBe(4);
  });

  it("handScored: shows the result banner", () => {
    const result: HandResult = {
      trump: "s",
      caller: 0,
      callerTeam: 0,
      cardPoints: [90, 72],
      declPoints: [20, 0],
      belaPoints: [0, 0],
      capot: -1,
      awarded: [110, 72],
      passed: true,
      threshold: 92,
      declWinnerTeam: 0,
      declarations: [],
    };
    renderTable(root, baseView({ matchStarted: true, phase: "handScored", result }), ui, handlers);
    expect(root.querySelector(".winner-banner.result")).toBeTruthy();
  });

  it("matchOver: winner banner + rematch for host", () => {
    renderTable(root, baseView({ matchStarted: true, phase: "matchOver", matchWinner: 0, scores: [1010, 640] }), ui, handlers);
    expect(root.querySelector(".winner-banner")).toBeTruthy();
    expect(root.querySelector(".rematch-btn")).toBeTruthy();
  });

  it("paused: shows the reconnect overlay when a seated player is gone", () => {
    renderTable(
      root,
      baseView({
        matchStarted: true,
        phase: "playing",
        trump: "s",
        seats: [seat("Ana", 0), seat("Bob", 1, { connected: false }), seat("Cid", 2), seat("Dea", 3)],
        disconnected: ["p1"],
        yourHand: ["As"],
      }),
      ui,
      handlers,
    );
    expect(root.querySelector(".pause-overlay")).toBeTruthy();
  });

  it("spectator: shows the spectator note", () => {
    renderTable(root, baseView({ yourSeat: -1, you: "pX", matchStarted: true, phase: "playing", trump: "s" }), ui, handlers);
    expect(root.querySelector(".wait-note")).toBeTruthy();
  });
});
