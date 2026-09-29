import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./admin.css";
import { applyTheme, getTheme } from "./theme.js";

// Paint in the last palette used on this computer before anything renders;
// the signed-in person's own choice replaces it as soon as they are known.
applyTheme(getTheme());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
