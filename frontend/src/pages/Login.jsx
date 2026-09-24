import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { GraduationCap, ArrowRight } from "lucide-react";
import { API_BASE_URL } from "../config.js";
import { Glass } from "../ui.jsx";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      // This route wants a form, not JSON. The field is called "username"
      // but we put the teacher's email in it.
      const form = new URLSearchParams();
      form.append("username", email);
      form.append("password", password);

      const response = await fetch(API_BASE_URL + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Wrong email or password");

      localStorage.setItem("authToken", data.access_token);
      localStorage.setItem("myName", data.name);
      localStorage.setItem("myFacultyId", data.faculty_id);
      navigate("/my-timetable");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="aurora"><span /><span /><span /></div>
      <div className="grain" />

      <div className="login-wrap">
        <Glass className="login-card">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
            style={{
              width: 48, height: 48, borderRadius: 15, display: "grid", placeItems: "center",
              background: "var(--accent-grad)", marginBottom: 18,
              boxShadow: "0 12px 30px -8px var(--violet)",
            }}
          >
            <GraduationCap size={25} color="#fff" />
          </motion.div>

          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: "-0.7px" }}>
            Welcome back
          </h1>
          <p className="muted" style={{ margin: "6px 0 24px", fontSize: 13.5 }}>
            Sign in to your lecture continuity dashboard
          </p>

          <form onSubmit={submit} className="stack">
            <div className="field">
              <label className="label" htmlFor="email">EMAIL</label>
              <input id="email" className="input" type="email" required
                     value={email} onChange={(e) => setEmail(e.target.value)}
                     placeholder="name@mitwpu.edu.in" autoComplete="username" />
            </div>

            <div className="field">
              <label className="label" htmlFor="password">PASSWORD</label>
              <input id="password" className="input" type="password" required
                     value={password} onChange={(e) => setPassword(e.target.value)}
                     placeholder="••••••••" autoComplete="current-password" />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="chip chip-red"
                style={{ padding: "8px 12px", borderRadius: 11, whiteSpace: "normal" }}
              >
                {error}
              </motion.div>
            )}

            <button className="btn btn-primary" type="submit" disabled={busy}
                    style={{ marginTop: 5, padding: "11px 16px" }}>
              {busy ? "Signing in..." : <>Sign in <ArrowRight size={15} /></>}
            </button>
          </form>
        </Glass>
      </div>
    </>
  );
}

export default Login;
