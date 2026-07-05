import { fullDeck, type Card } from "./cards";

/**
 * Fisher-Yates shuffle with an injectable RNG so hands can be dealt
 * deterministically in tests; defaults to Math.random for live play.
 */
export function shuffledDeck(rng: () => number = Math.random): Card[] {
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Deal the belot way: 6 cards then 2 to each of the 4 seats (8 total each).
 * Returns four 8-card hands; indices 6–7 are the two face-down cards that stay
 * hidden — even from their owner — until trump is called.
 */
export function deal(rng: () => number = Math.random): Card[][] {
  const deck = shuffledDeck(rng);
  const hands: Card[][] = [[], [], [], []];
  let k = 0;
  for (let seat = 0; seat < 4; seat++) for (let n = 0; n < 6; n++) hands[seat].push(deck[k++]);
  for (let seat = 0; seat < 4; seat++) for (let n = 0; n < 2; n++) hands[seat].push(deck[k++]);
  return hands;
}
