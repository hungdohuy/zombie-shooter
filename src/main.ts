import "./style.css";
import { Game } from "./game/game";
import type { HudElements } from "./game/game";
import type { ThemeKind } from "./game/theme";
import type { GameMode } from "./game/types";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const canvas = byId<HTMLCanvasElement>("game");
const hud: HudElements = {
  score: byId("score"),
  wave: byId("wave"),
  hp: byId("hp"),
  hpFill: byId("hp-fill"),
  weapon: byId("weapon"),
  ammo: byId("ammo"),
  overlay: byId("overlay"),
  overlayTitle: byId("overlay-title"),
  overlayText: byId("overlay-text"),
};

const game = new Game(canvas, hud);
const startBtn = byId<HTMLButtonElement>("start-btn");
startBtn.addEventListener("click", () => {
  game.start();
  canvas.focus();
});

const muteBtn = byId<HTMLButtonElement>("mute-btn");
muteBtn.addEventListener("click", () => {
  const muted = game.toggleSound();
  muteBtn.textContent = muted ? "SOUND: OFF" : "SOUND: ON";
});

const THEME_KEY = "zombie-theme";
const themeBtn = byId<HTMLButtonElement>("theme-btn");

function applyTheme(kind: ThemeKind): void {
  game.setTheme(kind);
  document.body.classList.toggle("theme-night", kind === "night");
  themeBtn.textContent = kind === "night" ? "NIGHT" : "SUNNY";
}

let themeKind: ThemeKind =
  localStorage.getItem(THEME_KEY) === "night" ? "night" : "sunny";
applyTheme(themeKind);

themeBtn.addEventListener("click", () => {
  themeKind = themeKind === "night" ? "sunny" : "night";
  localStorage.setItem(THEME_KEY, themeKind);
  applyTheme(themeKind);
});

const MODE_KEY = "zombie-mode";
const modeBtn = byId<HTMLButtonElement>("mode-btn");

function applyMode(mode: GameMode): void {
  game.setMode(mode);
  modeBtn.textContent = mode === "story" ? "STORY" : "ENDLESS";
  modeBtn.classList.toggle("chip-active", mode === "story");
}

// "mission" is the pre-story name for the campaign mode; honor old saves.
const storedMode = localStorage.getItem(MODE_KEY);
let mode: GameMode =
  storedMode === "story" || storedMode === "mission" ? "story" : "endless";
applyMode(mode);

modeBtn.addEventListener("click", () => {
  mode = mode === "story" ? "endless" : "story";
  localStorage.setItem(MODE_KEY, mode);
  applyMode(mode);
});

// Story chapters change the scenery (meadow by day, graveyard by night);
// keep the page chrome and the theme chip in sync when that happens.
game.onThemeChange = (kind) => {
  themeKind = kind;
  document.body.classList.toggle("theme-night", kind === "night");
  themeBtn.textContent = kind === "night" ? "NIGHT" : "SUNNY";
};

const AUTOFIRE_KEY = "zombie-autofire";
const autoFireBtn = byId<HTMLButtonElement>("autofire-btn");

function applyAutoFire(on: boolean): void {
  game.setAutoFire(on);
  autoFireBtn.textContent = on ? "AUTO: ON" : "AUTO: OFF";
  autoFireBtn.classList.toggle("chip-active", on);
}

let autoFire = localStorage.getItem(AUTOFIRE_KEY) === "on";
applyAutoFire(autoFire);

autoFireBtn.addEventListener("click", () => {
  autoFire = !autoFire;
  localStorage.setItem(AUTOFIRE_KEY, autoFire ? "on" : "off");
  applyAutoFire(autoFire);
});
