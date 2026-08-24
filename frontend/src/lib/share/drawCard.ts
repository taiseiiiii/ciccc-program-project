import {
  CARD_HEIGHT,
  CARD_MARGIN,
  CARD_WIDTH,
  COLORS,
  FONT,
} from "./theme";
import {
  drawPills,
  drawShrunkToFit,
  ellipsize,
  roundRectPath,
  scaleFont,
} from "./canvasUtils";
import type {
  CardStrings,
  ClimbSubject,
  GradeTally,
  MonthSubject,
  SessionSubject,
  ShareSubject,
} from "./types";

/**
 * The three cards.
 *
 * Drawn rather than rendered from DOM. `html2canvas` and friends were the
 * obvious alternative and are the wrong tool here: the same drawing routines
 * have to run against a video frame inside an encoding loop, thousands of
 * times, where mounting DOM per frame is not an option. One drawing layer,
 * two destinations.
 *
 * Every function takes finished strings. Nothing here calls i18next, formats a
 * date, or reads app state — which is what lets the whole module run in a
 * worker later if encoding on the main thread turns out to stutter.
 *
 * Layout is a downward cursor with a few anchored positions, in a fixed
 * 1080×1350 space. The card is not responsive: it is a JPEG bound for someone
 * else's feed, and the one thing it must do is look the same everywhere.
 */

const CONTENT_WIDTH = CARD_WIDTH - CARD_MARGIN * 2;

const PILL_STYLE = {
  font: FONT.label,
  fill: COLORS.surface,
  text: COLORS.textMuted,
  paddingX: 28,
  height: 60,
  gap: 14,
} as const;

/** The dark ground every card sits on. */
function drawBackground(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  gradient.addColorStop(0, COLORS.backgroundTop);
  gradient.addColorStop(1, COLORS.backgroundBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

/**
 * The one piece of branding, bottom left above a hairline.
 *
 * Small on purpose. The card's job is to be worth posting; a card that reads as
 * an advert is one nobody posts, and then the wordmark reaches nobody at all.
 */
function drawWordmark(ctx: CanvasRenderingContext2D): void {
  const y = CARD_HEIGHT - CARD_MARGIN;

  ctx.strokeStyle = COLORS.outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CARD_MARGIN, y - 58);
  ctx.lineTo(CARD_WIDTH - CARD_MARGIN, y - 58);
  ctx.stroke();

  ctx.font = FONT.wordmark;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.accent;
  ctx.fillText("ClimbLog", CARD_MARGIN, y);
  const climbLogWidth = ctx.measureText("ClimbLog").width;
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText(" AI", CARD_MARGIN + climbLogWidth, y);
}

/** A row of big number + small caption. Returns nothing; positions are fixed. */
function drawStat(
  ctx: CanvasRenderingContext2D,
  value: string,
  label: string,
  x: number,
  baseline: number,
  maxWidth: number,
  accent = false,
): void {
  ctx.fillStyle = accent ? COLORS.accent : COLORS.text;
  drawShrunkToFit(ctx, value, x, baseline, maxWidth, scaleFont(FONT.display, 104), 40);

  ctx.font = FONT.label;
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText(ellipsize(ctx, label, maxWidth), x, baseline + 48);
}

/** Three stats across the content width. */
function drawStatRow(
  ctx: CanvasRenderingContext2D,
  stats: { value: string; label: string; accent?: boolean }[],
  baseline: number,
): void {
  const gap = 32;
  const columnWidth = (CONTENT_WIDTH - gap * (stats.length - 1)) / stats.length;
  stats.forEach((stat, index) => {
    drawStat(
      ctx,
      stat.value,
      stat.label,
      CARD_MARGIN + index * (columnWidth + gap),
      baseline,
      columnWidth,
      stat.accent,
    );
  });
}

/**
 * Grades as horizontal rows — grade, then a bar whose filled part is the sends.
 *
 * Used on the session card, where there are rarely more than five grades and a
 * list reads more like a logbook than a chart does.
 */
function drawGradeRows(
  ctx: CanvasRenderingContext2D,
  grades: GradeTally[],
  top: number,
  maxRows: number,
): void {
  const rows = grades.slice(0, maxRows);
  if (rows.length === 0) return;

  const busiest = Math.max(...rows.map((row) => row.attempts), 1);
  const rowHeight = 54;
  const barHeight = 22;
  const labelWidth = 130;
  const barWidth = CONTENT_WIDTH - labelWidth;

  rows.forEach((row, index) => {
    const y = top + index * rowHeight;

    ctx.font = FONT.label;
    ctx.fillStyle = COLORS.text;
    ctx.textBaseline = "middle";
    ctx.fillText(row.grade, CARD_MARGIN, y + barHeight / 2 + 1);

    const full = (row.attempts / busiest) * barWidth;
    ctx.fillStyle = COLORS.surface;
    roundRectPath(ctx, CARD_MARGIN + labelWidth, y, full, barHeight, barHeight / 2);
    ctx.fill();

    if (row.sends > 0) {
      const sent = (row.sends / busiest) * barWidth;
      ctx.fillStyle = COLORS.accent;
      roundRectPath(ctx, CARD_MARGIN + labelWidth, y, sent, barHeight, barHeight / 2);
      ctx.fill();
    }
    ctx.textBaseline = "alphabetic";
  });
}

/**
 * Grades as vertical columns — the month's shape at a glance.
 *
 * The dim part of each column is tries, the bright part sends, so the picture
 * a climber recognises is "where my month went" rather than a bar chart of one
 * number. Sends are drawn as a portion of the same column rather than a second
 * series because they are a subset, not a comparison.
 */
function drawGradeColumns(
  ctx: CanvasRenderingContext2D,
  grades: GradeTally[],
  top: number,
  height: number,
  maxColumns: number,
): void {
  // Hardest first everywhere else; a chart reads left-to-right easiest-first.
  const columns = grades.slice(0, maxColumns).reverse();
  if (columns.length === 0) return;

  const busiest = Math.max(...columns.map((column) => column.attempts), 1);
  const gap = 20;
  const columnWidth = Math.min(
    110,
    (CONTENT_WIDTH - gap * (columns.length - 1)) / columns.length,
  );
  const totalWidth = columnWidth * columns.length + gap * (columns.length - 1);
  const startX = CARD_MARGIN + (CONTENT_WIDTH - totalWidth) / 2;
  const labelSpace = 56;
  const plotHeight = height - labelSpace;
  const baseline = top + plotHeight;

  columns.forEach((column, index) => {
    const x = startX + index * (columnWidth + gap);
    const full = Math.max((column.attempts / busiest) * plotHeight, 6);

    ctx.fillStyle = COLORS.surface;
    roundRectPath(ctx, x, baseline - full, columnWidth, full, 12);
    ctx.fill();

    if (column.sends > 0) {
      const sent = Math.max((column.sends / busiest) * plotHeight, 6);
      ctx.fillStyle = COLORS.accent;
      roundRectPath(ctx, x, baseline - sent, columnWidth, sent, 12);
      ctx.fill();
    }

    ctx.font = FONT.label;
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = "center";
    ctx.fillText(column.grade, x + columnWidth / 2, baseline + 42);
    ctx.textAlign = "left";
  });
}

/** One route: the grade is the hero, everything else supports it. */
function drawClimbCard(
  ctx: CanvasRenderingContext2D,
  subject: ClimbSubject,
  strings: CardStrings,
): void {
  let y = 210;

  if (subject.gymName) {
    ctx.font = FONT.title;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(ellipsize(ctx, subject.gymName, CONTENT_WIDTH), CARD_MARGIN, y);
    y += 62;
  }
  ctx.font = FONT.body;
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText(strings.when, CARD_MARGIN, y);

  // The hero sits at a fixed height so that two climb cards posted together
  // line up, whether or not one of them had a gym name.
  y = 700;
  ctx.font = FONT.display;
  ctx.fillStyle = COLORS.accent;
  ctx.fillText(subject.grade, CARD_MARGIN, y);

  y += 100;
  ctx.fillStyle = COLORS.text;
  drawShrunkToFit(ctx, strings.result, CARD_MARGIN, y, CONTENT_WIDTH, FONT.headline);

  if (subject.routeName) {
    y += 66;
    ctx.font = FONT.body;
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(ellipsize(ctx, subject.routeName, CONTENT_WIDTH), CARD_MARGIN, y);
  }

  drawPills(
    ctx,
    [...subject.wallLabels, ...subject.holdLabels],
    CARD_MARGIN,
    y + 60,
    CONTENT_WIDTH,
    PILL_STYLE,
  );
}

/** One visit: what got done, and at which grades. */
function drawSessionCard(
  ctx: CanvasRenderingContext2D,
  subject: SessionSubject,
  strings: CardStrings,
): void {
  let y = 210;

  ctx.font = FONT.title;
  ctx.fillStyle = COLORS.text;
  ctx.fillText(strings.when, CARD_MARGIN, y);

  if (subject.gymName) {
    y += 60;
    ctx.font = FONT.body;
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(ellipsize(ctx, subject.gymName, CONTENT_WIDTH), CARD_MARGIN, y);
  }
  if (strings.duration) {
    y += 54;
    ctx.font = FONT.body;
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(strings.duration, CARD_MARGIN, y);
  }

  drawStatRow(
    ctx,
    [
      { value: String(subject.totalSends), label: strings.sent, accent: true },
      { value: String(subject.climbCount), label: strings.routes },
      { value: subject.highestGrade ?? "—", label: strings.best },
    ],
    560,
  );

  drawGradeRows(ctx, subject.grades, 700, 6);
}

/** One month: the totals, and the shape of where the tries went. */
function drawMonthCard(
  ctx: CanvasRenderingContext2D,
  subject: MonthSubject,
  strings: CardStrings,
): void {
  ctx.font = FONT.title;
  ctx.fillStyle = COLORS.text;
  ctx.fillText(strings.when, CARD_MARGIN, 210);

  drawStatRow(
    ctx,
    [
      { value: String(subject.sends), label: strings.sent, accent: true },
      { value: String(subject.routes), label: strings.routes },
      { value: String(subject.climbingDays), label: strings.days },
    ],
    460,
  );

  drawStatRow(
    ctx,
    [
      { value: subject.highestGrade ?? "—", label: strings.best },
      { value: String(subject.flashes), label: strings.flashes },
      { value: String(subject.attempts), label: strings.tries },
    ],
    700,
  );

  drawGradeColumns(ctx, subject.grades, 800, 380, 8);
}

/**
 * Draw `subject` onto a 1080×1350 context.
 *
 * The caller supplies a context of exactly that size — `renderCard` in
 * exportImage.ts does — because a canvas that has been scaled to fit a preview
 * would put every fixed coordinate in this file in the wrong place.
 */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  subject: ShareSubject,
  strings: CardStrings,
): void {
  drawBackground(ctx);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  switch (subject.template) {
    case "climb":
      drawClimbCard(ctx, subject, strings);
      break;
    case "session":
      drawSessionCard(ctx, subject, strings);
      break;
    case "month":
      drawMonthCard(ctx, subject, strings);
      break;
  }

  drawWordmark(ctx);
}
