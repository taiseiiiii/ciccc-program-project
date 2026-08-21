import { useTranslation } from "react-i18next";
import { foreignReportLanguage } from "../lib/reportLanguage";

/**
 * "This one was written in English" — shown above a report the interface
 * cannot translate.
 *
 * Renders nothing in the ordinary case, which is every report generated since
 * the account's language started following the app's.
 */
export default function ReportLanguageNotice({ text }: { text: string | null }) {
  const { t } = useTranslation("coach");
  const written = foreignReportLanguage(text);
  if (!written) return null;

  return (
    <p className="mt-3 rounded-xl border border-outline-variant bg-surface-container-high/40 px-3 py-2 text-body-sm text-on-surface-variant">
      {t("card.otherLanguage", {
        language: t(`common:language.name.${written}`),
      })}
    </p>
  );
}
