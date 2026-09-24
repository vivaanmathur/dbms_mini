import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { THEMES, getTheme, applyTheme } from "../theme.js";

/* The palette control in the top bar. */
function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(getTheme());
  const box = useRef(null);

  // close when the pointer goes elsewhere, or on Escape
  useEffect(() => {
    function away(event) {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    }
    function key(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, []);

  function choose(id) {
    applyTheme(id, true);
    setCurrent(id);
    setOpen(false);
  }

  const showing = THEMES.find((t) => t.id === current) || THEMES[0];

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button className="swatch-btn" onClick={() => setOpen(!open)}
              aria-haspopup="menu" aria-expanded={open} title="Colour scheme">
        <span className="swatch-row">
          {showing.swatches.map((colour, i) => (
            <span key={i} style={{ background: colour, border: "1px solid var(--rule-firm)" }} />
          ))}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }}
                     style={{ fontSize: 8, color: "var(--ink-3)", lineHeight: 1 }}>
          ▼
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div className="theme-menu" role="menu"
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
            <div className="label" style={{ padding: "11px 12px 7px" }}>Colour scheme</div>

            {THEMES.map((theme, index) => (
              <motion.button key={theme.id} role="menuitem"
                             className={"theme-item" + (theme.id === current ? " theme-item-on" : "")}
                             onClick={() => choose(theme.id)}
                             initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                             transition={{ delay: 0.03 + index * 0.025, duration: 0.2 }}>
                <span className="swatch-row">
                  {theme.swatches.map((colour, i) => (
                    <span key={i} style={{ background: colour, border: "1px solid var(--rule-firm)" }} />
                  ))}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {theme.name}
                  <span className="faint" style={{ fontWeight: 400 }}> · {theme.note}</span>
                </span>
                {theme.id === current && <Check size={13} />}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ThemePicker;
