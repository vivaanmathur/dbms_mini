import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, UserCheck, Ban, Sparkles, CalendarX2, ClipboardCheck } from "lucide-react";
import { apiGet, apiPost, getMyFacultyId } from "../api.js";
import { Modal, useToast, initials, nextDateFor, shortDate } from "../ui.jsx";

/*
 * What opens when a lecture on the timetable is clicked.
 *
 * Two things can be done here:
 *   - mark the lecture as conducted, and
 *   - hand it to another teacher for one date, choosing who yourself.
 */
function SlotDialog({ slot, onClose, onChanged }) {
  const myId = getMyFacultyId();
  const mine = slot.faculty_id === myId;
  const covering = Boolean(slot.covering_for);
  const changes = slot.changes || [];
  const logs = slot.logs || [];

  const [date, setDate] = useState(slot.covering_date || nextDateFor(slot.day_of_week));
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState("view");       // view | delegate
  const [candidates, setCandidates] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [chosen, setChosen] = useState(null);     // null = let the system decide
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Load who this lecture could be handed to, whenever the date changes.
  useEffect(() => {
    if (mode !== "delegate") return;
    let cancelled = false;
    setCandidates(null);
    apiGet(`/delegate/candidates?timetable_slot_id=${slot.timetable_slot_id}&lecture_date=${date}`)
      .then((data) => {
        if (cancelled || !data) return;
        setCandidates(data.candidates);
        setSuggested(data.suggested_faculty_id);
      })
      .catch((err) => toast(err.message, "err"));
    return () => { cancelled = true; };
  }, [mode, date, slot.timetable_slot_id]);

  const takenByElse = changes.some(
    (c) => c.lecture_date === date && c.assignment_status === "ASSIGNED"
  );
  const iAmSubstitute = changes.some(
    (c) => c.lecture_date === date && c.assignment_status === "ASSIGNED"
         && c.substitute_faculty_id === myId
  );
  const canMarkConducted = (mine && !takenByElse) || iAmSubstitute || covering;

  async function handOver() {
    if (reason.trim() === "") { toast("Please write a reason", "err"); return; }
    setBusy(true);
    try {
      const result = await apiPost("/cancel-lecture", {
        timetable_slot_id: slot.timetable_slot_id,
        lecture_date: date,
        reason,
        delegate_to_faculty_id: chosen,
      });
      toast(result.message);
      onChanged();
      onClose();
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function markConducted() {
    setBusy(true);
    try {
      const result = await apiPost("/mark-conducted", {
        timetable_slot_id: slot.timetable_slot_id,
        lecture_date: date,
        remarks: "",
      });
      toast(result.message);
      onChanged();
      onClose();
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setBusy(false);
    }
  }

  const footer = mode === "delegate" ? (
    <>
      <button className="btn" onClick={() => setMode("view")}>Back</button>
      <button className="btn btn-primary" onClick={handOver} disabled={busy}>
        {chosen
          ? "Send request"
          : <><Sparkles size={14} /> Let the system choose</>}
      </button>
    </>
  ) : (
    <>
      <button className="btn" onClick={onClose}>Close</button>
      {canMarkConducted && (
        <button className="btn" onClick={markConducted} disabled={busy}>
          <ClipboardCheck size={14} /> Mark as conducted
        </button>
      )}
      {mine && (
        <button className="btn btn-danger" onClick={() => setMode("delegate")}>
          <CalendarX2 size={14} /> Cannot take it
        </button>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      wide={mode === "delegate"}
      title={slot.course_code + " · " + slot.course_name}
      subtitle={`${slot.day_of_week} ${slot.start_time}–${slot.end_time} · Room ${slot.room_number} · Section ${slot.section_name}${slot.lab_batch_code ? " / " + slot.lab_batch_code : ""}`}
      footer={footer}
    >
      <AnimatePresence mode="wait">
        {mode === "view" ? (
          <motion.div key="view" className="stack"
                      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>

            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="tag tag-ink">{slot.faculty_name}{mine ? " (you)" : ""}</span>
              <span className="tag">{slot.course_type === "PRACTICAL" ? "Lab" : "Theory"}</span>
              {covering && <span className="tag tag-pine">You cover this on {shortDate(slot.covering_date)}</span>}
            </div>

            {covering && (
              <div className="card-sunk pad-sm tiny">
                You agreed to take this class instead of <b>{slot.covering_for}</b> on{" "}
                <b>{shortDate(slot.covering_date)}</b>. Mark it conducted once you have taken it.
              </div>
            )}

            {changes.length > 0 && (
              <div className="stack" style={{ gap: 7 }}>
                <div className="label">HANDED OVER ON</div>
                {changes.map((c) => (
                  <div key={c.cancellation_request_id} className="card-sunk pad-sm tiny">
                    <b>{shortDate(c.lecture_date)}</b> — {c.cancelled_by} could not take it ({c.reason}).{" "}
                    {c.substitute_name
                      ? <span className={"tag " + (c.assignment_status === "ASSIGNED" ? "tag-pine" : "tag-ochre")}>
                          {c.substitute_name}{c.assignment_status === "ASSIGNED" ? " is taking it" : " has not replied"}
                        </span>
                      : <span className="tag tag-oxblood">nobody free</span>}
                  </div>
                ))}
              </div>
            )}

            {logs.length > 0 && (
              <div className="stack" style={{ gap: 7 }}>
                <div className="label">ALREADY CONDUCTED</div>
                {logs.map((log) => (
                  <div key={log.lecture_log_id} className="card-sunk pad-sm tiny">
                    <b>{shortDate(log.lecture_date)}</b> — taken by {log.delivered_by} ({log.actual_hours_taken} hrs)
                  </div>
                ))}
              </div>
            )}

            <div className="field">
              <label className="label" htmlFor="slot-date">DATE OF THIS LECTURE</label>
              <input id="slot-date" className="input" type="date" value={date}
                     onChange={(e) => setDate(e.target.value)} />
              <span className="faint tiny">This lecture runs every {slot.day_of_week}.</span>
            </div>

            {!mine && !covering && (
              <div className="card-sunk pad-sm tiny muted">
                This is {slot.faculty_name}'s lecture. Only they can hand it over.
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="delegate" className="stack"
                      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}>

            <div className="field">
              <label className="label" htmlFor="hand-date">WHICH DATE</label>
              <input id="hand-date" className="input" type="date" value={date}
                     onChange={(e) => { setDate(e.target.value); setChosen(null); }} />
            </div>

            <div className="field">
              <label className="label" htmlFor="hand-reason">WHY YOU CANNOT TAKE IT</label>
              <input id="hand-reason" className="input" value={reason}
                     onChange={(e) => setReason(e.target.value)}
                     placeholder="On leave / attending a conference" />
            </div>

            <div className="field">
              <div className="between">
                <span className="label">WHO SHOULD TAKE IT</span>
                {chosen && (
                  <button className="btn btn-sm btn-quiet" onClick={() => setChosen(null)}>
                    Clear choice
                  </button>
                )}
              </div>
              <span className="faint tiny" style={{ marginBottom: 4 }}>
                Teachers of this subject are listed first. Pick anyone, or leave it
                unpicked and the system sends it to the fairest free teacher.
              </span>

              {candidates === null
                ? <div className="faint tiny" style={{ padding: 12 }}>Checking who is free...</div>
                : (
                  <div className="stack" style={{ gap: 7, maxHeight: 320, overflowY: "auto", paddingRight: 3 }}>
                    {candidates.map((person, index) => (
                      <motion.button
                        key={person.faculty_id}
                        type="button"
                        className={"cand" + (chosen === person.faculty_id ? " cand-on" : "")}
                        disabled={!person.is_free}
                        onClick={() => setChosen(person.faculty_id)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, delay: Math.min(index * 0.025, 0.3) }}
                      >
                        <span className="avatar">{initials(person.name)}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                            <b style={{ fontSize: 13.3 }}>{person.name}</b>
                            {person.teaches_subject && (
                              <span className="tag tag-ink">teaches {slot.course_code}</span>
                            )}
                            {person.faculty_id === suggested && !chosen && (
                              <span className="tag tag-pine">suggested</span>
                            )}
                          </span>
                          <span className="tiny faint" style={{ display: "block" }}>
                            {person.reason} · {person.lectures_taken} lectures taken
                          </span>
                        </span>
                        {chosen === person.faculty_id
                          ? <Check size={16} color="#a5b4fc" />
                          : person.is_free ? <UserCheck size={15} className="faint" />
                                           : <Ban size={15} className="faint" />}
                      </motion.button>
                    ))}
                  </div>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

export default SlotDialog;
