// The memory-palace spots, ported from the Godot game's defs/spots/*.tres.
// Positions are in metres on the same floor: x runs -6 (left wall) to 4.15, z runs -4.5 (back wall)
// to 1.5 (open front). A spot's furniture comes from `furniture`; its memories sit on `surface`.

export type Vec3 = [number, number, number];

export interface SpotDef {
  id: string;
  label: string;
  walk: number;
  kinds: string[];
  anchor: Vec3;
  furniture: string;
  /** Wall-mounted spots face this way; floor spots leave it out. */
  mount?: Vec3;
  maxShown: number;
}

export const SPOTS: SpotDef[] = [
  { id: "wall_calendar", label: "Wall calendar", walk: 1, kinds: ["review", "event"], anchor: [-3.5, 2.3, -4.45], furniture: "calendar", mount: [0, 0, 1], maxShown: 6 },
  { id: "mirror", label: "Mirror", walk: 2, kinds: ["identity"], anchor: [-5.95, 1.5, -2.2], furniture: "mirror", mount: [1, 0, 0], maxShown: 4 },
  { id: "corkboard", label: "Corkboard", walk: 3, kinds: ["question", "mission", "card"], anchor: [2.35, 2.5, -4.45], furniture: "corkboard", mount: [0, 0, 1], maxShown: 9 },
  { id: "bed_box", label: "Box at the foot of the bed", walk: 4, kinds: ["archive"], anchor: [-5.0, 0, -2.15], furniture: "bed", maxShown: 6 },
  { id: "window", label: "Window", walk: 5, kinds: ["interest"], anchor: [0.25, 2.1, -4.35], furniture: "window", mount: [0, 0, 1], maxShown: 6 },
  { id: "desk", label: "Desk", walk: 6, kinds: ["project"], anchor: [0.25, 0, -4.05], furniture: "desk", maxShown: 8 },
  { id: "filing_cabinet", label: "Filing cabinet", walk: 7, kinds: ["decision", "file"], anchor: [1.65, 0, -4.2], furniture: "cabinet", maxShown: 9 },
  { id: "bookshelf", label: "Bookshelf", walk: 8, kinds: ["note"], anchor: [2.9, 0, -4.3], furniture: "bookshelf", maxShown: 12 },
  { id: "plant", label: "Plant", walk: 9, kinds: ["log"], anchor: [3.65, 0, 1.0], furniture: "plant", maxShown: 4 },
  { id: "photo_table", label: "Photo table", walk: 10, kinds: ["person", "photo"], anchor: [-3.4, 0, -4.15], furniture: "photo_table", maxShown: 9 },
  { id: "music_player", label: "Music player", walk: 11, kinds: ["song"], anchor: [-2.1, 0, -4.2], furniture: "music", maxShown: 6 },
];

export function spotForKind(kind: string): SpotDef | undefined {
  return SPOTS.find((s) => s.kinds.includes(kind));
}

export function spotsInWalkOrder(): SpotDef[] {
  return [...SPOTS].sort((a, b) => a.walk - b.walk);
}

export const ROOM = {
  floor: { x0: -6.0, z0: -4.5, x1: 4.15, z1: 1.5 },
  wallHeight: 3.2,
  doorZ: -0.5,
};
