/*
 * The pieces every page reuses: the card, the modal, toasts, the progress
 * rule, and a few date helpers.
 *
 * Motion here is deliberately small — 8px and 180ms. It tells you something
 * arrived; it does not put on a show.
 */
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, AlertTriangle } from "lucide-react";

const EASE = [0.22, 0.61, 0.36, 1];

/* ---------------------------------------------------------------- card */

export function Card({ children, className = "", delay = 0, ...rest }) {
  return (
    <motion.section
      className={"card " + className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.section>
  );
}

/* A card whose border firms up under the pointer. No lifting, no scaling. */
export function LinkCard({ children, className = "", delay = 0, ...rest }) {
  return (
    <motion.div
      className={"card " + className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ borderColor: "#aaa398" }}
      transition={{ duration: 0.28, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* --------------------------------------------------------------- modal */

export function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    function onKey(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" onClick={onClose}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}>
          <motion.div
            className={"modal" + (wide ? " modal-wide" : "")}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <div className="modal-head">
              <div>
                <div className="display" style={{ fontSize: 20 }}>{title}</div>
                {subtitle && <div className="faint tiny" style={{ marginTop: 3 }}>{subtitle}</div>}
              </div>
              <button className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Close"
                      style={{ alignSelf: "flex-start" }}>
                <X size={14} />
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

/* -------------------------------------------------------------- toasts */

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
            <motion.div key={item.id}
                        className={"toast" + (item.kind === "err" ? " toast-err" : "")}
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2, ease: EASE }}>
              {item.kind === "err"
                ? <AlertTriangle size={14} style={{ flex: "none", marginTop: 2 }} />
                : <Check size={14} style={{ flex: "none", marginTop: 2 }} />}
              <span>{item.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) || (() => {});
}

/* ---------------------------------------------------------------- bits */

/* A 2px rule that fills. Progress as a printed measure, not a candy bar. */
export function Bar({ percent }) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="bar">
      <motion.div className="bar-fill"
                  initial={{ width: 0 }} animate={{ width: safe + "%" }}
                  transition={{ duration: 0.55, ease: EASE }} />
    </div>
  );
}

/* The figure used on the syllabus cards: a number set in the serif, with a
   thin arc behind it. One ink colour, no gradient. */
export function Dial({ percent, size = 54 }) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  const stroke = 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke="var(--rule-firm)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none"
                       stroke="var(--ink)" strokeWidth={stroke * 2} strokeLinecap="butt"
                       strokeDasharray={circumference}
                       initial={{ strokeDashoffset: circumference }}
                       animate={{ strokeDashoffset: circumference * (1 - safe / 100) }}
                       transition={{ duration: 0.7, ease: EASE }} />
      </svg>
      <span style={{
        position: "absolute", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center", gap: 1,
      }}>
        <span className="display" style={{ fontSize: 16 }}>{Math.round(safe)}</span>
        <span className="measure-unit" style={{ fontSize: 9 }}>%</span>
      </span>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Spinner({ label = "Loading" }) {
  return (
    <div className="row faint" style={{ padding: 30, justifyContent: "center", gap: 9 }}>
      <motion.span style={{
        width: 11, height: 11, border: "1.5px solid var(--rule-firm)",
        borderTopColor: "var(--ink-3)", borderRadius: "50%", display: "block",
      }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }} />
      <span className="tiny">{label}</span>
    </div>
  );
}

/* "Santushti Betgeri" -> "SB" */
export function initials(name) {
  return (name || "").split(" ").filter(Boolean).slice(0, 2)
    .map((part) => part[0].toUpperCase()).join("");
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

/* Builds "2026-09-25" from local time. toISOString() would shift the date
   back a day for anyone east of UTC, ourselves included. */
export function asYearMonthDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

const DAY_NUMBER = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

/* The next date falling on a given weekday. */
export function nextDateFor(day) {
  const date = new Date();
  for (let i = 0; i < 7; i++) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() === DAY_NUMBER[day]) break;
  }
  return asYearMonthDay(date);
}
