import { useEffect, useState } from "react";
import Shell from "../components/Shell.jsx";
import TimetableGrid from "../components/TimetableGrid.jsx";
import SlotDialog from "../components/SlotDialog.jsx";
import WeekBar from "../components/WeekBar.jsx";
import { Card, SkeletonRows, useToast } from "../ui.jsx";
import { apiGet, getMyName } from "../api.js";

/* View 1: the logged-in teacher's week. */
function MyTimetable() {
  const [slots, setSlots] = useState([]);
  const [week, setWeek] = useState(null);
  const [weekStart, setWeekStart] = useState(null);   // null = the week we are in
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const query = weekStart ? "?week_start=" + weekStart : "";
      const data = await apiGet("/timetable/my" + query);
      setSlots(data.slots || []);
      setWeek(data.week);
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [weekStart]);

  const covering = slots.filter((s) => s.covering_for).length;

  return (
    <Shell
      title="My Timetable"
      subtitle={`${getMyName()} · click any lecture to hand it over or mark it conducted`}
      actions={
        <div className="row" style={{ gap: 8 }}>
          <span className="tag">{slots.length - covering} scheduled</span>
          {covering > 0 && <span className="tag tag-pine">{covering} covering</span>}
        </div>
      }
    >
      <Card className="pad">
        <WeekBar week={week} busy={loading} onChange={setWeekStart} />
        <div style={{ height: 18 }} />
        {loading
          ? <SkeletonRows rows={6} />
          : <TimetableGrid slots={slots} onSlotClick={setOpen}
                           dates={week && week.dates} />}
      </Card>

      {open && <SlotDialog slot={open} onClose={() => setOpen(null)} onChanged={load} />}
    </Shell>
  );
}

export default MyTimetable;
