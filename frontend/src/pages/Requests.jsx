import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, HandHeart, Inbox, Send, Undo2, X } from "lucide-react";
import Shell from "../components/Shell.jsx";
import { api } from "../api.js";
import { Card, Empty, initials, shortDate, SkeletonRows, useToast } from "../ui.jsx";

function When({ r }) {
  return (
    <div>
      <div className="bold">{r.subject_code}{r.lab_batch_code ? " · " + r.lab_batch_code : ""}
        <span className="faint" style={{ fontWeight: 400 }}> · {r.class_label}</span></div>
      <div className="tiny faint">{r.day_of_week} {shortDate(r.lecture_date)} · {r.start_time}–{r.end_time} · {r.room_code}</div>
    </div>
  );
}

function Section({ icon: Icon, title, hint, children, delay }) {
  return (
    <Card className="pad" delay={delay}>
      <div className="row" style={{ gap: 9, marginBottom: 3 }}>
        <Icon size={16} className="muted" /><h2 className="section-title">{title}</h2>
      </div>
      <p className="page-sub" style={{ marginBottom: 14 }}>{hint}</p>
      {children}
    </Card>
  );
}

const OUTCOME = {
  OPEN: (r) => r.cover_status === "PENDING"
    ? <span className="tag tag-ochre">Waiting for {r.cover_name.split(" ")[0]}</span>
    : <span className="tag tag-oxblood">Nobody free</span>,
  COVERED: (r) => <span className="tag tag-pine">{r.cover_name} is taking it</span>,
  RESCHEDULED: (r) => <span className="tag tag-ochre">Moved to {shortDate(r.makeup_date)} {r.makeup_start}</span>,
  WITHDRAWN: () => <span className="tag">You took it back</span>,
};

export default function Requests() {
  const toast = useToast();
  const [incoming, setIncoming] = useState(null);
  const [covering, setCovering] = useState([]);
  const [mine, setMine] = useState([]);

  async function load() {
    try {
      const [a, b, c] = await Promise.all([api.get("/cover/incoming"), api.get("/cover/accepted"),
                                           api.get("/handover/mine")]);
      setIncoming(a); setCovering(b); setMine(c);
    } catch (e) { toast(e.message, "err"); }
  }
  useEffect(() => { load(); }, []);

  async function act(path) {
    try { toast((await api.post(path)).message); load(); }
    catch (e) { toast(e.message, "err"); }
  }

  if (incoming === null) return <Shell title="Requests"><Card className="pad"><SkeletonRows rows={5} /></Card></Shell>;

  return (
    <Shell title="Requests"
           subtitle="Lectures colleagues have asked you to take, the ones you agreed to, and the ones you handed over."
           actions={incoming.length > 0 && <span className="tag tag-ochre">{incoming.length} awaiting your answer</span>}>
      <div className="stack" style={{ gap: 16 }}>
        <Section icon={Inbox} title="Waiting for your answer" delay={0}
                 hint="Decline and it goes to the next free teacher; you will not be asked about it again.">
          {incoming.length === 0 ? <Empty>Nothing waiting for you.</Empty> : incoming.map((r, i) => (
            <motion.div key={r.cover_id} className="card-sunk pad-sm between" style={{ marginBottom: 8 }}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="row" style={{ gap: 12, minWidth: 0 }}>
                <span className="avatar">{initials(r.requested_by)}</span>
                <div style={{ minWidth: 0 }}>
                  <When r={r} />
                  <div className="tiny muted" style={{ marginTop: 3 }}>
                    {r.requested_by} — “{r.reason}”
                    {r.chosen_by === "TEACHER" ? " · chose you" : " · the system asked you"}
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 7 }}>
                <button className="btn btn-primary btn-sm" onClick={() => act(`/cover/${r.cover_id}/accept`)}>
                  <Check size={13} /> Accept</button>
                <button className="btn btn-danger btn-sm" onClick={() => act(`/cover/${r.cover_id}/decline`)}>
                  <X size={13} /> Decline</button>
              </div>
            </motion.div>
          ))}
        </Section>

        <Section icon={HandHeart} title="Lectures you are covering" delay={0.05}
                 hint="Record each one from your timetable once you have taken it.">
          {covering.length === 0 ? <Empty>You are not covering anything.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Lecture</th><th>Instead of</th><th>Recorded</th></tr></thead>
              <tbody>{covering.map((r) => (
                <tr key={r.cover_id}>
                  <td><When r={r} /></td>
                  <td className="muted">{r.requested_by}</td>
                  <td>{r.conducted ? <span className="tag tag-pine">Yes</span> : <span className="tag">Not yet</span>}</td>
                </tr>))}
              </tbody></table></div>
          )}
        </Section>

        <Section icon={Send} title="Lectures you handed over" delay={0.1}
                 hint="What became of each one. You can take a lecture back until it happens.">
          {mine.length === 0 ? <Empty>You have not handed over any lecture.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Lecture</th><th>Reason</th><th>Outcome</th><th /></tr></thead>
              <tbody>{mine.map((r) => (
                <tr key={r.cancellation_id} className={r.status === "WITHDRAWN" ? "row-muted" : ""}>
                  <td><When r={r} /></td>
                  <td className="muted">{r.reason}{r.declined > 0 && <div className="tiny faint">{r.declined} declined</div>}</td>
                  <td>{(OUTCOME[r.status] || (() => null))(r)}</td>
                  <td className="actions">
                    {["OPEN", "COVERED"].includes(r.status) && r.lecture_date >= new Date().toISOString().slice(0, 10) && (
                      <button className="btn btn-sm" onClick={() => act(`/handover/${r.cancellation_id}/withdraw`)}>
                        <Undo2 size={12} /> Take back</button>)}
                  </td>
                </tr>))}
              </tbody></table></div>
          )}
        </Section>
      </div>
    </Shell>
  );
}
