import { cardValue, teamOf, type Card, type Suit } from "../engine/cards";
import { currentActor, isForcedBidder, legalPlays } from "../engine/game";
import type { Config, Declaration, GameState, HandResult, Phase, PlayedCard } from "../engine/types";

/** Namespace for topics / storage. Bump to invalidate incompatible old clients. */
export const APP_ID = "p2p-belot-v1";

// --- Commands: peer -> host -----------------------------------------------

export type Command =
  | { t: "join"; playerId: string; name: string }
  | { t: "ping"; playerId: string }
  | { t: "chooseSeat"; playerId: string; seat: number }
  | { t: "bid"; playerId: string; suit: Suit | null } // null = pass ("dalje")
  | { t: "declare"; playerId: string; announce: boolean }
  | { t: "play"; playerId: string; card: Card }
  | { t: "leave"; playerId: string };

// --- View: host -> peer (redacted) ----------------------------------------

export interface PublicSeat {
  playerId: string;
  name: string;
  team: 0 | 1;
  connected: boolean;
  isDealer: boolean;
  isCaller: boolean;
  isActor: boolean; // whose turn to bid/play
  cards: number; // how many cards this seat is holding (for face-down fans)
}

export interface ClientView {
  you: string;
  yourSeat: number; // -1 spectator
  isHost: boolean;
  hostName: string;
  config: Config;
  phase: Phase;
  scores: [number, number];
  matchStarted: boolean;
  matchWinner: 0 | 1 | -1;
  handNumber: number;
  seats: Array<PublicSeat | null>;
  spectatorCount: number;

  dealer: number;
  trump: Suit | null;
  caller: number;
  callerTeam: 0 | 1 | -1;
  actor: number; // seat currently to act, -1
  forcedBid: boolean; // actor is the forced dealer (mus)

  yourHand: Card[]; // 6 during bidding, 8 after trump is set; [] for spectators
  yourLegal: Card[]; // legal plays if it's your turn, else []
  yourBela: boolean; // you hold K+Q of trump

  currentTrick: PlayedCard[];
  leader: number;
  tricksWon: [number, number];
  lastTrickWinner: number;

  /** Live running points this hand per team (trick points + declarations + shown bela). */
  handPoints: [number, number];
  /** Points the calling team needs to make its contract (0 before trump is set). */
  handThreshold: number;

  declActor: number; // seat currently deciding whether to announce its zvanje (-1)
  yourDeclarations: Declaration[]; // your own detected zvanja (for the announce prompt)
  /** All announced zvanja (name + value shown to everyone); cards only for the winning team. */
  declarations: Declaration[];
  declWinnerTeam: 0 | 1 | -1;
  declPoints: [number, number];
  belaAnnouncedTeam: 0 | 1 | -1; // once the first bela card is played

  result: HandResult | null;
  disconnected: string[]; // seated player ids not currently connected
}

export interface ViewContext {
  you: string;
  isHost: boolean;
  hostName: string;
  connected: Set<string>;
  spectatorCount: number;
}

/** Build the redacted view a specific player is allowed to see. */
export function viewFor(state: GameState, ctx: ViewContext): ClientView {
  const h = state.hand;
  const yourSeat = state.seats.findIndex((s) => s?.playerId === ctx.you);
  const actor = currentActor(state);

  const seats = state.seats.map<PublicSeat | null>((seat, i) => {
    if (!seat) return null;
    return {
      playerId: seat.playerId,
      name: seat.name,
      team: teamOf(i),
      connected: ctx.connected.has(seat.playerId),
      isDealer: !!h && h.dealer === i,
      isCaller: !!h && h.caller === i,
      isActor: actor === i,
      cards: h ? (h.revealed ? h.hands[i].length : 6) : 0,
    };
  });

  const disconnected = state.seats
    .filter((s): s is NonNullable<typeof s> => !!s && !ctx.connected.has(s.playerId))
    .map((s) => s.playerId);

  let yourHand: Card[] = [];
  let yourLegal: Card[] = [];
  let yourBela = false;
  if (h && yourSeat >= 0) {
    const full = h.hands[yourSeat];
    yourHand = h.revealed ? full : full.slice(0, 6); // hide the 2 face-down cards until trump is set
    yourBela = h.belaSeat === yourSeat;
    if (state.phase === "playing" && actor === yourSeat) yourLegal = legalPlays(state, yourSeat);
  }

  const tricksWon: [number, number] = [0, 0];
  if (h) for (const w of h.trickWinners) tricksWon[teamOf(w)]++;

  // Live hand tally: trick card points so far + declarations + bela (once shown).
  const handPoints: [number, number] = [0, 0];
  let handThreshold = 0;
  if (h && h.trump) {
    for (let i = 0; i < h.tricks.length; i++) {
      let pts = 0;
      for (const pc of h.tricks[i]) pts += cardValue(pc.card, h.trump);
      handPoints[teamOf(h.trickWinners[i])] += pts;
    }
    if (h.tricks.length === 8) handPoints[teamOf(h.trickWinners[7])] += 10; // last trick
    const belaShown = h.belaShown && h.belaSeat >= 0;
    handPoints[0] += h.declPoints[0];
    handPoints[1] += h.declPoints[1];
    if (belaShown) handPoints[teamOf(h.belaSeat)] += 20;
    const total = 162 + h.declPoints[0] + h.declPoints[1] + (belaShown ? 20 : 0);
    handThreshold = Math.floor(total / 2) + 1;
  }

  return {
    you: ctx.you,
    yourSeat,
    isHost: ctx.isHost,
    hostName: ctx.hostName,
    config: state.config,
    phase: state.phase,
    scores: state.scores,
    matchStarted: state.matchStarted,
    matchWinner: state.matchWinner,
    handNumber: state.handNumber,
    seats,
    spectatorCount: ctx.spectatorCount,
    dealer: h?.dealer ?? -1,
    trump: h?.trump ?? null,
    caller: h?.caller ?? -1,
    callerTeam: h?.callerTeam ?? -1,
    actor,
    forcedBid: isForcedBidder(state),
    yourHand,
    yourLegal,
    yourBela,
    currentTrick: h?.currentTrick ?? [],
    leader: h?.leader ?? -1,
    tricksWon,
    handPoints,
    handThreshold,
    lastTrickWinner: h && h.trickWinners.length ? h.trickWinners[h.trickWinners.length - 1] : -1,
    declActor: state.phase === "declaring" ? actor : -1,
    yourDeclarations: h && yourSeat >= 0 ? h.declarations.filter((d) => d.seat === yourSeat) : [],
    // Reveal only once resolved, and only the winning team's announced zvanja.
    // Everyone sees each announced zvanje's owner + value; only the winning
    // team's actual cards are revealed (losing cards are stripped to []).
    declarations:
      h && h.declResolved
        ? h.declarations
            .filter((d) => d.announced)
            .map((d) => (teamOf(d.seat) === h.declWinnerTeam ? d : { ...d, cards: [] }))
        : [],
    declWinnerTeam: h?.declWinnerTeam ?? -1,
    declPoints: h?.declPoints ?? [0, 0],
    belaAnnouncedTeam: h && h.belaShown && h.belaSeat >= 0 ? teamOf(h.belaSeat) : -1,
    result: state.result,
    disconnected,
  };
}
