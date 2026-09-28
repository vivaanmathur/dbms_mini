import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, Check } from "lucide-react";
import { apiGet, apiPost } from "../api.js";
import { Modal, useToast, shortDate, SkeletonRows } from "../ui.jsx";

/*
 * The recovery planner.
 *
 * It asks the backend for every slot in the next fortnight where the class,
 * the teacher and a suitable room are all genuinely free, and shows the best
 * few with the reasoning behind each score. Nothing is guessed: if only
 * Saturday works, the list says only Saturday works, and why.
 */
function RecoveryDialog({ item, onClose, onDone }) {
  const [data, setData] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    apiGet(`/recovery/options?timetable_slot_id=${item.timetable_slot_id}` +
           `&lecture_date=${item.lecture_date}`)
      .then(setData)
      .catch((err) => toast(err.message, "err"));
  }, [item.timetable_slot_id, item.lecture_date]);

  async function accept() {
    if (!chosen) return;
    setBusy(true);
    try {
      const result = await apiPost("/recovery/accept", {
        timetable_slot_id: item.timetable_slot_id,
        missed_on: item.lecture_date,
        date: chosen.date,
        start_time: chosen.start_time,
        end_time: chosen.end_time,
        room_number: chosen.room_number,
      });
      toast(result.message);
      onDone();
      onClose();
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setBusy(false);
    }
  }

  const options = data ? data.options : [];

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Recovery planner"
      subtitle={`${item.course_code} · Section ${item.section_name}` +
                `${item.lab_batch_code ? " / " + item.lab_batch_code : ""} · ` +
                `missed on ${shortDate(item.lecture_date)}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={accept} disabled={!chosen || busy}>
            <CalendarPlus size={14} />
            {chosen ? `Schedule ${shortDate(chosen.date)} ${chosen.start_time}` : "Pick a slot"}
          </button>
        </>
      }
    >
      {!data ? <SkeletonRows rows={4} /> : (
        <>
          <p className="muted tiny" style={{ margin: 0 }}>
            Every slot in the next {data.searched_days} days was checked against
            three hard rules — the class free, the teacher free, a room of the
            right kind free. <b>{data.total_found}</b> slot{data.total_found === 1 ? "" : "s"} passed.
          </p>

          {options.length === 0 ? (
            <div className="card-sunk pad-sm tiny">
              Nothing in the next {data.searched_days} days works for this class.
              The hour would have to come out of a free period the section does
              not currently have, or the search needs widening.
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {options.map((option, index) => {
                const on = chosen && chosen.date === option.date
                        && chosen.start_time === option.start_time;
                return (
                  <motion.button
                    key={option.date + option.start_time}
                    type="button"
                    className={"cand" + (on ? " cand-on" : "")}
                    onClick={() => setChosen(option)}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04, duration: 0.24 }}
                  >
                    <span className="avatar" style={{ width: 42 }}>
                      <span className="display" style={{ fontSize: 15 }}>{option.score}</span>
                    </span>

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="bold" style={{ fontSize: 13.2 }}>
                        {option.day_of_week} {shortDate(option.date)}
                        <span className="mono faint" style={{ marginLeft: 7 }}>
                          {option.start_time}–{option.end_time}
                        </span>
                        <span className="faint"> · {option.room_number}</span>
                      </span>
                      <span className="tiny faint" style={{ display: "block", marginTop: 2 }}>
                        {option.notes.join(" · ")}
                      </span>
                    </span>

                    {on && <Check size={15} />}
                  </motion.button>
                );
              })}
            </div>
          )}

          <p className="faint tiny" style={{ margin: 0 }}>
            The score starts at 100 and moves for each reason listed — sooner is
            better, the usual room is better, late evenings and Saturdays are
            worse. A chosen slot is recorded against the missed date as a
            rescheduled lecture.
          </p>
        </>
      )}
    </Modal>
  );
}

export default RecoveryDialog;
