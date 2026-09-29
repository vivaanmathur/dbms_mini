import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import Shell from "../components/Shell.jsx";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { asYearMonthDay, Bar, Card, Empty, Figure, shortDate, SkeletonRows, useToast } from "../ui.jsx";

function Tick({ number, label, done, editable, onToggle }) {
  return (
    <motion.div className={"tick" + (done ? " tick-done" : "")} onClick={editable ? onToggle : undefined}
                style={{ cursor: editable ? "pointer" : "default" }} whileTap={editable ? { scale: 0.99 } : undefined}>
      <span className={"box" + (done ? " box-on" : "")}>
        <AnimatePresence>{done && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                       transition={{ type: "spring", stiffness: 620, damping: 20 }} style={{ display: "grid" }}>
            <Check size={11} color="var(--on-ink)" strokeWidth={3.2} />
          </motion.span>)}
        </AnimatePresence>
      </span>
      <span className="tick-text" style={{ flex: 1, minWidth: 0 }}><span className="faint">{number}.</span> {label}</span>
      {done && <span className="tag tag-pine">{shortDate(done.completed_on)} · {done.completed_by.split(" ")[0]}</span>}
    </motion.div>
  );
}

function Unit({ unit, first, editable, onToggle }) {
  const [open, setOpen] = useState(first);
  const all = unit.topics.flatMap((t) => t.subtopics);
  const done = all.filter((s) => s.done).length;
  return (
    <div className="unit">
      <div className="unit-head" onClick={() => setOpen(!open)}>
        <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }} style={{ display: "grid" }}>
          <ChevronDown size={15} className="faint" /></motion.span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="unit-title">Unit {unit.unit_number} · {unit.title}</span>
          <span className="tiny faint" style={{ display: "block", marginTop: 2 }}>
            {done} of {all.length} covered · {unit.planned_hours} hrs planned</span>
        </span>
        <span style={{ width: 80 }}><Bar percent={all.length ? (done / all.length) * 100 : 0} /></span>
      </div>
      <AnimatePresence initial={false}>{open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24 }} style={{ overflow: "hidden" }}>
          {unit.topics.map((t) => (
            <div className="topic" key={t.topic_id}>
              <div className="topic-title">{t.topic_number}. {t.title}</div>
              {t.subtopics.map((s) => (
                <Tick key={s.subtopic_id} number={s.subtopic_number} label={s.title} done={s.done}
                      editable={editable} onToggle={() => onToggle({ subtopic_id: s.subtopic_id }, s.done)} />
              ))}
            </div>
          ))}
        </motion.div>)}
      </AnimatePresence>
    </div>
  );
}

export default function SyllabusDetail() {
  const { assignmentId } = useParams();
  const { me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);

  async function load() {
    try {
      const [tree, past] = await Promise.all([api.get(`/syllabus/assignment/${assignmentId}`),
                                              api.get(`/syllabus/assignment/${assignmentId}/history`)]);
      setData(tree); setHistory(past);
    } catch (e) { toast(e.message, "err"); }
  }
  useEffect(() => { load(); }, [assignmentId]);

  async function toggle(item, done) {
    try {
      if (done) await api.del(`/syllabus/progress/${done.progress_id}`);
      else await api.post(`/syllabus/assignment/${assignmentId}/tick`, { ...item, completed_on: asYearMonthDay(new Date()) });
      load();
    } catch (e) { toast(e.message, "err"); }
  }

  if (!data) return <Shell title="Syllabus"><Card className="pad"><SkeletonRows rows={7} /></Card></Shell>;
  const a = data.assignment;
  const editable = a.staff_id === me.staff_id;
  const lab = a.subject_type === "PRACTICAL";

  return (
    <Shell eyebrow={a.class_label + (a.lab_batch_code ? " · batch " + a.lab_batch_code : "")}
           title={`${a.subject_code} · ${a.subject_name}`}
           subtitle={editable ? "Tick an item the day you finish teaching it; click again to undo."
                              : `Taught by ${a.teacher_name}. Only they can change this.`}
           actions={<Link to={-1} className="btn btn-sm" onClick={(e) => { e.preventDefault(); window.history.back(); }}>
             <ArrowLeft size={14} /> Back</Link>}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="stats">
          <div className="stat"><Figure value={Math.round(a.percent)} suffix="%" /><div className="stat-label">Covered</div></div>
          <div className="stat"><div className="row" style={{ gap: 3, alignItems: "baseline" }}>
            <Figure value={a.completed_items} /><span className="faint display" style={{ fontSize: 17 }}>/{a.total_items}</span></div>
            <div className="stat-label">{lab ? "Experiments" : "Subtopics"}</div></div>
          <div className="stat"><div className="row" style={{ gap: 3, alignItems: "baseline" }}>
            <Figure value={a.delivered_hours} /><span className="faint display" style={{ fontSize: 17 }}>/{a.planned_hours}</span></div>
            <div className="stat-label">Hours delivered</div></div>
        </div>

        <Card className="pad">
          {lab ? (data.experiments.length === 0 ? <Empty>No experiments listed.</Empty> :
            data.experiments.map((e) => (
              <Tick key={e.experiment_id} number={e.experiment_number} label={e.title} done={e.done}
                    editable={editable} onToggle={() => toggle({ experiment_id: e.experiment_id }, e.done)} />)))
          : (data.units.length === 0 ? <Empty>No syllabus has been entered for this subject.</Empty> :
            data.units.map((u, i) => <Unit key={u.unit_id} unit={u} first={i === 0} editable={editable} onToggle={toggle} />))}
        </Card>

        <Card className="pad" delay={0.06}>
          <h2 className="section-title">Lecture history</h2>
          <p className="page-sub" style={{ marginBottom: 12 }}>Every lecture of this that took place, and what it covered.</p>
          {history.length === 0 ? <Empty>No lecture has been recorded yet.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Date</th><th>Taken by</th><th>Hours</th><th>Covered</th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.log_id}>
                  <td>{shortDate(h.lecture_date)}<div className="tiny faint mono">{h.start_time}</div></td>
                  <td>{h.taken_by}</td><td>{h.hours}</td>
                  <td className="tiny muted">{h.covered || "—"}{h.remarks && <div className="faint">{h.remarks}</div>}</td>
                </tr>))}
              </tbody></table></div>
          )}
        </Card>
      </div>
    </Shell>
  );
}
