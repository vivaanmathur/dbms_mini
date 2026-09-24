import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { getTheme, applyTheme } from "./theme.js";

// Set the teacher's palette before anything renders, so the first paint is
// already in the right colours.
applyTheme(getTheme());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
