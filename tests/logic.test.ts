import { describe, expect, it } from "vitest";
import {
  BULLET_SPEED,
  bulletInBounds,
  circlesCollide,
  clamp,
  distance,
  fireBullet,
  inputToDirection,
  makeZombie,
  movePlayer,
  movePlayerToward,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  playerZoneTop,
  spawnPosition,
  stepBullet,
  stepZombie,
  ZOMBIE_RADIUS,
  ZOMBIE_STATS,
  zombieKindForWave,
  zombieSpeedForWave,
} from "../src/game/logic";
import { createInputState } from "../src/game/types";
import type { Bounds, Player } from "../src/game/types";

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
    const bullet = { x: 0, y: 0, radius: 5, vx: 100, vy: -50 };
    const next = stepBullet(bullet, 0.5);
    expect(next.x).toBeCloseTo(50);
    expect(next.y).toBeCloseTo(-25);
  });

  it("detects out-of-bounds bullets", () => {
    expect(bulletInBounds({ x: 10, y: 10, radius: 5, vx: 0, vy: 0 }, bounds)).toBe(true);
    expect(bulletInBounds({ x: -1, y: 10, radius: 5, vx: 0, vy: 0 }, bounds)).toBe(false);
    expect(bulletInBounds({ x: 10, y: -100, radius: 5, vx: 0, vy: 0 }, bounds)).toBe(false);
  });
});

describe("zombies", () => {
  it("moves toward the target", () => {
    const zombie = {
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
    const brute = makeZombie(bounds, 3, () => 0);
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
