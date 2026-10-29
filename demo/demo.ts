// Browser demo host for Memory Room: the plugin's own RoomUI and scene, fed a made-up sample vault.
// Stands in for Obsidian: notes open in an in-page reader, Find uses the panel search, and the music
// player plays loops synthesised in the browser.

import { RoomUI } from "../src/ui";
import { FileInfo, groupBySpot } from "../src/memories";
import { MOODS, MoodId } from "../src/mood";
import { MusicPlayer, Track } from "../src/music";
import { NOTES } from "./vault";
import { TUNES, renderTune } from "./tunes";

declare global {
  interface Window { CAT_GLB?: string; memoryRoom?: RoomUI; demo?: unknown }
}

const DAY = 86_400_000;
const byPath = new Map(NOTES.map((n) => [n.path, n]));

function fileInfos(now: number): FileInfo[] {
  return NOTES.map((n) => {
    const parts = n.path.split("/");
    const h1 = /^#\s+(.+)$/m.exec(n.body)?.[1];
    return {
      path: n.path,
      basename: parts[parts.length - 1].replace(/\.md$/, ""),
      mtime: now - n.age * DAY - 3_600_000,
      frontmatter: n.fm,
      h1,
    };
  });
}

function titleOf(path: string): string {
  const parts = path.split("/");
  const file = parts[parts.length - 1].replace(/\.md$/, "");
  if (file === "STATUS" && parts.length >= 2) return parts[parts.length - 2];
  return /^#\s+(.+)$/m.exec(byPath.get(path)?.body ?? "")?.[1] ?? file;
}

/** [[Link]] → the note it names: by file name, or by project folder for STATUS notes. */
function resolveLink(target: string): string | undefined {
  const t = target.toLowerCase();
  return NOTES.find((n) => {
    const parts = n.path.toLowerCase().replace(/\.md$/, "").split("/");
    return parts[parts.length - 1] === t || (parts[parts.length - 1] === "status" && parts[parts.length - 2] === t) || titleOf(n.path).toLowerCase() === t;
  })?.path;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s: string): string {
  return esc(s)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, label) => {
      const p = resolveLink(t);
      return p ? `<a class="internal-link" data-href="${esc(p)}" href="#">${label ?? t}</a>` : `<span class="is-unresolved">${label ?? t}</span>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** Just enough Markdown for the sample notes: headings, paragraphs, lists and task lists. */
function markdown(src: string, dropH1: boolean): string {
  const out: string[] = [];
  let list: "ul" | "ol" | undefined;
  const close = () => { if (list) out.push(`</${list}>`); list = undefined; };
  for (const line of src.split("\n")) {
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      close();
      if (m[1].length === 1 && dropH1) continue;
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    } else if ((m = /^\s*[-*]\s+\[( |x)\]\s+(.*)$/.exec(line))) {
      if (list !== "ul") { close(); out.push('<ul class="contains-task-list">'); list = "ul"; }
      out.push(`<li class="task-list-item${m[1] === "x" ? " is-checked" : ""}"><input type="checkbox" disabled${m[1] === "x" ? " checked" : ""}> ${inline(m[2])}</li>`);
    } else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) {
      if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) {
      if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (line.trim()) {
      close();
      out.push(`<p>${inline(line)}</p>`);
    } else close();
  }
  close();
  return out.join("");
}

function decodeCat(): ArrayBuffer | undefined {
  const b64 = window.CAT_GLB;
  if (!b64) return undefined;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function toast(text: string): void {
  const t = document.createElement("div");
  t.className = "demo-toast";
  t.textContent = text;
  document.body.appendChild(t);
  window.setTimeout(() => t.classList.add("is-gone"), 3200);
  window.setTimeout(() => t.remove(), 3800);
}

/** The demo's stand-in for opening a note in an Obsidian tab. */
function openReader(path: string, ui: RoomUI): void {
  const n = byPath.get(path);
  if (!n) return;
  document.querySelector(".demo-reader")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "demo-reader";
  wrap.innerHTML = `<div class="demo-reader-card" role="dialog" aria-label="${esc(titleOf(path))}">
    <div class="demo-reader-bar"><span class="demo-reader-path">${esc(path)}</span><button class="demo-reader-close" aria-label="Close">✕</button></div>
    <div class="demo-reader-body markdown-rendered"><h1>${esc(titleOf(path))}</h1>${markdown(n.body, true)}</div>
    <div class="demo-reader-foot">In Obsidian, <b>Open note</b> opens the real note in a tab, where you can edit it.</div>
  </div>`;
  const shut = () => wrap.remove();
  wrap.onclick = (e) => {
    if (e.target === wrap) return shut();
    const a = (e.target as HTMLElement).closest("a.internal-link");
    if (a) { e.preventDefault(); shut(); ui.showMemory(a.getAttribute("data-href")!); }
  };
  wrap.querySelector<HTMLButtonElement>(".demo-reader-close")!.onclick = shut;
  document.body.appendChild(wrap);
}

function isPhone(): boolean {
  return window.matchMedia("(max-width: 640px)").matches;
}

function start(): void {
  const params = new URLSearchParams(location.search);
  const q = params.get("mood");
  const mood: MoodId | "auto" = q && q in MOODS ? (q as MoodId) : "auto";
  const setPhone = () => document.body.classList.toggle("is-phone", isPhone());
  setPhone();
  window.addEventListener("resize", setPhone);

  const tracks: Track[] = TUNES.map((t, i) => ({ path: `demo-${i}.wav`, title: t.title, folder: "Demo loops" }));
  const cache = new Map<string, Promise<ArrayBuffer>>();
  const player = new MusicPlayer((path) => {
    const i = tracks.findIndex((t) => t.path === path);
    if (!cache.has(path)) cache.set(path, renderTune(TUNES[i]));
    return cache.get(path)!;
  });
  player.setTracks(tracks);
  player.audio.volume = 0.6;

  const host = document.getElementById("room")!;
  const now = () => Date.now();
  let ui: RoomUI;
  ui = new RoomUI(host, {
    fadeDays: 5,
    mood,
    now,
    openNote: (path) => openReader(path, ui),
    renderPreview: async (path, el) => {
      const n = byPath.get(path);
      if (!n) return;
      el.innerHTML = markdown(n.body, true);
      el.onclick = (evt) => {
        const a = (evt.target as HTMLElement).closest("a.internal-link");
        if (!a) return;
        evt.preventDefault();
        ui.showMemory(a.getAttribute("data-href")!);
      };
    },
    petModel: async () => decodeCat(),
    music: {
      player,
      folder: () => "Demo loops, made in your browser",
      rescan: async () => player.setTracks(tracks),
      chooseFolder: async () => toast("In Obsidian on a computer, pick any folder of your own music."),
    },
  });
  ui.setMemories(groupBySpot(fileInfos(now())));
  window.memoryRoom = ui;
  window.demo = { player, openReader: (p: string) => openReader(p, ui) };

  // The same keys the plugin's view registers.
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select")) {
      if (e.key === "Escape") t.blur();
      return;
    }
    if (document.querySelector(".demo-reader")) {
      if (e.key === "Escape") document.querySelector(".demo-reader")!.remove();
      return;
    }
    if (e.key === "ArrowRight") ui.walk(1);
    else if (e.key === "ArrowLeft") ui.walk(-1);
    else if (e.key === "Escape") ui.resetView();
    else if (e.key === "/") {
      e.preventDefault();
      Array.from(document.querySelectorAll<HTMLButtonElement>(".mr-rail .mr-btn")).find((b) => b.textContent === "Find")?.click();
    } else return;
  });

  const spot = params.get("spot");
  if (spot) ui.openSpotById(spot);
}

start();
