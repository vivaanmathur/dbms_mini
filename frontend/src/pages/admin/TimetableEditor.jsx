import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { api } from "../../api.js";
import { Card, Empty, Modal, SkeletonRows, useToast } from "../../ui.jsx";
import { Confirm } from "./kit.jsx";
import { SESSION_KIND } from "../../components/lectures.jsx";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const NAMES = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday" };
const TYPES = [["LECTURE", "Lecture"], ["TUTORIAL", "Tutorial"], ["PRACTICAL", "Practical"], ["EVALUATION", "Evaluation"]];

/* Adding or moving one session. The server refuses any clash — the teacher,
   the room or the students already busy — and says which. */
function SessionDialog({ ed, initial, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const set = (k) => (e) => setV((o) => ({ ...o, [k]: e.target.value }));

  const assignment = ed.assignments.find((a) => String(a.assignment_id) === String(v.assignment_id));
  const lab = assignment && assignment.subject_type === "PRACTICAL";
  const type = v.session_type || (lab ? "PRACTICAL" : "LECTURE");
  const types = TYPES.filter(([t]) => t !== "PRACTICAL" || lab);
  // a practical must be in a lab; anything else — even a lab evaluation — can be anywhere
  const rooms = ed.rooms.filter((r) => type !== "PRACTICAL" || r.room_type === "LAB");
  const picked = v.batch_ids || [];
  const toggle = (id) => setV((o) => {
    const now = o.batch_ids || [];
    return { ...o, batch_ids: now.includes(id) ? now.filter((b) => b !== id) : [...now, id] };
  });
  // end choices: the end of this period or any later period on the same day
  const startIndex = ed.periods.findIndex((p) => p.start_time === v.start_time);
  const ends = ed.periods.slice(Math.max(startIndex, 0)).map((p) => p.end_time);

  async function save() {
    setBusy(true);
    const body = { assignment_id: Number(v.assignment_id), room_id: Number(v.room_id),
                   day_of_week: v.day_of_week, start_time: v.start_time, end_time: v.end_time,
                   session_type: type, batch_ids: picked };
    try {
      if (v.slot_id) await api.put(`/admin/timetable/${v.slot_id}`, body);
      else await api.post("/admin/timetable", body);
      toast("Saved.");
      onSaved(); onClose();
    } catch (e) { toast(e.message, "err"); setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={v.slot_id ? "Move this session" : "Schedule a session"}
           subtitle={ed.class.label}
           footer={<>
             {v.slot_id && <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => setRemoving(true)}>Remove</button>}
             <button className="btn" onClick={onClose}>Cancel</button>
             <button className="btn btn-primary" onClick={save}
                     disabled={busy || !v.assignment_id || !v.room_id || !v.end_time}>Save</button></>}>
      <div className="form-grid">
        <div className="field full"><label className="label">Subject and teacher</label>
          <select className="select" value={v.assignment_id || ""}
                  onChange={(e) => setV((o) => ({ ...o, assignment_id: e.target.value, session_type: "" }))}>
            <option value="">Choose…</option>
            {ed.assignments.map((a) => (
              <option key={a.assignment_id} value={a.assignment_id}>
                {a.subject_code}{a.lab_batch_code ? " · " + a.lab_batch_code : " · whole class"} — {a.teacher}
                {a.sessions ? ` (${a.sessions}/wk)` : ""}</option>))}
          </select>
          {ed.assignments.length === 0 && <span className="tiny" style={{ color: "var(--ochre)" }}>
            Nobody is assigned to teach this class yet — do that under Classes & teaching first.</span>}
        </div>
        <div className="field"><label className="label">Kind of session</label>
          <select className="select" value={type} onChange={set("session_type")}>
            {types.map(([t, name]) => <option key={t} value={t}>{name}</option>)}</select></div>
        <div className="field"><label className="label">Who attends</label>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", paddingTop: 6 }}>
            {ed.batches.map((b) => (
              <label key={b.lab_batch_id} className="row" style={{ gap: 5 }}>
                <input type="checkbox" checked={picked.includes(b.lab_batch_id)} onChange={() => toggle(b.lab_batch_id)} />
                {b.code}</label>))}
          </div>
          <span className="faint tiny">
            {picked.length ? "Only the ticked batches." :
             assignment?.lab_batch_code ? `None ticked: batch ${assignment.lab_batch_code}, as assigned.` : "None ticked: the whole class."}
          </span></div>
        <div className="field"><label className="label">Day</label>
          <select className="select" value={v.day_of_week} onChange={set("day_of_week")}>
            {DAYS.map((d) => <option key={d} value={d}>{NAMES[d]}</option>)}</select></div>
        <div className="field"><label className="label">Room</label>
          <select className="select" value={v.room_id || ""} onChange={set("room_id")}>
            <option value="">Choose…</option>
            {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.code} · {r.room_type === "LAB" ? "lab" : "lecture"}</option>)}
          </select></div>
        <div className="field"><label className="label">From</label>
          <select className="select" value={v.start_time} onChange={(e) => setV((o) => ({ ...o, start_time: e.target.value, end_time: "" }))}>
            {ed.periods.map((p) => <option key={p.period_id} value={p.start_time}>{p.label} · {p.start_time}</option>)}</select></div>
        <div className="field"><label className="label">To</label>
          <select className="select" value={v.end_time || ""} onChange={set("end_time")}>
            <option value="">Choose…</option>
            {ends.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <span className="faint tiny">A lab usually runs two periods.</span></div>
      </div>
      {removing && (
        <Confirm title="Remove this session from the week?" onClose={() => setRemoving(false)}
                 onConfirm={async () => { const r = await api.del(`/admin/timetable/${v.slot_id}`); toast(r.message); onSaved(); onClose(); }}>
          If lectures have already been held or cancelled in it, the history has to stay and this will be
          refused — move it to a new time instead.
        </Confirm>
      )}
    </Modal>
  );
}

export default function TimetableEditor() {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [section, setSection] = useState("");
  const [ed, setEd] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => { api.get("/admin/classes").then((c) => { setClasses(c); if (c.length) setSection(String(c[0].section_id)); }); }, []);
  const load = () => section && api.get(`/admin/timetable/${section}`).then(setEd).catch((e) => toast(e.message, "err"));
  useEffect(() => { setEd(null); load(); }, [section]);

  const unscheduled = ed ? ed.assignments.filter((a) => a.sessions === 0) : [];

  return (
    <Card className="pad">
      <div className="toolbar">
        <div><h2 className="section-title">Timetable</h2>
          <p className="page-sub" style={{ marginTop: 3 }}>The weekly pattern. Click an empty cell to add a session, or a session to move it.</p></div>
        <select className="select" style={{ width: "auto", minWidth: 240 }} value={section} onChange={(e) => setSection(e.target.value)}>
          {classes.map((c) => <option key={c.section_id} value={c.section_id}>{c.label}</option>)}</select>
      </div>

      {!ed ? <SkeletonRows rows={8} /> : ed.periods.length === 0 ? <Empty>Set up the periods of the day first (Organisation & calendar).</Empty> : (
        <>
          {unscheduled.length > 0 && (
            <div className="notice notice-warn" style={{ marginBottom: 14 }}>
              <b>Not on the timetable yet:</b>{" "}
              {unscheduled.map((a) => `${a.subject_code}${a.lab_batch_code ? " " + a.lab_batch_code : ""} (${a.teacher})`).join(", ")}
            </div>)}
          <div className="scroll-x">
            <div className="tt" style={{ gridTemplateColumns: `76px repeat(6, minmax(140px, 1fr))` }}>
              <div className="tt-corner" />
              {DAYS.map((d) => <div key={d} className="tt-head"><div className="label">{NAMES[d]}</div></div>)}
              {ed.periods.map((p) => (
                <div key={p.period_id} style={{ display: "contents" }}>
                  <div className="tt-time">{p.label}<div style={{ fontSize: 10 }}>{p.start_time}</div></div>
                  {DAYS.map((d) => {
                    const here = ed.sessions.filter((s) => s.day_of_week === d && s.start_time === p.start_time);
                    return (
                      <div key={d + p.period_id} className="tt-cell">
                        {here.map((s) => (
                          <motion.button key={s.slot_id} type="button"
                                         className={"slot" + (s.subject_type === "PRACTICAL" ? " slot-lab" : " slot-mine")}
                                         initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                         onClick={() => setEditing({ ...s, room_id: s.room_id, assignment_id: s.assignment_id,
                                                                     batch_ids: s.batch_ids ? s.batch_ids.split(",").map(Number) : [] })}>
                            <div className="slot-code">{s.subject_code}{s.lab_batch_code && <span className="faint" style={{ fontWeight: 400 }}> {s.lab_batch_code}</span>}</div>
                            {SESSION_KIND[s.session_type] && <div className="slot-kind">{SESSION_KIND[s.session_type]}</div>}
                            <div className="slot-meta mono">{s.start_time}–{s.end_time}</div>
                            <div className="slot-meta">{s.room_code}</div>
                            <div className="slot-meta-faint">{s.teacher_name}</div>
                          </motion.button>
                        ))}
                        <div className="tt-add" onClick={() => setEditing({ day_of_week: d, start_time: p.start_time, end_time: p.end_time })}>
                          <Plus size={13} /></div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {editing && <SessionDialog ed={ed} initial={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </Card>
  );
}
