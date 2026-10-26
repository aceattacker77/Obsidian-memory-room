// The music player spot plays songs from a folder on this computer (the Music folder by default).
// Desktop only: the folder lives outside the vault, so it is read with Node's fs.

export const AUDIO_EXTENSIONS = ["mp3", "m4a", "aac", "flac", "wav", "ogg", "oga", "opus", "webm"];

const MIME: Record<string, string> = {
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", wav: "audio/wav",
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", webm: "audio/webm",
};

export interface Track {
  /** Absolute path on disk. */
  path: string;
  title: string;
  /** Sub-folder of the music folder it sits in ("" at the top), usually the artist or album. */
  folder: string;
}

export interface DirEntry {
  name: string;
  dir: boolean;
}

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function isAudio(name: string): boolean {
  return AUDIO_EXTENSIONS.includes(ext(name));
}

/** "01 - Some_Song.mp3" → "Some Song". */
export function trackTitle(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
  return base.replace(/^\d{1,3}(\s*[-.]\s*|\s+)/, "").trim() || base;
}

/**
 * Every audio file under `root`, sorted by folder then name. Hidden folders are skipped and the walk
 * stops at `limit` files so a huge drive can't stall the app.
 */
export async function scanMusic(root: string, list: (dir: string) => Promise<DirEntry[]>, sep = "/", limit = 5000): Promise<Track[]> {
  const out: Track[] = [];
  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    if (depth > 6 || out.length >= limit) return;
    let entries: DirEntry[];
    try {
      entries = await list(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || out.length >= limit) continue;
      const path = dir + sep + e.name;
      if (e.dir) await walk(path, rel ? rel + "/" + e.name : e.name, depth + 1);
      else if (isAudio(e.name)) out.push({ path, title: trackTitle(e.name), folder: rel });
    }
  };
  await walk(root.replace(/[\\/]+$/, ""), "", 0);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return out.sort((a, b) => collator.compare(a.folder, b.folder) || collator.compare(a.path, b.path));
}

export function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export interface PlayerState {
  track?: Track;
  index: number;
  playing: boolean;
  time: number;
  duration: number;
  /** 0..1 */
  volume: number;
  muted: boolean;
}

/**
 * One audio element for the whole plugin, so music keeps playing when the room tab is closed or
 * hidden. Files are read into a Blob, since the app's pages can't load file:// URLs directly.
 */
export class MusicPlayer {
  readonly audio = new Audio();
  tracks: Track[] = [];
  index = -1;
  private url?: string;
  private listeners = new Set<() => void>();
  private loading = 0;

  constructor(private read: (path: string) => Promise<ArrayBuffer | Uint8Array>) {
    this.audio.preload = "auto";
    for (const ev of ["play", "pause", "loadedmetadata", "timeupdate", "volumechange"]) this.audio.addEventListener(ev, () => this.emit());
    this.audio.addEventListener("ended", () => void this.next());
  }

  get state(): PlayerState {
    return {
      track: this.tracks[this.index], index: this.index, playing: !this.audio.paused,
      time: this.audio.currentTime || 0, duration: this.audio.duration || 0,
      volume: this.audio.volume, muted: this.audio.muted,
    };
  }

  /** Called on every change; returns the unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  setTracks(tracks: Track[]): void {
    const current = this.tracks[this.index]?.path;
    this.tracks = tracks;
    this.index = current ? tracks.findIndex((t) => t.path === current) : -1;
    this.emit();
  }

  async play(index: number): Promise<void> {
    const t = this.tracks[index];
    if (!t) return;
    const ticket = ++this.loading;
    const data = await this.read(t.path);
    if (ticket !== this.loading) return; // a later click won
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(new Blob([data as BlobPart], { type: MIME[ext(t.path)] ?? "audio/*" }));
    this.index = index;
    this.audio.src = this.url;
    await this.audio.play();
    this.emit();
  }

  async toggle(): Promise<void> {
    if (this.index < 0) return this.play(0);
    if (this.audio.paused) await this.audio.play();
    else this.audio.pause();
  }

  async next(): Promise<void> {
    if (this.tracks.length) await this.play((this.index + 1) % this.tracks.length);
  }

  /** Back to the start of the song, or to the previous song when already near the start. */
  async previous(): Promise<void> {
    if (!this.tracks.length) return;
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    await this.play((this.index - 1 + this.tracks.length) % this.tracks.length);
  }

  seek(seconds: number): void {
    if (isFinite(this.audio.duration)) this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
  }

  setVolume(v: number): void {
    this.audio.volume = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
    if (this.audio.volume > 0) this.audio.muted = false;
  }

  toggleMute(): void {
    this.audio.muted = !this.audio.muted;
  }

  dispose(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.listeners.clear();
  }
}
