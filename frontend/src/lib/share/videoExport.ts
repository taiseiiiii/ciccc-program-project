import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { H264_CODEC_CANDIDATES } from "./capabilities";
import { drawOverlay } from "./drawOverlay";
import { ensureFontsReady } from "./theme";
import { fitToCanvas, planFrame, type PosterFrame } from "./frame";
import {
  MAX_DURATION_SECONDS,
  ShareExportError,
  type VideoExportOptions,
} from "./exportTypes";

/**
 * Burning the overlay into the climber's own video, entirely in the browser.
 *
 * The shape of it: play the source video, take each frame the browser presents,
 * draw it to a canvas with the overlay on top, hand that to a hardware H.264
 * encoder, and mux the result into an MP4 alongside the original audio.
 *
 * Two decisions worth knowing about before changing anything here.
 *
 * **The output is always H.264 in MP4.** Not a preference — Instagram rejects
 * WebM outright, which rules out `MediaRecorder`'s default output on Chrome and
 * is the whole reason this file uses WebCodecs instead of the eight-line
 * `canvas.captureStream()` version.
 *
 * **Frames are read by playing the video, not by demuxing it.** A real demuxer
 * (mp4box.js and friends) would be faster and would let the audio pass through
 * untouched, at the cost of another dependency and a second decode path to keep
 * working across formats. Playback plus `requestVideoFrameCallback` reuses the
 * decoder the browser already has, and inherits its format support for free —
 * which matters most for the HEVC video an iPhone records by default.
 *
 * The cost of that choice is wall-clock: processing takes about as long as the
 * video runs. See PLAYBACK_RATE.
 */

/**
 * Kept at 1 deliberately.
 *
 * Playing faster does speed this up, but `requestVideoFrameCallback` only fires
 * for frames the browser actually *presents*, and above 1× it presents fewer of
 * them. Timestamps come from `mediaTime`, so the result stays in sync either
 * way — it just quietly loses frames, which on a video of someone moving is
 * exactly where it would be noticed. Worth revisiting per-device once there are
 * real measurements; it is one number.
 */
const PLAYBACK_RATE = 1;

/** Encoder queue depth before the source video is paused to let it catch up. */
const QUEUE_HIGH_WATER = 12;
const QUEUE_LOW_WATER = 4;


/** A bitrate that looks right after a social network re-compresses it. */
function targetBitrate(width: number, height: number, fps: number): number {
  const bits = width * height * fps * 0.12;
  return Math.round(Math.min(Math.max(bits, 4_000_000), 12_000_000));
}

function loadVideoElement(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () =>
      reject(
        new ShareExportError(
          "decode",
          "This browser could not read that video. iPhone videos in HEVC do not open on every Android browser.",
        ),
      );
  });
}

/** Pick the first H.264 configuration this device will actually accept. */
async function resolveEncoderConfig(
  width: number,
  height: number,
  fps: number,
): Promise<VideoEncoderConfig> {
  for (const codec of H264_CODEC_CANDIDATES) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate: targetBitrate(width, height, fps),
      framerate: fps,
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return config;
    } catch {
      // isConfigSupported throws rather than answering false for a codec string
      // it cannot even parse. Try the next one.
    }
  }
  throw new ShareExportError(
    "unsupported",
    "This browser cannot encode H.264 video.",
  );
}

/**
 * Decode the source's audio to PCM, if it has any.
 *
 * `decodeAudioData` is used rather than a demuxer for the same reason the video
 * side plays the file: it reuses what the browser already knows how to open. It
 * decodes the whole track into memory, which for two minutes of stereo is tens
 * of megabytes — bounded, and bounded by MAX_DURATION_SECONDS.
 *
 * Returns null for a silent video, or when anything at all goes wrong. Losing
 * the audio is a bad outcome; failing the whole export because a codec was
 * unusual is a worse one.
 */
async function decodeAudio(source: Blob): Promise<AudioBuffer | null> {
  if (typeof AudioEncoder === "undefined") return null;
  try {
    const context = new OfflineAudioContext(1, 1, 48_000);
    const buffer = await context.decodeAudioData(await source.arrayBuffer());
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

/** One finished AAC chunk, held until the muxer is known to want an audio track. */
interface BufferedAudioChunk {
  chunk: EncodedAudioChunk;
  meta?: EncodedAudioChunkMetadata;
}

/**
 * Encode a decoded track to AAC, buffering the chunks rather than muxing them.
 *
 * Buffered on purpose. A muxer has to be told at construction whether the file
 * has an audio track, so writing chunks as they are produced means committing
 * to an audio track before knowing the encode will finish — and an AAC encoder
 * that fails halfway then leaves a declared track with no samples in it, which
 * is a file that plays back wrong rather than a file that is missing its sound.
 *
 * Encoding first and asking questions afterwards costs about two megabytes for
 * the longest video this accepts, and turns "the audio codec was unusual" from
 * a corrupt export into a silent one.
 *
 * Returns null when there is nothing usable, which the caller reads as "make a
 * video-only file".
 */
async function encodeAudioChunks(
  audio: AudioBuffer,
  durationLimit: number,
): Promise<BufferedAudioChunk[] | null> {
  const { numberOfChannels, sampleRate } = audio;
  const buffered: BufferedAudioChunk[] = [];

  const encoder = new AudioEncoder({
    output: (chunk, meta) => buffered.push({ chunk, meta }),
    error: () => {
      /* Surfaced by the flush below. */
    },
  });
  encoder.configure({
    codec: "mp4a.40.2",
    sampleRate,
    numberOfChannels,
    bitrate: 128_000,
  });

  // f32-planar wants each channel laid end to end, so one flat buffer per
  // block holds channel 0 then channel 1.
  const blockFrames = 4096;
  const totalFrames = Math.min(
    audio.length,
    Math.ceil(durationLimit * sampleRate),
  );
  const channels = Array.from({ length: numberOfChannels }, (_, index) =>
    audio.getChannelData(index),
  );

  for (let offset = 0; offset < totalFrames; offset += blockFrames) {
    const frames = Math.min(blockFrames, totalFrames - offset);
    const planar = new Float32Array(frames * numberOfChannels);
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      planar.set(
        channels[channel]!.subarray(offset, offset + frames),
        channel * frames,
      );
    }
    encoder.encode(
      new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: frames,
        numberOfChannels,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: planar,
      }),
    );
  }

  try {
    await encoder.flush();
  } catch {
    return null;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  return buffered.length > 0 ? buffered : null;
}

/**
 * Open a blob in a `<video>` and hand back the element plus its teardown.
 *
 * Shared by the preview and the export, which used to each carry their own
 * copy of create / load / pause / unload / revoke. The object URL has to be
 * revoked by whoever created it and only after the element has let go of it —
 * hence the element and the cleanup travel together.
 */
async function openSource(
  source: Blob,
): Promise<{ video: HTMLVideoElement; close: () => void }> {
  const url = URL.createObjectURL(source);
  const revoke = () => {
    URL.revokeObjectURL(url);
  };
  let video: HTMLVideoElement;
  try {
    video = await loadVideoElement(url);
  } catch (err) {
    revoke();
    throw err;
  }

  // Put the element in the document, out of sight.
  //
  // A detached <video> is enough on desktop, and unreliable on iOS: Safari
  // treats an element that is not in a document as having nothing to render
  // to, and can decline to decode frames for it at all — which shows up as a
  // seek that never completes rather than as an error. Off-screen and one
  // pixel, never `display: none`, which puts it back in the same position.
  video.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(video);

  return {
    video,
    close: () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      revoke();
    },
  };
}

/** Resolve true if `event` fires within `ms`, false if it does not. */
function waitFor(
  target: EventTarget,
  event: string,
  ms: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (value: boolean) => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      resolve(value);
    };
    const onEvent = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    target.addEventListener(event, onEvent, { once: true });
  });
}

/** How long any single wait on the media element is allowed to take. */
const MEDIA_STEP_TIMEOUT_MS = 4000;

/**
 * Get the element to the point where it has a frame that can be drawn.
 *
 * `loadedmetadata` only promises the dimensions and duration are known; it says
 * nothing about there being picture data. Drawing at that point yields a blank
 * canvas, and seeking can be ignored outright — on iOS `preload` is advisory
 * and Safari will not fetch media data until playback is asked for.
 *
 * So playback is asked for. A muted, inline video is allowed to play without a
 * gesture on every current browser, and a play/pause is the most reliable way
 * to make one decode. Both waits are bounded: a preview that fails is
 * recoverable, a preview that hangs leaves a spinner on screen forever.
 */
async function primeVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 /* HAVE_CURRENT_DATA */) return;
  try {
    await video.play();
    video.pause();
  } catch {
    // Autoplay refused. `loadeddata` may still arrive on its own.
  }
  if (video.readyState < 2) {
    await waitFor(video, "loadeddata", MEDIA_STEP_TIMEOUT_MS);
  }
}

/**
 * Decode the preview frame for `source`. Once per source, see PosterFrame.
 *
 * The frame comes back as a canvas rather than an `ImageBitmap`. Both work as a
 * `drawImage` source, but `createImageBitmap` has never been dependable with a
 * video element in Safari, and there is nothing to gain by finding out on
 * somebody's phone.
 *
 * Seeks a little way in rather than to zero: the first frame of a handheld clip
 * is usually the moment the phone was still being aimed. The seek is a
 * preference, not a requirement — if the platform declines it, whatever frame
 * is already decoded is drawn instead. A slightly different still is a far
 * better outcome than a preview that never appears.
 */
export async function loadPosterFrame(source: Blob): Promise<PosterFrame> {
  const { video, close } = await openSource(source);
  try {
    await primeVideo(video);

    const target = Math.min(0.5, (video.duration || 1) / 2);
    if (Number.isFinite(target) && Math.abs(video.currentTime - target) > 0.01) {
      const seeked = waitFor(video, "seeked", MEDIA_STEP_TIMEOUT_MS);
      video.currentTime = target;
      await seeked;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    // Dimensions of zero mean nothing was ever decoded — a codec the browser
    // parsed the container of but cannot play. Caught here, because further on
    // it becomes a 2×2 canvas and an image too small to notice is a much worse
    // bug report than an error message.
    if (width === 0 || height === 0) {
      throw new ShareExportError(
        "decode",
        "That video's format could not be decoded by this browser.",
      );
    }

    // Downscaled on the way in — see fitToCanvas. A 4K still is ~33 MB of
    // backing store, and a climber trying several videos in a row would
    // otherwise accumulate frames the size of the originals.
    return fitToCanvas(video, width, height);
  } finally {
    close();
  }
}

/**
 * Produce an MP4 of `source` with the overlay burned in.
 *
 * Throws `ShareExportError` for the three things that genuinely go wrong: a
 * browser that cannot encode, a file it cannot open, and the climber pressing
 * cancel. Everything else is allowed to degrade — a video with no usable audio
 * track comes back silent rather than not at all.
 */
export async function exportVideoWithOverlay(
  options: VideoExportOptions,
): Promise<Blob> {
  const { source, subject, strings, crop, cropOffset, onProgress, signal } =
    options;

  if (typeof VideoEncoder === "undefined") {
    throw new ShareExportError(
      "unsupported",
      "This browser cannot process video.",
    );
  }

  await ensureFontsReady();

  const { video, close } = await openSource(source);
  let encoder: VideoEncoder | null = null;

  try {
    const duration = Math.min(
      Number.isFinite(video.duration) ? video.duration : MAX_DURATION_SECONDS,
      MAX_DURATION_SECONDS,
    );
    const plan = planFrame(video.videoWidth, video.videoHeight, crop, cropOffset);
    const fps = 30;
    const config = await resolveEncoderConfig(plan.width, plan.height, fps);

    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new ShareExportError("encode", "Canvas 2D is unavailable");

    // Both halves of the audio path run before the muxer exists, so the file
    // only ever declares a track that is already fully encoded.
    const audio = await decodeAudio(source);
    const audioChunks = audio
      ? await encodeAudioChunks(audio, duration).catch(() => null)
      : null;

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: "avc", width: plan.width, height: plan.height },
      ...(audio && audioChunks
        ? {
            audio: {
              codec: "aac" as const,
              numberOfChannels: audio.numberOfChannels,
              sampleRate: audio.sampleRate,
            },
          }
        : {}),
      // The file has to be playable the moment it is handed to another app, so
      // the index goes at the front. 'in-memory' is the only option that can do
      // that without a second pass over a file we are holding in memory anyway.
      fastStart: "in-memory",
    });

    // Errors from the encoder and the muxer both arrive in callbacks the
    // control-flow analyser cannot see running, so they are parked here and
    // read through a getter — a bare `let` gets narrowed to null at the first
    // check and stays there, quietly making every later check dead code.
    let failure: Error | null = null;
    const lastFailure = (): Error | null => failure;

    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        // The muxer throws from inside this callback for a malformed
        // timeline, and a throw here is swallowed by the encoder rather than
        // reaching the loop below. Caught and parked, or the export would end
        // "successfully" with a file that has no video samples.
        try {
          muxer.addVideoChunk(chunk, meta);
        } catch (err) {
          failure = err instanceof Error ? err : new Error(String(err));
        }
      },
      error: (err) => {
        failure = err;
      },
    });
    encoder.configure(config);

    if (audioChunks) {
      for (const { chunk, meta } of audioChunks) muxer.addAudioChunk(chunk, meta);
    }

    // One listener for the whole run rather than one per frame. The previous
    // per-call listener could miss `ended` entirely if the video finished
    // during the back-pressure pause below, after which `play()` on an ended
    // element restarts it from zero — and the export ran the clip twice.
    let ended = false;
    video.addEventListener("ended", () => {
      ended = true;
    });

    /** Resolve on the next presented frame, or null once the video has ended. */
    const nextPresentedFrame = (): Promise<VideoFrameCallbackMetadata | null> =>
      new Promise((resolve) => {
        if (ended) {
          resolve(null);
          return;
        }
        let settled = false;
        const done = (value: VideoFrameCallbackMetadata | null) => {
          if (settled) return;
          settled = true;
          video.removeEventListener("ended", onEnded);
          resolve(value);
        };
        const onEnded = () => done(null);
        video.addEventListener("ended", onEnded, { once: true });
        video.requestVideoFrameCallback((_now, metadata) => done(metadata));
      });

    /** Wait for the encoder's queue to drain to `target`, using its own event. */
    const drainTo = (target: number): Promise<void> =>
      new Promise((resolve) => {
        const check = () => {
          if (!encoder || encoder.encodeQueueSize <= target) {
            encoder?.removeEventListener("dequeue", check);
            resolve();
          }
        };
        encoder!.addEventListener("dequeue", check);
        check();
      });

    video.playbackRate = PLAYBACK_RATE;
    await video.play();

    let frameIndex = 0;
    let lastTimestamp = -1;
    /**
     * How long each frame is shown, in microseconds.
     *
     * Required, not optional: a `VideoFrame` built without one produces an
     * `EncodedVideoChunk` whose `duration` is null, and the muxer rejects that
     * outright — which is what "addVideoChunkRaw's fourth argument (duration)
     * must be a non-negative real number" was.
     *
     * Only the final frame's value survives. mp4-muxer overwrites every other
     * sample's duration with the real gap to the sample after it, so this is a
     * placeholder everywhere except the end of the file — which is why the
     * previous interval is a good enough estimate, and why the nominal frame
     * rate is a reasonable seed for the very first frame.
     */
    const nominalFrameDuration = Math.round(1_000_000 / fps);
    let frameDuration = nominalFrameDuration;
    // The muxer requires the first sample of a track to sit at zero, and the
    // first frame the browser *presents* after play() is rarely the one at
    // mediaTime 0. Every video timestamp is taken relative to the first one
    // seen. The audio already starts at zero; the few milliseconds this shifts
    // the picture by are well inside lip-sync tolerance.
    let firstTimestamp: number | null = null;

    for (;;) {
      if (signal?.aborted) {
        throw new ShareExportError("cancelled", "Export cancelled");
      }
      const failedMidLoop = lastFailure();
      if (failedMidLoop) {
        throw new ShareExportError("encode", failedMidLoop.message);
      }

      const metadata = await nextPresentedFrame();
      if (!metadata) break;
      if (metadata.mediaTime > duration) break;

      // The browser can present the same frame twice around a seek or a stall.
      // Two frames at one timestamp make the muxer's timeline non-monotonic,
      // which produces a file that plays back stuttering or not at all.
      const absolute = Math.round(metadata.mediaTime * 1_000_000);
      if (absolute <= lastTimestamp) continue;
      // Measured rather than assumed: phone footage is regularly not the 30fps
      // the encoder is configured for, and a clip can be variable-rate.
      if (lastTimestamp >= 0) {
        const gap = absolute - lastTimestamp;
        if (Number.isFinite(gap) && gap > 0) frameDuration = gap;
      }
      lastTimestamp = absolute;
      firstTimestamp ??= absolute;
      const timestamp = absolute - firstTimestamp;

      ctx.drawImage(
        video,
        plan.sx,
        plan.sy,
        plan.sw,
        plan.sh,
        0,
        0,
        plan.width,
        plan.height,
      );
      drawOverlay(ctx, plan.width, plan.height, subject, strings);

      const frame = new VideoFrame(canvas, {
        timestamp,
        duration: frameDuration,
      });
      encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
      frame.close();
      frameIndex += 1;

      onProgress?.(Math.min(metadata.mediaTime / duration, 1));

      // Encoding is hardware-backed but not instant, and a phone playing a 4K
      // file can hand over frames faster than it can compress them. Left alone
      // the queue grows until memory does.
      if (encoder.encodeQueueSize > QUEUE_HIGH_WATER) {
        video.pause();
        await drainTo(QUEUE_LOW_WATER);
        // The clip may have ended during the pause — see `ended` above.
        if (ended || video.ended) break;
        await video.play();
      }
    }

    video.pause();
    await encoder.flush();
    const failedOnFlush = lastFailure();
    if (failedOnFlush) {
      throw new ShareExportError("encode", failedOnFlush.message);
    }
    if (frameIndex === 0) {
      throw new ShareExportError("decode", "No frames could be read from that video.");
    }

    muxer.finalize();
    onProgress?.(1);
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  } finally {
    // Closed on every exit, not only the successful one. A cancelled export
    // that left its encoder open held a hardware encoder instance and every
    // frame in its queue until the garbage collector got round to it — and a
    // phone has very few of those instances to give.
    if (encoder && encoder.state !== "closed") encoder.close();
    close();
  }
}
