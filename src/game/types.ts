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
  /** Unique id so piercing bullets can remember which zombies they hit. */
  id: number;
  kind: ZombieKind;
  speed: number;
  hp: number;
  maxHp: number;
  /** Random animation phase offset so the horde doesn't move in lockstep. */
  phase: number;
}

export type WeaponKind = "pistol" | "shotgun" | "smg" | "rifle";

export interface Bullet extends Circle {
  vx: number;
  vy: number;
  damage: number;
  /** How many additional zombies this bullet may pass through after a hit. */
  pierce: number;
  /** Ids of zombies already damaged, so piercing rounds never re-hit one. */
  hitIds: number[];
  weapon: WeaponKind;
}

/** A weapon crate falling from the top of the field for the player to catch. */
export interface ItemDrop extends Circle {
  weapon: Exclude<WeaponKind, "pistol">;
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
