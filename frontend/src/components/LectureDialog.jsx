import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, CalendarX2, Check, ClipboardCheck, Undo2, UserCheck } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { asYearMonthDay, initials, Modal, shortDate, SkeletonRows, useToast } from "../ui.jsx";
import { StateTag, subjectLabel } from "./lectures.jsx";

/*
 * What opens when a lecture is clicked. What you can do depends on who you
 * are to that lecture on that date:
 *   its own teacher, before it happens   — hand it over, or take it back
 *   whoever is teaching it, after        — record it, and what it covered
 *   anyone else                          — read it
 */
export default function LectureDialog({ lecture, onClose, onChanged }) {
  const { me } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState("view");
  const [busy, setBusy] = useState(false);

  // Compare the real moment, not just the date: a 13:30 lecture today has
  // already started by the evening, and a 16:45 one has not yet ended at noon.
  const now = new Date();
  const today = asYearMonthDay(now);
  const clock = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const started = lecture.date < today || (lecture.date === today && lecture.start_time <= clock);
  const past = lecture.date < today || (lecture.date === today && lecture.end_time <= clock);
  const isOwn = lecture.kind === "regular" && lecture.staff_id === me.staff_id;
  const teachingIt = lecture.actual_staff_id === me.staff_id;

  const canHandOver = isOwn && lecture.state === "scheduled" && !started;
  const canWithdraw = isOwn && ["pending", "uncovered", "covered"].includes(lecture.state) && !started;
  const canLog = past && teachingIt && lecture.kind !== "makeup" &&
                 ["scheduled", "covered"].includes(lecture.state);
  const canHoldMakeup = lecture.kind === "makeup" && teachingIt && past && lecture.status === "PLANNED";

  async function run(fn, message) {
    setBusy(true);
    try {
      const r = await fn();
      toast((r && r.message) || message);
      onChanged();
      onClose();
    } catch (e) {
      toast(e.message, "err");
      setBusy(false);
    }
  }

  const footer = mode === "view" ? (
    <>
      <button className="btn" onClick={onClose}>Close</button>
      {canWithdraw && (
        <button className="btn" disabled={busy}
                onClick={() => run(() => api.post(`/handover/${lecture.cancellation.cancellation_id}/withdraw`))}>
          <Undo2 size={13} /> I can take it after all
        </button>
      )}
      {canHoldMakeup && (
        <button className="btn btn-primary" disabled={busy}
                onClick={() => run(() => api.post(`/insight/makeup/${lecture.makeup_id}/delivered`))}>
          <ClipboardCheck size={13} /> Mark held
        </button>
      )}
      {canLog && (
        <button className="btn btn-primary" onClick={() => setMode("log")}>
          <ClipboardCheck size={13} /> Mark conducted
        </button>
      )}
      {canHandOver && (
        <button className="btn btn-danger" onClick={() => setMode("handover")}>
          <CalendarX2 size={13} /> Cannot take it
        </button>
      )}
    </>
  ) : null;

  return (
    <Modal open onClose={onClose} wide={mode !== "view"}
           title={`${lecture.subject_code} · ${lecture.subject_name}`}
           subtitle={`${lecture.class_label}${lecture.lab_batch_code ? " · batch " + lecture.lab_batch_code : ""}`}
           footer={footer}>
      <AnimatePresence mode="wait">
        {mode === "view" && (
          <motion.div key="view" className="stack" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
            <div className="stats">
              <div className="stat"><div className="label">When</div>
                <div className="bold" style={{ marginTop: 4 }}>{lecture.day_of_week} {shortDate(lecture.date)}</div>
                <div className="mono faint">{lecture.start_time}–{lecture.end_time}</div></div>
              <div className="stat"><div className="label">Where</div>
                <div className="bold" style={{ marginTop: 4 }}>{lecture.room_code}</div>
                <div className="faint tiny">{lecture.room_type === "LAB" ? "Laboratory" : "Classroom"}</div></div>
              <div className="stat"><div className="label">Status</div>
                <div style={{ marginTop: 6 }}><StateTag state={lecture.state} /></div></div>
            </div>

            <div className="notice notice-plain">
              {lecture.kind === "cover" && <>You agreed to take this instead of <b>{lecture.covering_for}</b>. </>}
              {lecture.kind === "makeup" && <>A make-up for {subjectLabel(lecture)} missed on {shortDate(lecture.replaces_date)}. </>}
              {lecture.note || <>Normally taught by <b>{lecture.teacher_name}</b>{isOwn ? " (you)" : ""}.</>}
              {lecture.cancellation && lecture.cancellation.reason && (
                <div className="faint tiny" style={{ marginTop: 4 }}>Reason given: {lecture.cancellation.reason}</div>
              )}
              {lecture.log && lecture.log.remarks && (
                <div className="faint tiny" style={{ marginTop: 4 }}>Remarks: {lecture.log.remarks}</div>
              )}
            </div>

            {!canHandOver && !canLog && !canWithdraw && !canHoldMakeup && (
              <p className="faint tiny" style={{ margin: 0 }}>
                {isOwn && !past && lecture.state === "scheduled" ? "" :
                 isOwn && past && lecture.state === "scheduled" ? "" :
                 !isOwn && !teachingIt ? "You can see this lecture, but it is not yours to change." :
                 lecture.state === "conducted" ? "This lecture has been recorded." :
                 !past && teachingIt ? "You can record it once it has happened." : ""}
              </p>
            )}
          </motion.div>
        )}
        {mode === "handover" && (
          <HandOver key="handover" lecture={lecture} onBack={() => setMode("view")}
                    onDone={() => { onChanged(); onClose(); }} />
        )}
        {mode === "log" && (
          <LogLecture key="log" lecture={lecture} onBack={() => setMode("view")}
                      onDone={() => { onChanged(); onClose(); }} />
        )}
      </AnimatePresence>
    </Modal>
  );
}

/* -------------------------------------------------------------- hand over */
function HandOver({ lecture, onBack, onDone }) {
  const toast = useToast();
  const [people, setPeople] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/handover/candidates?slot_id=${lecture.slot_id}&lecture_date=${lecture.date}`)
      .then((d) => { setPeople(d.candidates); setSuggested(d.suggested_staff_id); })
      .catch((e) => toast(e.message, "err"));
  }, [lecture.slot_id, lecture.date]);

  async function send() {
    if (!reason.trim()) { toast("Say briefly why you cannot take it.", "err"); return; }
    setBusy(true);
    try {
      const r = await api.post("/handover", { slot_id: lecture.slot_id, lecture_date: lecture.date,
                                              reason, delegate_to_staff_id: chosen });
      toast(r.message);
      onDone();
    } catch (e) {
      toast(e.message, "err");
      setBusy(false);
    }
  }

  return (
    <motion.div className="stack" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.18 }}>
      <div className="notice notice-plain">
        Handing over <b>{subjectLabel(lecture)}</b> on <b>{lecture.day_of_week} {shortDate(lecture.date)}</b>,{" "}
        {lecture.start_time}–{lecture.end_time}.
      </div>
      <div className="field">
        <label className="label" htmlFor="why">Why you cannot take it</label>
        <input id="why" className="input" value={reason} onChange={(e) => setReason(e.target.value)}
               placeholder="On leave / attending a conference" autoFocus />
      </div>
      <div className="field">
        <div className="between">
          <span className="label">Who should take it</span>
          {chosen && <button className="btn btn-quiet btn-sm" onClick={() => setChosen(null)}>Clear choice</button>}
        </div>
        <span className="faint tiny" style={{ marginBottom: 4 }}>
          Teachers of this subject come first. Pick anyone free, or leave it and the system asks the
          free teacher who has taught the fewest lectures this term.
        </span>
        {people === null ? <SkeletonRows rows={4} /> : (
          <div className="stack" style={{ gap: 7, maxHeight: 300, overflowY: "auto", paddingRight: 3 }}>
            {people.map((p, i) => (
              <motion.button key={p.staff_id} type="button" disabled={!p.is_free}
                             className={"cand" + (chosen === p.staff_id ? " cand-on" : "")}
                             onClick={() => setChosen(p.staff_id)}
                             initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                             transition={{ delay: Math.min(i * 0.025, 0.3) }}>
                <span className="avatar">{initials(p.name)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 13.2 }}>{p.name}</b>
                    {p.teaches_subject && <span className="tag tag-ink">teaches {lecture.subject_code}</span>}
                    {p.staff_id === suggested && !chosen && <span className="tag tag-pine">suggested</span>}
                  </span>
                  <span className="tiny faint" style={{ display: "block" }}>
                    {p.reason} · {p.lectures_taken} lectures this term
                  </span>
                </span>
                {chosen === p.staff_id ? <Check size={15} /> :
                 p.is_free ? <UserCheck size={15} className="faint" /> : <Ban size={15} className="faint" />}
              </motion.button>
            ))}
          </div>
        )}
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={send} disabled={busy}>
          {chosen ? "Send request" : "Let the system choose"}
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------ record the lecture */
function LogLecture({ lecture, onBack, onDone }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [picked, setPicked] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/syllabus/lecture-options?slot_id=${lecture.slot_id}`).then(setItems)
      .catch((e) => { toast(e.message, "err"); setItems([]); });
  }, [lecture.slot_id]);

  const toggle = (item) => setPicked((p) =>
    p.some((x) => x.id === item.id && x.kind === item.kind)
      ? p.filter((x) => !(x.id === item.id && x.kind === item.kind)) : [...p, item]);

  async function save() {
    setBusy(true);
    try {
      const r = await api.post("/lectures/conducted", {
        slot_id: lecture.slot_id, lecture_date: lecture.date, remarks,
        subtopic_ids: picked.filter((p) => p.kind === "subtopic").map((p) => p.id),
        experiment_ids: picked.filter((p) => p.kind === "experiment").map((p) => p.id),
      });
      toast(r.message);
      onDone();
    } catch (e) {
      toast(e.message, "err");
      setBusy(false);
    }
  }

  // the not-yet-covered items, grouped by where they sit in the syllabus
  const groups = {};
  (items || []).forEach((i) => { (groups[i.group] = groups[i.group] || []).push(i); });
  const firstGroups = Object.keys(groups).slice(0, 4);

  return (
    <motion.div className="stack" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.18 }}>
      <div className="notice notice-plain">
        Recording <b>{subjectLabel(lecture)}</b> on <b>{lecture.day_of_week} {shortDate(lecture.date)}</b>.
        Tick what this lecture covered — it goes straight onto the syllabus.
      </div>
      {items === null ? <SkeletonRows rows={5} /> : items.length === 0 ? (
        <div className="empty">Everything in this syllabus is already covered.</div>
      ) : (
        <div style={{ maxHeight: 290, overflowY: "auto", paddingRight: 3 }}>
          {firstGroups.map((g) => (
            <div key={g}>
              <div className="topic-title" style={{ margin: "8px 0 3px" }}>{g}</div>
              {groups[g].map((item) => {
                const on = picked.some((p) => p.id === item.id && p.kind === item.kind);
                return (
                  <div key={item.kind + item.id} className={"tick" + (on ? " tick-done-pick" : "")}
                       onClick={() => toggle(item)}>
                    <span className={"box" + (on ? " box-on" : "")}>
                      {on && <Check size={11} color="var(--on-ink)" strokeWidth={3} />}
                    </span>
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          ))}
          {Object.keys(groups).length > 4 && (
            <p className="faint tiny">Later units are hidden — the syllabus page has the full list.</p>
          )}
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor="rem">Remarks (optional)</label>
        <input id="rem" className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)}
               placeholder="Anything worth keeping on record" />
      </div>
      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
        <span className="faint tiny">{picked.length} item{picked.length === 1 ? "" : "s"} ticked</span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={onBack}>Back</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>Save to the record</button>
        </div>
      </div>
    </motion.div>
  );
}
