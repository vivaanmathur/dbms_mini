import { useEffect, useState } from "react";
import Shell from "../components/Shell.jsx";
import TimetableGrid from "../components/TimetableGrid.jsx";
import SlotDialog from "../components/SlotDialog.jsx";
import { Glass, Spinner, useToast } from "../ui.jsx";
import { apiGet, getMyName } from "../api.js";

/* View 1: the week of the teacher who is logged in. */
function MyTimetable() {
  const [slots, setSlots] = useState([]);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  async function load() {
    try {
      setSlots((await apiGet("/timetable/my")) || []);
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const covering = slots.filter((s) => s.covering_for).length;

  return (
    <Shell
      title="My Timetable"
      subtitle={`${getMyName()} · click any lecture to hand it over or mark it conducted`}
      actions={
        <div className="row" style={{ gap: 8 }}>
          <span className="chip chip-violet">{slots.length - covering} regular</span>
          {covering > 0 && <span className="chip chip-green">{covering} covering</span>}
        </div>
      }
    >
      <Glass className="pad">
        {loading ? <Spinner /> : <TimetableGrid slots={slots} onSlotClick={setOpen} />}
      </Glass>

      {open && (
        <SlotDialog slot={open} onClose={() => setOpen(null)} onChanged={load} />
      )}
    </Shell>
  );
}

export default MyTimetable;
