import { teamOf, type Card, type Suit } from "../engine/cards";
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

  declarations: Declaration[]; // shown once trump is set
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
    lastTrickWinner: h && h.trickWinners.length ? h.trickWinners[h.trickWinners.length - 1] : -1,
    declarations: h?.revealed ? h.declarations : [],
    declWinnerTeam: h?.declWinnerTeam ?? -1,
    declPoints: h?.declPoints ?? [0, 0],
    belaAnnouncedTeam: h && h.belaShown && h.belaSeat >= 0 ? teamOf(h.belaSeat) : -1,
    result: state.result,
    disconnected,
  };
}
