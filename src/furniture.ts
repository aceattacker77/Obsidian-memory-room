// Procedural low-poly furniture, in the spirit of the game's src/kit/builders: bevelled boxes and
// cylinders at real proportions (metres), matte materials. Each builder returns its group plus the
// surface where that spot's memories are laid out.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { calendarPage, drawCalendarPage } from "./calendarPage";

export const PALETTE = {
  wood: 0xa8724a,
  woodLight: 0xd6b088,
  woodDark: 0x6e4a33,
  cream: 0xf1e6d2,
  white: 0xf3f0ea,
  plum: 0x5b3f63,
  mustard: 0xe0a83a,
  sage: 0x8fae8b,
  leaf: 0x5d8a4e,
  slate: 0x3e4656,
  charcoal: 0x26292f,
  terracotta: 0xc0704f,
  pink: 0xe8a0b4,
  cork: 0xc9a06a,
};

export type TokenStyle = "book" | "paper" | "card" | "letter" | "bloom" | "photo" | "box" | "disc" | "coin";

/** Where memories go: a rectangle in the furniture's local space. Wall surfaces lie in local XY. */
export interface Surface {
  centre: THREE.Vector3;
  w: number;
  d: number;
  style: TokenStyle;
  wall?: boolean;
}

export interface Built {
  group: THREE.Group;
  surface: Surface;
  /** Meshes that glow at night (LEDs, screens, lamps); scaled by the mood's glow. */
  emissive: THREE.MeshStandardMaterial[];
  /** Called every frame with the computer's time, for furniture that shows it. */
  tick?: (now: Date) => void;
}

const matCache = new Map<number, THREE.MeshStandardMaterial>();
export function mat(color: number, rough = 0.85): THREE.MeshStandardMaterial {
  const key = color * 10 + Math.round(rough * 9);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    matCache.set(key, m);
  }
  return m;
}

export function glowMat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, roughness: 0.4 });
}

export function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, r = 0.012): THREE.Mesh {
  const radius = Math.min(r, w / 2.01, h / 2.01, d / 2.01);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

export function cyl(g: THREE.Object3D, rTop: number, rBot: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 16): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function sphere(g: THREE.Object3D, r: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function desk(): Built {
  const g = new THREE.Group();
  const top = mat(PALETTE.woodLight, 0.7);
  box(g, 1.6, 0.03, 0.75, top, 0, 0.745, 0);
  for (const [x, z] of [[-0.76, -0.33], [0.76, -0.33], [-0.76, 0.33], [0.76, 0.33]]) box(g, 0.04, 0.73, 0.04, mat(PALETTE.charcoal, 0.5), x, 0.365, z, 0.008);
  // Monitor and keyboard: the gaming-desk look from the references.
  const screen = glowMat(0x7fb4ff);
  box(g, 0.9, 0.42, 0.03, mat(PALETTE.charcoal, 0.4), 0, 1.12, -0.26);
  box(g, 0.86, 0.38, 0.005, screen, 0, 1.12, -0.243, 0.002);
  box(g, 0.06, 0.2, 0.06, mat(PALETTE.charcoal, 0.4), 0, 0.86, -0.28);
  box(g, 0.45, 0.02, 0.14, mat(PALETTE.slate, 0.6), 0.05, 0.77, 0.12);
  // LED strip under the desk top.
  const led = glowMat(0xb46cff);
  box(g, 1.5, 0.01, 0.02, led, 0, 0.72, -0.34, 0.004);
  // Office chair.
  const chair = new THREE.Group();
  box(chair, 0.5, 0.08, 0.5, mat(PALETTE.plum, 0.9), 0, 0.48, 0, 0.03);
  box(chair, 0.48, 0.6, 0.07, mat(PALETTE.plum, 0.9), 0, 0.85, 0.24, 0.03);
  cyl(chair, 0.03, 0.03, 0.4, mat(PALETTE.charcoal, 0.4), 0, 0.24, 0);
  cyl(chair, 0.28, 0.28, 0.03, mat(PALETTE.charcoal, 0.4), 0, 0.03, 0, 5);
  chair.position.set(0.1, 0, 0.75);
  chair.rotation.y = 0.2;
  g.add(chair);
  return { group: g, surface: { centre: new THREE.Vector3(-0.45, 0.77, 0.1), w: 0.6, d: 0.45, style: "paper" }, emissive: [screen, led] };
}

function bookshelf(): Built {
  const g = new THREE.Group();
  const wood = mat(PALETTE.wood, 0.75);
  const w = 1.0, h = 1.9, d = 0.32;
  box(g, 0.03, h, d, wood, -w / 2, h / 2, 0);
  box(g, 0.03, h, d, wood, w / 2, h / 2, 0);
  box(g, w, 0.02, d, mat(PALETTE.woodDark), 0, h / 2, -d / 2 + 0.01);
  for (let i = 0; i < 5; i++) box(g, w, 0.03, d, wood, 0, 0.05 + i * 0.45, 0);
  // A few fixed props so an empty shelf still reads as a shelf.
  box(g, 0.18, 0.14, 0.14, mat(PALETTE.terracotta), 0.35, 1.87, 0.02);
  sphere(g, 0.1, mat(PALETTE.leaf), 0.35, 2.0, 0.02);
  return { group: g, surface: { centre: new THREE.Vector3(0, 0.07, 0.02), w: 0.9, d: 1.4, style: "book" }, emissive: [] };
}

function cabinet(): Built {
  const g = new THREE.Group();
  box(g, 0.5, 1.3, 0.6, mat(PALETTE.slate, 0.55), 0, 0.65, 0, 0.02);
  for (let i = 0; i < 4; i++) {
    box(g, 0.46, 0.28, 0.01, mat(0x566074, 0.5), 0, 0.17 + i * 0.31, 0.3, 0.006);
    box(g, 0.12, 0.02, 0.025, mat(0xc9ced6, 0.3), 0, 0.26 + i * 0.31, 0.315, 0.006);
  }
  return { group: g, surface: { centre: new THREE.Vector3(0, 1.31, 0), w: 0.42, d: 0.5, style: "box" }, emissive: [] };
}

function bed(): Built {
  const g = new THREE.Group();
  // Anchor is the chest at the foot of the bed; the bed runs back to the wall.
  const bedG = new THREE.Group();
  bedG.position.set(0, 0, -1.3);
  box(bedG, 1.45, 0.28, 2.05, mat(PALETTE.wood, 0.75), 0, 0.2, 0, 0.02);
  box(bedG, 1.45, 0.75, 0.06, mat(PALETTE.wood, 0.75), 0, 0.5, -1.0, 0.02);
  box(bedG, 1.38, 0.18, 1.95, mat(PALETTE.white, 0.95), 0, 0.42, 0, 0.05);
  box(bedG, 1.42, 0.08, 1.35, mat(PALETTE.sage, 0.95), 0, 0.54, 0.33, 0.04);
  box(bedG, 0.55, 0.12, 0.35, mat(PALETTE.cream, 0.95), -0.32, 0.58, -0.75, 0.05);
  box(bedG, 0.55, 0.12, 0.35, mat(PALETTE.cream, 0.95), 0.32, 0.58, -0.75, 0.05);
  g.add(bedG);
  // Footlocker: body, an overhanging lid with a seam, brass corners, two straps, a hasp and padlock,
  // and rope handles on the ends. The front faces the room (+z).
  const trunk = mat(0x7b4a8c, 0.75), trim = mat(0x4a2f3a, 0.7), brass = new THREE.MeshStandardMaterial({ color: 0xd8a948, roughness: 0.35, metalness: 0.6 });
  box(g, 1.0, 0.32, 0.45, trunk, 0, 0.16, 0, 0.015);
  box(g, 1.04, 0.1, 0.49, trunk, 0, 0.37, 0, 0.02);
  box(g, 1.05, 0.018, 0.5, trim, 0, 0.32, 0, 0.004);
  box(g, 1.02, 0.04, 0.47, trim, 0, 0.02, 0, 0.006);
  for (const x of [-0.3, 0.3]) {
    box(g, 0.06, 0.4, 0.012, trim, x, 0.21, 0.231, 0.003);
    box(g, 0.06, 0.012, 0.5, trim, x, 0.421, 0, 0.003);
  }
  for (const x of [-0.5, 0.5]) for (const z of [-0.225, 0.225]) for (const y of [0.05, 0.37]) box(g, 0.07, 0.07, 0.07, brass, x * 0.99, y, z, 0.01);
  box(g, 0.12, 0.1, 0.012, brass, 0, 0.3, 0.234, 0.004);
  const lock = box(g, 0.07, 0.06, 0.025, brass, 0, 0.23, 0.25, 0.006);
  lock.name = "padlock";
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI), brass);
  shackle.position.set(0, 0.26, 0.25);
  g.add(shackle);
  for (const x of [-0.515, 0.515]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), trim);
    h.position.set(x, 0.24, 0);
    h.rotation.set(Math.PI, Math.PI / 2, 0);
    g.add(h);
  }
  return { group: g, surface: { centre: new THREE.Vector3(0, 0.43, 0), w: 0.85, d: 0.34, style: "box" }, emissive: [] };
}

function calendar(): Built {
  const g = new THREE.Group();
  // A tear-off day calendar showing today, redrawn when the date changes.
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 512;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const w = 0.6, h = 0.8;
  box(g, w + 0.03, h + 0.03, 0.03, mat(0x1fb8cc, 0.7), 0, 0, 0.015, 0.006);
  const page = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 }));
  page.position.z = 0.032;
  page.name = "calendar-page";
  g.add(page);
  // A thin stack of pages still to tear off.
  box(g, w - 0.01, h - 0.01, 0.012, mat(PALETTE.white, 0.95), 0, -0.004, 0.024, 0.003);
  let shown = "";
  const tick = (now: Date) => {
    const p = calendarPage(now);
    if (p.key === shown) return;
    shown = p.key;
    drawCalendarPage(canvas.getContext("2d")!, canvas.width, canvas.height, p);
    tex.needsUpdate = true;
  };
  tick(new Date());
  // Review and event memories hang as cards in a row under the calendar.
  return { group: g, surface: { centre: new THREE.Vector3(0, -h / 2 - 0.2, 0.03), w: 0.9, d: 0.28, style: "card", wall: true }, emissive: [], tick };
}

function corkboard(): Built {
  const g = new THREE.Group();
  box(g, 1.3, 0.9, 0.03, mat(PALETTE.woodDark), 0, 0, 0.015, 0.008);
  box(g, 1.22, 0.82, 0.02, mat(PALETTE.cork, 1), 0, 0, 0.03, 0.004);
  return { group: g, surface: { centre: new THREE.Vector3(0, 0, 0.045), w: 1.1, d: 0.7, style: "card", wall: true }, emissive: [] };
}

function mirror(): Built {
  const g = new THREE.Group();
  box(g, 0.6, 1.5, 0.04, mat(PALETTE.woodLight, 0.6), 0, 0, 0.02, 0.01);
  const glass = new THREE.MeshStandardMaterial({ color: 0xc8d6e0, roughness: 0.08, metalness: 0.9 });
  box(g, 0.5, 1.4, 0.01, glass, 0, 0, 0.045, 0.004);
  return { group: g, surface: { centre: new THREE.Vector3(0, 0.55, 0.06), w: 0.45, d: 0.2, style: "card", wall: true }, emissive: [] };
}

function windowFrame(sky: THREE.Texture): Built {
  const g = new THREE.Group();
  const frame = mat(PALETTE.white, 0.6);
  const w = 1.8, h = 1.3;
  const view = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.08), new THREE.MeshBasicMaterial({ map: sky, toneMapped: false }));
  view.position.z = -0.02;
  view.name = "window-view";
  g.add(view);
  box(g, w, 0.06, 0.12, frame, 0, h / 2, 0);
  box(g, w, 0.06, 0.12, frame, 0, -h / 2, 0);
  box(g, 0.06, h, 0.12, frame, -w / 2, 0, 0);
  box(g, 0.06, h, 0.12, frame, w / 2, 0, 0);
  box(g, 0.04, h, 0.06, frame, 0, 0, 0);
  box(g, w + 0.2, 0.05, 0.22, frame, 0, -h / 2 - 0.02, 0.08);
  return { group: g, surface: { centre: new THREE.Vector3(0, -h / 2 + 0.01, 0.1), w: 1.6, d: 0.14, style: "bloom" }, emissive: [] };
}

function plant(): Built {
  const g = new THREE.Group();
  cyl(g, 0.22, 0.17, 0.4, mat(PALETTE.terracotta, 0.9), 0, 0.2, 0);
  cyl(g, 0.02, 0.025, 0.6, mat(PALETTE.woodDark), 0, 0.65, 0, 6);
  const leaf = mat(PALETTE.leaf, 0.9);
  for (const [x, y, z, r] of [[0, 1.15, 0, 0.32], [-0.18, 0.95, 0.08, 0.24], [0.2, 1.0, -0.05, 0.26], [0.05, 1.38, 0.05, 0.2]]) {
    const s = sphere(g, r, leaf, x, y, z);
    s.name = "foliage";
  }
  return { group: g, surface: { centre: new THREE.Vector3(0, 1.1, 0.05), w: 0.5, d: 0.45, style: "bloom" }, emissive: [] };
}

function photoTable(): Built {
  const g = new THREE.Group();
  const wood = mat(PALETTE.woodDark, 0.7);
  box(g, 0.9, 0.04, 0.4, wood, 0, 0.78, 0);
  for (const [x, z] of [[-0.4, -0.15], [0.4, -0.15], [-0.4, 0.15], [0.4, 0.15]]) box(g, 0.035, 0.76, 0.035, wood, x, 0.38, z, 0.006);
  // Table lamp.
  const shade = glowMat(0xffc27a);
  cyl(g, 0.05, 0.07, 0.25, mat(PALETTE.cream), 0.32, 0.92, -0.05);
  cyl(g, 0.09, 0.14, 0.18, shade, 0.32, 1.12, -0.05);
  return { group: g, surface: { centre: new THREE.Vector3(-0.1, 0.8, 0), w: 0.6, d: 0.3, style: "photo" }, emissive: [shade] };
}

function music(): Built {
  const g = new THREE.Group();
  // Low sideboard: plinth, carcass, top, two panelled doors with knobs and an open record shelf.
  const wood = mat(PALETTE.wood, 0.7), dark = mat(PALETTE.woodDark, 0.7), light = mat(PALETTE.woodLight, 0.7);
  box(g, 1.04, 0.06, 0.38, dark, 0, 0.03, -0.01, 0.01);
  // Closed half on the left, open record shelf on the right (a shell: back, floor, divider, end).
  box(g, 0.56, 0.42, 0.42, wood, -0.27, 0.27, 0, 0.015);
  box(g, 0.54, 0.42, 0.03, wood, 0.28, 0.27, -0.195, 0.006);
  box(g, 0.54, 0.03, 0.42, wood, 0.28, 0.075, 0, 0.006);
  box(g, 0.03, 0.42, 0.42, wood, 0.535, 0.27, 0, 0.008);
  box(g, 0.48, 0.38, 0.01, dark, 0.27, 0.27, -0.175, 0.002);
  box(g, 1.14, 0.03, 0.45, dark, 0, 0.495, 0, 0.008);
  for (const x of [-0.39, -0.13]) {
    box(g, 0.24, 0.34, 0.012, light, x, 0.27, 0.213, 0.006);
    box(g, 0.18, 0.27, 0.008, wood, x, 0.27, 0.222, 0.004);
  }
  for (const x of [-0.29, -0.23]) sphere(g, 0.014, mat(PALETTE.charcoal, 0.4), x, 0.28, 0.232);
  const sleeves = [0xd96c6c, 0xf0d264, 0x7fa7d9, 0x8fae8b, 0xe8a0b4, 0x9b7fd1, 0xf1e6d2, 0xc0704f, 0x5b3f63, 0xe0a83a];
  sleeves.forEach((c, i) => {
    const r = box(g, 0.018, 0.3, 0.3, mat(c, 0.8), 0.05 + i * 0.035, 0.24, 0.0, 0.003);
    if (i === sleeves.length - 1) r.rotation.z = -0.3;
  });
  const display = glowMat(0x52e0c4);
  box(g, 0.4, 0.14, 0.32, mat(PALETTE.charcoal, 0.4), 0, 0.57, 0, 0.015);
  box(g, 0.14, 0.03, 0.005, display, 0.08, 0.58, 0.162, 0.002);
  for (const x of [-0.42, 0.42]) {
    box(g, 0.2, 0.34, 0.2, mat(PALETTE.charcoal, 0.5), x, 0.67, 0, 0.015);
    const cone = cyl(g, 0.06, 0.06, 0.01, mat(0x555a63), x, 0.62, 0.105);
    cone.rotation.x = Math.PI / 2;
    cone.name = "speaker";
  }
  return { group: g, surface: { centre: new THREE.Vector3(0, 0.505, 0.12), w: 0.22, d: 0.12, style: "disc" }, emissive: [display] };
}

export function buildFurniture(kind: string, sky: THREE.Texture): Built {
  switch (kind) {
    case "desk": return desk();
    case "bookshelf": return bookshelf();
    case "cabinet": return cabinet();
    case "bed": return bed();
    case "calendar": return calendar();
    case "corkboard": return corkboard();
    case "mirror": return mirror();
    case "window": return windowFrame(sky);
    case "plant": return plant();
    case "photo_table": return photoTable();
    case "music": return music();
    default: {
      const g = new THREE.Group();
      box(g, 0.5, 0.5, 0.5, mat(PALETTE.cream), 0, 0.25, 0);
      return { group: g, surface: { centre: new THREE.Vector3(0, 0.5, 0), w: 0.4, d: 0.4, style: "box" }, emissive: [] };
    }
  }
}
