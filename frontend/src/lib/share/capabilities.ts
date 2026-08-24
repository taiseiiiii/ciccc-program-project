/**
 * What this browser can actually do.
 *
 * The share feature spans two very different capability sets: drawing a card
 * (any browser this app already runs in) and re-encoding a video (a recent
 * one). Rather than letting a climber press a button that fails halfway
 * through a 40-second encode, each is detected up front and the UI simply does
 * not offer what it cannot finish.
 *
 * Detection is by feature, never by user agent. It is also asynchronous,
 * because the question that actually decides the video path — "will this
 * device encode H.264?" — can only be answered by asking the encoder, and the
 * answer is no on Firefox and on Chromium builds without proprietary codecs
 * even though every WebCodecs class exists there. Checking for the classes
 * alone offered the Video tab on exactly the browsers that would fail at the
 * last step.
 */

export interface ShareCapabilities {
  /** Decode, re-encode to H.264 and mux a video entirely in the browser. */
  video: boolean;
  /** `capture="environment"` opens the OS camera. Phones only. */
  camera: boolean;
}

/** H.264 profiles the export will try, most preferred first. Baseline last:
 *  it is the one every decoder can play, and the one that costs the most bits
 *  to do it. Shared with the exporter so the probe and the encode agree. */
export const H264_CODEC_CANDIDATES = ["avc1.4d0028", "avc1.640028", "avc1.42001f"];

function hasWebCodecs(): boolean {
  return (
    typeof window !== "undefined" &&
    "VideoEncoder" in window &&
    "VideoDecoder" in window &&
    "VideoFrame" in window
  );
}

/**
 * Frame-accurate capture from a playing `<video>`.
 *
 * The decode half of the pipeline reads frames as the browser presents them,
 * which needs `requestVideoFrameCallback`. Without it the only alternative is
 * seeking frame by frame, which is slower and, on some builds, imprecise
 * enough to drop or duplicate frames.
 */
function hasFrameCallback(): boolean {
  return (
    typeof HTMLVideoElement !== "undefined" &&
    "requestVideoFrameCallback" in HTMLVideoElement.prototype
  );
}

/** Ask the encoder whether any of the profiles is usable at a typical size. */
async function canEncodeH264(): Promise<boolean> {
  for (const codec of H264_CODEC_CANDIDATES) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec,
        width: 1080,
        height: 1920,
        bitrate: 8_000_000,
        framerate: 30,
      });
      if (supported) return true;
    } catch {
      // Thrown rather than answered false for a codec string it cannot parse.
    }
  }
  return false;
}

/**
 * A touch device with a rear camera, roughly. `capture` is ignored on desktop
 * browsers, which quietly turn it back into an ordinary file picker — harmless,
 * but offering "take a video" on a laptop is a button that lies.
 */
function hasCamera(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    navigator.maxTouchPoints > 0 &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

let cached: Promise<ShareCapabilities> | null = null;

/** Detected once per page; the answers cannot change while the app runs. */
export function detectCapabilities(): Promise<ShareCapabilities> {
  cached ??= (async () => ({
    video: hasWebCodecs() && hasFrameCallback() && (await canEncodeH264()),
    camera: hasCamera(),
  }))();
  return cached;
}
