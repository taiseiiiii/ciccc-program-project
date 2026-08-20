/**
 * The languages the app speaks.
 *
 * One list, used in three places that would otherwise drift: validating a
 * PATCH of `users.locale`, choosing the language an AI report is written in,
 * and the CHECK constraint in migration 0012.
 *
 * Adding a language means adding it here, adding a migration that widens that
 * CHECK, and shipping a translation catalogue in the frontend. The order
 * matters — a value the database rejects would reach the climber as a 500.
 */
export const SUPPORTED_LOCALES = ["en", "ja"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** The language name to put in a prompt. Models take the English name best. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ja: "Japanese",
};

/** Narrows an arbitrary string to a locale, falling back to the default. */
export function toLocale(value: unknown): Locale {
  return SUPPORTED_LOCALES.includes(value as Locale)
    ? (value as Locale)
    : DEFAULT_LOCALE;
}
