import { motion } from "framer-motion";
import { useAuth } from "../auth.jsx";
import { shortDate } from "../ui.jsx";
import { SESSION_KIND } from "./lectures.jsx";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const NAMES = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday" };

function Slot({ s, onClick, index, myStaffId }) {
  const mine = s.staff_id === myStaffId && s.kind === "regular";
  let kind = "";
  if (s.kind === "cover") kind = " slot-cover";
  else if (s.kind === "makeup") kind = " slot-makeup";
  else if (mine) kind = " slot-mine";
  else if (s.subject_type === "PRACTICAL") kind = " slot-lab";

  const tone = { covered: "note-pine", conducted: "note-pine", pending: "note-ochre",
                 moved: "note-ochre", uncovered: "note-oxblood", makeup: "note-ink" }[s.state];

  return (
    <motion.button type="button" className={"slot" + kind + (s.state === "moved" || s.state === "uncovered" ? " slot-gone" : "")}
                   onClick={() => onClick && onClick(s)}
                   initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                   transition={{ duration: 0.22, delay: Math.min(index * 0.008, 0.2) }}>
      <div className="slot-code">
        {s.subject_code}
        {s.lab_batch_code && <span className="faint" style={{ fontWeight: 400 }}> {s.lab_batch_code}</span>}
      </div>
      {SESSION_KIND[s.session_type] && <div className="slot-kind">{SESSION_KIND[s.session_type]}</div>}
      <div className="slot-meta mono">{s.start_time}–{s.end_time}</div>
      <div className="slot-meta">{s.room_code}</div>
      <div className="slot-meta-faint">{s.state === "covered" || s.state === "conducted" ? s.actual_teacher : s.teacher_name}</div>
      {s.kind === "cover" && <div className="slot-note note-pine">Covering for {s.covering_for.split(" ")[0]}</div>}
      {s.kind !== "cover" && tone && s.state !== "conducted" && <div className={"slot-note " + tone}>{s.note}</div>}
      {s.state === "conducted" && <div className="slot-note note-pine">Conducted</div>}
    </motion.button>
  );
}

/* One week: a row per start time, a column per day, ruled like a printed
   schedule. A cell can hold several entries — three lab batches in one hour. */
export default function TimetableGrid({ sessions, dates, onPick, emptyText = "Nothing on the timetable this week." }) {
  const { me } = useAuth();
  if (!sessions.length) return <div className="empty">{emptyText}</div>;

  const times = [...new Set(sessions.map((s) => s.start_time))].sort();
  const days = DAYS.filter((d) => sessions.some((s) => s.day_of_week === d));
  let n = 0;

  return (
    <div className="scroll-x">
      <div className="tt" style={{ gridTemplateColumns: `68px repeat(${days.length}, minmax(160px, 1fr))` }}>
        <div className="tt-corner" />
        {days.map((d) => (
          <div key={d} className="tt-head">
            <div className="label">{NAMES[d]}</div>
            {dates && <div className="tiny faint" style={{ marginTop: 2 }}>{shortDate(dates[d])}</div>}
          </div>
        ))}
        {times.map((t) => (
          <div key={t} style={{ display: "contents" }}>
            <div className="tt-time">{t}</div>
            {days.map((d) => (
              <div key={d + t} className="tt-cell">
                {sessions.filter((s) => s.day_of_week === d && s.start_time === t).map((s) => (
                  <Slot key={(s.kind || "") + (s.slot_id || "") + (s.makeup_id || "") + s.date}
                        s={s} onClick={onPick} index={n++} myStaffId={me && me.staff_id} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
