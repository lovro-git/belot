import "./ui/styles.css";
import { applyTheme } from "./ui/dom";
import { setLang, getLang } from "./ui/i18n";
import type { Config } from "./engine/types";
import { createGuest, createHost, resumeHost, type Client, type Identity } from "./net/room";
import type { ClientView } from "./net/protocol";
import { renderConnecting, renderLobby, renderTable, type TableHandlers, type UIState } from "./ui/screens";
import { play as playSfx } from "./ui/sound";

const root = document.getElementById("app")!;

applyTheme((localStorage.getItem("belot:theme") as "light" | "dark") ?? "light");
setLang(getLang());

// --- Identity --------------------------------------------------------------

function getIdentity(): Identity {
  let pid = localStorage.getItem("belot:pid");
  if (!pid) {
    pid = "p_" + randomKey(16);
    localStorage.setItem("belot:pid", pid);
  }
  const name = localStorage.getItem("belot:name") ?? "Igrač";
  return { playerId: pid, name };
}

function randomKey(len: number): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function roomFromHash(): string | null {
  const m = location.hash.match(/room=([A-Za-z0-9-]+)/);
  return m ? m[1] : null;
}
function linkFor(key: string): string {
  return `${location.origin}${location.pathname}#room=${key}`;
}
function isTestKey(key: string): boolean {
  return key.replace(/^BEL-/i, "").toUpperCase() === "TEST";
}

// --- App state -------------------------------------------------------------

let client: Client | null = null;
let view: ClientView | null = null;
const ui: UIState = { prevHand: 0, prevTrickCount: 0 };
let connectTimer: ReturnType<typeof setTimeout> | null = null;

function toast(text: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2000);
}

const handlers: TableHandlers = {
  chooseSeat: (seat) => client?.chooseSeat(seat),
  bid: (suit) => client?.bid(suit),
  play: (card) => client?.play(card),
  start: () => client?.start(),
  rematch: () => client?.rematch(),
  copyLink: () => {
    const key = roomFromHash();
    if (!key) return;
    navigator.clipboard?.writeText(linkFor(key)).then(
      () => toast("Poziv kopiran"),
      () => toast(linkFor(key)),
    );
  },
  leave: () => {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
    client?.leave();
    client = null;
    view = null;
    localStorage.removeItem("belot:hostkey");
    location.hash = "";
    showLobby("");
  },
  rerender: () => {
    if (view) renderTable(root, view, ui, handlers);
  },
};

function startClient(newClient: Client, roomKey: string) {
  client = newClient;
  view = null;
  location.hash = `room=${roomKey}`;

  if (!newClient.isHost) {
    renderConnecting(root, roomKey, handlers.leave);
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = setTimeout(() => {
      if (!view) renderConnecting(root, roomKey, handlers.leave, true);
    }, 10000);
  }

  newClient.onView((v) => {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    soundForView(view, v);
    view = v;
    renderTable(root, v, ui, handlers);
  });
}

/** Fire a sound for whatever changed between two consecutive views. */
function soundForView(prev: ClientView | null, v: ClientView) {
  if (!prev) return;
  const tricksPrev = prev.tricksWon[0] + prev.tricksWon[1];
  const tricksNow = v.tricksWon[0] + v.tricksWon[1];

  if (v.handNumber !== prev.handNumber && v.matchStarted) {
    playSfx("deal");
  } else if (tricksNow > tricksPrev) {
    playSfx("sweep"); // a trick was gathered
  } else if (v.currentTrick.length > prev.currentTrick.length) {
    playSfx("card"); // a card was played
  }

  if (v.belaAnnouncedTeam >= 0 && prev.belaAnnouncedTeam < 0) playSfx("bela");

  if (v.phase === "handScored" && prev.phase !== "handScored") playSfx("win");
  if (v.phase === "matchOver" && prev.phase !== "matchOver") playSfx("win");

  // Your turn just started (bidding or playing).
  if (v.actor >= 0 && v.actor === v.yourSeat && prev.actor !== v.yourSeat && (v.phase === "playing" || v.phase === "bidding")) {
    playSfx("turn");
  }
}

// --- Routing ---------------------------------------------------------------

function showLobby(err: string) {
  const me = getIdentity();
  renderLobby(root, roomFromHash() ?? "", err, {
    create: (name, target) => {
      const key = "BEL-" + randomKey(4);
      const config: Config = { target };
      localStorage.setItem("belot:hostkey", key);
      startClient(createHost(key, { playerId: me.playerId, name }, config), key);
    },
    join: (name, key) => {
      if (isTestKey(key)) {
        startTestRoom(name);
      } else {
        localStorage.removeItem("belot:hostkey");
        startClient(createGuest(key, { playerId: me.playerId, name }), key);
      }
    },
  });
}

function startTestRoom(name: string) {
  const me = getIdentity();
  localStorage.setItem("belot:hostkey", "TEST");
  startClient(createHost("TEST", { playerId: me.playerId, name }, { target: 1001 }), "TEST");
}

function boot() {
  const me = getIdentity();
  const room = roomFromHash();
  if (!room) {
    showLobby("");
    return;
  }
  if (isTestKey(room)) {
    startTestRoom(me.name && me.name !== "Igrač" ? me.name : "Ti");
    return;
  }
  const hostKey = localStorage.getItem("belot:hostkey");
  if (hostKey === room) {
    const resumed = resumeHost(room, { playerId: me.playerId, name: me.name });
    if (resumed) {
      startClient(resumed, room);
      return;
    }
  }
  if (me.name && me.name !== "Igrač") {
    startClient(createGuest(room, { playerId: me.playerId, name: me.name }), room);
  } else {
    showLobby("");
  }
}

boot();
