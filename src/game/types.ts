export interface Vec {
  x: number;
  y: number;
}

export interface Circle extends Vec {
  radius: number;
}

export interface Player extends Circle {
  hp: number;
  facing: Vec;
}

export interface Zombie extends Circle {
  speed: number;
  hp: number;
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
