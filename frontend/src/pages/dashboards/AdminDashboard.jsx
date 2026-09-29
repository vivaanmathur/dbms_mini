import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Check } from "lucide-react";
import Shell from "../../components/Shell.jsx";
import { api } from "../../api.js";
import { Empty, Figure, SkeletonRows, useToast } from "../../ui.jsx";
import { More, Panel } from "./common.jsx";

// where each checklist item is fixed, inside the admin console
const FIX_ROUTES = {
  "Teaching → Assignments": "/admin/classes",
  "Timetable": "/admin/timetable",
  "People → Roles": "/admin/people",
  "People → Students": "/admin/students",
  "People → Staff": "/admin/people",
  "Subjects": "/admin/subjects",
  "Setup → Terms": "/admin/setup",
};

export default function AdminDashboard() {
  const toast = useToast();
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard/admin").then(setD).catch((e) => toast(e.message, "err")); }, []);
  if (!d) return <Shell title="Administration"><SkeletonRows rows={8} /></Shell>;

  const todo = d.checks.filter((c) => c.count > 0);
  const done = d.checks.filter((c) => c.count === 0);
  const c = d.counts;

  return (
    <Shell eyebrow={d.term || "No current term"} title="Administration"
           subtitle="What the system holds, what is still missing before it is fully set up, and what changed recently."
           actions={<More to="/admin">Open the console</More>}>
      <div className="stats" style={{ marginBottom: 16 }}>
        {[["classes", "Classes"], ["staff", "Staff"], ["students", "Students"], ["subjects", "Subjects"],
          ["sessions", "Weekly sessions"], ["rooms", "Rooms"], ["logins", "Active logins"]].map(([k, label]) => (
          <div key={k} className="stat"><Figure value={c[k]} /><div className="stat-label">{label}</div></div>
        ))}
      </div>

      <div className="split">
        <Panel title="Setup checklist"
               hint={todo.length ? `${todo.length} thing${todo.length === 1 ? "" : "s"} still to do. Each names exactly what is missing.`
                                 : "Everything is in place."}>
          {[...todo, ...done].map((item, i) => (
            <motion.div key={item.key} className="checklist-item" initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <span className={"tickmark " + (item.count ? "tickmark-todo" : "tickmark-ok")}>
                {item.count ? <AlertTriangle size={11} /> : <Check size={12} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: item.count ? 600 : 400, color: item.count ? "var(--ink)" : "var(--ink-3)" }}>
                  {item.title}
                </div>
                {item.count > 0 && item.items.length > 0 && (
                  <div className="tiny muted" style={{ marginTop: 3 }}>
                    {item.items.join(" · ")}{item.count > item.items.length ? ` · and ${item.count - item.items.length} more` : ""}
                  </div>
                )}
              </div>
              {item.count > 0 ? (
                <Link to={FIX_ROUTES[item.fix] || "/admin"} className="btn btn-sm">Fix</Link>
              ) : <span />}
            </motion.div>
          ))}
        </Panel>

        <Panel title="Recent changes" action={<More to="/admin/audit">Full audit trail</More>} delay={0.06}>
          {d.recent.length === 0 ? <Empty>Nothing yet.</Empty> : d.recent.map((a) => (
            <div key={a.audit_id} className="lecture" style={{ gridTemplateColumns: "1fr auto" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.8 }}>{a.summary}</div>
                <div className="tiny faint">{a.who}</div>
              </div>
              <span className="tiny faint mono">{a.created_at.slice(5, 16)}</span>
            </div>
          ))}
        </Panel>
      </div>
    </Shell>
  );
}
