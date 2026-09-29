import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Shell from "../../components/Shell.jsx";
import LectureDialog from "../../components/LectureDialog.jsx";
import { LectureRow } from "../../components/lectures.jsx";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { Empty, Figure, SkeletonRows, useToast } from "../../ui.jsx";
import { SubjectCards } from "../Syllabus.jsx";
import { More, Panel, TermBar, WeekSoFar } from "./common.jsx";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function FacultyDashboard() {
  const { me } = useAuth();
  const toast = useToast();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => api.get("/dashboard/faculty").then(setD).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);

  const first = me.name.split(" ")[0];
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Shell eyebrow={today} title={`${greeting()}, ${first}`}
           subtitle="Your teaching today, anything waiting on you, and how your subjects are progressing.">
      {!d ? <SkeletonRows rows={8} /> : (
        <>
          <TermBar term={d.term} />
          <div className="stats" style={{ marginBottom: 16 }}>
            <div className="stat"><Figure value={d.today.length} /><div className="stat-label">Lectures today</div></div>
            <Link to="/requests" className="stat" style={{ display: "block" }}>
              <div className="figure" style={{ color: d.stats.requests_waiting ? "var(--ochre)" : undefined }}>{d.stats.requests_waiting}</div>
              <div className="stat-label">Requests waiting</div></Link>
            <div className="stat"><Figure value={d.stats.covering_ahead} /><div className="stat-label">Covering ahead</div></div>
            <div className="stat"><Figure value={d.stats.lectures_this_term} /><div className="stat-label">Recorded this term</div>
              <div className="stat-note">{d.stats.hours_this_term} hours</div></div>
          </div>

          <div className="split">
            <div className="stack" style={{ gap: 16 }}>
              <Panel title="Today" action={<More to="/timetable">Whole week</More>}>
                {d.today.length === 0 ? <Empty>No lectures today.</Empty> :
                  d.today.map((l, i) => <LectureRow key={l.kind + l.slot_id} lecture={l} index={i} onClick={() => setOpen(l)} />)}
              </Panel>
              <Panel title="Your subjects" action={<More to="/syllabus">Syllabus</More>} delay={0.05}>
                <SubjectCards subjects={d.subjects} empty="You are not assigned to teach anything yet." />
              </Panel>
            </div>
            <div className="stack" style={{ gap: 16 }}>
              <Panel title="This week so far" delay={0.08}><WeekSoFar week={d.week} /></Panel>
              {d.stats.open_handovers > 0 && (
                <div className="notice notice-warn">
                  {d.stats.open_handovers} lecture{d.stats.open_handovers === 1 ? "" : "s"} you handed over
                  {d.stats.open_handovers === 1 ? " has" : " have"} nobody confirmed yet. <Link to="/requests"><b>See where they stand</b></Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {open && <LectureDialog lecture={open} onClose={() => setOpen(null)} onChanged={load} />}
    </Shell>
  );
}
