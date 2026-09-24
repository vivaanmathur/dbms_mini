import { motion } from "framer-motion";
import Nav from "./Nav.jsx";

/* Wraps every signed-in page: the top bar, a ruled page header, and a short
   fade as the page arrives. */
function Shell({ title, subtitle, actions, children }) {
  return (
    <div className="app">
      <Nav />
      <motion.main className="page"
                   initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                   transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}>
        {title && (
          <header className="page-head between" style={{ alignItems: "flex-end" }}>
            <div>
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

export default Shell;
