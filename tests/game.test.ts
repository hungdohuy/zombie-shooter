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

function fakeCtx(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: () => () => undefined,
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

function fakeCanvas(): HTMLCanvasElement {
  return {
    width: 800,
    height: 600,
    getContext: () => fakeCtx(),
    focus: () => undefined,
  } as unknown as HTMLCanvasElement;
}

function fakeEl() {
  return {
    textContent: "",
    innerHTML: "",
    classList: { add: () => undefined, remove: () => undefined },
  };
}

function fakeHud() {
  const hud = {
    score: fakeEl(),
    wave: fakeEl(),
    hp: fakeEl(),
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
});

describe("Game loop", () => {
  it("player is not instantly killed on a clean single start", () => {
    const hud = fakeHud();
    const game = new Game(fakeCanvas(), hud);
    game.start();
    // ~2.5s of no input: zombies spawn at the edges and must travel inward,
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
    // Deterministic spawns: rng pairs (0.3, 0.5) => right edge, y = 300,
    // so zombies march straight left along the player's firing line.
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() =>
      call++ % 2 === 0 ? 0.3 : 0.5,
    );

    const hud = fakeHud();
    const game = new Game(fakeCanvas(), hud);
    game.start();

    // Face right (one frame of movement), then hold fire.
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight" }));
    frame(16);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));

    for (let i = 0; i < 375; i++) frame(16); // ~6s

    expect(Number(hud.score.textContent)).toBeGreaterThan(0);
    expect(Number(hud.hp.textContent)).toBeGreaterThan(0);
  });
});
