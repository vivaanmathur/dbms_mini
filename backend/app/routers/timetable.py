"""Timetables: your own week, a class's week, and a single day."""
import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.calendar import (current_term, parse_date, resolve_week, week_dates,
                          week_header)
from app.db import fetch_all, fetch_one, placeholders
from app.security import require_section, signed_in
from app.sessions import dated_day, dated_week, makeups_between, weekly_slots

router = APIRouter(tags=["Timetable"])


def _order(items):
    return sorted(items, key=lambda s: (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
                                        .index(s["day_of_week"]), s["start_time"],
                                        s.get("lab_batch_code") or ""))


@router.get("/classes")
def classes(me=Depends(signed_in)):
    """Every class this person may look at, for the class picker."""
    ids = sorted(me.section_ids())
    if not ids:
        return []
    return fetch_all(
        f"SELECT * FROM vw_class WHERE section_id IN ({placeholders(ids)}) "
        "ORDER BY program_short, year_of_study, division",
        tuple(ids),
    )


@router.get("/term")
def term(week_start: str | None = None, me=Depends(signed_in)):
    t = current_term()
    return week_header(resolve_week(week_start, t), t)


def _student_scope(me):
    row = fetch_one("SELECT section_id, lab_batch_id FROM student WHERE student_id = %s",
                    (me.student_id,))
    if row is None:
        raise HTTPException(404, "Your student record could not be found.")
    # the whole class, plus only this student's own batch in a lab hour
    where = "v.section_id = %s AND (v.lab_batch_id IS NULL OR v.lab_batch_id = %s)"
    return where, (row["section_id"], row["lab_batch_id"])


@router.get("/timetable/mine")
def my_week(week_start: str | None = None, me=Depends(signed_in)):
    """
    A teacher's week: their own lectures, plus any they agreed to cover and
    any make-up classes they are running. A student's week: their class, and
    their own lab batch.
    """
    t = current_term()
    week = resolve_week(week_start, t)
    dates = week_dates(week)
    first, last = dates["MON"], dates["SAT"]

    if me.is_student:
        where, values = _student_scope(me)
        sessions = dated_week(weekly_slots(where, values), week)
        sessions += makeups_between(where, values, first, last)
        return {"week": week_header(week, t), "sessions": _order(sessions)}

    sessions = dated_week(weekly_slots("v.staff_id = %s", (me.staff_id,)), week)

    # lectures of other teachers that this person agreed to take this week
    covers = fetch_all(
        """
        SELECT c.slot_id, c.lecture_date,
               CONCAT(req.first_name, ' ', req.last_name) AS covering_for
        FROM cover_request cr
        JOIN cancellation c ON c.cancellation_id = cr.cancellation_id
        JOIN staff req ON req.staff_id = c.requested_by_staff_id
        WHERE cr.staff_id = %s AND cr.status = 'ACCEPTED'
          AND c.lecture_date BETWEEN %s AND %s
        """,
        (me.staff_id, first, last),
    )
    if covers:
        ids = [c["slot_id"] for c in covers]
        borrowed = {s["slot_id"]: s for s in weekly_slots(
            f"v.slot_id IN ({placeholders(ids)})", tuple(ids))}
        for cover in covers:
            slot = borrowed.get(cover["slot_id"])
            if slot is None:
                continue
            dated = dated_day([slot], datetime.date.fromisoformat(cover["lecture_date"]))
            for lecture in dated:
                lecture["kind"] = "cover"
                lecture["covering_for"] = cover["covering_for"]
                sessions.append(lecture)

    sessions += makeups_between("m.staff_id = %s", (me.staff_id,), first, last)
    return {"week": week_header(week, t), "sessions": _order(sessions)}


@router.get("/timetable/class/{section_id}")
def class_week(section_id: int, week_start: str | None = None, me=Depends(signed_in)):
    """One class's week — every subject, every lab batch side by side."""
    require_section(me, section_id)
    t = current_term()
    week = resolve_week(week_start, t)
    dates = week_dates(week)
    sessions = dated_week(weekly_slots("v.section_id = %s", (section_id,)), week)
    sessions += makeups_between("v.section_id = %s", (section_id,), dates["MON"], dates["SAT"])
    label = fetch_one("SELECT label FROM vw_class WHERE section_id = %s", (section_id,))
    return {"week": week_header(week, t), "class_label": label and label["label"],
            "sessions": _order(sessions)}


@router.get("/timetable/day")
def day(section_id: int | None = None, date: str | None = None, me=Depends(signed_in)):
    """What actually happens on one date, for one class."""
    on = parse_date(date) if date else datetime.date.today()
    if me.is_student:
        where, values = _student_scope(me)
    else:
        if section_id is None:
            raise HTTPException(400, "Choose a class.")
        require_section(me, section_id)
        where, values = "v.section_id = %s", (section_id,)

    lectures = dated_day(weekly_slots(where, values), on)
    lectures += makeups_between(where, values, on.isoformat(), on.isoformat())
    return {"date": on.isoformat(), "lectures": _order(lectures)}
