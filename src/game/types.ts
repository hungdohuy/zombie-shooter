export interface Vec {
  x: number;
  y: number;
}

export interface Circle extends Vec {
  radius: number;
}

export interface Player extends Circle {
  hp: number;
  /** Horizontal velocity, used only for the leaning/run animation. */
  vx: number;
}

export type ZombieKind = "walker" | "runner" | "brute";

export interface Zombie extends Circle {
  kind: ZombieKind;
  speed: number;
  hp: number;
  maxHp: number;
  /** Random animation phase offset so the horde doesn't move in lockstep. */
  phase: number;
}

export interface Bullet extends Circle {
  vx: number;
  vy: number;
}

export interface Bounds {
  width: number;
  height: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  shoot: boolean;
}

export function createInputState(): InputState {
  return { up: false, down: false, left: false, right: false, shoot: false };
}
