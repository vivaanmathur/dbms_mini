import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogOut } from "lucide-react";
import { getMyName, logout } from "../api.js";
import { initials } from "../ui.jsx";
import ThemePicker from "./ThemePicker.jsx";

const PAGES = [
  { to: "/my-timetable", label: "Timetable" },
  { to: "/class-timetable", label: "Classes" },
  { to: "/requests", label: "Requests" },
  { to: "/syllabus", label: "Syllabus" },
  { to: "/history", label: "History" },
  { to: "/insights", label: "Insights" },
];

function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const name = getMyName();

  function signOut() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link to="/my-timetable" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="brand-mark">
            <span style={{ width: 8, height: 1.5, background: "var(--card)" }} />
          </span>
          Continuity
        </Link>

        <div className="nav-links">
          {PAGES.map(({ to, label }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link key={to} to={to} className={"nav-link" + (active ? " active" : "")}>
                {label}
                {/* one shared layoutId slides the rule from tab to tab */}
                {active && (
                  <motion.span layoutId="nav-rule" className="nav-rule"
                               transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }} />
                )}
              </Link>
            );
          })}
        </div>

        <div className="row" style={{ gap: 10 }}>
          <ThemePicker />
          <span className="avatar avatar-ink" title={name}>{initials(name)}</span>
          <button className="btn btn-quiet btn-sm" onClick={signOut}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Nav;
