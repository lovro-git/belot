import { rankOf, suitOf, type Card, type Suit } from "../engine/cards";
import { h } from "./dom";

function rankLabel(card: Card): string {
  const r = rankOf(card);
  return r === "T" ? "10" : r;
}

// Inline SVG suit paths — Font Awesome Free lacks club/spade, so we draw our own.
const SUIT_PATH: Record<Suit, string> = {
  h: "M12 20.5C6.5 16 3 12.9 3 9.1 3 6.3 5.2 4 8 4c1.7 0 3.2.9 4 2.2C12.8 4.9 14.3 4 16 4c2.8 0 5 2.3 5 5.1 0 3.8-3.5 6.9-9 11.4z",
  d: "M12 3l6.5 9L12 21 5.5 12z",
  s: "M12 3C8.5 7.2 4.5 9.8 4.5 13.6c0 2.2 1.7 3.9 3.9 3.9 1 0 1.9-.4 2.6-1-.1 1.9-1 3.4-2.6 4.5h7.2c-1.6-1.1-2.5-2.6-2.6-4.5.7.6 1.6 1 2.6 1 2.2 0 3.9-1.7 3.9-3.9C19.5 9.8 15.5 7.2 12 3z",
  c: "M12 3.2a3.1 3.1 0 0 0-2.55 4.86A3.1 3.1 0 1 0 8.9 14.1c.83 0 1.58-.32 2.14-.85-.13 1.9-1 3.35-2.54 4.55h7c-1.54-1.2-2.41-2.65-2.54-4.55.56.53 1.31.85 2.14.85a3.1 3.1 0 1 0-.55-6.04A3.1 3.1 0 0 0 12 3.2z",
};

export function suitIcon(suit: Suit): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "suit-svg");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", SUIT_PATH[suit]);
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

export interface CardOpts {
  faceDown?: boolean;
  small?: boolean;
  big?: boolean;
  dim?: boolean; // illegal / not playable — greyed
  slot?: boolean; // empty placeholder outline
  playable?: boolean; // legal to play — gets hover lift + pointer
  anim?: boolean;
  onClick?: () => void;
}

/** Build a single belot card element. */
export function cardEl(card: Card | null, opts: CardOpts = {}): HTMLElement {
  const size = opts.big ? "card--big" : opts.small ? "card--sm" : "";
  const anim = opts.anim ? "card--deal" : "";
  if (opts.slot) return h("div", { class: `card card--slot ${size}`.trim() });
  if (!card || opts.faceDown) {
    return h("div", { class: `card card--back ${size} ${anim}`.trim() }, h("div", { class: "card-weave" }));
  }
  const suit = suitOf(card);
  const red = suit === "h" || suit === "d";
  const cls = `card ${red ? "card--red" : "card--black"} ${size} ${anim} ${opts.dim ? "is-dim" : ""} ${opts.playable ? "card--play" : ""}`;
  return h(
    "div",
    { class: cls.trim().replace(/\s+/g, " "), ...(opts.onClick ? { onclick: opts.onClick } : {}) },
    h("div", { class: "card-corner" }, h("span", { class: "card-rank" }, rankLabel(card)), h("span", { class: "card-csuit" }, suitIcon(suit))),
    h("div", { class: "card-pip" }, suitIcon(suit)),
  );
}
