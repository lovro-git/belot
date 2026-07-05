import { cardValue, teamOf } from "./cards";
import type { HandResult, HandState } from "./types";

const CLEAN_HAND = 162; // 152 card points + 10 for the last trick
const CAPOT_BONUS = 90; // štiglja — taking all eight tricks

/**
 * Score a completed hand (all 8 tricks played). Applies the contract: the
 * calling team must reach more than half of the total points in play
 * (162 + declarations + bela) or it "falls" (pao) and the opponents take
 * everything. Adds the 90-point štiglja bonus for a clean sweep.
 */
export function scoreHand(h: HandState): HandResult {
  const trump = h.trump!;
  const callerTeam = h.callerTeam as 0 | 1;

  const cardPoints: [number, number] = [0, 0];
  for (let i = 0; i < h.tricks.length; i++) {
    let pts = 0;
    for (const pc of h.tricks[i]) pts += cardValue(pc.card, trump);
    cardPoints[teamOf(h.trickWinners[i])] += pts;
  }
  cardPoints[teamOf(h.trickWinners[h.trickWinners.length - 1])] += 10; // last trick

  // Štiglja: one team won all eight tricks.
  const wonByTeam0 = h.trickWinners.filter((s) => teamOf(s) === 0).length;
  const capot: 0 | 1 | -1 = wonByTeam0 === 8 ? 0 : wonByTeam0 === 0 ? 1 : -1;

  const declPoints: [number, number] = [h.declPoints[0], h.declPoints[1]];
  const belaPoints: [number, number] = [0, 0];
  if (h.belaSeat >= 0) belaPoints[teamOf(h.belaSeat)] += 20;

  const totalInPlay = CLEAN_HAND + declPoints[0] + declPoints[1] + belaPoints[0] + belaPoints[1];
  const threshold = Math.floor(totalInPlay / 2) + 1; // "pola + 1"
  const callerPts = cardPoints[callerTeam] + declPoints[callerTeam] + belaPoints[callerTeam];
  const passed = callerPts >= threshold;

  const awarded: [number, number] = [0, 0];
  if (passed) {
    for (const t of [0, 1] as const) {
      awarded[t] = cardPoints[t] + declPoints[t] + belaPoints[t] + (capot === t ? CAPOT_BONUS : 0);
    }
  } else {
    // Pao: the calling team scores nothing; opponents take all points in play
    // (including the callers' own declarations and bela) plus any capot bonus.
    const opp = (1 - callerTeam) as 0 | 1;
    awarded[callerTeam] = 0;
    awarded[opp] = totalInPlay + (capot >= 0 ? CAPOT_BONUS : 0);
  }

  return {
    trump,
    caller: h.caller,
    callerTeam,
    cardPoints,
    declPoints,
    belaPoints,
    capot,
    awarded,
    passed,
    threshold,
    declWinnerTeam: h.declWinnerTeam,
    declarations: h.declarations,
  };
}
