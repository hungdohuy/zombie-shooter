# zombie-shooter

A web-based vertical zombie shooter game. Zombies spawn at the **top** of the portrait play field and shamble down toward the player, who defends a movement zone at the **bottom** and fires straight up. Move with the **arrow keys / WASD** and shoot with **space**; on touch devices, drag anywhere on the canvas to move (the gun auto-fires while touching).

## Tech stack

- Vite + TypeScript (no framework), HTML5 Canvas for rendering
- ESLint (flat config) for linting
- Vitest (jsdom) for unit tests
- Package manager: `pnpm`

## Project layout

- `src/game/logic.ts` — pure, side-effect-free game logic (movement, collisions, spawning, weapons, item drops). This is what the unit tests cover.
- `src/game/game.ts` — the `Game` class: input handling, the requestAnimationFrame loop, and canvas rendering.
- `src/game/audio.ts` — `SoundManager`: all sound effects are synthesized with the Web Audio API (no audio asset files). The AudioContext is created lazily in `unlock()` from the START click (browser autoplay policy) and every method no-ops when audio is unavailable (e.g. jsdom).
- `src/game/theme.ts` — the visual theme system: a `Theme` interface plus two palettes, `sunny` (bright kid-friendly meadow) and `night` (dark graveyard). `Game.setTheme()` switches canvas rendering; `main.ts` toggles the matching `body.theme-night` CSS-variable set and persists the choice in `localStorage` (`zombie-theme`). Bullets always render with a contrasting outline ring + halo from the theme's `bullets` styles so they stay visible on any background.
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
- The game is a real-time action game, so zombies deal continuous contact damage (per-kind `dps` in `ZOMBIE_STATS` in `logic.ts`) and speed up each wave (`zombieSpeedForWave`). There is a short `START_GRACE` before the first spawn.
- Layout is portrait (480×720 logical canvas). The `Game` constructor scales the canvas backing store by `devicePixelRatio` (capped at 2) and `ctx.scale`s to keep all game math in logical coordinates, so rendering is crisp on retina laptops and phones. Zombies spawn only above the top edge (`spawnPosition`), and the player is clamped to the bottom strip of the arena (`PLAYER_ZONE` / `clampToPlayerZone` in `logic.ts`). Bullets always fire straight up. There are three zombie kinds (`walker`, `runner`, `brute`) with per-kind radius/speed/hp/score/dps in `ZOMBIE_STATS`.
- Mobile/touch: the canvas listens for pointer events; while a pointer is down the player steers toward it (`movePlayerToward`) and auto-fires. The page uses `touch-action: none` so drags don't scroll.
- Auto-fire: the HUD has an AUTO chip (persisted in `localStorage` as `zombie-autofire`) that calls `Game.setAutoFire()`; when on, the gun fires continuously without holding Space or a touch.
- Game modes: ENDLESS (default survival) or STORY, toggled by a HUD chip (persisted as `zombie-mode`; the legacy stored value `mission` is migrated to story). Story data lives in `src/game/story.ts`: 3 chapters (sunny meadow → spooky night → Zombie King boss), each a cutscene overlay + a round; `Game.beginChapter()` applies the chapter theme (notifying `main.ts` via `game.onThemeChange`), chapter clears pause on a "press START to continue" overlay, story game-overs retry the current chapter, and killing the boss (`makeBoss` in `logic.ts`, big HP bar at the top) triggers the win overlay.
- Loop juice: kills within `COMBO_WINDOW` chain a score multiplier (capped at `COMBO_MAX`); gift boxes can also contain a healing heart (`HEART_DROP_CHANCE`/`HEART_HEAL` in `logic.ts`, `ItemDrop.drop` is a `DropKind`).
- Weapons: the player starts with the infinite-ammo pistol; weapon crates (`makeItemDrop`) fall from the top every ~10–15s and grant a shotgun (5-pellet spread), SMG (fast fire), or rail rifle (piercing, 2 damage) with finite ammo (`WEAPONS` in `logic.ts`). When ammo runs out the game reverts to the pistol. Piercing bullets track `hitIds` (zombie `id`s) so they never damage the same zombie twice.
- Testing gotcha: driving this game through screenshot-based computer-use is unreliable — the action-then-screenshot latency is too slow for frame-accurate play and inputs often don't land, so the player dies with score 0. For real gameplay evidence, either (a) rely on the deterministic loop tests in `tests/game.test.ts` (they drive the real `Game` loop with a fake clock/rAF), or (b) auto-play the unmodified game by dispatching keyboard events from the browser console (the game listens on `window`), e.g. `window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft'}))` and `{code:'Space'}` on an interval while keeping the player moving.
- Only one animation loop may run at a time: `start()` uses a generation token (`loopId`) so repeated START presses cannot stack loops. If you touch the loop, keep that invariant (regression-tested in `tests/game.test.ts`).
