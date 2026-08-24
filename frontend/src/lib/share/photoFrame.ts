import { fitToCanvas, type PosterFrame } from "./frame";
import { ShareExportError } from "./exportTypes";

/**
 * Decoding a photo for the overlay.
 *
 * The whole photo path, and it is this short because a still needs none of
 * what a video needs: no encoder, no muxer, no priming a media element into
 * decoding. Kept out of videoExport.ts so that a climber who only ever
 * photographs their sends never downloads the WebCodecs pipeline.
 *
 * An `<img>` rather than `createImageBitmap`, for two reasons. It applies the
 * EXIF orientation, so a photo taken with the phone sideways is drawn the way
 * its owner saw it rather than rotated ninety degrees. And its format support
 * is whatever the browser's is — which on iOS includes the HEIC that an iPhone
 * camera produces by default, and `createImageBitmap` has never been dependable
 * for in Safari.
 */

/** Long enough for a large photo off a slow filesystem, short enough that a
 *  format the browser silently will not decode still ends in a message. */
const DECODE_TIMEOUT_MS = 10_000;

export async function loadPhotoFrame(source: Blob): Promise<PosterFrame> {
  const url = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      const timer = setTimeout(
        () =>
          reject(
            new ShareExportError("decode", "That photo took too long to open."),
          ),
        DECODE_TIMEOUT_MS,
      );
      element.onload = () => {
        clearTimeout(timer);
        resolve(element);
      };
      element.onerror = () => {
        clearTimeout(timer);
        reject(
          new ShareExportError(
            "decode",
            "This browser could not read that photo.",
          ),
        );
      };
      element.src = url;
    });

    // Zero dimensions mean the browser accepted the file and decoded nothing —
    // caught here, because downstream it becomes a 2×2 canvas, and an image too
    // small to notice is a far worse bug report than a message.
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new ShareExportError(
        "decode",
        "That photo's format could not be decoded by this browser.",
      );
    }

    return fitToCanvas(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
