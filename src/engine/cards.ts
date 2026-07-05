// A belot card is a 2-char string: rank + suit.
// Ranks (32-card deck): 7 8 9 T J Q K A     Suits: s h d c
export type Suit = "s" | "h" | "d" | "c";
export type Card = string; // e.g. "As", "9h", "Td"

export const RANKS = "789TJQKA"; // nominal ascending order (used for sequences)
export const SUITS: Suit[] = ["s", "h", "d", "c"];

export const SUIT_SYMBOL: Record<Suit, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function rankOf(c: Card): string {
  return c[0];
}
export function suitOf(c: Card): Suit {
  return c[1] as Suit;
}

// Belot has two valuations and two strength orders depending on trump.
// Card points:
const TRUMP_VALUE: Record<string, number> = { J: 20, "9": 14, A: 11, T: 10, K: 4, Q: 3, "8": 0, "7": 0 };
const PLAIN_VALUE: Record<string, number> = { A: 11, T: 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 };
// Trick-taking strength (higher beats lower within the same category):
const TRUMP_STRENGTH: Record<string, number> = { "7": 0, "8": 1, Q: 2, K: 3, T: 4, A: 5, "9": 6, J: 7 };
const PLAIN_STRENGTH: Record<string, number> = { "7": 0, "8": 1, "9": 2, J: 3, Q: 4, K: 5, T: 6, A: 7 };
// Natural sequence order (terca/kvarta/kvinta run by this, ace high, seven low):
export const SEQ_INDEX: Record<string, number> = { "7": 0, "8": 1, "9": 2, T: 3, J: 4, Q: 5, K: 6, A: 7 };

/** Card point value given the trump suit (Jack/Nine leap in trumps). */
export function cardValue(c: Card, trump: Suit | null): number {
  return trump && suitOf(c) === trump ? TRUMP_VALUE[rankOf(c)] : PLAIN_VALUE[rankOf(c)];
}

/**
 * Does `candidate` beat `current` on the table, given the led suit and trump?
 * Trumps beat non-trumps; within trumps or within the led suit, higher strength
 * wins; a card that is neither trump nor the led suit can never win.
 */
export function trickBeats(candidate: Card, current: Card, trump: Suit, led: Suit): boolean {
  const cT = suitOf(candidate) === trump;
  const curT = suitOf(current) === trump;
  if (cT !== curT) return cT; // a trump beats a non-trump
  if (cT && curT) return TRUMP_STRENGTH[rankOf(candidate)] > TRUMP_STRENGTH[rankOf(current)];
  const cL = suitOf(candidate) === led;
  const curL = suitOf(current) === led;
  if (cL !== curL) return cL; // following the led suit beats an off-suit discard
  if (cL && curL) return PLAIN_STRENGTH[rankOf(candidate)] > PLAIN_STRENGTH[rankOf(current)];
  return false; // neither trump nor led suit — cannot win
}

/** Trump strength index (for over-trump comparisons). */
export function trumpStrength(c: Card): number {
  return TRUMP_STRENGTH[rankOf(c)];
}
/** Plain (non-trump) strength index. */
export function plainStrength(c: Card): number {
  return PLAIN_STRENGTH[rankOf(c)];
}

/** The 32-card belot deck in canonical order. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(r + s);
    }
  }
  return deck;
}

/** Team index for a seat: seats 0 & 2 are team 0, seats 1 & 3 are team 1 (partners across). */
export function teamOf(seat: number): 0 | 1 {
  return (seat % 2) as 0 | 1;
}
