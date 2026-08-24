/**
 * Small canvas helpers the card and the video overlay both need.
 *
 * Nothing here knows about climbing. They exist because a 2D context gives you
 * `fillText` and nothing else: no wrapping, no truncation, no idea how tall the
 * thing it just drew was. Every one of these returns the space it consumed, so
 * a layout can be written as a downward cursor instead of a page of magic
 * y-coordinates.
 */

/** Replace the size in a canvas `font` string, keeping weight and family. */
export function scaleFont(font: string, size: number): string {
  return font.replace(/\b\d+(?:\.\d+)?px\b/, `${Math.round(size)}px`);
}

/** The pixel size in a canvas `font` string. */
export function fontSize(font: string): number {
  return Number(/\b(\d+(?:\.\d+)?)px\b/.exec(font)?.[1] ?? 16);
}

/**
 * `text`, shortened with an ellipsis until it fits `maxWidth`.
 *
 * Used for the two fields a climber types themselves — the gym and the route
 * name. Both are free text with no length limit worth relying on, and a gym
 * called "Ground Up Climbing Centre — Squamish" will otherwise run off the
 * side of the card and out of the image.
 */
export function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${text.slice(0, low).trimEnd()}…`;
}

/**
 * Draw text that must not be shortened, shrinking the type until it fits.
 *
 * For the result line ("3便目で完登", "Sent 2 of 5"), where an ellipsis would
 * destroy the sentence. Returns the font actually used so the caller can space
 * what follows against it.
 */
export function drawShrunkToFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: string,
  minSize = 24,
): number {
  const base = fontSize(font);
  let size = base;
  ctx.font = font;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = scaleFont(font, size);
  }
  ctx.fillText(text, x, y);
  return size;
}

/** A rounded rectangle path. `roundRect` is widely supported now, but Safari
 *  only grew it in 16.4 — the same release that brought WebCodecs, so this
 *  fallback is really for the image-only path on older phones. */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export interface PillStyle {
  font: string;
  fill: string;
  text: string;
  paddingX: number;
  height: number;
  gap: number;
}

/**
 * A wrapped row of tag pills. Returns the total height drawn.
 *
 * Wraps rather than truncating: a route tagged slab + crimp + sloper is three
 * short words, and dropping the third to keep one line would silently change
 * what the card says about the climb.
 */
export function drawPills(
  ctx: CanvasRenderingContext2D,
  labels: string[],
  x: number,
  y: number,
  maxWidth: number,
  style: PillStyle,
): number {
  if (labels.length === 0) return 0;

  ctx.font = style.font;
  ctx.textBaseline = "middle";

  let cursorX = x;
  let cursorY = y;
  let rows = 1;

  for (const label of labels) {
    const width = ctx.measureText(label).width + style.paddingX * 2;
    if (cursorX + width > x + maxWidth && cursorX > x) {
      cursorX = x;
      cursorY += style.height + style.gap;
      rows += 1;
    }
    ctx.fillStyle = style.fill;
    roundRectPath(ctx, cursorX, cursorY, width, style.height, style.height / 2);
    ctx.fill();

    ctx.fillStyle = style.text;
    ctx.fillText(label, cursorX + style.paddingX, cursorY + style.height / 2 + 1);
    cursorX += width + style.gap;
  }

  ctx.textBaseline = "alphabetic";
  return rows * style.height + (rows - 1) * style.gap;
}
