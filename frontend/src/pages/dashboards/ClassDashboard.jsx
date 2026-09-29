import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Shell from "../../components/Shell.jsx";
import LectureDialog from "../../components/LectureDialog.jsx";
import { LectureRow } from "../../components/lectures.jsx";
import { api } from "../../api.js";
import { Empty, Figure, SkeletonRows, useToast } from "../../ui.jsx";
import { SubjectCards } from "../Syllabus.jsx";
import { AttentionPanel, BAND } from "../Insights.jsx";
import { More, Panel, TermBar, WeekSoFar } from "./common.jsx";

/* A class teacher's view of their class — anyone overseeing it sees the same. */
export default function ClassDashboard() {
  const { sectionId } = useParams();
  const toast = useToast();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => api.get(`/dashboard/class/${sectionId}`).then(setD).catch((e) => toast(e.message, "err"));
  useEffect(() => { setD(null); load(); }, [sectionId]);

  if (!d) return <Shell title="Class"><SkeletonRows rows={8} /></Shell>;
  const c = d.class;
  const counts = {};
  d.risk.items.forEach((i) => { counts[i.band] = (counts[i.band] || 0) + 1; });

  return (
    <Shell eyebrow="Class teacher" title={c.label}
           subtitle={`${c.students} student${c.students === 1 ? "" : "s"} enrolled · batches ${c.batches.map((b) => b.code).join(", ") || "none"}` +
                     (c.class_teacher ? ` · class teacher ${c.class_teacher}` : "")}
           actions={<More to={`/classes?class=${c.section_id}`}>Class timetable</More>}>
      <TermBar term={d.term} />
      <div className="stats" style={{ marginBottom: 16 }}>
        {Object.keys(BAND).filter((b) => counts[b]).map((b) => (
          <div key={b} className="stat"><Figure value={counts[b]} /><div className="stat-label">{b}</div></div>
        ))}
      </div>
      <div className="split">
        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Today in this class">
            {d.today.length === 0 ? <Empty>No classes today.</Empty> :
              d.today.map((l, i) => <LectureRow key={(l.kind || "") + (l.slot_id || l.makeup_id)} lecture={l}
                                                index={i} showClass={false} onClick={() => setOpen(l)} />)}
          </Panel>
          <Panel title="Every subject" hint="One card per teacher — a lab taught batch by batch has one for each batch." delay={0.05}>
            <SubjectCards subjects={d.subjects} empty="No subject has a teacher assigned yet." />
          </Panel>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <Panel title="This week so far" delay={0.08}><WeekSoFar week={d.week} /></Panel>
          <Panel title="Needs arranging" hint="Cancelled lectures nobody has taken yet." delay={0.1}>
            <AttentionPanel sectionId={c.section_id} onChanged={load} />
          </Panel>
          {d.risk.unassigned.length > 0 && (
            <div className="notice notice-warn"><b>No teacher assigned:</b>{" "}
              {d.risk.unassigned.map((u) => u.subject_code).join(", ")}.</div>)}
        </div>
      </div>
      {open && <LectureDialog lecture={open} onClose={() => setOpen(null)} onChanged={load} />}
    </Shell>
  );
}
