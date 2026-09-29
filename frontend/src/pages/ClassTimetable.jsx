import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Shell from "../components/Shell.jsx";
import TimetableGrid from "../components/TimetableGrid.jsx";
import WeekBar from "../components/WeekBar.jsx";
import LectureDialog from "../components/LectureDialog.jsx";
import { api } from "../api.js";
import { Card, Empty, SkeletonRows, useToast } from "../ui.jsx";

/* Any class this person can see: every subject, every batch, one week. */
export default function ClassTimetable() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [classes, setClasses] = useState(null);
  const [data, setData] = useState(null);
  const [weekStart, setWeekStart] = useState(null);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(false);
  const sectionId = params.get("class");

  useEffect(() => {
    api.get("/classes").then((rows) => {
      setClasses(rows);
      if (!sectionId && rows.length) setParams({ class: rows[0].section_id }, { replace: true });
    }).catch((e) => toast(e.message, "err"));
  }, []);

  async function load() {
    if (!sectionId) return;
    setLoading(true);
    try {
      setData(await api.get(`/timetable/class/${sectionId}` + (weekStart ? "?week_start=" + weekStart : "")));
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [sectionId, weekStart]);

  if (classes && classes.length === 0) {
    return <Shell title="Classes"><Card className="pad"><Empty>You do not have access to any class yet.</Empty></Card></Shell>;
  }

  return (
    <Shell title={data ? data.class_label : "Classes"}
           subtitle="The whole week of a class — every subject, and every lab batch side by side."
           actions={classes && (
             <select className="select" style={{ width: "auto", minWidth: 250 }} value={sectionId || ""}
                     onChange={(e) => setParams({ class: e.target.value })}>
               {classes.map((c) => <option key={c.section_id} value={c.section_id}>{c.label}</option>)}
             </select>
           )}>
      <Card className="pad">
        <WeekBar week={data && data.week} busy={loading} onChange={setWeekStart} />
        <div style={{ height: 18 }} />
        {loading || !data ? <SkeletonRows rows={6} /> :
          <TimetableGrid sessions={data.sessions} dates={data.week.dates} onPick={setOpen} />}
      </Card>
      {open && <LectureDialog lecture={open} onClose={() => setOpen(null)} onChanged={load} />}
    </Shell>
  );
}
