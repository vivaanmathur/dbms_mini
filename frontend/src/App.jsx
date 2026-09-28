import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Login from "./pages/Login.jsx";
import MyTimetable from "./pages/MyTimetable.jsx";
import ClassTimetable from "./pages/ClassTimetable.jsx";
import Requests from "./pages/Requests.jsx";
import Syllabus from "./pages/Syllabus.jsx";
import SyllabusDetail from "./pages/SyllabusDetail.jsx";
import History from "./pages/History.jsx";
import Insights from "./pages/Insights.jsx";
import { ToastProvider } from "./ui.jsx";
import { getToken } from "./api.js";

// No token saved means you are not logged in, so back to the login page.
function Protected({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<Login />} />
        <Route path="/my-timetable" element={<Protected><MyTimetable /></Protected>} />
        <Route path="/class-timetable" element={<Protected><ClassTimetable /></Protected>} />
        <Route path="/requests" element={<Protected><Requests /></Protected>} />
        <Route path="/syllabus" element={<Protected><Syllabus /></Protected>} />
        <Route path="/syllabus/:offeringId" element={<Protected><SyllabusDetail /></Protected>} />
        <Route path="/history" element={<Protected><History /></Protected>} />
        <Route path="/insights" element={<Protected><Insights /></Protected>} />
        <Route path="*" element={<Navigate to={getToken() ? "/my-timetable" : "/login"} replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AnimatedRoutes />
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
