import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { BookOpen, Building2, CalendarRange, GraduationCap, History, LayoutDashboard, School, Users } from "lucide-react";
import Shell from "../../components/Shell.jsx";
import Setup from "./Setup.jsx";
import Subjects from "./Subjects.jsx";
import Classes from "./Classes.jsx";
import People from "./People.jsx";
import Students from "./Students.jsx";
import TimetableEditor from "./TimetableEditor.jsx";
import Audit from "./Audit.jsx";

const SECTIONS = [
  { group: "Academic" },
  { to: "/admin/classes", label: "Classes & teaching", Icon: School },
  { to: "/admin/timetable", label: "Timetable", Icon: CalendarRange },
  { to: "/admin/subjects", label: "Subjects & syllabus", Icon: BookOpen },
  { group: "People" },
  { to: "/admin/people", label: "Staff & roles", Icon: Users },
  { to: "/admin/students", label: "Students", Icon: GraduationCap },
  { group: "System" },
  { to: "/admin/setup", label: "Organisation & calendar", Icon: Building2 },
  { to: "/admin/audit", label: "Audit trail", Icon: History },
  { to: "/dashboard/admin", label: "Setup checklist", Icon: LayoutDashboard },
];

export default function Admin() {
  return (
    <Shell wide title="Administration"
           subtitle="Everything the system runs on. Every change here is recorded in the audit trail.">
      <div className="admin">
        <aside className="admin-nav">
          {SECTIONS.map((s, i) => s.group ? <div key={i} className="eyebrow group">{s.group}</div> : (
            <NavLink key={s.to} to={s.to} className={({ isActive }) => (isActive ? "on" : "")}>
              <s.Icon size={14} /> {s.label}
            </NavLink>
          ))}
        </aside>
        <section style={{ minWidth: 0 }}>
          <Routes>
            <Route index element={<Navigate to="classes" replace />} />
            <Route path="setup" element={<Setup />} />
            <Route path="subjects" element={<Subjects />} />
            <Route path="classes/*" element={<Classes />} />
            <Route path="people" element={<People />} />
            <Route path="students" element={<Students />} />
            <Route path="timetable" element={<TimetableEditor />} />
            <Route path="audit" element={<Audit />} />
          </Routes>
        </section>
      </div>
    </Shell>
  );
}
