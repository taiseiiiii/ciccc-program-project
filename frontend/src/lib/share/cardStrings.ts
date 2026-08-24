import type { TFunction } from "i18next";
import { formatDate, formatMinutes, formatMonthLong } from "../date";
import type { CardStrings, ShareSubject } from "./types";

/**
 * The words on a card, resolved once before drawing.
 *
 * The drawing layer takes finished strings so it can stay free of React and
 * i18next — see drawCard.ts — which makes this the single place a card's
 * wording is decided.
 *
 * The result line ("Flash", "Sent 2/5") is read from `common:climb.*`, the same
 * keys `SessionDetail` prints on screen. Sharing a climb should not describe it
 * differently from the app the climber is looking at, and a second set of
 * strings would drift apart the first time one of them was reworded.
 */
export function buildCardStrings(
  subject: ShareSubject,
  t: TFunction,
): CardStrings {
  const label = (key: string): string => t(`share:label.${key}`);

  const result = (): string => {
    if (subject.template !== "climb") return "";
    if (subject.sendCount === 0) {
      return t("common:climb.tries", { count: subject.attemptCount });
    }
    if (subject.attemptCount === 1 && subject.sendCount === 1) {
      return t("common:climb.flash");
    }
    return t("common:climb.sentOf", {
      sends: subject.sendCount,
      tries: subject.attemptCount,
    });
  };

  const when = (): string => {
    switch (subject.template) {
      case "climb":
      case "session":
        return formatDate(subject.date);
      case "month":
        return formatMonthLong(subject.month);
    }
  };

  return {
    result: result(),
    sent: label("sent"),
    tries: label("tries"),
    routes: label("routes"),
    days: label("days"),
    flashes: label("flashes"),
    best: label("best"),
    when: when(),
    duration:
      subject.template === "session" && subject.durationMinutes
        ? formatMinutes(subject.durationMinutes)
        : null,
  };
}
