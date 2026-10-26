// Vault folder -> memory kind, ported from the game's defs/vault_map.json and updated for
// a typical second-brain layout (daily/ and keep/). Users can override the rules in settings.

export interface MapRule {
  kind: string;
  /** A folder (matches everything under it) or an exact file path. */
  dir?: string;
  file?: string;
  /** Only files with this name inside `dir`, one per sub-folder (projects/x/STATUS.md). */
  eachSubdirFile?: string;
  /** Use the parent folder's name as the title. */
  titleFromParent?: boolean;
  exclude?: string[];
}

export const DEFAULT_RULES: MapRule[] = [
  { kind: "review", dir: "reviews" },
  { kind: "identity", file: "identity/USER.md" },
  { kind: "mission", dir: "missions" },
  { kind: "question", file: "open-questions.md" },
  { kind: "decision", dir: "decisions" },
  { kind: "project", dir: "projects", eachSubdirFile: "STATUS.md", titleFromParent: true },
  { kind: "note", dir: "notes", exclude: ["notes/memory-room"] },
  { kind: "log", dir: "daily" },
  { kind: "log", dir: "logs" },
  { kind: "archive", dir: "archive" },
  { kind: "interest", dir: "keep" },
];

function under(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.replace(/\/+$/, "") + "/");
}

/** The first rule that claims this path, or undefined. Only markdown files are memories. */
export function matchRule(path: string, rules: MapRule[] = DEFAULT_RULES): MapRule | undefined {
  if (!path.toLowerCase().endsWith(".md")) return undefined;
  for (const r of rules) {
    if (r.file !== undefined) {
      if (path === r.file) return r;
      continue;
    }
    if (r.dir === undefined || !under(path, r.dir)) continue;
    if (r.exclude?.some((e) => under(path, e))) continue;
    if (r.eachSubdirFile !== undefined) {
      const rest = path.slice(r.dir.replace(/\/+$/, "").length + 1).split("/");
      if (rest.length !== 2 || rest[1] !== r.eachSubdirFile) continue;
    }
    return r;
  }
  return undefined;
}

export function parseRules(json: string): MapRule[] {
  const v = JSON.parse(json);
  if (!Array.isArray(v)) throw new Error("Rules must be a JSON list");
  for (const r of v) {
    if (typeof r?.kind !== "string" || (typeof r.dir !== "string" && typeof r.file !== "string")) {
      throw new Error("Each rule needs a kind and a dir or file");
    }
  }
  return v as MapRule[];
}
