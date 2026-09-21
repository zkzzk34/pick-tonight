import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";

interface ConfirmationDialogProps {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly getConfirmedFocus?: () => HTMLElement | null;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
  getConfirmedFocus,
  returnFocusRef,
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const invokingElementRef = useRef<HTMLElement | null>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const activeElement = document.activeElement;

    invokingElementRef.current =
      returnFocusRef.current ??
      (activeElement instanceof HTMLElement ? activeElement : null);

    if (dialog !== null && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute("open", "");
        }
      } else {
        dialog.setAttribute("open", "");
      }
    }

    cancelRef.current?.focus();

    return () => {
      if (dialog?.open) {
        if (typeof dialog.close === "function") {
          try {
            dialog.close();
          } catch {
            dialog.removeAttribute("open");
          }
        } else {
          dialog.removeAttribute("open");
        }
      }

      const focusTarget = confirmedRef.current
        ? (getConfirmedFocus?.() ?? invokingElementRef.current)
        : invokingElementRef.current;

      focusTarget?.focus();
    };
  }, [getConfirmedFocus, returnFocusRef]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Tab") {
      const firstFocusable = cancelRef.current;
      const lastFocusable = confirmRef.current;
      const activeElement = document.activeElement;

      if (firstFocusable === null || lastFocusable === null) {
        return;
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
        return;
      }

      if (
        activeElement instanceof HTMLElement &&
        !dialogRef.current?.contains(activeElement)
      ) {
        event.preventDefault();

        if (event.shiftKey) {
          lastFocusable.focus();
        } else {
          firstFocusable.focus();
        }
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  const confirm = () => {
    confirmedRef.current = true;
    onConfirm();
  };

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="confirmation-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
      role="alertdialog"
    >
      <div className="confirmation-dialog__body">
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
      </div>
      <div className="confirmation-dialog__actions">
        <button onClick={onCancel} ref={cancelRef} type="button">
          Cancel
        </button>
        <button
          className="confirmation-dialog__confirm"
          onClick={confirm}
          ref={confirmRef}
          type="button"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
