import { useEffect, useState } from "react";
import { api } from "../../api.js";
import { Card, Empty, SkeletonRows, useToast } from "../../ui.jsx";

const TONE = { CREATE: "tag tag-pine", UPDATE: "tag", DELETE: "tag tag-oxblood", HANDOVER: "tag tag-ochre",
               MAKEUP: "tag tag-ochre", PASSWORD: "tag", ACCEPT: "tag tag-pine", DECLINE: "tag tag-ochre" };

export default function Audit() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(true);
  const load = (before) => api.get("/admin/audit?limit=60" + (before ? "&before=" + before : ""))
    .then((r) => { setRows((old) => (before ? [...old, ...r] : r)); setMore(r.length === 60); })
    .catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);

  return (
    <Card className="pad">
      <h2 className="section-title">Audit trail</h2>
      <p className="page-sub" style={{ marginBottom: 14 }}>Who changed what, and when. Newest first. Nothing here can be edited.</p>
      {rows === null ? <SkeletonRows rows={8} /> : rows.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
        <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What</th></tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.audit_id}>
                <td className="mono tiny faint" style={{ whiteSpace: "nowrap" }}>{a.created_at}</td>
                <td>{a.who}</td>
                <td><span className={TONE[a.action] || "tag"}>{a.action.toLowerCase()}</span></td>
                <td>{a.summary}</td>
              </tr>))}
            </tbody></table></div>
          {more && <div style={{ textAlign: "center", marginTop: 14 }}>
            <button className="btn" onClick={() => load(rows[rows.length - 1].audit_id)}>Load older</button></div>}
        </>
      )}
    </Card>
  );
}
