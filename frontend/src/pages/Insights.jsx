import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TriangleAlert, Scale, CalendarDays, Wand2, ChevronDown, DoorOpen,
} from "lucide-react";
import Shell from "../components/Shell.jsx";
import RecoveryDialog from "../components/RecoveryDialog.jsx";
import {
  Card, Bar, Empty, useToast, shortDate, initials, Figure, SkeletonRows,
  asYearMonthDay,
} from "../ui.jsx";
import { apiGet } from "../api.js";

const TABS = [
  { id: "risk",  label: "Syllabus risk",     Icon: TriangleAlert },
  { id: "alloc", label: "Resource allocation", Icon: Scale },
  { id: "day",   label: "Day view",          Icon: CalendarDays },
];

const BAND_TAG = {
  "critical":       "tag tag-oxblood",
  "at risk":        "tag tag-oxblood",
  "watch":          "tag tag-ochre",
  "on track":       "tag tag-pine",
  "not timetabled": "tag",
  "unknown":        "tag",
};

/* ------------------------------------------------------------------ risk */

function RiskRow({ subject, index, onPlan }) {
  const [open, setOpen] = useState(false);
  const behind = subject.gap !== null && subject.gap > 0;

  return (
    <motion.div className="unit"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.26 }}>
      <div className="unit-head" onClick={() => setOpen(!open)}>
        <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }}
                     style={{ display: "grid", placeItems: "center" }}>
          <ChevronDown size={15} className="faint" />
        </motion.span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="bold">{subject.course_code}</span>
            <span className="faint tiny">Sec {subject.section_name}</span>
            <span className={BAND_TAG[subject.band]}>{subject.band}</span>
            {subject.uncovered > 0 && (
              <span className="tag tag-oxblood">{subject.uncovered} uncovered</span>
            )}
          </span>
          <span className="tiny faint" style={{ display: "block", marginTop: 2 }}>
            {subject.completed_items}/{subject.total_items} items ·{" "}
            {Number(subject.delivered_hours)}/{Number(subject.total_planned_hours)} hrs delivered
          </span>
        </span>

        <span style={{ width: 150, flex: "none" }}>
          <span className="between tiny" style={{ marginBottom: 3 }}>
            <span className="faint">{Number(subject.percent_complete).toFixed(0)}%</span>
            {behind && <span style={{ color: "var(--oxblood)" }}>−{subject.gap}</span>}
          </span>
          <Bar percent={subject.percent_complete} />
        </span>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
                      style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 0 14px 32px" }}>
              <div className="label" style={{ marginBottom: 6 }}>Why</div>
              <ul className="stack tiny muted" style={{ gap: 5, margin: 0, paddingLeft: 16 }}>
                {subject.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
              </ul>
              {subject.weeks_needed !== null && (
                <div className="tiny faint" style={{ marginTop: 8 }}>
                  Pace so far suggests {subject.weeks_needed} more weeks are needed;
                  {" "}{subject.weeks_left} weeks of term remain.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RiskTab({ onPlan }) {
  const [data, setData] = useState(null);
  const [work, setWork] = useState(null);
  const toast = useToast();

  function load() {
    apiGet("/risk").then(setData).catch((e) => toast(e.message, "err"));
    apiGet("/coordinator").then(setWork).catch((e) => toast(e.message, "err"));
  }
  useEffect(load, []);

  if (!data) return <Card className="pad"><SkeletonRows rows={7} /></Card>;

  const counts = {};
  data.subjects.forEach((s) => { counts[s.band] = (counts[s.band] || 0) + 1; });
  const term = data.term;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card className="pad">
        <div className="between" style={{ alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <div className="label">Term progress</div>
            <div className="row" style={{ gap: 6, alignItems: "baseline", marginTop: 4 }}>
              <Figure value={term.weeks_elapsed} />
              <span className="faint" style={{ fontFamily: "var(--serif)", fontSize: 18 }}>
                /{term.weeks_total} weeks
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="label">Every class should be about</div>
            <div className="row" style={{ gap: 3, alignItems: "baseline", justifyContent: "flex-end", marginTop: 4 }}>
              <Figure value={data.expected_percent} suffix="%" />
              <span className="faint tiny">covered by now</span>
            </div>
          </div>
        </div>
        <Bar percent={term.fraction_elapsed * 100} />
        <div className="tiny faint" style={{ marginTop: 9 }}>
          {term.term_start} to {term.term_end} · {term.weeks_left} weeks left.
          A subject is flagged when its syllabus coverage falls behind the share
          of the term that has gone.
        </div>
      </Card>

      <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {["critical", "at risk", "watch", "on track", "not timetabled"].map((band, i) => (
          <Card key={band} className="pad" delay={i * 0.04}>
            <Figure value={counts[band] || 0} />
            <div className="stat-label" style={{ marginTop: 2 }}>{band}</div>
          </Card>
        ))}
      </div>

      {work && work.needs_action.length > 0 && (
        <Card className="pad" delay={0.1}>
          <div className="row" style={{ gap: 9, marginBottom: 3 }}>
            <Wand2 size={16} className="muted" />
            <h2 className="section-title">Needs arranging</h2>
          </div>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Cancelled lectures with nobody teaching them, or still waiting on a
            reply. The planner finds a slot where the class, the teacher and a
            room are all free.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Lecture</th><th>Date</th><th>State</th><th></th></tr>
              </thead>
              <tbody>
                {work.needs_action.map((row) => (
                  <tr key={row.cancellation_request_id}>
                    <td>
                      <div className="bold">
                        {row.course_code}
                        <span className="faint"> · Sec {row.section_name}
                          {row.lab_batch_code ? " / " + row.lab_batch_code : ""}</span>
                      </div>
                      <div className="tiny faint">
                        {row.day_of_week} {row.start_time}–{row.end_time} · {row.room_number} ·
                        normally {row.scheduled_teacher}
                      </div>
                    </td>
                    <td>{shortDate(row.lecture_date)}</td>
                    <td>
                      {row.state === "uncovered"
                        ? <span className="tag tag-oxblood">no teacher</span>
                        : <span className="tag tag-ochre">awaiting {row.substitute_name?.split(" ")[0]}</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-sm" onClick={() => onPlan(row, load)}>
                        <Wand2 size={13} /> Plan recovery
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="pad" delay={0.14}>
        <h2 className="section-title">Every class</h2>
        <p className="page-sub" style={{ marginBottom: 10 }}>
          Ordered worst first. Open a row to see exactly why it is flagged.
        </p>
        {data.subjects.map((subject, index) => (
          <RiskRow key={subject.section_course_offering_id} subject={subject}
                   index={index} onPlan={onPlan} />
        ))}
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- allocation */

function AllocTab() {
  const [data, setData] = useState(null);
  const toast = useToast();

  useEffect(() => {
    apiGet("/allocation").then(setData).catch((e) => toast(e.message, "err"));
  }, []);

  if (!data) return <Card className="pad"><SkeletonRows rows={7} /></Card>;

  const tone = { high: "tag tag-oxblood", medium: "tag tag-ochre", low: "tag" };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card className="pad">
        <h2 className="section-title">What needs attention</h2>
        <p className="page-sub" style={{ marginBottom: 14 }}>
          Worked out from the timetable, each teacher's contracted weekly limit
          and how often each room is booked.
        </p>
        {data.findings.length === 0 ? <Empty>Nothing is out of balance.</Empty> : (
          <div className="stack" style={{ gap: 9 }}>
            {data.findings.map((finding, index) => (
              <motion.div key={index} className="card-sunk pad-sm"
                          initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05, duration: 0.26 }}>
                <div className="row" style={{ gap: 9, marginBottom: 3 }}>
                  <span className={tone[finding.severity]}>{finding.severity}</span>
                  <span className="bold" style={{ fontSize: 13 }}>{finding.title}</span>
                </div>
                <div className="tiny muted">{finding.detail}</div>
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      <Card className="pad" delay={0.06}>
        <h2 className="section-title">Teaching load against contract</h2>
        <p className="page-sub" style={{ marginBottom: 16 }}>
          Scheduled hours a week, against each teacher's
          <code> max_weekly_workload_hours</code>.
        </p>
        <div className="stack" style={{ gap: 11 }}>
          {data.staff.map((person, index) => (
            <motion.div key={person.faculty_id} className="row" style={{ gap: 11 }}
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.035, duration: 0.26 }}>
              <span className="avatar">{initials(person.name)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>
                    {person.name}
                    <span className="faint tiny"> · {person.weekly_classes} classes · {person.subjects} subjects</span>
                  </span>
                  <span className="tiny" style={{
                    color: person.headroom < 0 ? "var(--oxblood)" : "var(--ink-3)",
                  }}>
                    {person.weekly_hours}/{person.max_weekly_workload_hours} hrs
                    {person.headroom < 0
                      ? ` · ${Math.abs(person.headroom)} over`
                      : ` · ${person.headroom} spare`}
                  </span>
                </span>
                <Bar percent={person.load_percent} />
              </span>
            </motion.div>
          ))}
        </div>
      </Card>

      <Card className="pad" delay={0.12}>
        <div className="row" style={{ gap: 9, marginBottom: 3 }}>
          <DoorOpen size={16} className="muted" />
          <h2 className="section-title">Room use</h2>
        </div>
        <p className="page-sub" style={{ marginBottom: 14 }}>
          Against {data.week_capacity} bookable slots a week
          ({data.periods_per_day} periods × {data.teaching_days} days).
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Room</th><th>Type</th><th>Seats</th><th>Booked</th><th style={{ width: 180 }}>Use</th></tr>
            </thead>
            <tbody>
              {data.rooms.map((room) => (
                <tr key={room.classroom_id}>
                  <td className="bold">{room.room_number}</td>
                  <td className="muted tiny">{room.room_type === "LAB" ? "Lab" : "Lecture"}</td>
                  <td className="muted">{room.seating_capacity}</td>
                  <td className="muted">{room.bookings}</td>
                  <td>
                    <div className="between tiny" style={{ marginBottom: 3 }}>
                      <span className="faint">{room.utilisation}%</span>
                    </div>
                    <Bar percent={room.utilisation} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ day */

const STATE_TAG = {
  covered:   "tag tag-pine",
  conducted: "tag tag-pine",
  scheduled: "tag",
  pending:   "tag tag-ochre",
  uncovered: "tag tag-oxblood",
  moved:     "tag tag-ochre",
};

function DayTab() {
  const [classes, setClasses] = useState([]);
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(asYearMonthDay(new Date()));
  const [data, setData] = useState(null);
  const toast = useToast();

  useEffect(() => {
    apiGet("/classes").then((rows) => {
      setClasses(rows || []);
      if (rows && rows.length) setSectionId(rows[0].section_id);
    }).catch((e) => toast(e.message, "err"));
  }, []);

  useEffect(() => {
    if (sectionId === "") return;
    setData(null);
    apiGet(`/day?section_id=${sectionId}&date=${date}`)
      .then(setData).catch((e) => toast(e.message, "err"));
  }, [sectionId, date]);

  return (
    <Card className="pad">
      <h2 className="section-title">What actually happens on the day</h2>
      <p className="page-sub" style={{ marginBottom: 16 }}>
        The timetable is a weekly pattern; this is one real date, showing who is
        genuinely teaching each hour after cancellations and cover. This is the
        view a student or a coordinator needs.
      </p>

      <div className="row" style={{ gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <select className="select" style={{ width: "auto", minWidth: 230 }}
                value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          {classes.map((item) => (
            <option key={item.section_id} value={item.section_id}>
              {item.program_code} {item.admission_year} — Section {item.section_name}
            </option>
          ))}
        </select>
        <input className="input" type="date" style={{ width: "auto" }}
               value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {!data ? <SkeletonRows rows={5} />
        : data.lectures.length === 0 ? (
          <Empty>
            No classes for this section on {shortDate(date)}
            {data.day_of_week === "SUN" ? " — it is a Sunday." : "."}
          </Empty>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {data.lectures.map((lecture, index) => (
              <motion.div key={lecture.timetable_slot_id} className="card-sunk pad-sm"
                          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04, duration: 0.26 }}>
                <div className="between" style={{ alignItems: "flex-start", gap: 12 }}>
                  <div className="row" style={{ gap: 12, minWidth: 0 }}>
                    <span className="mono faint" style={{ width: 46, flex: "none" }}>
                      {lecture.start_time}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="bold" style={{ fontSize: 13.2 }}>
                        {lecture.course_code}
                        {lecture.lab_batch_code && <span className="faint"> {lecture.lab_batch_code}</span>}
                        <span className="faint" style={{ fontWeight: 400 }}> · {lecture.room_number}</span>
                      </div>
                      <div className="tiny muted" style={{ marginTop: 2 }}>{lecture.note}</div>
                    </div>
                  </div>
                  <span className={STATE_TAG[lecture.state]}>{lecture.state}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
    </Card>
  );
}

/* ------------------------------------------------------------------ page */

function Insights() {
  const [tab, setTab] = useState("risk");
  const [planning, setPlanning] = useState(null);
  const [afterPlan, setAfterPlan] = useState(() => () => {});

  function openPlanner(row, reload) {
    setAfterPlan(() => reload);
    setPlanning(row);
  }

  return (
    <Shell
      title="Insights"
      subtitle="Whether every class will finish its syllabus, how the department's hours and rooms are spread, and what really happens on a given day."
    >
      <div className="row" style={{ gap: 2, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={"nav-link" + (tab === id ? " active" : "")}
                  style={{ padding: "8px 12px", border: "none", background: "none", cursor: "pointer" }}
                  onClick={() => setTab(id)}>
            <Icon size={14} /> {label}
            {tab === id && (
              <motion.span layoutId="insight-rule" className="nav-rule"
                           transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }} />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
          {tab === "risk"  && <RiskTab onPlan={openPlanner} />}
          {tab === "alloc" && <AllocTab />}
          {tab === "day"   && <DayTab />}
        </motion.div>
      </AnimatePresence>

      {planning && (
        <RecoveryDialog item={planning} onClose={() => setPlanning(null)} onDone={afterPlan} />
      )}
    </Shell>
  );
}

export default Insights;
