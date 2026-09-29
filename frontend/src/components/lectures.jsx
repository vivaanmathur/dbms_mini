/*
 * How a single dated lecture is shown, used by every timetable and
 * dashboard so they all say the same thing the same way.
 */
import { motion } from "framer-motion";
import { shortDate } from "../ui.jsx";

export const STATE = {
  scheduled: { label: "Scheduled", tag: "tag" },
  conducted: { label: "Conducted", tag: "tag tag-pine" },
  covered:   { label: "Covered",   tag: "tag tag-pine" },
  pending:   { label: "Awaiting",  tag: "tag tag-ochre" },
  uncovered: { label: "No teacher", tag: "tag tag-oxblood" },
  moved:     { label: "Moved",     tag: "tag tag-ochre" },
  makeup:    { label: "Make-up",   tag: "tag tag-ink" },
};

export function StateTag({ state }) {
  const s = STATE[state] || STATE.scheduled;
  return <span className={s.tag}>{s.label}</span>;
}

/* "DBMS · G2" */
export function subjectLabel(l) {
  return l.subject_code + (l.lab_batch_code ? " · " + l.lab_batch_code : "");
}

/* One line in a list of lectures — today's classes, this week's changes. */
export function LectureRow({ lecture, showClass = true, showDate = false, index = 0, onClick, extra }) {
  const teacher = lecture.actual_teacher;
  return (
    <motion.div className="lecture" onClick={onClick}
                style={{ cursor: onClick ? "pointer" : "default" }}
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.035, 0.3), duration: 0.24 }}>
      <div className="lecture-time">
        {showDate && <div style={{ color: "var(--ink-2)" }}>{shortDate(lecture.date)}</div>}
        {lecture.start_time}<br />{lecture.end_time}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="bold" style={{ fontSize: 13.2 }}>
          {subjectLabel(lecture)}
          <span className="faint" style={{ fontWeight: 400 }}>
            {" · "}{lecture.room_code}{showClass ? " · " + lecture.class_label : ""}
          </span>
        </div>
        <div className="tiny muted" style={{ marginTop: 2 }}>
          {lecture.kind === "cover" && <>Covering for {lecture.covering_for} · </>}
          {lecture.note || (teacher ? teacher : "")}
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {extra}
        <StateTag state={lecture.state} />
      </div>
    </motion.div>
  );
}
