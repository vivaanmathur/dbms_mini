import { useEffect, useMemo, useState } from "react";
import { ClipboardPaste, Download, Pencil, UserPlus } from "lucide-react";
import { api } from "../../api.js";
import { Card, Empty, Modal, SkeletonRows, useToast } from "../../ui.jsx";
import { FormDialog, OneTimeSecret } from "./kit.jsx";

/* Paste from a spreadsheet: one student per line, columns separated by tabs
   or commas, in this order. */
const COLUMNS = ["prn", "roll_no", "first_name", "last_name", "email", "batch"];

function parse(text, batches) {
  const byCode = Object.fromEntries(batches.map((b) => [b.code.toUpperCase(), b.lab_batch_id]));
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .filter((l, i) => !(i === 0 && /prn/i.test(l)))           // skip a header row if there is one
    .map((line) => {
      const cells = line.split(line.includes("\t") ? "\t" : ",").map((c) => c.trim());
      const row = Object.fromEntries(COLUMNS.map((c, i) => [c, cells[i] || ""]));
      row.lab_batch_id = row.batch ? byCode[row.batch.toUpperCase()] ?? null : null;
      row.problem = !row.prn || !row.first_name || !row.email ? "missing a value"
                  : row.batch && !row.lab_batch_id ? `no batch ${row.batch}` : null;
      return row;
    });
}

function download(filename, rows) {
  const csv = ["name,email,prn,temporary password", ...rows.map((r) => `${r.name},${r.email},${r.prn},${r.temporary_password}`)].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export default function Students() {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [section, setSection] = useState("");
  const [batches, setBatches] = useState([]);
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [created, setCreated] = useState(null);
  const [secret, setSecret] = useState(null);

  useEffect(() => { api.get("/admin/classes").then((c) => { setClasses(c); if (c.length) setSection(String(c[0].section_id)); }); }, []);
  const load = () => section && api.get(`/admin/students?section_id=${section}`).then(setRows).catch((e) => toast(e.message, "err"));
  useEffect(() => {
    if (!section) return;
    setRows(null); load();
    api.get(`/admin/classes/${section}/teaching`).then((t) => setBatches(t.batches));
  }, [section]);

  const preview = useMemo(() => parse(text, batches), [text, batches]);
  const bad = preview.filter((r) => r.problem);
  const batchOptions = batches.map((b) => ({ value: b.lab_batch_id, label: b.code }));

  async function enrolAll() {
    try {
      const r = await api.post("/admin/students/bulk", { students: preview.map((p) => ({
        section_id: Number(section), lab_batch_id: p.lab_batch_id, prn: p.prn, roll_no: p.roll_no,
        first_name: p.first_name, last_name: p.last_name, email: p.email })) });
      setPasting(false); setText(""); setCreated(r.created); load();
    } catch (e) { toast(e.message, "err"); }
  }

  return (
    <Card className="pad">
      <div className="toolbar">
        <div><h2 className="section-title">Students</h2>
          <p className="page-sub" style={{ marginTop: 3 }}>Students sign in separately from staff, and only ever see their own class.</p></div>
        <div className="row" style={{ gap: 8 }}>
          <select className="select" style={{ width: "auto", minWidth: 220 }} value={section} onChange={(e) => setSection(e.target.value)}>
            {classes.map((c) => <option key={c.section_id} value={c.section_id}>{c.label}</option>)}</select>
          <button className="btn" onClick={() => setPasting(true)}><ClipboardPaste size={14} /> Paste a list</button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={14} /> Add one</button>
        </div>
      </div>

      {rows === null ? <SkeletonRows rows={5} /> : rows.length === 0 ? <Empty>No students in this class yet. Paste a list from a spreadsheet to enrol them all at once.</Empty> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Roll</th><th>Name</th><th>PRN</th><th>Batch</th><th>Sign-in</th><th /></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.student_id} className={s.is_active ? "" : "row-muted"}>
              <td className="mono">{s.roll_no || "—"}</td>
              <td><b>{s.first_name} {s.last_name}</b><div className="tiny faint">{s.email}</div></td>
              <td className="mono tiny">{s.prn}</td>
              <td>{s.lab_batch_code ? <span className="tag">{s.lab_batch_code}</span> : <span className="faint">—</span>}</td>
              <td>{!s.user_id ? <span className="tag">None</span> : !s.login_active ? <span className="tag tag-oxblood">Disabled</span>
                   : s.must_change_password ? <span className="tag tag-ochre">Not yet signed in</span> : <span className="tag tag-pine">Active</span>}</td>
              <td className="actions">
                {s.user_id && <button className="btn btn-sm btn-quiet" onClick={async () => {
                  try { const r = await api.post(`/admin/logins/${s.user_id}/reset`);
                        setSecret({ who: `${s.first_name} ${s.last_name}`, password: r.temporary_password }); load(); }
                  catch (e) { toast(e.message, "err"); } }}>Reset</button>}
                <button className="btn btn-sm btn-quiet" onClick={() => setEditing(s)}><Pencil size={12} /></button>
              </td>
            </tr>))}
          </tbody></table></div>
      )}

      {pasting && (
        <Modal open wide onClose={() => setPasting(false)} title="Enrol from a spreadsheet"
               subtitle={classes.find((c) => String(c.section_id) === section)?.label}
               footer={<><button className="btn" onClick={() => setPasting(false)}>Cancel</button>
                        <button className="btn btn-primary" disabled={!preview.length || bad.length > 0} onClick={enrolAll}>
                          Enrol {preview.length || ""} student{preview.length === 1 ? "" : "s"}</button></>}>
          <p className="muted tiny" style={{ margin: 0 }}>Copy the rows straight from Excel or Sheets. Columns, in order:{" "}
            <span className="mono">PRN, roll no, first name, last name, email, batch</span>. It is all or nothing —
            if any row is wrong, nobody is added and you are told which row.</p>
          <textarea className="textarea mono" rows={7} value={text} onChange={(e) => setText(e.target.value)}
                    placeholder={"1032230001\t1\tAsha\tRao\tasha.rao@mitwpu.edu.in\tG1"} style={{ fontSize: 12 }} />
          {preview.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 220, overflowY: "auto" }}><table className="table">
              <thead><tr><th>PRN</th><th>Name</th><th>Email</th><th>Batch</th><th /></tr></thead>
              <tbody>{preview.map((p, i) => (
                <tr key={i}><td className="mono tiny">{p.prn}</td><td>{p.first_name} {p.last_name}</td>
                  <td className="tiny">{p.email}</td><td>{p.batch}</td>
                  <td>{p.problem ? <span className="tag tag-oxblood">{p.problem}</span> : <span className="tag tag-pine">ok</span>}</td></tr>))}
              </tbody></table></div>)}
        </Modal>
      )}

      {created && (
        <Modal open onClose={() => setCreated(null)} title={`${created.length} students enrolled`}
               footer={<><button className="btn" onClick={() => download("temporary-passwords.csv", created)}><Download size={13} /> Download passwords</button>
                        <button className="btn btn-primary" onClick={() => setCreated(null)}>Done</button></>}>
          <div className="notice notice-warn">Each student has a one-time password. <b>Download the list now</b> — it is not
            shown again. Everyone must choose their own password at first sign-in.</div>
        </Modal>
      )}

      {adding && (
        <FormDialog title="Add a student" submitLabel="Enrol"
          fields={[{ key: "first_name", label: "First name", required: true }, { key: "last_name", label: "Last name", required: true },
                   { key: "email", label: "Email", type: "email", required: true, full: true },
                   { key: "prn", label: "PRN", required: true }, { key: "roll_no", label: "Roll number" },
                   { key: "lab_batch_id", label: "Lab batch", type: "select", numeric: true, options: batchOptions },
                   { key: "create_login", label: "Sign-in", type: "checkbox", hint: "Create a sign-in account", default: true, full: true }]}
          onSubmit={async (v) => {
            const r = await api.post("/admin/students", { ...v, section_id: Number(section) });
            load();
            if (r.temporary_password) setSecret({ who: `${v.first_name} ${v.last_name} · ${v.email}`, password: r.temporary_password });
          }}
          onClose={() => setAdding(false)} />
      )}
      {editing && (
        <FormDialog title={`Edit ${editing.first_name} ${editing.last_name}`} initial={editing}
          fields={[{ key: "first_name", label: "First name", required: true }, { key: "last_name", label: "Last name", required: true },
                   { key: "email", label: "Email", type: "email", required: true, full: true },
                   { key: "roll_no", label: "Roll number" },
                   { key: "lab_batch_id", label: "Lab batch", type: "select", numeric: true, options: batchOptions },
                   { key: "is_active", label: "Status", type: "checkbox", hint: "Active", full: true }]}
          onSubmit={async (v) => { await api.put(`/admin/students/${editing.student_id}`, v); toast("Saved."); load(); }}
          onClose={() => setEditing(null)} />
      )}
      {secret && <OneTimeSecret who={secret.who} password={secret.password} onClose={() => setSecret(null)} />}
    </Card>
  );
}
