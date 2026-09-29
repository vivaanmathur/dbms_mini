"""
Oversight: is every class going to finish its syllabus, what needs arranging,
how are hours and rooms spread, and — when a lecture is lost — where can it
be made up.

None of this is machine learning. It is arithmetic over the timetable and an
exact search, and every number can be explained in a sentence. Everything is
scoped: each person sees only the classes their roles cover.
"""
import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import audit
from app.calendar import DAYS, current_term, minutes, overlaps, term_progress
from app.db import fetch_all, fetch_one, placeholders, transaction
from app.security import require_section, signed_in, staff_only

router = APIRouter(prefix="/insight", tags=["Insight"])


def _scope(me, section_id=None):
    """The classes to report on: one, if asked for and allowed, else all the
    person can see."""
    if section_id is not None:
        require_section(me, section_id)
        return [int(section_id)]
    return sorted(me.section_ids())


# ---------------------------------------------------------------------------
# Syllabus risk
# ---------------------------------------------------------------------------
@router.get("/risk")
def risk(section_id: int | None = None, me=Depends(staff_only)):
    sections = _scope(me, section_id)
    term = current_term()
    pace = term_progress(term)
    expected = round(pace["fraction_elapsed"] * 100, 1)
    if not sections:
        return {"term": pace, "expected_percent": expected, "items": [], "unassigned": []}

    ids = placeholders(sections)
    rows = fetch_all(
        f"""
        SELECT p.assignment_id, p.section_id, fn_class_label(p.section_id) AS class_label,
               p.subject_code, p.subject_type, sub.name AS subject_name, sub.planned_hours,
               lb.code AS lab_batch_code,
               CONCAT(st.first_name, ' ', st.last_name) AS teacher_name,
               p.total_items, p.completed_items,
               fn_delivered_hours(p.assignment_id) AS delivered_hours,
               (SELECT COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(ts.end_time, ts.start_time))), 0) / 3600
                  FROM timetable_slot ts WHERE ts.assignment_id = p.assignment_id) AS weekly_hours,
               (SELECT COUNT(*) FROM cancellation c
                  JOIN timetable_slot ts ON ts.slot_id = c.slot_id
                 WHERE ts.assignment_id = p.assignment_id AND c.status = 'OPEN'
                   AND NOT EXISTS (SELECT 1 FROM cover_request cr
                                    WHERE cr.cancellation_id = c.cancellation_id
                                      AND cr.status = 'PENDING')) AS uncovered
        FROM vw_assignment_progress p
        JOIN subject sub ON sub.subject_id = p.subject_id
        JOIN staff st    ON st.staff_id = p.staff_id
        LEFT JOIN lab_batch lb ON lb.lab_batch_id = p.lab_batch_id
        WHERE p.section_id IN ({ids})
        """,
        tuple(sections),
    )

    items = []
    for r in rows:
        total, done = int(r["total_items"]), int(r["completed_items"])
        r["percent"] = round(done / total * 100, 1) if total else 0
        r["expected_percent"] = expected
        r["gap"] = round(expected - r["percent"], 1) if total else None
        reasons = []

        if float(r["weekly_hours"]) == 0:
            band = "not timetabled"
            reasons.append("There are no sessions on the timetable for this, so no teaching "
                           "can have happened. It needs scheduling, not catching up.")
        elif total == 0:
            band = "no syllabus"
            reasons.append("No syllabus has been entered for this subject, so progress cannot be measured.")
        else:
            gone = max(pace["weeks_elapsed"], 0.1)
            per_week = done / gone
            left = total - done
            r["weeks_needed"] = round(left / per_week, 1) if per_week > 0 else None
            if r["gap"] > 0:
                reasons.append(f"{r['percent']:.0f}% of the syllabus is covered, but "
                               f"{expected:.0f}% of the term has gone — {r['gap']:.0f} points behind.")
            else:
                reasons.append(f"{r['percent']:.0f}% covered against {expected:.0f}% of the term "
                               "elapsed — on or ahead of pace.")
            if r["weeks_needed"] is not None and r["weeks_needed"] > pace["weeks_left"]:
                reasons.append(f"At this pace the remaining {left} items need about "
                               f"{r['weeks_needed']} weeks; {pace['weeks_left']} weeks of term remain.")
            if r["uncovered"]:
                reasons.append(f"{r['uncovered']} cancelled lecture(s) still have nobody teaching them.")

            score = r["gap"] + r["uncovered"] * 4
            if done == 0:
                # Nothing ticked yet. The system cannot tell "not taught" from
                # "taught but not recorded" — so it says exactly that, rather
                # than painting every subject red the day it goes live.
                band = "no record"
                reasons = [f"Nothing has been marked as covered, and {expected:.0f}% of the term "
                           "has gone. Either teaching has not started, or it is not being recorded."]
            elif score >= 30:
                band = "critical"
            elif score >= 15:
                band = "at risk"
            elif score >= 5:
                band = "watch"
            else:
                band = "on track"
        r["band"] = band
        r["reasons"] = reasons
        items.append(r)

    order = {"critical": 0, "at risk": 1, "no record": 2, "watch": 3, "on track": 4,
             "not timetabled": 5, "no syllabus": 6}
    items.sort(key=lambda r: (order[r["band"]], -(r["gap"] or -999), r["class_label"]))

    # subjects offered to a class that nobody has been assigned to teach
    unassigned = fetch_all(
        f"""
        SELECT so.offering_id, so.section_id, fn_class_label(so.section_id) AS class_label,
               sub.code AS subject_code, sub.name AS subject_name
        FROM subject_offering so
        JOIN subject sub ON sub.subject_id = so.subject_id
        WHERE so.section_id IN ({ids}) AND so.term_id = %s
          AND NOT EXISTS (SELECT 1 FROM teaching_assignment ta WHERE ta.offering_id = so.offering_id)
        ORDER BY class_label, sub.code
        """,
        tuple(sections) + (term["term_id"],),
    )
    return {"term": pace, "expected_percent": expected, "items": items, "unassigned": unassigned}


# ---------------------------------------------------------------------------
# What needs arranging
# ---------------------------------------------------------------------------
@router.get("/attention")
def attention(section_id: int | None = None, me=Depends(staff_only)):
    """Cancelled lectures nobody is taking yet, in the classes I oversee."""
    sections = _scope(me, section_id)
    if not sections:
        return []
    rows = fetch_all(
        f"""
        SELECT c.cancellation_id, c.lecture_date, c.reason, c.status,
               CONCAT(req.first_name, ' ', req.last_name) AS requested_by,
               v.slot_id, v.section_id, v.class_label, v.subject_code, v.lab_batch_code,
               v.day_of_week, v.start_time, v.end_time, v.room_code,
               (SELECT CONCAT(s.first_name, ' ', s.last_name) FROM cover_request cr
                  JOIN staff s ON s.staff_id = cr.staff_id
                 WHERE cr.cancellation_id = c.cancellation_id AND cr.status = 'PENDING') AS waiting_on
        FROM cancellation c
        JOIN vw_timetable v ON v.slot_id = c.slot_id
        JOIN staff req ON req.staff_id = c.requested_by_staff_id
        WHERE c.status = 'OPEN' AND v.section_id IN ({placeholders(sections)})
        ORDER BY c.lecture_date, v.start_time
        """,
        tuple(sections),
    )
    for r in rows:
        r["state"] = "pending" if r["waiting_on"] else "uncovered"
        r["can_plan"] = me.oversees_section(r["section_id"])
    return rows


# ---------------------------------------------------------------------------
# Recovery planning
# ---------------------------------------------------------------------------
def _windows(length_minutes):
    """Runs of back-to-back periods adding up to exactly this length. A two
    hour lab fits two consecutive periods, never across a break."""
    periods = fetch_all("SELECT start_time, end_time FROM period ORDER BY sort_order")
    windows = []
    for i in range(len(periods)):
        span = 0
        for j in range(i, len(periods)):
            if j > i and periods[j]["start_time"] != periods[j - 1]["end_time"]:
                break
            span += minutes(periods[j]["end_time"]) - minutes(periods[j]["start_time"])
            if span == length_minutes:
                windows.append((periods[i]["start_time"], periods[j]["end_time"]))
                break
            if span > length_minutes:
                break
    return windows


def _lost_lecture(cancellation_id):
    lost = fetch_one(
        """
        SELECT c.cancellation_id, c.lecture_date, c.status, v.*
        FROM cancellation c JOIN vw_timetable v ON v.slot_id = c.slot_id
        WHERE c.cancellation_id = %s
        """,
        (cancellation_id,),
    )
    if lost is None:
        raise HTTPException(404, "Not found.")
    return lost


def _may_plan(me, lost):
    if lost["staff_id"] != me.staff_id and not me.oversees_section(lost["section_id"]):
        raise HTTPException(403, "Only the lecture's teacher or someone overseeing the class can arrange this.")


def _search(lost, days):
    """
    Every slot in the coming days where a make-up could go, best first.

    Hard rules decide whether a slot is offered at all:
      the students are free (the class, or this batch, on that very date)
      the teacher is free (their own week, cover they promised, other make-ups)
      a room of the right kind has space
    Soft rules only move the score: sooner is better, the usual room is
    better, late in the day and Saturday are worse.
    """
    term = current_term()
    length = minutes(lost["end_time"]) - minutes(lost["start_time"])
    want_lab = lost["room_type"] == "LAB"
    missed = datetime.date.fromisoformat(lost["lecture_date"])
    start_from = max(missed, datetime.date.today())
    last_day = min(start_from + datetime.timedelta(days=days), term["end"])
    window = (start_from.isoformat(), last_day.isoformat())

    week = fetch_all(
        "SELECT v.slot_id, v.day_of_week, v.start_time, v.end_time, v.section_id, "
        "v.lab_batch_id, v.staff_id, v.room_id FROM vw_timetable v")
    rooms = fetch_all("SELECT room_id, code, room_type, concurrent_capacity FROM room ORDER BY code")
    # make-ups already booked on particular dates occupy people and rooms too
    dated = fetch_all(
        """
        SELECT m.session_date AS date, m.start_time, m.end_time, m.room_id, m.staff_id,
               v.section_id, v.lab_batch_id
        FROM makeup_session m
        JOIN cancellation c ON c.cancellation_id = m.cancellation_id
        JOIN vw_timetable v ON v.slot_id = c.slot_id
        WHERE m.status = 'PLANNED' AND m.session_date BETWEEN %s AND %s
        """, window)
    covers = fetch_all(
        """
        SELECT c.lecture_date AS date, ts.start_time, ts.end_time
        FROM cover_request cr
        JOIN cancellation c ON c.cancellation_id = cr.cancellation_id
        JOIN timetable_slot ts ON ts.slot_id = c.slot_id
        WHERE cr.staff_id = %s AND cr.status IN ('PENDING','ACCEPTED')
          AND c.lecture_date BETWEEN %s AND %s
        """, (lost["staff_id"],) + window)
    # a lecture cancelled on some date frees its students, teacher and room then
    freed = {(r["slot_id"], r["lecture_date"]) for r in fetch_all(
        "SELECT slot_id, lecture_date FROM cancellation WHERE status <> 'WITHDRAWN' "
        "AND lecture_date BETWEEN %s AND %s", window)}

    def students_clash(section, batch):
        if section != lost["section_id"]:
            return False
        if lost["lab_batch_id"] is None or batch is None:
            return True
        return batch == lost["lab_batch_id"]

    options = []
    windows = _windows(length)
    for offset in range(1, (last_day - start_from).days + 1):
        day = start_from + datetime.timedelta(days=offset)
        if day.weekday() > 5:
            continue
        name, iso = DAYS[day.weekday()], day.isoformat()
        todays = [w for w in week if w["day_of_week"] == name and (w["slot_id"], iso) not in freed]
        todays_dated = [d for d in dated if d["date"] == iso]

        for start, end in windows:
            busy = [x for x in todays + todays_dated
                    if overlaps(start, end, x["start_time"], x["end_time"])]
            if any(students_clash(x["section_id"], x["lab_batch_id"]) for x in busy):
                continue
            if any(x["staff_id"] == lost["staff_id"] for x in busy):
                continue
            if any(c["date"] == iso and overlaps(start, end, c["start_time"], c["end_time"])
                   for c in covers):
                continue

            free_rooms = [r for r in rooms
                          if (r["room_type"] == "LAB") == want_lab
                          and sum(1 for x in busy if x["room_id"] == r["room_id"]) < r["concurrent_capacity"]]
            if not free_rooms:
                continue
            usual = [r for r in free_rooms if r["room_id"] == lost["room_id"]]
            room = usual[0] if usual else free_rooms[0]

            since = (day - missed).days
            score = 100 - since * 3
            notes = [f"{since} day{'s' if since != 1 else ''} after the missed class"]
            if name == lost["day_of_week"] and start == lost["start_time"]:
                score += 12
                notes.append("same weekday and hour as usual")
            if room["room_id"] == lost["room_id"]:
                score += 6
                notes.append(f"their usual room ({room['code']})")
            else:
                notes.append(f"room {room['code']}")
            if minutes(start) >= minutes("16:45"):
                score -= 14
                notes.append("late in the day")
            if name == "SAT":
                score -= 18
                notes.append("Saturday")

            options.append({"date": iso, "day_of_week": name, "start_time": start,
                            "end_time": end, "room_id": room["room_id"],
                            "room_code": room["code"], "score": score, "notes": notes})

    options.sort(key=lambda o: (-o["score"], o["date"], o["start_time"]))
    return options, last_day


@router.get("/recovery/{cancellation_id}")
def recovery_options(cancellation_id: int, days: int = 14, me=Depends(staff_only)):
    lost = _lost_lecture(cancellation_id)
    _may_plan(me, lost)
    if lost["status"] != "OPEN":
        raise HTTPException(400, "This lecture is already covered or moved.")
    options, until = _search(lost, days)
    return {"lecture": lost, "searched_until": until.isoformat(),
            "found": len(options), "options": options[:6]}


class MakeUp(BaseModel):
    date: str
    start_time: str
    end_time: str
    room_id: int


@router.post("/recovery/{cancellation_id}")
def book_makeup(cancellation_id: int, data: MakeUp, me=Depends(staff_only)):
    lost = _lost_lecture(cancellation_id)
    _may_plan(me, lost)
    if lost["status"] != "OPEN":
        raise HTTPException(400, "This lecture is already covered or moved.")

    # Run the search again, in full, and only accept a slot it still offers:
    # something may have been booked into it since the options were shown.
    options, _ = _search(lost, 30)
    wanted = (data.date, data.start_time[:5], data.end_time[:5], data.room_id)
    if not any((o["date"], o["start_time"], o["end_time"], o["room_id"]) == wanted for o in options):
        raise HTTPException(409, "That slot is no longer free. Please choose again.")

    with transaction() as tx:
        makeup_id = tx.execute(
            "INSERT INTO makeup_session (cancellation_id, session_date, start_time, end_time, room_id, staff_id) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (cancellation_id, data.date, data.start_time, data.end_time, data.room_id, lost["staff_id"]))
        # trg_makeup_after_insert marks the cancellation RESCHEDULED; nobody
        # needs to answer a cover request for a lecture that has moved
        tx.execute("UPDATE cover_request SET status = 'WITHDRAWN', responded_at = NOW() "
                   "WHERE cancellation_id = %s AND status = 'PENDING'", (cancellation_id,))
        audit.record(me, "MAKEUP", "makeup_session", makeup_id,
                     f"{lost['subject_code']} {lost['class_label']}: {lost['lecture_date']} moved to "
                     f"{data.date} {data.start_time}", tx)
    return {"message": f"Make-up booked for {data.date} at {data.start_time}."}


@router.post("/makeup/{makeup_id}/delivered")
def makeup_delivered(makeup_id: int, me=Depends(staff_only)):
    row = fetch_one("SELECT staff_id, status, session_date FROM makeup_session WHERE makeup_id = %s",
                    (makeup_id,))
    if row is None or row["staff_id"] != me.staff_id:
        raise HTTPException(404, "Not found.")
    if row["status"] != "PLANNED":
        raise HTTPException(400, "This make-up is already recorded.")
    if datetime.date.fromisoformat(row["session_date"]) > datetime.date.today():
        raise HTTPException(400, "It has not happened yet.")
    with transaction() as tx:
        tx.execute("UPDATE makeup_session SET status = 'DELIVERED' WHERE makeup_id = %s", (makeup_id,))
        audit.record(me, "CONDUCTED", "makeup_session", makeup_id, "Make-up class held", tx)
    return {"message": "Make-up recorded as held."}


# ---------------------------------------------------------------------------
# Allocation
# ---------------------------------------------------------------------------
@router.get("/load")
def load(section_id: int | None = None, me=Depends(staff_only)):
    """Teaching hours against each teacher's contract, and how busy each
    room is, for the staff and rooms serving the classes in scope."""
    sections = _scope(me, section_id)
    if not sections:
        return {"staff": [], "rooms": [], "findings": []}
    ids = placeholders(sections)

    staff = fetch_all(
        f"""
        SELECT l.staff_id, l.name, l.max_weekly_hours, l.weekly_hours, l.weekly_sessions,
               (SELECT COUNT(DISTINCT so.subject_id) FROM teaching_assignment ta
                  JOIN subject_offering so ON so.offering_id = ta.offering_id
                 WHERE ta.staff_id = l.staff_id) AS subjects
        FROM vw_staff_load l
        WHERE l.staff_id IN (SELECT ta.staff_id FROM teaching_assignment ta
                               JOIN subject_offering so ON so.offering_id = ta.offering_id
                              WHERE so.section_id IN ({ids}))
        ORDER BY l.weekly_hours DESC, l.name
        """,
        tuple(sections),
    )
    for s in staff:
        s["weekly_hours"] = round(float(s["weekly_hours"]), 1)
        s["headroom"] = round(float(s["max_weekly_hours"]) - s["weekly_hours"], 1)
        s["load_percent"] = round(s["weekly_hours"] / float(s["max_weekly_hours"]) * 100, 1)

    period_count = fetch_one("SELECT COUNT(*) AS n FROM period")["n"] or 1
    capacity = period_count * 6
    rooms = fetch_all(
        """
        SELECT r.room_id, r.code, r.room_type, r.capacity, r.concurrent_capacity,
               COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(ts.end_time, ts.start_time))) / 3600, 0) AS booked_hours,
               COUNT(ts.slot_id) AS sessions
        FROM room r LEFT JOIN timetable_slot ts ON ts.room_id = r.room_id
        GROUP BY r.room_id, r.code, r.room_type, r.capacity, r.concurrent_capacity
        ORDER BY booked_hours DESC, r.code
        """
    )
    hours_per_week = period_count * 6   # one hour per period, six days
    for r in rooms:
        r["booked_hours"] = round(float(r["booked_hours"]), 1)
        r["utilisation"] = round(r["booked_hours"] / (hours_per_week * r["concurrent_capacity"]) * 100, 1)

    findings = []
    for s in staff:
        if s["headroom"] < 0:
            findings.append({"severity": "high", "title": f"{s['name']} is over their weekly limit",
                             "detail": f"{s['weekly_hours']} hours against {s['max_weekly_hours']:g}."})
    if len(staff) >= 2:
        spread = round(staff[0]["weekly_hours"] - staff[-1]["weekly_hours"], 1)
        if spread >= 6:
            findings.append({"severity": "medium", "title": "Teaching hours are unevenly spread",
                             "detail": f"{staff[0]['name']} has {staff[0]['weekly_hours']} hours a week, "
                                       f"{staff[-1]['name']} has {staff[-1]['weekly_hours']} — "
                                       f"{spread} hours apart."})
    idle = [r["code"] for r in rooms if r["sessions"] == 0]
    if idle:
        findings.append({"severity": "low", "title": f"{len(idle)} room(s) are never booked",
                         "detail": ", ".join(idle) + " — available for make-up classes."})
    return {"staff": staff, "rooms": rooms, "findings": findings, "week_hours": hours_per_week}
