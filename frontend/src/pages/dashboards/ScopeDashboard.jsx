import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import Shell from "../../components/Shell.jsx";
import { api } from "../../api.js";
import { roleName } from "../../auth.jsx";
import { Card, Empty, Figure, SkeletonRows, useToast } from "../../ui.jsx";
import { AttentionPanel, BAND } from "../Insights.jsx";
import { Panel, TermBar } from "./common.jsx";

/* A year coordinator, programme coordinator or director: every class they
   oversee, side by side, worst first. */
export default function ScopeDashboard() {
  const { roleId } = useParams();
  const toast = useToast();
  const [d, setD] = useState(null);
  const load = () => api.get(`/dashboard/scope/${roleId}`).then(setD).catch((e) => toast(e.message, "err"));
  useEffect(() => { setD(null); load(); }, [roleId]);

  if (!d) return <Shell title="Overview"><SkeletonRows rows={8} /></Shell>;
  const t = d.totals;
  const worst = (c) => -(c.bands.critical * 100 + c.bands["at risk"] * 10 + c.bands["no record"]);
  const classes = [...d.classes].sort((a, b) => worst(a) - worst(b));

  return (
    <Shell eyebrow={roleName(d.role.role)} title={d.role.scope_label}
           subtitle="Every class you oversee. Open one for its full picture.">
      <TermBar term={d.term} />
      <div className="stats" style={{ marginBottom: 16 }}>
        <div className="stat"><Figure value={t.classes || 0} /><div className="stat-label">Classes</div></div>
        <div className="stat"><Figure value={t.teachers || 0} /><div className="stat-label">Teachers</div></div>
        <div className="stat"><Figure value={t.students || 0} /><div className="stat-label">Students</div></div>
        <div className="stat"><div className="figure" style={{ color: t.critical ? "var(--oxblood)" : undefined }}>{t.critical || 0}</div>
          <div className="stat-label">Critical subjects</div></div>
        <div className="stat"><div className="figure" style={{ color: t.open ? "var(--ochre)" : undefined }}>{t.open || 0}</div>
          <div className="stat-label">Lectures to arrange</div></div>
      </div>

      <div className="split">
        <Panel title="Classes">
          {classes.length === 0 ? <Empty>No classes fall under this role yet.</Empty> : (
            <div className="stack" style={{ gap: 10 }}>
              {classes.map((c, i) => {
                const total = Object.values(c.bands).reduce((a, b) => a + b, 0) || 1;
                return (
                  <Link key={c.section_id} to={`/dashboard/class/${c.section_id}`}>
                    <motion.div className="card-sunk pad-sm card-link" initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                      <div className="between">
                        <div><div className="bold">{c.label}</div>
                          <div className="tiny faint">{c.subjects} subject assignments · class teacher {c.class_teacher || "not set"}</div></div>
                        <div className="row" style={{ gap: 14 }}>
                          <div style={{ textAlign: "right" }}>
                            <div className="display" style={{ fontSize: 20 }}>{c.average_percent === null ? "—" : Math.round(c.average_percent) + "%"}</div>
                            <div className="tiny faint">avg covered</div></div>
                          <span className="nudge faint"><ChevronRight size={15} /></span>
                        </div>
                      </div>
                      {/* one strip per class: how its subjects split across the bands */}
                      <div className="class-card-bands">
                        {Object.entries(c.bands).filter(([, n]) => n).map(([band, n]) => (
                          <span key={band} title={`${n} ${band}`} style={{ width: (n / total) * 100 + "%", background: BAND[band].colour }} />
                        ))}
                      </div>
                      <div className="row tiny faint" style={{ gap: 12, flexWrap: "wrap" }}>
                        {Object.entries(c.bands).filter(([, n]) => n).map(([band, n]) => <span key={band}>{n} {band}</span>)}
                        <span>· this week {c.week.conducted}/{c.week.due} recorded{c.week.lost ? `, ${c.week.lost} lost` : ""}</span>
                      </div>
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel title="Needs arranging" hint="Across every class above." delay={0.06}>
          <AttentionPanel onChanged={load} />
        </Panel>
      </div>
    </Shell>
  );
}
