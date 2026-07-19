import "./style.css";
import { Game } from "./game/game";
import type { HudElements } from "./game/game";
import type { ThemeKind } from "./game/theme";

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

const THEME_KEY = "zoombie-theme";
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
