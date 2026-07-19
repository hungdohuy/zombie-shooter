import {
  bulletInBounds,
  circlesCollide,
  fireBullets,
  itemInBounds,
  makeItemDrop,
  makeZombie,
  movePlayer,
  movePlayerToward,
  PLAYER_RADIUS,
  playerZoneTop,
  stepBullet,
  stepItem,
  stepZombie,
  WEAPONS,
  ZOMBIE_STATS,
} from "./logic";
import { SoundManager } from "./audio";
import { createInputState } from "./types";
import type {
  Bounds,
  Bullet,
  InputState,
  ItemDrop,
  Player,
  Vec,
  WeaponKind,
  Zombie,
} from "./types";

const KEY_MAP: Record<string, keyof InputState> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  Space: "shoot",
};

export interface HudElements {
  score: HTMLElement;
  wave: HTMLElement;
  hp: HTMLElement;
  hpFill: HTMLElement;
  weapon: HTMLElement;
  ammo: HTMLElement;
  overlay: HTMLElement;
  overlayTitle: HTMLElement;
  overlayText: HTMLElement;
}

const SPAWN_INTERVAL_BASE = 1.6;
const ITEM_FIRST_DROP = 7; // seconds until the first weapon crate falls
const ITEM_DROP_INTERVAL = 10; // base seconds between crates (+ jitter)
const HURT_SOUND_COOLDOWN = 0.35; // contact damage is continuous; rate-limit
export const CONTACT_DPS = 20; // baseline; per-kind dps lives in ZOMBIE_STATS
const START_GRACE = 1.2; // seconds before the first zombie spawns

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: "circle" | "square";
  spin: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
}

interface Decoration {
  x: number;
  y: number;
  size: number;
  kind: "flower" | "mushroom" | "bush";
  color: string;
}

/** Cheerful cartoon skins: bright bodies, dark outlines, big googly eyes. */
const ZOMBIE_SKINS: Record<
  Zombie["kind"],
  { body: string; head: string; belly: string; outline: string }
> = {
  walker: { body: "#6fd44b", head: "#8ce464", belly: "#c4f7a1", outline: "#2f9e44" },
  runner: { body: "#ffa94d", head: "#ffc078", belly: "#ffe8cc", outline: "#e8590c" },
  brute: { body: "#b17ae0", head: "#c79bf2", belly: "#eddcfb", outline: "#7c3aad" },
};

const BULLET_STYLES: Record<
  WeaponKind,
  { core: string; trail: string; label: string; crate: string }
> = {
  pistol: { core: "#fff3b0", trail: "255, 214, 61", label: "P", crate: "#ffd93d" },
  shotgun: { core: "#ffe0b8", trail: "255, 150, 60", label: "S", crate: "#ff963c" },
  smg: { core: "#d8f8ff", trail: "80, 210, 255", label: "M", crate: "#50d2ff" },
  rifle: { core: "#ffe0f5", trail: "255, 107, 214", label: "R", crate: "#ff6bd6" },
};

const CONFETTI = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#ff6bd6", "#ffa94d"];
const FLOWER_COLORS = ["#ff6bd6", "#ffd93d", "#ff8787", "#74c0fc", "#e599f7"];

export class Game {
  private ctx: CanvasRenderingContext2D;
  private bounds: Bounds;
  private input: InputState = createInputState();
  private player!: Player;
  private zombies: Zombie[] = [];
  private bullets: Bullet[] = [];
  private items: ItemDrop[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private decorations: Decoration[] = [];
  private sounds = new SoundManager();
  private score = 0;
  private wave = 1;
  private kills = 0;
  private spawnTimer = 0;
  private fireTimer = 0;
  private itemTimer = 0;
  private weapon: WeaponKind = "pistol";
  private ammo = Infinity;
  private zombieSeq = 0;
  private hurtSoundTimer = 0;
  private running = false;
  private lastTime = 0;
  private rafId = 0;
  private loopId = 0;
  private elapsed = 0;
  private muzzleFlash = 0;
  private recoil = 0;
  private damageFlash = 0;
  private shake = 0;
  private waveBanner = 0;
  /** Canvas-space point the player steers toward while a touch is active. */
  private touchTarget: Vec | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private hud: HudElements,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.bounds = { width: canvas.width, height: canvas.height };
    this.makeScenery();
    this.bindInput();
    this.reset();
    this.render();
  }

  private makeScenery(): void {
    // Deterministic pseudo-random layout so the meadow doesn't reshuffle
    // between renders or restarts.
    const { width, height } = this.bounds;
    let seed = 9;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    this.decorations = [];
    const kinds: Decoration["kind"][] = ["flower", "mushroom", "bush", "flower"];
    for (let i = 0; i < 12; i++) {
      this.decorations.push({
        x: 20 + rand() * (width - 40),
        y: height * 0.32 + rand() * (height * 0.62),
        size: 7 + rand() * 6,
        kind: kinds[Math.floor(rand() * kinds.length) % kinds.length],
        color: FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length) % FLOWER_COLORS.length],
      });
    }
  }

  private bindInput(): void {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));

    // Touch / pointer steering: drag anywhere on the canvas to move; the gun
    // auto-fires while a touch is held so the game is one-thumb playable.
    const toCanvasPoint = (e: PointerEvent): Vec => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * this.bounds.width,
        y: ((e.clientY - rect.top) / rect.height) * this.bounds.height,
      };
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.touchTarget = toCanvasPoint(e);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (this.touchTarget) this.touchTarget = toCanvasPoint(e);
    });
    const clear = () => {
      this.touchTarget = null;
    };
    this.canvas.addEventListener("pointerup", clear);
    this.canvas.addEventListener("pointercancel", clear);
    this.canvas.addEventListener("pointerleave", clear);
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
      y: this.bounds.height * 0.85,
      radius: PLAYER_RADIUS,
      hp: 100,
      vx: 0,
    };
    this.zombies = [];
    this.bullets = [];
    this.items = [];
    this.particles = [];
    this.floaters = [];
    this.score = 0;
    this.wave = 1;
    this.kills = 0;
    this.spawnTimer = START_GRACE;
    this.fireTimer = 0;
    this.itemTimer = ITEM_FIRST_DROP;
    this.weapon = "pistol";
    this.ammo = Infinity;
    this.hurtSoundTimer = 0;
    this.elapsed = 0;
    this.muzzleFlash = 0;
    this.recoil = 0;
    this.damageFlash = 0;
    this.shake = 0;
    this.waveBanner = 0;
    this.input = createInputState();
    this.touchTarget = null;
    this.updateHud();
  }

  /** Toggle all game audio; returns the new muted state. */
  toggleSound(): boolean {
    return this.sounds.toggleMuted();
  }

  start(): void {
    // START is a user gesture, which is the only moment browsers allow an
    // AudioContext to be created/resumed.
    this.sounds.unlock();
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
    this.sounds.gameOver();
    this.hud.overlayTitle.textContent = "OUCH! GAME OVER";
    this.hud.overlayText.innerHTML = `You scored <b>${this.score}</b> points! Press START to play again!`;
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
    this.elapsed += dt;
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
    this.recoil = Math.max(0, this.recoil - dt * 60);
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.shake = Math.max(0, this.shake - dt * 18);
    this.waveBanner = Math.max(0, this.waveBanner - dt);
    this.hurtSoundTimer = Math.max(0, this.hurtSoundTimer - dt);

    if (this.touchTarget) {
      this.player = movePlayerToward(this.player, this.touchTarget, dt, this.bounds);
    } else {
      this.player = movePlayer(this.player, this.input, dt, this.bounds);
    }

    this.fireTimer -= dt;
    const wantsFire = this.input.shoot || this.touchTarget !== null;
    if (wantsFire && this.fireTimer <= 0) {
      const spec = WEAPONS[this.weapon];
      this.bullets.push(...fireBullets(this.player, this.weapon));
      this.sounds.shoot(this.weapon);
      this.fireTimer = spec.cooldown;
      this.muzzleFlash = 0.05;
      this.recoil = this.weapon === "shotgun" || this.weapon === "rifle" ? 8 : 5;
      this.spawnShell();
      if (Number.isFinite(this.ammo)) {
        this.ammo -= 1;
        if (this.ammo <= 0) {
          this.weapon = "pistol";
          this.ammo = Infinity;
          this.sounds.emptyClick();
          this.floaters.push({
            x: this.player.x,
            y: this.player.y - 30,
            text: "OUT OF AMMO",
            life: 0.9,
            maxLife: 0.9,
          });
        }
      }
    }

    this.bullets = this.bullets
      .map((b) => stepBullet(b, dt))
      .filter((b) => bulletInBounds(b, this.bounds));

    this.spawnTimer -= dt;
    const spawnInterval = Math.max(0.35, SPAWN_INTERVAL_BASE - this.wave * 0.08);
    if (this.spawnTimer <= 0) {
      this.zombies.push(
        makeZombie(this.bounds, this.wave, Math.random, this.zombieSeq++),
      );
      this.spawnTimer = spawnInterval;
    }

    this.itemTimer -= dt;
    if (this.itemTimer <= 0) {
      this.items.push(makeItemDrop(this.bounds));
      this.itemTimer = ITEM_DROP_INTERVAL + Math.random() * 5;
    }
    this.items = this.items
      .map((it) => stepItem(it, dt))
      .filter((it) => itemInBounds(it, this.bounds));
    this.collectItems();

    this.zombies = this.zombies.map((z) => stepZombie(z, this.player, dt));

    this.resolveCombat();

    for (const z of this.zombies) {
      if (circlesCollide(z, this.player)) {
        this.player.hp -= ZOMBIE_STATS[z.kind].dps * dt;
        this.damageFlash = 0.35;
        this.shake = Math.max(this.shake, 3);
        if (this.hurtSoundTimer <= 0) {
          this.sounds.playerHurt();
          this.hurtSoundTimer = HURT_SOUND_COOLDOWN;
        }
      }
    }

    this.stepEffects(dt);

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.updateHud();
      this.gameOver();
      return;
    }

    this.updateHud();
  }

  private collectItems(): void {
    const remaining: ItemDrop[] = [];
    for (const item of this.items) {
      if (circlesCollide(item, this.player)) {
        this.weapon = item.weapon;
        this.ammo = WEAPONS[item.weapon].ammo;
        this.fireTimer = 0;
        this.sounds.pickup();
        this.floaters.push({
          x: this.player.x,
          y: this.player.y - 30,
          text: WEAPONS[item.weapon].name,
          life: 1,
          maxLife: 1,
        });
      } else {
        remaining.push(item);
      }
    }
    this.items = remaining;
  }

  private resolveCombat(): void {
    const deadZombies = new Set<number>();
    const spentBullets = new Set<number>();
    this.bullets.forEach((bullet, bi) => {
      for (const [zi, zombie] of this.zombies.entries()) {
        if (spentBullets.has(bi)) break;
        if (deadZombies.has(zi)) continue;
        // Piercing rounds stay live after a hit but must not damage the
        // same zombie again on later frames while passing through it.
        if (bullet.hitIds.includes(zombie.id)) continue;
        if (circlesCollide(bullet, zombie)) {
          bullet.hitIds.push(zombie.id);
          zombie.hp -= bullet.damage;
          this.spawnConfetti(bullet.x, bullet.y, 5);
          if (zombie.hp <= 0) {
            deadZombies.add(zi);
            this.onZombieKilled(zombie);
          } else {
            this.sounds.zombieHit();
          }
          if (bullet.hitIds.length > bullet.pierce) spentBullets.add(bi);
        }
      }
    });
    if (deadZombies.size > 0 || spentBullets.size > 0) {
      this.zombies = this.zombies.filter((_, i) => !deadZombies.has(i));
      this.bullets = this.bullets.filter((_, i) => !spentBullets.has(i));
    }
  }

  private onZombieKilled(zombie: Zombie): void {
    const stats = ZOMBIE_STATS[zombie.kind];
    this.score += stats.score;
    this.kills += 1;
    this.spawnConfetti(zombie.x, zombie.y, zombie.kind === "brute" ? 30 : 16);
    this.floaters.push({
      x: zombie.x,
      y: zombie.y - zombie.radius,
      text: `+${stats.score}`,
      life: 0.8,
      maxLife: 0.8,
    });
    if (zombie.kind === "brute") this.shake = Math.max(this.shake, 5);
    this.sounds.zombieDie(zombie.kind);
    const nextWave = Math.floor(this.kills / 10) + 1;
    if (nextWave > this.wave) {
      this.wave = nextWave;
      this.waveBanner = 1.6;
      this.sounds.waveUp();
      this.spawnConfetti(this.bounds.width / 2, this.bounds.height * 0.3, 30);
    }
  }

  /** Cheerful confetti burst (kills, pickups, wave-ups) — no gore. */
  private spawnConfetti(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 180;
      const life = 0.4 + Math.random() * 0.6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life,
        maxLife: life,
        size: 2 + Math.random() * 3.5,
        color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        shape: Math.random() > 0.4 ? "square" : "circle",
        spin: (Math.random() - 0.5) * 14,
      });
    }
  }

  private spawnShell(): void {
    this.particles.push({
      x: this.player.x + 8,
      y: this.player.y - this.player.radius,
      vx: 60 + Math.random() * 60,
      vy: -90 - Math.random() * 40,
      life: 0.5,
      maxLife: 0.5,
      size: 2,
      color: "#ffd93d",
      shape: "circle",
      spin: 0,
    });
  }

  private stepEffects(dt: number): void {
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 320 * dt; // gravity
      return true;
    });
    this.floaters = this.floaters.filter((f) => {
      f.life -= dt;
      f.y -= 34 * dt;
      return f.life > 0;
    });
  }

  private updateHud(): void {
    const hp = Math.ceil(this.player.hp);
    this.hud.score.textContent = String(this.score);
    this.hud.wave.textContent = String(this.wave);
    this.hud.hp.textContent = String(hp);
    this.hud.hpFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    this.hud.hpFill.classList.toggle("low", hp <= 30);
    this.hud.weapon.textContent = WEAPONS[this.weapon].name;
    this.hud.ammo.textContent = Number.isFinite(this.ammo) ? String(this.ammo) : "∞";
  }

  // ------------------------------------------------------------- rendering

  private render(): void {
    const { ctx } = this;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate(
        Math.sin(this.elapsed * 71) * this.shake,
        Math.cos(this.elapsed * 89) * this.shake,
      );
    }

    this.drawBackground();
    this.drawScenery();
    for (const z of this.zombies) this.drawZombie(z);
    this.drawItems();
    this.drawPlayer();
    this.drawBullets();
    this.drawParticles();
    this.drawFloaters();
    ctx.restore();

    this.drawVignette();
    if (this.waveBanner > 0) this.drawWaveBanner();
  }

  private drawBackground(): void {
    const { ctx, bounds } = this;
    const zoneTop = playerZoneTop(bounds);

    // Sunny sky melting into a bright meadow.
    const sky = ctx.createLinearGradient(0, 0, 0, bounds.height);
    sky.addColorStop(0, "#7ec8f7");
    sky.addColorStop(0.16, "#b3e5fc");
    sky.addColorStop(0.28, "#a5e88a");
    sky.addColorStop(1, "#7fd66a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    // Smiling sun with slowly turning rays.
    const sx = bounds.width * 0.82;
    const sy = bounds.height * 0.09;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.elapsed * 0.25);
    ctx.strokeStyle = "rgba(255, 200, 40, 0.75)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
      ctx.lineTo(Math.cos(a) * 38, Math.sin(a) * 38);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.arc(sx, sy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8590c";
    ctx.beginPath();
    ctx.arc(sx - 7, sy - 4, 2.6, 0, Math.PI * 2);
    ctx.arc(sx + 7, sy - 4, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e8590c";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy + 3, 9, 0.25, Math.PI - 0.25);
    ctx.stroke();

    // Fluffy clouds drifting across the sky.
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    const clouds = [
      { y: bounds.height * 0.045, s: 1, speed: 14, off: 0 },
      { y: bounds.height * 0.1, s: 0.7, speed: 22, off: 260 },
      { y: bounds.height * 0.15, s: 0.55, speed: 9, off: 120 },
    ];
    for (const c of clouds) {
      const span = bounds.width + 160;
      const cx = ((this.elapsed * c.speed + c.off) % span) - 80;
      ctx.beginPath();
      ctx.ellipse(cx, c.y, 34 * c.s, 13 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 22 * c.s, c.y + 4 * c.s, 20 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 24 * c.s, c.y + 5 * c.s, 22 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Polka-dot texture on the grass.
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    for (let y = bounds.height * 0.32; y < bounds.height; y += 52) {
      for (let x = 20 + (Math.floor(y / 52) % 2) * 26; x < bounds.width; x += 52) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The player's home zone: brighter grass with a friendly dashed line.
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(0, zoneTop, bounds.width, bounds.height - zoneTop);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.moveTo(0, zoneTop);
    ctx.lineTo(bounds.width, zoneTop);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawScenery(): void {
    const { ctx } = this;
    for (const d of this.decorations) {
      const s = d.size;
      ctx.fillStyle = "rgba(0, 90, 30, 0.12)";
      ctx.beginPath();
      ctx.ellipse(d.x, d.y + s, s, s * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      if (d.kind === "flower") {
        ctx.strokeStyle = "#2f9e44";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y + s);
        ctx.lineTo(d.x, d.y - s * 0.2);
        ctx.stroke();
        ctx.fillStyle = d.color;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + this.elapsed * 0.15;
          ctx.beginPath();
          ctx.arc(
            d.x + Math.cos(a) * s * 0.45,
            d.y - s * 0.2 + Math.sin(a) * s * 0.45,
            s * 0.32,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.fillStyle = "#ffd93d";
        ctx.beginPath();
        ctx.arc(d.x, d.y - s * 0.2, s * 0.26, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === "mushroom") {
        ctx.fillStyle = "#fff4e6";
        ctx.fillRect(d.x - s * 0.22, d.y - s * 0.1, s * 0.44, s * 1.05);
        ctx.fillStyle = "#ff6b6b";
        ctx.beginPath();
        ctx.arc(d.x, d.y - s * 0.05, s * 0.8, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(d.x - s * 0.3, d.y - s * 0.35, s * 0.13, 0, Math.PI * 2);
        ctx.arc(d.x + s * 0.25, d.y - s * 0.5, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#4cae4f";
        ctx.beginPath();
        ctx.arc(d.x - s * 0.5, d.y, s * 0.55, 0, Math.PI * 2);
        ctx.arc(d.x + s * 0.4, d.y - s * 0.1, s * 0.65, 0, Math.PI * 2);
        ctx.arc(d.x, d.y - s * 0.45, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff8787";
        ctx.beginPath();
        ctx.arc(d.x + s * 0.3, d.y - s * 0.4, s * 0.16, 0, Math.PI * 2);
        ctx.arc(d.x - s * 0.4, d.y - s * 0.15, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawZombie(z: Zombie): void {
    const { ctx } = this;
    const skin = ZOMBIE_SKINS[z.kind];
    const angle = Math.atan2(this.player.y - z.y, this.player.x - z.x);
    const wobbleSpeed = z.kind === "runner" ? 14 : z.kind === "brute" ? 5 : 8;
    const wobble = Math.sin(this.elapsed * wobbleSpeed + z.phase) * 0.16;
    const armSwing = Math.sin(this.elapsed * wobbleSpeed + z.phase);

    // Soft ground shadow.
    ctx.fillStyle = "rgba(0, 90, 30, 0.18)";
    ctx.beginPath();
    ctx.ellipse(z.x, z.y + z.radius * 0.75, z.radius * 0.95, z.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(angle + wobble);

    // Outstretched wobbly arms.
    ctx.strokeStyle = skin.body;
    ctx.lineCap = "round";
    ctx.lineWidth = z.radius * 0.42;
    ctx.beginPath();
    ctx.moveTo(z.radius * 0.2, -z.radius * 0.55);
    ctx.lineTo(z.radius * (1.4 + armSwing * 0.18), -z.radius * 0.45);
    ctx.moveTo(z.radius * 0.2, z.radius * 0.55);
    ctx.lineTo(z.radius * (1.4 - armSwing * 0.18), z.radius * 0.45);
    ctx.stroke();
    // Hands.
    ctx.fillStyle = skin.head;
    ctx.beginPath();
    ctx.arc(z.radius * (1.4 + armSwing * 0.18), -z.radius * 0.45, z.radius * 0.24, 0, Math.PI * 2);
    ctx.arc(z.radius * (1.4 - armSwing * 0.18), z.radius * 0.45, z.radius * 0.24, 0, Math.PI * 2);
    ctx.fill();

    // Round cartoon torso with an outline and a lighter belly.
    ctx.fillStyle = skin.body;
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.radius, z.radius * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.belly;
    ctx.beginPath();
    ctx.ellipse(-z.radius * 0.2, 0, z.radius * 0.45, z.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head leaning toward the player.
    ctx.fillStyle = skin.head;
    ctx.strokeStyle = skin.outline;
    ctx.beginPath();
    ctx.arc(z.radius * 0.45, 0, z.radius * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Big googly eyes with wandering pupils.
    const look = Math.sin(this.elapsed * 3 + z.phase) * z.radius * 0.05;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(z.radius * 0.72, -z.radius * 0.26, z.radius * 0.22, 0, Math.PI * 2);
    ctx.arc(z.radius * 0.72, z.radius * 0.26, z.radius * 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#20303c";
    ctx.beginPath();
    ctx.arc(z.radius * 0.82, -z.radius * 0.26 + look, z.radius * 0.1, 0, Math.PI * 2);
    ctx.arc(z.radius * 0.82, z.radius * 0.26 - look, z.radius * 0.085, 0, Math.PI * 2);
    ctx.fill();

    // Goofy open smile.
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(z.radius * 0.92, 0, z.radius * 0.16, -Math.PI * 0.35, Math.PI * 0.35);
    ctx.stroke();

    ctx.restore();

    // HP pips for multi-hit zombies that have taken damage.
    if (z.maxHp > 1 && z.hp < z.maxHp) {
      const barW = z.radius * 2;
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fillRect(z.x - barW / 2, z.y - z.radius - 12, barW, 5);
      ctx.fillStyle = "#ff6b6b";
      ctx.fillRect(z.x - barW / 2, z.y - z.radius - 12, barW * (z.hp / z.maxHp), 5);
    }
  }

  private drawPlayer(): void {
    const { ctx } = this;
    const p = this.player;
    const lean = (p.vx / 300) * 0.2;
    const bob = Math.abs(p.vx) > 1 ? Math.sin(this.elapsed * 16) * 1.5 : 0;
    const recoil = this.recoil;

    // Soft ground shadow.
    ctx.fillStyle = "rgba(0, 90, 30, 0.22)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.radius * 0.8, p.radius, p.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(lean);

    // Bubble blaster pointing up-range, with recoil.
    ctx.strokeStyle = "#ff6bd6";
    ctx.lineCap = "round";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, -p.radius * 0.2 + recoil);
    ctx.lineTo(0, -p.radius - 12 + recoil);
    ctx.stroke();
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.arc(0, -p.radius - 13 + recoil, 5, 0, Math.PI * 2);
    ctx.fill();

    // Sparkly star burst when firing.
    if (this.muzzleFlash > 0) {
      const fy = -p.radius - 18 + recoil;
      ctx.strokeStyle = "#fff3b0";
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI + this.elapsed * 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 3, fy + Math.sin(a) * 3);
        ctx.lineTo(Math.cos(a) * 10, fy + Math.sin(a) * 10);
        ctx.stroke();
      }
      ctx.fillStyle = "#fffbe6";
      ctx.beginPath();
      ctx.arc(0, fy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Arms holding the blaster.
    ctx.strokeStyle = "#ffc9a3";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-p.radius * 0.55, 2);
    ctx.lineTo(-2, -p.radius * 0.5 + recoil * 0.5);
    ctx.moveTo(p.radius * 0.55, 2);
    ctx.lineTo(2, -p.radius * 0.5 + recoil * 0.5);
    ctx.stroke();

    // Bright t-shirt with an outline.
    ctx.fillStyle = "#4aa8ff";
    ctx.strokeStyle = "#1971c2";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 2, p.radius * 0.95, p.radius * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // A star on the back of the shirt.
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? p.radius * 0.34 : p.radius * 0.15;
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const px = Math.cos(a) * r;
      const py = 3 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Head with a red cap (seen from behind — facing the horde).
    ctx.fillStyle = "#ffc9a3";
    ctx.beginPath();
    ctx.arc(0, -p.radius * 0.35, p.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff6b6b";
    ctx.strokeStyle = "#e03131";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -p.radius * 0.42, p.radius * 0.52, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.stroke();
    // Cap button.
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.arc(0, -p.radius * 0.9, p.radius * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawItems(): void {
    const { ctx } = this;
    for (const item of this.items) {
      const style = BULLET_STYLES[item.weapon];
      const bob = Math.sin(this.elapsed * 5 + item.x) * 2;
      const y = item.y + bob;
      const r = item.radius;

      // Beacon glow so drops are easy to spot.
      const glow = ctx.createRadialGradient(item.x, y, 2, item.x, y, r * 2.4);
      glow.addColorStop(0, `rgba(${style.trail}, 0.45)`);
      glow.addColorStop(1, `rgba(${style.trail}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(item.x, y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();

      // Gift box with a ribbon.
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = style.crate;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(item.x - r, y - r, r * 2, r * 2, 5);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = style.crate;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(item.x, y - r);
      ctx.lineTo(item.x, y + r);
      ctx.moveTo(item.x - r, y);
      ctx.lineTo(item.x + r, y);
      ctx.stroke();
      // Bow on top.
      ctx.fillStyle = style.crate;
      ctx.beginPath();
      ctx.arc(item.x - 3.5, y - r - 2, 3.2, 0, Math.PI * 2);
      ctx.arc(item.x + 3.5, y - r - 2, 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Weapon initial.
      ctx.fillStyle = style.crate;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 11px 'Comic Sans MS', 'Segoe UI', system-ui, sans-serif";
      ctx.fillText(style.label, item.x - r / 2, y - r / 2 + 1);
      ctx.textBaseline = "alphabetic";
    }
  }

  private drawBullets(): void {
    const { ctx } = this;
    for (const b of this.bullets) {
      const style = BULLET_STYLES[b.weapon];
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const trailLen = b.weapon === "rifle" ? 34 : 22;
      const tx = b.x - (b.vx / speed) * trailLen;
      const ty = b.y - (b.vy / speed) * trailLen;
      // Tracer trail along the direction of travel.
      const trail = ctx.createLinearGradient(tx, ty, b.x, b.y);
      trail.addColorStop(0, `rgba(${style.trail}, 0)`);
      trail.addColorStop(1, `rgba(${style.trail}, 0.8)`);
      ctx.strokeStyle = trail;
      ctx.lineWidth = b.weapon === "rifle" ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // Glowing head.
      ctx.fillStyle = style.core;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawParticles(): void {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      if (p.shape === "square") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.maxLife - p.life) * p.spin);
        ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(): void {
    const { ctx } = this;
    ctx.textAlign = "center";
    ctx.font = "bold 17px 'Comic Sans MS', 'Segoe UI', system-ui, sans-serif";
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = "#ff5da2";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawVignette(): void {
    const { ctx, bounds } = this;
    // Just a gentle warm flash when the player gets bumped — no dark edges.
    if (this.damageFlash > 0) {
      ctx.fillStyle = `rgba(255, 120, 60, ${this.damageFlash * 0.45})`;
      ctx.fillRect(0, 0, bounds.width, bounds.height);
    }
  }

  private drawWaveBanner(): void {
    const { ctx, bounds } = this;
    const alpha = Math.min(1, this.waveBanner / 0.4);
    const pop = 1 + Math.max(0, this.waveBanner - 1.2) * 1.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(bounds.width / 2, bounds.height * 0.3);
    ctx.scale(pop, pop);
    ctx.textAlign = "center";
    ctx.font = "bold 36px 'Comic Sans MS', 'Segoe UI', system-ui, sans-serif";
    const rainbow = ctx.createLinearGradient(-110, 0, 110, 0);
    rainbow.addColorStop(0, "#ff6b6b");
    rainbow.addColorStop(0.33, "#ffd93d");
    rainbow.addColorStop(0.66, "#6bcb77");
    rainbow.addColorStop(1, "#4d96ff");
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 7;
    ctx.strokeText(`WAVE ${this.wave}!`, 0, 0);
    ctx.fillStyle = rainbow;
    ctx.fillText(`WAVE ${this.wave}!`, 0, 0);
    ctx.restore();
  }
}
