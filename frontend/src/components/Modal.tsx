import { useEffect, useRef, type ReactNode } from "react";

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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // `showModal` makes the page behind inert but does not stop it scrolling,
  // which on a phone reads as the modal sliding around.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
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
      onClose={onClose}
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
