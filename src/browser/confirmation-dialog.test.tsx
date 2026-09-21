import { useRef, useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmationDialog } from "./confirmation-dialog";

function ConfirmationDialogHarness({
  onConfirm = () => undefined,
}: {
  readonly onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button onClick={() => setOpen(true)} ref={triggerRef} type="button">
        Remove local data
      </button>

      {open ? (
        <ConfirmationDialog
          confirmLabel="Remove data"
          description="This permanently removes the local test data."
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            onConfirm();
            setOpen(false);
          }}
          returnFocusRef={triggerRef}
          title="Remove local data?"
        />
      ) : null}
    </>
  );
}

describe("ConfirmationDialog accessibility", () => {
  it("moves initial focus to the least destructive action", () => {
    render(<ConfirmationDialogHarness />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove local data",
      }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Remove local data?",
    });

    expect(
      within(dialog).getByRole("button", {
        name: "Cancel",
      }),
    ).toHaveFocus();
  });

  it("wraps Tab from the last action back to Cancel", () => {
    render(<ConfirmationDialogHarness />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove local data",
      }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Remove local data?",
    });

    const cancel = within(dialog).getByRole("button", {
      name: "Cancel",
    });

    const confirm = within(dialog).getByRole("button", {
      name: "Remove data",
    });

    confirm.focus();
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(confirm, {
      key: "Tab",
    });

    expect(cancel).toHaveFocus();
  });

  it("wraps Shift+Tab from Cancel back to the last action", () => {
    render(<ConfirmationDialogHarness />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove local data",
      }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Remove local data?",
    });

    const cancel = within(dialog).getByRole("button", {
      name: "Cancel",
    });

    const confirm = within(dialog).getByRole("button", {
      name: "Remove data",
    });

    expect(cancel).toHaveFocus();

    fireEvent.keyDown(cancel, {
      key: "Tab",
      shiftKey: true,
    });

    expect(confirm).toHaveFocus();
  });

  it("closes on Escape and returns focus to the invoking control", () => {
    render(<ConfirmationDialogHarness />);

    const trigger = screen.getByRole("button", {
      name: "Remove local data",
    });

    fireEvent.click(trigger);

    const dialog = screen.getByRole("alertdialog", {
      name: "Remove local data?",
    });

    fireEvent.keyDown(dialog, {
      key: "Escape",
    });

    expect(
      screen.queryByRole("alertdialog", {
        name: "Remove local data?",
      }),
    ).not.toBeInTheDocument();

    expect(trigger).toHaveFocus();
  });

  it("returns focus to the invoking control after confirmation when no later workflow target is supplied", () => {
    const onConfirm = vi.fn();

    render(<ConfirmationDialogHarness onConfirm={onConfirm} />);

    const trigger = screen.getByRole("button", {
      name: "Remove local data",
    });

    fireEvent.click(trigger);

    const dialog = screen.getByRole("alertdialog", {
      name: "Remove local data?",
    });

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Remove data",
      }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });
});
