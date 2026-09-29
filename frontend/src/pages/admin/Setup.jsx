import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { api } from "../../api.js";
import { Card, useToast } from "../../ui.jsx";
import { ResourceTable } from "./kit.jsx";

const TABS = ["Departments", "Programmes", "Terms", "Periods", "Rooms"];

export default function Setup() {
  const toast = useToast();
  const [tab, setTab] = useState("Departments");
  const [departments, setDepartments] = useState([]);
  useEffect(() => { api.get("/admin/departments").then(setDepartments); }, [tab]);
  const deptOptions = departments.map((d) => ({ value: d.department_id, label: `${d.code} — ${d.name}` }));

  return (
    <Card className="pad">
      <div className="tabs">
        {TABS.map((t) => <button key={t} className={"tab" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Departments" && (
        <ResourceTable title="Departments" hint="The top of the organisation. A programme director belongs to one."
          path="/admin/departments" idKey="department_id" describe={(r) => r.code}
          columns={[{ key: "code", label: "Code", render: (r) => <b>{r.code}</b> }, { key: "name", label: "Name" }]}
          fields={[{ key: "code", label: "Code", required: true, placeholder: "DCET" },
                   { key: "name", label: "Name", required: true, full: true }]} />
      )}

      {tab === "Programmes" && (
        <ResourceTable title="Programmes" hint="A programme sits inside a department. A programme coordinator belongs to one."
          path="/admin/programmes" idKey="program_id" describe={(r) => r.short_name || r.code}
          columns={[{ key: "code", label: "Code", render: (r) => <b>{r.code}</b> }, { key: "short_name", label: "Short name" },
                    { key: "name", label: "Name" }, { key: "department_code", label: "Department" },
                    { key: "duration_years", label: "Years" }]}
          fields={[{ key: "department_id", label: "Department", type: "select", numeric: true, options: deptOptions, required: true },
                   { key: "code", label: "Code", required: true, placeholder: "BTECH-AIDS" },
                   { key: "short_name", label: "Short name", required: true, placeholder: "AI&DS", help: "Used in class names" },
                   { key: "duration_years", label: "Duration (years)", type: "number" },
                   { key: "name", label: "Full name", required: true, full: true }]} />
      )}

      {tab === "Terms" && (
        <ResourceTable title="Terms" hint="Exactly one term is current. Week numbers, lecture dates and progress are all measured against it."
          path="/admin/terms" idKey="term_id" describe={(r) => r.name}
          columns={[{ key: "name", label: "Name", render: (r) => <b>{r.name}</b> }, { key: "start_date", label: "Starts" },
                    { key: "end_date", label: "Ends" },
                    { key: "is_current", label: "", render: (r) => r.is_current ? <span className="tag tag-pine">Current</span> : null }]}
          fields={[{ key: "name", label: "Name", required: true, full: true, placeholder: "2026-27 Even Semester" },
                   { key: "start_date", label: "Starts", type: "date", required: true },
                   { key: "end_date", label: "Ends", type: "date", required: true }]}
          extraActions={(r, changed) => !r.is_current && (
            <button className="btn btn-sm" onClick={async () => {
              try { toast((await api.post(`/admin/terms/${r.term_id}/make-current`)).message); changed(); }
              catch (e) { toast(e.message, "err"); }
            }}><Star size={12} /> Make current</button>
          )} />
      )}

      {tab === "Periods" && (
        <ResourceTable title="Periods" hint="The teaching day. The timetable editor and the make-up planner build sessions from these."
          path="/admin/periods" idKey="period_id" describe={(r) => r.label}
          columns={[{ key: "sort_order", label: "#" }, { key: "label", label: "Label", render: (r) => <b>{r.label}</b> },
                    { key: "start_time", label: "From", render: (r) => <span className="mono">{r.start_time}</span> },
                    { key: "end_time", label: "To", render: (r) => <span className="mono">{r.end_time}</span> }]}
          fields={[{ key: "label", label: "Label", required: true, placeholder: "P1" },
                   { key: "sort_order", label: "Order in the day", type: "number", required: true },
                   { key: "start_time", label: "From", type: "time", required: true },
                   { key: "end_time", label: "To", type: "time", required: true }]} />
      )}

      {tab === "Rooms" && (
        <ResourceTable title="Rooms" hint="A lab that can hold two batches at once has a capacity of 2 groups."
          path="/admin/rooms" idKey="room_id" describe={(r) => r.code}
          columns={[{ key: "code", label: "Room", render: (r) => <b>{r.code}</b> }, { key: "room_type", label: "Type",
                      render: (r) => <span className="tag">{r.room_type === "LAB" ? "Lab" : "Lecture"}</span> },
                    { key: "building", label: "Building" }, { key: "floor", label: "Floor" },
                    { key: "capacity", label: "Seats" }, { key: "concurrent_capacity", label: "Groups at once" }]}
          fields={[{ key: "code", label: "Room", required: true, placeholder: "VY115" },
                   { key: "room_type", label: "Type", type: "select", required: true,
                     options: [{ value: "LECTURE", label: "Lecture room" }, { value: "LAB", label: "Laboratory" }] },
                   { key: "building", label: "Building", required: true }, { key: "floor", label: "Floor" },
                   { key: "capacity", label: "Seats", type: "number", required: true },
                   { key: "concurrent_capacity", label: "Groups at once", type: "number", default: 1 }]} />
      )}
    </Card>
  );
}
