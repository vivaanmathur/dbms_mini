import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Shell from "../components/Shell.jsx";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Bar, Card, Empty, Figure, initials, shortDate, SkeletonRows, useToast } from "../ui.jsx";

/* Everything this teacher taught this term, and how the load is spread. */
export default function History() {
  const { me } = useAuth();
  const toast = useToast();
  const [logs, setLogs] = useState(null);
  const [load, setLoad] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/lectures/mine"), api.get("/insight/load")])
      .then(([a, b]) => { setLogs(a); setLoad(b); })
      .catch((e) => toast(e.message, "err"));
  }, []);

  if (!logs) return <Shell title="Lecture history"><Card className="pad"><SkeletonRows rows={6} /></Card></Shell>;
  const hours = logs.reduce((a, l) => a + l.hours, 0);
  const forOthers = logs.filter((l) => !l.own_class).length;
  const busiest = Math.max(1, ...(load ? load.staff.map((s) => s.weekly_hours) : [1]));

  return (
    <Shell title="Lecture history" subtitle="Every lecture you have recorded this term, and what each one covered.">
      <div className="stack" style={{ gap: 16 }}>
        <div className="stats">
          <div className="stat"><Figure value={logs.length} /><div className="stat-label">Lectures</div></div>
          <div className="stat"><Figure value={hours} /><div className="stat-label">Hours</div></div>
          <div className="stat"><Figure value={forOthers} /><div className="stat-label">Covered for others</div></div>
        </div>

        <Card className="pad">
          {logs.length === 0 ? <Empty>Nothing recorded yet. Open a lecture on your timetable after it happens.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Date</th><th>Lecture</th><th>Hours</th><th>Covered</th><th /></tr></thead>
              <tbody>{logs.map((l) => (
                <tr key={l.log_id}>
                  <td>{shortDate(l.lecture_date)}<div className="tiny faint mono">{l.start_time}</div></td>
                  <td><b>{l.subject_code}</b>{l.lab_batch_code ? " · " + l.lab_batch_code : ""}
                    <div className="tiny faint">{l.class_label} · {l.room_code}</div></td>
                  <td>{l.hours}</td>
                  <td className="tiny muted" style={{ maxWidth: 360 }}>{l.covered || "—"}</td>
                  <td>{l.own_class ? <span className="tag">Own</span>
                                   : <span className="tag tag-pine">For {l.regular_teacher.split(" ")[0]}</span>}</td>
                </tr>))}
              </tbody></table></div>
          )}
        </Card>

        {load && load.staff.length > 0 && (
          <Card className="pad" delay={0.06}>
            <h2 className="section-title">Teaching load</h2>
            <p className="page-sub" style={{ marginBottom: 16 }}>
              Scheduled hours a week against each colleague's contract, for the classes you teach.
            </p>
            <div className="stack" style={{ gap: 11 }}>
              {load.staff.map((s, i) => (
                <motion.div key={s.staff_id} className="row" style={{ gap: 11 }}
                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <span className="avatar">{initials(s.name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="between" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: s.staff_id === me.staff_id ? 600 : 400 }}>
                        {s.name}{s.staff_id === me.staff_id && <span className="faint"> (you)</span>}</span>
                      <span className="tiny faint">{s.weekly_hours}/{s.max_weekly_hours} hrs</span>
                    </span>
                    <Bar percent={(s.weekly_hours / busiest) * 100} />
                  </span>
                </motion.div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Shell>
  );
}
