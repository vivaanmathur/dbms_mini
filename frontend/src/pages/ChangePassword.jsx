import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useToast } from "../ui.jsx";
import Shell from "../components/Shell.jsx";

/* The same three rules the server enforces, shown as they are met. */
const RULES = [
  { test: (p) => p.length >= 10, label: "At least 10 characters" },
  { test: (p) => p !== p.toLowerCase() && p !== p.toUpperCase(), label: "Upper and lower case letters" },
  { test: (p) => /\d/.test(p), label: "At least one number" },
];

function Form({ first }) {
  const { reload, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const allMet = RULES.every((r) => r.test(next));
  const matches = next.length > 0 && next === again;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast("Password changed.");
      await reload();
      if (!first) navigate(-1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 15, maxWidth: 380 }}>
      <div className="field">
        <label className="label" htmlFor="cur">{first ? "Temporary password" : "Current password"}</label>
        <input id="cur" className="input" type="password" required autoComplete="current-password"
               value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="new">New password</label>
        <input id="new" className="input" type="password" required autoComplete="new-password"
               value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="stack" style={{ gap: 5 }}>
        {RULES.map((rule) => {
          const met = rule.test(next);
          return (
            <div key={rule.label} className="row tiny" style={{ gap: 7, color: met ? "var(--pine)" : "var(--ink-3)" }}>
              {met ? <Check size={12} /> : <X size={12} />} {rule.label}
            </div>
          );
        })}
      </div>
      <div className="field">
        <label className="label" htmlFor="again">Type it again</label>
        <input id="again" className="input" type="password" required autoComplete="new-password"
               value={again} onChange={(e) => setAgain(e.target.value)} />
        {again && !matches && <span className="tiny" style={{ color: "var(--oxblood)" }}>These do not match yet.</span>}
      </div>

      {error && <div className="notice notice-bad">{error}</div>}

      <div className="row" style={{ gap: 8, marginTop: 4 }}>
        <button className="btn btn-primary" type="submit" disabled={busy || !allMet || !matches}>
          {busy ? "Saving" : "Set password"}
        </button>
        {first && <button type="button" className="btn btn-quiet" onClick={signOut}>Sign out</button>}
      </div>
    </form>
  );
}

export default function ChangePassword({ first }) {
  if (first) {
    return (
      <div className="login">
        <aside className="login-aside">
          <span className="display" style={{ fontSize: 18 }}>Continuity</span>
          <p className="display" style={{ fontSize: 36, margin: 0, maxWidth: "16ch" }}>
            First, choose a password of your own.
          </p>
          <span className="tiny" style={{ opacity: 0.42 }}>The temporary one stops working once you do.</span>
        </aside>
        <main className="login-main">
          <div className="login-form">
            <div className="eyebrow">First sign-in</div>
            <h1 className="page-title" style={{ fontSize: 28, marginTop: 10, marginBottom: 22 }}>New password</h1>
            <Form first />
          </div>
        </main>
      </div>
    );
  }
  return (
    <Shell title="Change password" subtitle="Choose a new password for your account.">
      <div className="card pad"><Form /></div>
    </Shell>
  );
}
