import { drawOverlay } from "./drawOverlay";
import { ensureFontsReady } from "./theme";
import type { CardStrings, ShareSubject } from "./types";
import { ShareExportError, type CropMode } from "./exportTypes";

/**
 * Putting the overlay onto a picture the climber supplied.
 *
 * Shared by the photo path and the video path, and deliberately free of both:
 * nothing here decodes a file or talks to an encoder, so importing it does not
 * drag in the MP4 muxer. That matters because most climbers photograph a send
 * rather than filming it, and the photo path should not pay for WebCodecs.
 *
 * A video frame and a still are the same problem once decoded — a
 * `CanvasImageSource` of known size, to be cropped, scaled and drawn on.
 */

/** Longest edge of the output. Downscales 4K phone media to something a
 *  social network was going to re-compress to this size anyway. */
export const MAX_OUTPUT_LONG_EDGE = 1920;

/** H.264 wants even dimensions; odd ones are rejected or silently padded.
 *  Harmless for a still, and keeps one sizing rule rather than two. */
const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2);

/** A decoded still, ready to be drawn on. Plain data — no resource to release,
 *  which is what lets it live in React state rather than a ref. */
export interface PosterFrame {
  frame: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * The source rectangle to read, and the output size to write.
 *
 * A `portrait` crop takes a 9:16 window out of the source instead of scaling
 * the whole frame into letterboxing — a climber cropped to Stories wants the
 * wall to fill the screen, not two black bars.
 */
export function planFrame(
  sourceWidth: number,
  sourceHeight: number,
  crop: CropMode,
  cropOffset: number,
): { sx: number; sy: number; sw: number; sh: number; width: number; height: number } {
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (crop === "portrait") {
    const targetRatio = 9 / 16;
    if (sourceWidth / sourceHeight > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx = (sourceWidth - sw) * Math.min(Math.max(cropOffset, 0), 1);
    } else {
      sh = sourceWidth / targetRatio;
      sy = (sourceHeight - sh) * Math.min(Math.max(cropOffset, 0), 1);
    }
  }

  const scale = Math.min(1, MAX_OUTPUT_LONG_EDGE / Math.max(sw, sh));
  return {
    sx,
    sy,
    sw,
    sh,
    width: even(sw * scale),
    height: even(sh * scale),
  };
}

/** Draw the planned region of `frame` to a fresh canvas, overlay included. */
export function composeFrame(
  frame: CanvasImageSource,
  plan: ReturnType<typeof planFrame>,
  subject: ShareSubject,
  strings: CardStrings,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new ShareExportError("encode", "Canvas 2D is unavailable");
  ctx.drawImage(frame, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.width, plan.height);
  drawOverlay(ctx, plan.width, plan.height, subject, strings);
  return canvas;
}

/**
 * `poster` with the overlay, cropped the way the export will crop it.
 *
 * The one function both the preview and the photo export go through, so what
 * the climber sees — including where a 9:16 crop lands — is what they get.
 * Synchronous apart from the fonts, which are resident after the first call.
 */
export async function drawFrame(
  poster: PosterFrame,
  subject: ShareSubject,
  strings: CardStrings,
  crop: CropMode,
  cropOffset: number,
): Promise<HTMLCanvasElement> {
  await ensureFontsReady();
  const plan = planFrame(poster.width, poster.height, crop, cropOffset);
  return composeFrame(poster.frame, plan, subject, strings);
}

/** Downscale a decoded still so a 4K original does not sit in memory at
 *  full size — the preview is a few hundred pixels wide and the export
 *  bounds itself to the same edge anyway. */
export function fitToCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): PosterFrame {
  const scale = Math.min(
    1,
    MAX_OUTPUT_LONG_EDGE / Math.max(sourceWidth, sourceHeight),
  );
  const width = Math.max(2, Math.round(sourceWidth * scale));
  const height = Math.max(2, Math.round(sourceHeight * scale));

  const frame = document.createElement("canvas");
  frame.width = width;
  frame.height = height;
  const ctx = frame.getContext("2d", { alpha: false });
  if (!ctx) throw new ShareExportError("encode", "Canvas 2D is unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  return { frame, width, height };
}
