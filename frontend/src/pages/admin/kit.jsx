/*
 * The building blocks of the admin console: a form in a dialog, a confirm
 * step before anything destructive, a one-time password reveal, and a table
 * that lists, searches, adds, edits and removes for the simple entities.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../api.js";
import { Empty, Modal, SkeletonRows, useToast } from "../../ui.jsx";

/* ---------------------------------------------------------------- fields */
export function Field({ field, value, onChange }) {
  const common = { id: "f-" + field.key, className: field.type === "select" ? "select" : "input",
                   value: value ?? "", required: field.required,
                   onChange: (e) => onChange(field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value) };
  return (
    <div className={"field" + (field.full ? " full" : "")}>
      <label className="label" htmlFor={common.id}>{field.label}{field.required ? "" : " (optional)"}</label>
      {field.type === "select" ? (
        <select {...common}>
          <option value="">Choose…</option>
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : field.type === "checkbox" ? (
        <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {field.hint}</label>
      ) : (
        <input {...common} type={field.type || "text"} step={field.step} placeholder={field.placeholder} />
      )}
      {field.help && <span className="faint tiny">{field.help}</span>}
    </div>
  );
}

export function FormDialog({ title, subtitle, fields, initial = {}, submitLabel = "Save", onSubmit, onClose }) {
  const toast = useToast();
  const [values, setValues] = useState(() => {
    const v = {};
    fields.forEach((f) => { v[f.key] = initial[f.key] ?? f.default ?? (f.type === "checkbox" ? false : ""); });
    return v;
  });
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const clean = {};
      Object.entries(values).forEach(([k, v]) => {
        const f = fields.find((x) => x.key === k);
        if (v === "" && !f.required) return;
        clean[k] = f.type === "select" && f.numeric ? Number(v) : v;
      });
      await onSubmit(clean);
      onClose();
    } catch (e) {
      toast(e.message, "err");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title} subtitle={subtitle}
           footer={<>
             <button className="btn" type="button" onClick={onClose}>Cancel</button>
             <button className="btn btn-primary" type="submit" form="resource-form" disabled={busy}>
               {busy ? "Saving" : submitLabel}</button>
           </>}>
      <form id="resource-form" onSubmit={submit} className="form-grid">
        {fields.map((f) => <Field key={f.key} field={f} value={values[f.key]}
                                  onChange={(v) => setValues((old) => ({ ...old, [f.key]: v }))} />)}
      </form>
    </Modal>
  );
}

export function Confirm({ title, children, danger = true, confirmLabel = "Remove", onConfirm, onClose }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { await onConfirm(); onClose(); }
    catch (e) { toast(e.message, "err"); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={title}
           footer={<>
             <button className="btn" onClick={onClose}>Cancel</button>
             <button className={"btn " + (danger ? "btn-danger" : "btn-primary")} onClick={go} disabled={busy}>{confirmLabel}</button>
           </>}>
      <div className="muted" style={{ fontSize: 13.5 }}>{children}</div>
    </Modal>
  );
}

/* A password shown exactly once. It is never stored or shown again. */
export function OneTimeSecret({ who, password, onClose }) {
  const toast = useToast();
  return (
    <Modal open onClose={onClose} title="Temporary password"
           subtitle={who}
           footer={<button className="btn btn-primary" onClick={onClose}>I have passed it on</button>}>
      <div className="secret">
        <span>{password}</span>
        <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(password); toast("Copied."); }}>
          <Copy size={12} /> Copy</button>
      </div>
      <div className="notice notice-warn">
        This is shown <b>once</b>. It works for one sign-in; they will be asked to choose their own
        password straight away.
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------- the table */
export function ResourceTable({ title, hint, path, idKey, columns, fields, describe, extraActions, onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);     // {} for new, row for edit
  const [removing, setRemoving] = useState(null);

  const load = () => api.get(path).then(setRows).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, [path]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const changed = () => { load(); onChanged && onChanged(); };

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2 className="section-title">{title}</h2>
          {hint && <p className="page-sub" style={{ marginTop: 3 }}>{hint}</p>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div style={{ position: "relative" }}>
            <Search size={13} className="faint" style={{ position: "absolute", left: 10, top: 11 }} />
            <input className="input search" style={{ paddingLeft: 30 }} placeholder="Search"
                   value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={14} /> Add</button>
        </div>
      </div>

      {rows === null ? <SkeletonRows rows={5} /> : shown.length === 0 ? <Empty>{query ? "Nothing matches." : "Nothing here yet."}</Empty> : (
        <div className="table-wrap"><table className="table">
          <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <motion.tr key={r[idKey]} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.015, 0.2) }}>
                {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>)}
                <td className="actions">
                  {extraActions && extraActions(r, changed)}
                  <button className="btn btn-sm btn-quiet" title="Edit" onClick={() => setEditing(r)}><Pencil size={12} /></button>
                  <button className="btn btn-sm btn-quiet" title="Remove" onClick={() => setRemoving(r)}><Trash2 size={12} /></button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table></div>
      )}

      {editing && (
        <FormDialog title={editing[idKey] ? `Edit ${describe(editing)}` : `Add to ${title.toLowerCase()}`}
                    fields={fields} initial={editing}
                    onSubmit={async (v) => {
                      if (editing[idKey]) await api.put(`${path}/${editing[idKey]}`, v);
                      else await api.post(path, v);
                      toast("Saved."); changed();
                    }}
                    onClose={() => setEditing(null)} />
      )}
      {removing && (
        <Confirm title={`Remove ${describe(removing)}?`}
                 onConfirm={async () => { const r = await api.del(`${path}/${removing[idKey]}`); toast(r.message); changed(); }}
                 onClose={() => setRemoving(null)}>
          If anything still refers to it, the database will refuse and say so — nothing in use is
          ever removed silently.
        </Confirm>
      )}
    </div>
  );
}
