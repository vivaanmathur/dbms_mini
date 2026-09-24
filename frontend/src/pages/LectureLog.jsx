import { useEffect, useState } from "react";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Navbar from "../components/Navbar.jsx";
import { apiGet, getMyName } from "../api.js";

// Shows every lecture this teacher actually conducted, and the list the
// substitution algorithm uses to decide who is asked next.
function LectureLog() {
  const [logs, setLogs] = useState([]);
  const [load, setLoad] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEverything() {
      try {
        setLogs((await apiGet("/lecture-log")) || []);
        setLoad((await apiGet("/teacher-load")) || []);
      } catch (err) {
        setError(err.message);
      }
    }
    loadEverything();
  }, []);

  let totalHours = 0;
  logs.forEach((log) => {
    totalHours = totalHours + Number(log.actual_hours_taken);
  });

  return (
    <Box>
      <Navbar />
      <Container maxWidth="lg" sx={{ py: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h5">Lectures I conducted</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {logs.length} lectures, {totalHours} hours in total.
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Course</TableCell>
                <TableCell>Class</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Room</TableCell>
                <TableCell>Hours</TableCell>
                <TableCell>Type</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    Nothing yet. Open a lecture on your timetable and press
                    "Mark as conducted".
                  </TableCell>
                </TableRow>
              )}
              {logs.map((log) => (
                <TableRow key={log.lecture_log_id}>
                  <TableCell>{log.lecture_date}</TableCell>
                  <TableCell>{log.course_code}</TableCell>
                  <TableCell>
                    Sec {log.section_name}
                    {log.lab_batch_code ? " / " + log.lab_batch_code : ""}
                  </TableCell>
                  <TableCell>
                    {log.start_time}-{log.end_time}
                  </TableCell>
                  <TableCell>{log.room_number}</TableCell>
                  <TableCell>{log.actual_hours_taken}</TableCell>
                  <TableCell>
                    {log.regular_teacher === getMyName() ? (
                      <Chip size="small" label="My own class" />
                    ) : (
                      <Chip
                        size="small"
                        color="secondary"
                        label={"Substitute for " + log.regular_teacher}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h5">How many lectures everyone has taken</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            When a lecture is cancelled, the system goes down this list from
            the top and gives the class to the first teacher who is free at
            that time. That way the work stays even.
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Teacher</TableCell>
                <TableCell>Lectures conducted</TableCell>
                <TableCell>Hours</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {load.map((row) => (
                <TableRow
                  key={row.faculty_id}
                  sx={{ bgcolor: row.name === getMyName() ? "#e8f1fb" : "inherit" }}
                >
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.lectures_taken}</TableCell>
                  <TableCell>{row.hours_taken}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Container>
    </Box>
  );
}

export default LectureLog;
