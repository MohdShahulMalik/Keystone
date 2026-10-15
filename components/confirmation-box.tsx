"use client";

import {
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import type { ResponseAction } from "@/lib/types/response";

export type ConfirmationBoxHandle = {
  open: () => void;
};

type ConfirmationBoxProps = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Close the dialog instantly on confirm and reopen it only if the action
   * fails — for slow server roundtrips (Neon cold starts) so the UI never
   * sits on a spinner. Failures still surface via role=alert on reopen. */
  dismissOnConfirm?: boolean;
  onConfirmAction: () =>
    | Promise<ResponseAction<unknown>>
    | Promise<void>
    | void;
  ref?: Ref<ConfirmationBoxHandle>;
};

export function ConfirmationBox({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  dismissOnConfirm = false,
  onConfirmAction: onConfirm,
  ref,
}: ConfirmationBoxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      open: () => dialogRef.current?.showModal(),
    }),
    [],
  );

  const closeDialog = () => {
    if (isPending) return;
    setError(null);
    dialogRef.current?.close();
  };

  const handleConfirm = async () => {
    if (dismissOnConfirm) {
      // Optimistic dismiss: close now so a slow roundtrip never blocks the
      // UI. The card behind already hid itself; on failure roll back by
      // reopening with the error.
      dialogRef.current?.close();
      setIsPending(true);
      setError(null);

      try {
        const result = (await onConfirm()) as
          | ResponseAction<unknown>
          | undefined;

        if (
          result &&
          typeof result === "object" &&
          "success" in result &&
          !result.success
        ) {
          setError((result as { error: string }).error);
          if (dialogRef.current && !dialogRef.current.open) {
            dialogRef.current.showModal();
          }
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        if (dialogRef.current && !dialogRef.current.open) {
          dialogRef.current.showModal();
        }
      } finally {
        setIsPending(false);
      }
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const result = (await onConfirm()) as ResponseAction<unknown> | void;

      if (
        result &&
        typeof result === "object" &&
        "success" in result &&
        !result.success
      ) {
        setError((result as { error: string }).error);
        return;
      }

      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirmation-box-title"
      aria-describedby="confirmation-box-message"
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-stroke bg-surface-700 p-0 text-foreground-900 shadow-2xl backdrop:bg-black/70"
      onCancel={(event) => {
        if (isPending) event.preventDefault();
        else setError(null);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div className="p-6">
        <h2
          id="confirmation-box-title"
          className="text-lg font-semibold text-foreground-900"
        >
          {title}
        </h2>
        <p
          id="confirmation-box-message"
          className="mt-2 text-sm leading-relaxed text-foreground-600"
        >
          {message}
        </p>

        {error ? (
          <p
            className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-foreground-600 transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={closeDialog}
            disabled={isPending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-400 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
