import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import enDashboard from "./locales/en/dashboard.json";
import enSessions from "./locales/en/sessions.json";
import enProgress from "./locales/en/progress.json";
import enCoach from "./locales/en/coach.json";
import enInjuries from "./locales/en/injuries.json";
import enProfile from "./locales/en/profile.json";
import enShare from "./locales/en/share.json";

import jaCommon from "./locales/ja/common.json";
import jaDashboard from "./locales/ja/dashboard.json";
import jaSessions from "./locales/ja/sessions.json";
import jaProgress from "./locales/ja/progress.json";
import jaCoach from "./locales/ja/coach.json";
import jaInjuries from "./locales/ja/injuries.json";
import jaProfile from "./locales/ja/profile.json";
import jaShare from "./locales/ja/share.json";

/**
 * Interface language.
 *
 * Split into one namespace per screen rather than one large catalogue. The
 * bundles are all loaded up front — two languages of UI text is a few
 * kilobytes, and lazy-loading them would mean a flash of untranslated text on
 * every route change — but keeping them apart makes it obvious which screen a
 * key belongs to, and stops two screens quietly sharing a string that then has
 * to mean the same thing in both forever.
 *
 * `common` is the exception: buttons, states and words that genuinely are the
 * same everywhere ("Save", "Cancel", "Loading...").
 *
 * The AI coach's own text is not translated here. It is written by the model,
 * so the language is part of the generation request — see the server's
 * config/locales.ts.
 */

export const SUPPORTED_LOCALES = ["en", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_STORAGE_KEY = "climblog:locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ja: "日本語",
};

const resources = {
  en: {
    common: enCommon,
    dashboard: enDashboard,
    sessions: enSessions,
    progress: enProgress,
    coach: enCoach,
    injuries: enInjuries,
    profile: enProfile,
    share: enShare,
  },
  ja: {
    common: jaCommon,
    dashboard: jaDashboard,
    sessions: jaSessions,
    progress: jaProgress,
    coach: jaCoach,
    injuries: jaInjuries,
    profile: jaProfile,
    share: jaShare,
  },
} as const;

/**
 * The language to start in.
 *
 * A saved choice wins. Otherwise the browser's own preference decides, matched
 * on the base tag so "ja-JP" finds "ja" — a climber whose phone is in Japanese
 * should not have to go and ask for Japanese.
 */
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) {
      return saved as Locale;
    }
  } catch {
    // Storage can be unavailable in private mode; fall through to the browser.
  }

  const preferred = navigator.language?.split("-")[0];
  return SUPPORTED_LOCALES.includes(preferred as Locale)
    ? (preferred as Locale)
    : "en";
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale(),
  fallbackLng: "en",
  defaultNS: "common",
  ns: Object.keys(resources.en),
  interpolation: {
    // React escapes everything it renders already, and double-escaping turns
    // an apostrophe in a gym name into &#39;.
    escapeValue: false,
  },
  returnNull: false,
});

/** Change the language and remember it on this device. */
export function setLocale(locale: Locale): void {
  void i18n.changeLanguage(locale);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // A language that resets on reload is better than a crash here.
  }
}

/** The active language, narrowed to one this app actually has a catalogue for. */
export function currentLocale(): Locale {
  const base = i18n.language?.split("-")[0];
  return SUPPORTED_LOCALES.includes(base as Locale) ? (base as Locale) : "en";
}

export default i18n;
