import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { useToasts } from "../store/useStore";

/* ── Icons ─────────────────────────────────────────────────────────── */

/* width/height are attributes, not styles, so any CSS rule still overrides them —
   they only stop an unsized icon stretching to fill whatever flex box it lands in. */
const S = {
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icon = {
  home: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  shop: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M4 8h16l-1 12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  ),
  basket: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M3 9h18l-1.7 10.2a2 2 0 0 1-2 1.8H6.7a2 2 0 0 1-2-1.8z" />
      <path d="M8.5 9 12 3l3.5 6M9.5 13.5v3M14.5 13.5v3" />
    </svg>
  ),
  user: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  route: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 6H15a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 0 0 0 7h6.5" />
    </svg>
  ),
  people: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.2a3.4 3.4 0 0 1 0 5.6M17.5 14.4A6.5 6.5 0 0 1 21.5 20" />
    </svg>
  ),
  box: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </svg>
  ),
  more: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  back: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  close: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  chev: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  ),
  arrow: () => (
    <svg viewBox="0 0 24 24" {...S} width="16" height="16">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  ),
  tick: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M4.5 12.5 9 17 19.5 6.5" />
    </svg>
  ),
  plus: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  sun: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  ),
  wallet: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" />
      <path d="M3 7.5v10A2.5 2.5 0 0 0 5.5 20H19a1 1 0 0 0 1-1v-3" />
      <path d="M21 10.5h-4a2 2 0 0 0 0 4h4z" />
    </svg>
  ),
  phone: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M6.5 3h4l1.5 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 1.5v4a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3z" />
    </svg>
  ),
  pin: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  ),
  calendar: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  pencil: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </svg>
  ),
  search: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  ),
  refresh: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M20 11a8 8 0 1 0-.6 4" />
      <path d="M20 5v6h-6" />
    </svg>
  ),
  copy: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="9" y="9" width="11" height="12" rx="1.5" />
      <path d="M15 6.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1.5" />
    </svg>
  ),
};

/* ── Motion helpers ────────────────────────────────────────────────── */

export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function PageFade({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      // Exit is deliberately much shorter than enter: with mode="wait" the two
      // run back to back, and a slow exit is dead time on a tab switch.
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1], exit: { duration: 0.1 } }}
    >
      {children}
    </motion.div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </motion.svg>
  );
}

/* ── Sheet ─────────────────────────────────────────────────────────── */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 340 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 700) onClose();
            }}
          >
            <div className="sheet__grip" />
            {title && (
              <div className="sheet__head">
                <h2 className="sheet__title">{title}</h2>
                <button className="iconbtn" onClick={onClose} aria-label="Close">
                  <Icon.close />
                </button>
              </div>
            )}
            <div className="sheet__body">{children}</div>
            {footer && <div style={{ padding: "0 var(--pad) var(--sp-5)" }}>{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Toaster ───────────────────────────────────────────────────────── */

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast${t.kind === "error" ? " toast--err" : ""}`}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
          >
            <span style={{ width: 16, height: 16, display: "grid", placeItems: "center" }}>
              {t.kind === "error" ? <Icon.close /> : <Icon.tick />}
            </span>
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ── States ────────────────────────────────────────────────────────── */

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeletons({ count = 3, height = 84 }: { count?: number; height?: number }) {
  return (
    <div className="stack flow-sm">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel" style={{ height }} />
      ))}
    </div>
  );
}
