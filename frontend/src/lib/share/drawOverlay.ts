import { COLORS, FONT, OVERLAY } from "./theme";
import { drawShrunkToFit, ellipsize, scaleFont } from "./canvasUtils";
import type { CardStrings, ShareSubject } from "./types";

/**
 * The badge burned into the bottom of a climber's own video.
 *
 * Not a shrunken card. A card is something you look at; this has to stay
 * legible while a person moves across a brightly lit wall behind it, and it has
 * to take up as little of the frame as it can get away with — the video is the
 * post, this is the caption.
 *
 * Every measurement is a fraction of the frame's *shorter* edge, because the
 * same routine runs against whatever the phone recorded: 1080×1920 held
 * upright, 1920×1080 turned sideways, or four times either on a recent iPhone.
 * A fixed pixel size would be a banner on one and unreadable on the next.
 *
 * Drawn bottom-left with a gradient scrim underneath. Bottom, because a
 * climber is usually in the upper two thirds of a bouldering frame; left,
 * because Instagram's own UI (the caption, the sound label) crowds the bottom
 * right.
 */

/** What the overlay says, reduced to at most three lines. */
function overlayLines(
  subject: ShareSubject,
  strings: CardStrings,
): { hero: string; result: string; meta: string } {
  switch (subject.template) {
    case "climb":
      return {
        hero: subject.grade,
        result: strings.result,
        meta: [subject.gymName, strings.when].filter(Boolean).join(" · "),
      };
    case "session":
      return {
        hero: subject.highestGrade ?? String(subject.totalSends),
        result: `${subject.totalSends}/${subject.climbCount} ${strings.sent}`,
        meta: [subject.gymName, strings.when].filter(Boolean).join(" · "),
      };
    case "month":
      return {
        hero: subject.highestGrade ?? String(subject.sends),
        result: `${subject.sends} ${strings.sent} · ${subject.climbingDays} ${strings.days}`,
        meta: strings.when,
      };
  }
}

/**
 * Paint the overlay onto a frame that has already been drawn to `ctx`.
 *
 * Called once per frame inside the encoding loop. It restores the context
 * state it changes — a leaked `textAlign` here would show up as every
 * subsequent frame drawn wrong, which is an unpleasant thing to debug from a
 * finished video. It does allocate a gradient and a few strings per call;
 * against a hardware encode of the same frame that is noise, and caching them
 * would mean threading a layout object through every caller for no visible
 * gain. Revisit if profiling ever says otherwise.
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  subject: ShareSubject,
  strings: CardStrings,
): void {
  const short = Math.min(width, height);
  const margin = short * OVERLAY.marginScale;
  const gradeSize = short * OVERLAY.gradeScale;
  const lineSize = short * OVERLAY.lineScale;
  const labelSize = short * OVERLAY.labelScale;

  const lines = overlayLines(subject, strings);
  const maxTextWidth = width - margin * 2;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // A scrim rather than a solid plate: the video keeps showing through the top
  // of it, so the badge sits in the shot instead of on a black bar.
  const scrimTop = height - (gradeSize + lineSize * 2 + margin * 2.2);
  const scrim = ctx.createLinearGradient(0, scrimTop, 0, height);
  scrim.addColorStop(0, "rgba(4, 12, 9, 0)");
  scrim.addColorStop(1, `rgba(4, 12, 9, ${OVERLAY.scrimAlpha})`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, scrimTop, width, height - scrimTop);

  let baseline = height - margin;

  // Wordmark on the same line as the metadata, pushed to the right edge.
  ctx.font = scaleFont(FONT.wordmark, labelSize);
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = "right";
  ctx.fillText("ClimbLog AI", width - margin, baseline);
  ctx.textAlign = "left";

  if (lines.meta) {
    ctx.font = scaleFont(FONT.body, labelSize);
    ctx.fillStyle = COLORS.textMuted;
    // Stops short of the wordmark rather than the frame edge.
    ctx.fillText(
      ellipsize(ctx, lines.meta, maxTextWidth * 0.62),
      margin,
      baseline,
    );
  }

  baseline -= lineSize * 1.5;
  ctx.fillStyle = COLORS.text;
  drawShrunkToFit(
    ctx,
    lines.result,
    margin,
    baseline,
    maxTextWidth,
    scaleFont(FONT.headline, lineSize),
    12,
  );

  baseline -= gradeSize * 0.95;
  ctx.font = scaleFont(FONT.display, gradeSize);
  ctx.fillStyle = COLORS.accent;
  ctx.fillText(lines.hero, margin, baseline);

  ctx.restore();
}
