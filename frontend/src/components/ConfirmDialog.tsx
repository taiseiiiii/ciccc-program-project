import { useTranslation } from "react-i18next";
import Button from "./Button";
import Modal from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  /** What is about to happen, and what it costs. Be specific. */
  message: string;
  /** The verb, not "OK" — a button should say what it does. */
  confirmLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
}

/**
 * One confirmation dialog for every destructive action.
 *
 * Deleting a goal used to ask; deleting an injury — and its whole pain history
 * — did not, and neither did deleting a saved AI report, which cannot be
 * regenerated identically and may have the climber's own notes attached. The
 * rule now is simple: anything that destroys data the user cannot recreate
 * goes through here.
 */
export default function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isPending = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  // Defaults resolved here rather than as parameter defaults, so they follow
  // the active language instead of freezing at module load.
  const confirm = confirmLabel ?? t("action.delete");
  const cancel = cancelLabel ?? t("action.cancel");

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            {cancel}
          </Button>
          <Button variant="error" onClick={onConfirm} disabled={isPending}>
            {isPending ? `${confirm}...` : confirm}
          </Button>
        </>
      }
    >
      <p className="text-on-surface-variant">{message}</p>
    </Modal>
  );
}
