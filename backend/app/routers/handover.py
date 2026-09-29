"""
Handing a lecture over, covering for a colleague, and recording what was
taught.

The behaviour is the prototype's, kept as it was: a teacher can pick who
takes their lecture from a list that puts teachers of the same subject first,
or leave it to the system, which asks the free teacher who has taught the
fewest lectures. A teacher who declines is not asked again for that lecture
— the full history of who was asked now lives in cover_request, where the
prototype kept it as text in a remarks column.
"""
import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import audit
from app.calendar import check_lecture_date, current_term, minutes, parse_date


def _now_minutes():
    now = datetime.datetime.now()
    return now.hour * 60 + now.minute
from app.db import fetch_all, fetch_one, transaction
from app.security import signed_in, teaching_only

router = APIRouter(tags=["Handing over"])


def _slot(slot_id):
    slot = fetch_one(
        """
        SELECT v.*, so.section_id AS offering_section
        FROM vw_timetable v
        JOIN subject_offering so ON so.offering_id = v.offering_id
        WHERE v.slot_id = %s
        """,
        (slot_id,),
    )
    if slot is None:
        raise HTTPException(404, "That lecture does not exist.")
    return slot


def candidates_for(slot, lecture_date, exclude_ids):
    """
    Everyone who could take this lecture, with the facts needed to choose.
    Teachers who do not teach the subject are shown too, after those who do:
    the choice belongs to the teacher handing over.
    """
    term = current_term()
    rows = fetch_all(
        """
        SELECT st.staff_id, CONCAT(st.first_name, ' ', st.last_name) AS name,
               st.designation, st.max_weekly_hours,

               EXISTS (SELECT 1 FROM teaching_assignment ta
                         JOIN subject_offering so ON so.offering_id = ta.offering_id
                        WHERE ta.staff_id = st.staff_id AND so.subject_id = %s) AS teaches_subject,

               EXISTS (SELECT 1 FROM teaching_assignment ta
                         JOIN subject_offering so ON so.offering_id = ta.offering_id
                        WHERE ta.staff_id = st.staff_id AND so.section_id = %s) AS knows_class,

               (SELECT COUNT(*) FROM timetable_slot ts
                  JOIN teaching_assignment ta ON ta.assignment_id = ts.assignment_id
                 WHERE ta.staff_id = st.staff_id AND ts.day_of_week = %s
                   AND ts.start_time < %s AND ts.end_time > %s) AS own_clash,

               (SELECT COUNT(*) FROM cover_request cr
                  JOIN cancellation c ON c.cancellation_id = cr.cancellation_id
                  JOIN timetable_slot ts ON ts.slot_id = c.slot_id
                 WHERE cr.staff_id = st.staff_id AND cr.status IN ('PENDING','ACCEPTED')
                   AND c.lecture_date = %s
                   AND ts.start_time < %s AND ts.end_time > %s) AS cover_clash,

               (SELECT COUNT(*) FROM makeup_session m
                 WHERE m.staff_id = st.staff_id AND m.status = 'PLANNED'
                   AND m.session_date = %s
                   AND m.start_time < %s AND m.end_time > %s) AS makeup_clash,

               (SELECT COUNT(*) FROM lecture_log ll
                 WHERE ll.delivered_by_staff_id = st.staff_id
                   AND ll.lecture_date BETWEEN %s AND %s) AS lectures_taken,

               COALESCE((SELECT weekly_hours FROM vw_staff_load l
                          WHERE l.staff_id = st.staff_id), 0) AS weekly_hours
        FROM staff st
        JOIN role_assignment ra ON ra.staff_id = st.staff_id AND ra.role = 'FACULTY'
        WHERE st.is_active = TRUE
        """,
        (slot["subject_id"], slot["section_id"],
         slot["day_of_week"], slot["end_time"], slot["start_time"],
         lecture_date, slot["end_time"], slot["start_time"],
         lecture_date, slot["end_time"], slot["start_time"],
         term["start_date"], term["end_date"]),
    )

    out = []
    for r in rows:
        if r["staff_id"] in exclude_ids:
            continue
        r["teaches_subject"] = bool(r["teaches_subject"])
        r["knows_class"] = bool(r["knows_class"])
        clashes = r["own_clash"] + r["cover_clash"] + r["makeup_clash"]
        r["is_free"] = clashes == 0
        if r["own_clash"]:
            r["reason"] = "Has their own class at this time"
        elif r["cover_clash"]:
            r["reason"] = "Already covering another class at this time"
        elif r["makeup_clash"]:
            r["reason"] = "Running a make-up class at this time"
        elif r["teaches_subject"] and r["knows_class"]:
            r["reason"] = f"Teaches {slot['subject_code']} to this very class"
        elif r["teaches_subject"]:
            r["reason"] = f"Teaches {slot['subject_code']} to another class"
        elif r["knows_class"]:
            r["reason"] = "Free, and already teaches this class"
        else:
            r["reason"] = "Free at this time"
        out.append(r)

    # for the teacher choosing: same subject first, then free, then least loaded
    out.sort(key=lambda r: (not r["teaches_subject"], not r["is_free"],
                            r["lectures_taken"], r["name"]))
    return out


def fairest_free(slot, lecture_date, exclude_ids):
    """The system's own choice: the free teacher who has taught the fewest
    lectures this term, preferring one who knows the subject on a tie."""
    free = [c for c in candidates_for(slot, lecture_date, exclude_ids) if c["is_free"]]
    free.sort(key=lambda r: (r["lectures_taken"], not r["teaches_subject"], r["name"]))
    return free[0] if free else None


def _asked_already(cancellation_id):
    return {r["staff_id"] for r in fetch_all(
        "SELECT staff_id FROM cover_request WHERE cancellation_id = %s", (cancellation_id,))}


# ---------------------------------------------------------------------------
# Handing over
# ---------------------------------------------------------------------------
@router.get("/handover/candidates")
def candidates(slot_id: int, lecture_date: str, me=Depends(teaching_only)):
    slot = _slot(slot_id)
    if slot["staff_id"] != me.staff_id:
        raise HTTPException(403, "You can only hand over your own lectures.")
    on = parse_date(lecture_date)
    check_lecture_date(slot["day_of_week"], on, current_term())
    people = candidates_for(slot, lecture_date, {me.staff_id})
    choice = fairest_free(slot, lecture_date, {me.staff_id})
    return {"candidates": people, "suggested_staff_id": choice and choice["staff_id"]}


class Handover(BaseModel):
    slot_id: int
    lecture_date: str
    reason: str
    delegate_to_staff_id: int | None = None


@router.post("/handover")
def hand_over(data: Handover, me=Depends(teaching_only)):
    slot = _slot(data.slot_id)
    if slot["staff_id"] != me.staff_id:
        raise HTTPException(403, "You can only hand over your own lectures.")
    if not data.reason.strip():
        raise HTTPException(400, "Say briefly why you cannot take it.")
    on = parse_date(data.lecture_date)
    check_lecture_date(slot["day_of_week"], on, current_term())
    # the date alone is not enough: this afternoon's lecture has already
    # started by the evening
    if on < datetime.date.today() or (on == datetime.date.today()
                                      and minutes(slot["start_time"]) <= _now_minutes()):
        raise HTTPException(400, "That lecture has already started, so it cannot be handed over.")

    if fetch_one("SELECT 1 AS x FROM lecture_log WHERE slot_id = %s AND lecture_date = %s",
                 (data.slot_id, data.lecture_date)):
        raise HTTPException(400, "That lecture has already been marked as conducted.")

    if data.delegate_to_staff_id is not None:
        people = {c["staff_id"]: c for c in candidates_for(slot, data.lecture_date, {me.staff_id})}
        chosen = people.get(data.delegate_to_staff_id)
        if chosen is None:
            raise HTTPException(404, "That teacher could not be found.")
        if not chosen["is_free"]:
            raise HTTPException(400, f"{chosen['name']}: {chosen['reason'].lower()}.")
        chosen_by = "TEACHER"
    else:
        chosen = fairest_free(slot, data.lecture_date, {me.staff_id})
        chosen_by = "SYSTEM"

    with transaction() as tx:
        cancellation_id = tx.execute(
            "INSERT INTO cancellation (slot_id, lecture_date, reason, requested_by_staff_id) "
            "VALUES (%s, %s, %s, %s)",
            (data.slot_id, data.lecture_date, data.reason.strip(), me.staff_id),
        )
        if chosen is not None:
            tx.execute(
                "INSERT INTO cover_request (cancellation_id, staff_id, chosen_by) VALUES (%s, %s, %s)",
                (cancellation_id, chosen["staff_id"], chosen_by),
            )
        audit.record(me, "HANDOVER", "cancellation", cancellation_id,
                     f"{slot['subject_code']} {slot['class_label']} on {data.lecture_date}", tx)

    if chosen is None:
        return {"message": "Lecture cancelled. Nobody is free at that time — "
                           "a coordinator can arrange a make-up class."}
    return {"message": f"Sent to {chosen['name']} to accept."}


@router.post("/handover/{cancellation_id}/withdraw")
def withdraw(cancellation_id: int, me=Depends(teaching_only)):
    """Changed your mind — you can take it after all."""
    row = fetch_one("SELECT requested_by_staff_id, status FROM cancellation WHERE cancellation_id = %s",
                    (cancellation_id,))
    if row is None or row["requested_by_staff_id"] != me.staff_id:
        raise HTTPException(404, "Not found.")
    if row["status"] in ("RESCHEDULED", "WITHDRAWN"):
        raise HTTPException(400, "This can no longer be withdrawn.")
    with transaction() as tx:
        tx.execute("UPDATE cover_request SET status = 'WITHDRAWN', responded_at = NOW() "
                   "WHERE cancellation_id = %s AND status IN ('PENDING','ACCEPTED')", (cancellation_id,))
        tx.execute("UPDATE cancellation SET status = 'WITHDRAWN' WHERE cancellation_id = %s",
                   (cancellation_id,))
        audit.record(me, "WITHDRAW", "cancellation", cancellation_id, "Took the lecture back", tx)
    return {"message": "Withdrawn. The lecture is back on your timetable."}


# ---------------------------------------------------------------------------
# Covering
# ---------------------------------------------------------------------------
COVER_QUERY = """
    SELECT cr.cover_id, cr.status, cr.chosen_by, cr.requested_at, cr.responded_at,
           c.cancellation_id, c.lecture_date, c.reason, c.status AS cancellation_status,
           CONCAT(req.first_name, ' ', req.last_name) AS requested_by,
           CONCAT(cov.first_name, ' ', cov.last_name) AS cover_name,
           v.slot_id, v.day_of_week, v.start_time, v.end_time, v.subject_code,
           v.subject_name, v.class_label, v.lab_batch_code, v.room_code
    FROM cover_request cr
    JOIN cancellation c ON c.cancellation_id = cr.cancellation_id
    JOIN staff req ON req.staff_id = c.requested_by_staff_id
    JOIN staff cov ON cov.staff_id = cr.staff_id
    JOIN vw_timetable v ON v.slot_id = c.slot_id
    WHERE {where}
    ORDER BY c.lecture_date, v.start_time
"""


@router.get("/cover/incoming")
def incoming(me=Depends(teaching_only)):
    return fetch_all(COVER_QUERY.format(where="cr.staff_id = %s AND cr.status = 'PENDING'"),
                     (me.staff_id,))


@router.get("/cover/accepted")
def accepted(me=Depends(teaching_only)):
    rows = fetch_all(COVER_QUERY.format(where="cr.staff_id = %s AND cr.status = 'ACCEPTED'"),
                     (me.staff_id,))
    for row in rows:
        row["conducted"] = bool(fetch_one(
            "SELECT 1 AS x FROM lecture_log WHERE slot_id = %s AND lecture_date = %s",
            (row["slot_id"], row["lecture_date"])))
    return rows


@router.get("/handover/mine")
def my_handovers(me=Depends(teaching_only)):
    """The lectures I handed over, and what became of each."""
    return fetch_all(
        """
        SELECT c.cancellation_id, c.lecture_date, c.reason, c.status,
               v.slot_id, v.day_of_week, v.start_time, v.end_time, v.subject_code,
               v.class_label, v.lab_batch_code, v.room_code,
               (SELECT CONCAT(s.first_name, ' ', s.last_name) FROM cover_request cr
                  JOIN staff s ON s.staff_id = cr.staff_id
                 WHERE cr.cancellation_id = c.cancellation_id
                   AND cr.status IN ('PENDING','ACCEPTED')) AS cover_name,
               (SELECT cr.status FROM cover_request cr
                 WHERE cr.cancellation_id = c.cancellation_id
                   AND cr.status IN ('PENDING','ACCEPTED')) AS cover_status,
               (SELECT COUNT(*) FROM cover_request cr
                 WHERE cr.cancellation_id = c.cancellation_id AND cr.status = 'DECLINED') AS declined,
               m.session_date AS makeup_date, m.start_time AS makeup_start
        FROM cancellation c
        JOIN vw_timetable v ON v.slot_id = c.slot_id
        LEFT JOIN makeup_session m ON m.cancellation_id = c.cancellation_id
        WHERE c.requested_by_staff_id = %s
        ORDER BY c.lecture_date DESC
        """,
        (me.staff_id,),
    )


def _my_pending(cover_id, me):
    row = fetch_one(
        "SELECT cr.cover_id, cr.cancellation_id, cr.staff_id, cr.status, c.slot_id, c.lecture_date "
        "FROM cover_request cr JOIN cancellation c ON c.cancellation_id = cr.cancellation_id "
        "WHERE cr.cover_id = %s", (cover_id,))
    if row is None or row["staff_id"] != me.staff_id:
        raise HTTPException(404, "That request was not sent to you.")
    if row["status"] != "PENDING":
        raise HTTPException(400, "That request has already been answered.")
    return row


@router.post("/cover/{cover_id}/accept")
def accept(cover_id: int, me=Depends(teaching_only)):
    request = _my_pending(cover_id, me)
    slot = _slot(request["slot_id"])
    # still free? something may have been booked since the request was sent
    mine = {c["staff_id"]: c for c in candidates_for(slot, request["lecture_date"], set())}
    me_now = mine.get(me.staff_id)
    if me_now and me_now["cover_clash"] == 0 and (me_now["own_clash"] or me_now["makeup_clash"]):
        raise HTTPException(400, "You are no longer free at that time.")

    with transaction() as tx:
        # trg_cover_after_update marks the cancellation COVERED in the same
        # transaction, so the two can never disagree
        tx.execute("UPDATE cover_request SET status = 'ACCEPTED', responded_at = NOW() WHERE cover_id = %s",
                   (cover_id,))
        audit.record(me, "ACCEPT", "cover_request", cover_id, "Agreed to cover a lecture", tx)
    return {"message": "You are taking this lecture."}


@router.post("/cover/{cover_id}/decline")
def decline(cover_id: int, me=Depends(teaching_only)):
    request = _my_pending(cover_id, me)
    slot = _slot(request["slot_id"])
    already = _asked_already(request["cancellation_id"])
    requester = fetch_one("SELECT requested_by_staff_id FROM cancellation WHERE cancellation_id = %s",
                          (request["cancellation_id"],))["requested_by_staff_id"]
    nxt = fairest_free(slot, request["lecture_date"], already | {requester})

    with transaction() as tx:
        tx.execute("UPDATE cover_request SET status = 'DECLINED', responded_at = NOW() WHERE cover_id = %s",
                   (cover_id,))
        if nxt is not None:
            tx.execute("INSERT INTO cover_request (cancellation_id, staff_id, chosen_by) "
                       "VALUES (%s, %s, 'SYSTEM')", (request["cancellation_id"], nxt["staff_id"]))
        audit.record(me, "DECLINE", "cover_request", cover_id, "Declined to cover a lecture", tx)

    if nxt is None:
        return {"message": "Declined. Nobody else is free, so a coordinator will need to arrange a make-up."}
    return {"message": f"Declined. It has gone to {nxt['name']}."}


# ---------------------------------------------------------------------------
# Recording what was taught — the lecture history log
# ---------------------------------------------------------------------------
class Conducted(BaseModel):
    slot_id: int
    lecture_date: str
    remarks: str = ""
    subtopic_ids: list[int] = []
    experiment_ids: list[int] = []


def _who_teaches(slot, lecture_date):
    """Who is entitled to log this dated lecture: the regular teacher, or the
    colleague who agreed to cover it."""
    cancelled = fetch_one(
        """
        SELECT c.cancellation_id, c.status,
               (SELECT cr.staff_id FROM cover_request cr
                 WHERE cr.cancellation_id = c.cancellation_id AND cr.status = 'ACCEPTED') AS cover_staff
        FROM cancellation c
        WHERE c.slot_id = %s AND c.lecture_date = %s AND c.status <> 'WITHDRAWN'
        """,
        (slot["slot_id"], lecture_date),
    )
    if cancelled is None:
        return slot["staff_id"]
    if cancelled["status"] == "COVERED":
        return cancelled["cover_staff"]
    return None   # cancelled with no cover, or moved: nothing to log on this date


@router.post("/lectures/conducted")
def conducted(data: Conducted, me=Depends(teaching_only)):
    slot = _slot(data.slot_id)
    on = parse_date(data.lecture_date)
    check_lecture_date(slot["day_of_week"], on, current_term())
    if on > datetime.date.today() or (on == datetime.date.today()
                                      and minutes(slot["end_time"]) > _now_minutes()):
        raise HTTPException(400, "A lecture can only be recorded once it has finished.")

    teacher = _who_teaches(slot, data.lecture_date)
    if teacher is None:
        raise HTTPException(400, "This lecture was cancelled with nobody taking it, so there is nothing to log.")
    if teacher != me.staff_id:
        raise HTTPException(403, "Only the teacher taking this lecture can mark it.")

    hours = (minutes(slot["end_time"]) - minutes(slot["start_time"])) / 60
    with transaction() as tx:
        log_id = tx.execute(
            "INSERT INTO lecture_log (slot_id, lecture_date, delivered_by_staff_id, hours, remarks) "
            "VALUES (%s, %s, %s, %s, %s)",
            (data.slot_id, data.lecture_date, me.staff_id, hours, data.remarks.strip() or None),
        )
        # what was covered in this lecture goes against the syllabus of the
        # teaching assignment the slot belongs to
        for subtopic_id in data.subtopic_ids:
            tx.execute(
                "INSERT IGNORE INTO syllabus_progress (assignment_id, subtopic_id, completed_on, "
                "completed_by_staff_id, log_id) VALUES (%s, %s, %s, %s, %s)",
                (slot["assignment_id"], subtopic_id, data.lecture_date, me.staff_id, log_id))
        for experiment_id in data.experiment_ids:
            tx.execute(
                "INSERT IGNORE INTO syllabus_progress (assignment_id, experiment_id, completed_on, "
                "completed_by_staff_id, log_id) VALUES (%s, %s, %s, %s, %s)",
                (slot["assignment_id"], experiment_id, data.lecture_date, me.staff_id, log_id))
        audit.record(me, "CONDUCTED", "lecture_log", log_id,
                     f"{slot['subject_code']} {slot['class_label']} on {data.lecture_date}", tx)

    covered = len(data.subtopic_ids) + len(data.experiment_ids)
    return {"message": f"Logged {hours:g} hour{'s' if hours != 1 else ''}"
                       + (f" and {covered} item{'s' if covered != 1 else ''} of the syllabus." if covered else ".")}


@router.get("/lectures/mine")
def my_lectures(me=Depends(teaching_only)):
    """Every lecture I have conducted this term — the lecture history."""
    term = current_term()
    return fetch_all(
        """
        SELECT ll.log_id, ll.lecture_date, ll.hours, ll.remarks,
               v.day_of_week, v.start_time, v.end_time, v.subject_code, v.subject_name,
               v.class_label, v.lab_batch_code, v.room_code, v.teacher_name AS regular_teacher,
               v.staff_id = ll.delivered_by_staff_id AS own_class,
               (SELECT GROUP_CONCAT(COALESCE(st.title, pe.title) ORDER BY p.progress_id SEPARATOR ' · ')
                  FROM syllabus_progress p
                  LEFT JOIN syllabus_subtopic st ON st.subtopic_id = p.subtopic_id
                  LEFT JOIN practical_experiment pe ON pe.experiment_id = p.experiment_id
                 WHERE p.log_id = ll.log_id) AS covered
        FROM lecture_log ll
        JOIN vw_timetable v ON v.slot_id = ll.slot_id
        WHERE ll.delivered_by_staff_id = %s AND ll.lecture_date BETWEEN %s AND %s
        ORDER BY ll.lecture_date DESC, v.start_time
        """,
        (me.staff_id, term["start_date"], term["end_date"]),
    )
