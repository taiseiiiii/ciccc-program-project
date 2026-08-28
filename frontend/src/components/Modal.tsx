import { useLayoutEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  /** Called on Escape, on a backdrop click, and by the close button. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons along the bottom. Laid out by the caller. */
  footer?: ReactNode;
  /** Roughly how much content it holds. */
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const WIDTHS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  // For a list of things to choose between, where lg forces every row to wrap.
  "2xl": "max-w-2xl",
} as const;

/**
 * How many modals are up right now.
 *
 * The scroll lock below used to be a snapshot: each modal read
 * `body.style.overflow` as it opened and put that value back as it closed.
 * That is right for one modal and wrong for two, and this app stacks them —
 * the share sheet over a session, a delete confirmation over an editor. If the
 * outer one unmounts first it restores "" and the inner one then restores
 * "hidden", leaving the page scroll-locked with no modal on screen to unlock
 * it. Counting makes the last one out win, whatever order they leave in.
 */
let openModalCount = 0;

/**
 * The app's one modal.
 *
 * There used to be four of these, hand-rolled as `fixed inset-0` divs — the
 * goal editor, the delete confirmation, the route editor and the injury form.
 * None of them had a role, a focus trap, an Escape handler or a scroll lock, so
 * keyboard focus walked straight out into the page behind and on a phone the
 * background scrolled under the overlay.
 *
 * Built on the native `<dialog>`, which gives all four of those for free:
 * `showModal()` puts the element in the top layer, makes everything behind it
 * inert, traps focus and handles Escape. What is left to do by hand is the
 * backdrop click and the body scroll lock, both below.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // useLayoutEffect, not useEffect, and that is the whole point of it.
  //
  // Some callers close a modal by unmounting it rather than by flipping `open`
  // — the share sheet does exactly that, taking itself off screen the moment a
  // share completes, and so does the climb editor. An open `<dialog>` that is
  // torn out of the document is in a state the platform is not obliged to
  // clean up after, and Safari does not: the panel stays composited over
  // everything — a near-white `bg-surface` sheet filling a phone screen — and
  // the document stays inert behind it, so nothing responds to a tap.
  // Installed to the home screen there is no address bar and no reload, so the
  // only way out is to force-quit the app. That is the "share, then restart
  // the app" report.
  //
  // `close()` is the supported way off the top layer, but it only counts while
  // the element is still in the document. A passive cleanup is too late: React
  // runs those for a deleted subtree after the commit that removed its DOM
  // nodes, so the previous attempt at this fix was closing a dialog that had
  // already been detached — which is precisely the case it was meant to catch.
  // A layout cleanup runs inside the mutation phase, before the node is
  // removed, so the dialog leaves the top layer the supported way every time.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();

    // A no-op for every caller that already flipped `open`.
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  // `showModal` makes the page behind inert but does not stop it scrolling,
  // which on a phone reads as the modal sliding around.
  //
  // Layout-phase for the same reason as above: the lock is released in the same
  // commit that takes the dialog off the top layer, rather than in a passive
  // pass that a backgrounded page — an OS share sheet is exactly that — may not
  // reach for some time. The two must not come apart, or the page is left
  // unscrollable with nothing on screen to explain it.
  useLayoutEffect(() => {
    if (!open) return;
    openModalCount += 1;
    document.body.style.overflow = "hidden";
    return () => {
      openModalCount -= 1;
      if (openModalCount === 0) document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${title}-heading`}
      // Escape fires `cancel`; let the parent own the open state rather than
      // letting the dialog close itself behind React's back.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // `close` fires for `dialog.close()` as well as for the user, so a parent
      // that hides a modal by flipping `open` used to hear its own state change
      // back as a dismissal. That is what closed a session out from under its
      // climb editor: the editor renders only while the session is open, so the
      // detail modal closing itself took the editor down with it and left the
      // "which climb" state pointing at the previous one.
      //
      // The guard reads the prop straight from this render's closure. The event
      // is queued rather than dispatched inline, so by the time it arrives the
      // effect above has committed and `open` is already false — which is
      // precisely the case where nobody needs telling.
      onClose={() => {
        if (open) onClose();
      }}
      // A click that lands on the dialog element itself — rather than on the
      // panel inside it — is a click on the backdrop.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${WIDTHS[size]} max-h-[90vh] overflow-y-auto rounded-2xl border border-outline-variant bg-surface p-0 text-on-surface shadow-xl backdrop:bg-black/60 backdrop:backdrop-blur-sm`}
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-center justify-between gap-4 border-b border-outline-variant pb-3">
          <h2
            id={`${title}-heading`}
            className="text-headline-sm font-bold text-on-surface"
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 cursor-pointer rounded-lg p-1 text-on-surface-variant hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          >
            ✕
          </button>
        </div>

        <div>{children}</div>

        {footer && <div className="flex items-center justify-between gap-3">{footer}</div>}
      </div>
    </dialog>
  );
}
