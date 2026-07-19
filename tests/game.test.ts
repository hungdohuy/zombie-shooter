import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game/game";
import type { HudElements } from "../src/game/game";

/**
 * These tests drive the real Game loop with a fully controlled clock and
 * requestAnimationFrame queue so behaviour is deterministic. They act as
 * regression coverage for the "instant death" bug (stacked animation loops)
 * and verify core end-to-end gameplay: surviving, and shooting for score.
 */

let now = 0;
let rafSeq = 1;
let pending: { id: number; cb: (t: number) => void }[] = [];

/** Fire every animation frame callback currently queued exactly once. */
function frame(ms = 16): void {
  now += ms;
  const batch = pending;
  pending = [];
  for (const p of batch) p.cb(now);
}

/**
 * A canvas context stub where every property access / method call returns
 * another stub, so chained canvas APIs (gradients, transforms, paths) all
 * work without a real 2D context.
 */
function fakeCtx(): CanvasRenderingContext2D {
  const stub: unknown = new Proxy(function () {}, {
    get: () => stub,
    set: () => true,
    apply: () => stub,
  });
  return stub as CanvasRenderingContext2D;
}

function fakeCanvas(): HTMLCanvasElement {
  return {
    width: 480,
    height: 720,
    getContext: () => fakeCtx(),
    focus: () => undefined,
    addEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 720 }),
  } as unknown as HTMLCanvasElement;
}

function fakeEl() {
  return {
    textContent: "",
    innerHTML: "",
    style: { width: "" },
    classList: {
      add: () => undefined,
      remove: () => undefined,
      toggle: () => undefined,
    },
  };
}

function fakeHud() {
  const hud = {
    score: fakeEl(),
    wave: fakeEl(),
    hp: fakeEl(),
    hpFill: fakeEl(),
    weapon: fakeEl(),
    ammo: fakeEl(),
    overlay: fakeEl(),
    overlayTitle: fakeEl(),
    overlayText: fakeEl(),
  };
  return hud as unknown as HudElements & typeof hud;
}

beforeEach(() => {
  now = 0;
  rafSeq = 1;
  pending = [];
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    const id = rafSeq++;
    pending.push({ id, cb });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending = pending.filter((p) => p.id !== id);
  });
  vi.stubGlobal("performance", { now: () => now });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Game loop", () => {
  it("player is not instantly killed on a clean single start", () => {
    const hud = fakeHud();
    const game = new Game(fakeCanvas(), hud);
    game.start();
    // ~2.5s of no input: zombies spawn at the top edge and must travel down,
    // so the player should still be alive.
    for (let i = 0; i < 156; i++) frame(16);
    expect(Number(hud.hp.textContent)).toBeGreaterThan(0);
  });

  it("does not stack multiple loops when START is pressed repeatedly", () => {
    const game = new Game(fakeCanvas(), fakeHud());
    game.start();
    game.start();
    game.start();
    game.start();
    game.start();
    // Advance a couple of frames; each live loop reschedules exactly one rAF,
    // so a correct implementation keeps exactly one callback queued.
    frame(16);
    frame(16);
    expect(pending.length).toBe(1);
  });

  it("shooting zombies increases the score without the player dying", () => {
    // Deterministic spawns: rng always 0.5 => zombies spawn at the top edge,
    // horizontally centered — directly up-range of the player, who fires
    // straight up. Wave 1 with roll 0.5 always yields walkers.
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const hud = fakeHud();
    const game = new Game(fakeCanvas(), hud);
    game.start();

    // Hold fire; bullets travel straight up into the descending horde.
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));

    for (let i = 0; i < 375; i++) frame(16); // ~6s

    expect(Number(hud.score.textContent)).toBeGreaterThan(0);
    expect(Number(hud.hp.textContent)).toBeGreaterThan(0);
  });

  it("catching a weapon crate switches the gun and grants finite ammo", () => {
    // rng 0.5 => crates and zombies both spawn horizontally centered, right
    // above the player. The first crate drops at ~7s and falls to the player
    // in ~6.6s more; kind roll 0.5 selects the SMG.
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const hud = fakeHud();
    const game = new Game(fakeCanvas(), hud);
    game.start();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));

    const seenWeapons = new Set<string>();
    const seenAmmo = new Set<string>();
    for (let i = 0; i < 950; i++) {
      frame(16); // ~15s total
      seenWeapons.add(hud.weapon.textContent);
      seenAmmo.add(hud.ammo.textContent);
    }

    expect(seenWeapons.has("SMG")).toBe(true);
    // Ammo was finite while the SMG was held, and the default pistol shows ∞.
    expect([...seenAmmo].some((a) => a !== "∞")).toBe(true);
    expect(seenWeapons.has("PISTOL")).toBe(true);
    expect(Number(hud.hp.textContent)).toBeGreaterThan(0);
  });

  it("auto-fire scores kills without any shoot input", () => {
    // rng 0.5 => zombies spawn centered, directly up-range of the player.
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const hud = fakeHud();
    const game = new Game(fakeCanvas(), hud);
    game.setAutoFire(true);
    game.start();
    // No keyboard or touch input at all — auto-fire does the shooting.
    for (let i = 0; i < 375; i++) frame(16); // ~6s

    expect(Number(hud.score.textContent)).toBeGreaterThan(0);
    expect(Number(hud.hp.textContent)).toBeGreaterThan(0);
  });

  it("switches themes mid-game without breaking the loop", () => {
    const hud = fakeHud();
    const game = new Game(fakeCanvas(), hud);
    game.setTheme("night"); // idle re-render
    game.start();
    for (let i = 0; i < 30; i++) frame(16);
    game.setTheme("sunny"); // live switch
    for (let i = 0; i < 30; i++) frame(16);
    expect(pending.length).toBe(1);
    expect(Number(hud.hp.textContent)).toBeGreaterThan(0);
  });

  it("scales the canvas backing store by devicePixelRatio (capped at 2)", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const canvas = fakeCanvas();
    new Game(canvas, fakeHud());
    expect(canvas.width).toBe(960); // 480 × capped dpr 2
    expect(canvas.height).toBe(1440); // 720 × capped dpr 2
  });
});
