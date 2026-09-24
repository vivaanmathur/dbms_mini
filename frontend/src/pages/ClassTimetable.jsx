import { useEffect, useState } from "react";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Navbar from "../components/Navbar.jsx";
import TimetableGrid from "../components/TimetableGrid.jsx";
import SlotDialog from "../components/SlotDialog.jsx";
import { apiGet } from "../api.js";

// View 2: the timetable of one class (section). Every teacher can look at
// it. In a lab hour all the lab batches of that class are shown together.
function ClassTimetable() {
  const [classes, setClasses] = useState([]);
  const [sectionId, setSectionId] = useState("");
  const [slots, setSlots] = useState([]);
  const [openSlot, setOpenSlot] = useState(null);
  const [error, setError] = useState("");

  // load the list of classes once, and select the first one
  useEffect(() => {
    async function loadClasses() {
      try {
        const data = await apiGet("/classes");
        setClasses(data || []);
        if (data && data.length > 0) {
          setSectionId(data[0].section_id);
        }
      } catch (err) {
        setError(err.message);
      }
    }
    loadClasses();
  }, []);

  async function loadTimetable() {
    if (sectionId === "") return;
    try {
      const data = await apiGet("/timetable/class/" + sectionId);
      setSlots(data || []);
    } catch (err) {
      setError(err.message);
    }
  }

  // reload whenever a different class is picked
  useEffect(() => {
    loadTimetable();
  }, [sectionId]);

  return (
    <Box>
      <Navbar />
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5">Class Timetable</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Pick a class to see its full week. Lab hours show every batch
            separately. You can only cancel the lectures that are yours
            (they have a blue line on the left).
          </Typography>

          <TextField
            select
            label="Class"
            size="small"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            sx={{ minWidth: 320, mb: 2 }}
          >
            {classes.map((item) => (
              <MenuItem key={item.section_id} value={item.section_id}>
                {item.program_code} {item.admission_year} - Section {item.section_name}
              </MenuItem>
            ))}
          </TextField>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TimetableGrid slots={slots} onSlotClick={setOpenSlot} />
        </Paper>
      </Container>

      {/* Only build the dialog once a lecture is actually clicked, so that
          it starts fresh (with the right date filled in) every time. */}
      {openSlot && (
        <SlotDialog
          slot={openSlot}
          onClose={() => setOpenSlot(null)}
          onChanged={loadTimetable}
        />
      )}
    </Box>
  );
}

export default ClassTimetable;
