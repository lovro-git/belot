import { cardValue, suitOf, SUITS, teamOf, trickBeats, type Card, type Suit } from "./cards";
import { currentWinner, legalCards } from "./rules";
import type { BidChoice, GameState } from "./types";

/** Rough strength of calling `suit` as trump, from the six visible cards. */
function suitStrength(visible: Card[], suit: Suit): number {
  let score = 0;
  for (const c of visible) {
    if (suitOf(c) === suit) {
      score += 3 + cardValue(c, suit) / 4; // trump values reward J/9/A
    } else if (c[0] === "A") {
      score += 4; // outside aces are strong on their own
    }
  }
  return score;
}

/** Decide a bid from the six visible cards; the forced dealer always calls its best suit. */
export function botBid(state: GameState, seat: number): BidChoice {
  const h = state.hand!;
  const visible = h.hands[seat].slice(0, 6);
  let best: Suit = "s";
  let bestScore = -1;
  for (const s of SUITS) {
    const sc = suitStrength(visible, s);
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  const forced = h.bidTurn === 3; // dealer must call (mus)
  if (forced || bestScore >= 22) return { type: "call", suit: best };
  return { type: "pass" };
}

/** Choose a legal card to play with a light trick-taking heuristic. */
export function botPlay(state: GameState, seat: number): Card {
  const h = state.hand!;
  const trump = h.trump!;
  const legal = legalCards(h.hands[seat], h.currentTrick, trump);
  const value = (c: Card) => cardValue(c, trump);
  const lowest = () => legal.reduce((a, b) => (value(a) <= value(b) ? a : b));
  const highest = () => legal.reduce((a, b) => (value(a) >= value(b) ? a : b));

  if (h.currentTrick.length === 0) {
    // Leading: cash a plain ace if we have one, otherwise lead low.
    const ace = legal.find((c) => c[0] === "A" && suitOf(c) !== trump);
    return ace ?? lowest();
  }

  const led = suitOf(h.currentTrick[0].card);
  const win = currentWinner(h.currentTrick, trump)!;
  const partnerWinning = teamOf(win.seat) === teamOf(seat);
  const winners = legal.filter((c) => trickBeats(c, win.card, trump, led));

  if (partnerWinning) return highest(); // feed points to our partner
  if (winners.length > 0) return winners.reduce((a, b) => (value(a) <= value(b) ? a : b)); // win cheaply
  return lowest(); // can't win — throw the cheapest
}
