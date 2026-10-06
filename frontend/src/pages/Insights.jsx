import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronDown, DoorOpen, Scale, TriangleAlert, Wand2 } from "lucide-react";
import Shell from "../components/Shell.jsx";
import RecoveryDialog from "../components/RecoveryDialog.jsx";
import { LectureRow } from "../components/lectures.jsx";
import { api } from "../api.js";
import { oversees, useAuth } from "../auth.jsx";
import { asYearMonthDay, Bar, Card, Empty, Figure, initials, shortDate, SkeletonRows, useToast } from "../ui.jsx";

export const BAND = {
  "critical":       { tag: "tag tag-oxblood", colour: "var(--oxblood)" },
  "at risk":        { tag: "tag tag-oxblood", colour: "var(--oxblood-line)" },
  "no record":      { tag: "tag tag-ochre",   colour: "var(--ochre-line)" },
  "watch":          { tag: "tag tag-ochre",   colour: "var(--ochre)" },
  "on track":       { tag: "tag tag-pine",    colour: "var(--pine)" },
  "not timetabled": { tag: "tag",             colour: "var(--rule-firm)" },
  "no syllabus":    { tag: "tag",             colour: "var(--rule)" },
};

function RiskRow({ item, index }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div className="unit" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.025, 0.3) }}>
      <div className="unit-head" onClick={() => setOpen(!open)}>
        <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }} style={{ display: "grid" }}>
          <ChevronDown size={15} className="faint" /></motion.span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="bold">{item.subject_code}{item.lab_batch_code ? " · " + item.lab_batch_code : ""}</span>
            <span className="faint tiny">{item.class_label}</span>
            <span className={BAND[item.band].tag}>{item.band}</span>
            {item.uncovered > 0 && <span className="tag tag-oxblood">{item.uncovered} uncovered</span>}
          </span>
          <span className="tiny faint" style={{ display: "block", marginTop: 2 }}>
            {item.teacher_name} · {item.completed_items}/{item.total_items} items · {item.delivered_hours}/{item.planned_hours} hrs</span>
        </span>
        <span style={{ width: 150, flex: "none" }}>
          <span className="between tiny" style={{ marginBottom: 3 }}>
            <span className="faint">{Math.round(item.percent)}%</span>
            {item.gap > 0 && item.band !== "no record" && <span style={{ color: "var(--oxblood)" }}>−{item.gap}</span>}
          </span>
          <Bar percent={item.percent} />
        </span>
      </div>
      <AnimatePresence initial={false}>{open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} style={{ overflow: "hidden" }}>
          <ul className="tiny muted" style={{ margin: "0 0 14px 32px", paddingLeft: 16 }}>
            {item.reasons.map((r, i) => <li key={i} style={{ marginBottom: 4 }}>{r}</li>)}
          </ul>
        </motion.div>)}
      </AnimatePresence>
    </motion.div>
  );
}

export function RiskPanel({ sectionId }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/insight/risk" + (sectionId ? "?section_id=" + sectionId : "")).then(setData)
      .catch((e) => toast(e.message, "err"));
  }, [sectionId]);
  if (!data) return <Card className="pad"><SkeletonRows rows={6} /></Card>;

  const counts = {};
  data.items.forEach((i) => { counts[i.band] = (counts[i.band] || 0) + 1; });
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card className="pad">
        <div className="between" style={{ alignItems: "flex-end", marginBottom: 12 }}>
          <div><div className="label">Term</div>
            <div className="row" style={{ gap: 6, alignItems: "baseline", marginTop: 4 }}>
              <Figure value={data.term.weeks_elapsed} />
              <span className="faint display" style={{ fontSize: 17 }}>/{data.term.weeks_total} weeks</span></div></div>
          <div style={{ textAlign: "right" }}><div className="label">Every class should be about</div>
            <div className="row" style={{ gap: 4, alignItems: "baseline", justifyContent: "flex-end", marginTop: 4 }}>
              <Figure value={Math.round(data.expected_percent)} suffix="%" /><span className="faint tiny">through</span></div></div>
        </div>
        <Bar percent={data.term.fraction_elapsed * 100} />
        <p className="tiny faint" style={{ margin: "9px 0 0" }}>
          Each subject is compared with how much of the term has gone. Nothing here is predicted — every
          flag says why it was raised.
        </p>
      </Card>

      <div className="stats">
        {Object.keys(BAND).filter((b) => counts[b]).map((b) => (
          <div key={b} className="stat"><Figure value={counts[b]} /><div className="stat-label">{b}</div></div>
        ))}
      </div>

      {data.unassigned.length > 0 && (
        <div className="notice notice-warn">
          <b>No teacher assigned:</b>{" "}
          {data.unassigned.map((u) => `${u.subject_code} (${u.class_label})`).join(", ")}. These cannot
          progress until an administrator assigns someone.
        </div>
      )}

      <Card className="pad">
        <h2 className="section-title">Every subject</h2>
        <p className="page-sub" style={{ marginBottom: 8 }}>Worst first. Open a row to see exactly why.</p>
        {data.items.length === 0 ? <Empty>Nothing to report.</Empty> :
          data.items.map((i, n) => <RiskRow key={i.assignment_id} item={i} index={n} />)}
      </Card>
    </div>
  );
}

export function AttentionPanel({ sectionId, onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [planning, setPlanning] = useState(null);
  const load = () => api.get("/insight/attention" + (sectionId ? "?section_id=" + sectionId : ""))
    .then(setRows).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, [sectionId]);

  if (!rows) return <SkeletonRows rows={3} />;
  if (rows.length === 0) return <Empty>Every cancelled lecture has someone taking it or a make-up booked.</Empty>;
  return (
    <>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Lecture</th><th>Date</th><th>Where it stands</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.cancellation_id}>
            <td><b>{r.subject_code}</b>{r.lab_batch_code ? " · " + r.lab_batch_code : ""}
              <div className="tiny faint">{r.class_label} · {r.day_of_week} {r.start_time} · {r.requested_by}</div></td>
            <td>{shortDate(r.lecture_date)}</td>
            <td>{r.state === "pending" ? <span className="tag tag-ochre">Asked {r.waiting_on.split(" ")[0]}</span>
                                       : <span className="tag tag-oxblood">Nobody free</span>}</td>
            <td className="actions">{r.can_plan && (
              <button className="btn btn-sm" onClick={() => setPlanning(r)}><Wand2 size={12} /> Make-up</button>)}</td>
          </tr>))}
        </tbody></table></div>
      {planning && <RecoveryDialog item={planning} onClose={() => setPlanning(null)}
                                   onDone={() => { load(); onChanged && onChanged(); }} />}
    </>
  );
}

function LoadPanel() {
  const toast = useToast();
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/insight/load").then(setD).catch((e) => toast(e.message, "err")); }, []);
  if (!d) return <Card className="pad"><SkeletonRows rows={6} /></Card>;
  const tone = { high: "tag tag-oxblood", medium: "tag tag-ochre", low: "tag" };
  return (
    <div className="stack" style={{ gap: 16 }}>
      {d.findings.length > 0 && (
        <Card className="pad"><h2 className="section-title" style={{ marginBottom: 12 }}>What is out of balance</h2>
          <div className="stack" style={{ gap: 8 }}>{d.findings.map((f, i) => (
            <div key={i} className="card-sunk pad-sm">
              <div className="row" style={{ gap: 8 }}><span className={tone[f.severity]}>{f.severity}</span>
                <b style={{ fontSize: 13 }}>{f.title}</b></div>
              <div className="tiny muted" style={{ marginTop: 3 }}>{f.detail}</div></div>))}
          </div></Card>)}
      <Card className="pad">
        <h2 className="section-title">Hours against contract</h2>
        <p className="page-sub" style={{ marginBottom: 14 }}>Scheduled teaching each week, against each teacher's limit.</p>
        <div className="stack" style={{ gap: 11 }}>{d.staff.map((s) => (
          <div key={s.staff_id} className="row" style={{ gap: 11 }}>
            <span className="avatar">{initials(s.name)}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>{s.name}<span className="faint tiny"> · {s.weekly_sessions} sessions · {s.subjects} subjects</span></span>
                <span className="tiny" style={{ color: s.headroom < 0 ? "var(--oxblood)" : "var(--ink-3)" }}>
                  {s.weekly_hours}/{s.max_weekly_hours} hrs</span></span>
              <Bar percent={s.load_percent} /></span>
          </div>))}</div>
      </Card>
      <Card className="pad">
        <div className="row" style={{ gap: 8, marginBottom: 12 }}><DoorOpen size={15} className="muted" />
          <h2 className="section-title">Rooms</h2></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Room</th><th>Type</th><th>Booked</th><th style={{ width: 200 }}>Use of the week</th></tr></thead>
          <tbody>{d.rooms.map((r) => (
            <tr key={r.room_id}><td className="bold">{r.code}</td><td className="muted tiny">{r.room_type === "LAB" ? "Lab" : "Lecture"}</td>
              <td className="muted">{r.booked_hours} hrs</td>
              <td><div className="tiny faint" style={{ marginBottom: 3 }}>{r.utilisation}%</div><Bar percent={r.utilisation} /></td></tr>))}
          </tbody></table></div>
      </Card>
    </div>
  );
}

function DayPanel() {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [section, setSection] = useState("");
  const [date, setDate] = useState(asYearMonthDay(new Date()));
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/classes").then((c) => { setClasses(c); if (c.length) setSection(c[0].section_id); }); }, []);
  useEffect(() => {
    if (!section) return;
    setD(null);
    api.get(`/timetable/day?section_id=${section}&date=${date}`).then(setD).catch((e) => toast(e.message, "err"));
  }, [section, date]);
  return (
    <Card className="pad">
      <h2 className="section-title">What actually happens on the day</h2>
      <p className="page-sub" style={{ marginBottom: 14 }}>
        One real date for one class, after cancellations, cover and make-ups — what a student or coordinator needs.</p>
      <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <select className="select" style={{ width: "auto", minWidth: 240 }} value={section} onChange={(e) => setSection(e.target.value)}>
          {classes.map((c) => <option key={c.section_id} value={c.section_id}>{c.label}</option>)}</select>
        <input className="input" type="date" style={{ width: "auto" }} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {!d ? <SkeletonRows rows={4} /> : d.lectures.length === 0 ? <Empty>No classes on {shortDate(date)}.</Empty> :
        d.lectures.map((l, i) => <LectureRow key={(l.kind || "") + (l.slot_id || l.makeup_id)} lecture={l} index={i} showClass={false} />)}
    </Card>
  );
}

const TABS = [
  { id: "risk", label: "Syllabus risk", Icon: TriangleAlert },
  { id: "arrange", label: "Needs arranging", Icon: Wand2, oversight: true },
  { id: "load", label: "Load and rooms", Icon: Scale, oversight: true },
  { id: "day", label: "Day view", Icon: CalendarDays },
];

/* Teachers see risk and the day view for the classes they teach; arranging
   cover and reading colleagues' load is for the roles that oversee classes. */
export default function Insights() {
  const { me } = useAuth();
  const overseer = oversees(me);
  const tabs = TABS.filter((t) => overseer || !t.oversight);
  const [tab, setTab] = useState("risk");
  return (
    <Shell title="Insights" subtitle={overseer
      ? "For the classes you oversee: will each finish its syllabus, what needs arranging, and how people and rooms are spread."
      : "For the classes you teach: will each subject finish its syllabus, and what actually happens on a given day."}>
      <div className="tabs">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>
            <Icon size={14} /> {label}
            {tab === id && <motion.span layoutId="insight-tab" className="nav-rule" transition={{ duration: 0.22 }} />}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
          {tab === "risk" && <RiskPanel />}
          {tab === "arrange" && <Card className="pad"><AttentionPanel /></Card>}
          {tab === "load" && <LoadPanel />}
          {tab === "day" && <DayPanel />}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}
