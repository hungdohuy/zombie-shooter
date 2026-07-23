import { describe, expect, it } from "vitest";
import {
  parseColor,
  rgbString,
  shade,
  shadeRgb,
} from "../src/game/draw3d";

describe("draw3d color helpers", () => {
  it("parses #rrggbb and #rgb", () => {
    expect(parseColor("#ff6b6b")).toEqual({ r: 255, g: 107, b: 107 });
    expect(parseColor("#f00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("parses rgb() / rgba()", () => {
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor("rgba(1, 2, 3, 0.5)")).toEqual({ r: 1, g: 2, b: 3 });
  });

  it("lightens and darkens colors", () => {
    const base = { r: 100, g: 100, b: 100 };
    const lit = shadeRgb(base, 0.5);
    expect(lit.r).toBeGreaterThan(100);
    expect(lit.r).toBeLessThanOrEqual(255);
    const dim = shadeRgb(base, -0.5);
    expect(dim.r).toBeLessThan(100);
    expect(dim.r).toBeGreaterThanOrEqual(0);
  });

  it("formats rgb strings and shade() returns a usable css color", () => {
    expect(rgbString({ r: 10.2, g: 20.8, b: 30 })).toBe("rgb(10, 20, 30)");
    expect(rgbString({ r: 10, g: 20, b: 30 }, 0.5)).toBe("rgba(10, 20, 30, 0.5)");
    expect(shade("#4488cc", 0.2)).toMatch(/^rgb\(/);
    expect(shade("#4488cc", -0.3)).toMatch(/^rgb\(/);
  });
});
