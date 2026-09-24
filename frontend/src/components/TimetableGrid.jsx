import { motion } from "framer-motion";
import { getMyFacultyId } from "../api.js";
import { shortDate } from "../ui.jsx";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_NAMES = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday",
  THU: "Thursday", FRI: "Friday", SAT: "Saturday",
};

// Every distinct start time becomes a row of the grid.
function rowTimes(slots) {
  const times = [];
  slots.forEach((slot) => {
    if (!times.includes(slot.start_time)) times.push(slot.start_time);
  });
  return times.sort();
}

// Only show the days that actually have a class in them.
function columnDays(slots) {
  return DAYS.filter((day) => slots.some((slot) => slot.day_of_week === day));
}

function SlotCard({ slot, onClick, index }) {
  const mine = slot.faculty_id === getMyFacultyId();
  const covering = Boolean(slot.covering_for);
  const lab = slot.course_type === "PRACTICAL";
  const changes = slot.changes || [];

  let kind = "";
  if (covering) kind = " slot-cover";
  else if (mine) kind = " slot-mine";
  else if (lab) kind = " slot-lab";

  return (
    <motion.button
      type="button"
      className={"slot" + kind}
      onClick={() => onClick(slot)}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.012, 0.25) }}
      whileHover={{ scale: 1.022 }}
      whileTap={{ scale: 0.985 }}
      style={{ font: "inherit", color: "inherit", textAlign: "left", width: "100%" }}
    >
      <div className="slot-code">
        {slot.course_code}
        {slot.lab_batch_code && <span className="faint"> · {slot.lab_batch_code}</span>}
      </div>
      <div className="slot-meta">{slot.start_time}–{slot.end_time}</div>
      <div className="slot-meta">
        {slot.room_number} · Sec {slot.section_name}
      </div>
      <div className="slot-meta faint">{slot.faculty_name}</div>

      {covering && (
        <div className="slot-note note-green">
          You take this on {shortDate(slot.covering_date)}
        </div>
      )}

      {/* Dates where this lecture was handed to somebody else. */}
      {!covering && changes.map((change) => {
        const approved = change.assignment_status === "ASSIGNED";
        let text;
        if (approved) text = change.cancelled_by + " → " + change.substitute_name;
        else if (change.substitute_name) text = "waiting for " + change.substitute_name;
        else text = "no teacher free";
        return (
          <div key={change.cancellation_request_id}
               className={"slot-note " + (approved ? "note-green"
                          : change.substitute_name ? "note-amber" : "note-red")}>
            {shortDate(change.lecture_date)}: {text}
          </div>
        );
      })}
    </motion.button>
  );
}

function TimetableGrid({ slots, onSlotClick }) {
  const times = rowTimes(slots);
  const days = columnDays(slots);

  if (slots.length === 0) {
    return <div className="empty">No lectures to show.</div>;
  }

  let counter = 0;

  return (
    <div className="scroll-x">
      <div className="tt" style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(178px, 1fr))` }}>
        <div />
        {days.map((day) => (
          <div key={day} className="tt-day">{DAY_NAMES[day]}</div>
        ))}

        {times.map((time) => (
          <div key={time} style={{ display: "contents" }}>
            <div className="tt-time">{time}</div>
            {days.map((day) => {
              const here = slots.filter(
                (s) => s.day_of_week === day && s.start_time === time
              );
              return (
                <div key={day + time} className="tt-cell">
                  {here.map((slot) => (
                    <SlotCard
                      key={slot.timetable_slot_id + "-" + (slot.covering_date || "own")}
                      slot={slot}
                      onClick={onSlotClick}
                      index={counter++}
                    />
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
