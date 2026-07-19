import type { WeaponKind, ZombieKind } from "./types";

export type ThemeKind = "sunny" | "night";

export interface BulletStyle {
  /** Bullet head color. */
  core: string;
  /** Tracer color as "r, g, b" for alpha gradients. */
  trail: string;
  /** Contrasting ring around the head so bullets pop on any background. */
  outline: string;
  label: string;
  crate: string;
}

export interface Theme {
  name: ThemeKind;
  /** Vertical sky gradient stops. */
  sky: [number, string][];
  celestial: "sun" | "moon";
  clouds: boolean;
  stars: boolean;
  /** Optional warning band color at the spawn edge ("r, g, b" or null). */
  topHaze: string | null;
  grassDots: string;
  zoneFill: string;
  zoneLine: string;
  deco: "meadow" | "graveyard";
  shadow: string;
  zombies: Record<
    ZombieKind,
    { body: string; head: string; belly: string; outline: string }
  >;
  eyeWhite: string;
  pupil: string;
  player: {
    gun: string;
    gunTip: string;
    arm: string;
    shirt: string;
    shirtOutline: string;
    star: string;
    skin: string;
    cap: string;
    capOutline: string;
    button: string;
    flashCore: string;
    flashRay: string;
  };
  bullets: Record<WeaponKind, BulletStyle>;
  crateFill: string;
  confetti: string[];
  floaterFill: string;
  floaterStroke: string;
  waveStops: string[];
  waveOutline: string;
  zombieHpBack: string;
  zombieHpFill: string;
  /** Damage flash color as "r, g, b". */
  damageFlash: string;
  /** Edge vignette strength (0 disables it). */
  vignette: number;
}

export const THEMES: Record<ThemeKind, Theme> = {
  sunny: {
    name: "sunny",
    sky: [
      [0, "#7ec8f7"],
      [0.16, "#b3e5fc"],
      [0.28, "#a5e88a"],
      [1, "#7fd66a"],
    ],
    celestial: "sun",
    clouds: true,
    stars: false,
    topHaze: null,
    grassDots: "rgba(255, 255, 255, 0.12)",
    zoneFill: "rgba(255, 255, 255, 0.12)",
    zoneLine: "rgba(255, 255, 255, 0.85)",
    deco: "meadow",
    shadow: "rgba(0, 90, 30, 0.18)",
    zombies: {
      walker: { body: "#6fd44b", head: "#8ce464", belly: "#c4f7a1", outline: "#2f9e44" },
      runner: { body: "#ffa94d", head: "#ffc078", belly: "#ffe8cc", outline: "#e8590c" },
      brute: { body: "#b17ae0", head: "#c79bf2", belly: "#eddcfb", outline: "#7c3aad" },
    },
    eyeWhite: "#ffffff",
    pupil: "#20303c",
    player: {
      gun: "#ff6bd6",
      gunTip: "#ffd93d",
      arm: "#ffc9a3",
      shirt: "#4aa8ff",
      shirtOutline: "#1971c2",
      star: "#ffd93d",
      skin: "#ffc9a3",
      cap: "#ff6b6b",
      capOutline: "#e03131",
      button: "#ffd93d",
      flashCore: "#fffbe6",
      flashRay: "#fff3b0",
    },
    // Deep, saturated cores with dark outlines so shots read clearly
    // against the bright sky and grass.
    bullets: {
      pistol: { core: "#ffb703", trail: "255, 140, 0", outline: "#8a4b00", label: "P", crate: "#ffb703" },
      shotgun: { core: "#ff5e2b", trail: "255, 80, 30", outline: "#7a2508", label: "S", crate: "#ff7d47" },
      smg: { core: "#2d9cdb", trail: "20, 120, 220", outline: "#0b4a7a", label: "M", crate: "#37b3f5" },
      rifle: { core: "#e64980", trail: "230, 60, 140", outline: "#7a1240", label: "R", crate: "#f06595" },
    },
    crateFill: "#ffffff",
    confetti: ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#ff6bd6", "#ffa94d"],
    floaterFill: "#ff5da2",
    floaterStroke: "rgba(255, 255, 255, 0.9)",
    waveStops: ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff"],
    waveOutline: "rgba(255, 255, 255, 0.95)",
    zombieHpBack: "rgba(255, 255, 255, 0.7)",
    zombieHpFill: "#ff6b6b",
    damageFlash: "255, 120, 60",
    vignette: 0,
  },
  night: {
    name: "night",
    sky: [
      [0, "#1b1830"],
      [0.28, "#17220e"],
      [1, "#121c0f"],
    ],
    celestial: "moon",
    clouds: false,
    stars: true,
    topHaze: "160, 30, 30",
    grassDots: "rgba(123, 216, 58, 0.05)",
    zoneFill: "rgba(123, 216, 58, 0.05)",
    zoneLine: "rgba(123, 216, 58, 0.35)",
    deco: "graveyard",
    shadow: "rgba(0, 0, 0, 0.4)",
    zombies: {
      walker: { body: "#4e8f2c", head: "#5da832", belly: "#7bc353", outline: "#2c5417" },
      runner: { body: "#a8871f", head: "#c9a53a", belly: "#e0c46a", outline: "#6b5410" },
      brute: { body: "#5f3d8a", head: "#7550a8", belly: "#9b7cc9", outline: "#3a2359" },
    },
    eyeWhite: "#f4f7d9",
    pupil: "#1a1205",
    player: {
      gun: "#9aa7a0",
      gunTip: "#e8f06a",
      arm: "#c9a06a",
      shirt: "#3a5a40",
      shirtOutline: "#2b4530",
      star: "#e8f06a",
      skin: "#c9a06a",
      cap: "#4c6b52",
      capOutline: "#37503c",
      button: "#e8f06a",
      flashCore: "#fff7cf",
      flashRay: "#ffe98a",
    },
    // Bright glowing cores with soft dark rings for the dark field.
    bullets: {
      pistol: { core: "#fff3b0", trail: "255, 214, 61", outline: "rgba(0, 0, 0, 0.55)", label: "P", crate: "#ffd93d" },
      shotgun: { core: "#ffe0b8", trail: "255, 150, 60", outline: "rgba(0, 0, 0, 0.55)", label: "S", crate: "#ff963c" },
      smg: { core: "#d8f8ff", trail: "80, 210, 255", outline: "rgba(0, 0, 0, 0.55)", label: "M", crate: "#50d2ff" },
      rifle: { core: "#ffe0f5", trail: "255, 107, 214", outline: "rgba(0, 0, 0, 0.55)", label: "R", crate: "#ff6bd6" },
    },
    crateFill: "#20281f",
    confetti: ["#8bd334", "#c1ef62", "#ffd93d", "#7bd83a", "#50d2ff", "#f5f36b"],
    floaterFill: "#f5f36b",
    floaterStroke: "rgba(0, 0, 0, 0.6)",
    waveStops: ["#7bd83a", "#b0f06a", "#7bd83a"],
    waveOutline: "rgba(0, 0, 0, 0.6)",
    zombieHpBack: "rgba(0, 0, 0, 0.55)",
    zombieHpFill: "#e5484d",
    damageFlash: "200, 30, 30",
    vignette: 0.3,
  },
};
