import { motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { shortDate } from "../ui.jsx";

/* Moving through the term a week at a time: a cancellation belongs to one
   date, so the grid always says which week it is showing. */
export default function WeekBar({ week, onChange, busy }) {
  if (!week) return null;

  function shift(days) {
    const d = new Date(week.week_start + "T12:00:00");
    d.setDate(d.getDate() + days);
    onChange(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
             String(d.getDate()).padStart(2, "0"));
  }

  return (
    <div className="between" style={{ gap: 12, flexWrap: "wrap" }}>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-sm" onClick={() => shift(-7)} disabled={!week.has_previous || busy} title="Previous week">
          <ChevronLeft size={14} />
        </button>
        <div style={{ minWidth: 176, textAlign: "center" }}>
          <motion.div key={week.week_start} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}>
            <div className="bold" style={{ fontSize: 13.4 }}>
              {shortDate(week.week_start)} – {shortDate(week.week_end)}
            </div>
            <div className="tiny faint">Week {week.week_number} of {week.total_weeks} · {week.term_name}</div>
          </motion.div>
        </div>
        <button className="btn btn-sm" onClick={() => shift(7)} disabled={!week.has_next || busy} title="Next week">
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {!week.is_current_week && (
          <button className="btn btn-sm" onClick={() => onChange(null)}>
            <CalendarDays size={13} /> This week
          </button>
        )}
        <input className="input" type="date" style={{ width: "auto" }} value={week.week_start}
               min={week.term_start} max={week.term_end}
               onChange={(e) => e.target.value && onChange(e.target.value)} />
      </div>
    </div>
  );
}
