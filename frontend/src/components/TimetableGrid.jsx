import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { getMyFacultyId } from "../api.js";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_NAMES = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// "2026-09-25" becomes "25 Sep", which fits inside a timetable box.
function shortDate(text) {
  const parts = text.split("-");
  return Number(parts[2]) + " " + MONTHS[Number(parts[1]) - 1];
}

// Pulls out every start time in the timetable ("08:30", "09:30", ...) and
// sorts them, so each one becomes a row of the grid.
function getRowTimes(slots) {
  const times = [];
  slots.forEach((slot) => {
    if (!times.includes(slot.start_time)) {
      times.push(slot.start_time);
    }
  });
  times.sort();
  return times;
}

// Only keep the days that actually have a class in them.
function getColumnDays(slots) {
  return DAYS.filter((day) => slots.some((slot) => slot.day_of_week === day));
}

// One class inside a box. A lab hour has three of these next to each other
// (one per lab batch: G1, G2, G3).
function SlotBox({ slot, onClick }) {
  const isMine = slot.faculty_id === getMyFacultyId();
  const isLab = slot.course_type === "PRACTICAL";
  // A class I am covering for another teacher, only on one date.
  const isCovering = Boolean(slot.covering_for);

  // A change = this lecture was cancelled on some date and someone else
  // (may be) taking it. We show it right inside the box.
  const changes = slot.changes || [];

  return (
    <Paper
      variant="outlined"
      onClick={() => onClick(slot)}
      sx={{
        p: 1,
        cursor: "pointer",
        borderLeft: "5px solid",
        borderLeftColor: isCovering
          ? "success.main"
          : isMine
          ? "primary.main"
          : isLab
          ? "secondary.main"
          : "grey.400",
        bgcolor: isCovering ? "#e8f6ec" : isMine ? "#e8f1fb" : "white",
        "&:hover": { bgcolor: "grey.100" },
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
        {slot.course_code}
        {slot.lab_batch_code ? " - " + slot.lab_batch_code : ""}
      </Typography>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {slot.start_time} - {slot.end_time}
      </Typography>

      <Typography variant="caption" sx={{ display: "block" }}>
        Room {slot.room_number} ({slot.room_type === "LAB" ? "Lab" : "Class"})
      </Typography>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {slot.faculty_name} | Sec {slot.section_name}
      </Typography>

      {isCovering && (
        <Chip
          size="small"
          color="success"
          sx={{ mt: 0.5, maxWidth: "100%" }}
          label={"You take this on " + shortDate(slot.covering_date)}
        />
      )}

      {/* Any date on which this lecture was given to somebody else. We write
          it as "25 Sep: Shoma Mitkari -> Santushti Betgeri" so it is clear
          who is actually taking the class that day. */}
      {!isCovering &&
        changes.map((change) => {
          const approved = change.assignment_status === "ASSIGNED";
          let text;
          if (approved) {
            text = change.cancelled_by + " \u2192 " + change.substitute_name;
          } else if (change.substitute_name) {
            text = "cancelled, waiting for " + change.substitute_name;
          } else {
            text = "cancelled, no teacher free";
          }
          return (
            <Typography
              key={change.cancellation_request_id}
              variant="caption"
              sx={{
                display: "block",
                mt: 0.5,
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                fontWeight: "bold",
                bgcolor: approved ? "#e8f6ec" : "#fff4e5",
                color: approved ? "success.dark" : "warning.dark",
              }}
            >
              {shortDate(change.lecture_date)}: {text}
            </Typography>
          );
        })}
    </Paper>
  );
}

function TimetableGrid({ slots, onSlotClick }) {
  const rowTimes = getRowTimes(slots);
  const columnDays = getColumnDays(slots);

  if (slots.length === 0) {
    return <Typography sx={{ p: 2 }}>No lectures to show.</Typography>;
  }

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box
        sx={{
          display: "grid",
          // first column is the time, then one column per day
          gridTemplateColumns: "90px repeat(" + columnDays.length + ", minmax(190px, 1fr))",
          gap: 1,
          minWidth: 700,
        }}
      >
        {/* top-left empty corner, then the day headings */}
        <Box />
        {columnDays.map((day) => (
          <Typography key={day} align="center" sx={{ fontWeight: "bold", py: 1 }}>
            {DAY_NAMES[day]}
          </Typography>
        ))}

        {/* one row per starting time */}
        {rowTimes.map((time) => (
          <Box key={time} sx={{ display: "contents" }}>
            <Typography variant="body2" sx={{ pt: 1, fontWeight: "bold", color: "text.secondary" }}>
              {time}
            </Typography>

            {columnDays.map((day) => {
              const inThisCell = slots.filter(
                (slot) => slot.day_of_week === day && slot.start_time === time
              );
              return (
                <Box key={day + time} sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {inThisCell.map((slot) => (
                    <SlotBox
                      key={slot.timetable_slot_id + "-" + (slot.covering_date || "own")}
                      slot={slot}
                      onClick={onSlotClick}
                    />
                  ))}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default TimetableGrid;
