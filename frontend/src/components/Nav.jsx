import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarDays, Users, Inbox, BookOpen, History, Sparkles, LogOut, GraduationCap,
} from "lucide-react";
import { getMyName, logout } from "../api.js";
import { initials } from "../ui.jsx";

const PAGES = [
  { to: "/my-timetable", label: "My Timetable", Icon: CalendarDays },
  { to: "/class-timetable", label: "Classes", Icon: Users },
  { to: "/requests", label: "Requests", Icon: Inbox },
  { to: "/syllabus", label: "Syllabus", Icon: BookOpen },
  { to: "/history", label: "History", Icon: History },
  { to: "/intelligence", label: "Intelligence", Icon: Sparkles },
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
        <div className="brand">
          <span className="brand-mark">
            <GraduationCap size={17} color="#fff" />
          </span>
          <span>Continuity</span>
        </div>

        <div className="nav-links">
          {PAGES.map(({ to, label, Icon }) => {
            const active = location.pathname === to;
            return (
              <Link key={to} to={to} className={"nav-link" + (active ? " active" : "")}>
                {/* one shared layoutId makes the highlight glide from tab to tab */}
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="nav-pill"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon size={14.5} />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="row" style={{ gap: 9 }}>
          <div className="avatar" title={name}>{initials(name)}</div>
          <button className="btn btn-sm btn-ghost" onClick={signOut}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Nav;
