import { useEffect, useState } from "react";
import { ListTree, Plus, Trash2 } from "lucide-react";
import { api } from "../../api.js";
import { Card, Empty, Modal, SkeletonRows, useToast } from "../../ui.jsx";
import { ResourceTable } from "./kit.jsx";

/* A title that saves itself when you leave the field. */
function Inline({ value, onSave }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input className="inline-input" value={text} onChange={(e) => setText(e.target.value)}
           onBlur={() => text.trim() && text !== value && onSave(text.trim())}
           onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
  );
}

function Adder({ placeholder, onAdd }) {
  const [text, setText] = useState("");
  return (
    <form className="row" style={{ gap: 6, padding: "4px 6px" }}
          onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAdd(text.trim()); setText(""); } }}>
      <Plus size={13} className="faint" />
      <input className="inline-input" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
    </form>
  );
}

/* Units, topics and subtopics — or numbered experiments for a lab. Anything
   a class has already been marked as covering cannot be deleted. */
function SyllabusEditor({ subject, onClose }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const load = () => api.get(`/admin/subjects/${subject.subject_id}/syllabus`).then(setD).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);

  const run = (p) => p.then(load).catch((e) => toast(e.message, "err"));
  const rename = (kind, id) => (title) => run(api.put(`/admin/syllabus/${kind}/${id}`, { title }));
  const remove = (kind, id) => run(api.del(`/admin/syllabus/${kind}/${id}`));
  const Del = ({ kind, id }) => (
    <button className="btn btn-quiet btn-sm ghost" onClick={() => remove(kind, id)} title="Remove"><Trash2 size={12} /></button>);

  const lab = subject.subject_type === "PRACTICAL";
  return (
    <Modal open wide onClose={onClose} title={`${subject.code} syllabus`} subtitle={subject.name}
           footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      {!d ? <SkeletonRows rows={6} /> : (
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <p className="faint tiny" style={{ marginTop: 0 }}>Click any title to rename it. Press Enter in a
            blank line to add. Changes save as you go.</p>
          {lab ? (
            <>
              {d.experiments.map((e) => (
                <div key={e.experiment_id} className="editor-row">
                  <span className="faint mono" style={{ width: 22 }}>{e.experiment_number}.</span>
                  <div className="grow"><Inline value={e.title} onSave={rename("experiment", e.experiment_id)} /></div>
                  <Del kind="experiment" id={e.experiment_id} />
                </div>))}
              <Adder placeholder="Add an experiment" onAdd={(title) => run(api.post(`/admin/subjects/${subject.subject_id}/experiments`, { title }))} />
            </>
          ) : (
            <>
              {d.units.map((u) => (
                <div key={u.unit_id} className="unit">
                  <div className="editor-row" style={{ paddingTop: 10 }}>
                    <span className="unit-title" style={{ whiteSpace: "nowrap" }}>Unit {u.unit_number}</span>
                    <div className="grow unit-title"><Inline value={u.title} onSave={rename("unit", u.unit_id)} /></div>
                    <Del kind="unit" id={u.unit_id} />
                  </div>
                  {u.topics.map((t) => (
                    <div key={t.topic_id} style={{ paddingLeft: 26 }}>
                      <div className="editor-row">
                        <span className="topic-title" style={{ margin: 0 }}>{t.topic_number}.</span>
                        <div className="grow bold" style={{ fontSize: 12.5 }}><Inline value={t.title} onSave={rename("topic", t.topic_id)} /></div>
                        <Del kind="topic" id={t.topic_id} />
                      </div>
                      {t.subtopics.map((s) => (
                        <div key={s.subtopic_id} className="editor-row" style={{ paddingLeft: 22 }}>
                          <span className="faint" style={{ fontSize: 12 }}>{s.subtopic_number}.</span>
                          <div className="grow"><Inline value={s.title} onSave={rename("subtopic", s.subtopic_id)} /></div>
                          <Del kind="subtopic" id={s.subtopic_id} />
                        </div>))}
                      <div style={{ paddingLeft: 22 }}>
                        <Adder placeholder="Add a subtopic" onAdd={(title) => run(api.post(`/admin/topics/${t.topic_id}/subtopics`, { title }))} />
                      </div>
                    </div>))}
                  <div style={{ paddingLeft: 26 }}>
                    <Adder placeholder="Add a topic" onAdd={(title) => run(api.post(`/admin/units/${u.unit_id}/topics`, { title }))} />
                  </div>
                </div>))}
              <Adder placeholder="Add a unit" onAdd={(title) => run(api.post(`/admin/subjects/${subject.subject_id}/units`, { title }))} />
            </>
          )}
          {!lab && d.units.length === 0 && <Empty>No units yet — add the first one above.</Empty>}
        </div>
      )}
    </Modal>
  );
}

export default function Subjects() {
  const [programmes, setProgrammes] = useState([]);
  const [editing, setEditing] = useState(null);
  useEffect(() => { api.get("/admin/programmes").then(setProgrammes); }, []);

  return (
    <Card className="pad">
      <ResourceTable title="Subjects"
        hint="Defined once, then offered to as many classes as need it (under Classes & teaching)."
        path="/admin/subjects" idKey="subject_id" describe={(r) => r.code}
        columns={[
          { key: "code", label: "Code", render: (r) => <b>{r.code}</b> },
          { key: "name", label: "Name" },
          { key: "subject_type", label: "Type", render: (r) => <span className="tag">{r.subject_type === "PRACTICAL" ? "Lab" : "Theory"}</span> },
          { key: "planned_hours", label: "Hours" },
          { key: "offered_to", label: "Classes" },
          { key: "syllabus_items", label: "Syllabus", render: (r) => r.syllabus_items
              ? <span className="muted">{r.syllabus_items} {r.subject_type === "PRACTICAL" ? "experiments" : "subtopics"}</span>
              : <span className="tag tag-ochre">Empty</span> },
        ]}
        fields={[
          { key: "program_id", label: "Programme", type: "select", numeric: true, required: true,
            options: programmes.map((p) => ({ value: p.program_id, label: p.short_name })) },
          { key: "code", label: "Code", required: true, placeholder: "DBMS" },
          { key: "name", label: "Name", required: true, full: true },
          { key: "subject_type", label: "Type", type: "select", required: true,
            options: [{ value: "THEORY", label: "Theory" }, { value: "PRACTICAL", label: "Practical (lab)" }] },
          { key: "planned_hours", label: "Planned hours", type: "number", required: true },
          { key: "credits", label: "Credits", type: "number", step: "0.5" },
        ]}
        extraActions={(r) => (
          <button className="btn btn-sm" onClick={() => setEditing(r)}><ListTree size={12} /> Syllabus</button>
        )} />
      {editing && <SyllabusEditor subject={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}
