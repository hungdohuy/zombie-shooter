import {
  bulletInBounds,
  circlesCollide,
  fireBullet,
  movePlayer,
  PLAYER_RADIUS,
  spawnPosition,
  stepBullet,
  stepZombie,
  ZOMBIE_RADIUS,
  zombieSpeedForWave,
} from "./logic";
import { createInputState } from "./types";
import type { Bounds, Bullet, InputState, Player, Zombie } from "./types";

const KEY_MAP: Record<string, keyof InputState> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Space: "shoot",
};

export interface HudElements {
  score: HTMLElement;
  wave: HTMLElement;
  hp: HTMLElement;
  overlay: HTMLElement;
  overlayTitle: HTMLElement;
  overlayText: HTMLElement;
}

const FIRE_COOLDOWN = 0.18; // seconds between shots
const SPAWN_INTERVAL_BASE = 1.6;
const CONTACT_DPS = 20; // player HP lost per second while a zombie touches you
const START_GRACE = 1.2; // seconds before the first zombie spawns

export class Game {
  private ctx: CanvasRenderingContext2D;
  private bounds: Bounds;
  private input: InputState = createInputState();
  private player!: Player;
  private zombies: Zombie[] = [];
  private bullets: Bullet[] = [];
  private score = 0;
  private wave = 1;
  private kills = 0;
  private spawnTimer = 0;
  private fireTimer = 0;
  private running = false;
  private lastTime = 0;
  private rafId = 0;
  private loopId = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private hud: HudElements,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.bounds = { width: canvas.width, height: canvas.height };
    this.bindInput();
    this.reset();
    this.render();
  }

  private bindInput(): void {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.input[action] = down;
  }

  private reset(): void {
    this.player = {
      x: this.bounds.width / 2,
      y: this.bounds.height / 2,
      radius: PLAYER_RADIUS,
      hp: 100,
      facing: { x: 0, y: -1 },
    };
    this.zombies = [];
    this.bullets = [];
    this.score = 0;
    this.wave = 1;
    this.kills = 0;
    this.spawnTimer = START_GRACE;
    this.fireTimer = 0;
    this.input = createInputState();
    this.updateHud();
  }

  start(): void {
    // Invalidate any loop already scheduled so a second START press can't
    // stack a second animation loop (which would double spawns and damage).
    cancelAnimationFrame(this.rafId);
    this.loopId += 1;
    this.reset();
    this.hud.overlay.classList.add("hidden");
    this.running = true;
    this.lastTime = performance.now();
    const activeLoop = this.loopId;
    this.rafId = requestAnimationFrame((now) => this.loop(now, activeLoop));
  }

  private gameOver(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.hud.overlayTitle.textContent = "YOU DIED";
    this.hud.overlayText.innerHTML = `Final score: <b>${this.score}</b> — Press START to try again`;
    this.hud.overlay.classList.remove("hidden");
  }

  private loop = (now: number, loopId: number): void => {
    // Stop if the game ended or a newer loop generation has taken over.
    if (!this.running || loopId !== this.loopId) return;
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.update(dt);
    this.render();
    this.rafId = requestAnimationFrame((next) => this.loop(next, loopId));
  };

  private update(dt: number): void {
    this.player = movePlayer(this.player, this.input, dt, this.bounds);

    this.fireTimer -= dt;
    if (this.input.shoot && this.fireTimer <= 0) {
      this.bullets.push(fireBullet(this.player));
      this.fireTimer = FIRE_COOLDOWN;
    }

    this.bullets = this.bullets
      .map((b) => stepBullet(b, dt))
      .filter((b) => bulletInBounds(b, this.bounds));

    this.spawnTimer -= dt;
    const spawnInterval = Math.max(0.35, SPAWN_INTERVAL_BASE - this.wave * 0.08);
    if (this.spawnTimer <= 0) {
      this.spawnZombie();
      this.spawnTimer = spawnInterval;
    }

    this.zombies = this.zombies.map((z) => stepZombie(z, this.player, dt));

    this.resolveCombat();

    for (const z of this.zombies) {
      if (circlesCollide(z, this.player)) {
        this.player.hp -= CONTACT_DPS * dt; // continuous damage while touching
      }
    }
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.updateHud();
      this.gameOver();
      return;
    }

    this.updateHud();
  }

  private spawnZombie(): void {
    const pos = spawnPosition(this.bounds);
    this.zombies.push({
      ...pos,
      radius: ZOMBIE_RADIUS,
      speed: zombieSpeedForWave(this.wave),
      hp: 1,
    });
  }

  private resolveCombat(): void {
    const deadZombies = new Set<number>();
    const spentBullets = new Set<number>();
    this.bullets.forEach((bullet, bi) => {
      this.zombies.forEach((zombie, zi) => {
        if (deadZombies.has(zi) || spentBullets.has(bi)) return;
        if (circlesCollide(bullet, zombie)) {
          deadZombies.add(zi);
          spentBullets.add(bi);
        }
      });
    });
    if (deadZombies.size > 0) {
      this.zombies = this.zombies.filter((_, i) => !deadZombies.has(i));
      this.bullets = this.bullets.filter((_, i) => !spentBullets.has(i));
      this.score += deadZombies.size * 10;
      this.kills += deadZombies.size;
      const nextWave = Math.floor(this.kills / 10) + 1;
      if (nextWave > this.wave) this.wave = nextWave;
    }
  }

  private updateHud(): void {
    this.hud.score.textContent = String(this.score);
    this.hud.wave.textContent = String(this.wave);
    this.hud.hp.textContent = String(Math.ceil(this.player.hp));
  }

  private render(): void {
    const { ctx, bounds } = this;
    ctx.clearRect(0, 0, bounds.width, bounds.height);

    // grid floor
    ctx.strokeStyle = "rgba(123, 216, 58, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= bounds.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, bounds.height);
      ctx.stroke();
    }
    for (let y = 0; y <= bounds.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(bounds.width, y);
      ctx.stroke();
    }

    // zombies
    for (const z of this.zombies) {
      ctx.fillStyle = "#5da832";
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0b0f0a";
      ctx.beginPath();
      ctx.arc(z.x - 5, z.y - 4, 2.5, 0, Math.PI * 2);
      ctx.arc(z.x + 5, z.y - 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // bullets
    ctx.fillStyle = "#f5f36b";
    for (const b of this.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // player
    const p = this.player;
    ctx.fillStyle = "#7bd83a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    // gun barrel showing facing direction
    ctx.strokeStyle = "#e6f0e0";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.facing.x * (p.radius + 10), p.y + p.facing.y * (p.radius + 10));
    ctx.stroke();
  }
}
