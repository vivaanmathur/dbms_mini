import { useEffect, useState } from "react";
import Shell from "../../components/Shell.jsx";
import { LectureRow } from "../../components/lectures.jsx";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { Empty, SkeletonRows, useToast } from "../../ui.jsx";
import { SubjectCards } from "../Syllabus.jsx";
import { More, Panel, TermBar } from "./common.jsx";

export default function StudentDashboard() {
  const { me } = useAuth();
  const toast = useToast();
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard/student").then(setD).catch((e) => toast(e.message, "err")); }, []);
  if (!d) return <Shell title="Your classes"><SkeletonRows rows={8} /></Shell>;

  const s = d.student;
  return (
    <Shell eyebrow={`${s.class_label}${s.lab_batch_code ? " · batch " + s.lab_batch_code : ""}`}
           title={`Hello, ${me.name.split(" ")[0]}`}
           subtitle="Who is really teaching you today, anything that has changed this week, and how far each subject has got.">
      <TermBar term={d.term} />
      <div className="split">
        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Today" action={<More to="/timetable">Whole week</More>}>
            {d.today.length === 0 ? <Empty>No classes today.</Empty> :
              d.today.map((l, i) => <LectureRow key={(l.kind || "") + (l.slot_id || l.makeup_id)} lecture={l} index={i} showClass={false} />)}
          </Panel>
          <Panel title="Your subjects" hint="How much of each syllabus your class has covered." delay={0.05}>
            <SubjectCards subjects={d.subjects} />
          </Panel>
        </div>
        <Panel title="Changes this week" hint="Anything not happening as timetabled." delay={0.08}>
          {d.changes.length === 0 ? <Empty>Everything is going ahead as normal.</Empty> :
            d.changes.map((l, i) => <LectureRow key={(l.kind || "") + (l.slot_id || l.makeup_id) + l.date}
                                                lecture={l} index={i} showClass={false} showDate />)}
        </Panel>
      </div>
    </Shell>
  );
}
