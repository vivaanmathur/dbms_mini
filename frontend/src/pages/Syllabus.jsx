import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, BookOpen, ChevronRight } from "lucide-react";
import Shell from "../components/Shell.jsx";
import { HoverCard, Ring, Empty, Spinner, useToast } from "../ui.jsx";
import { apiGet } from "../api.js";

/*
 * One card per subject-and-class this teacher handles, showing how much of
 * the syllabus is covered. Clicking a card opens the full unit/topic list.
 */
function Syllabus() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    apiGet("/syllabus/my-subjects")
      .then((data) => setSubjects(data || []))
      .catch((err) => toast(err.message, "err"))
      .finally(() => setLoading(false));
  }, []);

  const done = subjects.reduce((sum, s) => sum + Number(s.completed_items), 0);
  const total = subjects.reduce((sum, s) => sum + Number(s.total_items), 0);

  return (
    <Shell
      title="Syllabus"
      subtitle="How far each of your classes has got. Open one to tick off what you have taught."
      actions={total > 0 && (
        <span className="chip chip-violet">{done} of {total} items covered</span>
      )}
    >
      {loading ? <Spinner /> : subjects.length === 0 ? (
        <Empty>You are not assigned to any subject yet.</Empty>
      ) : (
        <div className="grid-auto">
          {subjects.map((subject, index) => {
            const lab = subject.course_type === "PRACTICAL";
            return (
              <Link key={subject.section_course_offering_id}
                    to={"/syllabus/" + subject.section_course_offering_id}
                    style={{ textDecoration: "none" }}>
                <HoverCard className="pad" delay={index * 0.04}>
                  {/* nowrap keeps the ring beside the title even when the
                      course name is long, instead of pushing it onto its own line */}
                  <div className="between" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 7 }}>
                        {lab ? <FlaskConical size={15} className="faint" />
                             : <BookOpen size={15} className="faint" />}
                        <span className="bold" style={{ fontSize: 15.5 }}>{subject.course_code}</span>
                        <span className="chip">Sec {subject.section_name}</span>
                      </div>
                      <div className="tiny muted" style={{ marginTop: 5 }}>{subject.course_name}</div>
                    </div>

                    <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
                      <Ring percent={subject.percent_complete} />
                      <span style={{ position: "absolute", fontSize: 12, fontWeight: 800 }}>
                        {Math.round(Number(subject.percent_complete))}%
                      </span>
                    </div>
                  </div>

                  <div className="divide" style={{ margin: "14px 0 11px" }} />

                  <div className="between tiny">
                    <span className="muted">
                      {subject.completed_items}/{subject.total_items} {lab ? "experiments" : "subtopics"}
                    </span>
                    <span className="muted">
                      {Number(subject.delivered_hours)}/{Number(subject.total_planned_hours)} hrs
                    </span>
                    <span className="row faint" style={{ gap: 2 }}>
                      Open <ChevronRight size={13} />
                    </span>
                  </div>
                </HoverCard>
              </Link>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

export default Syllabus;
