import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, Pencil, Plus, Search, ShieldPlus, UserPlus, X } from "lucide-react";
import { api } from "../../api.js";
import { roleName, useAuth } from "../../auth.jsx";
import { Card, Empty, Modal, SkeletonRows, useToast } from "../../ui.jsx";
import { Confirm, Field, FormDialog, OneTimeSecret } from "./kit.jsx";

const ROLES = ["FACULTY", "CLASS_TEACHER", "YEAR_COORDINATOR", "PROGRAM_COORDINATOR", "PROGRAM_DIRECTOR", "ADMIN"];
const YEAR_WORD = { 1: "FY", 2: "SY", 3: "TY", 4: "LY" };

function scopeOf(r) {
  switch (r.role) {
    case "PROGRAM_DIRECTOR": return r.department_code;
    case "PROGRAM_COORDINATOR": return r.program_short;
    case "YEAR_COORDINATOR": return `${YEAR_WORD[r.year_of_study] || "Y" + r.year_of_study} ${r.program_short || r.department_code}`;
    case "CLASS_TEACHER": return r.class_label;
    default: return null;
  }
}

/* Choosing a role asks only for the scope that role needs. */
function RoleDialog({ person, onClose, onDone }) {
  const toast = useToast();
  const [role, setRole] = useState("CLASS_TEACHER");
  const [scope, setScope] = useState({});
  const [yearOver, setYearOver] = useState("program");
  const [opts, setOpts] = useState({ departments: [], programmes: [], classes: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/admin/departments"), api.get("/admin/programmes"), api.get("/admin/classes")])
      .then(([departments, programmes, classes]) => setOpts({ departments, programmes, classes }));
  }, []);

  const set = (k) => (v) => setScope((s) => ({ ...s, [k]: v === "" ? "" : Number(v) }));
  const dept = { key: "department_id", label: "Department", type: "select", required: true,
                 options: opts.departments.map((d) => ({ value: d.department_id, label: d.code + " — " + d.name })) };
  const prog = { key: "program_id", label: "Programme", type: "select", required: true,
                 options: opts.programmes.map((p) => ({ value: p.program_id, label: p.short_name })) };

  async function save() {
    setBusy(true);
    const body = { role };
    if (role === "PROGRAM_DIRECTOR") body.department_id = scope.department_id;
    if (role === "PROGRAM_COORDINATOR") body.program_id = scope.program_id;
    if (role === "CLASS_TEACHER") body.section_id = scope.section_id;
    if (role === "YEAR_COORDINATOR") {
      body.year_of_study = scope.year_of_study;
      if (yearOver === "program") body.program_id = scope.program_id; else body.department_id = scope.department_id;
    }
    try {
      await api.post(`/admin/staff/${person.staff_id}/roles`, body);
      toast(`${person.first_name} is now ${roleName(role).toLowerCase()}.`);
      onDone(); onClose();
    } catch (e) { toast(e.message, "err"); setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Give ${person.first_name} a role`}
           subtitle="Someone can hold as many roles as they need."
           footer={<><button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={save} disabled={busy}>Give role</button></>}>
      <div className="form-grid">
        <div className="field full"><label className="label">Role</label>
          <select className="select" value={role} onChange={(e) => { setRole(e.target.value); setScope({}); }}>
            {ROLES.map((r) => <option key={r} value={r}>{r === "FACULTY" ? "Faculty — teaches subjects" : roleName(r)}</option>)}
          </select></div>
        {role === "PROGRAM_DIRECTOR" && <Field field={{ ...dept, full: true }} value={scope.department_id} onChange={set("department_id")} />}
        {role === "PROGRAM_COORDINATOR" && <Field field={{ ...prog, full: true }} value={scope.program_id} onChange={set("program_id")} />}
        {role === "CLASS_TEACHER" && (
          <Field field={{ key: "section_id", label: "Class", type: "select", required: true, full: true,
                          options: opts.classes.map((c) => ({ value: c.section_id,
                            label: c.label + (c.class_teacher ? ` — currently ${c.class_teacher}` : "") })) }}
                 value={scope.section_id} onChange={set("section_id")} />)}
        {role === "YEAR_COORDINATOR" && (<>
          <Field field={{ key: "year_of_study", label: "Year", type: "select", required: true,
                          options: [1, 2, 3, 4].map((y) => ({ value: y, label: YEAR_WORD[y] + " — year " + y })) }}
                 value={scope.year_of_study} onChange={set("year_of_study")} />
          <div className="field"><label className="label">Across</label>
            <select className="select" value={yearOver} onChange={(e) => setYearOver(e.target.value)}>
              <option value="program">One programme</option><option value="department">The whole department</option>
            </select></div>
          {yearOver === "program" ? <Field field={{ ...prog, full: true }} value={scope.program_id} onChange={set("program_id")} />
                                  : <Field field={{ ...dept, full: true }} value={scope.department_id} onChange={set("department_id")} />}
        </>)}
        {(role === "ADMIN" || role === "FACULTY") && (
          <p className="faint tiny full" style={{ margin: 0 }}>
            {role === "ADMIN" ? "An administrator can change everything in the system." :
             "Teaching staff can be assigned subjects and asked to cover lectures."}</p>)}
      </div>
    </Modal>
  );
}

export default function People() {
  const { me } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [giving, setGiving] = useState(null);
  const [secret, setSecret] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = () => api.get("/admin/staff").then(setRows).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); api.get("/admin/departments").then(setDepartments); }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter((p) => !q || `${p.first_name} ${p.last_name} ${p.email} ${p.employee_code}`.toLowerCase().includes(q));
  }, [rows, query]);

  const deptOptions = departments.map((d) => ({ value: d.department_id, label: d.code }));

  return (
    <Card className="pad">
      <div className="toolbar">
        <div><h2 className="section-title">Staff and roles</h2>
          <p className="page-sub" style={{ marginTop: 3 }}>A person can hold several roles — a coordinator who also teaches, say.</p></div>
        <div className="row" style={{ gap: 8 }}>
          <div style={{ position: "relative" }}>
            <Search size={13} className="faint" style={{ position: "absolute", left: 10, top: 11 }} />
            <input className="input search" style={{ paddingLeft: 30 }} placeholder="Search staff" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={14} /> Add staff</button>
        </div>
      </div>

      {rows === null ? <SkeletonRows rows={6} /> : shown.length === 0 ? <Empty>No one matches.</Empty> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Roles</th><th>Load</th><th>Sign-in</th><th /></tr></thead>
          <tbody>{shown.map((p, i) => (
            <motion.tr key={p.staff_id} className={p.is_active ? "" : "row-muted"}
                       initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.25) }}>
              <td><b>{p.first_name} {p.last_name}</b>
                <div className="tiny faint">{p.designation} · {p.employee_code} · {p.email}</div></td>
              <td><div className="pills">
                {p.roles.map((r) => (
                  <span key={r.role_assignment_id} className="pill">
                    {roleName(r.role)}{scopeOf(r) ? ` · ${scopeOf(r)}` : ""}
                    <button title="Remove this role" onClick={() => setConfirm({
                      title: `Remove ${roleName(r.role).toLowerCase()} from ${p.first_name}?`,
                      run: () => api.del(`/admin/roles/${r.role_assignment_id}`) })}><X size={10} /></button>
                  </span>))}
                <button className="btn btn-quiet btn-sm" onClick={() => setGiving(p)}><ShieldPlus size={12} /> Role</button>
              </div></td>
              <td className="tiny muted">{p.weekly_hours ? `${Number(p.weekly_hours).toFixed(1)}/${p.max_weekly_hours} h` : "—"}</td>
              <td>{!p.has_login ? (
                    <button className="btn btn-sm" onClick={async () => {
                      try { const r = await api.post("/admin/logins", { staff_id: p.staff_id });
                            setSecret({ who: `${p.first_name} ${p.last_name} · ${p.email}`, password: r.temporary_password }); load(); }
                      catch (e) { toast(e.message, "err"); } }}><Plus size={12} /> Create</button>)
                  : !p.login_active ? <span className="tag tag-oxblood">Disabled</span>
                  : p.must_change_password ? <span className="tag tag-ochre">Not yet signed in</span>
                  : <span className="tag tag-pine">Active</span>}</td>
              <td className="actions">
                {p.has_login && p.user_id !== me.user_id && (
                  <button className="btn btn-sm btn-quiet" title="Reset password" onClick={() => setConfirm({
                    title: `Reset ${p.first_name}'s password?`, danger: false, label: "Reset",
                    body: "They will get a one-time password and must choose a new one at their next sign-in.",
                    run: async () => { const r = await api.post(`/admin/logins/${p.user_id}/reset`);
                                       setSecret({ who: `${p.first_name} ${p.last_name} · ${p.email}`, password: r.temporary_password }); } })}>
                    <KeyRound size={12} /></button>)}
                <button className="btn btn-sm btn-quiet" title="Edit" onClick={() => setEditing(p)}><Pencil size={12} /></button>
              </td>
            </motion.tr>))}
          </tbody></table></div>
      )}

      {adding && (
        <FormDialog title="Add a staff member" submitLabel="Add"
          fields={[{ key: "first_name", label: "First name", required: true }, { key: "last_name", label: "Last name", required: true },
                   { key: "email", label: "Email", type: "email", required: true, full: true },
                   { key: "employee_code", label: "Employee code", required: true },
                   { key: "department_id", label: "Department", type: "select", numeric: true, required: true, options: deptOptions },
                   { key: "designation", label: "Designation", default: "Assistant Professor" },
                   { key: "max_weekly_hours", label: "Weekly hour limit", type: "number", default: 18 },
                   { key: "teaches", label: "Teaching", type: "checkbox", hint: "Teaches (gets the Faculty role)", default: true, full: true },
                   { key: "create_login", label: "Sign-in", type: "checkbox", hint: "Create a sign-in account now", default: true, full: true }]}
          onSubmit={async (v) => {
            const r = await api.post("/admin/staff", v);
            load();
            if (r.temporary_password) setSecret({ who: `${v.first_name} ${v.last_name} · ${v.email}`, password: r.temporary_password });
            else toast("Added.");
          }}
          onClose={() => setAdding(false)} />
      )}
      {editing && (
        <FormDialog title={`Edit ${editing.first_name} ${editing.last_name}`} initial={editing}
          fields={[{ key: "first_name", label: "First name", required: true }, { key: "last_name", label: "Last name", required: true },
                   { key: "email", label: "Email", type: "email", required: true, full: true,
                     help: "Their sign-in email changes with it." },
                   { key: "designation", label: "Designation" },
                   { key: "max_weekly_hours", label: "Weekly hour limit", type: "number" },
                   { key: "department_id", label: "Department", type: "select", numeric: true, options: deptOptions },
                   { key: "is_active", label: "Status", type: "checkbox", hint: "Active — can sign in and be assigned work", full: true }]}
          onSubmit={async (v) => { await api.put(`/admin/staff/${editing.staff_id}`, v); toast("Saved."); load(); }}
          onClose={() => setEditing(null)} />
      )}
      {giving && <RoleDialog person={giving} onClose={() => setGiving(null)} onDone={load} />}
      {secret && <OneTimeSecret who={secret.who} password={secret.password} onClose={() => setSecret(null)} />}
      {confirm && (
        <Confirm title={confirm.title} danger={confirm.danger !== false} confirmLabel={confirm.label || "Remove"}
                 onConfirm={async () => { await confirm.run(); load(); }} onClose={() => setConfirm(null)}>
          {confirm.body || "This takes effect the next time they load a page."}
        </Confirm>
      )}
    </Card>
  );
}
