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
}

interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
}

interface Gravestone {
  x: number;
  y: number;
  w: number;
  h: number;
  cross: boolean;
}

const ZOMBIE_SKINS: Record<
  Zombie["kind"],
  { body: string; head: string; eye: string }
> = {
  walker: { body: "#4e8f2c", head: "#5da832", eye: "#ffd23e" },
  runner: { body: "#8fae2f", head: "#a8c93a", eye: "#ff8a3e" },
  brute: { body: "#38641f", head: "#456f27", eye: "#ff4040" },
};

const BULLET_STYLES: Record<
  WeaponKind,
  { core: string; trail: string; label: string; crate: string }
> = {
  pistol: { core: "#fffbe0", trail: "245, 243, 107", label: "P", crate: "#f5f36b" },
  shotgun: { core: "#ffe0b8", trail: "255, 150, 60", label: "S", crate: "#ff963c" },
  smg: { core: "#d8f8ff", trail: "80, 210, 255", label: "M", crate: "#50d2ff" },
  rifle: { core: "#f2e0ff", trail: "190, 110, 255", label: "R", crate: "#be6eff" },
};

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
  private gravestones: Gravestone[] = [];
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
    // Deterministic pseudo-random layout so the graveyard doesn't reshuffle
    // between renders or restarts.
    const { width } = this.bounds;
    const zoneTop = playerZoneTop(this.bounds);
    let seed = 9;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    this.gravestones = [];
    for (let i = 0; i < 7; i++) {
      this.gravestones.push({
        x: 24 + rand() * (width - 60),
        y: 40 + rand() * (zoneTop - 110),
        w: 18 + rand() * 14,
        h: 22 + rand() * 16,
        cross: rand() > 0.5,
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
          this.spawnBlood(bullet.x, bullet.y, 5);
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
    this.spawnBlood(zombie.x, zombie.y, zombie.kind === "brute" ? 26 : 14);
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
    }
  }

  private spawnBlood(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 160;
      const life = 0.3 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life,
        maxLife: life,
        size: 1.5 + Math.random() * 3,
        color: Math.random() > 0.3 ? "#8bd334" : "#c1ef62",
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
      color: "#e0b64c",
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

    // Night sky fading into the killing field.
    const sky = ctx.createLinearGradient(0, 0, 0, bounds.height);
    sky.addColorStop(0, "#1b1830");
    sky.addColorStop(0.45, "#17220e");
    sky.addColorStop(1, "#121c0f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    // Moon with a soft glow.
    const mx = bounds.width * 0.82;
    const my = bounds.height * 0.09;
    const glow = ctx.createRadialGradient(mx, my, 4, mx, my, 70);
    glow.addColorStop(0, "rgba(226, 235, 200, 0.55)");
    glow.addColorStop(1, "rgba(226, 235, 200, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(mx - 70, my - 70, 140, 140);
    ctx.fillStyle = "#e7ecd2";
    ctx.beginPath();
    ctx.arc(mx, my, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(190, 198, 168, 0.6)";
    ctx.beginPath();
    ctx.arc(mx - 6, my - 4, 4, 0, Math.PI * 2);
    ctx.arc(mx + 7, my + 6, 3, 0, Math.PI * 2);
    ctx.fill();

    // Danger haze creeping in from the top edge (spawn zone).
    const haze = ctx.createLinearGradient(0, 0, 0, 90);
    haze.addColorStop(0, "rgba(160, 30, 30, 0.22)");
    haze.addColorStop(1, "rgba(160, 30, 30, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, bounds.width, 90);

    // Subtle grid over the field.
    ctx.strokeStyle = "rgba(123, 216, 58, 0.05)";
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

    // The defence line marking the player zone.
    ctx.fillStyle = "rgba(123, 216, 58, 0.05)";
    ctx.fillRect(0, zoneTop, bounds.width, bounds.height - zoneTop);
    ctx.strokeStyle = "rgba(123, 216, 58, 0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(0, zoneTop);
    ctx.lineTo(bounds.width, zoneTop);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawScenery(): void {
    const { ctx } = this;
    for (const g of this.gravestones) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + g.h, g.w * 0.7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#39463e";
      ctx.beginPath();
      ctx.moveTo(g.x - g.w / 2, g.y + g.h);
      ctx.lineTo(g.x - g.w / 2, g.y + g.w / 2);
      ctx.arc(g.x, g.y + g.w / 2, g.w / 2, Math.PI, 0);
      ctx.lineTo(g.x + g.w / 2, g.y + g.h);
      ctx.closePath();
      ctx.fill();
      if (g.cross) {
        ctx.strokeStyle = "#242e28";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y + g.w / 2 - 2);
        ctx.lineTo(g.x, g.y + g.w / 2 + 8);
        ctx.moveTo(g.x - 4, g.y + g.w / 2 + 2);
        ctx.lineTo(g.x + 4, g.y + g.w / 2 + 2);
        ctx.stroke();
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

    // Ground shadow.
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(z.x, z.y + z.radius * 0.75, z.radius * 0.95, z.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(angle + wobble);

    // Outstretched arms grasping toward the player.
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

    // Torso.
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.radius, z.radius * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    // Torn shirt patch.
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.beginPath();
    ctx.ellipse(-z.radius * 0.25, z.radius * 0.15, z.radius * 0.4, z.radius * 0.3, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Head, offset toward the player.
    ctx.fillStyle = skin.head;
    ctx.beginPath();
    ctx.arc(z.radius * 0.45, 0, z.radius * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Glowing eyes.
    ctx.fillStyle = skin.eye;
    ctx.beginPath();
    ctx.arc(z.radius * 0.8, -z.radius * 0.22, z.radius * 0.12, 0, Math.PI * 2);
    ctx.arc(z.radius * 0.8, z.radius * 0.22, z.radius * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // HP pips for multi-hit zombies that have taken damage.
    if (z.maxHp > 1 && z.hp < z.maxHp) {
      const barW = z.radius * 2;
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(z.x - barW / 2, z.y - z.radius - 12, barW, 5);
      ctx.fillStyle = "#e5484d";
      ctx.fillRect(z.x - barW / 2, z.y - z.radius - 12, barW * (z.hp / z.maxHp), 5);
    }
  }

  private drawPlayer(): void {
    const { ctx } = this;
    const p = this.player;
    const lean = (p.vx / 300) * 0.2;
    const bob = Math.abs(p.vx) > 1 ? Math.sin(this.elapsed * 16) * 1.5 : 0;
    const recoil = this.recoil;

    // Ground shadow.
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.radius * 0.8, p.radius, p.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(lean);

    // Gun barrel pointing up-range (toward the horde), with recoil.
    ctx.strokeStyle = "#9aa7a0";
    ctx.lineCap = "round";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -p.radius * 0.2 + recoil);
    ctx.lineTo(0, -p.radius - 14 + recoil);
    ctx.stroke();
    ctx.strokeStyle = "#5d6a63";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -p.radius - 6 + recoil);
    ctx.lineTo(0, -p.radius - 14 + recoil);
    ctx.stroke();

    // Muzzle flash.
    if (this.muzzleFlash > 0) {
      const fy = -p.radius - 16 + recoil;
      ctx.fillStyle = "#ffe98a";
      ctx.beginPath();
      ctx.moveTo(0, fy - 12);
      ctx.lineTo(4.5, fy);
      ctx.lineTo(-4.5, fy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff7cf";
      ctx.beginPath();
      ctx.arc(0, fy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Arms gripping the gun.
    ctx.strokeStyle = "#c9a06a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-p.radius * 0.55, 2);
    ctx.lineTo(-2, -p.radius * 0.5 + recoil * 0.5);
    ctx.moveTo(p.radius * 0.55, 2);
    ctx.lineTo(2, -p.radius * 0.5 + recoil * 0.5);
    ctx.stroke();

    // Torso (tactical vest).
    ctx.fillStyle = "#3a5a40";
    ctx.beginPath();
    ctx.ellipse(0, 2, p.radius * 0.95, p.radius * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2b4530";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-p.radius * 0.5, -2);
    ctx.lineTo(p.radius * 0.5, -2);
    ctx.stroke();

    // Head with helmet (seen from behind — the player faces the horde).
    ctx.fillStyle = "#c9a06a";
    ctx.beginPath();
    ctx.arc(0, -p.radius * 0.35, p.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4c6b52";
    ctx.beginPath();
    ctx.arc(0, -p.radius * 0.42, p.radius * 0.52, Math.PI * 0.95, Math.PI * 2.05);
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

      // Crate.
      ctx.fillStyle = "#20281f";
      ctx.strokeStyle = style.crate;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(item.x - r, y - r, r * 2, r * 2, 4);
      ctx.fill();
      ctx.stroke();

      // Weapon initial.
      ctx.fillStyle = style.crate;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText(style.label, item.x, y + 1);
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
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(): void {
    const { ctx } = this;
    ctx.textAlign = "center";
    ctx.font = "bold 15px 'Segoe UI', system-ui, sans-serif";
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = "#f5f36b";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawVignette(): void {
    const { ctx, bounds } = this;
    const v = ctx.createRadialGradient(
      bounds.width / 2,
      bounds.height / 2,
      bounds.height * 0.35,
      bounds.width / 2,
      bounds.height / 2,
      bounds.height * 0.75,
    );
    v.addColorStop(0, "rgba(0, 0, 0, 0)");
    v.addColorStop(1, "rgba(0, 0, 0, 0.3)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    if (this.damageFlash > 0) {
      ctx.fillStyle = `rgba(200, 30, 30, ${this.damageFlash * 0.5})`;
      ctx.fillRect(0, 0, bounds.width, bounds.height);
    }
  }

  private drawWaveBanner(): void {
    const { ctx, bounds } = this;
    const alpha = Math.min(1, this.waveBanner / 0.4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.fillStyle = "#7bd83a";
    ctx.font = "bold 34px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(`WAVE ${this.wave}`, bounds.width / 2, bounds.height * 0.3);
    ctx.restore();
  }
}
