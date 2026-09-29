import { motion } from "framer-motion";
import Nav from "./Nav.jsx";

/* Every signed-in page: the top bar, a ruled page header, a short arrival. */
export default function Shell({ eyebrow, title, subtitle, actions, children, wide }) {
  return (
    <div className="app">
      <Nav />
      <motion.main className={"page" + (wide ? " page-wide" : "")}
                   initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                   transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}>
        {title && (
          <header className="page-head between" style={{ alignItems: "flex-end" }}>
            <div>
              {eyebrow && <div className="eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
              <h1 className="page-title">{title}</h1>
              {subtitle && <p className="page-sub">{subtitle}</p>}
            </div>
            {actions}
          </header>
        )}
        {children}
      </motion.main>
    </div>
  );
}
