import type { Card, Suit } from "./cards";

export type Target = 501 | 701 | 1001;

export interface Config {
  target: Target;
}

/**
 * waiting     – not 4 players yet, or match not started (lobby / seat picking)
 * bidding     – zvanje aduta: players call trump or pass
 * playing     – trick play
 * handScored  – a hand finished; result populated; pause before the next deal
 * matchOver   – a team reached the target score
 */
export type Phase = "waiting" | "bidding" | "playing" | "handScored" | "matchOver";

export interface Seat {
  playerId: string;
  name: string;
}

export interface PlayedCard {
  seat: number;
  card: Card;
}

export type DeclKind = "seq3" | "seq4" | "seq5" | "four";

export interface Declaration {
  seat: number;
  kind: DeclKind;
  points: number;
  cards: Card[];
  /** Position in the bidding order (0 = first to the dealer's right), for tie-breaks. */
  order: number;
}

export interface HandState {
  dealer: number;
  /** Full 8-card hands (host secret). Indices 6–7 are the two face-down cards. */
  hands: Card[][];
  /** False during bidding (only 6 cards known to each player), true once trump is set. */
  revealed: boolean;
  trump: Suit | null;
  caller: number; // seat that called trump (-1 until set)
  callerTeam: 0 | 1 | -1;
  bidOrder: number[]; // seat indices, first to the dealer's right … dealer last
  bidTurn: number; // index into bidOrder whose turn it is to bid
  passes: number; // how many consecutive passes so far this bidding

  // Trick play
  turn: number; // seat to act (-1 if not in play)
  leader: number; // seat leading the current trick
  currentTrick: PlayedCard[];
  tricks: PlayedCard[][]; // completed tricks, in order
  trickWinners: number[]; // winning seat of each completed trick (parallel to tricks)

  // Declarations & bela (resolved once trump is set)
  declarations: Declaration[];
  declWinnerTeam: 0 | 1 | -1;
  declPoints: [number, number];
  belaSeat: number; // seat holding K+Q of trump (-1 if none)
  belaShown: boolean; // has the holder played the first of the pair yet
}

export interface HandResult {
  trump: Suit;
  caller: number;
  callerTeam: 0 | 1;
  /** Card points from tricks (incl. last-trick +10), per team. */
  cardPoints: [number, number];
  declPoints: [number, number];
  belaPoints: [number, number];
  capot: 0 | 1 | -1; // team that took all 8 tricks, or -1
  /** Final points awarded to each team this hand (after contract / pao). */
  awarded: [number, number];
  passed: boolean; // did the calling team make its contract
  threshold: number;
  declWinnerTeam: 0 | 1 | -1;
  declarations: Declaration[];
}

export interface GameState {
  config: Config;
  seats: Array<Seat | null>; // length 4
  scores: [number, number]; // match totals: team 0 (seats 0,2), team 1 (seats 1,3)
  phase: Phase;
  hand: HandState | null;
  handNumber: number;
  firstDealer: number; // -1 until the match starts
  result: HandResult | null; // most recent hand's breakdown, for display
  matchWinner: 0 | 1 | -1;
  matchStarted: boolean;
}

export type BidChoice = { type: "call"; suit: Suit } | { type: "pass" };
