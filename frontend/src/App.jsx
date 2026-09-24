import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import MyTimetable from "./pages/MyTimetable.jsx";
import ClassTimetable from "./pages/ClassTimetable.jsx";
import Requests from "./pages/Requests.jsx";
import LectureLog from "./pages/LectureLog.jsx";
import { getToken } from "./api.js";

// If there is no login token saved, send the user to the login page.
function Protected({ children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/my-timetable" element={<Protected><MyTimetable /></Protected>} />
        <Route path="/class-timetable" element={<Protected><ClassTimetable /></Protected>} />
        <Route path="/requests" element={<Protected><Requests /></Protected>} />
        <Route path="/lecture-log" element={<Protected><LectureLog /></Protected>} />
        <Route path="*" element={<Navigate to={getToken() ? "/my-timetable" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
