import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, X, ClipboardCheck, Inbox, HandHeart, Send } from "lucide-react";
import Shell from "../components/Shell.jsx";
import { Card, Empty, useToast, initials, shortDate, SkeletonRows } from "../ui.jsx";
import { apiGet, apiPost } from "../api.js";

/* "DBMS · Sec G / G1" plus the time underneath. */
function Lecture({ request }) {
  return (
    <div>
      <div className="bold">
        {request.course_code}
        <span className="faint"> · Sec {request.section_name}
          {request.lab_batch_code ? " / " + request.lab_batch_code : ""}</span>
      </div>
      <div className="tiny faint">
        {request.day_of_week} {request.start_time}–{request.end_time} · {request.room_number}
      </div>
    </div>
  );
}

function statusChip(request) {
  if (request.assignment_status === "ASSIGNED") return <span className="tag tag-pine">Approved</span>;
  if (request.assignment_status === "CANCELLED") return <span className="tag tag-oxblood">Nobody free</span>;
  return <span className="tag tag-ochre">Waiting for reply</span>;
}

function Section({ icon: Icon, title, hint, children, delay }) {
  return (
    <Card className="pad" delay={delay}>
      <div className="row" style={{ gap: 9, marginBottom: 3 }}>
        <Icon size={17} className="muted" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.3px" }}>{title}</h2>
      </div>
      <p className="page-sub" style={{ marginBottom: 14 }}>{hint}</p>
      {children}
    </Card>
  );
}

function Requests() {
  const [incoming, setIncoming] = useState([]);
  const [covering, setCovering] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  async function load() {
    try {
      setIncoming((await apiGet("/requests/incoming")) || []);
      setCovering((await apiGet("/requests/covering")) || []);
      setSent((await apiGet("/requests/sent")) || []);
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function answer(request, what) {
    try {
      const result = await apiPost("/requests/" + request.substitution_assignment_id + "/" + what);
      toast(result.message);
      load();
    } catch (err) {
      toast(err.message, "err");
    }
  }

  async function markConducted(request) {
    try {
      const result = await apiPost("/mark-conducted", {
        timetable_slot_id: request.timetable_slot_id,
        lecture_date: request.lecture_date,
        remarks: "Substitute lecture",
      });
      toast(result.message);
      load();
    } catch (err) {
      toast(err.message, "err");
    }
  }

  if (loading) {
    return (
      <Shell title="Requests"
             subtitle="Lectures other teachers want you to take, the ones you agreed to, and the ones you handed over.">
        <Card className="pad"><SkeletonRows rows={5} /></Card>
      </Shell>
    );
  }

  return (
    <Shell
      title="Requests"
      subtitle="Lectures other teachers want you to take, the ones you agreed to, and the ones you handed over."
      actions={incoming.length > 0 && (
        <span className="tag tag-ochre">{incoming.length} awaiting your answer</span>
      )}
    >
      <div className="stack" style={{ gap: 16 }}>
        <Section icon={Inbox} title="Waiting for your answer" delay={0}
                 hint="You were picked because you are free at that time. Reject and it moves to the next free teacher.">
          {incoming.length === 0 ? <Empty>Nothing waiting for you right now.</Empty> : (
            <div className="stack" style={{ gap: 9 }}>
              {incoming.map((request, index) => (
                <motion.div key={request.substitution_assignment_id}
                            className="card-sunk pad-sm between"
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}>
                  <div className="row" style={{ gap: 11, minWidth: 0 }}>
                    <span className="avatar">{initials(request.cancelled_by)}</span>
                    <div style={{ minWidth: 0 }}>
                      <Lecture request={request} />
                      <div className="tiny muted" style={{ marginTop: 3 }}>
                        <b>{shortDate(request.lecture_date)}</b> · {request.cancelled_by} — “{request.reason}”
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 7 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => answer(request, "approve")}>
                      <Check size={13} /> Accept
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => answer(request, "reject")}>
                      <X size={13} /> Decline
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={HandHeart} title="Classes I am covering" delay={0.06}
                 hint="You said yes to these. Mark them conducted once you have taken them.">
          {covering.length === 0 ? <Empty>You are not covering any class.</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Lecture</th><th>Date</th><th>Instead of</th><th></th></tr>
                </thead>
                <tbody>
                  {covering.map((request) => (
                    <tr key={request.substitution_assignment_id}>
                      <td><Lecture request={request} /></td>
                      <td>{shortDate(request.lecture_date)}</td>
                      <td className="muted">{request.cancelled_by}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn btn-sm" onClick={() => markConducted(request)}>
                          <ClipboardCheck size={13} /> Mark conducted
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section icon={Send} title="Lectures I handed over" delay={0.12}
                 hint="Who is covering the classes you could not take.">
          {sent.length === 0 ? <Empty>You have not handed over any lecture.</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Lecture</th><th>Date</th><th>Reason</th><th>Given to</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {sent.map((request) => (
                    <tr key={request.substitution_assignment_id}>
                      <td><Lecture request={request} /></td>
                      <td>{shortDate(request.lecture_date)}</td>
                      <td className="muted">{request.reason}</td>
                      <td>{request.substitute_name}</td>
                      <td>{statusChip(request)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </Shell>
  );
}

export default Requests;
