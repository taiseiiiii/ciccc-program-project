import type { CardStrings, ShareSubject } from "./types";

/**
 * The small, always-loaded half of the export pipelines.
 *
 * Split out so that `videoExport.ts` — which pulls in the MP4 muxer and the
 * whole WebCodecs path — can be imported dynamically, only once a climber has
 * actually chosen a video. Opening a session should not cost the download of an
 * encoder nobody on that screen has asked for; the app already treats chunk
 * size this way for the charting library.
 *
 * Everything here is a type, a constant, or an error class: things the share
 * sheet has to be able to name before the heavy module exists. The photo path
 * shares them, which is why nothing here says "video".
 */

/**
 * Longest video the overlay will be burned into.
 *
 * The same figure as the upload ceiling the server reports in `/media/usage`,
 * but not read from it: that one bounds storage, this one bounds how long a
 * phone is asked to encode for, and they are free to drift apart. A clip from
 * the camera roll never touched the server's limit at all.
 */
export const MAX_DURATION_SECONDS = 120;

/** `portrait` centre-crops to 9:16 for Stories and Reels. */
export type CropMode = "source" | "portrait";

export interface VideoExportOptions {
  source: Blob;
  subject: ShareSubject;
  strings: CardStrings;
  crop: CropMode;
  /** Where the crop window sits along the cropped axis, 0–1. 0.5 is centred. */
  cropOffset: number;
  /** 0–1, for a progress bar. Called often; keep the handler cheap. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export class ShareExportError extends Error {
  readonly reason: "unsupported" | "decode" | "encode" | "cancelled";
  constructor(reason: ShareExportError["reason"], message: string) {
    super(message);
    this.name = "ShareExportError";
    this.reason = reason;
  }
}
