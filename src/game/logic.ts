import type { Bounds, Bullet, Circle, InputState, Player, Vec, Zombie } from "./types";

export const PLAYER_SPEED = 260; // px per second
export const BULLET_SPEED = 620;
export const PLAYER_RADIUS = 16;
export const ZOMBIE_RADIUS = 16;
export const BULLET_RADIUS = 5;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distance(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** Circle/circle overlap test used for all collisions. */
export function circlesCollide(a: Circle, b: Circle): boolean {
  return distance(a, b) < a.radius + b.radius;
}

/** Normalized movement vector derived from the current input state. */
export function inputToDirection(input: InputState): Vec {
  let x = 0;
  let y = 0;
  if (input.left) x -= 1;
  if (input.right) x += 1;
  if (input.up) y -= 1;
  if (input.down) y += 1;
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/**
 * Move the player based on input, clamped inside the arena bounds.
 * Returns a new player object (pure). Facing is updated only while moving so
 * bullets keep firing in the last direction of travel when standing still.
 */
export function movePlayer(
  player: Player,
  input: InputState,
  dt: number,
  bounds: Bounds,
): Player {
  const dir = inputToDirection(input);
  const x = clamp(
    player.x + dir.x * PLAYER_SPEED * dt,
    player.radius,
    bounds.width - player.radius,
  );
  const y = clamp(
    player.y + dir.y * PLAYER_SPEED * dt,
    player.radius,
    bounds.height - player.radius,
  );
  const facing = dir.x === 0 && dir.y === 0 ? player.facing : dir;
  return { ...player, x, y, facing };
}

/** Create a bullet travelling in the player's current facing direction. */
export function fireBullet(player: Player): Bullet {
  return {
    x: player.x + player.facing.x * player.radius,
    y: player.y + player.facing.y * player.radius,
    radius: BULLET_RADIUS,
    vx: player.facing.x * BULLET_SPEED,
    vy: player.facing.y * BULLET_SPEED,
  };
}

export function stepBullet(bullet: Bullet, dt: number): Bullet {
  return { ...bullet, x: bullet.x + bullet.vx * dt, y: bullet.y + bullet.vy * dt };
}

export function bulletInBounds(bullet: Bullet, bounds: Bounds): boolean {
  return (
    bullet.x >= 0 &&
    bullet.x <= bounds.width &&
    bullet.y >= 0 &&
    bullet.y <= bounds.height
  );
}

/** Move a zombie toward a target point (the player). Returns a new zombie. */
export function stepZombie(zombie: Zombie, target: Vec, dt: number): Zombie {
  const dx = target.x - zombie.x;
  const dy = target.y - zombie.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    ...zombie,
    x: zombie.x + (dx / len) * zombie.speed * dt,
    y: zombie.y + (dy / len) * zombie.speed * dt,
  };
}

/**
 * Pick a spawn position just outside one of the four arena edges.
 * `rng` should return a float in [0, 1); injectable for deterministic tests.
 */
export function spawnPosition(bounds: Bounds, rng: () => number = Math.random): Vec {
  const edge = Math.floor(rng() * 4);
  switch (edge) {
    case 0:
      return { x: rng() * bounds.width, y: -ZOMBIE_RADIUS };
    case 1:
      return { x: bounds.width + ZOMBIE_RADIUS, y: rng() * bounds.height };
    case 2:
      return { x: rng() * bounds.width, y: bounds.height + ZOMBIE_RADIUS };
    default:
      return { x: -ZOMBIE_RADIUS, y: rng() * bounds.height };
  }
}

/** Difficulty scaling: zombie speed grows with the wave number. */
export function zombieSpeedForWave(wave: number): number {
  return 55 + wave * 8;
}
