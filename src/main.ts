import "./style.css";
import { Game } from "./game/game";
import type { HudElements } from "./game/game";

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
