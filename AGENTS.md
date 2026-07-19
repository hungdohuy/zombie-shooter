# zoombie-shooter

A web-based top-down zombie shooter game. Move the player with the **arrow keys** and shoot with **space**. Zombies spawn from the arena edges and chase the player; shoot them to score and survive.

## Tech stack

- Vite + TypeScript (no framework), HTML5 Canvas for rendering
- ESLint (flat config) for linting
- Vitest (jsdom) for unit tests
- Package manager: `pnpm`

## Project layout

- `src/game/logic.ts` — pure, side-effect-free game logic (movement, collisions, spawning). This is what the unit tests cover.
- `src/game/game.ts` — the `Game` class: input handling, the requestAnimationFrame loop, and canvas rendering.
- `src/game/types.ts` — shared types.
- `src/main.ts` — DOM wiring / entry point.
- `tests/logic.test.ts` — unit tests for `logic.ts`.

## Common commands

Standard scripts are defined in `package.json`:

- `pnpm dev` — start the Vite dev server (http://localhost:5173, bound to all interfaces).
- `pnpm build` — type-check (`tsc`) then produce a production build in `dist/`.
- `pnpm lint` — run ESLint.
- `pnpm test` — run the Vitest suite once (`pnpm test:watch` for watch mode).

## Cursor Cloud specific instructions

- Dependencies install with `pnpm install`. `esbuild` (a Vite dependency) requires its postinstall build script, which is enabled via `pnpm.onlyBuiltDependencies` in `package.json`, so no interactive `pnpm approve-builds` step is needed.
- The dev server is configured with `host: true`, so it listens on `0.0.0.0:5173` — reach it at `http://localhost:5173/`.
- Game logic lives in `src/game/logic.ts` as pure functions specifically so it can be unit-tested without a DOM. Prefer adding gameplay rules there (and tests in `tests/logic.test.ts`) rather than burying them in the render loop in `game.ts`.
- The game is a real-time action game, so zombies deal continuous contact damage (`CONTACT_DPS` in `game.ts`) and speed up each wave (`zombieSpeedForWave`). There is a short `START_GRACE` before the first spawn.
- Testing gotcha: driving this game through screenshot-based computer-use is unreliable — the action-then-screenshot latency is too slow for frame-accurate play and inputs often don't land, so the player dies with score 0. For real gameplay evidence, either (a) rely on the deterministic loop tests in `tests/game.test.ts` (they drive the real `Game` loop with a fake clock/rAF), or (b) auto-play the unmodified game by dispatching keyboard events from the browser console (the game listens on `window`), e.g. `window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight'}))` and `{code:'Space'}` on an interval while keeping the player moving.
- Only one animation loop may run at a time: `start()` uses a generation token (`loopId`) so repeated START presses cannot stack loops. If you touch the loop, keep that invariant (regression-tested in `tests/game.test.ts`).
