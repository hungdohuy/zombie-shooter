import type { WeaponKind, ZombieKind } from "./types";

/**
 * All game audio is synthesized with the Web Audio API — no sound files.
 * The AudioContext is created lazily from a user gesture (`unlock()`, called
 * on START) because browsers block audio before the first interaction.
 * Every method is a safe no-op when audio is unavailable (e.g. jsdom tests).
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Create/resume the AudioContext. Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor =
      typeof window !== "undefined"
        ? (window.AudioContext ??
          (window as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext)
        : undefined;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** One oscillator with a pitch sweep and exponential decay envelope. */
  private tone(opts: {
    type?: OscillatorType;
    from: number;
    to?: number;
    dur: number;
    vol?: number;
    delay?: number;
  }): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = opts.type ?? "square";
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur);
    }
    gain.gain.setValueAtTime(opts.vol ?? 0.3, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + opts.dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  /** Filtered white-noise burst (shots, splats, explosions). */
  private noise(opts: {
    dur: number;
    vol?: number;
    filter?: number;
    delay?: number;
  }): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * opts.dur));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = opts.filter ?? 2000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(opts.vol ?? 0.25, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + opts.dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  shoot(weapon: WeaponKind): void {
    switch (weapon) {
      case "pistol":
        this.tone({ from: 720, to: 160, dur: 0.09, vol: 0.22 });
        this.noise({ dur: 0.05, vol: 0.1, filter: 3200 });
        break;
      case "smg":
        this.tone({ from: 950, to: 300, dur: 0.05, vol: 0.14 });
        this.noise({ dur: 0.03, vol: 0.08, filter: 4200 });
        break;
      case "shotgun":
        this.noise({ dur: 0.28, vol: 0.4, filter: 1300 });
        this.tone({ type: "sine", from: 130, to: 45, dur: 0.22, vol: 0.35 });
        break;
      case "rifle":
        this.tone({ type: "sawtooth", from: 1500, to: 120, dur: 0.16, vol: 0.22 });
        this.noise({ dur: 0.1, vol: 0.14, filter: 5000 });
        break;
    }
  }

  emptyClick(): void {
    this.tone({ from: 1400, to: 900, dur: 0.03, vol: 0.08 });
  }

  zombieHit(): void {
    this.tone({ type: "triangle", from: 320, to: 140, dur: 0.06, vol: 0.16 });
  }

  zombieDie(kind: ZombieKind): void {
    if (kind === "brute") {
      this.tone({ type: "triangle", from: 160, to: 35, dur: 0.4, vol: 0.35 });
      this.noise({ dur: 0.32, vol: 0.3, filter: 700 });
    } else {
      this.tone({ type: "triangle", from: 260, to: 60, dur: 0.22, vol: 0.22 });
      this.noise({ dur: 0.12, vol: 0.12, filter: 1100 });
    }
  }

  pickup(): void {
    this.tone({ type: "sine", from: 620, dur: 0.09, vol: 0.22 });
    this.tone({ type: "sine", from: 930, dur: 0.12, vol: 0.22, delay: 0.08 });
  }

  playerHurt(): void {
    this.tone({ type: "sawtooth", from: 210, to: 70, dur: 0.18, vol: 0.24 });
    this.noise({ dur: 0.1, vol: 0.1, filter: 900 });
  }

  waveUp(): void {
    this.tone({ type: "sine", from: 440, dur: 0.12, vol: 0.2 });
    this.tone({ type: "sine", from: 554, dur: 0.12, vol: 0.2, delay: 0.1 });
    this.tone({ type: "sine", from: 659, dur: 0.2, vol: 0.22, delay: 0.2 });
  }

  /** A playful "wah-wah-waaah" instead of a scary crash. */
  gameOver(): void {
    this.tone({ type: "triangle", from: 392, to: 370, dur: 0.25, vol: 0.22 });
    this.tone({ type: "triangle", from: 349, to: 330, dur: 0.25, vol: 0.22, delay: 0.28 });
    this.tone({ type: "triangle", from: 311, to: 220, dur: 0.7, vol: 0.24, delay: 0.56 });
  }
}
