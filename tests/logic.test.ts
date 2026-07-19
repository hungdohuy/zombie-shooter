import { describe, expect, it } from "vitest";
import {
  BULLET_SPEED,
  bulletInBounds,
  circlesCollide,
  clamp,
  distance,
  fireBullet,
  inputToDirection,
  movePlayer,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  spawnPosition,
  stepBullet,
  stepZombie,
  ZOMBIE_RADIUS,
  zombieSpeedForWave,
} from "../src/game/logic";
import { createInputState } from "../src/game/types";
import type { Bounds, Player } from "../src/game/types";

const bounds: Bounds = { width: 800, height: 600 };

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    x: 400,
    y: 300,
    radius: PLAYER_RADIUS,
    hp: 100,
    facing: { x: 0, y: -1 },
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
    const next = movePlayer(makePlayer(), input, 1, bounds);
    expect(next.x).toBeCloseTo(400 + PLAYER_SPEED);
    expect(next.facing).toEqual({ x: 1, y: 0 });
  });

  it("clamps to arena edges", () => {
    const input = { ...createInputState(), left: true };
    const next = movePlayer(makePlayer({ x: 20 }), input, 1, bounds);
    expect(next.x).toBe(PLAYER_RADIUS);
  });

  it("keeps last facing when idle", () => {
    const next = movePlayer(makePlayer({ facing: { x: 1, y: 0 } }), createInputState(), 1, bounds);
    expect(next.facing).toEqual({ x: 1, y: 0 });
  });
});

describe("bullets", () => {
  it("fires in the facing direction", () => {
    const bullet = fireBullet(makePlayer({ facing: { x: 1, y: 0 } }));
    expect(bullet.vx).toBeCloseTo(BULLET_SPEED);
    expect(bullet.vy).toBeCloseTo(0);
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
  });
});

describe("zombies", () => {
  it("moves toward the target", () => {
    const zombie = { x: 0, y: 0, radius: ZOMBIE_RADIUS, speed: 100, hp: 1 };
    const next = stepZombie(zombie, { x: 100, y: 0 }, 0.5);
    expect(next.x).toBeCloseTo(50);
    expect(next.y).toBeCloseTo(0);
  });

  it("scales speed with wave number", () => {
    expect(zombieSpeedForWave(2)).toBeGreaterThan(zombieSpeedForWave(1));
  });

  it("spawns on an arena edge", () => {
    // rng stubbed to 0 => top edge, x=0, y=-radius
    const pos = spawnPosition(bounds, () => 0);
    expect(pos).toEqual({ x: 0, y: -ZOMBIE_RADIUS });
  });
});
