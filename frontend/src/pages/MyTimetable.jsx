import { useEffect, useState } from "react";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Navbar from "../components/Navbar.jsx";
import TimetableGrid from "../components/TimetableGrid.jsx";
import SlotDialog from "../components/SlotDialog.jsx";
import { apiGet, getMyName } from "../api.js";

// View 1: the timetable of the teacher who is logged in.
function MyTimetable() {
  const [slots, setSlots] = useState([]);
  const [openSlot, setOpenSlot] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiGet("/timetable/my");
      setSlots(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // after cancelling / marking a lecture we reload so the boxes update
  function refresh() {
    load();
  }

  return (
    <Box>
      <Navbar />
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5">My Timetable</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {getMyName()} - click any lecture to cancel it or to mark it as conducted.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {loading ? <Typography>Loading...</Typography> : (
            <TimetableGrid slots={slots} onSlotClick={setOpenSlot} />
          )}
        </Paper>
      </Container>

      {/* Only build the dialog once a lecture is actually clicked, so that
          it starts fresh (with the right date filled in) every time. */}
      {openSlot && (
        <SlotDialog
          slot={openSlot}
          onClose={() => setOpenSlot(null)}
          onChanged={refresh}
        />
      )}
    </Box>
  );
}

export default MyTimetable;
