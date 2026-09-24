import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { API_BASE_URL } from "../config.js";

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
      // but the teacher's email goes in it.
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
    <div className="login">
      <aside className="login-aside">
        <div className="row" style={{ gap: 9 }}>
          <span style={{ width: 22, height: 22, borderRadius: 2, background: "#f1ece1",
                         display: "grid", placeItems: "center" }}>
            <span style={{ width: 8, height: 1.5, background: "var(--ink)" }} />
          </span>
          <span className="display" style={{ fontSize: 18 }}>Continuity</span>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}>
          <p className="display" style={{ fontSize: 40, margin: 0, maxWidth: "15ch" }}>
            No lecture should quietly go missing.
          </p>
          <p style={{ marginTop: 20, maxWidth: "46ch", color: "rgba(241,236,225,0.68)", fontSize: 14 }}>
            Timetables, cover arrangements and syllabus progress for the
            Department of Artificial Intelligence &amp; Data Science — so a
            cancelled class is a decision on record, not a gap nobody noticed.
          </p>
        </motion.div>

        <div className="tiny" style={{ color: "rgba(241,236,225,0.42)", letterSpacing: "0.02em" }}>
          MIT World Peace University · B.Tech AI&amp;DS
        </div>
      </aside>

      <main className="login-main">
        <div className="login-form">
          <div className="eyebrow">Faculty access</div>
          <h1 className="page-title" style={{ fontSize: 30, marginTop: 10 }}>Sign in</h1>
          <p className="page-sub" style={{ marginBottom: 26 }}>
            Use your college email address.
          </p>

          <form onSubmit={submit} className="stack" style={{ gap: 15 }}>
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input" type="email" required autoComplete="username"
                     value={email} onChange={(e) => setEmail(e.target.value)}
                     placeholder="name@mitwpu.edu.in" />
            </div>

            <div className="field">
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input" type="password" required
                     autoComplete="current-password"
                     value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && (
              <div className="tag tag-oxblood" style={{
                whiteSpace: "normal", padding: "7px 10px", textTransform: "none",
                letterSpacing: 0, fontSize: 12, fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={busy}
                    style={{ marginTop: 4, padding: "10px 16px" }}>
              {busy ? "Signing in" : <>Continue <ArrowRight size={14} /></>}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default Login;
