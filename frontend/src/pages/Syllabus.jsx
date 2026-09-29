import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, FlaskConical } from "lucide-react";
import Shell from "../components/Shell.jsx";
import { api } from "../api.js";
import { Dial, Empty, LinkCard, Skeleton, useToast } from "../ui.jsx";

/* Every class and batch this teacher teaches, each with its own progress. */
export function SubjectCards({ subjects, empty = "Nothing to show yet." }) {
  if (!subjects.length) return <Empty>{empty}</Empty>;
  return (
    <div className="grid-auto">
      {subjects.map((s, i) => {
        const lab = s.subject_type === "PRACTICAL";
        return (
          <Link key={s.assignment_id} to={"/syllabus/" + s.assignment_id}>
            <LinkCard className="pad card-link" delay={i * 0.035}>
              <div className="between" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 7 }}>
                    {lab ? <FlaskConical size={14} className="faint" /> : <BookOpen size={14} className="faint" />}
                    <span className="bold" style={{ fontSize: 15 }}>{s.subject_code}</span>
                    {s.lab_batch_code && <span className="tag">{s.lab_batch_code}</span>}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 5 }}>{s.subject_name}</div>
                  <div className="tiny faint" style={{ marginTop: 2 }}>{s.class_label} · {s.teacher_name}</div>
                </div>
                <Dial percent={s.percent} />
              </div>
              <div className="card-foot">
                <div className="divide" style={{ margin: "14px 0 11px" }} />
                <div className="between tiny">
                  <span className="muted">{s.completed_items}/{s.total_items} {lab ? "experiments" : "subtopics"}</span>
                  <span className="muted">{s.delivered_hours}/{s.planned_hours} hrs</span>
                  <span className="row faint" style={{ gap: 2 }}>Open <span className="nudge"><ChevronRight size={13} /></span></span>
                </div>
              </div>
            </LinkCard>
          </Link>
        );
      })}
    </div>
  );
}

export default function Syllabus() {
  const toast = useToast();
  const [subjects, setSubjects] = useState(null);
  useEffect(() => { api.get("/syllabus/mine").then(setSubjects).catch((e) => toast(e.message, "err")); }, []);

  const done = (subjects || []).reduce((a, s) => a + s.completed_items, 0);
  const total = (subjects || []).reduce((a, s) => a + s.total_items, 0);

  return (
    <Shell title="Syllabus" subtitle="How far each of your classes has got. A lab taught batch by batch has one card per batch."
           actions={total > 0 && <span className="tag">{done} of {total} items covered</span>}>
      {subjects === null ? (
        <div className="grid-auto">{[0, 1, 2].map((i) => (
          <div key={i} className="card pad stack" style={{ gap: 12 }}>
            <Skeleton height={17} width="40%" /><Skeleton height={12} width="80%" /><Skeleton height={12} width="55%" />
          </div>))}</div>
      ) : <SubjectCards subjects={subjects} empty="You are not assigned to teach anything yet." />}
    </Shell>
  );
}
