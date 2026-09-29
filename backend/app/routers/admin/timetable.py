"""
Administration: building the weekly timetable, and reading the audit trail.

Every session is written through sp_save_slot, so the database refuses
anything that would put a teacher, a room or a group of students in two
places at once — whichever screen or script the change came from.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import audit
from app.calendar import current_term
from app.db import call, execute, fetch_all, fetch_one
from app.security import admin_only

router = APIRouter()


@router.get("/timetable/{section_id}")
def editor(section_id: int, me=Depends(admin_only)):
    """Everything the editor needs for one class: its sessions, what can be
    scheduled, and the rooms and periods to choose from."""
    term = current_term()
    return {
        "class": fetch_one("SELECT * FROM vw_class WHERE section_id = %s", (section_id,)),
        "sessions": fetch_all(
            "SELECT v.*, (SELECT GROUP_CONCAT(sb.lab_batch_id) FROM slot_batch sb "
            "             WHERE sb.slot_id = v.slot_id) AS batch_ids "
            "FROM vw_timetable v WHERE v.section_id = %s AND v.term_id = %s "
            "ORDER BY FIELD(v.day_of_week,'MON','TUE','WED','THU','FRI','SAT'), v.start_time, v.lab_batch_code",
            (section_id, term["term_id"])),
        "batches": fetch_all("SELECT lab_batch_id, code FROM lab_batch WHERE section_id = %s ORDER BY code",
                             (section_id,)),
        "assignments": fetch_all(
            """
            SELECT ta.assignment_id, sub.code AS subject_code, sub.name AS subject_name, sub.subject_type,
                   lb.code AS lab_batch_code, CONCAT(st.first_name, ' ', st.last_name) AS teacher,
                   (SELECT COUNT(*) FROM timetable_slot ts WHERE ts.assignment_id = ta.assignment_id) AS sessions
            FROM teaching_assignment ta
            JOIN subject_offering so ON so.offering_id = ta.offering_id
            JOIN subject sub ON sub.subject_id = so.subject_id
            JOIN staff st ON st.staff_id = ta.staff_id
            LEFT JOIN lab_batch lb ON lb.lab_batch_id = ta.lab_batch_id
            WHERE so.section_id = %s AND so.term_id = %s
            ORDER BY sub.code, lb.code
            """, (section_id, term["term_id"])),
        "rooms": fetch_all("SELECT room_id, code, room_type, capacity FROM room ORDER BY room_type, code"),
        "periods": fetch_all("SELECT period_id, label, start_time, end_time FROM period ORDER BY sort_order"),
    }


class SlotIn(BaseModel):
    assignment_id: int
    room_id: int
    day_of_week: str
    start_time: str
    end_time: str
    session_type: str | None = None     # LECTURE, TUTORIAL, PRACTICAL or EVALUATION
    batch_ids: list[int] = []           # empty: the assignment's own audience


def _save(slot_id, data):
    kind = data.session_type
    if not kind:
        row = fetch_one("SELECT sub.subject_type FROM teaching_assignment ta "
                        "JOIN subject_offering so ON so.offering_id = ta.offering_id "
                        "JOIN subject sub ON sub.subject_id = so.subject_id WHERE ta.assignment_id = %s",
                        (data.assignment_id,))
        kind = "PRACTICAL" if row and row["subject_type"] == "PRACTICAL" else "LECTURE"
    batches = ",".join(str(b) for b in sorted(set(data.batch_ids)))
    return call("sp_save_slot", (slot_id, data.assignment_id, data.room_id, data.day_of_week.upper(),
                                 data.start_time, data.end_time, kind.upper(), batches))[0]["slot_id"]


def _describe(slot_id):
    row = fetch_one("SELECT subject_code, lab_batch_code, session_type, day_of_week, start_time, room_code "
                    "FROM vw_timetable WHERE slot_id = %s", (slot_id,))
    if row is None:
        return "a session"
    batch = f" {row['lab_batch_code']}" if row["lab_batch_code"] else ""
    kind = f" {row['session_type'].lower()}" if row["session_type"] in ("TUTORIAL", "EVALUATION") else ""
    return f"{row['subject_code']}{kind}{batch} {row['day_of_week']} {row['start_time']} in {row['room_code']}"


@router.post("/timetable")
def add_session(data: SlotIn, me=Depends(admin_only)):
    slot_id = _save(None, data)
    audit.record(me, "CREATE", "timetable_slot", slot_id, f"Scheduled {_describe(slot_id)}")
    return {"slot_id": slot_id}


@router.put("/timetable/{slot_id}")
def move_session(slot_id: int, data: SlotIn, me=Depends(admin_only)):
    before = _describe(slot_id)
    _save(slot_id, data)
    audit.record(me, "UPDATE", "timetable_slot", slot_id, f"Moved {before} to {_describe(slot_id)}")
    return {"slot_id": slot_id}


@router.delete("/timetable/{slot_id}")
def remove_session(slot_id: int, me=Depends(admin_only)):
    history = fetch_one(
        "SELECT (SELECT COUNT(*) FROM lecture_log WHERE slot_id = %s) + "
        "(SELECT COUNT(*) FROM cancellation WHERE slot_id = %s) AS n", (slot_id, slot_id))["n"]
    if history:
        raise HTTPException(
            400, "Lectures have already been held or cancelled in this session, and that history "
                 "has to stay. Move it to a new time instead of removing it.")
    what = _describe(slot_id)
    execute("DELETE FROM timetable_slot WHERE slot_id = %s", (slot_id,))
    audit.record(me, "DELETE", "timetable_slot", slot_id, f"Removed {what}")
    return {"message": f"Removed {what}."}


@router.get("/audit")
def audit_trail(limit: int = 100, before: int | None = None, me=Depends(admin_only)):
    where, values = ("WHERE a.audit_id < %s", (before,)) if before else ("", ())
    return fetch_all(
        f"""
        SELECT a.audit_id, a.action, a.entity, a.entity_id, a.summary, a.created_at,
               COALESCE(CONCAT(st.first_name, ' ', st.last_name),
                        CONCAT(sd.first_name, ' ', sd.last_name), 'System') AS who
        FROM audit_log a
        LEFT JOIN app_user u ON u.user_id = a.user_id
        LEFT JOIN staff st ON st.staff_id = u.staff_id
        LEFT JOIN student sd ON sd.student_id = u.student_id
        {where}
        ORDER BY a.audit_id DESC LIMIT %s
        """, values + (min(limit, 500),))
