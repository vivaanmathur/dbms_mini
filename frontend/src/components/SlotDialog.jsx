import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { apiPost, getMyFacultyId } from "../api.js";

const DAY_NUMBER = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

// Turns a Date into "2026-09-23". We build it by hand instead of using
// toISOString(), because that one changes the date to UTC and in India that
// can give us yesterday.
function asYearMonthDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

// Works out the next date that falls on this lecture's day, so the teacher
// does not have to hunt for "the next Wednesday" in a calendar.
function nextDateFor(day) {
  const date = new Date();
  for (let i = 0; i < 7; i++) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() === DAY_NUMBER[day]) {
      break;
    }
  }
  return asYearMonthDay(date);
}

function SlotDialog({ slot, onClose, onChanged }) {
  // The parent only shows this dialog once a lecture is clicked, so we can
  // safely work out the default date straight away. For a class we are
  // covering for somebody else, that date is already fixed.
  const [date, setDate] = useState(slot.covering_date || nextDateFor(slot.day_of_week));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isMine = slot.faculty_id === getMyFacultyId();
  const isCovering = Boolean(slot.covering_for);
  const changes = slot.changes || [];
  const logs = slot.logs || [];

  // Am I the substitute who was approved for the date shown in the box?
  const iAmSubstitute = changes.some(
    (change) =>
      change.lecture_date === date &&
      change.assignment_status === "ASSIGNED" &&
      change.substitute_faculty_id === getMyFacultyId()
  );
  const someoneElseTakesIt = changes.some(
    (change) => change.lecture_date === date && change.assignment_status === "ASSIGNED"
  );

  async function handleCancel() {
    setError("");
    setMessage("");
    if (reason.trim() === "") {
      setError("Please write a reason.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiPost("/cancel-lecture", {
        timetable_slot_id: slot.timetable_slot_id,
        lecture_date: date,
        reason: reason,
      });
      setMessage(result.message);
      setReason("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConducted() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await apiPost("/mark-conducted", {
        timetable_slot_id: slot.timetable_slot_id,
        lecture_date: date,
        remarks: "",
      });
      setMessage(result.message);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={true} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {slot.course_code} - {slot.course_name}
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2">
          <b>Day:</b> {slot.day_of_week}, {slot.start_time} to {slot.end_time}
        </Typography>
        <Typography variant="body2">
          <b>Room:</b> {slot.room_number} ({slot.room_type === "LAB" ? "Lab" : "Classroom"})
        </Typography>
        <Typography variant="body2">
          <b>Class:</b> Section {slot.section_name}
          {slot.lab_batch_code ? " - lab batch " + slot.lab_batch_code : ""}
        </Typography>
        <Typography variant="body2">
          <b>Teacher:</b> {slot.faculty_name} {isMine ? "(you)" : ""}
        </Typography>

        {changes.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Cancellations on this lecture</Typography>
            {changes.map((change) => (
              <Typography key={change.cancellation_request_id} variant="body2">
                {change.lecture_date} - cancelled by {change.cancelled_by} ({change.reason}){" "}
                {change.substitute_name ? (
                  <Chip
                    size="small"
                    color={change.assignment_status === "ASSIGNED" ? "success" : "warning"}
                    label={
                      change.substitute_name +
                      (change.assignment_status === "ASSIGNED" ? " is taking it" : " - not answered yet")
                    }
                  />
                ) : (
                  <Chip size="small" color="error" label="nobody free" />
                )}
              </Typography>
            ))}
          </Box>
        )}

        {logs.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Already conducted</Typography>
            {logs.map((log) => (
              <Typography key={log.lecture_log_id} variant="body2">
                {log.lecture_date} - taken by {log.delivered_by} ({log.actual_hours_taken} hrs)
              </Typography>
            ))}
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <TextField
          label="Date of the lecture"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          fullWidth
          size="small"
          InputLabelProps={{ shrink: true }}
          helperText={"This lecture happens every " + slot.day_of_week + "."}
        />

        {isMine && (
          <TextField
            label="Reason for cancelling"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            size="small"
            sx={{ mt: 2 }}
            placeholder="On leave / attending a conference"
          />
        )}

        {isCovering && (
          <Alert severity="success" sx={{ mt: 2 }}>
            You are taking this class on {slot.covering_date} instead of{" "}
            {slot.covering_for}. Press "Mark as conducted" once you have taken it.
          </Alert>
        )}

        {!isMine && !isCovering && !iAmSubstitute && (
          <Alert severity="info" sx={{ mt: 2 }}>
            This is {slot.faculty_name}'s lecture. Only they can cancel it.
          </Alert>
        )}

        {message && <Alert severity="success" sx={{ mt: 2 }}>{message}</Alert>}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>

        {(isMine && !someoneElseTakesIt) || iAmSubstitute ? (
          <Button onClick={handleConducted} disabled={busy}>
            Mark as conducted
          </Button>
        ) : null}

        {isMine && (
          <Button onClick={handleCancel} variant="contained" color="error" disabled={busy}>
            Cancel this lecture
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default SlotDialog;
