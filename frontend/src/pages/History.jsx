import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { History as HistoryIcon, Scale } from "lucide-react";
import Shell from "../components/Shell.jsx";
import { Glass, Empty, Spinner, Bar, useToast, shortDate, initials } from "../ui.jsx";
import { apiGet, getMyName } from "../api.js";

/*
 * Everything this teacher has actually taught, plus the workload table that
 * the substitute picker reads when nobody is chosen by hand.
 */
function History() {
  const [logs, setLogs] = useState([]);
  const [load, setLoad] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const me = getMyName();

  useEffect(() => {
    Promise.all([apiGet("/lecture-log"), apiGet("/teacher-load")])
      .then(([mine, everyone]) => { setLogs(mine || []); setLoad(everyone || []); })
      .catch((err) => toast(err.message, "err"))
      .finally(() => setLoading(false));
  }, []);

  const hours = logs.reduce((sum, log) => sum + Number(log.actual_hours_taken), 0);
  const busiest = load.reduce((max, row) => Math.max(max, Number(row.lectures_taken)), 0) || 1;
  const substitutions = logs.filter((log) => log.regular_teacher !== me).length;

  if (loading) return <Shell title="Lecture History"><Glass className="pad"><Spinner /></Glass></Shell>;

  return (
    <Shell
      title="Lecture History"
      subtitle="Every class you have conducted, and how the teaching load is spread across the department."
    >
      <div className="stack" style={{ gap: 16 }}>
        <div className="grid-auto">
          {[
            { value: logs.length, label: "Lectures conducted" },
            { value: hours, label: "Hours taught" },
            { value: substitutions, label: "Taken for others" },
          ].map((stat, index) => (
            <Glass key={stat.label} className="pad" delay={index * 0.05}>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </Glass>
          ))}
        </div>

        <Glass className="pad" delay={0.15}>
          <div className="row" style={{ gap: 9, marginBottom: 14 }}>
            <HistoryIcon size={17} className="muted" />
            <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>What you taught</h2>
          </div>

          {logs.length === 0 ? (
            <Empty>Nothing yet. Open a lecture on your timetable and mark it conducted.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th><th>Course</th><th>Class</th>
                    <th>Time</th><th>Room</th><th>Hours</th><th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.lecture_log_id}>
                      <td>{shortDate(log.lecture_date)}</td>
                      <td className="bold">{log.course_code}</td>
                      <td className="muted">
                        Sec {log.section_name}{log.lab_batch_code ? " / " + log.lab_batch_code : ""}
                      </td>
                      <td className="muted">{log.start_time}–{log.end_time}</td>
                      <td className="muted">{log.room_number}</td>
                      <td>{Number(log.actual_hours_taken)}</td>
                      <td>
                        {log.regular_teacher === me
                          ? <span className="chip">Own class</span>
                          : <span className="chip chip-green">Covered for {log.regular_teacher.split(" ")[0]}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Glass>

        <Glass className="pad" delay={0.2}>
          <div className="row" style={{ gap: 9, marginBottom: 3 }}>
            <Scale size={17} className="muted" />
            <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Teaching load</h2>
          </div>
          <p className="page-sub" style={{ marginBottom: 16 }}>
            When a lecture is handed over without choosing anyone, the system walks
            down this list and offers it to the first teacher who is free at that
            hour — so the extra work spreads out instead of landing on one person.
          </p>

          <div className="stack" style={{ gap: 10 }}>
            {load.map((row, index) => (
              <motion.div key={row.faculty_id} className="row" style={{ gap: 11 }}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.035 }}>
                <span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                  {initials(row.name)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="between" style={{ marginBottom: 4 }}>
                    <span className={row.name === me ? "bold" : ""} style={{ fontSize: 13 }}>
                      {row.name}{row.name === me && <span className="faint"> (you)</span>}
                    </span>
                    <span className="tiny faint">
                      {row.lectures_taken} lectures · {Number(row.hours_taken)} hrs
                    </span>
                  </span>
                  <Bar percent={(Number(row.lectures_taken) / busiest) * 100} />
                </span>
              </motion.div>
            ))}
          </div>
        </Glass>
      </div>
    </Shell>
  );
}

export default History;
