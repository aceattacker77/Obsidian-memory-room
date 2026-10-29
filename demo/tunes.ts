// Three short lo-fi loops, synthesised in the browser on first play, so the demo's music player has
// something to play without shipping audio files. Each is rendered offline and encoded as a WAV.

export interface Tune {
  title: string;
  bpm: number;
  /** Chords as MIDI note lists, one per bar. */
  chords: number[][];
  seed: number;
}

export const TUNES: Tune[] = [
  { title: "Rain on the window", bpm: 72, seed: 1, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [50, 53, 57, 60], [52, 55, 59, 62]] },
  { title: "Cat nap", bpm: 66, seed: 2, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]] },
  { title: "Tea at sunset", bpm: 78, seed: 3, chords: [[53, 57, 60, 64], [55, 58, 62, 65], [57, 60, 64, 67], [52, 55, 59, 64]] },
];

const RATE = 22050;
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function rng(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

export async function renderTune(t: Tune, loops = 4): Promise<ArrayBuffer> {
  const beat = 60 / t.bpm;
  const bar = beat * 4;
  const length = bar * t.chords.length * loops + 2;
  const ctx = new OfflineAudioContext(2, Math.ceil(length * RATE), RATE);
  const rand = rng(t.seed);

  const master = ctx.createGain();
  master.gain.value = 0.5;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2400;
  tone.connect(master);
  master.connect(ctx.destination);

  const noise = ctx.createBuffer(1, RATE, RATE);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rand() * 2 - 1;

  // Vinyl crackle under everything.
  const crackle = ctx.createBufferSource();
  crackle.buffer = noise;
  crackle.loop = true;
  const cf = ctx.createBiquadFilter();
  cf.type = "highpass";
  cf.frequency.value = 3000;
  const cg = ctx.createGain();
  cg.gain.value = 0.025;
  crackle.connect(cf).connect(cg).connect(master);
  crackle.start(0);

  const note = (freq: number, at: number, dur: number, vol: number, type: OscillatorType) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = (rand() - 0.5) * 12;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + Math.min(0.08, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(tone);
    o.start(at);
    o.stop(at + dur + 0.05);
  };
  const drum = (at: number, kind: "kick" | "hat" | "snare") => {
    if (kind === "kick") {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, at);
      o.frequency.exponentialRampToValueAtTime(45, at + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
      o.connect(g).connect(master);
      o.start(at);
      o.stop(at + 0.4);
      return;
    }
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = kind === "hat" ? "highpass" : "bandpass";
    f.frequency.value = kind === "hat" ? 7000 : 1800;
    const g = ctx.createGain();
    const len = kind === "hat" ? 0.05 : 0.18;
    g.gain.setValueAtTime(kind === "hat" ? 0.12 : 0.3, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    s.connect(f).connect(g).connect(master);
    s.start(at, rand() * 0.5, len + 0.02);
  };

  let time = 0.2;
  for (let l = 0; l < loops; l++) {
    for (const chord of t.chords) {
      for (const n of chord) note(hz(n), time, bar * 0.95, 0.07, "triangle");
      note(hz(chord[0] - 12), time, bar * 0.9, 0.16, "sine");
      for (let b = 0; b < 4; b++) {
        const at = time + b * beat;
        if (b === 0 || (b === 2 && rand() > 0.3)) drum(at, "kick");
        if (b === 1 || b === 3) drum(at + 0.02, "snare");
        drum(at, "hat");
        drum(at + beat / 2 + 0.03, "hat");
        // A lazy melody on top, from the chord's notes.
        if (l > 0 && rand() > 0.45) note(hz(chord[Math.floor(rand() * chord.length)] + 12), at + (rand() > 0.5 ? beat / 2 : 0), beat * 0.9, 0.05, "sine");
      }
      time += bar;
    }
  }
  return wav(await ctx.startRendering());
}

function wav(buf: AudioBuffer): ArrayBuffer {
  const ch = buf.numberOfChannels, n = buf.length;
  const out = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(out);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * ch * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}
