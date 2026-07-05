import mqtt, { type MqttClient } from "mqtt";
import type { Card, Suit } from "../engine/cards";
import { botBid, botPlay } from "../engine/bots";
import {
  applyBid,
  applyDeclare,
  beginPlay,
  chooseSeat,
  createGame,
  currentActor,
  isHandInProgress,
  nextHand,
  playCard,
  rematch,
  readyToStart,
  removePlayer,
  resolveTrick,
  seatPlayer,
  startMatch,
  trickPending,
} from "../engine/game";
import type { Config, GameState } from "../engine/types";
import { viewFor, type ClientView, type Command } from "./protocol";

export interface Identity {
  playerId: string;
  name: string;
}

/** What the UI talks to — identical shape for host and guest. */
export interface Client {
  readonly isHost: boolean;
  readonly roomKey: string;
  onView(cb: (v: ClientView) => void): void;
  chooseSeat(seat: number): void;
  bid(suit: Suit | null): void;
  declare(announce: boolean): void;
  play(card: Card): void;
  start(): void; // host: begin the match; guest: no-op
  rematch(): void; // host: new match; guest: no-op
  leave(): void;
}

const BROKER = "wss://broker.emqx.io:8084/mqtt";
const HEARTBEAT_MS = 3000;
const PRESENCE_TIMEOUT_MS = 9000;
const HAND_PAUSE_MS = 6000;
const TRICK_PAUSE_MS = 1300;

const cmdTopic = (room: string) => `blt/${room}/c`;
const stateTopic = (room: string, playerId: string) => `blt/${room}/s/${playerId}`;
const stateKey = (roomKey: string) => `belot:host:${roomKey}`;

function connect(): MqttClient {
  return mqtt.connect(BROKER, { clean: true, keepalive: 30, reconnectPeriod: 2000, connectTimeout: 10000 });
}

function decode(payload: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
}

/** A secret-free clone for persistence: no cards in any hand. */
function sanitize(state: GameState): GameState {
  return {
    ...state,
    hand: state.hand ? { ...state.hand, hands: [[], [], [], []] } : null,
  };
}

// --- Host ------------------------------------------------------------------

class HostClient implements Client {
  readonly isHost = true;
  private conn: MqttClient;
  private state: GameState;
  private known = new Set<string>();
  private connected = new Set<string>();
  private lastSeen = new Map<string, number>();
  private pending: Identity[] = [];
  private viewCb: ((v: ClientView) => void) | null = null;
  private tick: ReturnType<typeof setInterval>;
  private presence: ReturnType<typeof setInterval>;
  private mockIds = new Set<string>();
  private progressScheduled = false;
  private trickScheduled = false;
  private declScheduled = false;
  private botKey = "";
  private stopped = false;

  constructor(
    readonly roomKey: string,
    private me: Identity,
    config: Config,
    resume?: GameState,
  ) {
    this.state = resume ?? createGame(config);
    if (!resume) seatPlayer(this.state, me.playerId, me.name, 0);
    this.connected.add(me.playerId);

    if (roomKey.toUpperCase() === "TEST") {
      if (!resume) this.seedMocks();
      for (const seat of this.state.seats) {
        if (seat && seat.playerId.startsWith("mock_")) {
          this.mockIds.add(seat.playerId);
          this.connected.add(seat.playerId);
        }
      }
    }

    this.conn = connect();
    this.conn.on("connect", () => this.conn.subscribe(cmdTopic(roomKey)));
    this.conn.on("message", (topic, payload) => {
      if (topic !== cmdTopic(roomKey)) return;
      const cmd = decode(payload) as Command | null;
      if (cmd) this.onCmd(cmd);
    });

    this.tick = setInterval(() => this.drive(), 300);
    this.presence = setInterval(() => this.prunePresence(), 2500);
    this.afterChange();
  }

  onView(cb: (v: ClientView) => void) {
    this.viewCb = cb;
    cb(viewFor(this.state, this.ctx(this.me.playerId, true)));
  }
  chooseSeat(seat: number) {
    this.handle({ t: "chooseSeat", playerId: this.me.playerId, seat });
  }
  bid(suit: Suit | null) {
    this.handle({ t: "bid", playerId: this.me.playerId, suit });
  }
  declare(announce: boolean) {
    this.handle({ t: "declare", playerId: this.me.playerId, announce });
  }
  play(card: Card) {
    this.handle({ t: "play", playerId: this.me.playerId, card });
  }
  start() {
    if (readyToStart(this.state)) {
      startMatch(this.state);
      this.afterChange();
    }
  }
  rematch() {
    if (this.state.phase === "matchOver") {
      rematch(this.state);
      this.afterChange();
    }
  }
  leave() {
    this.stopped = true;
    this.viewCb = null;
    clearInterval(this.tick);
    clearInterval(this.presence);
    localStorage.removeItem(stateKey(this.roomKey));
    void this.conn.end(true);
  }

  private onCmd(cmd: Command) {
    if (this.stopped) return;
    if (cmd.t === "ping") {
      this.lastSeen.set(cmd.playerId, Date.now());
      if (!this.connected.has(cmd.playerId)) {
        this.connected.add(cmd.playerId);
        this.afterChange();
      }
      return;
    }
    if (cmd.t === "join") {
      this.known.add(cmd.playerId);
      this.lastSeen.set(cmd.playerId, Date.now());
    }
    this.handle(cmd);
  }

  private handle(cmd: Command) {
    const s = this.state;
    switch (cmd.t) {
      case "join": {
        this.connected.add(cmd.playerId);
        const seat = seatPlayer(s, cmd.playerId, cmd.name);
        if (seat < 0 && !this.pending.some((p) => p.playerId === cmd.playerId)) {
          this.pending.push({ playerId: cmd.playerId, name: cmd.name });
        }
        break;
      }
      case "chooseSeat":
        chooseSeat(s, cmd.playerId, cmd.seat);
        break;
      case "bid": {
        const idx = s.seats.findIndex((x) => x?.playerId === cmd.playerId);
        if (idx >= 0) applyBid(s, idx, cmd.suit ? { type: "call", suit: cmd.suit } : { type: "pass" });
        break;
      }
      case "declare": {
        const idx = s.seats.findIndex((x) => x?.playerId === cmd.playerId);
        if (idx >= 0) applyDeclare(s, idx, cmd.announce);
        break;
      }
      case "play": {
        const idx = s.seats.findIndex((x) => x?.playerId === cmd.playerId);
        if (idx >= 0) playCard(s, idx, cmd.card);
        break;
      }
      case "leave":
        this.connected.delete(cmd.playerId);
        this.pending = this.pending.filter((p) => p.playerId !== cmd.playerId);
        if (!s.matchStarted) removePlayer(s, cmd.playerId);
        break;
      case "ping":
        return;
    }
    this.afterChange();
  }

  private prunePresence() {
    const cutoff = Date.now() - PRESENCE_TIMEOUT_MS;
    let changed = false;
    for (const pid of this.connected) {
      if (pid === this.me.playerId || this.mockIds.has(pid)) continue;
      if ((this.lastSeen.get(pid) ?? 0) < cutoff) {
        this.connected.delete(pid);
        changed = true;
      }
    }
    if (changed) this.afterChange();
  }

  private seedMocks() {
    ["Ana", "Ivo", "Marko"].forEach((n, i) => {
      const id = `mock_${i}`;
      if (seatPlayer(this.state, id, n, i + 1) >= 0) {
        this.mockIds.add(id);
        this.connected.add(id);
      }
    });
  }

  /** A player who's still connected but stalling? We simply wait — no auto-play. */
  private drive() {
    if (this.stopped) return;
    const s = this.state;

    // After all zvanja are decided, show the announced ones briefly, then play.
    if (s.phase === "declaring" && s.hand?.declResolved && !this.declScheduled) {
      this.declScheduled = true;
      setTimeout(() => {
        this.declScheduled = false;
        if (!this.stopped && this.state.phase === "declaring") {
          beginPlay(this.state);
          this.afterChange();
        }
      }, 2600);
      return;
    }

    // Hold a completed trick on the table briefly, then gather it to its winner.
    if (trickPending(s) && !this.trickScheduled) {
      this.trickScheduled = true;
      setTimeout(() => {
        this.trickScheduled = false;
        if (!this.stopped && trickPending(this.state)) {
          resolveTrick(this.state);
          this.afterChange();
        }
      }, TRICK_PAUSE_MS);
      return;
    }

    // Auto-advance to the next hand after the scoring pause.
    if (s.phase === "handScored" && !this.progressScheduled) {
      this.progressScheduled = true;
      setTimeout(() => {
        this.progressScheduled = false;
        if (!this.stopped && this.state.phase === "handScored") {
          nextHand(this.state);
          this.afterChange();
        }
      }, HAND_PAUSE_MS);
    }

    if (this.mockIds.size === 0) return;

    // TEST room: auto-start once four are seated.
    if (!s.matchStarted && readyToStart(s) && !this.progressScheduled) {
      this.progressScheduled = true;
      setTimeout(() => {
        this.progressScheduled = false;
        if (!this.stopped && readyToStart(this.state)) {
          startMatch(this.state);
          this.afterChange();
        }
      }, 900);
      return;
    }

    // TEST room: drive the bots on their turn.
    const actor = currentActor(s);
    if (actor >= 0 && this.mockIds.has(s.seats[actor]?.playerId ?? "")) {
      const key = `${s.phase}:${s.handNumber}:${actor}:${s.hand?.bidTurn}:${s.hand?.currentTrick.length}`;
      if (key !== this.botKey) {
        this.botKey = key;
        setTimeout(() => this.botAct(actor), 650 + Math.floor(Math.random() * 600));
      }
    }
  }

  private botAct(seat: number) {
    if (this.stopped) return;
    const s = this.state;
    if (currentActor(s) !== seat || !this.mockIds.has(s.seats[seat]?.playerId ?? "")) return;
    if (s.phase === "bidding") applyBid(s, seat, botBid(s, seat));
    else if (s.phase === "declaring") applyDeclare(s, seat, true); // bots always announce
    else if (s.phase === "playing") playCard(s, seat, botPlay(s, seat));
    this.afterChange();
  }

  private afterChange() {
    if (this.stopped) return;
    this.persist();
    this.broadcast();
  }

  private persist() {
    if (isHandInProgress(this.state)) return; // never write secrets; only snapshot between hands
    try {
      localStorage.setItem(stateKey(this.roomKey), JSON.stringify({ state: sanitize(this.state), me: this.me }));
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }

  private ctx(you: string, isHost: boolean) {
    return { you, isHost, hostName: this.me.name, connected: this.connected, spectatorCount: this.pending.length };
  }

  private broadcast() {
    if (this.viewCb) this.viewCb(viewFor(this.state, this.ctx(this.me.playerId, true)));
    if (!this.conn.connected) return;
    for (const pid of this.known) {
      this.conn.publish(stateTopic(this.roomKey, pid), JSON.stringify(viewFor(this.state, this.ctx(pid, false))));
    }
  }
}

// --- Guest -----------------------------------------------------------------

class GuestClient implements Client {
  readonly isHost = false;
  private conn: MqttClient;
  private viewCb: ((v: ClientView) => void) | null = null;
  private lastView: ClientView | null = null;
  private gotView = false;
  private beat: ReturnType<typeof setInterval>;

  constructor(
    readonly roomKey: string,
    private me: Identity,
  ) {
    this.conn = connect();
    this.conn.on("connect", () => {
      this.conn.subscribe(stateTopic(roomKey, me.playerId));
      this.announce();
    });
    this.conn.on("message", (topic, payload) => {
      if (topic !== stateTopic(roomKey, me.playerId)) return;
      const view = decode(payload) as ClientView | null;
      if (!view) return;
      this.gotView = true;
      this.lastView = view;
      this.viewCb?.(view);
    });

    this.beat = setInterval(() => {
      if (this.gotView) this.pub({ t: "ping", playerId: this.me.playerId });
      else this.announce();
    }, HEARTBEAT_MS);
  }

  private pub(cmd: Command) {
    if (this.conn.connected) this.conn.publish(cmdTopic(this.roomKey), JSON.stringify(cmd));
  }
  private announce() {
    this.pub({ t: "join", playerId: this.me.playerId, name: this.me.name });
  }

  onView(cb: (v: ClientView) => void) {
    this.viewCb = cb;
    if (this.lastView) cb(this.lastView);
  }
  chooseSeat(seat: number) {
    this.pub({ t: "chooseSeat", playerId: this.me.playerId, seat });
  }
  bid(suit: Suit | null) {
    this.pub({ t: "bid", playerId: this.me.playerId, suit });
  }
  declare(announce: boolean) {
    this.pub({ t: "declare", playerId: this.me.playerId, announce });
  }
  play(card: Card) {
    this.pub({ t: "play", playerId: this.me.playerId, card });
  }
  start() {
    /* host-only */
  }
  rematch() {
    /* host-only */
  }
  leave() {
    this.viewCb = null;
    clearInterval(this.beat);
    this.pub({ t: "leave", playerId: this.me.playerId });
    void this.conn.end(true);
  }
}

// --- Factory ---------------------------------------------------------------

export function createHost(roomKey: string, me: Identity, config: Config): Client {
  return new HostClient(roomKey, me, config);
}

/** Resume a host session from a persisted (secret-free, between-hands) snapshot. */
export function resumeHost(roomKey: string, me: Identity): Client | null {
  const raw = localStorage.getItem(stateKey(roomKey));
  if (!raw) return null;
  try {
    const { state } = JSON.parse(raw) as { state: GameState };
    if (isHandInProgress(state)) {
      // A snapshot should never be mid-hand, but coerce to a safe idle state.
      state.phase = state.matchStarted ? "handScored" : "waiting";
    }
    if (state.hand) state.hand.hands = [[], [], [], []];
    return new HostClient(roomKey, me, state.config, state);
  } catch {
    return null;
  }
}

export function createGuest(roomKey: string, me: Identity): Client {
  return new GuestClient(roomKey, me);
}
