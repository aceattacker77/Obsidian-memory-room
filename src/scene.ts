// The 3D room: a cut-away diorama (floor slab, back and left walls) on a soft radial backdrop,
// seen from the open corner by an isometric camera. Independent of Obsidian so it can be rendered
// in a plain browser for screenshots.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PetBrain, DISH, ClipRole, PetState, pickClips } from "./pet";
import { SPOTS, ROOM, SpotDef } from "./spots";
import { Memory } from "./memories";
import { Mood, MOODS, MoodId, moodAt, clockAngles } from "./mood";
import { buildFurniture, Built, box, cyl, mat, glowMat, PALETTE } from "./furniture";
import { layoutTokens } from "./tokens";

export interface Pick {
  spot?: string;
  memory?: string;
}

const FOV = 24;

/** How far the door stands open, radians about its hinge (about 72 degrees into the room). */
const DOOR_OPEN = 1.25;
const CENTRE = new THREE.Vector3((ROOM.floor.x0 + ROOM.floor.x1) / 2, 0.9, (ROOM.floor.z0 + ROOM.floor.z1) / 2);

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function planks(): THREE.CanvasTexture {
  const r = rand(7);
  const t = canvasTexture(512, 512, (c) => {
    const rows = 16;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 200;
      while (x < 512) {
        const len = 180 + r() * 220;
        const l = 44 + r() * 8;
        c.fillStyle = `hsl(26, 42%, ${l}%)`;
        c.fillRect(x, i * 32, len, 32);
        c.fillStyle = "rgba(60,30,15,0.35)";
        c.fillRect(x, i * 32, 2, 32);
        x += len;
      }
      c.fillStyle = "rgba(60,30,15,0.4)";
      c.fillRect(0, i * 32, 512, 1.5);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.5, 1.5);
  t.anisotropy = 4;
  return t;
}

function plaster(base: string): THREE.CanvasTexture {
  const r = rand(11);
  const t = canvasTexture(256, 256, (c) => {
    c.fillStyle = base;
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 500; i++) {
      c.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "80,60,70"},${0.008 + r() * 0.014})`;
      const s = 6 + r() * 26;
      c.beginPath();
      c.arc(r() * 256, r() * 256, s, 0, Math.PI * 2);
      c.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1.5);
  return t;
}

export function skyTexture(mood: Mood): THREE.CanvasTexture {
  const r = rand(3);
  return canvasTexture(512, 360, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 360);
    g.addColorStop(0, mood.sky[1]);
    g.addColorStop(1, mood.sky[0]);
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 360);
    const night = mood.id === "night";
    if (mood.id === "sunset") {
      c.fillStyle = "rgba(255,210,150,0.9)";
      c.beginPath();
      c.arc(360, 250, 40, 0, Math.PI * 2);
      c.fill();
    }
    // Two layers of city skyline.
    for (const [layer, shade] of [[0, night ? "#141a36" : "rgba(90,80,120,0.55)"], [1, night ? "#0a0e22" : "rgba(60,50,85,0.8)"]] as const) {
      let x = -10;
      while (x < 520) {
        const w = 30 + r() * 50;
        const h = (layer ? 90 : 140) + r() * (layer ? 120 : 110);
        c.fillStyle = shade;
        c.fillRect(x, 360 - h, w, h);
        if (night || mood.id === "sunset") {
          for (let wy = 360 - h + 8; wy < 352; wy += 12) {
            for (let wx = x + 5; wx < x + w - 6; wx += 9) {
              if (r() < (night ? 0.35 : 0.12)) {
                c.fillStyle = r() < 0.7 ? "rgba(255,214,140,0.95)" : "rgba(160,220,255,0.9)";
                c.fillRect(wx, wy, 4, 5);
              }
            }
          }
        }
        x += w + 4;
      }
    }
    if (night) {
      for (let i = 0; i < 60; i++) {
        c.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
        c.fillRect(r() * 512, r() * 150, 1.5, 1.5);
      }
    }
  });
}

export class RoomScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x302030, 1);
  private nightLights: THREE.PointLight[] = [];
  private emissive: THREE.MeshStandardMaterial[] = [];
  private ticks: ((now: Date) => void)[] = [];
  private door?: { hinge: THREE.Group; goal: number };
  private spotGroups = new Map<string, THREE.Group>();
  private surfaces = new Map<string, Built>();
  private tokenGroups = new Map<string, THREE.Group>();
  private foliage: THREE.Object3D[] = [];
  private speakers: THREE.Object3D[] = [];
  private pet?: {
    root: THREE.Group; body: THREE.Group; brain: PetBrain; last: number;
    /** A rigged model's own clips, when it has them. */
    mixer?: THREE.AnimationMixer; actions: Partial<Record<ClipRole, THREE.AnimationAction>>; playing?: THREE.AnimationAction;
    lastState?: PetState; height: number;
  };
  private hearts: { sprite: THREE.Sprite; age: number }[] = [];
  private heartTexture?: THREE.CanvasTexture;
  private musicPlaying = false;
  private sky: THREE.CanvasTexture;
  private skyMat?: THREE.MeshBasicMaterial;
  private mood: Mood = MOODS.sunset;
  private raycaster = new THREE.Raycaster();
  private frame = 0;
  private running = false;
  private onVisibility = () => { if (!document.hidden) this.requestRender(); };
  // Camera orbit state.
  private az = 45;
  private el = 32;
  private zoom = 1;
  private target = CENTRE.clone();
  private goal = { az: 45, el: 32, zoom: 1, target: CENTRE.clone() };
  private highlighted?: string;
  /** When on, the light follows the computer's clock; checked once a minute while the room is drawn. */
  private autoLight = false;
  private lightMinute = -1;
  private hands?: { hour: THREE.Object3D; minute: THREE.Object3D; second: THREE.Object3D };

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add("memory-room-canvas");

    // A long lens, not an orthographic camera: from the default corner it still reads as an
    // isometric diorama, but when you orbit the floor foreshortens like a real box, so it keeps
    // reading as a rectangle instead of shearing into a parallelogram.
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
    this.sky = skyTexture(this.mood);
    this.buildShell();
    this.buildSpots();
    this.buildDressing();

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -12; s.right = 12; s.top = 12; s.bottom = -12; s.near = 0.5; s.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.setMood("sunset");
    this.resize();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private buildShell(): void {
    const { x0, z0, x1, z1 } = ROOM.floor;
    const W = x1 - x0, D = z1 - z0, H = ROOM.wallHeight, T = 0.18;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

    // Floor slab with plank top and a thick cream edge.
    const plankMat = new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.75 });
    const edge = mat(0xe9e2d8, 0.9);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + T, 0.3, D + T), [edge, edge, plankMat, edge, edge, edge]);
    slab.position.set(cx - T / 2, -0.15, cz - T / 2);
    slab.receiveShadow = true;
    slab.castShadow = true;
    this.scene.add(slab);

    // Ground far below catches the slab's long soft shadow on the backdrop.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.15 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.6;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const wallMat = new THREE.MeshStandardMaterial({ map: plaster("#efe2d6"), roughness: 0.95 });
    const accentMat = new THREE.MeshStandardMaterial({ map: plaster("#b9a3c6"), roughness: 0.95 });
    const cap = mat(0xdcd8d2, 0.9);
    const wallPiece = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [m, m, cap, m, m, m]);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };

    // Back wall with the window opening.
    const win = SPOTS.find((s) => s.id === "window")!;
    const wx = win.anchor[0], wy = win.anchor[1], ww = 1.8, wh = 1.3;
    const bz = z0 - T / 2;
    const left = wx - ww / 2 - (x0 - T), right = x1 - (wx + ww / 2);
    wallPiece(left, H, T, x0 - T + left / 2, H / 2, bz, wallMat);
    wallPiece(right, H, T, wx + ww / 2 + right / 2, H / 2, bz, wallMat);
    wallPiece(ww, wy - wh / 2, T, wx, (wy - wh / 2) / 2, bz, wallMat);
    wallPiece(ww, H - (wy + wh / 2), T, wx, (H + wy + wh / 2) / 2, bz, wallMat);
    // The city behind the window.
    this.skyMat = new THREE.MeshBasicMaterial({ map: this.sky, toneMapped: false });
    const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), this.skyMat);
    skyPlane.position.set(wx, wy, z0 - T - 0.01);
    this.scene.add(skyPlane);

    // Left wall (accent colour) with the doorway.
    const lx = x0 - T / 2, dw = 1.0, dh = 2.15, dz = ROOM.doorZ;
    const back = dz - dw / 2 - z0, front = z1 - (dz + dw / 2);
    wallPiece(T, H, back, lx, H / 2, z0 + back / 2, accentMat);
    wallPiece(T, H, front, lx, H / 2, dz + dw / 2 + front / 2, accentMat);
    wallPiece(T, H - dh, dw, lx, (H + dh) / 2, dz, accentMat);
    this.buildDoor(x0, dz, dw, dh);

    // Skirting.
    box(this.scene, W, 0.08, 0.02, mat(PALETTE.white, 0.7), cx, 0.04, z0 + 0.01, 0.004);
  }

  /** A casing round the doorway and a panelled door standing open into the room, hinged on the back side. */
  private buildDoor(x0: number, dz: number, dw: number, dh: number): void {
    const casing = mat(PALETTE.white, 0.6);
    box(this.scene, 0.06, dh + 0.06, 0.08, casing, x0 + 0.02, dh / 2, dz - dw / 2 - 0.04, 0.008);
    box(this.scene, 0.06, dh + 0.06, 0.08, casing, x0 + 0.02, dh / 2, dz + dw / 2 + 0.04, 0.008);
    box(this.scene, 0.06, 0.08, dw + 0.16, casing, x0 + 0.02, dh + 0.04, dz, 0.008);
    const hinge = new THREE.Group();
    hinge.position.set(x0 + 0.03, 0, dz - dw / 2 + 0.02);
    hinge.rotation.y = DOOR_OPEN;
    const w = dw - 0.04, h = dh - 0.03;
    const panel = mat(0xf3e9dc, 0.7), inset = mat(0xe6d8c6, 0.75);
    box(hinge, 0.045, h, w, panel, 0, h / 2 + 0.01, w / 2, 0.01);
    // Four raised panels on each face.
    for (const side of [-1, 1]) for (const [y, ph] of [[0.55, 0.7], [1.45, 0.85]]) for (const z of [0.28, 0.72]) {
      box(hinge, 0.012, ph, w * 0.34, inset, side * 0.026, y, w * z, 0.006);
    }
    const brass = new THREE.MeshStandardMaterial({ color: 0xd8a948, roughness: 0.35, metalness: 0.6 });
    for (const side of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), brass);
      knob.position.set(side * 0.05, 1.0, w - 0.08);
      knob.castShadow = true;
      hinge.add(knob);
    }
    hinge.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.scene.add(hinge);
    this.door = { hinge, goal: DOOR_OPEN };
  }

  /** True when the screen point is on the door. */
  doorAt(clientX: number, clientY: number): boolean {
    if (!this.door) return false;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(this.door.hinge, true).length > 0;
  }

  /** Clicked: the door swings shut, or open again. */
  toggleDoor(): void {
    if (!this.door) return;
    this.door.goal = this.door.goal === 0 ? DOOR_OPEN : 0;
    this.requestRender();
  }

  private buildSpots(): void {
    for (const spot of SPOTS) {
      const built = buildFurniture(spot.furniture, this.sky);
      const g = built.group;
      g.position.set(...spot.anchor);
      if (spot.mount && spot.mount[0] === 1) g.rotation.y = Math.PI / 2;
      g.traverse((o) => { o.userData.spot = spot.id; });
      g.traverse((o) => { if (o.name === "foliage") this.foliage.push(o); });
      g.traverse((o) => { if (o.name === "speaker") this.speakers.push(o); });
      if (spot.id === "window") {
        // The window's own view plane duplicates the wall's sky plane; hide it.
        const v = g.getObjectByName("window-view");
        if (v) v.visible = false;
      }
      this.scene.add(g);
      this.spotGroups.set(spot.id, g);
      this.surfaces.set(spot.id, built);
      this.emissive.push(...built.emissive);
      if (built.tick) this.ticks.push(built.tick);
    }
  }

  private buildDressing(): void {
    // Rug, floor lamp and a neon sign: the references' cozy-at-night look.
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.015, 48), mat(0xd9c3b0, 1));
    rug.position.set(-1.0, 0.008, -1.6);
    rug.scale.z = 0.75;
    rug.receiveShadow = true;
    this.scene.add(rug);

    const lamp = new THREE.Group();
    cyl(lamp, 0.16, 0.18, 0.03, mat(PALETTE.charcoal, 0.4), 0, 0.015, 0);
    cyl(lamp, 0.015, 0.015, 1.5, mat(PALETTE.charcoal, 0.4), 0, 0.76, 0, 8);
    const shade = glowMat(0xffc27a);
    cyl(lamp, 0.14, 0.22, 0.28, shade, 0, 1.6, 0);
    lamp.position.set(3.55, 0, -1.6);
    this.scene.add(lamp);
    this.emissive.push(shade);

    const neon = glowMat(0xff4fa3);
    const bolt = new THREE.Group();
    box(bolt, 0.05, 0.5, 0.02, neon, 0, 0.2, 0, 0.01).rotation.z = 0.35;
    box(bolt, 0.3, 0.05, 0.02, neon, 0.02, 0, 0, 0.01);
    box(bolt, 0.05, 0.5, 0.02, neon, 0.05, -0.22, 0, 0.01).rotation.z = 0.35;
    bolt.position.set(ROOM.floor.x0 + 0.02, 2.3, -3.6);
    bolt.rotation.y = Math.PI / 2;
    this.scene.add(bolt);
    this.emissive.push(neon);

    const mk = (c: number, x: number, y: number, z: number, d: number) => {
      const p = new THREE.PointLight(c, 0, d, 2);
      p.position.set(x, y, z);
      this.scene.add(p);
      this.nightLights.push(p);
    };
    mk(0xffb36b, 3.55, 1.55, -1.6, 6);
    mk(0xb46cff, 0.25, 0.6, -3.7, 3.5);
    mk(0xff4fa3, -5.6, 2.3, -3.6, 3.5);
    mk(0xffb36b, -3.1, 1.1, -4.0, 3);
    mk(0x7fb4ff, 0.25, 1.2, -3.6, 3);

    this.buildClock();
    this.buildDish();
  }

  /** The cat's food dish in the front-right corner, on a little mat. */
  private buildDish(): void {
    const g = new THREE.Group();
    const mt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.01, 32), mat(0x8fc1b5, 0.95));
    mt.scale.z = 0.7;
    mt.position.y = 0.005;
    mt.receiveShadow = true;
    g.add(mt);
    const bowl = new THREE.Mesh(
      new THREE.LatheGeometry([new THREE.Vector2(0.09, 0), new THREE.Vector2(0.15, 0.015), new THREE.Vector2(0.16, 0.07), new THREE.Vector2(0.14, 0.075), new THREE.Vector2(0.12, 0.03), new THREE.Vector2(0, 0.03)], 32),
      mat(0xf28cb5, 0.5),
    );
    bowl.position.y = 0.01;
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    g.add(bowl);
    const kibble = mat(0x9a5b32, 0.8);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4, r = 0.03 + (i % 4) * 0.022;
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), kibble);
      k.position.set(Math.cos(a) * r, 0.055 + (i % 3) * 0.006, Math.sin(a) * r);
      g.add(k);
    }
    g.position.set(DISH.x, 0, DISH.z);
    g.rotation.y = -0.6;
    this.scene.add(g);
  }

  /**
   * Put the pet in the room from a glTF model (DJ Whiskers). Walk, idle and wave come from the
   * model's own clips when it has them; otherwise they are posed here.
   */
  async setPet(data: ArrayBuffer): Promise<void> {
    const gltf = await new GLTFLoader().parseAsync(data, "");
    const model = gltf.scene;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      // No environment map here, so a metallic surface would render black; keep it a soft toy.
      for (const mm of Array.isArray(m.material) ? m.material : [m.material]) {
        const sm = mm as THREE.MeshStandardMaterial;
        sm.metalness = 0;
        sm.metalnessMap = null;
        sm.roughness = 0.75;
        sm.needsUpdate = true;
      }
    });
    const size = new THREE.Box3().setFromObject(model);
    const h = size.max.y - size.min.y;
    const k = 0.5 / h;
    model.scale.setScalar(k);
    const c = size.getCenter(new THREE.Vector3());
    model.position.set(-c.x * k, -size.min.y * k, -c.z * k);
    // The model faces +z, which is heading 0 in pet.ts.
    const body = new THREE.Group();
    body.add(model);
    const root = new THREE.Group();
    root.add(body);
    root.userData.pet = true;
    this.scene.add(root);
    // Rigged (for example by Meshy): play its walk, idle and wave clips. Root motion is dropped,
    // since pet.ts moves the cat.
    const actions: Partial<Record<ClipRole, THREE.AnimationAction>> = {};
    let mixer: THREE.AnimationMixer | undefined;
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      const chosen = pickClips(gltf.animations.map((a) => a.name));
      for (const [role, name] of Object.entries(chosen) as [ClipRole, string][]) {
        const clip = gltf.animations.find((a) => a.name === name)!.clone();
        clip.tracks = clip.tracks.filter((t) => !/(hips|root|pelvis)[^.]*\.position$/i.test(t.name));
        const action = mixer.clipAction(clip);
        if (role === "wave") { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
        actions[role] = action;
      }
      model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; });
    }
    this.pet = { root, body, brain: new PetBrain(), last: performance.now(), mixer, actions, height: h * k };
    this.posePet(0);
    this.requestRender();
  }

  /** True when the screen point is on the pet. */
  petAt(clientX: number, clientY: number): boolean {
    if (!this.pet) return false;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(this.pet.root, true).length > 0;
  }

  /** Clicked: she turns to face you, waves (her own clip if rigged) with a heart, then carries on. */
  petGreet(): void {
    if (!this.pet) return;
    const p = this.pet.brain.pose;
    const face = Math.atan2(this.camera.position.x - p.x, this.camera.position.z - p.z);
    const wave = this.pet.actions.wave;
    this.pet.brain.greet(face, wave ? wave.getClip().duration : 1.8);
  }

  /** A pink heart that pops up over her head and floats away. */
  private popHeart(): void {
    if (!this.pet) return;
    if (!this.heartTexture) {
      this.heartTexture = canvasTexture(128, 128, (c) => {
        c.translate(64, 70);
        c.scale(1.9, 1.9);
        c.beginPath();
        c.moveTo(0, 22);
        c.bezierCurveTo(-34, 0, -26, -30, 0, -14);
        c.bezierCurveTo(26, -30, 34, 0, 0, 22);
        c.fillStyle = "#ff5c9a";
        c.fill();
        c.lineWidth = 3;
        c.strokeStyle = "#ffffff";
        c.stroke();
        c.beginPath();
        c.ellipse(-12, -10, 5, 3, -0.6, 0, Math.PI * 2);
        c.fillStyle = "rgba(255,255,255,0.8)";
        c.fill();
      });
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heartTexture, transparent: true, depthWrite: false, toneMapped: false }));
    const at = this.pet.root.position;
    sprite.position.set(at.x, this.pet.height + 0.12, at.z);
    sprite.scale.setScalar(0.01);
    this.scene.add(sprite);
    this.hearts.push({ sprite, age: 0 });
  }

  private updateHearts(dt: number): void {
    for (const h of this.hearts) {
      h.age += dt;
      const a = h.age;
      // Pop in with a little overshoot, drift up, fade out over two seconds.
      const pop = a < 0.25 ? (a / 0.25) * 1.25 : a < 0.4 ? 1.25 - ((a - 0.25) / 0.15) * 0.25 : 1;
      h.sprite.scale.setScalar(0.22 * pop);
      h.sprite.position.y += dt * 0.18;
      (h.sprite.material as THREE.SpriteMaterial).opacity = a < 1.4 ? 1 : Math.max(0, 1 - (a - 1.4) / 0.6);
    }
    for (const h of this.hearts.filter((x) => x.age >= 2)) {
      h.sprite.removeFromParent();
      h.sprite.material.dispose();
    }
    this.hearts = this.hearts.filter((x) => x.age < 2);
  }

  private playClip(state: PetState): void {
    const pet = this.pet!;
    const role: ClipRole = state === "walk" ? "walk" : state === "wave" ? "wave" : "idle";
    const next = role ? pet.actions[role] : undefined;
    if (next === pet.playing) return;
    if (next) {
      next.reset().play();
      if (pet.playing) pet.playing.crossFadeTo(next, 0.25, false);
    } else {
      pet.playing?.fadeOut(0.25);
    }
    pet.playing = next;
  }

  private posePet(dt: number): void {
    if (!this.pet) return;
    const { root, body, brain, actions } = this.pet;
    const p = brain.update(dt);
    if (p.state === "wave" && this.pet.lastState !== "wave") this.popHeart();
    this.pet.lastState = p.state;
    this.updateHearts(dt);
    if (this.pet.mixer) {
      this.playClip(p.state);
      this.pet.mixer.update(dt);
    }
    root.position.set(p.x, 0, p.z);
    root.rotation.y = p.heading;
    body.position.y = 0;
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);
    if (p.state === "walk" && !actions.walk) {
      body.position.y = Math.abs(Math.sin(p.t * 9)) * 0.025;
      body.rotation.z = Math.sin(p.t * 9) * 0.07;
    } else if (p.state === "sit" && !actions.idle) {
      body.scale.y = 1 + Math.sin(p.t * 2) * 0.015;
    } else if (p.state === "eat") {
      body.rotation.x = 0.22 + Math.sin(p.t * 8) * 0.07;
    } else if (p.state === "wave" && !actions.wave) {
      // No rig to lift a paw: a happy wiggle and bounce instead.
      body.rotation.z = Math.sin(p.t * 11) * 0.16;
      body.position.y = Math.abs(Math.sin(p.t * 5.5)) * 0.05;
    }
  }

  /** A wall clock between the calendar and the window, showing the computer's time. */
  private buildClock(): void {
    const clock = new THREE.Group();
    const R = 0.3;
    const rim = cyl(clock, R + 0.03, R + 0.03, 0.06, mat(PALETTE.charcoal, 0.4), 0, 0, 0, 40);
    rim.rotation.x = Math.PI / 2;
    // A faint glow of its own so it stays readable at night.
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xf6efe4, roughness: 0.8, emissive: 0xf6efe4, emissiveIntensity: 0.12 });
    const face = cyl(clock, R, R, 0.02, faceMat, 0, 0, 0.025, 40);
    face.rotation.x = Math.PI / 2;
    const ink = mat(PALETTE.charcoal, 0.5);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const long = i % 3 === 0;
      const t = box(clock, long ? 0.025 : 0.015, long ? 0.07 : 0.04, 0.005, ink, Math.sin(a) * (R - 0.06), Math.cos(a) * (R - 0.06), 0.037, 0.002);
      t.rotation.z = -a;
    }
    const hand = (len: number, w: number, m: THREE.Material, z: number) => {
      const pivot = new THREE.Group();
      pivot.position.z = z;
      box(pivot, w, len, 0.006, m, 0, len / 2 - 0.03, 0, 0.002);
      clock.add(pivot);
      return pivot;
    };
    this.hands = {
      hour: hand(0.17, 0.03, ink, 0.042),
      minute: hand(0.25, 0.02, ink, 0.048),
      second: hand(0.27, 0.008, mat(0xd8574a, 0.5), 0.054),
    };
    cyl(clock, 0.018, 0.018, 0.03, ink, 0, 0, 0.05, 12).rotation.x = Math.PI / 2;
    clock.position.set(-1.75, 2.55, ROOM.floor.z0 + 0.04);
    clock.traverse((o) => { o.castShadow = true; });
    this.scene.add(clock);
    this.setClock(new Date());
  }

  private setClock(d: Date): void {
    if (!this.hands) return;
    const a = clockAngles(d);
    this.hands.hour.rotation.z = -a.hour;
    this.hands.minute.rotation.z = -a.minute;
    this.hands.second.rotation.z = -a.second;
  }

  setMusicPlaying(on: boolean): void {
    this.musicPlaying = on;
  }

  /** Follow the computer's clock (true) or hold the mood last set (false). */
  setAutoLight(on: boolean): void {
    this.autoLight = on;
    this.lightMinute = -1;
    if (on) this.followClock(new Date());
  }

  private followClock(d: Date): void {
    const minute = Math.floor(d.getTime() / 60_000);
    if (minute === this.lightMinute) return;
    this.lightMinute = minute;
    this.setMood(moodAt(d));
  }

  setMood(mood: MoodId | Mood): void {
    const prev = this.mood;
    this.mood = typeof mood === "string" ? MOODS[mood] : mood;
    const m = this.mood;
    this.host.style.background = `radial-gradient(ellipse at 50% 45%, ${m.backdrop[0]} 0%, ${m.backdrop[1]} 100%)`;
    this.hemi.color.setHex(m.ambient);
    this.hemi.groundColor.setHex(0x2a2030);
    this.hemi.intensity = m.ambientEnergy;
    this.sun.color.setHex(m.sun);
    this.sun.intensity = m.sunEnergy;
    const az = THREE.MathUtils.degToRad(m.sunAz), el = THREE.MathUtils.degToRad(m.sunEl);
    this.sun.position.set(CENTRE.x + Math.sin(az) * Math.cos(el) * 20, Math.sin(el) * 20, CENTRE.z + Math.cos(az) * Math.cos(el) * 20);
    this.sun.target.position.copy(CENTRE);
    for (const e of this.emissive) e.emissiveIntensity = 0.2 + m.glow * 1.3;
    const intensities = [3.5, 2.5, 2.5, 1.8, 1.5];
    this.nightLights.forEach((p, i) => { p.intensity = m.glow * intensities[i]; });
    this.bloom.strength = 0.1 + m.glow * 0.45;
    this.bloom.radius = 0.35;
    // 0 at sunset, 1 at night, eased between them as the evening blends.
    const dark = THREE.MathUtils.clamp((m.glow - MOODS.sunset.glow) / (MOODS.night.glow - MOODS.sunset.glow), 0, 1);
    this.bloom.threshold = 0.9 - 0.2 * dark;
    this.renderer.toneMappingExposure = 1.0 + 0.15 * dark;
    if (prev !== m || !this.skyMat || this.skyMat.map !== this.sky) {
      const old = this.sky;
      this.sky = skyTexture(m);
      if (this.skyMat) { this.skyMat.map = this.sky; this.skyMat.needsUpdate = true; }
      if (old !== this.sky) old.dispose();
    }
    this.requestRender();
  }

  setMemories(bySpot: Map<string, Memory[]>, isFaded: (m: Memory) => boolean): void {
    for (const g of this.tokenGroups.values()) g.removeFromParent();
    this.tokenGroups.clear();
    for (const spot of SPOTS) {
      const built = this.surfaces.get(spot.id)!;
      const list = (bySpot.get(spot.id) ?? []).slice(0, spot.maxShown);
      const tg = layoutTokens(built.surface, list, isFaded);
      tg.traverse((o) => { o.userData.spot = spot.id; });
      built.group.add(tg);
      this.tokenGroups.set(spot.id, tg);
    }
    this.requestRender();
  }

  highlight(spotId?: string): void {
    if (this.highlighted === spotId) return;
    const set = (id: string | undefined, on: boolean) => {
      if (!id) return;
      this.spotGroups.get(id)?.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (on) {
          if (!mesh.userData.baseMat) mesh.userData.baseMat = mesh.material;
          const base = mesh.userData.baseMat as THREE.MeshStandardMaterial;
          if (!(base instanceof THREE.MeshStandardMaterial)) return;
          const hl = base.clone();
          hl.emissive = new THREE.Color(0xffd27a);
          hl.emissiveIntensity = Math.max(base.emissiveIntensity ?? 0, 0.18);
          mesh.material = hl;
        } else if (mesh.userData.baseMat) {
          (mesh.material as THREE.Material).dispose();
          mesh.material = mesh.userData.baseMat;
          delete mesh.userData.baseMat;
        }
      });
    };
    set(this.highlighted, false);
    this.highlighted = spotId;
    set(spotId, true);
    this.requestRender();
  }

  /** Lift and enlarge one memory's object so it stands out; undefined clears it. */
  focusMemory(path?: string): void {
    for (const g of this.tokenGroups.values()) {
      g.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh || o.userData.memory === undefined) return;
        const on = path !== undefined && o.userData.memory === path;
        if (o.userData.baseScale === undefined) o.userData.baseScale = o.scale.x;
        const s = o.userData.baseScale * (on ? 1.8 : 1);
        o.scale.set(s, s, s);
      });
    }
    this.requestRender();
  }

  pick(clientX: number, clientY: number): Pick {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const roots = [...this.spotGroups.values()];
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    if (!hit) return {};
    return { spot: hit.object.userData.spot, memory: hit.object.userData.memory };
  }

  flyTo(spot?: SpotDef): void {
    if (!spot) {
      this.goal.target.copy(CENTRE);
      this.goal.zoom = 1;
    } else {
      this.goal.target.set(spot.anchor[0], Math.max(0.6, spot.anchor[1]), spot.anchor[2] + 0.4);
      this.goal.zoom = 2.6;
    }
    this.requestRender();
  }

  orbit(dAz: number, dEl: number): void {
    this.goal.az = THREE.MathUtils.clamp(this.goal.az + dAz, 8, 82);
    this.goal.el = THREE.MathUtils.clamp(this.goal.el + dEl, 15, 65);
    this.requestRender();
  }

  /** Slide the view across the floor, in screen terms: +right moves the view right, +up moves it away. */
  pan(right: number, up: number): void {
    const az = THREE.MathUtils.degToRad(this.goal.az);
    const step = 0.6 / Math.sqrt(this.goal.zoom);
    const t = this.goal.target;
    t.x += (Math.cos(az) * right - Math.sin(az) * up) * step;
    t.z += (-Math.sin(az) * right - Math.cos(az) * up) * step;
    const { x0, z0, x1, z1 } = ROOM.floor;
    t.x = THREE.MathUtils.clamp(t.x, x0, x1);
    t.z = THREE.MathUtils.clamp(t.z, z0, z1);
    this.requestRender();
  }

  zoomBy(f: number): void {
    this.goal.zoom = THREE.MathUtils.clamp(this.goal.zoom * f, 0.6, 3.5);
    this.requestRender();
  }

  resetView(): void {
    this.goal.az = 45;
    this.goal.el = 32;
    this.flyTo(undefined);
  }

  resize(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    this.applyCamera();
    this.requestRender();
  }

  private applyCamera(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const aspect = w / h;
    const view = 11 / this.zoom;
    const halfH = aspect > 1.45 ? view / 2 : (view * 1.45) / aspect / 2;
    const dist = halfH / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.camera.aspect = aspect;
    this.camera.far = dist + 60;
    this.camera.near = Math.max(0.5, dist - 30);
    const az = THREE.MathUtils.degToRad(this.az), el = THREE.MathUtils.degToRad(this.el);
    this.camera.position.set(
      this.target.x + Math.sin(az) * Math.cos(el) * dist,
      this.target.y + Math.sin(el) * dist,
      this.target.z + Math.cos(az) * Math.cos(el) * dist,
    );
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  /** Render one frame now (used by screenshots). */
  renderNow(): void {
    this.az = this.goal.az; this.el = this.goal.el; this.zoom = this.goal.zoom; this.target.copy(this.goal.target);
    this.setClock(new Date());
    this.applyCamera();
    this.composer.render();
  }

  requestRender(): void {
    if (!this.running) this.start();
  }

  /** Whether there is anything to draw into: false when the tab is hidden or the app is in the background. */
  private visible(): boolean {
    return !document.hidden && this.host.clientWidth > 0 && this.host.clientHeight > 0;
  }

  private settled(): boolean {
    return Math.abs(this.goal.az - this.az) < 0.01 && Math.abs(this.goal.el - this.el) < 0.01 &&
      Math.abs(this.goal.zoom - this.zoom) < 0.0005 && this.target.distanceToSquared(this.goal.target) < 1e-6 &&
      (!this.door || this.door.hinge.rotation.y === this.door.goal);
  }

  /**
   * The loop runs only while the room is on screen. A moving camera renders every frame; once it
   * settles, only the plant's sway, the clock and the cat are animated, at 20 frames a second. Hidden, it stops completely
   * and the ResizeObserver or visibilitychange restarts it.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    let lastDraw = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      if (!this.visible()) { this.stop(); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const moving = !this.settled();
      if (moving || now - lastDraw >= 50) {
        const k = 1 - Math.exp(-dt * 6);
        this.az += (this.goal.az - this.az) * k;
        this.el += (this.goal.el - this.el) * k;
        this.zoom += (this.goal.zoom - this.zoom) * k;
        this.target.lerp(this.goal.target, k);
        // Ambient life: the plant sways.
        const t = now / 1000;
        for (const f of this.foliage) f.rotation.z = Math.sin(t * 1.3 + f.position.x * 4) * 0.04;
        // The speakers thump while a song plays.
        const beat = this.musicPlaying ? 1 + 0.25 * Math.max(0, Math.sin(t * 13)) : 1;
        for (const sp of this.speakers) sp.scale.set(beat, 1 + (beat - 1) * 3, beat);
        if (this.door) {
          const d = this.door, diff = d.goal - d.hinge.rotation.y;
          d.hinge.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), 2.5 * dt);
        }
        if (this.pet) {
          this.posePet(Math.min(0.1, (now - this.pet.last) / 1000));
          this.pet.last = now;
        }
        const clock = new Date();
        this.setClock(clock);
        for (const f of this.ticks) f(clock);
        if (this.autoLight) this.followClock(clock);
        this.applyCamera();
        this.composer.render();
        this.frames++;
        lastDraw = now;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** Frames drawn since creation; used by tests to prove the loop sleeps when hidden. */
  frames = 0;

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  dispose(): void {
    this.stop();
    this.composer.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    document.removeEventListener("visibilitychange", this.onVisibility);
    // Three.js warns about a second copy when the plugin is re-enabled; clear its marker.
    delete (window as unknown as { __THREE__?: string }).__THREE__;
  }
}
