import React from "react";
import ReactDOM from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import App from "./App.jsx";

// Material UI theme. We only change the colours, everything else is default.
const theme = createTheme({
  palette: {
    primary: { main: "#1565c0" },
    secondary: { main: "#ef6c00" },
    background: { default: "#f4f6f8" },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
