import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthProvider, dashboardsFor, hasRole, oversees, useAuth } from "./auth.jsx";
import { ToastProvider, SkeletonRows } from "./ui.jsx";

import Login from "./pages/Login.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import FacultyDashboard from "./pages/dashboards/FacultyDashboard.jsx";
import ClassDashboard from "./pages/dashboards/ClassDashboard.jsx";
import ScopeDashboard from "./pages/dashboards/ScopeDashboard.jsx";
import AdminDashboard from "./pages/dashboards/AdminDashboard.jsx";
import StudentDashboard from "./pages/dashboards/StudentDashboard.jsx";
import MyTimetable from "./pages/MyTimetable.jsx";
import ClassTimetable from "./pages/ClassTimetable.jsx";
import Requests from "./pages/Requests.jsx";
import Syllabus from "./pages/Syllabus.jsx";
import SyllabusDetail from "./pages/SyllabusDetail.jsx";
import History from "./pages/History.jsx";
import Insights from "./pages/Insights.jsx";
import Admin from "./pages/admin/Admin.jsx";

/* Only people for whom `when` holds may open the page. */
function Allow({ when, children }) {
  const { me } = useAuth();
  if (!when(me)) return <Navigate to="/" replace />;
  return children;
}

const isTeaching = (me) => hasRole(me, "FACULTY");
const isStaff = (me) => !!me && me.kind === "staff";

function Routed() {
  const { me, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <div className="page"><SkeletonRows rows={5} /></div>;
  if (!me) return <Login />;
  if (me.must_change_password) return <ChangePassword first />;

  const home = dashboardsFor(me)[0];

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname.split("/").slice(0, 3).join("/")}>
        <Route path="/" element={home ? <Navigate to={home.path} replace /> : <NoRoles />} />

        <Route path="/dashboard/faculty" element={<Allow when={isTeaching}><FacultyDashboard /></Allow>} />
        <Route path="/dashboard/class/:sectionId" element={<Allow when={isStaff}><ClassDashboard /></Allow>} />
        <Route path="/dashboard/scope/:roleId" element={<Allow when={isStaff}><ScopeDashboard /></Allow>} />
        <Route path="/dashboard/admin" element={<Allow when={(m) => hasRole(m, "ADMIN")}><AdminDashboard /></Allow>} />
        <Route path="/dashboard/student" element={<Allow when={(m) => m.kind === "student"}><StudentDashboard /></Allow>} />

        <Route path="/timetable" element={<Allow when={(m) => isTeaching(m) || m.kind === "student"}><MyTimetable /></Allow>} />
        <Route path="/classes" element={<Allow when={isStaff}><ClassTimetable /></Allow>} />
        <Route path="/requests" element={<Allow when={isTeaching}><Requests /></Allow>} />
        <Route path="/syllabus" element={<Allow when={isTeaching}><Syllabus /></Allow>} />
        <Route path="/syllabus/:assignmentId" element={<SyllabusDetail />} />
        <Route path="/history" element={<Allow when={isTeaching}><History /></Allow>} />
        <Route path="/insights" element={<Allow when={(m) => oversees(m) || isTeaching(m)}><Insights /></Allow>} />
        <Route path="/admin/*" element={<Allow when={(m) => hasRole(m, "ADMIN")}><Admin /></Allow>} />
        <Route path="/account/password" element={<ChangePassword />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function NoRoles() {
  const { signOut } = useAuth();
  return (
    <div className="login-main" style={{ minHeight: "100vh" }}>
      <div className="login-form">
        <h1 className="page-title" style={{ fontSize: 26 }}>No role yet</h1>
        <p className="page-sub">
          You can sign in, but you have not been given a role, so there is
          nothing to show. Ask an administrator to assign one.
        </p>
        <button className="btn" style={{ marginTop: 18 }} onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routed />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
