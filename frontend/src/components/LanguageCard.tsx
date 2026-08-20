import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  currentLocale,
  setLocale,
  type Locale,
} from "../i18n";
import Button from "./Button";
import Card from "./Card";

/**
 * Interface language.
 *
 * Two things happen on a change, and they are not the same thing:
 *
 *   * The app switches immediately, from a catalogue already in the bundle, and
 *     remembers the choice in this browser. That is what the climber sees.
 *
 *   * The account is updated too — best effort. That is what a new phone
 *     inherits, and what the AI coach writes its reports in, since those words
 *     are generated on the server rather than looked up here.
 *
 * The second is deliberately not awaited or surfaced. A language toggle that
 * shows a spinner, or an error, because a network request failed would be a
 * strange thing to explain when the app has visibly already switched.
 */
export default function LanguageCard() {
  const { t } = useTranslation();
  const active = currentLocale();

  const { mutate: saveToAccount } = useMutation({
    mutationFn: (locale: Locale) =>
      api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ locale }),
      }),
  });

  const choose = (locale: Locale) => {
    if (locale === active) return;
    setLocale(locale);
    saveToAccount(locale);
  };

  return (
    <Card>
      <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
        {t("language.label")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {SUPPORTED_LOCALES.map((locale) => (
          <Button
            key={locale}
            variant="secondary"
            aria-pressed={locale === active}
            onClick={() => choose(locale)}
            className={
              locale === active
                ? "bg-primary text-on-primary hover:bg-primary-container"
                : ""
            }
          >
            {LOCALE_LABELS[locale]}
          </Button>
        ))}
      </div>
      <p className="text-on-surface-variant text-body-sm mt-3">
        {t("language.help")}
      </p>
    </Card>
  );
}
