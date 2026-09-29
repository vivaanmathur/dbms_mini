import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, BookPlus, ChevronRight, Plus, Trash2, UserPlus, X } from "lucide-react";
import { api } from "../../api.js";
import { Card, Empty, Modal, SkeletonRows, useToast } from "../../ui.jsx";
import { Confirm, FormDialog } from "./kit.jsx";

const YEARS = [{ value: 1, label: "First year (FY)" }, { value: 2, label: "Second year (SY)" },
               { value: 3, label: "Third year (TY)" }, { value: 4, label: "Final year (LY)" }];

function ClassList() {
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [programmes, setProgrammes] = useState([]);
  const [adding, setAdding] = useState(false);
  const load = () => api.get("/admin/classes").then(setRows).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); api.get("/admin/programmes").then(setProgrammes); }, []);

  return (
    <Card className="pad">
      <div className="toolbar">
        <div><h2 className="section-title">Classes</h2>
          <p className="page-sub" style={{ marginTop: 3 }}>Open a class to set what it studies and who teaches it.</p></div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> New class</button>
      </div>
      {rows === null ? <SkeletonRows rows={4} /> : rows.length === 0 ? <Empty>No classes yet.</Empty> : (
        <div className="stack" style={{ gap: 8 }}>
          {rows.map((c, i) => (
            <Link key={c.section_id} to={`/admin/classes/${c.section_id}`}>
              <motion.div className="card-sunk pad-sm card-link between" initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <div>
                  <div className="bold">{c.label}</div>
                  <div className="tiny faint">
                    {c.enrolled} student{c.enrolled === 1 ? "" : "s"} · batches {c.batch_list.join(", ") || "none"} ·
                    class teacher {c.class_teacher || <span style={{ color: "var(--ochre)" }}>not set</span>}
                  </div>
                </div>
                <span className="nudge faint"><ChevronRight size={16} /></span>
              </motion.div>
            </Link>
          ))}
        </div>
      )}
      {adding && (
        <FormDialog title="New class" submitLabel="Create class"
          subtitle="Lab batches are optional — add them now or later."
          fields={[
            { key: "program_id", label: "Programme", type: "select", numeric: true, required: true,
              options: programmes.map((p) => ({ value: p.program_id, label: p.short_name + " — " + p.name })), full: true },
            { key: "year_of_study", label: "Year", type: "select", numeric: true, required: true, options: YEARS },
            { key: "division", label: "Division", required: true, placeholder: "G" },
            { key: "academic_year", label: "Academic year", required: true, placeholder: "2026-27" },
            { key: "batches", label: "Lab batches", placeholder: "G1, G2, G3", help: "Separated by commas" },
          ]}
          onSubmit={async (v) => {
            const batches = (v.batches || "").split(",").map((b) => b.trim()).filter(Boolean);
            const r = await api.post("/admin/classes", { ...v, batches });
            toast(`Created ${r.label}.`);
            navigate(`/admin/classes/${r.section_id}`);
          }}
          onClose={() => setAdding(false)} />
      )}
    </Card>
  );
}

/* Who teaches one subject to this class: nobody, one teacher for the whole
   class, or one per lab batch. */
function Offering({ o, batches, staff, onChanged }) {
  const toast = useToast();
  const [picking, setPicking] = useState(null);   // {lab_batch_id} or {} for whole class
  const [dropping, setDropping] = useState(false);
  const run = (p) => p.then((r) => { toast((r && r.message) || "Saved."); onChanged(); }).catch((e) => toast(e.message, "err"));

  const byBatch = Object.fromEntries(o.assignments.filter((a) => a.lab_batch_id).map((a) => [a.lab_batch_id, a]));
  const whole = o.assignments.find((a) => !a.lab_batch_id);

  const Teacher = ({ a, label }) => (
    <div className="row" style={{ gap: 6 }}>
      {label && <span className="tag">{label}</span>}
      <span style={{ fontSize: 13 }}>{a.teacher}</span>
      <span className="faint tiny">· {a.sessions} session{a.sessions === 1 ? "" : "s"}/wk</span>
      {a.sessions === 0 && (
        <button className="btn btn-quiet btn-sm" title="Remove" onClick={() => run(api.del(`/admin/assignments/${a.assignment_id}`))}>
          <X size={12} /></button>)}
    </div>
  );

  return (
    <div className="unit" style={{ padding: "12px 4px" }}>
      <div className="between" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 200 }}>
          <div className="bold">{o.code} <span className="tag" style={{ marginLeft: 4 }}>{o.subject_type === "PRACTICAL" ? "Lab" : "Theory"}</span></div>
          <div className="tiny faint" style={{ marginTop: 2 }}>{o.name}</div>
        </div>
        <div style={{ flex: 1, minWidth: 260 }} className="stack">
          {o.mode === "none" && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="tag tag-ochre">Nobody teaches this yet</span>
              <button className="btn btn-sm" onClick={() => setPicking({})}><UserPlus size={12} /> Whole class</button>
              {batches.length > 0 && <span className="faint tiny">or assign each batch below</span>}
            </div>
          )}
          {whole && <Teacher a={whole} label="Whole class" />}
          {!whole && batches.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              {batches.map((b) => byBatch[b.lab_batch_id]
                ? <Teacher key={b.lab_batch_id} a={byBatch[b.lab_batch_id]} label={b.code} />
                : (
                  <div key={b.lab_batch_id} className="row" style={{ gap: 6 }}>
                    <span className="tag">{b.code}</span>
                    <button className="btn btn-sm btn-quiet" onClick={() => setPicking({ lab_batch_id: b.lab_batch_id, code: b.code })}>
                      <UserPlus size={12} /> Assign a teacher</button>
                  </div>))}
            </div>
          )}
        </div>
        <button className="btn btn-quiet btn-sm" title="Stop offering this subject" onClick={() => setDropping(true)}>
          <Trash2 size={12} /></button>
      </div>

      {picking && (
        <FormDialog title={`Who teaches ${o.code}${picking.code ? " to " + picking.code : " to the whole class"}?`}
          fields={[{ key: "staff_id", label: "Teacher", type: "select", numeric: true, required: true, full: true,
                     options: staff.map((s) => ({ value: s.staff_id, label: s.first_name + " " + s.last_name })) }]}
          submitLabel="Assign"
          onSubmit={(v) => api.post("/admin/assignments", { offering_id: o.offering_id, staff_id: v.staff_id,
                                                            lab_batch_id: picking.lab_batch_id || null })
                        .then(() => { toast("Assigned."); onChanged(); })}
          onClose={() => setPicking(null)} />
      )}
      {dropping && (
        <Confirm title={`Stop offering ${o.code} to this class?`}
                 onConfirm={() => api.del(`/admin/offerings/${o.offering_id}`).then(() => { toast("Removed."); onChanged(); })}
                 onClose={() => setDropping(false)}>
          Only possible while nobody is assigned to teach it. Remove its teachers first if there are any.
        </Confirm>
      )}
    </div>
  );
}

function ClassDetail() {
  const { sectionId } = useParams();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [teaching, setTeaching] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [staff, setStaff] = useState([]);
  const [offering, setOffering] = useState(false);
  const [batchCode, setBatchCode] = useState("");

  const load = async () => {
    try {
      const [classes, t] = await Promise.all([api.get("/admin/classes"), api.get(`/admin/classes/${sectionId}/teaching`)]);
      setInfo(classes.find((c) => String(c.section_id) === sectionId));
      setTeaching(t);
    } catch (e) { toast(e.message, "err"); }
  };
  useEffect(() => {
    load();
    api.get("/admin/subjects").then(setSubjects);
    api.get("/admin/staff").then((s) => setStaff(s.filter((x) => x.is_active && x.roles.some((r) => r.role === "FACULTY"))));
  }, [sectionId]);

  if (!info || !teaching) return <Card className="pad"><SkeletonRows rows={6} /></Card>;
  const offered = new Set(teaching.offerings.map((o) => o.subject_id));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link to="/admin/classes" className="btn btn-quiet btn-sm" style={{ alignSelf: "flex-start" }}><ArrowLeft size={13} /> All classes</Link>
      <Card className="pad">
        <div className="toolbar">
          <div><div className="eyebrow">{teaching.term}</div>
            <h2 className="display" style={{ fontSize: 24, margin: "4px 0 0" }}>{info.label}</h2>
            <p className="page-sub" style={{ marginTop: 4 }}>
              {info.enrolled} student{info.enrolled === 1 ? "" : "s"} · class teacher {info.class_teacher || "not set"}</p></div>
          <button className="btn btn-primary" onClick={() => setOffering(true)}><BookPlus size={14} /> Offer a subject</button>
        </div>
        <div className="notice notice-plain" style={{ marginBottom: 6 }}>
          Each subject is taught either to the <b>whole class</b> by one teacher, or{" "}
          <b>batch by batch</b> with one teacher per batch — never a mix. The database enforces this.
        </div>
        {teaching.offerings.length === 0 ? <Empty>This class does not take any subjects yet.</Empty> :
          teaching.offerings.map((o) => <Offering key={o.offering_id} o={o} batches={teaching.batches} staff={staff} onChanged={load} />)}
      </Card>

      <Card className="pad">
        <h2 className="section-title" style={{ marginBottom: 10 }}>Lab batches</h2>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {teaching.batches.map((b) => (
            <span key={b.lab_batch_id} className="pill">{b.code}
              <button title="Remove" onClick={() => api.del(`/admin/batches/${b.lab_batch_id}`).then(load).catch((e) => toast(e.message, "err"))}>
                <X size={11} /></button></span>))}
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!batchCode.trim()) return;
              api.post(`/admin/classes/${sectionId}/batches`, { code: batchCode }).then(() => { setBatchCode(""); load(); })
                .catch((er) => toast(er.message, "err")); }}>
            <input className="input" style={{ width: 110, padding: "5px 9px" }} placeholder="Add, e.g. G4"
                   value={batchCode} onChange={(e) => setBatchCode(e.target.value)} />
          </form>
        </div>
      </Card>

      {offering && (
        <Modal open onClose={() => setOffering(false)} title="Offer a subject" subtitle={info.label}
               footer={<button className="btn" onClick={() => setOffering(false)}>Close</button>}>
          <div className="stack" style={{ gap: 6 }}>
            {subjects.filter((s) => !offered.has(s.subject_id)).map((s) => (
              <button key={s.subject_id} className="cand"
                      onClick={() => api.post(`/admin/classes/${sectionId}/offerings`, { subject_id: s.subject_id })
                        .then(() => { toast(`${s.code} added.`); setOffering(false); load(); })
                        .catch((e) => toast(e.message, "err"))}>
                <span style={{ flex: 1 }}><b>{s.code}</b> <span className="faint tiny">{s.name}</span></span>
                <Plus size={14} className="faint" />
              </button>))}
            {subjects.every((s) => offered.has(s.subject_id)) && <Empty>Every subject is already offered.</Empty>}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Classes() {
  return (
    <Routes>
      <Route index element={<ClassList />} />
      <Route path=":sectionId" element={<ClassDetail />} />
    </Routes>
  );
}
