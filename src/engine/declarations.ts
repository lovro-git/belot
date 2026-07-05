import { rankOf, SEQ_INDEX, suitOf, SUITS, teamOf, type Card, type Suit } from "./cards";
import type { Declaration } from "./types";

const FOUR_POINTS: Record<string, number> = { J: 200, "9": 150, A: 100, T: 100, K: 100, Q: 100 };

function seqPoints(len: number): number {
  if (len >= 5) return 100;
  if (len === 4) return 50;
  return 20; // len === 3
}

/** All declarations (sequences + four-of-a-kind) in a single 8-card hand. */
export function detectDeclarations(hand: Card[], seat: number, order: number): Declaration[] {
  const out: Declaration[] = [];

  // Four of a kind — only J/9/A/T/K/Q score (four 7s/8s are worth nothing).
  const byRank = new Map<string, Card[]>();
  for (const c of hand) {
    const r = rankOf(c);
    (byRank.get(r) ?? byRank.set(r, []).get(r)!).push(c);
  }
  for (const [r, cards] of byRank) {
    if (cards.length === 4 && FOUR_POINTS[r]) {
      out.push({ seat, order, kind: "four", points: FOUR_POINTS[r], cards: [...cards], announced: false });
    }
  }

  // Sequences — maximal same-suit runs of length ≥ 3 by natural rank order.
  for (const s of SUITS) {
    const inSuit = hand.filter((c) => suitOf(c) === (s as Suit)).sort((a, b) => SEQ_INDEX[rankOf(a)] - SEQ_INDEX[rankOf(b)]);
    let run: Card[] = [];
    const flush = () => {
      if (run.length >= 3) {
        const len = run.length;
        out.push({ seat, order, kind: len >= 5 ? "seq5" : len === 4 ? "seq4" : "seq3", points: seqPoints(len), cards: [...run], announced: false });
      }
      run = [];
    };
    for (const c of inSuit) {
      if (run.length === 0 || SEQ_INDEX[rankOf(c)] === SEQ_INDEX[rankOf(run[run.length - 1])] + 1) run.push(c);
      else {
        flush();
        run.push(c);
      }
    }
    flush();
  }

  return out;
}

export interface DeclResolution {
  declarations: Declaration[];
  winnerTeam: 0 | 1 | -1;
  points: [number, number];
}

/**
 * Resolve zvanja across all four hands. Only the team holding the single
 * strongest declaration scores — and it scores ALL of its declarations. Ties on
 * points go to the team whose player had the earlier right to call trump
 * (earliest position in the bidding order).
 */
export function resolveDeclarations(hands: Card[][], bidOrder: number[], trump: Suit | null): DeclResolution {
  void trump; // trump does not affect declaration detection in this ruleset
  const all: Declaration[] = [];
  for (let seat = 0; seat < 4; seat++) {
    const order = bidOrder.indexOf(seat);
    all.push(...detectDeclarations(hands[seat], seat, order));
  }
  if (all.length === 0) return { declarations: [], winnerTeam: -1, points: [0, 0] };

  // Strongest single declaration: most points, ties broken by earliest bid order.
  let best = all[0];
  for (const d of all) {
    if (d.points > best.points || (d.points === best.points && d.order < best.order)) best = d;
  }
  const winnerTeam = teamOf(best.seat);
  const points: [number, number] = [0, 0];
  for (const d of all) if (teamOf(d.seat) === winnerTeam) points[winnerTeam] += d.points;

  return { declarations: all, winnerTeam, points };
}

/**
 * Resolve the winner among the *announced* declarations only. The team with the
 * single strongest announced declaration scores all of its announced ones; ties
 * on points go to the earlier bidding position.
 */
export function resolveAnnounced(declarations: Declaration[]): { winnerTeam: 0 | 1 | -1; points: [number, number] } {
  const announced = declarations.filter((d) => d.announced);
  if (announced.length === 0) return { winnerTeam: -1, points: [0, 0] };
  let best = announced[0];
  for (const d of announced) {
    if (d.points > best.points || (d.points === best.points && d.order < best.order)) best = d;
  }
  const winnerTeam = teamOf(best.seat);
  const points: [number, number] = [0, 0];
  for (const d of announced) if (teamOf(d.seat) === winnerTeam) points[winnerTeam] += d.points;
  return { winnerTeam, points };
}

/** Seat holding both K and Q of the trump suit (bela), or -1. */
export function belaHolder(hands: Card[][], trump: Suit): number {
  for (let seat = 0; seat < 4; seat++) {
    const h = hands[seat];
    if (h.includes("K" + trump) && h.includes("Q" + trump)) return seat;
  }
  return -1;
}

/** Is `card` one of the two bela cards (K/Q of trump) for a holder? */
export function isBelaCard(card: Card, trump: Suit): boolean {
  return card === "K" + trump || card === "Q" + trump;
}
