import { motion } from "framer-motion";
import { getMyFacultyId } from "../api.js";
import { shortDate } from "../ui.jsx";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_NAMES = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday",
  THU: "Thursday", FRI: "Friday", SAT: "Saturday",
};

/* Every distinct start time becomes a row. */
function rowTimes(slots) {
  const times = [];
  slots.forEach((slot) => {
    if (!times.includes(slot.start_time)) times.push(slot.start_time);
  });
  return times.sort();
}

/* Only the days that actually hold a class. */
function columnDays(slots) {
  return DAYS.filter((day) => slots.some((slot) => slot.day_of_week === day));
}

function Slot({ slot, onClick, index }) {
  const mine = slot.faculty_id === getMyFacultyId();
  const covering = Boolean(slot.covering_for);
  const lab = slot.course_type === "PRACTICAL";
  const changes = slot.changes || [];

  let kind = "";
  if (covering) kind = " slot-cover";
  else if (mine) kind = " slot-mine";
  else if (lab) kind = " slot-lab";

  return (
    <motion.button type="button" className={"slot" + kind} onClick={() => onClick(slot)}
                   initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                   transition={{ duration: 0.22, delay: Math.min(index * 0.008, 0.2) }}>
      <div className="slot-code">
        {slot.course_code}
        {slot.lab_batch_code && <span className="faint" style={{ fontWeight: 400 }}> {slot.lab_batch_code}</span>}
      </div>
      <div className="slot-meta mono">{slot.start_time}–{slot.end_time}</div>
      <div className="slot-meta">{slot.room_number} · Sec {slot.section_name}</div>
      <div className="slot-meta-faint">{slot.faculty_name}</div>

      {covering && (
        <div className="slot-note note-pine">
          You are covering for {slot.covering_for.split(" ")[0]}
        </div>
      )}

      {/* Dates on which this lecture was handed to somebody else. */}
      {!covering && changes.map((change) => {
        const settled = change.assignment_status === "ASSIGNED";
        let tone = "note-oxblood";
        let text = "uncovered";
        if (settled) {
          tone = "note-pine";
          text = change.substitute_name + " is taking it";
        } else if (change.substitute_name) {
          tone = "note-ochre";
          text = "cancelled · awaiting " + change.substitute_name.split(" ")[0];
        } else {
          text = "cancelled · nobody free";
        }
        return (
          <div key={change.cancellation_request_id} className={"slot-note " + tone}>
            {text}
          </div>
        );
      })}
    </motion.button>
  );
}

function TimetableGrid({ slots, onSlotClick, dates }) {
  const times = rowTimes(slots);
  const days = columnDays(slots);

  if (slots.length === 0) return <div className="empty">No lectures to show.</div>;

  let counter = 0;

  return (
    <div className="scroll-x">
      <div className="tt" style={{ gridTemplateColumns: `68px repeat(${days.length}, minmax(168px, 1fr))` }}>
        <div className="tt-corner" />
        {days.map((day) => (
          <div key={day} className="tt-head">
            <div className="label">{DAY_NAMES[day]}</div>
            {dates && dates[day] && (
              <div className="tiny faint" style={{ marginTop: 2 }}>{shortDate(dates[day])}</div>
            )}
          </div>
        ))}

        {times.map((time) => (
          <div key={time} style={{ display: "contents" }}>
            <div className="tt-time">{time}</div>
            {days.map((day) => {
              const here = slots.filter((s) => s.day_of_week === day && s.start_time === time);
              return (
                <div key={day + time} className="tt-cell">
                  {here.map((slot) => (
                    <Slot key={slot.timetable_slot_id + "-" + (slot.covering_date || "own")}
                          slot={slot} onClick={onSlotClick} index={counter++} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TimetableGrid;
