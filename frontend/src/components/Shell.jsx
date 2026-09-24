import { motion } from "framer-motion";
import Nav from "./Nav.jsx";

/*
 * Wraps every signed-in page: the drifting background, the top bar, and a
 * gentle fade as each page arrives.
 */
function Shell({ title, subtitle, actions, children }) {
  return (
    <>
      <div className="aurora"><span /><span /><span /></div>
      <div className="grain" />

      <div className="app">
        <Nav />
        <motion.main
          className="page"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        >
          {title && (
            <div className="between" style={{ marginBottom: 4 }}>
              <div>
                <h1 className="page-title">{title}</h1>
                {subtitle && <p className="page-sub">{subtitle}</p>}
              </div>
              {actions}
            </div>
          )}
          {children}
        </motion.main>
      </div>
    </>
  );
}

export default Shell;
