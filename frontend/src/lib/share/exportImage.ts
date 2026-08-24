import { CARD_HEIGHT, CARD_WIDTH, ensureFontsReady } from "./theme";
import { drawCard } from "./drawCard";
import type { CardStrings, ShareOutcome, ShareSubject } from "./types";

/**
 * Producing the file, and getting it off the device.
 *
 * PNG rather than JPEG. The card is flat colour and type, which is the exact
 * case JPEG handles worst — its ringing lands on letter edges — and at
 * 1080×1350 a card comes out a few hundred kilobytes either way. Instagram will
 * re-compress it once; there is no reason to hand it something already damaged.
 */

/** Draw a card at its true size. The caller displays it scaled down. */
export async function renderCard(
  subject: ShareSubject,
  strings: CardStrings,
): Promise<HTMLCanvasElement> {
  await ensureFontsReady();

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");

  drawCard(ctx, subject, strings);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode the image")),
      type,
    );
  });
}

/** `climblog-v5-2026-08-21.png` — recognisable in a camera roll. */
export function shareFilename(subject: ShareSubject, extension: string): string {
  const parts =
    subject.template === "month"
      ? ["climblog", subject.month]
      : subject.template === "session"
        ? ["climblog", subject.date]
        : ["climblog", subject.grade.toLowerCase(), subject.date];
  return `${parts.join("-")}.${extension}`;
}

/** True when this browser can hand a file to the OS share sheet. */
export function canShareFiles(file: File): boolean {
  return (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

/** What happened when the file was handed over. */
export interface DeliveryResult {
  /** Null when the climber dismissed the OS share sheet. */
  outcome: ShareOutcome | null;
  /**
   * Set when a share was asked for and did not happen — refused by the
   * platform, or not offered by it at all — and the file was written instead.
   *
   * Reported rather than swallowed. On iOS a download of a blob URL is very
   * largely ignored by Safari, so falling back quietly means the climber gets
   * a success message and no file. Both causes are surfaced because both look
   * identical from the outside and only the message tells them apart.
   */
  shareError?: Error;
}

/**
 * Hand the file to the OS share sheet, or write it to the device.
 *
 * `intent` is what the climber pressed, not a hint: someone who chose Save
 * wants the file in their camera roll to use later, and opening a share sheet
 * over that is the app deciding it knows better. Share still falls back to
 * saving, because that direction is a platform limitation rather than a change
 * of mind.
 *
 * **Call this with a blob already in hand.** `navigator.share` requires user
 * activation, and Safari is stricter about it than the specification is — an
 * `await` between the tap and the call is enough for it to refuse. Everything
 * before the share call here is synchronous for that reason, and the callers
 * encode ahead of time rather than inside the handler.
 */
export async function deliver(
  blob: Blob,
  filename: string,
  mimeType: string,
  intent: ShareOutcome = "shared",
): Promise<DeliveryResult> {
  const file = new File([blob], filename, { type: mimeType });

  if (intent === "shared") {
    if (!canShareFiles(file)) {
      return {
        ...saveToDevice(blob, filename),
        shareError: new Error(unsupportedReason(file)),
      };
    }
    try {
      await navigator.share({ files: [file] });
      return { outcome: "shared" };
    } catch (err) {
      // AbortError is the climber closing the sheet — a deliberate no, not a
      // failure, and it must not be counted as a share.
      if (err instanceof DOMException && err.name === "AbortError") {
        return { outcome: null };
      }
      return { ...saveToDevice(blob, filename), shareError: err as Error };
    }
  }

  return saveToDevice(blob, filename);
}

/**
 * Which half of the file-share check this browser failed.
 *
 * Worth distinguishing on a phone, where there is no console: "this browser has
 * no Web Share" and "this browser will not share this particular file" have
 * different answers, and the second usually means the type or the size.
 */
function unsupportedReason(file: File): string {
  if (typeof navigator.share !== "function") {
    return "navigator.share is unavailable in this browser";
  }
  if (typeof navigator.canShare !== "function") {
    return "navigator.canShare is unavailable in this browser";
  }
  return `this browser will not share a ${file.type || "file"} (${file.size} bytes)`;
}

/** Write the file out through a download link. */
function saveToDevice(blob: Blob, filename: string): DeliveryResult {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick rather than immediately: Safari reads the object
  // URL asynchronously after the click, and revoking in the same frame gives a
  // silently empty file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { outcome: "saved" };
}
