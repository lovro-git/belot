// Belot table sounds — Kenney "Casino Audio" card samples (CC0) played via the
// Web Audio API, plus a few synthesized chimes. No network at runtime; the
// audio context unlocks on the first user gesture. A mute toggle persists.

import cardSlide1 from "../assets/sfx/card-slide-1.ogg";
import cardSlide3 from "../assets/sfx/card-slide-3.ogg";
import cardPlace2 from "../assets/sfx/card-place-2.ogg";
import cardShove1 from "../assets/sfx/card-shove-1.ogg";
import cardShove3 from "../assets/sfx/card-shove-3.ogg";
import chipsCollide1 from "../assets/sfx/chips-collide-1.ogg";

export type Sfx = "deal" | "card" | "sweep" | "turn" | "bela" | "win";
type SampleSfx = "deal" | "card" | "sweep" | "win";

const EVENTS: Record<SampleSfx, { urls: string[]; gain: number }> = {
  deal: { urls: [cardShove1, cardShove3], gain: 0.7 }, // dealing the hand
  card: { urls: [cardSlide1, cardSlide3, cardPlace2], gain: 1.1 }, // playing a card
  sweep: { urls: [cardShove1], gain: 0.85 }, // gathering a won trick
  win: { urls: [chipsCollide1], gain: 1.0 }, // hand / match win (plus a chime)
};
const ALL_URLS = [...new Set(Object.values(EVENTS).flatMap((e) => e.urls))];

let ctx: AudioContext | null = null;
let muted = localStorage.getItem("belot:muted") === "1";
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

function ac(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

function load(url: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(url);
  if (cached) return Promise.resolve(cached);
  let p = loading.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ac().decodeAudioData(b))
      .then((buf) => {
        buffers.set(url, buf);
        return buf;
      })
      .catch(() => null);
    loading.set(url, p);
  }
  return p;
}

let warmed = false;
function resumeCtx(): void {
  const c = ac();
  if (c.state !== "running") void c.resume?.();
}
function unlock(): void {
  resumeCtx();
  if (warmed) return;
  warmed = true;
  for (const url of ALL_URLS) void load(url);
}
for (const ev of ["pointerdown", "keydown", "touchstart", "click"]) {
  window.addEventListener(ev, unlock, { passive: true });
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") resumeCtx();
});

export function isMuted(): boolean {
  return muted;
}
export function setMuted(m: boolean): void {
  muted = m;
  localStorage.setItem("belot:muted", m ? "1" : "0");
  if (!m) unlock();
}
export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

function playBuffer(buf: AudioBuffer, gain: number): void {
  const c = ac();
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(c.destination);
  src.start();
}

function tones(spec: Array<[number, number]>, type: OscillatorType = "triangle", peak = 0.17): void {
  const c = ac();
  const now = c.currentTime;
  for (const [freq, delay] of spec) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    const t = now + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.start(t);
    o.stop(t + 0.34);
  }
}

export function play(name: Sfx): void {
  if (muted) return;
  try {
    void ac().resume?.();
    if (name === "turn") return tones([[660, 0], [880, 0.11]], "sine");
    if (name === "bela") return tones([[784, 0], [988, 0.1], [1319, 0.2]], "triangle", 0.2);
    if (name === "win") tones([[523, 0], [659, 0.085], [784, 0.17], [1047, 0.255]]);
    const ev = EVENTS[name as SampleSfx];
    if (!ev) return;
    const url = ev.urls[Math.floor(Math.random() * ev.urls.length)];
    const buf = buffers.get(url);
    if (buf) playBuffer(buf, ev.gain);
    else void load(url).then((b) => b && !muted && playBuffer(b, ev.gain));
  } catch {
    /* audio unavailable — ignore */
  }
}
