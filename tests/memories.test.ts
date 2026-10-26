import { describe, it, expect } from "vitest";
import { matchRule, parseRules, DEFAULT_RULES } from "../src/vaultMap";
import { toMemory, groupBySpot, isFaded, search, parseDate, FileInfo } from "../src/memories";
import { SPOTS, spotsInWalkOrder } from "../src/spots";
import { moodForHour } from "../src/mood";

const f = (path: string, extra: Partial<FileInfo> = {}): FileInfo => ({
  path, basename: path.split("/").pop()!.replace(/\.md$/, ""), mtime: Date.UTC(2026, 9, 1), ...extra,
});

describe("vault map", () => {
  it("maps the default folders to kinds", () => {
    expect(matchRule("notes/2026-10-20-garden-overhaul.md")?.kind).toBe("note");
    expect(matchRule("decisions/2026-10-19-retire-inbox-capture.proposed.md")?.kind).toBe("decision");
    expect(matchRule("daily/2026-10-20.md")?.kind).toBe("log");
    expect(matchRule("keep/some-link.md")?.kind).toBe("interest");
    expect(matchRule("identity/USER.md")?.kind).toBe("identity");
    expect(matchRule("open-questions.md")?.kind).toBe("question");
  });

  it("takes one STATUS.md per project and nothing else under projects/", () => {
    expect(matchRule("projects/memory-room/STATUS.md")?.kind).toBe("project");
    expect(matchRule("projects/memory-room/notes.md")).toBeUndefined();
    expect(matchRule("projects/STATUS.md")).toBeUndefined();
  });

  it("excludes the game's own planning notes and non-markdown files", () => {
    expect(matchRule("notes/memory-room/HANDOFF.md")).toBeUndefined();
    expect(matchRule("notes/memory-room-progress.md")?.kind).toBe("note");
    expect(matchRule("logs/run.jsonl")).toBeUndefined();
    expect(matchRule("README.md")).toBeUndefined();
  });

  it("rejects malformed rules", () => {
    expect(() => parseRules("{}")).toThrow();
    expect(() => parseRules('[{"kind":"note"}]')).toThrow();
    expect(parseRules(JSON.stringify(DEFAULT_RULES))).toHaveLength(DEFAULT_RULES.length);
  });
});

describe("memories", () => {
  it("titles a project from its folder and dates it from front-matter", () => {
    const m = toMemory(f("projects/memory-room/STATUS.md", { frontmatter: { "last-touched": "2026-10-22" } }))!;
    expect(m.title).toBe("memory-room");
    expect(m.spot).toBe("desk");
    expect(m.declared).toBe(true);
    expect(m.time).toBe(Date.UTC(2026, 9, 22));
  });

  it("prefers front-matter title, then H1, then file name", () => {
    expect(toMemory(f("notes/a.md", { frontmatter: { title: "T" }, h1: "H" }))!.title).toBe("T");
    expect(toMemory(f("notes/a.md", { h1: "H" }))!.title).toBe("H");
    expect(toMemory(f("notes/a.md"))!.title).toBe("a");
  });

  it("falls back to modified time when no date is declared", () => {
    const m = toMemory(f("notes/a.md", { frontmatter: { created: "not a date" } }))!;
    expect(m.declared).toBe(false);
    expect(m.time).toBe(Date.UTC(2026, 9, 1));
  });

  it("parses YAML dates, date strings and datetimes", () => {
    expect(parseDate("2026-10-19")).toBe(Date.UTC(2026, 9, 19));
    expect(parseDate("2026-10-19T08:30")).toBe(Date.UTC(2026, 9, 19, 8, 30));
    expect(parseDate(new Date(Date.UTC(2026, 0, 2)))).toBe(Date.UTC(2026, 0, 2));
    expect(parseDate("someday")).toBeUndefined();
  });

  it("groups by spot newest first, keeping empty spots", () => {
    const g = groupBySpot([
      f("notes/old.md", { frontmatter: { created: "2026-01-01" } }),
      f("notes/new.md", { frontmatter: { created: "2026-10-01" } }),
      f("daily/2026-10-20.md"),
      f("random/elsewhere.md"),
    ]);
    expect(g.size).toBe(SPOTS.length);
    expect(g.get("bookshelf")!.map((m) => m.title)).toEqual(["new", "old"]);
    expect(g.get("plant")).toHaveLength(1);
    expect(g.get("music_player")).toEqual([]);
    expect([...g.values()].flat()).toHaveLength(3);
  });

  it("fades after the window", () => {
    const m = toMemory(f("notes/a.md", { frontmatter: { created: "2026-10-01" } }))!;
    expect(isFaded(m, Date.UTC(2026, 9, 5), 5)).toBe(false);
    expect(isFaded(m, Date.UTC(2026, 9, 7), 5)).toBe(true);
  });

  it("searches every word across title and path", () => {
    const all = [...groupBySpot([f("notes/garden-overhaul.md", { h1: "Garden overhaul" }), f("daily/2026-10-20.md")]).values()].flat();
    expect(search(all, "garden").map((m) => m.title)).toEqual(["Garden overhaul"]);
    expect(search(all, "overhaul notes")).toHaveLength(1);
    expect(search(all, "garden daily")).toHaveLength(0);
    expect(search(all, "  ")).toHaveLength(0);
  });
});

describe("room data", () => {
  it("walks the 11 spots in order 1..11 with unique kinds", () => {
    expect(spotsInWalkOrder().map((s) => s.walk)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const kinds = SPOTS.flatMap((s) => s.kinds);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("gives every default rule's kind a spot", () => {
    for (const r of DEFAULT_RULES) expect(SPOTS.some((s) => s.kinds.includes(r.kind))).toBe(true);
  });

  it("picks the light mood from the hour", () => {
    expect(moodForHour(8)).toBe("morning");
    expect(moodForHour(14)).toBe("afternoon");
    expect(moodForHour(18)).toBe("sunset");
    expect(moodForHour(23)).toBe("night");
    expect(moodForHour(3)).toBe("night");
  });
});

import { folderForSpot } from "../src/memories";

describe("room-spot property", () => {
  it("moves a note to another spot and keeps a matching kind", () => {
    const m = toMemory(f("notes/a.md", { frontmatter: { "room-spot": "desk" } }))!;
    expect(m.spot).toBe("desk");
    expect(m.kind).toBe("project");
    const keep = toMemory(f("decisions/d.md", { frontmatter: { "room-spot": "filing_cabinet" } }))!;
    expect(keep.kind).toBe("decision");
  });

  it("places a note that no folder rule covers, and ignores unknown spots", () => {
    expect(toMemory(f("random/x.md", { frontmatter: { "room-spot": "photo_table" } }))?.spot).toBe("photo_table");
    expect(toMemory(f("random/x.md", { frontmatter: { "room-spot": "attic" } }))).toBeUndefined();
    expect(toMemory(f("notes/a.md", { frontmatter: { "room-spot": "attic" } }))?.spot).toBe("bookshelf");
  });

  it("finds the folder for new memories on a spot", () => {
    expect(folderForSpot("bookshelf")).toBe("notes");
    expect(folderForSpot("plant")).toBe("daily");
    expect(folderForSpot("desk")).toBeUndefined();
    expect(folderForSpot("photo_table")).toBeUndefined();
  });
});

import { moodAt, clockAngles, MOODS } from "../src/mood";

describe("day and night", () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 23, h, m);

  it("holds each mood through its part of the day", () => {
    expect(moodAt(at(3))).toEqual(MOODS.night);
    expect(moodAt(at(9))).toEqual(MOODS.morning);
    expect(moodAt(at(14))).toEqual(MOODS.afternoon);
    expect(moodAt(at(18, 30))).toEqual(MOODS.sunset);
    expect(moodAt(at(22))).toEqual(MOODS.night);
  });

  it("blends between moods at dawn and dusk", () => {
    const dusk = moodAt(at(19, 52));
    expect(dusk.glow).toBeGreaterThan(MOODS.sunset.glow);
    expect(dusk.glow).toBeLessThan(MOODS.night.glow);
    expect(dusk.sky[0]).toMatch(/^#[0-9a-f]{6}$/);
    const dawn = moodAt(at(6));
    expect(dawn.id).toBe("morning");
    expect(dawn.sunEnergy).toBeGreaterThan(MOODS.night.sunEnergy);
    expect(dawn.sunEnergy).toBeLessThan(MOODS.morning.sunEnergy);
  });

  it("points the clock hands at the time", () => {
    const a = clockAngles(at(3));
    expect(a.hour).toBeCloseTo(Math.PI / 2);
    expect(a.minute).toBeCloseTo(0);
    const b = clockAngles(at(15, 30));
    expect(b.hour).toBeCloseTo((3.5 / 12) * Math.PI * 2);
    expect(b.minute).toBeCloseTo(Math.PI);
  });
});

import { isAudio, trackTitle, scanMusic, formatTime } from "../src/music";

describe("music folder", () => {
  it("knows audio files and tidies their titles", () => {
    expect(isAudio("Song.MP3")).toBe(true);
    expect(isAudio("cover.jpg")).toBe(false);
    expect(trackTitle("01 - Some_Song.mp3")).toBe("Some Song");
    expect(trackTitle("2049.flac")).toBe("2049");
    expect(trackTitle("02 Rainy Window.wav")).toBe("Rainy Window");
    expect(formatTime(125)).toBe("2:05");
  });

  it("walks sub-folders, skips hidden ones and sorts naturally", async () => {
    const tree: Record<string, { name: string; dir: boolean }[]> = {
      "/m": [{ name: "Band", dir: true }, { name: ".cache", dir: true }, { name: "b.mp3", dir: false }, { name: "notes.txt", dir: false }],
      "/m/Band": [{ name: "10 Ten.mp3", dir: false }, { name: "2 Two.ogg", dir: false }],
      "/m/.cache": [{ name: "x.mp3", dir: false }],
    };
    const tracks = await scanMusic("/m/", async (d) => {
      if (!tree[d]) throw new Error("no dir");
      return tree[d];
    });
    expect(tracks.map((t) => t.path)).toEqual(["/m/b.mp3", "/m/Band/2 Two.ogg", "/m/Band/10 Ten.mp3"]);
    expect(tracks[1].folder).toBe("Band");
    expect(await scanMusic("/missing", async () => { throw new Error("nope"); })).toEqual([]);
  });
});

import { PetBrain, ROAM, EAT_AT } from "../src/pet";

describe("pet cat", () => {
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  it("wanders the open floor and visits its dish", () => {
    const cat = new PetBrain(seeded(7));
    const seen = new Set<string>();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < 20 * 60 * 10; i++) {
      const p = cat.update(0.05);
      seen.add(p.state);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    expect([...seen].sort()).toEqual(["eat", "sit", "walk"]);
    expect(minX).toBeGreaterThanOrEqual(EAT_AT.x - 0.01);
    expect(maxX).toBeLessThanOrEqual(ROAM.x1 + 0.01);
    expect(minZ).toBeGreaterThanOrEqual(ROAM.z0 - 0.01);
    expect(maxZ).toBeLessThanOrEqual(EAT_AT.z + 0.01);
    expect(maxX - minX).toBeGreaterThan(3);
  });

  it("turns to the viewer, waves, then carries on along the same path", () => {
    const cat = new PetBrain(seeded(3));
    for (let i = 0; i < 200 && cat.pose.state !== "walk"; i++) cat.update(0.05);
    for (let i = 0; i < 5; i++) cat.update(0.05);
    expect(cat.pose.state).toBe("walk");
    const before = { ...cat.pose };
    const face = before.heading + 2;
    cat.greet(face, 1.5);
    expect(cat.pose.state).toBe("turn");
    for (let i = 0; i < 20 && cat.pose.state === "turn"; i++) cat.update(0.05);
    expect(cat.pose.state).toBe("wave");
    expect(Math.abs(Math.atan2(Math.sin(cat.pose.heading - face), Math.cos(cat.pose.heading - face)))).toBeLessThan(0.03);
    expect([cat.pose.x, cat.pose.z]).toEqual([before.x, before.z]);
    for (let i = 0; i < 31; i++) cat.update(0.05);
    expect(cat.pose.state).toBe("walk");
    expect(cat.greetingNow).toBe(false);
  });

  it("turns back to the bowl after greeting while eating", () => {
    const cat = new PetBrain(seeded(3));
    cat.pose.state = "eat"; cat.pose.heading = 1; cat.pose.t = 0;
    cat.greet(-1, 1);
    for (let i = 0; i < 100 && cat.greetingNow; i++) cat.update(0.05);
    expect(cat.pose.state).toBe("eat");
    expect(cat.pose.heading).toBeCloseTo(1, 1);
  });
});

import { pickClips } from "../src/pet";

describe("rigged pet clips", () => {
  it("finds walk, idle and wave clips by name", () => {
    expect(pickClips(["Armature|Walking", "Armature|Idle", "Wave_Hand"])).toEqual({ walk: "Armature|Walking", idle: "Armature|Idle", wave: "Wave_Hand" });
    expect(pickClips(["Running"])).toEqual({});
  });

});

import { calendarPage } from "../src/calendarPage";

describe("wall calendar page", () => {
  it("matches a tear-off page for New Year's Day 2027", () => {
    const p = calendarPage(new Date(2027, 0, 1, 9));
    expect(p).toMatchObject({ year: 2027, month: "January", day: 1, weekday: "Friday", dayOfYear: 1, daysLeft: 364, holiday: "New Year's Day" });
  });
  it("counts leap years and leaves ordinary days without a holiday", () => {
    const p = calendarPage(new Date(2028, 11, 31, 23, 59));
    expect(p.dayOfYear).toBe(366);
    expect(p.daysLeft).toBe(0);
    expect(calendarPage(new Date(2026, 9, 26)).holiday).toBeUndefined();
  });
});
