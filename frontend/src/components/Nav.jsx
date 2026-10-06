import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, KeyRound, LogOut } from "lucide-react";
import { dashboardsFor, hasRole, oversees, useAuth } from "../auth.jsx";
import { initials } from "../ui.jsx";
import ThemePicker from "./ThemePicker.jsx";

/* The pages this person has, worked out from the roles they hold. */
function pagesFor(me) {
  const teaching = hasRole(me, "FACULTY");
  const pages = [{ to: "/dashboard", label: "Dashboard" }];
  if (teaching || me.kind === "student") pages.push({ to: "/timetable", label: "Timetable" });
  if (me.kind === "staff") pages.push({ to: "/classes", label: "Classes" });
  if (teaching) {
    pages.push({ to: "/requests", label: "Requests" });
    pages.push({ to: "/syllabus", label: "Syllabus" });
    pages.push({ to: "/history", label: "History" });
  }
  if (teaching || oversees(me)) pages.push({ to: "/insights", label: "Insights" });
  if (hasRole(me, "ADMIN")) pages.push({ to: "/admin", label: "Admin" });
  return pages;
}

function useOutside(ref, close) {
  useEffect(() => {
    const away = (e) => ref.current && !ref.current.contains(e.target) && close();
    const key = (e) => e.key === "Escape" && close();
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [ref, close]);
}

/* Someone with several roles chooses which dashboard they are looking at. */
function RoleSwitcher({ dashboards }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  useOutside(box, () => setOpen(false));

  const current = dashboards.find((d) => location.pathname === d.path) || dashboards[0];

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button className="role-switch" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <span className="role-switch-label">
          <span className="eyebrow" style={{ fontSize: 9.5 }}>Viewing as</span>
          <span className="role-switch-name">{current.label}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}
                     style={{ display: "grid", placeItems: "center" }}>
          <ChevronDown size={13} className="faint" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div className="theme-menu" style={{ left: 0, right: "auto", width: 290 }} role="menu"
                      initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.18 }}>
            <div className="label" style={{ padding: "11px 12px 7px" }}>Your roles</div>
            {dashboards.map((d, i) => (
              <motion.button key={d.key} className={"theme-item" + (d.key === current.key ? " theme-item-on" : "")}
                             role="menuitem" onClick={() => { setOpen(false); navigate(d.path); }}
                             initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                             transition={{ delay: 0.03 + i * 0.03 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block" }}>{d.label}</span>
                  <span className="faint tiny" style={{ fontWeight: 400 }}>{d.scope}</span>
                </span>
                {d.key === current.key && <Check size={13} />}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountMenu({ me, signOut }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const navigate = useNavigate();
  useOutside(box, () => setOpen(false));

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button className="avatar avatar-ink" style={{ cursor: "pointer", border: "none" }}
              onClick={() => setOpen(!open)} title={me.name} aria-haspopup="menu">
        {initials(me.name)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="theme-menu" style={{ width: 240 }} role="menu"
                      initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.18 }}>
            <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid var(--rule)" }}>
              <div className="bold" style={{ fontSize: 13 }}>{me.name}</div>
              <div className="faint tiny">{me.email}</div>
            </div>
            <button className="theme-item" onClick={() => { setOpen(false); navigate("/account/password"); }}>
              <KeyRound size={13} /> Change password
            </button>
            <button className="theme-item" onClick={signOut}>
              <LogOut size={13} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Nav() {
  const { me, signOut } = useAuth();
  const location = useLocation();
  const dashboards = dashboardsFor(me);
  const home = dashboards[0] ? dashboards[0].path : "/";

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link to={home} className="brand">
          <span className="brand-mark"><span style={{ width: 8, height: 1.5, background: "var(--card)" }} /></span>
          Continuity
        </Link>

        <div className="nav-links">
          {pagesFor(me).map(({ to, label }) => {
            const target = to === "/dashboard" ? home : to;
            const active = location.pathname.startsWith(to);
            return (
              <Link key={to} to={target} className={"nav-link" + (active ? " active" : "")}>
                {label}
                {active && (
                  <motion.span layoutId="nav-rule" className="nav-rule"
                               transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }} />
                )}
              </Link>
            );
          })}
        </div>

        <div className="row" style={{ gap: 10 }}>
          {dashboards.length > 1 && location.pathname.startsWith("/dashboard") && (
            <RoleSwitcher dashboards={dashboards} />
          )}
          <ThemePicker />
          <AccountMenu me={me} signOut={signOut} />
        </div>
      </div>
    </nav>
  );
}
