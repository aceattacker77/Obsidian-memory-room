// Light moods, ported from the game's src/room/mood.gd. Sunset is the day default (ref 07) and
// night is the neon look (ref 05), per notes/memory-room/STYLE.md.

export type MoodId = "morning" | "afternoon" | "sunset" | "night";

export interface Mood {
  id: MoodId;
  label: string;
  /** Radial backdrop: centre colour, edge colour. */
  backdrop: [string, string];
  ambient: number;
  ambientEnergy: number;
  sun: number;
  sunEnergy: number;
  /** Sun direction as azimuth/elevation in degrees. */
  sunAz: number;
  sunEl: number;
  /** 0..1: how strongly lamps, LEDs, screens and neon glow. */
  glow: number;
  sky: [string, string];
}

export const MOODS: Record<MoodId, Mood> = {
  morning: {
    id: "morning", label: "Morning", backdrop: ["#f3e6dc", "#b9a7c4"],
    ambient: 0xaaa3c8, ambientEnergy: 1.1, sun: 0xffddb4, sunEnergy: 2.2, sunAz: 62, sunEl: 30,
    glow: 0.1, sky: ["#bfe0f5", "#f7e3c8"],
  },
  afternoon: {
    id: "afternoon", label: "Afternoon", backdrop: ["#efe4d6", "#a99bbd"],
    ambient: 0xa094bc, ambientEnergy: 1.2, sun: 0xfff0d6, sunEnergy: 2.8, sunAz: 18, sunEl: 64,
    glow: 0.05, sky: ["#8fc3ea", "#dcecf6"],
  },
  sunset: {
    id: "sunset", label: "Sunset", backdrop: ["#f6c9a4", "#5b3f63"],
    ambient: 0x8f7aa8, ambientEnergy: 1.0, sun: 0xffc88a, sunEnergy: 2.6, sunAz: 35, sunEl: 22,
    glow: 0.45, sky: ["#f59a6b", "#6a4b8a"],
  },
  night: {
    id: "night", label: "Night", backdrop: ["#1c2240", "#06070f"],
    ambient: 0x5a6c93, ambientEnergy: 0.45, sun: 0x9fb6e8, sunEnergy: 0.35, sunAz: -52, sunEl: 38,
    glow: 1.0, sky: ["#0b1026", "#1d2450"],
  },
};

export function moodForHour(h: number): MoodId {
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "afternoon";
  if (h >= 17 && h < 20) return "sunset";
  return "night";
}

// The light through a day, in local hours. Between two keyframes the moods blend, so the room
// brightens at dawn and dims into night gradually rather than switching on the hour.
const DAY: [number, MoodId][] = [
  [0, "night"], [5, "night"], [7, "morning"], [10.5, "morning"], [12, "afternoon"],
  [16.5, "afternoon"], [18, "sunset"], [19.25, "sunset"], [20.5, "night"], [24, "night"],
];

function lerpHex(a: number, b: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 255, cb = (b >> shift) & 255;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}

function lerpCss(a: string, b: string, t: number): string {
  const n = lerpHex(parseInt(a.slice(1), 16), parseInt(b.slice(1), 16), t);
  return "#" + n.toString(16).padStart(6, "0");
}

/** A mood part way from a to b. It takes the id (and so the sky's stars and lit windows) of whichever is nearer. */
export function blendMoods(a: Mood, b: Mood, t: number): Mood {
  if (t <= 0 || a === b) return a;
  if (t >= 1) return b;
  const n = (x: number, y: number) => x + (y - x) * t;
  const near = t < 0.5 ? a : b;
  return {
    id: near.id, label: near.label,
    backdrop: [lerpCss(a.backdrop[0], b.backdrop[0], t), lerpCss(a.backdrop[1], b.backdrop[1], t)],
    ambient: lerpHex(a.ambient, b.ambient, t), ambientEnergy: n(a.ambientEnergy, b.ambientEnergy),
    sun: lerpHex(a.sun, b.sun, t), sunEnergy: n(a.sunEnergy, b.sunEnergy),
    sunAz: n(a.sunAz, b.sunAz), sunEl: n(a.sunEl, b.sunEl),
    glow: n(a.glow, b.glow),
    sky: [lerpCss(a.sky[0], b.sky[0], t), lerpCss(a.sky[1], b.sky[1], t)],
  };
}

/** The light for a moment on the computer's own clock. */
export function moodAt(d: Date): Mood {
  const h = d.getHours() + d.getMinutes() / 60;
  for (let i = 1; i < DAY.length; i++) {
    const [h1, m1] = DAY[i];
    if (h < h1) {
      const [h0, m0] = DAY[i - 1];
      return blendMoods(MOODS[m0], MOODS[m1], (h - h0) / (h1 - h0));
    }
  }
  return MOODS.night;
}

/** Hand angles for a wall clock, in radians clockwise from twelve. The second hand sweeps. */
export function clockAngles(d: Date): { hour: number; minute: number; second: number } {
  const s = d.getSeconds() + d.getMilliseconds() / 1000;
  const m = d.getMinutes() + s / 60;
  const h = (d.getHours() % 12) + m / 60;
  const turn = Math.PI * 2;
  return { hour: (h / 12) * turn, minute: (m / 60) * turn, second: (s / 60) * turn };
}
