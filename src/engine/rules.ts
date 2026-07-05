import { plainStrength, suitOf, trickBeats, trumpStrength, type Card, type Suit } from "./cards";
import type { PlayedCard } from "./types";

/** The card currently winning the trick (and the seat that played it), or null if empty. */
export function currentWinner(trick: PlayedCard[], trump: Suit): PlayedCard | null {
  if (trick.length === 0) return null;
  const led = suitOf(trick[0].card);
  let best = trick[0];
  for (let i = 1; i < trick.length; i++) {
    if (trickBeats(trick[i].card, best.card, trump, led)) best = trick[i];
  }
  return best;
}

/** Seat that wins a complete (or partial) trick. */
export function trickWinnerSeat(trick: PlayedCard[], trump: Suit): number {
  return currentWinner(trick, trump)!.seat;
}

/**
 * The cards `hand` is allowed to play into the current trick, per the strict
 * belot obligations (follow suit + iber, else must trump + over-trump, else
 * discard). No partner-winning exception — you must always cut when you can.
 */
export function legalCards(hand: Card[], trick: PlayedCard[], trump: Suit): Card[] {
  if (trick.length === 0) return [...hand]; // leading — anything goes
  const led = suitOf(trick[0].card);
  const win = currentWinner(trick, trump)!;
  const winIsTrump = suitOf(win.card) === trump;
  const ledCards = hand.filter((c) => suitOf(c) === led);
  const trumpCards = hand.filter((c) => suitOf(c) === trump);

  if (led !== trump) {
    // A plain suit was led.
    if (ledCards.length > 0) {
      // Must follow suit. Must over-take (iber) unless a trump has already cut in.
      if (winIsTrump) return ledCards;
      const higher = ledCards.filter((c) => plainStrength(c) > plainStrength(win.card));
      return higher.length > 0 ? higher : ledCards;
    }
    // Can't follow: must trump if you hold one.
    if (trumpCards.length > 0) {
      if (winIsTrump) {
        const over = trumpCards.filter((c) => trumpStrength(c) > trumpStrength(win.card));
        return over.length > 0 ? over : trumpCards; // over-trump if able, else forced under-trump
      }
      return trumpCards; // first to cut — any trump
    }
    return [...hand]; // no led suit and no trump — discard anything
  }

  // Trump was led.
  if (trumpCards.length > 0) {
    const over = trumpCards.filter((c) => trumpStrength(c) > trumpStrength(win.card));
    return over.length > 0 ? over : trumpCards; // must follow trump and over-trump if able
  }
  return [...hand]; // no trump to follow with
}

export function isLegalPlay(hand: Card[], trick: PlayedCard[], trump: Suit, card: Card): boolean {
  return legalCards(hand, trick, trump).includes(card);
}
