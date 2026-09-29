/*
 * Who is signed in. The server is the only source of truth for that — the
 * browser keeps nothing but the token — so roles can never be edited here.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearToken, getToken, setToken } from "./api.js";
import { applyTheme, getTheme } from "./theme.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setReady(true);
      return null;
    }
    try {
      const who = await api.get("/auth/me");
      setMe(who);
      applyTheme(getTheme(who.user_id));   // their own palette
      return who;
    } catch {
      setMe(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
    const out = () => setMe(null);
    const mustChange = () => setMe((m) => (m ? { ...m, must_change_password: true } : m));
    window.addEventListener("continuity:signed-out", out);
    window.addEventListener("continuity:password-change", mustChange);
    return () => {
      window.removeEventListener("continuity:signed-out", out);
      window.removeEventListener("continuity:password-change", mustChange);
    };
  }, [reload]);

  async function signIn(email, password) {
    const result = await api.login(email, password);
    setToken(result.access_token);
    return reload();
  }

  function signOut() {
    clearToken();
    setMe(null);
  }

  return (
    <AuthContext.Provider value={{ me, ready, signIn, signOut, reload }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function hasRole(me, role) {
  return !!me && me.roles.some((r) => r.role === role);
}

export const OVERSIGHT = ["ADMIN", "PROGRAM_DIRECTOR", "PROGRAM_COORDINATOR", "YEAR_COORDINATOR", "CLASS_TEACHER"];

export function oversees(me) {
  return !!me && me.roles.some((r) => OVERSIGHT.includes(r.role));
}

const ROLE_NAMES = {
  ADMIN: "Administrator",
  PROGRAM_DIRECTOR: "Programme Director",
  PROGRAM_COORDINATOR: "Programme Coordinator",
  YEAR_COORDINATOR: "Year Coordinator",
  CLASS_TEACHER: "Class Teacher",
  FACULTY: "Teaching",
  STUDENT: "Student",
};

export function roleName(role) {
  return ROLE_NAMES[role] || role;
}

/* One dashboard per role held — someone with three roles gets three. */
export function dashboardsFor(me) {
  if (!me) return [];
  return me.roles.map((r) => {
    const base = { role: r.role, label: roleName(r.role), scope: r.scope_label };
    switch (r.role) {
      case "ADMIN": return { ...base, key: "admin", path: "/dashboard/admin" };
      case "FACULTY": return { ...base, key: "faculty", path: "/dashboard/faculty" };
      case "STUDENT": return { ...base, key: "student", path: "/dashboard/student" };
      case "CLASS_TEACHER":
        return { ...base, key: "class-" + r.section_id, path: "/dashboard/class/" + r.section_id };
      default:
        return { ...base, key: "scope-" + r.role_assignment_id, path: "/dashboard/scope/" + r.role_assignment_id };
    }
  });
}
