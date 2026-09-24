import { useEffect, useState } from "react";
import Shell from "../components/Shell.jsx";
import TimetableGrid from "../components/TimetableGrid.jsx";
import SlotDialog from "../components/SlotDialog.jsx";
import { Card, SkeletonRows, useToast } from "../ui.jsx";
import { apiGet } from "../api.js";

/*
 * View 2: the full week of one class. In a lab hour every batch is shown
 * separately, each with its own teacher and lab room.
 */
function ClassTimetable() {
  const [classes, setClasses] = useState([]);
  const [sectionId, setSectionId] = useState("");
  const [slots, setSlots] = useState([]);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    apiGet("/classes")
      .then((data) => {
        setClasses(data || []);
        if (data && data.length) setSectionId(data[0].section_id);
      })
      .catch((err) => toast(err.message, "err"));
  }, []);

  async function load() {
    if (sectionId === "") return;
    setLoading(true);
    try {
      setSlots((await apiGet("/timetable/class/" + sectionId)) || []);
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [sectionId]);

  return (
    <Shell
      title="Class Timetable"
      subtitle="The whole week for one class. Your own lectures are highlighted — those are the ones you can hand over."
      actions={
        <select className="select" style={{ width: "auto", minWidth: 250 }}
                value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          {classes.map((item) => (
            <option key={item.section_id} value={item.section_id}>
              {item.program_code} {item.admission_year} — Section {item.section_name}
            </option>
          ))}
        </select>
      }
    >
      <Card className="pad">
        {loading ? <SkeletonRows rows={6} /> : <TimetableGrid slots={slots} onSlotClick={setOpen} />}
      </Card>

      {open && <SlotDialog slot={open} onClose={() => setOpen(null)} onChanged={load} />}
    </Shell>
  );
}

export default ClassTimetable;
