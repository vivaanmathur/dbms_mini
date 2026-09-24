import { Link, useLocation, useNavigate } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { getMyName, logout } from "../api.js";

const PAGES = [
  { path: "/my-timetable", label: "My Timetable" },
  { path: "/class-timetable", label: "Class Timetable" },
  { path: "/requests", label: "Requests" },
  { path: "/lecture-log", label: "Lecture Log" },
];

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" sx={{ mr: 3 }}>
          Lecture Scheduler
        </Typography>

        <Box sx={{ flexGrow: 1, display: "flex", gap: 1 }}>
          {PAGES.map((page) => (
            <Button
              key={page.path}
              component={Link}
              to={page.path}
              color="inherit"
              // underline the page we are currently on
              sx={{
                borderBottom: location.pathname === page.path ? "2px solid white" : "none",
                borderRadius: 0,
              }}
            >
              {page.label}
            </Button>
          ))}
        </Box>

        <Typography sx={{ mr: 2 }}>{getMyName()}</Typography>
        <Button color="inherit" variant="outlined" onClick={handleLogout}>
          Logout
        </Button>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
