import { useEffect, useState } from "react";
import Shell from "../components/Shell.jsx";
import TimetableGrid from "../components/TimetableGrid.jsx";
import WeekBar from "../components/WeekBar.jsx";
import LectureDialog from "../components/LectureDialog.jsx";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Card, SkeletonRows, useToast } from "../ui.jsx";

/* A teacher's own week, or a student's class week. */
export default function MyTimetable() {
  const { me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [weekStart, setWeekStart] = useState(null);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);
  const student = me.kind === "student";

  async function load() {
    setLoading(true);
    try {
      setData(await api.get("/timetable/mine" + (weekStart ? "?week_start=" + weekStart : "")));
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [weekStart]);

  const sessions = data ? data.sessions : [];
  const covering = sessions.filter((s) => s.kind === "cover").length;
  const changed = sessions.filter((s) => ["covered", "pending", "uncovered", "moved"].includes(s.state)).length;

  return (
    <Shell title={student ? "Your timetable" : "My timetable"}
           subtitle={student
             ? "Who is really teaching each hour this week, after any changes."
             : "Click a lecture to hand it over, or to record it once it has happened."}
           actions={
             <div className="row" style={{ gap: 8 }}>
               {!student && <span className="tag">{sessions.filter((s) => s.kind === "regular").length} lectures</span>}
               {covering > 0 && <span className="tag tag-pine">{covering} covering</span>}
               {changed > 0 && <span className="tag tag-ochre">{changed} changed</span>}
             </div>
           }>
      <Card className="pad">
        <WeekBar week={data && data.week} busy={loading} onChange={setWeekStart} />
        <div style={{ height: 18 }} />
        {loading || !data ? <SkeletonRows rows={6} /> :
          <TimetableGrid sessions={sessions} dates={data.week.dates} onPick={setOpen} />}
      </Card>
      {open && <LectureDialog lecture={open} onClose={() => setOpen(null)} onChanged={load} />}
    </Shell>
  );
}
