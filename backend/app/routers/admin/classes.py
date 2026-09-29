"""
Administration: classes, their lab batches, which subjects each class takes,
and who teaches them.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import audit
from app.calendar import current_term
from app.db import execute, fetch_all, fetch_one, transaction
from app.security import admin_only

router = APIRouter()


# ---------------------------------------------------------------------------
# Classes and lab batches
# ---------------------------------------------------------------------------
@router.get("/classes")
def list_classes(me=Depends(admin_only)):
    rows = fetch_all(
        """
        SELECT c.*,
               (SELECT COUNT(*) FROM student s WHERE s.section_id = c.section_id AND s.is_active) AS enrolled,
               (SELECT GROUP_CONCAT(code ORDER BY code) FROM lab_batch b WHERE b.section_id = c.section_id) AS batches,
               (SELECT CONCAT(st.first_name, ' ', st.last_name) FROM role_assignment ra
                  JOIN staff st ON st.staff_id = ra.staff_id
                 WHERE ra.role = 'CLASS_TEACHER' AND ra.section_id = c.section_id) AS class_teacher
        FROM vw_class c
        ORDER BY c.program_short, c.year_of_study, c.division
        """)
    for r in rows:
        r["batch_list"] = r["batches"].split(",") if r["batches"] else []
    return rows


class ClassIn(BaseModel):
    program_id: int
    year_of_study: int
    division: str
    academic_year: str
    student_count: int = 0
    batches: list[str] = []          # e.g. ["G1", "G2", "G3"]


@router.post("/classes")
def create_class(data: ClassIn, me=Depends(admin_only)):
    division = data.division.strip().upper()
    with transaction() as tx:
        section = tx.execute(
            "INSERT INTO section (program_id, year_of_study, division, academic_year, student_count) "
            "VALUES (%s, %s, %s, %s, %s)",
            (data.program_id, data.year_of_study, division, data.academic_year.strip(), data.student_count))
        for code in data.batches:
            if code.strip():
                tx.execute("INSERT INTO lab_batch (section_id, code) VALUES (%s, %s)",
                           (section, code.strip().upper()))
        label = tx.fetch_one("SELECT fn_class_label(%s) AS l", (section,))["l"]
        audit.record(me, "CREATE", "section", section, f"Added class {label}", tx)
    return {"section_id": section, "label": label}


class ClassEdit(BaseModel):
    year_of_study: int | None = None
    division: str | None = None
    academic_year: str | None = None
    student_count: int | None = None


@router.put("/classes/{section_id}")
def edit_class(section_id: int, data: ClassEdit, me=Depends(admin_only)):
    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "division" in values:
        values["division"] = values["division"].strip().upper()
    if values:
        execute(f"UPDATE section SET {', '.join(f'{k} = %s' for k in values)} WHERE section_id = %s",
                tuple(values.values()) + (section_id,))
    label = fetch_one("SELECT fn_class_label(%s) AS l", (section_id,))["l"]
    audit.record(me, "UPDATE", "section", section_id, f"Edited class {label}")
    return {"message": "Saved."}


@router.delete("/classes/{section_id}")
def delete_class(section_id: int, me=Depends(admin_only)):
    label = fetch_one("SELECT fn_class_label(%s) AS l", (section_id,))
    if label is None or label["l"] is None:
        raise HTTPException(404, "Not found.")
    with transaction() as tx:
        tx.execute("DELETE FROM lab_batch WHERE section_id = %s", (section_id,))
        tx.execute("DELETE FROM section WHERE section_id = %s", (section_id,))
        audit.record(me, "DELETE", "section", section_id, f"Removed class {label['l']}", tx)
    return {"message": f"Removed {label['l']}."}


class BatchIn(BaseModel):
    code: str


@router.post("/classes/{section_id}/batches")
def add_batch(section_id: int, data: BatchIn, me=Depends(admin_only)):
    new = execute("INSERT INTO lab_batch (section_id, code) VALUES (%s, %s)",
                  (section_id, data.code.strip().upper()))
    audit.record(me, "CREATE", "lab_batch", new, f"Added batch {data.code.upper()}")
    return {"lab_batch_id": new}


@router.delete("/batches/{lab_batch_id}")
def delete_batch(lab_batch_id: int, me=Depends(admin_only)):
    row = fetch_one("SELECT code FROM lab_batch WHERE lab_batch_id = %s", (lab_batch_id,))
    if row is None:
        raise HTTPException(404, "Not found.")
    execute("DELETE FROM lab_batch WHERE lab_batch_id = %s", (lab_batch_id,))
    audit.record(me, "DELETE", "lab_batch", lab_batch_id, f"Removed batch {row['code']}")
    return {"message": "Removed."}


# ---------------------------------------------------------------------------
# What a class studies, and who teaches it
# ---------------------------------------------------------------------------
@router.get("/classes/{section_id}/teaching")
def teaching(section_id: int, me=Depends(admin_only)):
    """Every subject this class takes this term, and for each, who teaches it
    — one teacher for the class, or one per batch."""
    term = current_term()
    offerings = fetch_all(
        """
        SELECT so.offering_id, sub.subject_id, sub.code, sub.name, sub.subject_type
        FROM subject_offering so JOIN subject sub ON sub.subject_id = so.subject_id
        WHERE so.section_id = %s AND so.term_id = %s ORDER BY sub.code
        """, (section_id, term["term_id"]))
    assignments = fetch_all(
        """
        SELECT ta.assignment_id, ta.offering_id, ta.lab_batch_id, lb.code AS lab_batch_code,
               ta.staff_id, CONCAT(st.first_name, ' ', st.last_name) AS teacher,
               (SELECT COUNT(*) FROM timetable_slot ts WHERE ts.assignment_id = ta.assignment_id) AS sessions
        FROM teaching_assignment ta
        JOIN subject_offering so ON so.offering_id = ta.offering_id
        JOIN staff st ON st.staff_id = ta.staff_id
        LEFT JOIN lab_batch lb ON lb.lab_batch_id = ta.lab_batch_id
        WHERE so.section_id = %s AND so.term_id = %s ORDER BY lb.code
        """, (section_id, term["term_id"]))
    for o in offerings:
        o["assignments"] = [a for a in assignments if a["offering_id"] == o["offering_id"]]
        batch_wise = any(a["lab_batch_id"] for a in o["assignments"])
        o["mode"] = "batch" if batch_wise else ("class" if o["assignments"] else "none")
    batches = fetch_all("SELECT lab_batch_id, code FROM lab_batch WHERE section_id = %s ORDER BY code",
                        (section_id,))
    return {"term": term["name"], "offerings": offerings, "batches": batches}


class OfferIn(BaseModel):
    subject_id: int


@router.post("/classes/{section_id}/offerings")
def offer(section_id: int, data: OfferIn, me=Depends(admin_only)):
    term = current_term()
    new = execute("INSERT INTO subject_offering (subject_id, section_id, term_id) VALUES (%s, %s, %s)",
                  (data.subject_id, section_id, term["term_id"]))
    code = fetch_one("SELECT code FROM subject WHERE subject_id = %s", (data.subject_id,))["code"]
    label = fetch_one("SELECT fn_class_label(%s) AS l", (section_id,))["l"]
    audit.record(me, "CREATE", "subject_offering", new, f"Offered {code} to {label}")
    return {"offering_id": new}


@router.delete("/offerings/{offering_id}")
def withdraw_offering(offering_id: int, me=Depends(admin_only)):
    execute("DELETE FROM subject_offering WHERE offering_id = %s", (offering_id,))
    audit.record(me, "DELETE", "subject_offering", offering_id, "Withdrew a subject from a class")
    return {"message": "Removed."}


class AssignIn(BaseModel):
    offering_id: int
    staff_id: int
    lab_batch_id: int | None = None      # None = the whole class


@router.post("/assignments")
def assign(data: AssignIn, me=Depends(admin_only)):
    """trg_assignment_before_insert refuses mixing whole-class and per-batch
    teaching, and a batch from another class; the message comes back as-is."""
    new = execute("INSERT INTO teaching_assignment (offering_id, lab_batch_id, staff_id) VALUES (%s, %s, %s)",
                  (data.offering_id, data.lab_batch_id, data.staff_id))
    row = fetch_one(
        "SELECT sub.code, lb.code AS batch, CONCAT(st.first_name, ' ', st.last_name) AS teacher "
        "FROM teaching_assignment ta JOIN subject_offering so ON so.offering_id = ta.offering_id "
        "JOIN subject sub ON sub.subject_id = so.subject_id JOIN staff st ON st.staff_id = ta.staff_id "
        "LEFT JOIN lab_batch lb ON lb.lab_batch_id = ta.lab_batch_id WHERE ta.assignment_id = %s", (new,))
    audit.record(me, "CREATE", "teaching_assignment", new,
                 f"{row['teacher']} teaches {row['code']}" + (f" to {row['batch']}" if row["batch"] else ""))
    return {"assignment_id": new}


class ReassignIn(BaseModel):
    staff_id: int


@router.put("/assignments/{assignment_id}")
def reassign(assignment_id: int, data: ReassignIn, me=Depends(admin_only)):
    """Give a subject to a different teacher. Existing timetable sessions
    move with it, so the new teacher is checked for clashes first."""
    clash = fetch_one(
        """
        SELECT CONCAT(sub2.code, ' ', mine.day_of_week, ' ', TIME_FORMAT(mine.start_time, '%%H:%%i')) AS what
        FROM timetable_slot mine
        JOIN timetable_slot theirs
          ON theirs.day_of_week = mine.day_of_week
         AND theirs.start_time < mine.end_time AND theirs.end_time > mine.start_time
        JOIN teaching_assignment tt ON tt.assignment_id = theirs.assignment_id
        JOIN teaching_assignment ta ON ta.assignment_id = mine.assignment_id
        JOIN subject_offering so2 ON so2.offering_id = ta.offering_id
        JOIN subject sub2 ON sub2.subject_id = so2.subject_id
        WHERE mine.assignment_id = %s AND tt.staff_id = %s AND tt.assignment_id <> %s
        LIMIT 1
        """, (assignment_id, data.staff_id, assignment_id))
    if clash:
        raise HTTPException(400, f"That teacher is already teaching during {clash['what']}.")
    execute("UPDATE teaching_assignment SET staff_id = %s WHERE assignment_id = %s",
            (data.staff_id, assignment_id))
    teacher = fetch_one("SELECT CONCAT(first_name, ' ', last_name) AS n FROM staff WHERE staff_id = %s",
                        (data.staff_id,))["n"]
    audit.record(me, "UPDATE", "teaching_assignment", assignment_id, f"Reassigned to {teacher}")
    return {"message": f"Now taught by {teacher}."}


@router.delete("/assignments/{assignment_id}")
def unassign(assignment_id: int, me=Depends(admin_only)):
    if fetch_one("SELECT 1 AS x FROM timetable_slot WHERE assignment_id = %s LIMIT 1", (assignment_id,)):
        raise HTTPException(400, "Remove its timetable sessions first.")
    execute("DELETE FROM teaching_assignment WHERE assignment_id = %s", (assignment_id,))
    audit.record(me, "DELETE", "teaching_assignment", assignment_id, "Removed a teaching assignment")
    return {"message": "Removed."}
