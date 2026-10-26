// Turns vault files into memories and groups them by spot. Pure: the Obsidian side hands in
// FileInfo records, so this is testable without an app.

import { MapRule, DEFAULT_RULES, matchRule } from "./vaultMap";
import { SPOTS, spotForKind } from "./spots";

/** Front-matter property that puts one note on a spot, whatever its folder. */
export const SPOT_PROPERTY = "room-spot";

export interface FileInfo {
  path: string;
  basename: string;
  mtime: number;
  frontmatter?: Record<string, unknown>;
  /** First level-1 heading, if any. */
  h1?: string;
}

export interface Memory {
  path: string;
  title: string;
  kind: string;
  spot: string;
  time: number;
  /** True when the date came from frontmatter rather than the file's modified time. */
  declared: boolean;
}

const TIME_KEYS = ["last-touched", "last touched", "captured", "created", "date"];

export function parseDate(v: unknown): number | undefined {
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v.getTime();
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (!m) return undefined;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  return isNaN(t) ? undefined : t;
}

function fmTime(fm: Record<string, unknown> | undefined): number | undefined {
  if (!fm) return undefined;
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) lower[k.toLowerCase()] = v;
  for (const k of TIME_KEYS) {
    const t = parseDate(lower[k]);
    if (t !== undefined) return t;
  }
  return undefined;
}

export function toMemory(f: FileInfo, rules: MapRule[] = DEFAULT_RULES): Memory | undefined {
  if (!f.path.toLowerCase().endsWith(".md")) return undefined;
  const rule = matchRule(f.path, rules);
  // A room-spot property wins over the folder rules, and can place a note no rule covers.
  const wanted = f.frontmatter?.[SPOT_PROPERTY];
  const override = typeof wanted === "string" ? SPOTS.find((s) => s.id === wanted.trim()) : undefined;
  const spot = override ?? (rule ? spotForKind(rule.kind) : undefined);
  if (!spot) return undefined;
  const kind = override ? (rule && override.kinds.includes(rule.kind) ? rule.kind : override.kinds[0]) : rule!.kind;
  const parts = f.path.split("/");
  const fmTitle = typeof f.frontmatter?.title === "string" ? (f.frontmatter.title as string) : undefined;
  const title = rule?.titleFromParent && parts.length >= 2 ? parts[parts.length - 2] : fmTitle ?? f.h1 ?? f.basename;
  const declared = fmTime(f.frontmatter);
  return { path: f.path, title, kind, spot: spot.id, time: declared ?? f.mtime, declared: declared !== undefined };
}

/** The folder new memories for a spot are created in: the first plain folder rule for one of its kinds. */
export function folderForSpot(spotId: string, rules: MapRule[] = DEFAULT_RULES): string | undefined {
  const spot = SPOTS.find((s) => s.id === spotId);
  if (!spot) return undefined;
  const r = rules.find((x) => x.dir !== undefined && x.eachSubdirFile === undefined && spot.kinds.includes(x.kind));
  return r?.dir;
}

/** Memories per spot id, newest first. Every spot is present, empty ones too. */
export function groupBySpot(files: FileInfo[], rules: MapRule[] = DEFAULT_RULES): Map<string, Memory[]> {
  const out = new Map<string, Memory[]>(SPOTS.map((s) => [s.id, []]));
  for (const f of files) {
    const m = toMemory(f, rules);
    if (m) out.get(m.spot)!.push(m);
  }
  for (const list of out.values()) list.sort((a, b) => b.time - a.time || a.title.localeCompare(b.title));
  return out;
}

export function isFaded(m: Memory, now: number, fadeDays: number): boolean {
  return now - m.time > fadeDays * 86_400_000;
}

/** Case-insensitive search over titles and paths; every word must match. */
export function search(all: Memory[], query: string, limit = 30): Memory[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return all
    .filter((m) => {
      const hay = (m.title + " " + m.path).toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.time - a.time)
    .slice(0, limit);
}
