"""
Syllabus progress.

Progress is kept per teaching assignment: a theory subject taught to the
whole class has one, a lab taught batch by batch has one per batch, so G1
and G2 move through the experiments independently.
"""
import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import audit
from app.calendar import current_term
from app.db import execute, fetch_all, fetch_one, placeholders
from app.security import require_section, signed_in, teaching_only

router = APIRouter(prefix="/syllabus", tags=["Syllabus"])

ASSIGNMENT_QUERY = """
    SELECT ta.assignment_id, ta.offering_id, ta.lab_batch_id, lb.code AS lab_batch_code,
           ta.staff_id, CONCAT(st.first_name, ' ', st.last_name) AS teacher_name,
           so.section_id, fn_class_label(so.section_id) AS class_label,
           sub.subject_id, sub.code AS subject_code, sub.name AS subject_name,
           sub.subject_type, sub.planned_hours,
           p.total_items, p.completed_items,
           fn_delivered_hours(ta.assignment_id) AS delivered_hours
    FROM teaching_assignment ta
    JOIN subject_offering so ON so.offering_id = ta.offering_id
    JOIN subject sub         ON sub.subject_id = so.subject_id
    JOIN staff st            ON st.staff_id = ta.staff_id
    JOIN vw_assignment_progress p ON p.assignment_id = ta.assignment_id
    LEFT JOIN lab_batch lb   ON lb.lab_batch_id = ta.lab_batch_id
    WHERE {where}
    ORDER BY sub.code, lb.code
"""


def _with_percent(rows):
    for r in rows:
        r["percent"] = round(r["completed_items"] / r["total_items"] * 100, 1) if r["total_items"] else 0
    return rows


@router.get("/mine")
def mine(me=Depends(teaching_only)):
    """Everything I teach, with how far through the syllabus each one is."""
    return _with_percent(fetch_all(ASSIGNMENT_QUERY.format(where="ta.staff_id = %s"), (me.staff_id,)))


@router.get("/class/{section_id}")
def for_class(section_id: int, me=Depends(signed_in)):
    """Every subject of one class — for the class teacher, a coordinator, or
    a student. A student only sees their own lab batch."""
    require_section(me, section_id)
    if me.is_student:
        batch = fetch_one("SELECT lab_batch_id FROM student WHERE student_id = %s", (me.student_id,))
        rows = fetch_all(
            ASSIGNMENT_QUERY.format(where="so.section_id = %s AND (ta.lab_batch_id IS NULL OR ta.lab_batch_id = %s)"),
            (section_id, batch["lab_batch_id"]))
    else:
        rows = fetch_all(ASSIGNMENT_QUERY.format(where="so.section_id = %s"), (section_id,))
    return _with_percent(rows)


def _assignment(assignment_id, me):
    row = fetch_one(ASSIGNMENT_QUERY.format(where="ta.assignment_id = %s"), (assignment_id,))
    if row is None:
        raise HTTPException(404, "Not found.")
    if row["staff_id"] != me.staff_id:
        require_section(me, row["section_id"])
    return row


@router.get("/assignment/{assignment_id}")
def tree(assignment_id: int, me=Depends(signed_in)):
    """The whole syllabus of one subject, ticked where it has been covered."""
    info = _with_percent([_assignment(assignment_id, me)])[0]
    done = {}
    for row in fetch_all(
        """
        SELECT p.progress_id, p.subtopic_id, p.experiment_id, p.completed_on, p.log_id,
               CONCAT(st.first_name, ' ', st.last_name) AS completed_by
        FROM syllabus_progress p
        JOIN staff st ON st.staff_id = p.completed_by_staff_id
        WHERE p.assignment_id = %s
        """,
        (assignment_id,),
    ):
        key = ("s", row["subtopic_id"]) if row["subtopic_id"] else ("e", row["experiment_id"])
        done[key] = row

    if info["subject_type"] == "PRACTICAL":
        experiments = fetch_all(
            "SELECT experiment_id, experiment_number, title, planned_hours "
            "FROM practical_experiment WHERE subject_id = %s ORDER BY experiment_number",
            (info["subject_id"],))
        for e in experiments:
            e["done"] = done.get(("e", e["experiment_id"]))
        return {"assignment": info, "units": [], "experiments": experiments}

    # three queries for the three levels, stitched together here
    units = fetch_all(
        "SELECT unit_id, unit_number, title, planned_hours FROM syllabus_unit "
        "WHERE subject_id = %s ORDER BY unit_number", (info["subject_id"],))
    topics = fetch_all(
        "SELECT t.topic_id, t.unit_id, t.topic_number, t.title FROM syllabus_topic t "
        "JOIN syllabus_unit u ON u.unit_id = t.unit_id WHERE u.subject_id = %s "
        "ORDER BY t.topic_number", (info["subject_id"],))
    subtopics = fetch_all(
        "SELECT st.subtopic_id, st.topic_id, st.subtopic_number, st.title FROM syllabus_subtopic st "
        "JOIN syllabus_topic t ON t.topic_id = st.topic_id JOIN syllabus_unit u ON u.unit_id = t.unit_id "
        "WHERE u.subject_id = %s ORDER BY st.subtopic_number", (info["subject_id"],))
    for s in subtopics:
        s["done"] = done.get(("s", s["subtopic_id"]))
    for t in topics:
        t["subtopics"] = [s for s in subtopics if s["topic_id"] == t["topic_id"]]
    for u in units:
        u["topics"] = [t for t in topics if t["unit_id"] == u["unit_id"]]
    return {"assignment": info, "units": units, "experiments": []}


@router.get("/assignment/{assignment_id}/history")
def history(assignment_id: int, me=Depends(signed_in)):
    """The lecture history log: every lecture of this subject that took
    place, who took it, and what it covered."""
    _assignment(assignment_id, me)
    term = current_term()
    return fetch_all(
        """
        SELECT ll.log_id, ll.lecture_date, ll.hours, ll.remarks,
               CONCAT(st.first_name, ' ', st.last_name) AS taken_by,
               ts.start_time, ts.end_time, r.code AS room_code,
               (SELECT GROUP_CONCAT(COALESCE(sub.title, pe.title) ORDER BY p.progress_id SEPARATOR ' · ')
                  FROM syllabus_progress p
                  LEFT JOIN syllabus_subtopic sub ON sub.subtopic_id = p.subtopic_id
                  LEFT JOIN practical_experiment pe ON pe.experiment_id = p.experiment_id
                 WHERE p.log_id = ll.log_id) AS covered
        FROM lecture_log ll
        JOIN timetable_slot ts ON ts.slot_id = ll.slot_id
        JOIN staff st ON st.staff_id = ll.delivered_by_staff_id
        JOIN room r ON r.room_id = ts.room_id
        WHERE ts.assignment_id = %s AND ll.lecture_date BETWEEN %s AND %s
        ORDER BY ll.lecture_date DESC
        """,
        (assignment_id, term["start_date"], term["end_date"]),
    )


class Tick(BaseModel):
    subtopic_id: int | None = None
    experiment_id: int | None = None
    completed_on: str | None = None


@router.post("/assignment/{assignment_id}/tick")
def tick(assignment_id: int, data: Tick, me=Depends(teaching_only)):
    info = _assignment(assignment_id, me)
    if info["staff_id"] != me.staff_id:
        raise HTTPException(403, "Only the teacher of this subject can mark its syllabus.")
    if (data.subtopic_id is None) == (data.experiment_id is None):
        raise HTTPException(400, "Mark either a subtopic or an experiment.")

    # the item has to belong to this subject
    if data.subtopic_id is not None:
        ok = fetch_one(
            "SELECT 1 AS x FROM syllabus_subtopic st JOIN syllabus_topic t ON t.topic_id = st.topic_id "
            "JOIN syllabus_unit u ON u.unit_id = t.unit_id WHERE st.subtopic_id = %s AND u.subject_id = %s",
            (data.subtopic_id, info["subject_id"]))
    else:
        ok = fetch_one("SELECT 1 AS x FROM practical_experiment WHERE experiment_id = %s AND subject_id = %s",
                       (data.experiment_id, info["subject_id"]))
    if not ok:
        raise HTTPException(400, "That item is not part of this subject's syllabus.")

    on = data.completed_on or datetime.date.today().isoformat()
    progress_id = execute(
        "INSERT INTO syllabus_progress (assignment_id, subtopic_id, experiment_id, completed_on, "
        "completed_by_staff_id) VALUES (%s, %s, %s, %s, %s)",
        (assignment_id, data.subtopic_id, data.experiment_id, on, me.staff_id))
    return {"progress_id": progress_id}


@router.delete("/progress/{progress_id}")
def untick(progress_id: int, me=Depends(teaching_only)):
    row = fetch_one(
        "SELECT p.progress_id, ta.staff_id FROM syllabus_progress p "
        "JOIN teaching_assignment ta ON ta.assignment_id = p.assignment_id WHERE p.progress_id = %s",
        (progress_id,))
    if row is None:
        raise HTTPException(404, "Not found.")
    if row["staff_id"] != me.staff_id:
        raise HTTPException(403, "Only the teacher of this subject can change its syllabus.")
    execute("DELETE FROM syllabus_progress WHERE progress_id = %s", (progress_id,))
    return {"message": "Unmarked."}


@router.get("/lecture-options")
def lecture_options(slot_id: int, me=Depends(teaching_only)):
    """When marking a lecture conducted: the items of its syllabus not yet
    covered, so the teacher can tick what they taught in that lecture."""
    slot = fetch_one("SELECT assignment_id FROM timetable_slot WHERE slot_id = %s", (slot_id,))
    if slot is None:
        raise HTTPException(404, "Not found.")
    data = tree(slot["assignment_id"], me)
    remaining = []
    for unit in data["units"]:
        for topic in unit["topics"]:
            for sub in topic["subtopics"]:
                if not sub["done"]:
                    remaining.append({"kind": "subtopic", "id": sub["subtopic_id"],
                                      "label": sub["title"],
                                      "group": f"Unit {unit['unit_number']} · {topic['title']}"})
    for e in data["experiments"]:
        if not e["done"]:
            remaining.append({"kind": "experiment", "id": e["experiment_id"],
                              "label": f"Experiment {e['experiment_number']}: {e['title']}",
                              "group": "Experiments"})
    return remaining
