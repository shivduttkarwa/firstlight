import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";

interface Ask {
  title: string;
  body?: ReactNode;
  confirm?: string;
  cancel?: string;
  /** Destructive: a red confirm, and focus starts on the safe choice. */
  danger?: boolean;
}

interface Pending extends Ask {
  resolve: (ok: boolean) => void;
}

const useConfirm = create<{ pending: Pending | null }>(() => ({ pending: null }));

/** The site's own confirm: `if (!(await ask({ title: "Remove it?" }))) return;` */
export function ask(options: Ask): Promise<boolean> {
  useConfirm.getState().pending?.resolve(false);
  return new Promise((resolve) => useConfirm.setState({ pending: { ...options, resolve } }));
}

/** Mounted once, above everything — including a sheet it may be asked from. */
export function ConfirmHost() {
  const pending = useConfirm((s) => s.pending);
  // Keep the last question on screen while the dialog animates away.
  const [shown, setShown] = useState<Pending | null>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pending) setShown(pending);
  }, [pending]);

  const answer = (ok: boolean) => {
    useConfirm.getState().pending?.resolve(ok);
    useConfirm.setState({ pending: null });
  };

  useEffect(() => {
    if (!pending) return;
    const opener = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Capture phase, and stop here: a sheet underneath must stay open.
        e.stopImmediatePropagation();
        answer(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        const next = document.activeElement === cancelBtn.current ? confirmBtn.current : cancelBtn.current;
        next?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const focus = setTimeout(() => (pending.danger ? cancelBtn : confirmBtn).current?.focus(), 30);
    return () => {
      clearTimeout(focus);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = scroll;
      opener?.focus?.({ preventScroll: true });
    };
  }, [pending]);

  return (
    <AnimatePresence>
      {pending && shown && (
        <>
          <motion.div
            className="scrim scrim--top"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => answer(false)}
          />
          <motion.div
            className="confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={shown.body ? "confirm-body" : undefined}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", damping: 32, stiffness: 420 }}
          >
            <span className={`confirm__mark${shown.danger ? " confirm__mark--danger" : ""}`} aria-hidden="true" />
            <h2 id="confirm-title" className="confirm__title">
              {shown.title}
            </h2>
            {shown.body && (
              <div id="confirm-body" className="confirm__body">
                {shown.body}
              </div>
            )}
            <div className="confirm__actions">
              <button ref={cancelBtn} className="btn btn--ghost btn--lg" onClick={() => answer(false)}>
                {shown.cancel ?? "Cancel"}
              </button>
              <button
                ref={confirmBtn}
                className={`btn btn--lg ${shown.danger ? "btn--danger-solid" : "btn--primary"}`}
                onClick={() => answer(true)}
              >
                {shown.confirm ?? "Continue"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
