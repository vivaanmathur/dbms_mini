import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, ArrowLeft, FlaskConical } from "lucide-react";
import Shell from "../components/Shell.jsx";
import { Card, Bar, Empty, useToast, shortDate, asYearMonthDay,
         Figure, SkeletonRows } from "../ui.jsx";
import { apiGet, apiPost, apiDelete } from "../api.js";

/* One tickable line: a subtopic of a theory course, or a lab experiment. */
function Tick({ label, number, done, onToggle }) {
  return (
    <motion.div className={"tick" + (done ? " tick-done" : "")}
                onClick={onToggle} whileTap={{ scale: 0.99 }}>
      <span className={"box" + (done ? " box-on" : "")}>
        <AnimatePresence>
          {done && (
            <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                         exit={{ scale: 0, opacity: 0 }}
                         transition={{ type: "spring", stiffness: 620, damping: 20 }}
                         style={{ display: "grid", placeItems: "center" }}>
              <Check size={12} color="var(--on-ink)" strokeWidth={3.2} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      <span className="tick-text" style={{ flex: 1, minWidth: 0 }}>
        <span className="faint">{number}.</span> {label}
      </span>

      {done && (
        <span className="tag tag-pine tiny">
          {shortDate(done.completed_on)} · {done.completed_by.split(" ")[0]}
        </span>
      )}
    </motion.div>
  );
}

function Unit({ unit, openByDefault, onToggleItem }) {
  const [open, setOpen] = useState(openByDefault);

  const all = unit.topics.flatMap((t) => t.subtopics);
  const done = all.filter((s) => s.done).length;

  return (
    <div className="unit card-sunk">
      <div className="unit-head" onClick={() => setOpen(!open)}>
        <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }}
                     style={{ display: "grid", placeItems: "center" }}>
          <ChevronDown size={16} className="faint" />
        </motion.span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="unit-title">Unit {unit.unit_number} · {unit.unit_title}</span>
          <span className="tiny faint" style={{ display: "block", marginTop: 2 }}>
            {done} of {all.length} covered · {Number(unit.planned_hours)} hrs planned
          </span>
        </span>

        <span style={{ width: 72 }}><Bar percent={all.length ? (done / all.length) * 100 : 0} /></span>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                      style={{ overflow: "hidden" }}>
            <div style={{ paddingBottom: 10 }}>
              {unit.topics.map((topic) => (
                <div className="topic" key={topic.topic_id}>
                  <div className="topic-title">{topic.topic_number}. {topic.topic_title}</div>
                  {topic.subtopics.map((sub) => (
                    <Tick key={sub.subtopic_id}
                          number={sub.subtopic_number}
                          label={sub.subtopic_title}
                          done={sub.done}
                          onToggle={() => onToggleItem({ subtopic_id: sub.subtopic_id }, sub.done)} />
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SyllabusDetail() {
  const { offeringId } = useParams();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const toast = useToast();

  async function load() {
    try {
      setData(await apiGet("/syllabus/" + offeringId));
      setHistory((await apiGet("/syllabus/" + offeringId + "/history")) || []);
    } catch (err) {
      toast(err.message, "err");
    }
  }

  useEffect(() => { load(); }, [offeringId]);

  async function toggle(which, alreadyDone) {
    try {
      if (alreadyDone) {
        await apiDelete("/syllabus/mark/" + alreadyDone.progress_id);
      } else {
        await apiPost("/syllabus/mark", {
          section_course_offering_id: Number(offeringId),
          subtopic_id: which.subtopic_id || null,
          experiment_id: which.experiment_id || null,
          completed_on: asYearMonthDay(new Date()),
          remarks: "",
        });
      }
      load();
    } catch (err) {
      toast(err.message, "err");
    }
  }

  if (!data) return <Shell title="Syllabus"><Card className="pad"><SkeletonRows rows={7} /></Card></Shell>;

  const { offering, units, experiments, progress } = data;
  const lab = offering.course_type === "PRACTICAL";

  return (
    <Shell
      title={offering.course_code + " · Section " + offering.section_name}
      subtitle={offering.course_name}
      actions={
        <Link to="/syllabus" className="btn btn-sm">
          <ArrowLeft size={14} /> All subjects
        </Link>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <Card className="pad">
          <div className="between" style={{ marginBottom: 12 }}>
            <div>
              <Figure value={Math.round(Number(progress.percent_complete))} suffix="%" />
              <div className="stat-label">Syllabus covered</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>
                <Figure value={progress.completed_items} />
                <span className="faint" style={{ fontSize: 17, fontFamily: "var(--serif)" }}>/{progress.total_items}</span>
              </div>
              <div className="stat-label">{lab ? "Experiments" : "Subtopics"}</div>
            </div>
          </div>
          <Bar percent={progress.percent_complete} />
          <div className="tiny faint" style={{ marginTop: 9 }}>
            Tick an item the day you finish teaching it. Click it again to undo.
          </div>
        </Card>

        <Card className="pad" delay={0.05}>
          {lab ? (
            <>
              <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                <FlaskConical size={16} className="muted" />
                <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Experiments</h2>
              </div>
              {experiments.length === 0 ? <Empty>No experiments listed for this lab.</Empty> : (
                experiments.map((item) => (
                  <Tick key={item.experiment_id}
                        number={item.experiment_number}
                        label={item.experiment_title}
                        done={item.done}
                        onToggle={() => toggle({ experiment_id: item.experiment_id }, item.done)} />
                ))
              )}
            </>
          ) : (
            units.length === 0 ? <Empty>No syllabus has been entered for this subject.</Empty> : (
              units.map((unit, index) => (
                <Unit key={unit.unit_id} unit={unit} openByDefault={index === 0}
                      onToggleItem={toggle} />
              ))
            )
          )}
        </Card>

        <Card className="pad" delay={0.1}>
          <h2 style={{ margin: "0 0 3px", fontSize: 15.5, fontWeight: 700 }}>Lecture history</h2>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Every class of this subject that was actually conducted.
          </p>
          {history.length === 0 ? <Empty>No lecture has been marked conducted yet.</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Time</th><th>Taken by</th><th>Hours</th><th>Covered</th></tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.lecture_log_id}>
                      <td>{shortDate(row.lecture_date)}</td>
                      <td className="muted">{row.start_time}–{row.end_time}</td>
                      <td>{row.taken_by}</td>
                      <td>{Number(row.actual_hours_taken)}</td>
                      <td className="muted tiny">{row.covered || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

export default SyllabusDetail;
