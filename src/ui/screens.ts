import { rankOf, SEQ_INDEX, suitOf, SUITS, teamOf, type Card, type Suit } from "../engine/cards";
import type { ClientView, PublicSeat } from "../net/protocol";
import type { HandResult } from "../engine/types";
import { backImage, cardEl, suitIcon } from "./cards";
import { applyTheme, clear, getSort, getTheme, h, icon, setSort, type SortMode } from "./dom";
import { getLang, setLang, t } from "./i18n";
import { isMuted, toggleMuted } from "./sound";

export interface TableHandlers {
  chooseSeat: (seat: number) => void;
  bid: (suit: Suit | null) => void;
  declare: (announce: boolean) => void;
  play: (card: Card) => void;
  start: () => void;
  rematch: () => void;
  copyLink: () => void;
  leave: () => void;
  rerender: () => void;
}

export interface UIState {
  prevHand: number;
  prevTrickCount: number;
  selectedCard: string | null; // tapped card awaiting confirmation
}

// --- Lobby -----------------------------------------------------------------

export interface LobbyHandlers {
  create: (name: string, target: 501 | 701 | 1001) => void;
  join: (name: string, key: string) => void;
}

export function renderLobby(root: HTMLElement, prefillKey: string, err: string, handlers: LobbyHandlers): void {
  const s = t();
  let target: 501 | 701 | 1001 = 1001;
  const nameInput = h("input", {
    class: "input",
    type: "text",
    maxlength: "16",
    placeholder: s.namePlaceholder,
    value: localStorage.getItem("belot:name") ?? "",
  }) as HTMLInputElement;
  const keyInput = h("input", {
    class: "input",
    type: "text",
    placeholder: s.roomKeyPlaceholder,
    value: prefillKey,
  }) as HTMLInputElement;

  const name = () => nameInput.value.trim() || "Igrač";
  const targetSeg = h("div", { class: "seg" });
  const paintTarget = () => {
    clear(targetSeg);
    for (const v of [501, 701, 1001] as const) {
      targetSeg.append(
        h("button", { class: v === target ? "on" : "", onclick: () => { target = v; paintTarget(); } }, String(v)),
      );
    }
  };
  paintTarget();

  const errEl = h("div", { class: "err" }, err);

  clear(root).append(
    h("div", { class: "lobby" },
      h("div", { class: "lobby-card" },
        h("div", { class: "lobby-top" },
          h("div", { class: "brand" },
            h("h1", {}, "Belot"),
            h("span", { class: "suits" }, "♠", h("span", { class: "r" }, "♥"), h("span", { class: "r" }, "♦"), "♣"),
          ),
          h("div", { class: "brand-spacer" }),
          langButton(() => renderLobby(root, keyInput.value.trim(), "", handlers)),
          themeBtn(() => {}),
        ),
        h("p", { class: "lobby-sub" }, s.tagline),
        h("div", { class: "field" }, h("label", {}, s.name), nameInput),
        h("div", { class: "field" }, h("label", {}, s.target), targetSeg),
        h("button", { class: "btn btn-gold join-block btn-join", onclick: () => {
          if (!name()) { errEl.textContent = s.name; return; }
          localStorage.setItem("belot:name", name());
          handlers.create(name(), target);
        } }, s.create),
        h("div", { class: "divider" }, s.or),
        h("div", { class: "field" }, h("label", {}, s.roomKey), keyInput),
        h("button", { class: "btn btn-ghost", onclick: () => {
          const key = keyInput.value.trim();
          if (!name()) { errEl.textContent = s.name; return; }
          if (!key) { errEl.textContent = s.roomKey; return; }
          localStorage.setItem("belot:name", name());
          handlers.join(name(), key);
        } }, s.join),
        errEl,
      ),
    ),
  );
}

/** Arriving via an invite link: just ask for a name, then join. */
export function renderJoin(root: HTMLElement, roomKey: string, err: string, onJoin: (name: string) => void): void {
  const s = t();
  const nameInput = h("input", {
    class: "input",
    type: "text",
    maxlength: "16",
    placeholder: s.namePlaceholder,
    value: localStorage.getItem("belot:name") ?? "",
  }) as HTMLInputElement;
  const errEl = h("div", { class: "err" }, err);
  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) {
      errEl.textContent = s.name;
      return;
    }
    localStorage.setItem("belot:name", name);
    onJoin(name);
  };
  nameInput.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") submit();
  });

  clear(root).append(
    h("div", { class: "lobby" },
      h("div", { class: "lobby-card" },
        h("div", { class: "lobby-top" },
          h("div", { class: "brand" },
            h("h1", {}, "Belot"),
            h("span", { class: "suits" }, "♠", h("span", { class: "r" }, "♥"), h("span", { class: "r" }, "♦"), "♣"),
          ),
          h("div", { class: "brand-spacer" }),
          langButton(() => renderJoin(root, roomKey, "", onJoin)),
          themeBtn(() => {}),
        ),
        h("p", { class: "lobby-sub" }, `${s.join} · ${roomKey}`),
        h("div", { class: "field" }, h("label", {}, s.name), nameInput),
        h("button", { class: "btn btn-gold btn-join", onclick: submit }, s.join),
        errEl,
      ),
    ),
  );
  nameInput.focus();
}

export function renderConnecting(root: HTMLElement, key: string, onLeave: () => void, slow = false): void {
  const s = t();
  clear(root).append(
    h("div", { class: "lobby" },
      h("div", { class: "lobby-card connecting" },
        h("div", { class: "spinner" }),
        h("h2", { class: "conn-title" }, s.connecting),
        h("div", { class: "conn-key" }, key),
        h("p", { class: "conn-msg" }, slow ? s.connectingSlow : s.tagline),
        h("button", { class: "btn btn-ghost", onclick: onLeave }, s.leave),
      ),
    ),
  );
}

// --- Table -----------------------------------------------------------------

const REL_POS = ["bottom", "right", "top", "left"] as const; // rel offset from you → screen side

function teamLabel(v: ClientView, team: 0 | 1): string {
  const s = t();
  if (v.yourSeat < 0) return team === 0 ? "A" : "B";
  return teamOf(v.yourSeat) === team ? s.teamUs : s.teamThem;
}

function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

function suitSpan(suit: Suit): HTMLElement {
  return h("span", { class: `suit-ico sc-${suit}` }, suitIcon(suit));
}

export function renderTable(root: HTMLElement, v: ClientView, ui: UIState, handlers: TableHandlers): void {
  const base = v.yourSeat >= 0 ? v.yourSeat : 0;
  const paused = v.matchStarted && v.disconnected.length > 0;

  const arena = h("div", { class: "arena" },
    h("div", { class: "felt-wrap" },
      h("div", { class: "felt" }, v.trump ? h("div", { class: "felt-mark" }, suitSpan(v.trump)) : null),
      scoreboard(v),
      ...v.seats.map((seat, i) => seatPod(v, seat, i, (i - base + 4) % 4, handlers)),
      h("div", { class: "center" }, ...centerContent(v, handlers)),
      paused ? pauseOverlay(v) : null,
    ),
  );

  clear(root).append(
    h("div", { class: "table-screen" },
      topbar(v, handlers),
      arena,
      footer(v, ui, handlers),
    ),
  );
}

function topbar(v: ClientView, handlers: TableHandlers): HTMLElement {
  const s = t();
  return h("div", { class: "topbar" },
    h("div", { class: "tb-brand" }, "Belot"),
    h("div", { class: "tb-key" },
      h("b", {}, v.you && v.yourSeat >= 0 ? `${v.config.target}` : `${v.config.target}`),
      h("button", { onclick: handlers.copyLink }, icon("link"), h("span", { class: "copy-txt" }, s.copyInvite)),
    ),
    h("div", { class: "tb-spacer" }),
    settingsMenu(handlers),
    h("button", { onclick: handlers.leave }, icon("right-from-bracket"), h("span", { class: "leave-txt" }, s.leaveShort)),
  );
}

function scoreboard(v: ClientView): HTMLElement {
  const inHand = !!v.trump && (v.phase === "playing" || v.phase === "handScored");
  const rows = ([0, 1] as const).map((team) =>
    h("div", { class: `sb-row ${v.yourSeat >= 0 && teamOf(v.yourSeat) === team ? "is-us" : ""}` },
      h("span", { class: `sb-team team-${team}` }, teamLabel(v, team)),
      h("span", { class: "sb-score tnum" }, String(v.scores[team])),
      inHand ? h("span", { class: "sb-hand tnum" }, `+${v.handPoints[team]}`) : v.matchStarted ? h("span", { class: "sb-tricks" }, String(v.tricksWon[team])) : null,
    ),
  );
  return h("div", { class: "scoreboard" },
    ...rows,
    v.trump ? h("div", { class: "sb-trump" }, suitSpan(v.trump), v.caller >= 0 && v.seats[v.caller] ? h("span", { class: "sb-caller" }, v.seats[v.caller]!.name) : null) : null,
    inHand && v.callerTeam >= 0
      ? h("div", { class: "sb-need" }, `${teamLabel(v, v.callerTeam as 0 | 1)} `, h("b", { class: "tnum" }, `${v.handPoints[v.callerTeam as 0 | 1]}/${v.handThreshold}`))
      : null,
  );
}

function seatPod(v: ClientView, seat: PublicSeat | null, index: number, rel: number, handlers: TableHandlers): HTMLElement {
  const s = t();
  const pos = REL_POS[rel];
  const canSit = !v.matchStarted && !seat;
  if (!seat) {
    return h("div", { class: `seat seat-${pos}` },
      h("button", { class: "empty-seat", onclick: canSit ? () => handlers.chooseSeat(index) : undefined, disabled: !canSit },
        icon("chair"), h("span", {}, canSit ? s.sitHere : s.emptySeat)),
    );
  }
  const cls = [
    "pod",
    `team-${teamOf(index)}`,
    seat.playerId === v.you ? "is-me" : "",
    seat.isActor ? "is-acting" : "",
    !seat.connected ? "is-off" : "",
  ].join(" ");
  const showFan = seat.playerId !== v.you && seat.cards > 0;
  return h("div", { class: `seat seat-${pos}` },
    showFan ? fanBacks(seat.cards) : null,
    h("div", { class: cls },
      h("div", { class: "pod-av" }, initial(seat.name), !seat.connected ? h("span", { class: "off-dot" }) : null),
      h("div", { class: "pod-info" },
        h("div", { class: "pod-name" }, seat.name, seat.playerId === v.you ? " (ti)" : ""),
        h("div", { class: "pod-tags" },
          seat.isDealer ? h("span", { class: "tag tag-d" }, "D") : null,
          seat.isCaller && v.trump ? h("span", { class: "tag tag-call" }, suitSpan(v.trump)) : null,
        ),
      ),
    ),
  );
}

/** A fanned stack of face-down card backs, showing how many cards a seat holds. */
function fanBacks(n: number): HTMLElement {
  const count = Math.min(n, 8);
  const spread = 8; // degrees per card from centre
  const mid = (count - 1) / 2;
  const cards = Array.from({ length: count }, (_, i) =>
    h("div", { class: "fan-card", style: `--rot:${(i - mid) * spread}deg` }, h("img", { class: "mini-back", src: backImage(), alt: "", draggable: "false" })),
  );
  return h("div", { class: "pod-fan" }, ...cards);
}

function trickPile(v: ClientView): HTMLElement {
  const base = v.yourSeat >= 0 ? v.yourSeat : 0;
  const cards = v.currentTrick.map((pc) => {
    const rel = (pc.seat - base + 4) % 4;
    return h("div", { class: `trick-card tc-${REL_POS[rel]}` }, cardEl(pc.card, { small: true }));
  });
  return h("div", { class: "trick" }, ...cards);
}

function centerContent(v: ClientView, handlers: TableHandlers): Array<HTMLElement | null> {
  const s = t();
  if (v.phase === "matchOver") {
    return [matchBanner(v, handlers)];
  }
  if (v.phase === "handScored" && v.result) {
    return [resultBanner(v)];
  }
  if (!v.matchStarted || v.phase === "waiting") {
    return [
      h("div", { class: "center-msg" },
        h("div", { class: "cm-title" }, s.waitingPlayers),
        h("div", { class: "cm-sub" }, s.seatsFilled(v.seats.filter(Boolean).length)),
      ),
    ];
  }
  if (v.phase === "declaring") {
    const actorName = v.declActor >= 0 && v.seats[v.declActor] ? v.seats[v.declActor]!.name : "";
    const status = v.declActor === v.yourSeat ? s.yourZvanje : v.declActor >= 0 ? s.choosingZvanje(actorName) : s.showingZvanja;
    return [declList(v), h("div", { class: "center-status" }, status)];
  }
  // bidding or playing
  const actorName = v.actor >= 0 && v.seats[v.actor] ? v.seats[v.actor]!.name : "";
  const status =
    v.actor < 0
      ? "" // a completed trick is on the table, being gathered
      : v.phase === "bidding"
        ? v.actor === v.yourSeat
          ? s.yourBidTurn
          : s.bidding(actorName)
        : v.actor === v.yourSeat
          ? s.yourPlayTurn
          : s.playing(actorName);
  return [
    trickPile(v),
    h("div", { class: "center-status" }, status),
  ];
}

function resultBanner(v: ClientView): HTMLElement {
  const s = t();
  const r = v.result as HandResult;
  const made = r.passed;
  return h("div", { class: "winner-banner result" },
    h("div", { class: "wb-title" }, made ? s.callerMade(teamLabel(v, r.callerTeam)) : s.callerFell(teamLabel(v, r.callerTeam))),
    h("div", { class: "wb-scores" },
      ...([0, 1] as const).map((team) =>
        h("div", { class: "wb-score" },
          h("span", { class: `sb-team team-${team}` }, teamLabel(v, team)),
          h("b", { class: "tnum" }, `+${r.awarded[team]}`),
        ),
      ),
    ),
    r.capot >= 0 ? h("div", { class: "wb-note" }, s.capot + "!") : null,
  );
}

function matchBanner(v: ClientView, handlers: TableHandlers): HTMLElement {
  const s = t();
  const w = v.matchWinner as 0 | 1;
  const youWon = v.yourSeat >= 0 && teamOf(v.yourSeat) === w;
  const isHost = v.isHost;
  return h("div", { class: "winner-banner" },
    h("div", { class: "winner-trophy" }, "🏆"),
    h("div", { class: "winner-amt" }, v.yourSeat >= 0 ? (youWon ? s.youWon : s.youLost) : s.matchWon(teamLabel(v, w))),
    h("div", { class: "winner-name" }, `${teamLabel(v, w)} — ${v.scores[w]}`),
    isHost ? h("button", { class: "btn btn-gold rematch-btn", onclick: handlers.rematch }, s.rematch) : h("div", { class: "wb-note" }, s.waitStart),
  );
}

function pauseOverlay(v: ClientView): HTMLElement {
  const s = t();
  const names = v.disconnected
    .map((id) => v.seats.find((x) => x?.playerId === id)?.name)
    .filter(Boolean)
    .join(", ");
  return h("div", { class: "pause-overlay" },
    h("div", { class: "pause-box" },
      h("div", { class: "spinner" }),
      h("div", { class: "pause-title" }, s.gamePaused),
      h("div", { class: "pause-sub" }, s.waitingReconnect(names || "…")),
    ),
  );
}

function footer(v: ClientView, ui: UIState, handlers: TableHandlers): HTMLElement {
  const s = t();
  // Spectator
  if (v.yourSeat < 0) {
    return h("div", { class: "footer" }, h("div", { class: "wait-note" }, icon("eye"), s.spectator));
  }

  // Pre-match: host start / waiting
  if (!v.matchStarted || v.phase === "waiting") {
    const seated = v.seats.filter(Boolean).length;
    const controls = v.isHost
      ? h("button", { class: "btn btn-gold deal-btn", disabled: seated < 4, onclick: handlers.start }, s.start)
      : h("div", { class: "wait-note" }, h("span", { class: "pulse-dot" }), s.waitStart);
    return h("div", { class: "footer footer--center" }, controls);
  }

  // Bidding controls
  if (v.phase === "bidding" && v.actor === v.yourSeat) {
    return h("div", { class: "footer" },
      h("div", { class: "bid-bar" },
        h("div", { class: "bid-suits" },
          ...SUITS.map((suit) =>
            h("button", { class: `bid-suit suit-${suit}`, onclick: () => handlers.bid(suit) }, suitSpan(suit)),
          ),
        ),
        h("button", { class: "btn btn-ghost pass-btn", disabled: v.forcedBid, onclick: () => handlers.bid(null) },
          v.forcedBid ? s.mustCall : s.pass),
      ),
      handRow(v, ui, handlers, false),
    );
  }

  // Declaration: your turn to announce your zvanje
  if (v.phase === "declaring" && v.declActor === v.yourSeat) {
    const total = v.yourDeclarations.reduce((n, d) => n + d.points, 0);
    return h("div", { class: "footer" },
      h("div", { class: "bid-bar" },
        h("button", { class: "btn btn-gold pass-btn", onclick: () => handlers.declare(true) }, `${s.declare} ${total}`),
        h("button", { class: "btn btn-ghost pass-btn", onclick: () => handlers.declare(false) }, s.skipDecl),
      ),
      handRow(v, ui, handlers, false),
    );
  }

  // Playing / waiting for others: show your hand
  const yourTurn = v.phase === "playing" && v.actor === v.yourSeat;
  // Drop a stale selection when it's not actionable anymore.
  if (!yourTurn || !ui.selectedCard || !v.yourLegal.includes(ui.selectedCard)) ui.selectedCard = null;
  const bar = ui.selectedCard
    ? h("div", { class: "confirm-bar" },
        h("button", { class: "btn btn-gold confirm-play", onclick: () => { const c = ui.selectedCard!; ui.selectedCard = null; handlers.play(c); } }, s.play),
        h("button", { class: "cancel-btn", onclick: () => { ui.selectedCard = null; handlers.rerender(); } }, "✕"),
      )
    : null;
  return h("div", { class: "footer" }, bar, handRow(v, ui, handlers, yourTurn));
}

const SUIT_ORDER: Suit[] = ["s", "h", "d", "c"];

/**
 * Sort a hand low-to-high (7→A). "suit" groups by suit (trump first); "size"
 * orders purely by rank across the whole hand, smallest to largest.
 */
export function sortHand(cards: Card[], trump: Suit | null, mode: SortMode = "suit"): Card[] {
  const suitKey = (su: Suit) => (trump && su === trump ? -1 : SUIT_ORDER.indexOf(su));
  return [...cards].sort((a, b) => {
    if (mode === "size") {
      const d = SEQ_INDEX[rankOf(a)] - SEQ_INDEX[rankOf(b)];
      return d !== 0 ? d : suitKey(suitOf(a)) - suitKey(suitOf(b));
    }
    const sa = suitOf(a);
    const sb = suitOf(b);
    if (sa !== sb) return suitKey(sa) - suitKey(sb);
    return SEQ_INDEX[rankOf(a)] - SEQ_INDEX[rankOf(b)];
  });
}

const DECL_LABEL: Record<string, string> = { seq3: "Terca", seq4: "Kvarta", seq5: "Kvinta", four: "Karé" };

/** The announced zvanja, shown to everyone with their cards and value. */
function declList(v: ClientView): HTMLElement | null {
  if (v.declarations.length === 0) return null;
  return h("div", { class: "decl-panel" },
    ...v.declarations.map((d) =>
      h("div", { class: "decl-item" },
        h("span", { class: "decl-who" }, v.seats[d.seat]?.name ?? ""),
        h("div", { class: "decl-cards" }, ...d.cards.map((c) => cardEl(c, { small: true }))),
        h("span", { class: "decl-val" }, `${DECL_LABEL[d.kind]} ${d.points}`),
      ),
    ),
  );
}

function handRow(v: ClientView, ui: UIState, handlers: TableHandlers, yourTurn: boolean): HTMLElement {
  const legal = new Set(v.yourLegal);
  const row = h("div", { class: "hand-row" });
  for (const card of sortHand(v.yourHand, v.trump, getSort())) {
    const playable = yourTurn && legal.has(card);
    const dim = yourTurn && !legal.has(card);
    const el = cardEl(card, { big: true, playable, dim, selected: ui.selectedCard === card });
    attachCardGestures(el, card, playable, ui, handlers);
    row.append(el);
  }
  return row;
}

/**
 * Tap a legal card to select it, tap again (or press Odigraj) to play. A long
 * press or a drag is ignored — so holding never selects (and never triggers the
 * iOS text/image callout, which the CSS also suppresses).
 */
function attachCardGestures(el: HTMLElement, card: Card, playable: boolean, ui: UIState, handlers: TableHandlers): void {
  if (!playable) return;
  let longPress = false;
  let moved = false;
  let sx = 0;
  let sy = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  el.addEventListener("pointerdown", (e) => {
    const pe = e as PointerEvent;
    longPress = false;
    moved = false;
    sx = pe.clientX;
    sy = pe.clientY;
    timer = setTimeout(() => (longPress = true), 450);
  });
  el.addEventListener("pointermove", (e) => {
    const pe = e as PointerEvent;
    if (Math.abs(pe.clientX - sx) > 12 || Math.abs(pe.clientY - sy) > 12) moved = true;
  });
  el.addEventListener("pointerup", (e) => {
    clearTimeout(timer);
    if (longPress || moved) return; // a hold or a drag never selects
    e.preventDefault();
    if (ui.selectedCard === card) {
      ui.selectedCard = null;
      handlers.play(card);
    } else {
      ui.selectedCard = card;
      handlers.rerender();
    }
  });
  el.addEventListener("pointercancel", () => clearTimeout(timer));
}

// --- Shared controls -------------------------------------------------------

function themeBtn(after: () => void): HTMLElement {
  const btn = h("button", { class: "icon-btn", title: "Theme" });
  const paint = () => btn.replaceChildren(icon(getTheme() === "dark" ? "sun" : "moon"));
  btn.addEventListener("click", () => {
    applyTheme(getTheme() === "dark" ? "light" : "dark");
    paint();
    after();
  });
  paint();
  return btn;
}

function langButton(after: () => void): HTMLElement {
  const btn = h("button", { class: "icon-btn", title: "Language" });
  const paint = () => (btn.textContent = getLang().toUpperCase());
  btn.addEventListener("click", () => {
    setLang(getLang() === "hr" ? "en" : "hr");
    paint();
    after();
  });
  paint();
  return btn;
}

function settingsMenu(handlers: TableHandlers): HTMLElement {
  const wrap = h("div", { class: "settings" });
  const panel = h("div", { class: "settings-panel" });
  const gear = h("button", { class: "icon-btn", title: "Settings", onclick: () => panel.classList.toggle("open") }, icon("gear"));

  const rebuild = () => {
    const s = t();
    clear(panel).append(
      settingRow(s.theme, [
        [s.light, getTheme() === "light", () => { applyTheme("light"); handlers.rerender(); }],
        [s.dark, getTheme() === "dark", () => { applyTheme("dark"); handlers.rerender(); }],
      ]),
      settingRow(s.language, [
        ["HR", getLang() === "hr", () => { setLang("hr"); handlers.rerender(); }],
        ["EN", getLang() === "en", () => { setLang("en"); handlers.rerender(); }],
      ]),
      settingRow(s.sorting, [
        [s.bySuit, getSort() === "suit", () => { setSort("suit"); handlers.rerender(); }],
        [s.bySize, getSort() === "size", () => { setSort("size"); handlers.rerender(); }],
      ]),
      settingRow(s.sound, [
        [s.on, !isMuted(), () => { if (isMuted()) toggleMuted(); handlers.rerender(); }],
        [s.off, isMuted(), () => { if (!isMuted()) toggleMuted(); handlers.rerender(); }],
      ]),
    );
  };
  rebuild();
  wrap.append(gear, panel);
  return wrap;
}

function settingRow(label: string, opts: Array<[string, boolean, () => void]>): HTMLElement {
  return h("div", { class: "set-row" },
    h("div", { class: "set-label" }, label),
    h("div", { class: "seg seg-sm" },
      ...opts.map(([txt, on, fn]) => h("button", { class: on ? "on" : "", onclick: fn }, txt)),
    ),
  );
}
