import { useEffect, useState } from "react";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Navbar from "../components/Navbar.jsx";
import { apiGet, apiPost } from "../api.js";

// Shows the class in one cell, like "DBMS (Sec G) Room VY115".
function describe(request) {
  return (
    <span>
      <b>{request.course_code}</b> - Sec {request.section_name}
      {request.lab_batch_code ? " / " + request.lab_batch_code : ""}
      <br />
      <small>
        {request.day_of_week} {request.start_time}-{request.end_time}, Room {request.room_number}
      </small>
    </span>
  );
}

function statusChip(request) {
  if (request.assignment_status === "ASSIGNED") {
    return <Chip size="small" color="success" label="Approved" />;
  }
  if (request.assignment_status === "CANCELLED") {
    return <Chip size="small" color="error" label="Nobody free" />;
  }
  return <Chip size="small" color="warning" label="Waiting for reply" />;
}

function Requests() {
  const [incoming, setIncoming] = useState([]);
  const [covering, setCovering] = useState([]);
  const [sent, setSent] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setIncoming((await apiGet("/requests/incoming")) || []);
      setCovering((await apiGet("/requests/covering")) || []);
      setSent((await apiGet("/requests/sent")) || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function answer(request, whatToDo) {
    setMessage("");
    setError("");
    try {
      const result = await apiPost(
        "/requests/" + request.substitution_assignment_id + "/" + whatToDo
      );
      setMessage(result.message);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // The substitute presses this after actually taking the class, so it goes
  // into the lecture log.
  async function markConducted(request) {
    setMessage("");
    setError("");
    try {
      const result = await apiPost("/mark-conducted", {
        timetable_slot_id: request.timetable_slot_id,
        lecture_date: request.lecture_date,
        remarks: "Substitute lecture",
      });
      setMessage(result.message);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Box>
      <Navbar />
      <Container maxWidth="lg" sx={{ py: 3 }}>
        {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h5">Requests for me</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Another teacher cancelled these lectures and the system picked you
            because you are free at that time and you have taken the fewest
            lectures. If you reject, it goes to the next free teacher.
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Lecture</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Asked by</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell align="right">Your answer</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {incoming.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No requests for you right now.</TableCell>
                </TableRow>
              )}
              {incoming.map((request) => (
                <TableRow key={request.substitution_assignment_id}>
                  <TableCell>{describe(request)}</TableCell>
                  <TableCell>{request.lecture_date}</TableCell>
                  <TableCell>{request.cancelled_by}</TableCell>
                  <TableCell>{request.reason}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => answer(request, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => answer(request, "reject")}
                      >
                        Reject
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h5">Classes I am covering</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            You said yes to these. After you take the class, press "Mark as
            conducted" so it is added to your lecture log.
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Lecture</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Normally taken by</TableCell>
                <TableCell align="right"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {covering.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>You are not covering any class.</TableCell>
                </TableRow>
              )}
              {covering.map((request) => (
                <TableRow key={request.substitution_assignment_id}>
                  <TableCell>{describe(request)}</TableCell>
                  <TableCell>{request.lecture_date}</TableCell>
                  <TableCell>{request.cancelled_by}</TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" onClick={() => markConducted(request)}>
                      Mark as conducted
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h5">My cancelled lectures</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Lectures you cancelled, and who is covering them.
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Lecture</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Given to</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>You have not cancelled any lecture.</TableCell>
                </TableRow>
              )}
              {sent.map((request) => (
                <TableRow key={request.substitution_assignment_id}>
                  <TableCell>{describe(request)}</TableCell>
                  <TableCell>{request.lecture_date}</TableCell>
                  <TableCell>{request.reason}</TableCell>
                  <TableCell>{request.substitute_name}</TableCell>
                  <TableCell>{statusChip(request)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Container>
    </Box>
  );
}

export default Requests;
