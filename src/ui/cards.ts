import { rankOf, suitOf, type Card, type Suit } from "../engine/cards";
import { h } from "./dom";

// Real mađarice (Hungarian Tell-pattern) card art, bundled as transparent PNGs.
// Source: github.com/tomasdrus/hungarian-playing-cards (Tell pattern, public domain).
const CARD_IMAGES = import.meta.glob("../assets/cards/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const SUIT_IMAGES = import.meta.glob("../assets/suits/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const SUIT_NAME: Record<Suit, string> = { s: "leaf", h: "heart", d: "bell", c: "acorn" };
const RANK_NAME: Record<string, string> = { "7": "seven", "8": "eight", "9": "nine", T: "ten", J: "unter", Q: "ober", K: "king", A: "ace" };

function cardUrl(card: Card): string {
  return CARD_IMAGES[`../assets/cards/${SUIT_NAME[suitOf(card)]}-${RANK_NAME[rankOf(card)]}.png`];
}
const BACK_URL = CARD_IMAGES["../assets/cards/back.png"];

/** URL of the face-down card back. */
export function backImage(): string {
  return BACK_URL;
}

/** A mađarice suit icon (leaf / heart / bell / acorn) as an <img>. */
export function suitIcon(suit: Suit): HTMLElement {
  return h("img", { class: "suit-img", src: SUIT_IMAGES[`../assets/suits/${SUIT_NAME[suit]}.png`], alt: "", draggable: "false" });
}

export interface CardOpts {
  faceDown?: boolean;
  small?: boolean;
  big?: boolean;
  dim?: boolean; // illegal / not playable — greyed
  slot?: boolean; // empty placeholder outline
  playable?: boolean; // legal to play — hover lift + pointer
  selected?: boolean; // tapped, awaiting confirmation — raised
  anim?: boolean;
  onClick?: () => void;
}

/** Build a single belot card element backed by the real mađarice art. */
export function cardEl(card: Card | null, opts: CardOpts = {}): HTMLElement {
  const size = opts.big ? "card--big" : opts.small ? "card--sm" : "";
  const anim = opts.anim ? "card--deal" : "";
  if (opts.slot) return h("div", { class: `card card--slot ${size}`.trim() });
  if (!card || opts.faceDown) {
    return h("div", { class: `card card--img ${size} ${anim}`.trim() }, h("img", { class: "card-face", src: BACK_URL, alt: "", draggable: "false" }));
  }
  const cls = `card card--img ${size} ${anim} ${opts.dim ? "is-dim" : ""} ${opts.playable ? "card--play" : ""} ${opts.selected ? "is-selected" : ""}`;
  return h(
    "div",
    { class: cls.trim().replace(/\s+/g, " "), ...(opts.onClick ? { onclick: opts.onClick } : {}) },
    h("img", { class: "card-face", src: cardUrl(card), alt: card, draggable: "false" }),
  );
}
