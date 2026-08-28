import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { signMediaUrls } from "../lib/storage";
import type Media from "../types/MediaType";
import Modal from "./Modal";
import Button from "./Button";
import { buildCardStrings } from "../lib/share/cardStrings";
import {
  detectCapabilities,
  type ShareCapabilities,
} from "../lib/share/capabilities";
import {
  canvasToBlob,
  deliver,
  renderCard,
  shareFilename,
} from "../lib/share/exportImage";
import { drawFrame, type PosterFrame } from "../lib/share/frame";
import { loadPhotoFrame } from "../lib/share/photoFrame";
import { recordShareEvent } from "../lib/share/recordShareEvent";
import { MAX_DURATION_SECONDS, ShareExportError } from "../lib/share/exportTypes";
import type {
  ShareFormat,
  ShareOutcome,
  ShareSubject,
} from "../lib/share/types";

/**
 * The share sheet.
 *
 * Three formats, because there are three things a climber might have. The card
 * is drawn from the log alone and needs nothing from them. The photo and the
 * video take the same overlay and put it on something they supplied — and the
 * photo is the one most of them can actually use, since photographing a send is
 * ordinary and filming one takes a partner and a plan. It was missing from the
 * first version, which offered a card to everyone and a video to the few.
 *
 * The subject — this climb, this visit, this month — is decided by the button
 * that opened the sheet, not chosen inside it. It used to be both: a segmented
 * control here repeated a choice the entry point had already made, and did it
 * asymmetrically, since a sheet opened from a climb could switch to the visit
 * but one opened from the visit could not pick a climb. One decision, made in
 * one place.
 *
 * Every export writes a `share_events` row, which is the only trace sharing
 * leaves on the server: everything here happens in this browser and goes
 * straight to the OS.
 *
 * Video goes through one more step than the other two. `navigator.share` only
 * works inside a user gesture, and a gesture is spent within seconds — long
 * before a forty-second encode finishes. So a video export ends in a "ready"
 * state with the file held in memory, and the climber taps once more to hand
 * it over. The still formats sidestep this by encoding during the preview, so
 * that pressing Share has nothing left to wait for.
 */

/**
 * The video pipeline, fetched on demand.
 *
 * It carries an MP4 muxer and the whole WebCodecs path, and none of it is
 * reachable until a climber has picked a video — so it must not ride along in
 * the chunk that renders a session, and the photo path must never touch it.
 * `import()` caches, so the second call after the preview is free.
 */
const loadVideoPipeline = () => import("../lib/share/videoExport");

/** The video still: redrawn on every slider tick, and never leaves the page. */
const VIDEO_PREVIEW_MIME = "image/jpeg";

/**
 * How long the share promise is given to answer for itself once the climber is
 * back in the app, before the handoff is taken as the answer. See the effect
 * that uses it.
 *
 * Long enough for a promise that resolves on the next tick after the page wakes
 * up, short enough that nobody watches an obsolete sheet sitting over their
 * session wondering whether the share worked.
 */
const HANDOFF_GRACE_MS = 400;

/** What each format produces, once it is time to hand a file over. */
const OUTPUT: Record<ShareFormat, { mime: string; extension: string }> = {
  // Flat colour and type, which is the case JPEG handles worst.
  image: { mime: "image/png", extension: "png" },
  // A photograph, which is the case it handles best.
  photo: { mime: "image/jpeg", extension: "jpg" },
  video: { mime: "video/mp4", extension: "mp4" },
};

/** The climber's own picture, and which kind it is. */
interface OverlaySource {
  blob: Blob;
  kind: "photo" | "video";
}

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  /** What this sheet shares. Fixed for its lifetime; see the note above. */
  subject: ShareSubject;
  /** Photos and videos already saved in the app against that same subject. */
  inAppMedia?: Media[];
}

/** A segmented control. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
  disabled?: boolean;
}) {
  if (options.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-1 p-1 rounded-lg bg-surface-container"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`flex-1 px-3 py-2 rounded-default text-label-md transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
            option.value === value
              ? "bg-primary text-on-primary"
              : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function ShareSheet({
  open,
  onClose,
  subject: incoming,
  inAppMedia = [],
}: ShareSheetProps) {
  const { t } = useTranslation("share");

  // Seeded once per mount. Both call sites render the sheet conditionally and
  // key it by what is being shared, so moving from one climb to the next is a
  // fresh instance — which is what stops the previously chosen picture being
  // carried over to a different climb, the overlay right and the photo wrong.
  const [format, setFormat] = useState<ShareFormat>("image");
  const [source, setSource] = useState<OverlaySource | null>(null);
  const [cropPortrait, setCropPortrait] = useState(false);
  const [cropOffset, setCropOffset] = useState(0.5);

  // null while the H.264 probe is still running. The Video segment is not
  // offered until it answers, so nobody is shown a format that then vanishes.
  const [capabilities, setCapabilities] = useState<ShareCapabilities | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  /**
   * The decoded still behind the overlay, or null.
   *
   * State, not a ref. It was a ref coordinated by a version counter, which is
   * a way of mutating something the render depends on without the render being
   * told — and the failure mode of getting that wrong is not an error, it is a
   * blank box and no explanation. A PosterFrame is a canvas and two numbers,
   * so there is nothing to dispose of and no reason for it not to be state.
   */
  const [poster, setPoster] = useState<PosterFrame | null>(null);
  /**
   * The card or overlaid photo, already encoded, waiting for a tap.
   *
   * `navigator.share` needs user activation, and Safari withdraws it across an
   * `await` — so encoding inside the click handler is exactly what makes a
   * share refusable. The preview has to produce this picture anyway, so the
   * same blob is kept and handed over synchronously when the button is pressed.
   */
  const [stillBlob, setStillBlob] = useState<Blob | null>(null);

  type Phase = "idle" | "loading" | "encoding" | "ready";
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // The underlying message, shown small under the friendly one. These failures
  // are device-specific and mostly happen on a phone with no console attached,
  // so the difference between "could not open" and "could not decode a frame"
  // has to reach the screen or it reaches nobody. Same reasoning as the
  // request id an ApiError carries for a 500.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  // The encoded video, waiting for the climber's second tap. Keyed by what it
  // was encoded from, so changing the crop invalidates it without an effect
  // having to notice.
  const [encoded, setEncoded] = useState<{ key: string; blob: Blob } | null>(null);

  const libraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  /** True from the instant the OS took the file until something answers for it. */
  const handedOff = useRef(false);
  /** Set once the sheet has said its piece, so it cannot say it twice. */
  const settled = useRef(false);

  /**
   * The subject, stabilised by value rather than by reference.
   *
   * Both call sites build it inside their own render, so its identity changes
   * on every render of the screen behind the sheet — and a session detail
   * re-renders on every query settle, every toast, every keystroke in an editor
   * above it. Deriving the preview from that identity would redraw and
   * `setPreview` each time, which is not a performance problem but a render
   * loop.
   *
   * Round-tripping through JSON gives a reference that only changes when the
   * data does. A subject is small, flat and made of primitives, so this costs
   * nothing measurable and needs no discipline from callers.
   */
  const subjectJson = JSON.stringify(incoming);
  const subject = useMemo<ShareSubject>(
    () => JSON.parse(subjectJson) as ShareSubject,
    [subjectJson],
  );

  const strings = useMemo(() => buildCardStrings(subject, t), [subject, t]);

  const medium = t(`medium.${format === "photo" ? "photo" : "video"}`);
  const wantsOverlay = format !== "image";
  const needsSource = wantsOverlay && source === null;
  // Nothing to draw yet: no picture chosen, or still decoding.
  const canDraw = !wantsOverlay || poster !== null;

  // Everything an encoded video depends on. A result whose key no longer
  // matches is stale and the buttons go back to encoding.
  const encodeKey = JSON.stringify({ subjectJson, cropPortrait, cropOffset });
  const ready = encoded !== null && encoded.key === encodeKey;

  const showError = useCallback(
    (err: unknown, mediumName: string) => {
      setErrorDetail(err instanceof Error ? err.message : String(err));
      if (err instanceof ShareExportError) {
        switch (err.reason) {
          case "cancelled":
            setError(null);
            setErrorDetail(null);
            return;
          case "unsupported":
            setError(t("video.unsupported"));
            return;
          case "decode":
            setError(t("source.decodeFailed", { medium: mediumName }));
            return;
          case "encode":
            setError(t("video.failed"));
            return;
        }
      }
      setError(t("error.generic"));
    },
    [t],
  );

  const clearError = () => {
    setError(null);
    setErrorDetail(null);
  };

  useEffect(() => {
    let current = true;
    void detectCapabilities().then((caps) => {
      if (current) setCapabilities(caps);
    });
    return () => {
      current = false;
    };
  }, []);

  /**
   * Decode the chosen picture, once per picture.
   *
   * A photo is decoded here and now — it is an `<img>` and a canvas. A video
   * needs the heavy module, which is why only this branch reaches for it.
   *
   * Under StrictMode this effect is mounted, torn down and mounted again, so
   * two decodes of the same blob overlap on the first run. `current` decides
   * which one is allowed to publish; the loser's canvas is simply dropped.
   */
  useEffect(() => {
    if (!source) return;

    let current = true;
    void (async () => {
      try {
        const next =
          source.kind === "photo"
            ? await loadPhotoFrame(source.blob)
            : await (await loadVideoPipeline()).loadPosterFrame(source.blob);
        if (!current) return;
        setPoster(next);
        clearError();
      } catch (err) {
        if (!current) return;
        // The previous picture must not stay up behind "where is the photo?" —
        // it would look like the failed one had loaded.
        setPoster(null);
        showError(err, t(`medium.${source.kind}`));
        setSource(null);
      } finally {
        if (current) setPhase("idle");
      }
    })();

    return () => {
      current = false;
    };
  }, [source, showError, t]);

  /**
   * Drop whatever is on screen, and the object URL behind it.
   *
   * Called from the handlers that invalidate a preview rather than from the
   * effect below. An effect that clears state it also produces is a cascading
   * render, and the events that make a preview wrong — switching format,
   * changing picture — are all things a person did.
   */
  const clearPreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    setStillBlob(null);
  };

  /** The three formats are three different pictures; never carry one over. */
  const changeFormat = (next: ShareFormat) => {
    setFormat(next);
    setSource(null);
    setPoster(null);
    setEncoded(null);
    clearPreview();
    clearError();
  };

  /** Forget the chosen picture, and anything made from it. */
  const clearSource = () => {
    setSource(null);
    setPoster(null);
    setEncoded(null);
    clearPreview();
  };

  /** Take a new picture, from whichever source. */
  const adoptSource = (blob: Blob) => {
    clearError();
    clearPreview();
    setPoster(null);
    setEncoded(null);
    setPhase("loading");
    setSource({ blob, kind: format === "photo" ? "photo" : "video" });
  };

  /**
   * Redraw the preview whenever anything it depends on moves.
   *
   * Scheduled on the next animation frame, and the schedule is cancelled by the
   * cleanup — so a slider that fires fifty changes a second produces one draw
   * per displayed frame rather than fifty competing ones. The draw itself is a
   * single `drawImage` from the already-decoded frame; the expensive decode
   * happened once, above.
   */
  useEffect(() => {
    if (!open || !canDraw) return;

    let cancelled = false;
    // Inside the frame callback rather than the effect body: this is a flag
    // about work that is about to start, and starting it is what schedules the
    // frame. Setting it up front would be a render that says "drawing" before
    // anything is.
    const handle = requestAnimationFrame(() => {
      setRendering(true);
      void (async () => {
        try {
          const canvas = wantsOverlay
            ? await drawFrame(
                poster!,
                subject,
                strings,
                cropPortrait ? "portrait" : "source",
                cropOffset,
              )
            : await renderCard(subject, strings);
          if (cancelled) return;

          // A still is encoded as the file it will be shared as, and shown from
          // that same blob. A video still is only ever looked at, so it stays a
          // cheap JPEG and the real file is made later.
          const isVideo = format === "video";
          const blob = await canvasToBlob(
            canvas,
            isVideo ? VIDEO_PREVIEW_MIME : OUTPUT[format].mime,
          );
          if (cancelled) return;

          setStillBlob(isVideo ? null : blob);
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          const url = URL.createObjectURL(blob);
          previewUrlRef.current = url;
          setPreview(url);
        } catch (err) {
          if (cancelled) return;
          setPreview(null);
          showError(err, medium);
        } finally {
          if (!cancelled) setRendering(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
      // A draw that is abandoned after it started would otherwise leave the
      // skeleton up with nothing on its way to replace it.
      setRendering(false);
    };
  }, [
    open,
    subject,
    strings,
    format,
    wantsOverlay,
    canDraw,
    poster,
    cropPortrait,
    cropOffset,
    medium,
    showError,
  ]);

  // Everything the sheet holds that outlives a render: an encode in flight and
  // an object URL. Released when the sheet goes away by any route — Escape and
  // the backdrop included, which the Cancel button is not.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so that picking the same file twice in a row still fires change.
    event.target.value = "";
    if (!file) return;
    adoptSource(file);
  };

  /**
   * Pull a picture the climber already uploaded back down from storage.
   *
   * This is the one source that can fail for a reason they cannot act on: the
   * bytes have to be *read* into a canvas, which needs CORS headers on the
   * bucket that displaying a thumbnail never did. Reported with its own message
   * rather than the decode one, because the fix is different — choose the file
   * from the library, where no fetch is involved.
   */
  const loadFromApp = async (item: Media) => {
    setPhase("loading");
    clearError();
    try {
      const urls = await signMediaUrls([item]);
      const url = urls[item.storage_path];
      // signMediaUrls swallows its own failures and answers {} — right for a
      // thumbnail strip, ambiguous here, so the two cases are named apart.
      if (!url) throw new Error("the server did not sign that file");
      const response = await fetch(url, {
        // Without this a stalled request leaves the sheet loading forever, and
        // "nothing happened" is the hardest kind of failure to report.
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from storage`);
      adoptSource(await response.blob());
    } catch (err) {
      setError(t("source.fetchFailed", { medium }));
      setErrorDetail(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  };

  /**
   * The file is gone: count it, say so, and take the sheet off the screen.
   *
   * Runs at most once per sheet, because on iOS it can be reached from two
   * directions — the share promise settling, and the climber returning from the
   * app they shared to — and whichever is second must not toast twice or write
   * a second `share_events` row.
   */
  const settle = useCallback(
    (outcome: ShareOutcome) => {
      if (settled.current) return;
      settled.current = true;
      handedOff.current = false;
      recordShareEvent(subject.template, format, outcome);
      toast.success(t(outcome === "shared" ? "toast.shared" : "toast.saved"));
      onClose();
    },
    [format, onClose, subject.template, t],
  );

  /**
   * Coming back to the app after the file left it.
   *
   * `navigator.share` is documented as resolving once the file has been handed
   * over, and on a desktop it does. On iOS the page is suspended the moment the
   * chosen app comes to the front, and the promise very often never settles
   * after that — so the code below the `await` in `finish` never runs, and the
   * climber returns to the sheet they shared from, still open over their
   * session as though nothing had happened. Nothing had, as far as this page
   * knows.
   *
   * The handoff is the reliable fact. The OS does not switch apps for a share
   * that did not happen, so returning to a page that is still waiting on one is
   * enough to call it done.
   *
   * The delay is for the ordinary case where the promise *does* settle a moment
   * after the page wakes up: it clears `handedOff` and this stands down. It
   * also covers the reverse race, a share sheet dismissed without choosing
   * anything — that rejects with AbortError, which arrives well inside the
   * grace period and must not be counted as a share.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onReturn = () => {
      if (document.visibilityState !== "visible" || !handedOff.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (handedOff.current) settle("shared");
      }, HANDOFF_GRACE_MS);
    };

    // Two ways of hearing the same thing. `visibilitychange` is the one that
    // describes what happened; iOS has a long history of not firing it when a
    // home-screen app comes back to the front, and window focus is what it does
    // fire. Both are harmless outside a handoff, which is the only window in
    // which either is listened to for anything.
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [settle]);

  /** Hand a finished file over and count it. */
  const finish = async (blob: Blob, intent: ShareOutcome) => {
    const { mime, extension } = OUTPUT[format];
    const { outcome, shareError } = await deliver(
      blob,
      shareFilename(subject, extension),
      mime,
      intent,
      () => {
        handedOff.current = true;
      },
    );
    // An answer arrived, so the fallback above has nothing left to answer for —
    // including when the answer is "they changed their mind".
    handedOff.current = false;

    // null is the climber dismissing the OS share sheet. Counting that as a
    // share would make an unpopular format look used.
    if (!outcome) return;

    if (shareError) {
      // The file was saved, but not where they asked for it. Left on screen
      // rather than closed behind a success toast: on iOS the download
      // fallback is frequently a no-op, so "saved" alone could be a lie. A
      // still can at least be rescued by long-pressing the preview, which is
      // still on screen — a video cannot, so the two say different things.
      recordShareEvent(subject.template, format, outcome);
      setError(
        t(format === "video" ? "error.shareRefusedVideo" : "error.shareRefusedStill"),
      );
      setErrorDetail(shareError.message);
      return;
    }
    settle(outcome);
  };

  /**
   * The card and the overlaid photo. Delivered from the blob the preview
   * already produced, so that nothing is awaited between the tap and
   * `navigator.share` — see deliver().
   */
  const runStill = async (intent: ShareOutcome) => {
    if (!stillBlob) return;
    clearError();
    try {
      await finish(stillBlob, intent);
    } catch (err) {
      showError(err, medium);
    }
  };

  /** The video, first half: encode and hold. The gesture is spent by the end. */
  const encodeVideo = async () => {
    if (!source) return;
    clearError();
    setProgress(0);
    setPhase("encoding");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { exportVideoWithOverlay } = await loadVideoPipeline();
      const blob = await exportVideoWithOverlay({
        source: source.blob,
        subject,
        strings,
        crop: cropPortrait ? "portrait" : "source",
        cropOffset,
        onProgress: setProgress,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setEncoded({ key: encodeKey, blob });
      setPhase("ready");
    } catch (err) {
      if (controller.signal.aborted) return;
      showError(err, medium);
      setPhase("idle");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (controller.signal.aborted) setPhase("idle");
      setProgress(0);
    }
  };

  /** The video, second half: a fresh tap, so the share sheet may open. */
  const deliverVideo = async (intent: ShareOutcome) => {
    if (!encoded) return;
    clearError();
    try {
      await finish(encoded.blob, intent);
    } catch (err) {
      showError(err, medium);
    }
  };

  const busy = phase === "loading" || phase === "encoding";
  const offeredInApp = inAppMedia.filter(
    (item) => item.kind === (format === "photo" ? "photo" : "video"),
  );
  // Named for where the file is, like the two buttons above it — the climb or
  // visit it belongs to is already what this whole sheet is about.
  const inAppLabel = t("source.inApp");

  const formats: { value: ShareFormat; label: string }[] = [
    { value: "image", label: t("format.image") },
    { value: "photo", label: t("format.photo") },
    // Offered only where it can actually finish; see capabilities.ts.
    ...(capabilities?.video
      ? [{ value: "video" as const, label: t("format.video") }]
      : []),
  ];

  return (
    <Modal open={open} onClose={onClose} title={t("title")} size="lg">
      <div className="flex flex-col gap-4">
        {/* First, not last. This used to sit above the buttons, which put it
            below a 46vh preview and off the bottom of a phone screen — so a
            failure looked like the button doing nothing at all. */}
        {error && (
          <div className="flex flex-col gap-1 rounded-lg border border-error/40 bg-error-container/40 p-3">
            <p className="text-body-sm text-on-error-container">{error}</p>
            {errorDetail && (
              <p className="text-label-sm text-on-surface-variant break-words">
                {errorDetail}
              </p>
            )}
          </div>
        )}

        <Segmented
          label={t("format.label")}
          value={format}
          onChange={changeFormat}
          disabled={busy}
          options={formats}
        />

        <div className="flex justify-center">
          {preview ? (
            <img
              src={preview}
              alt=""
              className={`max-h-[46vh] w-auto rounded-lg shadow-lg transition-opacity ${
                rendering ? "opacity-60" : ""
              }`}
            />
          ) : rendering || phase === "loading" ? (
            <div className="h-[46vh] w-full max-w-xs rounded-lg bg-surface-container animate-pulse" />
          ) : (
            <div className="h-[46vh] w-full max-w-xs rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant text-body-sm px-6 text-center">
              {needsSource
                ? t(format === "photo" ? "format.photoHint" : "format.videoHint")
                : null}
            </div>
          )}
        </div>

        {needsSource && (
          <div className="flex flex-col gap-2">
            <p className="text-body-sm text-on-surface-variant">
              {t("source.where", { medium })}
            </p>
            {capabilities?.camera && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => cameraInput.current?.click()}
              >
                {t("source.take")}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => libraryInput.current?.click()}
            >
              {t("source.library")}
            </Button>
            {offeredInApp.map((item, index) => (
              <Button
                key={item.media_id}
                variant="secondary"
                disabled={busy}
                onClick={() => void loadFromApp(item)}
              >
                {offeredInApp.length > 1
                  ? t("source.inAppNumbered", { label: inAppLabel, n: index + 1 })
                  : inAppLabel}
              </Button>
            ))}
          </div>
        )}

        {wantsOverlay && source && phase !== "encoding" && (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-body-sm text-on-surface">
              <input
                type="checkbox"
                checked={cropPortrait}
                disabled={busy}
                onChange={(event) => setCropPortrait(event.target.checked)}
                className="size-4 accent-primary"
              />
              {t("crop.toggle")}
              <span className="text-on-surface-variant">{t("crop.hint")}</span>
            </label>

            {cropPortrait && (
              <label className="flex items-center gap-3 text-body-sm text-on-surface-variant">
                {t("crop.position")}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={cropOffset}
                  disabled={busy}
                  onChange={(event) => setCropOffset(Number(event.target.value))}
                  className="flex-1 accent-primary"
                />
              </label>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={clearSource}
              className="self-start text-label-md text-primary hover:underline cursor-pointer disabled:opacity-50"
            >
              {t("source.change", { medium })}
            </button>

            {format === "video" && (
              <p className="text-label-sm text-on-surface-variant">
                {t("video.tooLong", { seconds: MAX_DURATION_SECONDS })}
              </p>
            )}
          </div>
        )}

        {phase === "encoding" && (
          <div className="flex flex-col gap-2">
            <div className="h-2 rounded-full bg-surface-container overflow-hidden">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-label-sm text-on-surface-variant">
              {t("video.processing")} — {t("video.processingHint")}
            </p>
            <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
              {t("video.cancel")}
            </Button>
          </div>
        )}

        {ready && format === "video" && (
          <p className="text-body-sm text-primary">{t("video.ready")}</p>
        )}

        {capabilities && !capabilities.video && (
          <p className="text-label-sm text-on-surface-variant">
            {t("video.unsupported")}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          {format !== "video" ? (
            <>
              <Button
                variant="secondary"
                disabled={busy || !stillBlob}
                onClick={() => void runStill("saved")}
              >
                {t("action.save")}
              </Button>
              <Button
                disabled={busy || !stillBlob}
                onClick={() => void runStill("shared")}
              >
                {t("action.share")}
              </Button>
            </>
          ) : ready ? (
            <>
              <Button variant="secondary" onClick={() => void deliverVideo("saved")}>
                {t("action.save")}
              </Button>
              <Button onClick={() => void deliverVideo("shared")}>
                {t("action.shareNow")}
              </Button>
            </>
          ) : (
            <Button disabled={busy || needsSource} onClick={() => void encodeVideo()}>
              {phase === "encoding" ? t("action.preparing") : t("action.share")}
            </Button>
          )}
        </div>

        {/* Two inputs rather than one: `capture` is what opens the OS camera
            straight away, and an input carrying it can no longer offer the
            library on iOS. `accept` follows the chosen format. */}
        <input
          ref={cameraInput}
          type="file"
          accept={format === "photo" ? "image/*" : "video/*"}
          capture="environment"
          onChange={pickFile}
          className="hidden"
        />
        <input
          ref={libraryInput}
          type="file"
          accept={format === "photo" ? "image/*" : "video/*"}
          onChange={pickFile}
          className="hidden"
        />
      </div>
    </Modal>
  );
}
