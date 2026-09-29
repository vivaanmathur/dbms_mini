"""
Turning the weekly timetable into dated lectures.

A timetable_slot is a rule ("DBMS, Monday 09:30, VY115"). What a teacher or a
student actually needs is a lecture: on this date, is it on, who is teaching
it, has it happened, has it moved. That is what these functions build, and
every screen that shows a week or a day goes through them, so they all agree.

The state of one dated lecture is exactly one of:

    scheduled   nothing has happened to it
    conducted   it took place and was logged
    covered     its teacher could not come; someone else agreed to take it
    pending     cancelled, and waiting for a colleague to answer
    uncovered   cancelled, and nobody is taking it
    moved       cancelled, and a make-up class was arranged instead
"""
import datetime

from app.calendar import DAY_INDEX, week_dates
from app.db import fetch_all, placeholders

SLOT_COLUMNS = """
    v.slot_id, v.day_of_week, v.start_time, v.end_time,
    v.assignment_id, v.lab_batch_id, v.lab_batch_code, v.offering_id,
    v.subject_id, v.subject_code, v.subject_name, v.subject_type,
    v.section_id, v.class_label,
    v.staff_id, v.teacher_name, v.room_id, v.room_code, v.room_type
"""


def weekly_slots(where, values=()):
    return fetch_all(
        f"SELECT {SLOT_COLUMNS} FROM vw_timetable v WHERE {where} "
        "ORDER BY FIELD(v.day_of_week,'MON','TUE','WED','THU','FRI','SAT'), "
        "v.start_time, v.lab_batch_code",
        values,
    )


def _events(slot_ids, first_date, last_date):
    """Everything that happened to these slots between two dates, keyed by
    (slot_id, date)."""
    if not slot_ids:
        return {}, {}
    ids = placeholders(slot_ids)

    cancellations = fetch_all(
        f"""
        SELECT c.cancellation_id, c.slot_id, c.lecture_date, c.reason, c.status,
               CONCAT(req.first_name, ' ', req.last_name) AS cancelled_by,
               cr.cover_id, cr.status AS cover_status, cr.staff_id AS cover_staff_id,
               CONCAT(cov.first_name, ' ', cov.last_name) AS cover_name,
               m.makeup_id, m.session_date AS makeup_date, m.start_time AS makeup_start,
               m.end_time AS makeup_end, mr.code AS makeup_room
        FROM cancellation c
        JOIN staff req ON req.staff_id = c.requested_by_staff_id
        LEFT JOIN cover_request cr
               ON cr.cancellation_id = c.cancellation_id
              AND cr.status IN ('PENDING', 'ACCEPTED')
        LEFT JOIN staff cov ON cov.staff_id = cr.staff_id
        LEFT JOIN makeup_session m ON m.cancellation_id = c.cancellation_id
        LEFT JOIN room mr ON mr.room_id = m.room_id
        WHERE c.slot_id IN ({ids})
          AND c.lecture_date BETWEEN %s AND %s
          AND c.status <> 'WITHDRAWN'
        """,
        tuple(slot_ids) + (first_date, last_date),
    )
    logs = fetch_all(
        f"""
        SELECT ll.log_id, ll.slot_id, ll.lecture_date, ll.hours, ll.remarks,
               ll.delivered_by_staff_id,
               CONCAT(st.first_name, ' ', st.last_name) AS delivered_by
        FROM lecture_log ll
        JOIN staff st ON st.staff_id = ll.delivered_by_staff_id
        WHERE ll.slot_id IN ({ids}) AND ll.lecture_date BETWEEN %s AND %s
        """,
        tuple(slot_ids) + (first_date, last_date),
    )
    return ({(c["slot_id"], c["lecture_date"]): c for c in cancellations},
            {(l["slot_id"], l["lecture_date"]): l for l in logs})


def describe(slot, cancellation, log):
    """Fill in the state of one dated lecture, and who is really teaching it."""
    slot["cancellation"] = cancellation
    slot["log"] = log
    slot["actual_teacher"] = slot["teacher_name"]
    slot["actual_staff_id"] = slot["staff_id"]

    if log is not None:
        slot["state"] = "conducted"
        slot["actual_teacher"] = log["delivered_by"]
        slot["actual_staff_id"] = log["delivered_by_staff_id"]
        slot["note"] = "Conducted by " + log["delivered_by"]
    elif cancellation is None:
        slot["state"] = "scheduled"
        slot["note"] = None
    elif cancellation["makeup_id"]:
        slot["state"] = "moved"
        slot["actual_teacher"] = None
        slot["note"] = (f"Moved to {cancellation['makeup_date']} "
                        f"{cancellation['makeup_start']} in {cancellation['makeup_room']}")
    elif cancellation["cover_status"] == "ACCEPTED":
        slot["state"] = "covered"
        slot["actual_teacher"] = cancellation["cover_name"]
        slot["actual_staff_id"] = cancellation["cover_staff_id"]
        slot["note"] = cancellation["cover_name"] + " is taking this"
    elif cancellation["cover_status"] == "PENDING":
        slot["state"] = "pending"
        slot["actual_teacher"] = None
        slot["note"] = "Cancelled · waiting for " + cancellation["cover_name"]
    else:
        slot["state"] = "uncovered"
        slot["actual_teacher"] = None
        slot["note"] = "Cancelled · nobody is taking it"
    return slot


def dated_week(slots, week_start):
    """Give every weekly slot the real date it falls on this week, and its state."""
    dates = week_dates(week_start)
    first, last = dates["MON"], dates["SAT"]
    cancellations, logs = _events([s["slot_id"] for s in slots], first, last)
    out = []
    for slot in slots:
        on = dates[slot["day_of_week"]]
        dated = dict(slot, date=on, kind="regular")
        out.append(describe(dated, cancellations.get((slot["slot_id"], on)),
                            logs.get((slot["slot_id"], on))))
    return out


def dated_day(slots, day):
    """The lectures of these slots that fall on one date."""
    weekday = day.weekday()
    if weekday > 5:
        return []
    todays = [s for s in slots if DAY_INDEX[s["day_of_week"]] == weekday]
    on = day.isoformat()
    cancellations, logs = _events([s["slot_id"] for s in todays], on, on)
    return [describe(dict(s, date=on, kind="regular"),
                     cancellations.get((s["slot_id"], on)), logs.get((s["slot_id"], on)))
            for s in todays]


def makeups_between(where, values, first_date, last_date):
    """Make-up classes held between two dates, shaped like lectures so they
    sit in the same grid."""
    rows = fetch_all(
        f"""
        SELECT m.makeup_id, m.session_date AS date, m.start_time, m.end_time, m.status,
               v.slot_id, v.assignment_id, v.lab_batch_id, v.lab_batch_code,
               v.subject_id, v.subject_code, v.subject_name, v.subject_type,
               v.section_id, v.class_label, m.staff_id,
               CONCAT(st.first_name, ' ', st.last_name) AS teacher_name,
               r.room_id, r.code AS room_code, r.room_type,
               c.lecture_date AS replaces_date
        FROM makeup_session m
        JOIN cancellation c ON c.cancellation_id = m.cancellation_id
        JOIN vw_timetable v ON v.slot_id = c.slot_id
        JOIN staff st ON st.staff_id = m.staff_id
        JOIN room r ON r.room_id = m.room_id
        WHERE m.status <> 'CANCELLED'
          AND m.session_date BETWEEN %s AND %s
          AND ({where})
        """,
        (first_date, last_date) + tuple(values),
    )
    for row in rows:
        day = datetime.date.fromisoformat(row["date"])
        row["day_of_week"] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][day.weekday()]
        row["kind"] = "makeup"
        row["state"] = "makeup"
        row["actual_teacher"] = row["teacher_name"]
        row["actual_staff_id"] = row["staff_id"]
        row["note"] = f"Make-up for the class missed on {row['replaces_date']}"
        row["cancellation"] = None
        row["log"] = None
    return rows
