/**
 * Faux-3D object drawing helpers for Canvas 2D.
 * Entities are built from shaded spheres, capsules, and boxes so they read
 * as solid 3D objects under a shared light direction.
 */

/** Shared key-light direction (normalized-ish canvas space: up-left). */
export const LIGHT = { x: -0.45, y: -0.65 };

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse #rgb / #rrggbb (and common named leftovers) into 0–255 channels. */
export function parseColor(input: string): Rgb {
  const c = input.trim();
  if (c.startsWith("#")) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  return { r: 180, g: 180, b: 180 };
}

export function rgbString(c: Rgb, a = 1): string {
  if (a >= 1) return `rgb(${c.r | 0}, ${c.g | 0}, ${c.b | 0})`;
  return `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, ${a})`;
}

/** Mix toward white (t > 0) or black (t < 0). t in [-1, 1]. */
export function shadeRgb(c: Rgb, t: number): Rgb {
  if (t >= 0) {
    return {
      r: c.r + (255 - c.r) * t,
      g: c.g + (255 - c.g) * t,
      b: c.b + (255 - c.b) * t,
    };
  }
  const k = 1 + t;
  return { r: c.r * k, g: c.g * k, b: c.b * k };
}

export function shade(color: string, t: number): string {
  return rgbString(shadeRgb(parseColor(color), t));
}

/** Soft elliptical ground contact shadow under an object. */
export function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Shaded sphere with a specular highlight. Looks like a solid 3D ball.
 * `outline` is optional stroke around the silhouette.
 */
export function drawSphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  outline?: string,
  light = LIGHT,
): void {
  const base = parseColor(color);
  const hx = x + light.x * radius * 0.55;
  const hy = y + light.y * radius * 0.55;
  const grad = ctx.createRadialGradient(hx, hy, radius * 0.08, x, y, radius);
  grad.addColorStop(0, rgbString(shadeRgb(base, 0.55)));
  grad.addColorStop(0.45, rgbString(base));
  grad.addColorStop(1, rgbString(shadeRgb(base, -0.45)));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  // Specular glint.
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.beginPath();
  ctx.ellipse(
    x + light.x * radius * 0.42,
    y + light.y * radius * 0.42,
    radius * 0.28,
    radius * 0.18,
    Math.atan2(light.y, light.x),
    0,
    Math.PI * 2,
  );
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1.5, radius * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Flattened shaded ellipsoid (body / belly volumes). */
export function drawEllipsoid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  outline?: string,
  light = LIGHT,
): void {
  const base = parseColor(color);
  const hx = x + light.x * rx * 0.5;
  const hy = y + light.y * ry * 0.5;
  const grad = ctx.createRadialGradient(hx, hy, Math.min(rx, ry) * 0.1, x, y, Math.max(rx, ry));
  grad.addColorStop(0, rgbString(shadeRgb(base, 0.5)));
  grad.addColorStop(0.5, rgbString(base));
  grad.addColorStop(1, rgbString(shadeRgb(base, -0.4)));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1.5, Math.min(rx, ry) * 0.08);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * Capsule (rounded cylinder) from (x0,y0) to (x1,y1).
 * Used for arms, gun barrels, stems.
 */
export function drawCapsule(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  color: string,
  outline?: string,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const base = parseColor(color);
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  const grad = ctx.createLinearGradient(
    midX + nx * radius,
    midY + ny * radius,
    midX - nx * radius,
    midY - ny * radius,
  );
  grad.addColorStop(0, rgbString(shadeRgb(base, 0.45)));
  grad.addColorStop(0.45, rgbString(base));
  grad.addColorStop(1, rgbString(shadeRgb(base, -0.4)));

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x0 + nx * radius, y0 + ny * radius);
  ctx.lineTo(x1 + nx * radius, y1 + ny * radius);
  ctx.arc(x1, y1, radius, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
  ctx.lineTo(x0 - nx * radius, y0 - ny * radius);
  ctx.arc(x0, y0, radius, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
  ctx.closePath();
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1.2, radius * 0.25);
    ctx.stroke();
  }
}

/**
 * Axis-aligned 3D gift box (isometric-ish orthographic view).
 * `depth` is the visual extrusion along +Y (down the canvas).
 */
export function drawBox3d(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  height: number,
  depth: number,
  color: string,
  accent?: string,
): void {
  const base = parseColor(color);
  const w = width / 2;
  const h = height / 2;
  const d = depth;

  // Face colors: top lit, front mid, right dark.
  const top = rgbString(shadeRgb(base, 0.35));
  const front = rgbString(base);
  const right = rgbString(shadeRgb(base, -0.28));
  const rim = accent ?? rgbString(shadeRgb(base, -0.45));

  // Front face.
  ctx.fillStyle = front;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h + d * 0.15);
  ctx.lineTo(cx + w, cy - h + d * 0.15);
  ctx.lineTo(cx + w, cy + h);
  ctx.lineTo(cx - w, cy + h);
  ctx.closePath();
  ctx.fill();

  // Right face (skewed).
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(cx + w, cy - h + d * 0.15);
  ctx.lineTo(cx + w + d * 0.55, cy - h - d * 0.25);
  ctx.lineTo(cx + w + d * 0.55, cy + h - d * 0.4);
  ctx.lineTo(cx + w, cy + h);
  ctx.closePath();
  ctx.fill();

  // Top face.
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h + d * 0.15);
  ctx.lineTo(cx - w + d * 0.55, cy - h - d * 0.25);
  ctx.lineTo(cx + w + d * 0.55, cy - h - d * 0.25);
  ctx.lineTo(cx + w, cy - h + d * 0.15);
  ctx.closePath();
  ctx.fill();

  // Ribbon cross on front + top.
  if (accent) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, width * 0.12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy - h + d * 0.15);
    ctx.lineTo(cx, cy + h);
    ctx.moveTo(cx - w, cy);
    ctx.lineTo(cx + w, cy);
    ctx.stroke();
    // Top ribbon.
    ctx.beginPath();
    ctx.moveTo(cx - w + d * 0.28, cy - h - d * 0.05);
    ctx.lineTo(cx + w + d * 0.28, cy - h - d * 0.05);
    ctx.stroke();
  }

  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h + d * 0.15);
  ctx.lineTo(cx + w, cy - h + d * 0.15);
  ctx.lineTo(cx + w, cy + h);
  ctx.lineTo(cx - w, cy + h);
  ctx.closePath();
  ctx.stroke();
}

/** Small 3D bow spheres on top of a gift box. */
export function drawBow3d(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  drawSphere(ctx, x - size * 0.85, y, size, color);
  drawSphere(ctx, x + size * 0.85, y, size, color);
  drawSphere(ctx, x, y + size * 0.15, size * 0.7, shade(color, -0.15));
}

/**
 * Soft 3D heart built from two spheres + a pointed lower wedge.
 */
export function drawHeart3d(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  outline: string,
): void {
  const base = parseColor(color);
  drawSphere(ctx, x - r * 0.42, y - r * 0.2, r * 0.55, color, outline);
  drawSphere(ctx, x + r * 0.42, y - r * 0.2, r * 0.55, color, outline);
  // Lower point as a lit triangle with gradient fill.
  const tipY = y + r * 0.95;
  const grad = ctx.createLinearGradient(x, y - r * 0.1, x, tipY);
  grad.addColorStop(0, rgbString(shadeRgb(base, 0.25)));
  grad.addColorStop(1, rgbString(shadeRgb(base, -0.25)));
  ctx.fillStyle = grad;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.85, y + r * 0.05);
  ctx.quadraticCurveTo(x - r * 0.2, y + r * 0.55, x, tipY);
  ctx.quadraticCurveTo(x + r * 0.2, y + r * 0.55, x + r * 0.85, y + r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
