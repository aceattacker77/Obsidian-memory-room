// The room's overlay UI, in plain DOM so it runs both inside Obsidian and in the screenshot harness:
// a top spot bar, a left rail (Walk, Find, Light, Reset view) and a side panel that lists a spot's
// memories. Anything Obsidian does natively (opening notes, hover previews, the file menu, rendering
// Markdown, finding a memory) is handed back to the host.

import { RoomScene } from "./scene";
import { SPOTS, SpotDef, spotsInWalkOrder } from "./spots";
import { Memory, isFaded, search } from "./memories";
import { MOODS, MoodId } from "./mood";
import { MusicPlayer, Track, formatTime } from "./music";

export interface RoomHost {
  /** Open a note; the event carries Obsidian's usual modifiers (Ctrl new tab, Ctrl-Alt split…). */
  openNote(path: string, evt?: MouseEvent | KeyboardEvent): void;
  /** Render a short preview of the note into `el`. */
  renderPreview(path: string, el: HTMLElement): Promise<void>;
  /** Native page preview on hover. */
  hover?(path: string, evt: MouseEvent, target: HTMLElement): void;
  /** Native file context menu. */
  fileMenu?(path: string, evt: MouseEvent): void;
  /** Native fuzzy finder; when absent the panel's own search is used. */
  find?(): void;
  onMoodChange?(mood: MoodId | "auto"): void;
  onSpotChange?(spot?: string): void;
  /** The music player spot's songs; absent where there is no local music folder (mobile). */
  music?: { player: MusicPlayer; folder(): string; rescan(): Promise<void>; chooseFolder(): Promise<void> };
  /** The pet's glTF model, when the room has one. */
  petModel?(): Promise<ArrayBuffer | undefined>;
  fadeDays: number;
  mood: MoodId | "auto";
  now(): number;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

function ago(now: number, t: number): string {
  const d = Math.floor((now - t) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} years ago`;
}

export class RoomUI {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  readonly scene: RoomScene;
  private panel: HTMLElement;
  private tooltip: HTMLElement;
  private bySpot = new Map<string, Memory[]>();
  private all: Memory[] = [];
  private walkIndex = -1;
  private mood: MoodId | "auto";
  private currentSpot?: string;
  private ro?: ResizeObserver;
  private musicOff?: () => void;
  private musicDance?: () => void;

  constructor(parent: HTMLElement, private host: RoomHost) {
    this.root = el("div", "memory-room", parent);
    this.stage = el("div", "mr-stage", this.root);
    this.scene = new RoomScene(this.stage);
    this.mood = host.mood;
    if (this.mood === "auto") this.scene.setAutoLight(true);
    else this.scene.setMood(this.mood);

    this.buildTopBar();
    this.buildRail();
    this.panel = el("div", "mr-panel", this.root);
    this.tooltip = el("div", "mr-tooltip", this.root);
    this.showIdle();
    this.bindPointer();

    // Also restarts the render loop when a hidden tab becomes visible again.
    this.ro = new ResizeObserver(() => this.scene.resize());
    this.ro.observe(this.stage);
    host.petModel?.().then((data) => { if (data) return this.scene.setPet(data); }).catch((e) => console.error("Memory Room: pet", e));
    const music = host.music?.player;
    if (music) this.musicDance = music.subscribe(() => this.scene.setMusicPlaying(music.state.playing));
  }

  get memories(): Memory[] {
    return this.all;
  }

  get spot(): string | undefined {
    return this.currentSpot;
  }

  get currentMood(): MoodId | "auto" {
    return this.mood;
  }

  setMemories(bySpot: Map<string, Memory[]>): void {
    this.bySpot = bySpot;
    this.all = [...bySpot.values()].flat();
    const now = this.host.now();
    this.scene.setMemories(bySpot, (m) => isFaded(m, now, this.host.fadeDays));
    for (const s of SPOTS) {
      const badge = this.root.querySelector(`[data-spot="${s.id}"] .mr-count`);
      if (badge) badge.textContent = String(bySpot.get(s.id)?.length ?? 0);
    }
    if (this.currentSpot && this.panel.dataset.view === "spot") this.openSpotById(this.currentSpot);
    else if (this.panel.dataset.view === "idle") this.showIdle();
  }

  setMood(id: MoodId | "auto"): void {
    this.mood = id;
    this.scene.setAutoLight(id === "auto");
    if (id !== "auto") this.scene.setMood(id);
    const sel = this.root.querySelector<HTMLSelectElement>(".mr-mood");
    if (sel) sel.value = id;
    this.host.onMoodChange?.(id);
  }

  private buildTopBar(): void {
    const bar = el("div", "mr-topbar", this.root);
    for (const s of spotsInWalkOrder()) {
      const b = el("button", "mr-spot", bar);
      b.dataset.spot = s.id;
      el("span", "mr-walk", b, String(s.walk));
      el("span", "mr-label", b, s.label);
      el("span", "mr-count", b, "0");
      b.setAttribute("aria-label", `${s.label}: ${s.kinds.join(", ")}`);
      b.onclick = () => this.openSpot(s);
      b.onmouseenter = () => this.scene.highlight(s.id);
      b.onmouseleave = () => this.scene.highlight(undefined);
    }
  }

  private buildRail(): void {
    this.buildPad();
    const rail = el("div", "mr-rail", this.root);
    const walk = el("button", "mr-btn", rail, "Walk");
    walk.onclick = () => this.walk(1);
    const find = el("button", "mr-btn", rail, "Find");
    find.onclick = () => (this.host.find ? this.host.find() : this.showSearch());
    const reset = el("button", "mr-btn", rail, "Reset view");
    reset.onclick = () => this.resetView();
    const mood = el("select", "mr-mood mr-btn", rail);
    el("option", "", mood, "Your time").value = "auto";
    for (const m of Object.values(MOODS)) {
      const o = el("option", "", mood, m.label);
      o.value = m.id;
    }
    mood.value = this.mood;
    mood.onchange = () => this.setMood(mood.value as MoodId | "auto");
  }

  /** Bottom-left pad: arrows to move the view, arrows to turn and tilt it, and zoom. Hold to repeat. */
  private buildPad(): void {
    const pad = el("div", "mr-pad", this.root);
    const btn = (parent: HTMLElement, label: string, icon: string, act: () => void, area: string) => {
      const b = el("button", "mr-pad-btn", parent, icon);
      b.setAttribute("aria-label", label);
      b.title = label;
      b.style.gridArea = area;
      let timer: number | undefined;
      const stop = () => { window.clearInterval(timer); timer = undefined; };
      b.onpointerdown = (e) => {
        e.preventDefault();
        act();
        stop();
        timer = window.setInterval(act, 110);
      };
      b.onpointerup = b.onpointerleave = b.onpointercancel = stop;
      b.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } };
    };
    const group = (title: string) => {
      const g = el("div", "mr-pad-group", pad);
      el("div", "mr-pad-title", g, title);
      return el("div", "mr-pad-grid", g);
    };
    const move = group("Move");
    btn(move, "Move view up", "▲", () => this.scene.pan(0, 1), "u");
    btn(move, "Move view left", "◀", () => this.scene.pan(-1, 0), "l");
    btn(move, "Move view right", "▶", () => this.scene.pan(1, 0), "r");
    btn(move, "Move view down", "▼", () => this.scene.pan(0, -1), "d");
    btn(move, "Zoom in", "+", () => this.scene.zoomBy(1.12), "tr");
    btn(move, "Zoom out", "−", () => this.scene.zoomBy(1 / 1.12), "br");
    const turn = group("Angle");
    btn(turn, "Tilt down onto the room", "▲", () => this.scene.orbit(0, 4), "u");
    btn(turn, "Turn left", "↺", () => this.scene.orbit(-5, 0), "l");
    btn(turn, "Turn right", "↻", () => this.scene.orbit(5, 0), "r");
    btn(turn, "Tilt to look across", "▼", () => this.scene.orbit(0, -4), "d");
    btn(turn, "Reset view", "⟲", () => this.resetView(), "c");
  }

  private memoryAt(e: MouseEvent): { spot?: SpotDef; memory?: Memory } {
    const p = this.scene.pick(e.clientX, e.clientY);
    return {
      spot: p.spot ? SPOTS.find((x) => x.id === p.spot) : undefined,
      memory: p.memory ? this.all.find((x) => x.path === p.memory) : undefined,
    };
  }

  private bindPointer(): void {
    const canvas = this.scene.renderer.domElement;
    let down: { x: number; y: number; moved: boolean } | undefined;
    let hovered: string | undefined;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
        if (down.moved) {
          this.scene.orbit(-dx * 0.25, dy * 0.15);
          down.x = e.clientX;
          down.y = e.clientY;
        }
        return;
      }
      const { spot, memory } = this.memoryAt(e);
      this.scene.highlight(spot?.id);
      canvas.style.cursor = spot || this.scene.doorAt(e.clientX, e.clientY) ? "pointer" : "grab";
      if (spot) {
        this.tooltip.textContent = memory ? memory.title : `${spot.label} (${this.bySpot.get(spot.id)?.length ?? 0})`;
        const r = this.root.getBoundingClientRect();
        this.tooltip.style.left = `${e.clientX - r.left + 14}px`;
        this.tooltip.style.top = `${e.clientY - r.top + 10}px`;
        this.tooltip.classList.add("is-visible");
      } else {
        this.tooltip.classList.remove("is-visible");
      }
      // Hand memory hovers to Obsidian's page preview (it decides whether Ctrl is needed).
      if (memory && memory.path !== hovered) this.host.hover?.(memory.path, e, canvas);
      hovered = memory?.path;
    });
    canvas.addEventListener("pointerup", (e) => {
      if (e.button !== 0) return;
      const wasDrag = down?.moved;
      down = undefined;
      if (wasDrag) return;
      if (this.scene.petAt(e.clientX, e.clientY)) { this.scene.petGreet(); return; }
      if (this.scene.doorAt(e.clientX, e.clientY)) { this.scene.toggleDoor(); return; }
      const { spot, memory } = this.memoryAt(e);
      if (memory) {
        // A modifier opens the note straight away, like a link; a plain click shows it in the panel.
        if (e.ctrlKey || e.metaKey) this.host.openNote(memory.path, e);
        else this.showMemory(memory.path);
      } else if (spot) {
        this.openSpot(spot);
      } else if (this.panel.dataset.view !== "idle") {
        // A tap on empty floor closes the panel, the way tapping outside a sheet dismisses it.
        this.resetView();
      }
    });
    canvas.addEventListener("auxclick", (e) => {
      if (e.button !== 1) return;
      const { memory } = this.memoryAt(e);
      if (memory) this.host.openNote(memory.path, e);
    });
    canvas.addEventListener("contextmenu", (e) => {
      const { memory } = this.memoryAt(e);
      if (memory && this.host.fileMenu) {
        e.preventDefault();
        this.host.fileMenu(memory.path, e);
      }
    });
    canvas.addEventListener("pointerleave", () => {
      this.tooltip.classList.remove("is-visible");
      this.scene.highlight(undefined);
      hovered = undefined;
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.scene.zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
    }, { passive: false });
  }

  private clearPanel(view: string): HTMLElement {
    this.musicOff?.();
    this.musicOff = undefined;
    this.panel.replaceChildren();
    this.panel.dataset.view = view;
    this.panel.classList.add("is-open");
    // Anything but the idle card can be dismissed, which also pulls the camera back out, so a phone
    // has a way back from a spot without hunting for Reset view behind the panel.
    if (view !== "idle") {
      const close = el("button", "mr-close", this.panel, "✕");
      close.setAttribute("aria-label", "Close and reset the view");
      close.onclick = () => this.resetView();
    }
    return this.panel;
  }

  private setSpot(id?: string): void {
    this.currentSpot = id;
    // Mark the spot on the top bar and scroll it into view, since the bar is wider than a phone.
    this.root.querySelectorAll<HTMLElement>(".mr-spot").forEach((b) => {
      const on = b.dataset.spot === id;
      b.classList.toggle("is-active", on);
      if (on) b.scrollIntoView({ block: "nearest", inline: "center" });
    });
    this.host.onSpotChange?.(id);
  }

  private showIdle(): void {
    const p = this.clearPanel("idle");
    el("div", "mr-title", p, "Memory Room");
    const total = this.all.length;
    el("div", "mr-sub", p, total ? `${total} memories in ${SPOTS.length} spots. Click a spot, or press Walk to visit them in order.` : "Click a spot, or press Walk to visit them in order.");
  }

  resetView(): void {
    this.walkIndex = -1;
    this.setSpot(undefined);
    this.scene.focusMemory(undefined);
    this.scene.resetView();
    this.showIdle();
  }

  openSpotById(id: string): void {
    const s = SPOTS.find((x) => x.id === id);
    if (s) this.openSpot(s);
  }

  openSpot(s: SpotDef): void {
    this.walkIndex = spotsInWalkOrder().findIndex((x) => x.id === s.id);
    this.setSpot(s.id);
    this.scene.focusMemory(undefined);
    this.scene.flyTo(s);
    const p = this.clearPanel("spot");
    const head = el("div", "mr-head", p);
    el("span", "mr-walk", head, String(s.walk));
    el("div", "mr-title", head, s.label);
    const list = this.bySpot.get(s.id) ?? [];
    const withMusic = s.id === "music_player" && !!this.host.music;
    if (withMusic) this.renderMusic(p);
    if (list.length || !withMusic) el("div", "mr-sub", p, list.length ? `${list.length} ${list.length === 1 ? "memory" : "memories"} (${s.kinds.join(", ")})` : `Empty. This spot holds ${s.kinds.join(", ")}.`);
    this.renderList(p, list);
    const nav = el("div", "mr-nav", p);
    const prev = el("button", "mr-btn", nav, "← Previous");
    prev.onclick = () => this.walk(-1);
    const next = el("button", "mr-btn", nav, "Next →");
    next.onclick = () => this.walk(1);
  }

  /** Now playing, controls, a seek bar and the songs in the music folder. */
  private renderMusic(p: HTMLElement): void {
    const music = this.host.music!;
    const player = music.player;
    const box = el("div", "mr-music", p);
    const now = el("div", "mr-music-now", box);
    const title = el("div", "mr-item-title", now);
    const sub = el("div", "mr-item-meta", now);
    const controls = el("div", "mr-music-controls", box);
    const prev = el("button", "mr-btn", controls, "⏮");
    prev.setAttribute("aria-label", "Previous song");
    const play = el("button", "mr-btn mr-music-play", controls);
    const next = el("button", "mr-btn", controls, "⏭");
    next.setAttribute("aria-label", "Next song");
    prev.onclick = () => void player.previous();
    play.onclick = () => void player.toggle();
    next.onclick = () => void player.next();
    const seekRow = el("div", "mr-music-seek", box);
    const at = el("span", "mr-item-meta", seekRow);
    const seek = el("input", "mr-music-range", seekRow);
    seek.type = "range";
    seek.min = "0";
    seek.step = "1";
    const len = el("span", "mr-item-meta", seekRow);
    let dragging = false;
    seek.oninput = () => { dragging = true; at.textContent = formatTime(+seek.value); };
    seek.onchange = () => { dragging = false; player.seek(+seek.value); };

    const volRow = el("div", "mr-music-seek", box);
    const mute = el("button", "mr-btn mr-music-mute", volRow);
    mute.onclick = () => player.toggleMute();
    const vol = el("input", "mr-music-range", volRow);
    vol.type = "range";
    vol.min = "0";
    vol.max = "100";
    vol.setAttribute("aria-label", "Volume");
    vol.oninput = () => player.setVolume(+vol.value / 100);
    const volPct = el("span", "mr-item-meta mr-music-pct", volRow);

    const folderRow = el("div", "mr-music-folder", box);
    const folderName = el("div", "mr-item-meta", folderRow);
    const change = el("button", "mr-btn", folderRow, "Change folder");
    change.onclick = () => void music.chooseFolder();

    const filter = el("input", "mr-search", box);
    filter.type = "search";
    filter.placeholder = "Filter songs…";
    const listEl = el("div", "mr-list mr-tracks", box);
    let shown: Track[] | undefined;
    const SHOW = 300;
    const drawList = () => {
      shown = player.tracks;
      listEl.replaceChildren();
      const q = filter.value.toLowerCase().trim();
      const hits = player.tracks
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => !q || (t.title + " " + t.folder).toLowerCase().includes(q));
      for (const { t, i } of hits.slice(0, SHOW)) {
        const row = el("div", "mr-item mr-track", listEl);
        row.dataset.index = String(i);
        el("div", "mr-item-title", row, t.title);
        if (t.folder) el("div", "mr-item-meta", row, t.folder);
        row.onclick = () => void player.play(i);
      }
      if (hits.length > SHOW) el("div", "mr-sub", listEl, `${hits.length - SHOW} more; filter to find them.`);
      if (!player.tracks.length) {
        el("div", "mr-sub", listEl, `No songs found in ${music.folder()}. Use Change folder to pick another.`);
        const again = el("button", "mr-btn", listEl, "Rescan");
        again.onclick = () => void music.rescan();
      }
    };
    filter.oninput = drawList;

    const update = () => {
      const st = player.state;
      if (shown !== player.tracks) drawList();
      title.textContent = st.track ? st.track.title : player.tracks.length ? "Nothing playing" : "No songs yet";
      sub.textContent = st.track ? st.track.folder : `${player.tracks.length} songs`;
      play.textContent = st.playing ? "⏸" : "▶";
      play.setAttribute("aria-label", st.playing ? "Pause" : "Play");
      seek.max = String(Math.floor(st.duration));
      if (!dragging) { seek.value = String(Math.floor(st.time)); at.textContent = formatTime(st.time); }
      len.textContent = formatTime(st.duration);
      const quiet = st.muted || st.volume === 0;
      mute.textContent = quiet ? "🔇" : st.volume < 0.5 ? "🔉" : "🔊";
      mute.setAttribute("aria-label", st.muted ? "Unmute" : "Mute");
      if (document.activeElement !== vol) vol.value = String(Math.round(st.volume * 100));
      volPct.textContent = st.muted ? "muted" : `${Math.round(st.volume * 100)}%`;
      folderName.textContent = music.folder();
      folderName.title = music.folder();
      for (const row of Array.from(listEl.children) as HTMLElement[]) row.classList.toggle("is-playing", row.dataset.index === String(st.index));
    };
    this.musicOff = player.subscribe(update);
    update();
  }

  private renderList(p: HTMLElement, list: Memory[]): void {
    const ul = el("div", "mr-list", p);
    const now = this.host.now();
    for (const m of list) {
      const row = el("div", "mr-item" + (isFaded(m, now, this.host.fadeDays) ? " is-faded" : ""), ul);
      row.dataset.path = m.path;
      el("div", "mr-item-title", row, m.title);
      el("div", "mr-item-meta", row, `${m.kind} · ${ago(now, m.time)}`);
      row.onclick = (e) => {
        if (e.ctrlKey || e.metaKey) this.host.openNote(m.path, e);
        else this.showMemory(m.path);
      };
      row.addEventListener("auxclick", (e) => { if (e.button === 1) this.host.openNote(m.path, e); });
      row.onmouseover = (e) => this.host.hover?.(m.path, e, row);
      row.oncontextmenu = (e) => {
        if (!this.host.fileMenu) return;
        e.preventDefault();
        this.host.fileMenu(m.path, e);
      };
      row.onmouseenter = () => this.scene.highlight(m.spot);
    }
  }

  /** Fly to a memory, single it out in the room and show its preview. False if it isn't in the room. */
  showMemory(path: string): boolean {
    const m = this.all.find((x) => x.path === path);
    if (!m) return false;
    const spot = SPOTS.find((s) => s.id === m.spot)!;
    this.walkIndex = spotsInWalkOrder().findIndex((x) => x.id === spot.id);
    this.setSpot(spot.id);
    this.scene.flyTo(spot);
    this.scene.focusMemory(path);
    const p = this.clearPanel("memory");
    const back = el("button", "mr-btn mr-back", p, `← ${spot.label}`);
    back.onclick = () => this.openSpot(spot);
    el("div", "mr-title", p, m.title);
    el("div", "mr-sub", p, `${m.kind} · ${ago(this.host.now(), m.time)} · ${m.path}`);
    const body = el("div", "mr-preview markdown-rendered", p);
    const open = el("button", "mr-btn mr-primary", p, "Open note");
    open.onclick = (e) => this.host.openNote(m.path, e);
    this.host.renderPreview(m.path, body).catch(() => body.replaceChildren());
    return true;
  }

  walk(step: number): void {
    const order = spotsInWalkOrder();
    this.walkIndex = (this.walkIndex + step + order.length) % order.length;
    this.openSpot(order[this.walkIndex]);
  }

  private showSearch(): void {
    const p = this.clearPanel("search");
    el("div", "mr-title", p, "Find");
    const input = el("input", "mr-search", p);
    input.type = "search";
    input.placeholder = "Find a memory…";
    const results = el("div", "", p);
    input.oninput = () => {
      results.replaceChildren();
      const hits = search(this.all, input.value);
      if (input.value.trim() && hits.length === 0) el("div", "mr-sub", results, "Nothing matches.");
      this.renderList(results, hits);
    };
    input.focus();
  }

  dispose(): void {
    this.musicOff?.();
    this.musicDance?.();
    this.ro?.disconnect();
    this.scene.dispose();
    this.root.remove();
  }
}
