import { describe, expect, it } from "vitest";
import {
  BULLET_SPEED,
  bulletInBounds,
  circlesCollide,
  clamp,
  distance,
  fireBullet,
  fireBullets,
  inputToDirection,
  ITEM_RADIUS,
  itemInBounds,
  makeItemDrop,
  makeBoss,
  makeZombie,
  movePlayer,
  movePlayerToward,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  playerZoneTop,
  spawnPosition,
  stepBullet,
  stepItem,
  stepZombie,
  WEAPONS,
  ZOMBIE_RADIUS,
  ZOMBIE_STATS,
  zombieKindForWave,
  zombieSpeedForWave,
} from "../src/game/logic";
import {
  HEART_DROP_CHANCE,
  HEART_HEAL,
} from "../src/game/logic";
import { STORY_CHAPTERS } from "../src/game/story";
import { createInputState } from "../src/game/types";
import type { Bounds, Bullet, Player } from "../src/game/types";

const bounds: Bounds = { width: 480, height: 720 };

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    x: 240,
    y: 610,
    radius: PLAYER_RADIUS,
    hp: 100,
    vx: 0,
    ...overrides,
  };
}

describe("clamp", () => {
  it("bounds values within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe("distance & collision", () => {
  it("computes euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("detects overlapping circles", () => {
    const a = { x: 0, y: 0, radius: 10 };
    const b = { x: 5, y: 0, radius: 10 };
    expect(circlesCollide(a, b)).toBe(true);
  });

  it("rejects distant circles", () => {
    const a = { x: 0, y: 0, radius: 10 };
    const b = { x: 100, y: 0, radius: 10 };
    expect(circlesCollide(a, b)).toBe(false);
  });
});

describe("inputToDirection", () => {
  it("returns zero vector with no input", () => {
    expect(inputToDirection(createInputState())).toEqual({ x: 0, y: 0 });
  });

  it("normalizes diagonal movement", () => {
    const dir = inputToDirection({ ...createInputState(), up: true, right: true });
    expect(dir.x).toBeCloseTo(Math.SQRT1_2);
    expect(dir.y).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1);
  });
});

describe("movePlayer", () => {
  it("moves right at player speed", () => {
    const input = { ...createInputState(), right: true };
    const next = movePlayer(makePlayer(), input, 0.1, bounds);
    expect(next.x).toBeCloseTo(240 + PLAYER_SPEED * 0.1);
    expect(next.vx).toBeCloseTo(PLAYER_SPEED);
  });

  it("clamps to arena edges", () => {
    const input = { ...createInputState(), left: true };
    const next = movePlayer(makePlayer({ x: 20 }), input, 1, bounds);
    expect(next.x).toBe(PLAYER_RADIUS);
  });

  it("cannot leave the bottom player zone upward", () => {
    const input = { ...createInputState(), up: true };
    const start = makePlayer({ y: playerZoneTop(bounds) + PLAYER_RADIUS + 5 });
    const next = movePlayer(start, input, 1, bounds);
    expect(next.y).toBe(playerZoneTop(bounds) + PLAYER_RADIUS);
  });

  it("clamps to the bottom edge", () => {
    const input = { ...createInputState(), down: true };
    const next = movePlayer(makePlayer({ y: bounds.height - 20 }), input, 1, bounds);
    expect(next.y).toBe(bounds.height - PLAYER_RADIUS);
  });
});

describe("movePlayerToward (touch steering)", () => {
  it("moves toward the target point", () => {
    const next = movePlayerToward(makePlayer(), { x: 300, y: 610 }, 0.05, bounds);
    expect(next.x).toBeGreaterThan(240);
    expect(next.y).toBeCloseTo(610);
  });

  it("snaps onto a close target without overshooting", () => {
    const next = movePlayerToward(makePlayer(), { x: 242, y: 610 }, 0.5, bounds);
    expect(next.x).toBeCloseTo(242);
    expect(next.vx).toBe(0);
  });

  it("never steers above the player zone", () => {
    const next = movePlayerToward(makePlayer(), { x: 240, y: 0 }, 10, bounds);
    expect(next.y).toBe(playerZoneTop(bounds) + PLAYER_RADIUS);
  });
});

function makeBullet(overrides: Partial<Bullet> = {}): Bullet {
  return {
    x: 0,
    y: 0,
    radius: 5,
    vx: 0,
    vy: 0,
    damage: 1,
    pierce: 0,
    hitIds: [],
    weapon: "pistol",
    ...overrides,
  };
}

describe("bullets", () => {
  it("fires straight up from the player", () => {
    const player = makePlayer();
    const bullet = fireBullet(player);
    expect(bullet.vx).toBe(0);
    expect(bullet.vy).toBeCloseTo(-BULLET_SPEED);
    expect(bullet.x).toBe(player.x);
    expect(bullet.y).toBeLessThan(player.y);
  });

  it("advances by velocity over time", () => {
    const next = stepBullet(makeBullet({ vx: 100, vy: -50 }), 0.5);
    expect(next.x).toBeCloseTo(50);
    expect(next.y).toBeCloseTo(-25);
  });

  it("detects out-of-bounds bullets", () => {
    expect(bulletInBounds(makeBullet({ x: 10, y: 10 }), bounds)).toBe(true);
    expect(bulletInBounds(makeBullet({ x: -1, y: 10 }), bounds)).toBe(false);
    expect(bulletInBounds(makeBullet({ x: 10, y: -100 }), bounds)).toBe(false);
  });
});

describe("weapons", () => {
  it("defines specs for every weapon kind", () => {
    for (const kind of ["pistol", "shotgun", "smg", "rifle"] as const) {
      const spec = WEAPONS[kind];
      expect(spec.cooldown).toBeGreaterThan(0);
      expect(spec.damage).toBeGreaterThan(0);
      expect(spec.pellets).toBeGreaterThanOrEqual(1);
    }
    expect(WEAPONS.pistol.ammo).toBe(Infinity);
    expect(WEAPONS.shotgun.pellets).toBeGreaterThan(1);
    expect(WEAPONS.rifle.pierce).toBeGreaterThan(0);
    // Pickup guns come with a generous clip so they last a while.
    expect(WEAPONS.shotgun.ammo).toBeGreaterThanOrEqual(30);
    expect(WEAPONS.smg.ammo).toBeGreaterThanOrEqual(120);
    expect(WEAPONS.rifle.ammo).toBeGreaterThanOrEqual(30);
  });

  it("shotgun fans pellets symmetrically across the spread cone", () => {
    const pellets = fireBullets(makePlayer(), "shotgun", () => 0.5);
    expect(pellets).toHaveLength(WEAPONS.shotgun.pellets);
    // Middle pellet flies straight up; outer pellets mirror each other.
    const mid = pellets[Math.floor(pellets.length / 2)];
    expect(mid.vx).toBeCloseTo(0);
    expect(mid.vy).toBeCloseTo(-WEAPONS.shotgun.bulletSpeed);
    expect(pellets[0].vx).toBeCloseTo(-pellets[pellets.length - 1].vx);
    // All pellets travel up-range.
    for (const p of pellets) expect(p.vy).toBeLessThan(0);
  });

  it("rifle bullets carry damage and pierce from the spec", () => {
    const [bullet] = fireBullets(makePlayer(), "rifle", () => 0.5);
    expect(bullet.damage).toBe(WEAPONS.rifle.damage);
    expect(bullet.pierce).toBe(WEAPONS.rifle.pierce);
    expect(bullet.hitIds).toEqual([]);
    expect(bullet.vy).toBeCloseTo(-WEAPONS.rifle.bulletSpeed);
  });

  it("smg jitter stays within its spread cone", () => {
    for (const roll of [0, 0.5, 0.999]) {
      const [bullet] = fireBullets(makePlayer(), "smg", () => roll);
      const angle = Math.atan2(bullet.vy, bullet.vx);
      expect(Math.abs(angle + Math.PI / 2)).toBeLessThanOrEqual(
        WEAPONS.smg.spread / 2 + 1e-9,
      );
    }
  });
});

describe("story mode", () => {
  it("defines a 3-chapter campaign ending in a boss fight", () => {
    expect(STORY_CHAPTERS.length).toBe(3);
    for (const ch of STORY_CHAPTERS) {
      expect(ch.title.length).toBeGreaterThan(0);
      expect(ch.story.length).toBeGreaterThan(0);
      expect(["sunny", "night"]).toContain(ch.theme);
    }
    expect(STORY_CHAPTERS[0].boss).toBe(false);
    expect(STORY_CHAPTERS[0].waves).toBeGreaterThan(0);
    expect(STORY_CHAPTERS[STORY_CHAPTERS.length - 1].boss).toBe(true);
  });

  it("builds the Zombie King with boss stats, top-center spawn", () => {
    const boss = makeBoss(bounds, 42);
    expect(boss.id).toBe(42);
    expect(boss.kind).toBe("boss");
    expect(boss.x).toBe(bounds.width / 2);
    expect(boss.y).toBeLessThan(0);
    expect(boss.hp).toBe(ZOMBIE_STATS.boss.hp);
    expect(boss.maxHp).toBe(ZOMBIE_STATS.boss.hp);
    expect(boss.hp).toBeGreaterThan(ZOMBIE_STATS.brute.hp);
    expect(boss.speed).toBeLessThan(zombieSpeedForWave(3));
  });
});

describe("item drops", () => {
  it("spawns above the top edge within the field width", () => {
    for (const roll of [0.3, 0.5, 0.99]) {
      const item = makeItemDrop(bounds, () => roll);
      expect(item.y).toBeLessThan(0);
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x).toBeLessThanOrEqual(bounds.width);
      expect(["shotgun", "smg", "rifle"]).toContain(item.drop);
    }
  });

  it("drops a healing heart on low rolls", () => {
    const item = makeItemDrop(bounds, () => 0.1);
    expect(item.drop).toBe("heart");
    expect(HEART_DROP_CHANCE).toBeGreaterThan(0.1);
    expect(HEART_HEAL).toBeGreaterThan(0);
  });

  it("spreads weapon drops across the roll range", () => {
    expect(makeItemDrop(bounds, () => 0.26).drop).toBe("shotgun");
    expect(makeItemDrop(bounds, () => 0.5).drop).toBe("smg");
    expect(makeItemDrop(bounds, () => 0.99).drop).toBe("rifle");
  });

  it("falls downward over time", () => {
    const item = makeItemDrop(bounds, () => 0.5);
    const next = stepItem(item, 1);
    expect(next.y).toBeCloseTo(item.y + item.vy);
  });

  it("despawns after falling past the bottom edge", () => {
    const item = makeItemDrop(bounds, () => 0.5);
    expect(itemInBounds(item, bounds)).toBe(true);
    expect(
      itemInBounds({ ...item, y: bounds.height + ITEM_RADIUS + 1 }, bounds),
    ).toBe(false);
  });
});

describe("zombies", () => {
  it("moves toward the target", () => {
    const zombie = {
      id: 1,
      x: 0,
      y: 0,
      radius: ZOMBIE_RADIUS,
      speed: 100,
      hp: 1,
      maxHp: 1,
      kind: "walker" as const,
      phase: 0,
    };
    const next = stepZombie(zombie, { x: 100, y: 0 }, 0.5);
    expect(next.x).toBeCloseTo(50);
    expect(next.y).toBeCloseTo(0);
  });

  it("scales speed with wave number", () => {
    expect(zombieSpeedForWave(2)).toBeGreaterThan(zombieSpeedForWave(1));
  });

  it("always spawns above the top edge", () => {
    for (const roll of [0, 0.25, 0.5, 0.99]) {
      const pos = spawnPosition(bounds, () => roll);
      expect(pos.y).toBeLessThan(0);
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(bounds.width);
    }
  });

  it("only spawns walkers on wave 1", () => {
    for (const roll of [0, 0.3, 0.6, 0.99]) {
      expect(zombieKindForWave(1, () => roll)).toBe("walker");
    }
  });

  it("can spawn runners from wave 2 and brutes from wave 3", () => {
    expect(zombieKindForWave(2, () => 0)).toBe("runner");
    expect(zombieKindForWave(3, () => 0)).toBe("brute");
  });

  it("builds zombies with per-kind stats", () => {
    const brute = makeZombie(bounds, 3, () => 0, 7);
    expect(brute.id).toBe(7);
    expect(brute.kind).toBe("brute");
    expect(brute.hp).toBe(ZOMBIE_STATS.brute.hp);
    expect(brute.maxHp).toBe(ZOMBIE_STATS.brute.hp);
    expect(brute.radius).toBe(ZOMBIE_STATS.brute.radius);
    expect(brute.speed).toBeCloseTo(
      zombieSpeedForWave(3) * ZOMBIE_STATS.brute.speedMul,
    );
    expect(brute.y).toBeLessThan(0);
  });
});
