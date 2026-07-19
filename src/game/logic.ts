import type {
  Bounds,
  Bullet,
  Circle,
  InputState,
  Player,
  Vec,
  Zombie,
  ZombieKind,
} from "./types";

export const PLAYER_SPEED = 300; // px per second
export const BULLET_SPEED = 700;
export const PLAYER_RADIUS = 16;
export const ZOMBIE_RADIUS = 16;
export const BULLET_RADIUS = 4;

/**
 * The player is confined to the bottom strip of the arena so zombies always
 * approach from the top of the screen. This is the fraction of the arena
 * height where the player zone begins.
 */
export const PLAYER_ZONE = 0.55;

/** Per-kind zombie stats. Speed is a multiplier over the wave base speed. */
export const ZOMBIE_STATS: Record<
  ZombieKind,
  { radius: number; speedMul: number; hp: number; score: number; dps: number }
> = {
  walker: { radius: 16, speedMul: 1, hp: 1, score: 10, dps: 20 },
  runner: { radius: 12, speedMul: 1.9, hp: 1, score: 15, dps: 15 },
  brute: { radius: 26, speedMul: 0.55, hp: 4, score: 40, dps: 35 },
};

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

/** The y coordinate where the player's movement zone begins. */
export function playerZoneTop(bounds: Bounds): number {
  return bounds.height * PLAYER_ZONE;
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

/** Clamp a position into the player's bottom movement zone. */
export function clampToPlayerZone(pos: Vec, radius: number, bounds: Bounds): Vec {
  return {
    x: clamp(pos.x, radius, bounds.width - radius),
    y: clamp(pos.y, playerZoneTop(bounds) + radius, bounds.height - radius),
  };
}

/**
 * Move the player based on input, clamped inside the bottom player zone.
 * Returns a new player object (pure).
 */
export function movePlayer(
  player: Player,
  input: InputState,
  dt: number,
  bounds: Bounds,
): Player {
  const dir = inputToDirection(input);
  const pos = clampToPlayerZone(
    {
      x: player.x + dir.x * PLAYER_SPEED * dt,
      y: player.y + dir.y * PLAYER_SPEED * dt,
    },
    player.radius,
    bounds,
  );
  return { ...player, ...pos, vx: dir.x * PLAYER_SPEED };
}

/**
 * Move the player toward an arbitrary target point (touch/pointer steering),
 * clamped inside the bottom player zone. Snaps onto the target when close so
 * the player doesn't jitter around the finger position.
 */
export function movePlayerToward(
  player: Player,
  target: Vec,
  dt: number,
  bounds: Bounds,
): Player {
  const goal = clampToPlayerZone(target, player.radius, bounds);
  const dx = goal.x - player.x;
  const dy = goal.y - player.y;
  const dist = Math.hypot(dx, dy);
  const step = PLAYER_SPEED * 1.35 * dt; // touch steering is a bit faster
  if (dist <= step) {
    return { ...player, x: goal.x, y: goal.y, vx: 0 };
  }
  return {
    ...player,
    x: player.x + (dx / dist) * step,
    y: player.y + (dy / dist) * step,
    vx: (dx / dist) * PLAYER_SPEED,
  };
}

/** Create a bullet travelling straight up from the player's gun muzzle. */
export function fireBullet(player: Player): Bullet {
  return {
    x: player.x,
    y: player.y - player.radius - 6,
    radius: BULLET_RADIUS,
    vx: 0,
    vy: -BULLET_SPEED,
  };
}

export function stepBullet(bullet: Bullet, dt: number): Bullet {
  return { ...bullet, x: bullet.x + bullet.vx * dt, y: bullet.y + bullet.vy * dt };
}

export function bulletInBounds(bullet: Bullet, bounds: Bounds): boolean {
  return (
    bullet.x >= 0 &&
    bullet.x <= bounds.width &&
    bullet.y >= -bullet.radius * 4 &&
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
 * Pick a spawn position just above the top edge of the arena so the horde
 * always shambles down toward the player at the bottom.
 * `rng` should return a float in [0, 1); injectable for deterministic tests.
 */
export function spawnPosition(bounds: Bounds, rng: () => number = Math.random): Vec {
  const margin = ZOMBIE_RADIUS * 2;
  return {
    x: margin + rng() * (bounds.width - margin * 2),
    y: -ZOMBIE_RADIUS * 2,
  };
}

/** Difficulty scaling: zombie base speed grows with the wave number. */
export function zombieSpeedForWave(wave: number): number {
  return 55 + wave * 8;
}

/**
 * Pick which kind of zombie to spawn. Runners appear from wave 2 and brutes
 * from wave 3, with odds that grow slightly as waves progress.
 */
export function zombieKindForWave(
  wave: number,
  rng: () => number = Math.random,
): ZombieKind {
  const roll = rng();
  const bruteChance = wave >= 3 ? Math.min(0.05 + wave * 0.02, 0.22) : 0;
  const runnerChance = wave >= 2 ? Math.min(0.1 + wave * 0.03, 0.3) : 0;
  if (roll < bruteChance) return "brute";
  if (roll < bruteChance + runnerChance) return "runner";
  return "walker";
}

/** Assemble a full zombie entity for the given wave (pure; rng injectable). */
export function makeZombie(
  bounds: Bounds,
  wave: number,
  rng: () => number = Math.random,
): Zombie {
  const kind = zombieKindForWave(wave, rng);
  const stats = ZOMBIE_STATS[kind];
  const pos = spawnPosition(bounds, rng);
  return {
    ...pos,
    kind,
    radius: stats.radius,
    speed: zombieSpeedForWave(wave) * stats.speedMul,
    hp: stats.hp,
    maxHp: stats.hp,
    phase: rng() * Math.PI * 2,
  };
}
