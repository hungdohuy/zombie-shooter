import type {
  Bounds,
  Bullet,
  Circle,
  InputState,
  ItemDrop,
  Player,
  Vec,
  WeaponKind,
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

export interface WeaponSpec {
  name: string;
  /** Seconds between shots. */
  cooldown: number;
  bulletSpeed: number;
  damage: number;
  /** Bullets created per shot (shotgun blast). */
  pellets: number;
  /** Total spread cone in radians across all pellets (or jitter for one). */
  spread: number;
  /** How many additional zombies a bullet can pass through after a hit. */
  pierce: number;
  /** Shots granted when the weapon is picked up; Infinity for the pistol. */
  ammo: number;
  bulletRadius: number;
}

export const WEAPONS: Record<WeaponKind, WeaponSpec> = {
  pistol: {
    name: "PISTOL",
    cooldown: 0.16,
    bulletSpeed: 700,
    damage: 1,
    pellets: 1,
    spread: 0,
    pierce: 0,
    ammo: Infinity,
    bulletRadius: 4,
  },
  shotgun: {
    name: "SHOTGUN",
    cooldown: 0.5,
    bulletSpeed: 620,
    damage: 1,
    pellets: 5,
    spread: 0.42,
    pierce: 0,
    ammo: 14,
    bulletRadius: 3,
  },
  smg: {
    name: "SMG",
    cooldown: 0.07,
    bulletSpeed: 780,
    damage: 1,
    pellets: 1,
    spread: 0.1,
    pierce: 0,
    ammo: 60,
    bulletRadius: 3,
  },
  rifle: {
    name: "RAIL RIFLE",
    cooldown: 0.45,
    bulletSpeed: 980,
    damage: 2,
    pellets: 1,
    spread: 0,
    pierce: 3,
    ammo: 15,
    bulletRadius: 5,
  },
};

/**
 * Create the bullets for one shot of the given weapon, travelling up-range
 * from the player's gun muzzle. Multi-pellet weapons fan their pellets evenly
 * across the spread cone; single-pellet weapons with spread get rng jitter.
 */
export function fireBullets(
  player: Player,
  weapon: WeaponKind,
  rng: () => number = Math.random,
): Bullet[] {
  const spec = WEAPONS[weapon];
  const bullets: Bullet[] = [];
  for (let i = 0; i < spec.pellets; i++) {
    const offset =
      spec.pellets > 1
        ? -spec.spread / 2 + (spec.spread * i) / (spec.pellets - 1)
        : spec.spread > 0
          ? (rng() - 0.5) * spec.spread
          : 0;
    const angle = -Math.PI / 2 + offset;
    bullets.push({
      x: player.x,
      y: player.y - player.radius - 6,
      radius: spec.bulletRadius,
      // Snap zero-offset shots exactly vertical (cos(-π/2) has fp epsilon).
      vx: offset === 0 ? 0 : Math.cos(angle) * spec.bulletSpeed,
      vy: offset === 0 ? -spec.bulletSpeed : Math.sin(angle) * spec.bulletSpeed,
      damage: spec.damage,
      pierce: spec.pierce,
      hitIds: [],
      weapon,
    });
  }
  return bullets;
}

/** Create a default pistol bullet travelling straight up (convenience). */
export function fireBullet(player: Player): Bullet {
  return fireBullets(player, "pistol")[0];
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
  id = 0,
): Zombie {
  const kind = zombieKindForWave(wave, rng);
  const stats = ZOMBIE_STATS[kind];
  const pos = spawnPosition(bounds, rng);
  return {
    ...pos,
    id,
    kind,
    radius: stats.radius,
    speed: zombieSpeedForWave(wave) * stats.speedMul,
    hp: stats.hp,
    maxHp: stats.hp,
    phase: rng() * Math.PI * 2,
  };
}

// ------------------------------------------------------------- item drops

export const ITEM_RADIUS = 13;
export const ITEM_FALL_SPEED = 90;

export const ITEM_WEAPONS: ItemDrop["weapon"][] = ["shotgun", "smg", "rifle"];

/**
 * Create a weapon crate that falls from above the top edge for the player to
 * catch in the bottom zone. `rng` injectable for deterministic tests.
 */
export function makeItemDrop(
  bounds: Bounds,
  rng: () => number = Math.random,
): ItemDrop {
  const margin = ITEM_RADIUS * 3;
  const weapon =
    ITEM_WEAPONS[Math.min(ITEM_WEAPONS.length - 1, Math.floor(rng() * ITEM_WEAPONS.length))];
  return {
    x: margin + rng() * (bounds.width - margin * 2),
    y: -ITEM_RADIUS,
    radius: ITEM_RADIUS,
    weapon,
    vy: ITEM_FALL_SPEED,
  };
}

export function stepItem(item: ItemDrop, dt: number): ItemDrop {
  return { ...item, y: item.y + item.vy * dt };
}

/** Items despawn once they fall past the bottom edge. */
export function itemInBounds(item: ItemDrop, bounds: Bounds): boolean {
  return item.y <= bounds.height + item.radius;
}
