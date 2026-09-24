/*
 * The small building blocks every page reuses: glass panels, the modal, the
 * toast messages, progress bars and a few odds and ends.
 */
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, AlertCircle } from "lucide-react";

/* ---------------------------------------------------------------- panels */

export function Glass({ children, className = "", delay = 0, ...rest }) {
  return (
    <motion.div
      className={"glass " + className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* A card that lifts slightly when the pointer is over it. */
export function HoverCard({ children, className = "", delay = 0, ...rest }) {
  return (
    <motion.div
      className={"glass " + className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- modal */

export function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  // Escape should close the dialog, the way every other app behaves.
  useEffect(() => {
    if (!open) return;
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className={"modal" + (wide ? " modal-wide" : "")}
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", stiffness: 330, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head between">
              <div>
                <div style={{ fontWeight: 800, fontSize: 16.5, letterSpacing: "-0.3px" }}>{title}</div>
                {subtitle && <div className="muted tiny" style={{ marginTop: 2 }}>{subtitle}</div>}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
                <X size={15} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------- toasts */

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((text, kind = "ok") => {
    const id = Date.now() + Math.random();
    setItems((old) => [...old, { id, text, kind }]);
    setTimeout(() => setItems((old) => old.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              className={"toast " + (item.kind === "err" ? "toast-err" : "toast-ok")}
              initial={{ opacity: 0, x: 60, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            >
              {item.kind === "err"
                ? <AlertCircle size={16} color="#fb7185" style={{ flex: "none", marginTop: 1 }} />
                : <CheckCircle2 size={16} color="#34d399" style={{ flex: "none", marginTop: 1 }} />}
              <span>{item.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/* Any page can call:  const toast = useToast();  toast("Saved"); */
export function useToast() {
  const push = useContext(ToastContext);
  return push || (() => {});
}

/* ---------------------------------------------------------------- bits */

export function Bar({ percent }) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="bar">
      <motion.div
        className="bar-fill"
        initial={{ width: 0 }}
        animate={{ width: safe + "%" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/* The circular percentage used on the syllabus cards. */
export function Ring({ percent, size = 58, stroke = 5 }) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} style={{ flex: "none", transform: "rotate(-90deg)" }}>
      <defs>
        <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="55%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="url(#ring-grad)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - safe / 100) }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Spinner({ label = "Loading" }) {
  return (
    <div className="row faint" style={{ padding: 26, justifyContent: "center", gap: 10 }}>
      <motion.div
        style={{ width: 16, height: 16, borderRadius: "50%",
                 border: "2px solid rgba(255,255,255,0.16)", borderTopColor: "#a855f7" }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
      />
      <span className="tiny">{label}...</span>
    </div>
  );
}

/* Turns "Santushti Betgeri" into "SB" for the little avatar squares. */
export function initials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* "2026-09-25" -> "25 Sep" */
export function shortDate(text) {
  if (!text) return "";
  const parts = String(text).split("-");
  if (parts.length < 3) return text;
  return Number(parts[2]) + " " + MONTHS[Number(parts[1]) - 1];
}

/* Builds "2026-09-25" from a Date using local time. Using toISOString() here
   would shift the date back a day for anyone east of UTC, including us. */
export function asYearMonthDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

const DAY_NUMBER = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

/* The next date that falls on a given weekday, so the teacher does not have
   to go hunting through a calendar for "the next Wednesday". */
export function nextDateFor(day) {
  const date = new Date();
  for (let i = 0; i < 7; i++) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() === DAY_NUMBER[day]) break;
  }
  return asYearMonthDay(date);
}
