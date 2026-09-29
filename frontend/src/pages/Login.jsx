import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../auth.jsx";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-aside">
        <div className="row" style={{ gap: 9 }}>
          <span style={{ width: 22, height: 22, borderRadius: 2, background: "var(--on-ink)",
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
          <p style={{ marginTop: 20, maxWidth: "46ch", opacity: 0.68, fontSize: 14 }}>
            Timetables, cover arrangements and syllabus progress for the
            Department of Computer Engineering and Technology — for teachers,
            coordinators, and the students they teach.
          </p>
        </motion.div>

        <div className="tiny" style={{ opacity: 0.42, letterSpacing: "0.02em" }}>
          MIT World Peace University
        </div>
      </aside>

      <main className="login-main">
        <div className="login-form">
          <div className="eyebrow">Staff and students</div>
          <h1 className="page-title" style={{ fontSize: 30, marginTop: 10 }}>Sign in</h1>
          <p className="page-sub" style={{ marginBottom: 26 }}>
            Use your college email address. What you see depends on your role.
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
              <input id="password" className="input" type="password" required autoComplete="current-password"
                     value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && <div className="notice notice-bad">{error}</div>}

            <button className="btn btn-primary" type="submit" disabled={busy} style={{ marginTop: 4, padding: "10px 16px" }}>
              {busy ? "Signing in" : <>Continue <ArrowRight size={14} /></>}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
