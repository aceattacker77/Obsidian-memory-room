// One small object per memory, laid out on its spot's surface. Older than the fade window, a token
// loses most of its colour (the game's 5-day fade).

import * as THREE from "three";
import { Surface, box, cyl } from "./furniture";
import { Memory } from "./memories";

export const KIND_COLOURS: Record<string, number> = {
  inbox: 0xe0a83a, review: 0xc0704f, identity: 0x7fa7d9, mission: 0xd96c6c, question: 0xf0d264,
  decision: 0x7c8db5, project: 0xe8915a, note: 0x6f9e7a, log: 0xf2a7c3, archive: 0xb59a7c,
  interest: 0x9ad0e8, person: 0xf5d0a9, photo: 0xf5d0a9, song: 0x9b7fd1, money: 0xf2c94c,
  card: 0xf1e6d2, email: 0xe0a83a, letter: 0xf1e6d2, event: 0xc0704f, file: 0x7c8db5,
};

function faded(colour: number): number {
  const c = new THREE.Color(colour);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * 0.2, Math.min(1, hsl.l * 0.85 + 0.12));
  return c.getHex();
}

const tokenMats = new Map<number, THREE.MeshStandardMaterial>();
function tokenMat(colour: number): THREE.MeshStandardMaterial {
  let m = tokenMats.get(colour);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8 });
    tokenMats.set(colour, m);
  }
  return m;
}

function tag(mesh: THREE.Object3D, m: Memory): void {
  mesh.traverse((o) => { o.userData.memory = m.path; });
}

/** Grid cell centres filling a w x d rectangle with n items. */
function grid(n: number, w: number, d: number): [number, number][] {
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * w) / Math.max(d, 0.01))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push([(-w / 2) + (w / cols) * (c + 0.5), (-d / 2) + (d / rows) * (r + 0.5)]);
  }
  return out;
}

export function layoutTokens(surface: Surface, memories: Memory[], isFaded: (m: Memory) => boolean): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(surface.centre);
  const n = memories.length;
  if (n === 0) return g;

  if (surface.style === "book") {
    // Books stand on four shelves, left to right, newest on the top shelf.
    const perShelf = Math.max(1, Math.ceil(n / 4));
    memories.forEach((m, i) => {
      const shelf = 3 - Math.floor(i / perShelf);
      const slot = i % perShelf;
      const colour = isFaded(m) ? faded(KIND_COLOURS[m.kind] ?? 0xcccccc) : KIND_COLOURS[m.kind] ?? 0xcccccc;
      const h = 0.24 + ((i * 37) % 7) * 0.012;
      const x = -surface.w / 2 + 0.05 + slot * Math.min(0.07, (surface.w - 0.1) / perShelf);
      const b = box(g, 0.05, h, 0.2, tokenMat(colour), x, shelf * 0.45 + h / 2, 0, 0.004);
      tag(b, m);
    });
    return g;
  }

  const cells = grid(n, surface.w, surface.d);
  memories.forEach((m, i) => {
    const [a, b] = cells[i];
    const colour = isFaded(m) ? faded(KIND_COLOURS[m.kind] ?? 0xcccccc) : KIND_COLOURS[m.kind] ?? 0xcccccc;
    const mt = tokenMat(colour);
    let mesh: THREE.Mesh;
    if (surface.wall) {
      // Pinned cards: a in x, b in y (wall plane).
      mesh = box(g, 0.16, 0.12, 0.008, mt, a, -b, 0, 0.003);
      mesh.rotation.z = (((i * 53) % 9) - 4) * 0.02;
    } else {
      switch (surface.style) {
        case "paper": mesh = box(g, 0.21, 0.012, 0.28, mt, a, 0.006 + (i % 3) * 0.012, b, 0.002); mesh.rotation.y = (((i * 31) % 7) - 3) * 0.05; break;
        case "letter": mesh = box(g, 0.2, 0.012, 0.13, mt, a * 0.6, 0.006 + i * 0.014, b * 0.6, 0.002); mesh.rotation.y = i * 0.5; break;
        case "photo": mesh = box(g, 0.12, 0.16, 0.02, mt, a, 0.08, b, 0.004); mesh.rotation.x = -0.18; break;
        case "bloom": mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), mt); mesh.position.set(a, 0.04 + ((i * 17) % 5) * 0.03, b); g.add(mesh); break;
        case "disc": mesh = cyl(g, 0.06, 0.06, 0.008, mt, a, 0.004 + i * 0.009, b); break;
        case "coin": mesh = cyl(g, 0.03, 0.03, 0.01, mt, a, 0.005 + (i % 2) * 0.01, b, 12); break;
        default: mesh = box(g, 0.12, 0.08, 0.16, mt, a, 0.04, b, 0.006);
      }
    }
    tag(mesh, m);
  });
  return g;
}
