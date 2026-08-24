import { api } from "../api";
import type { ShareFormat, ShareOutcome, ShareTemplate } from "./types";

/**
 * Tell the server that a card left the device.
 *
 * Deliberately fire-and-forget. Sharing is finished by the time this is called
 * — the file is already in the OS share sheet or the camera roll — so a failed
 * counter must never surface as an error the climber has to read. A dropped row
 * costs a little accuracy in a number only the team looks at.
 *
 * It is also the only reason the server hears about sharing at all: the card is
 * drawn and delivered entirely in the browser. Without this the app could not
 * answer which of the three templates or two formats anyone uses, which is the
 * question they were all shipped together to settle.
 */
export function recordShareEvent(
  template: ShareTemplate,
  format: ShareFormat,
  outcome: ShareOutcome,
): void {
  void api("/share-events", {
    method: "POST",
    body: JSON.stringify({ template, format, outcome }),
  }).catch(() => undefined);
}
