/**
 * The look of everything the share feature produces.
 *
 * One module rather than constants next to each drawing routine, because the
 * card and the overlay burned into a video have to be recognisably the same
 * object. They are drawn by different code paths — one fills a 1080×1350
 * canvas, the other paints a corner of somebody's 9:16 phone video — and the
 * only thing keeping them a single design is that both read from here.
 *
 * Colours are literals rather than the app's CSS custom properties on purpose.
 * A canvas cannot read `var(--color-primary)`, and more importantly the card is
 * leaving the app: it must look identical whether the climber had the app in
 * light or dark mode when they pressed the button.
 */

/**
 * 1080×1350 — Instagram's tallest feed size (4:5).
 *
 * Chosen over 9:16 because the card's job is to sit *next to* the climber's own
 * video in a carousel, and a carousel takes its aspect ratio from the first
 * slide. 4:5 is what a phone-shot video most often ends up as once Instagram
 * has it, so the card matches rather than being letterboxed. Posted to a Story
 * instead, it centres with a background, which is fine.
 */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/** Everything stays inside this margin. Instagram crops nothing, but the app
 *  icons and "shared by" chrome of other platforms sit in the corners. */
export const CARD_MARGIN = 88;

export const COLORS = {
  /** Deep green-black. Dark cards read better in a feed and match the sport. */
  backgroundTop: "#0c2019",
  backgroundBottom: "#06110d",
  /** The mint the app uses as its dark-mode primary. The one loud colour. */
  accent: "#4de082",
  text: "#f4f6f5",
  textMuted: "#9db3a9",
  /** Pill backgrounds and hairlines. */
  surface: "#16352a",
  outline: "#27503f",
} as const;

/**
 * Font stack for the canvas.
 *
 * Inter is loaded from Google Fonts by index.html and covers Latin. It has no
 * CJK glyphs, so a Japanese gym name falls through to the platform's own font —
 * per glyph, exactly as it would in CSS. That fallback is why `sans-serif` is
 * not optional here.
 */
export const FONT_STACK = '"Inter", system-ui, sans-serif';

/** `font` strings for the canvas 2D context, in the app's type scale. */
export const FONT = {
  display: `800 168px ${FONT_STACK}`,
  headline: `700 72px ${FONT_STACK}`,
  title: `600 52px ${FONT_STACK}`,
  body: `400 40px ${FONT_STACK}`,
  label: `600 30px ${FONT_STACK}`,
  wordmark: `700 32px ${FONT_STACK}`,
} as const;

/**
 * The overlay burned into a video, sized relative to the frame.
 *
 * Videos arrive at whatever the phone shot them at — 1080×1920, 1920×1080, and
 * on a 4K device something four times that. A fixed pixel size would be a
 * banner on one and unreadable on another, so every number here is a fraction
 * of the frame's *shorter* edge.
 */
export const OVERLAY = {
  /** Text height as a fraction of the short edge. */
  gradeScale: 0.085,
  lineScale: 0.036,
  labelScale: 0.028,
  /** Distance from the frame edge, same fraction. */
  marginScale: 0.05,
  /** The scrim behind the text, so it survives a bright gym wall. */
  scrimAlpha: 0.55,
} as const;

/**
 * Inter arrives asynchronously, and a canvas asked to draw before it lands
 * silently uses the fallback — which is not visibly broken, just quietly the
 * wrong card. Awaited before every draw.
 *
 * `document.fonts.load` is called per weight because `fonts.ready` only
 * promises that pending loads settled, not that a weight nobody has rendered
 * yet was one of them.
 */
export async function ensureFontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const weights = ["400", "600", "700", "800"];
  await Promise.all(
    weights.map((weight) =>
      document.fonts.load(`${weight} 64px "Inter"`).catch(() => undefined),
    ),
  );
  await document.fonts.ready;
}
