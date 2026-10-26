// The room's pet: where it walks and what it is doing. Pure, so the wandering can be tested
// without a scene; scene.ts poses the cat model from `PetPose`.

export interface Point {
  x: number;
  z: number;
}

/** Open floor the cat roams: the middle of the room around the rug, clear of furniture. */
export const ROAM = { x0: -3.8, x1: 2.6, z0: -2.9, z1: 0.6 };
/** The food dish, in the front corner by the doorway wall. The cat eats facing it from just in front. */
export const DISH: Point = { x: -5.55, z: 1.1 };
export const EAT_AT: Point = { x: -5.1, z: 0.8 };
/** On the way to the dish the cat passes through here. */
const TO_DISH: Point = { x: -3.9, z: 0.1 };

export type PetState = "walk" | "sit" | "eat" | "turn" | "wave";

export interface PetPose {
  x: number;
  z: number;
  /** Facing, radians about +y; 0 faces +z (towards the open front of the room). */
  heading: number;
  state: PetState;
  /** Seconds spent in the current state, for animation phase. */
  t: number;
}

const SPEED = 0.55;
const TURN = 4;

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class PetBrain {
  pose: PetPose = { x: 0.5, z: -0.6, heading: 0.4, state: "sit", t: 0 };
  private route: Point[] = [];
  private eatNext = false;
  private stateFor = 2;
  private walksSinceMeal = 0;
  /** While greeting: the headings to turn to, and what to go back to afterwards. */
  private greeting?: {
    phase: "face" | "wave" | "back"; face: number; back?: number; waveFor: number;
    resume: { state: PetState; t: number; stateFor: number };
  };

  constructor(private rand: () => number = Math.random) {}

  get greetingNow(): boolean {
    return !!this.greeting;
  }

  /**
   * Clicked: stop, turn to face `face` (the viewer), wave for `seconds`, then carry on with what
   * she was doing. Walking resumes the same route; sitting or eating turns back first.
   */
  greet(face: number, seconds: number): void {
    if (this.greeting) return;
    const p = this.pose;
    this.greeting = {
      phase: "face", face, waveFor: seconds,
      back: p.state === "walk" ? undefined : p.heading,
      resume: { state: p.state, t: p.t, stateFor: this.stateFor },
    };
    this.set("turn", Infinity);
  }

  private set(state: PetState, seconds: number): void {
    this.pose.state = state;
    this.pose.t = 0;
    this.stateFor = seconds;
  }

  private pickTarget(): void {
    // Hungry every few walks: head for the dish.
    this.walksSinceMeal++;
    if (this.walksSinceMeal >= 3 + Math.floor(this.rand() * 3)) {
      this.walksSinceMeal = 0;
      this.eatNext = true;
      this.route = [{ ...TO_DISH }, { ...EAT_AT }];
    } else {
      this.eatNext = false;
      // Leaving the dish, step back into the open first.
      const start = Math.hypot(this.pose.x - EAT_AT.x, this.pose.z - EAT_AT.z) < 0.5 ? [{ ...TO_DISH }] : [];
      this.route = [...start, {
        x: ROAM.x0 + this.rand() * (ROAM.x1 - ROAM.x0),
        z: ROAM.z0 + this.rand() * (ROAM.z1 - ROAM.z0),
      }];
    }
    this.set("walk", Infinity);
  }

  private turnTo(goal: number, dt: number): boolean {
    const p = this.pose;
    const diff = wrap(goal - p.heading);
    p.heading = wrap(p.heading + Math.sign(diff) * Math.min(Math.abs(diff), TURN * dt));
    return Math.abs(wrap(goal - p.heading)) < 0.02;
  }

  /** Turn to the viewer, wave, turn back if needed, then pick up where she left off. */
  private updateGreeting(dt: number): PetPose {
    const p = this.pose, g = this.greeting!;
    if (g.phase === "face") {
      if (this.turnTo(g.face, dt)) { g.phase = "wave"; this.set("wave", g.waveFor); }
    } else if (g.phase === "wave") {
      if (p.t >= this.stateFor) {
        if (g.back === undefined) this.finishGreeting();
        else { g.phase = "back"; this.set("turn", Infinity); }
      }
    } else if (this.turnTo(g.back!, dt)) {
      this.finishGreeting();
    }
    return p;
  }

  private finishGreeting(): void {
    const r = this.greeting!.resume;
    this.greeting = undefined;
    this.pose.state = r.state;
    this.pose.t = r.t;
    this.stateFor = r.stateFor;
  }

  update(dt: number): PetPose {
    const p = this.pose;
    p.t += dt;
    if (this.greeting) return this.updateGreeting(dt);
    const target = this.route[0];
    if (p.state === "walk" && target) {
      const dx = target.x - p.x, dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      const diff = wrap(want - p.heading);
      p.heading = wrap(p.heading + Math.sign(diff) * Math.min(Math.abs(diff), TURN * dt));
      // Turn mostly on the spot, then walk.
      const step = Math.abs(diff) < 0.6 ? Math.min(dist, SPEED * dt) : 0;
      p.x += Math.sin(p.heading) * step;
      p.z += Math.cos(p.heading) * step;
      if (dist < 0.03) {
        this.route.shift();
        if (this.route.length) return p;
        if (this.eatNext) {
          p.heading = Math.atan2(DISH.x - p.x, DISH.z - p.z);
          this.set("eat", 5 + this.rand() * 3);
        } else {
          this.set("sit", 2 + this.rand() * 5);
        }
      }
      return p;
    }
    if (p.t >= this.stateFor) this.pickTarget();
    return p;
  }
}

export type ClipRole = "walk" | "idle" | "wave";

const CLIP_NAMES: Record<ClipRole, RegExp> = {
  wave: /wave|waving|hello|greet/i,
  walk: /walk/i,
  idle: /idle|stand|breath/i,
};

/** Which of a model's animation clips to use for walking, idling and waving, by name. */
export function pickClips(names: string[]): Partial<Record<ClipRole, string>> {
  const out: Partial<Record<ClipRole, string>> = {};
  for (const role of Object.keys(CLIP_NAMES) as ClipRole[]) {
    const hit = names.find((n) => CLIP_NAMES[role].test(n));
    if (hit) out[role] = hit;
  }
  return out;
}
