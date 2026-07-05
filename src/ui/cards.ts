import { rankOf, suitOf, type Card, type Suit } from "../engine/cards";
import { h } from "./dom";

function rankLabel(card: Card): string {
  const r = rankOf(card);
  return r === "T" ? "10" : r;
}

// Mađarice (German-suited / Hungarian Tell deck) suits, drawn as inline SVG:
//   s → Leaves (zelje/list) · h → Hearts (herc/srce) ·
//   d → Bells (zvona/bundeve) · c → Acorns (žir/želudi)
const SUIT_PATH: Record<Suit, string> = {
  h: "M12 20.5C6.5 16 3 12.9 3 9.1 3 6.3 5.2 4 8 4c1.7 0 3.2.9 4 2.2C12.8 4.9 14.3 4 16 4c2.8 0 5 2.3 5 5.1 0 3.8-3.5 6.9-9 11.4z",
  s: "M12 3C9 7 5.5 9.5 5.5 13.4A4.4 4.4 0 0 0 11 17.6V21h2v-3.4a4.4 4.4 0 0 0 5.5-4.2C18.5 9.5 15 7 12 3z",
  d: "M12 2.5a1.6 1.6 0 0 0-1.5 2C7.8 5.4 6.3 7.9 6.3 11.1c0 3-1 4.6-2.1 5.6h15.6c-1.1-1-2.1-2.6-2.1-5.6 0-3.2-1.5-5.7-4.2-6.6a1.6 1.6 0 0 0-1.5-2zM9.7 18.1a2.3 2.3 0 0 0 4.6 0z",
  c: "M8.1 6.6c0-1.4 1.75-2.4 3.9-2.4s3.9 1 3.9 2.4-1.75 2.1-3.9 2.1S8.1 8 8.1 6.6zM8.5 9.3h7c.5 0 .82.42.72.92-.82 4.1-2.36 7.55-4.22 10.08-1.86-2.53-3.4-5.98-4.22-10.08-.1-.5.22-.92.72-.92z",
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
  const cls = `card sc-${suit} ${size} ${anim} ${opts.dim ? "is-dim" : ""} ${opts.playable ? "card--play" : ""}`;
  const corner = (extra = "") =>
    h("div", { class: `card-corner ${extra}`.trim() }, h("span", { class: "card-rank" }, rankLabel(card)), h("span", { class: "card-csuit" }, suitIcon(suit)));
  return h(
    "div",
    { class: cls.trim().replace(/\s+/g, " "), ...(opts.onClick ? { onclick: opts.onClick } : {}) },
    corner(),
    h("div", { class: "card-pip" }, suitIcon(suit)),
    opts.small ? null : corner("card-corner--br"),
  );
}
