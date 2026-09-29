import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Bar, Card } from "../../ui.jsx";

export function Panel({ title, hint, action, children, delay = 0 }) {
  return (
    <Card className="pad" delay={delay}>
      <div className="between" style={{ marginBottom: hint ? 2 : 12 }}>
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {hint && <p className="page-sub" style={{ marginBottom: 12, marginTop: 2 }}>{hint}</p>}
      {children}
    </Card>
  );
}

export function More({ to, children }) {
  return <Link to={to} className="btn btn-quiet btn-sm">{children} <span className="nudge"><ArrowRight size={12} /></span></Link>;
}

/* How far through the term we are — the yardstick every dashboard uses. */
export function TermBar({ term }) {
  return (
    <div className="card pad-sm" style={{ marginBottom: 16 }}>
      <div className="between tiny" style={{ marginBottom: 6 }}>
        <span className="muted"><b>{term.name}</b> · week {Math.min(Math.ceil(term.weeks_elapsed) || 1, Math.ceil(term.weeks_total))} of {Math.ceil(term.weeks_total)}</span>
        <span className="faint">{term.weeks_left} weeks left</span>
      </div>
      <Bar percent={term.fraction_elapsed * 100} />
    </div>
  );
}

export function WeekSoFar({ week }) {
  return (
    <div className="stats">
      {[["due", "Due so far"], ["conducted", "Recorded"], ["covered", "Covered"], ["lost", "Lost"]].map(([k, label]) => (
        <div key={k} className="stat">
          <div className="figure" style={{ fontSize: 24, color: k === "lost" && week[k] ? "var(--oxblood)" : undefined }}>{week[k]}</div>
          <div className="stat-label">{label}</div>
        </div>
      ))}
    </div>
  );
}
