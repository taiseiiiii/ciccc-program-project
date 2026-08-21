import { currentLocale, type Locale } from "../i18n";

/** Hiragana, katakana, and CJK ideographs — everything Japanese prose is in. */
const JAPANESE_SCRIPT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/gu;

/**
 * Below this many non-space characters there is not enough text to judge, and
 * a wrong guess would put a confusing notice on a perfectly readable report.
 */
const MIN_LENGTH = 40;

/**
 * A fifth of the characters being Japanese means the report is in Japanese.
 *
 * The gap either side of this is wide: Japanese prose measures around 80%,
 * English prose around 0%. What sits in between is an English report quoting a
 * gym or route name the climber typed in Japanese, which reaches 9% in a short
 * one — close enough to a tenth to leave the margin here rather than there.
 */
const JAPANESE_RATIO = 0.2;

/**
 * The language a saved report is written in, when it is not the one on screen.
 *
 * Reports are immutable snapshots — the AI wrote them in whatever language the
 * account was set to at the time, and nothing translates them afterwards. So a
 * climber who switches the app to Japanese still finds English essays behind
 * "read the full analysis", with nothing to explain why. This is what the
 * notice keys off.
 *
 * Sniffing the script rather than reading a column: the reports that need the
 * notice are precisely the old ones, which is exactly the set a new `locale`
 * column would have no value for. Only useful while the app speaks two
 * languages that do not share a script — a third would need the real thing.
 *
 * Returns null when the report matches the interface, or is too short to call.
 */
export function foreignReportLanguage(text: string | null): Locale | null {
  const dense = (text ?? "").replace(/\s+/g, "");
  if (dense.length < MIN_LENGTH) return null;

  const japanese = dense.match(JAPANESE_SCRIPT)?.length ?? 0;
  const written: Locale =
    japanese / dense.length > JAPANESE_RATIO ? "ja" : "en";

  return written === currentLocale() ? null : written;
}
