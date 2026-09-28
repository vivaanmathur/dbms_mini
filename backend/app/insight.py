"""
The department-level features: risk, recovery planning, resource allocation
and the day view.

None of this is machine learning and none of it calls out to a model. It is
arithmetic over the timetable and a constraint search, both of which can
explain every number they produce — which is the point. A judge can ask "why
is this class flagged?" and the answer is a sentence, not a weight matrix.

Everything here is read-only except accept_recovery(), which writes a single
'RESCHEDULED' row into lecture_log. No new tables were needed.
"""
import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_logged_in_teacher
from app.database import run_query, run_query_one, run_update

router = APIRouter(tags=["Insight"])

# The academic calendar. A finished system would read these from a term table;
# this schema has no such table, so they live here where they can be seen and
# corrected rather than being buried in a query.
TERM_START = datetime.date(2026, 7, 20)
TERM_END = datetime.date(2026, 11, 20)

DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"]
DAY_NUMBER = {"MON": 0, "TUE": 1, "WED": 2, "THU": 3, "FRI": 4, "SAT": 5}


def minutes(clock):
    """'13:30' -> 810"""
    hour, minute = [int(part) for part in clock.split(":")]
    return hour * 60 + minute


def overlaps(start_a, end_a, start_b, end_b):
    return minutes(start_a) < minutes(end_b) and minutes(end_a) > minutes(start_b)


def term_position(today=None):
    """How far through the term we are, as a fraction and in weeks."""
    today = today or datetime.date.today()
    total_days = (TERM_END - TERM_START).days
    gone_days = (today - TERM_START).days
    gone_days = max(0, min(total_days, gone_days))
    return {
        "weeks_total": round(total_days / 7, 1),
        "weeks_elapsed": round(gone_days / 7, 1),
        "weeks_left": round((total_days - gone_days) / 7, 1),
        "fraction_elapsed": (gone_days / total_days) if total_days else 0,
        "term_start": TERM_START.isoformat(),
        "term_end": TERM_END.isoformat(),
    }


# ---------------------------------------------------------------------------
# 1. Missed-learning risk
# ---------------------------------------------------------------------------
# The question this answers is not "how many lectures were cancelled" but
# "is this class going to finish its syllabus in time". We compare how much
# of the syllabus is actually covered against how much of the term has gone.
# ---------------------------------------------------------------------------
@router.get("/risk")
def risk(me=Depends(get_logged_in_teacher)):
    where = term_position()

    rows = run_query(
        """
        SELECT v.section_course_offering_id, v.section_name, v.course_code,
               v.course_name, v.course_type,
               v.total_items, v.completed_items, v.percent_complete,
               c.total_planned_hours,
               fn_delivered_hours(v.section_course_offering_id) AS delivered_hours,

               -- lectures given away on this subject, and whether anyone took them
               (SELECT COUNT(*) FROM cancellation_request cr
                  JOIN timetable_slot ts ON ts.timetable_slot_id = cr.timetable_slot_id
                 WHERE ts.section_course_offering_id = v.section_course_offering_id
                   AND cr.request_status <> 'WITHDRAWN') AS cancelled_total,

               (SELECT COUNT(*) FROM cancellation_request cr
                  JOIN timetable_slot ts ON ts.timetable_slot_id = cr.timetable_slot_id
                  LEFT JOIN substitution_assignment sa
                       ON sa.cancellation_request_id = cr.cancellation_request_id
                      AND sa.assignment_status = 'ASSIGNED'
                 WHERE ts.section_course_offering_id = v.section_course_offering_id
                   AND cr.request_status <> 'WITHDRAWN'
                   AND sa.substitution_assignment_id IS NULL) AS uncovered
        FROM vw_syllabus_progress v
        JOIN section_course_offering sco
             ON sco.section_course_offering_id = v.section_course_offering_id
        JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
        JOIN course c ON c.course_id = pc.course_id
        ORDER BY v.section_name, v.course_code
        """
    )

    # One week of each subject, counting a lab hour once even though three
    # batches run in it in parallel. This needs its own query: a derived table
    # cannot be correlated back to the view above.
    weekly = {}
    for row in run_query(
        """
        SELECT DISTINCT section_course_offering_id, day_of_week, start_time, end_time
        FROM timetable_slot
        """
    ):
        hours = (minutes(row["end_time"]) - minutes(row["start_time"])) / 60
        key = row["section_course_offering_id"]
        weekly[key] = weekly.get(key, 0) + hours

    # A lab hour runs three batches side by side, so each of the three logs
    # its own two hours and the course appears to have delivered three times
    # what the students actually sat through. Divide by the number of batches
    # so "hours delivered" means hours a student received.
    batches = {}
    for row in run_query(
        """
        SELECT section_course_offering_id, COUNT(DISTINCT lab_batch_id) AS n
        FROM timetable_slot
        WHERE lab_batch_id IS NOT NULL
        GROUP BY section_course_offering_id
        """
    ):
        batches[row["section_course_offering_id"]] = max(int(row["n"]), 1)

    expected_percent = round(where["fraction_elapsed"] * 100, 1)
    out = []

    for row in rows:
        row["weekly_hours"] = round(weekly.get(row["section_course_offering_id"], 0), 1)
        parallel = batches.get(row["section_course_offering_id"], 1)
        row["delivered_hours"] = round(float(row["delivered_hours"] or 0) / parallel, 1)
        row["parallel_batches"] = parallel
        covered = float(row["percent_complete"] or 0)
        total_items = int(row["total_items"] or 0)

        # A subject with no syllabus entered cannot be judged, and pretending
        # otherwise would put a fake number on the screen.
        if total_items == 0:
            row.update({
                "expected_percent": expected_percent, "gap": None, "band": "unknown",
                "reasons": ["No syllabus has been entered for this subject yet."],
                "weeks_left": where["weeks_left"], "weeks_needed": None,
            })
            out.append(row)
            continue

        gap = round(expected_percent - covered, 1)
        weekly_hours = float(row["weekly_hours"] or 0)
        items_left = total_items - int(row["completed_items"] or 0)

        # At the pace this class has actually kept, how many weeks would the
        # rest of the syllabus take?
        weeks_gone = max(where["weeks_elapsed"], 0.1)
        items_per_week = (int(row["completed_items"] or 0)) / weeks_gone
        weeks_needed = round(items_left / items_per_week, 1) if items_per_week > 0 else None

        reasons = []
        if gap > 0:
            reasons.append(
                f"{covered:.0f}% of the syllabus is covered, but {expected_percent:.0f}% "
                f"of the term has gone — {gap:.0f} points behind."
            )
        else:
            reasons.append(
                f"{covered:.0f}% covered against {expected_percent:.0f}% of the term "
                f"elapsed — on or ahead of pace."
            )

        if weeks_needed is not None and weeks_needed > where["weeks_left"]:
            reasons.append(
                f"At the current pace the remaining {items_left} items need about "
                f"{weeks_needed} weeks, but only {where['weeks_left']} weeks of term remain."
            )
        elif items_per_week == 0:
            reasons.append("Nothing has been marked covered yet, so no pace can be measured.")

        if int(row["uncovered"] or 0) > 0:
            reasons.append(
                f"{row['uncovered']} cancelled lecture(s) on this subject still have nobody teaching them."
            )
        if weekly_hours == 0:
            reasons = ["This subject has no hours on the timetable at all, so no "
                       "teaching can have happened. It needs scheduling, not catching up."]

        # The band is a plain threshold on the gap, made worse by uncovered
        # lectures. Deliberately simple so it can be explained out loud.
        score = gap + (float(row["uncovered"] or 0) * 4)

        # A subject with no hours on the timetable is not a class falling
        # behind — it is a class that was never scheduled. Calling that
        # "critical" would put the blame in the wrong place.
        if row["weekly_hours"] == 0:
            band = "not timetabled"
        elif items_per_week == 0 and where["weeks_elapsed"] > 2:
            band = "critical"
        elif score >= 30:
            band = "critical"
        elif score >= 15:
            band = "at risk"
        elif score >= 5:
            band = "watch"
        else:
            band = "on track"

        row.update({
            "expected_percent": expected_percent,
            "gap": gap,
            "band": band,
            "reasons": reasons,
            "weeks_left": where["weeks_left"],
            "weeks_needed": weeks_needed,
        })
        out.append(row)

    order = {"critical": 0, "at risk": 1, "watch": 2, "on track": 3,
             "not timetabled": 4, "unknown": 5}
    out.sort(key=lambda r: (order[r["band"]], -(r["gap"] or -999)))

    return {"term": where, "expected_percent": expected_percent, "subjects": out}


# ---------------------------------------------------------------------------
# 2. Recovery planning
# ---------------------------------------------------------------------------
# When a lecture is lost and nobody could cover it, the class still needs the
# hour back. This searches every free slot in the next fortnight and scores
# the ones that work.
#
# Hard rules (a plan that breaks one is never offered):
#   - the students must be free: nothing else for that section at that hour,
#     or for that lab batch if it is a lab
#   - the teacher must be free, and not already covering somebody else
#   - a room of the right kind must have space
# Soft rules (these only move the score):
#   - sooner is better
#   - the usual room is better than a strange one
#   - late evening and Saturday are worse
# ---------------------------------------------------------------------------
def load_week():
    """The whole timetable in one go, so the search can run in memory."""
    return run_query(
        """
        SELECT ts.timetable_slot_id, ts.section_course_offering_id, ts.lab_batch_id,
               ts.day_of_week, ts.start_time, ts.end_time,
               sco.section_id, cr.classroom_id, cr.room_number, cr.room_type,
               cr.concurrent_group_capacity, fca.faculty_id
        FROM timetable_slot ts
        JOIN section_course_offering sco
             ON sco.section_course_offering_id = ts.section_course_offering_id
        JOIN classroom cr ON cr.classroom_id = ts.classroom_id
        JOIN faculty_course_assignment fca
             ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
        """
    )


def periods():
    """The teaching periods actually in use, taken from the timetable itself
    rather than hardcoded, so it follows the real college day."""
    return run_query(
        "SELECT DISTINCT start_time, end_time FROM timetable_slot ORDER BY start_time"
    )


@router.get("/recovery/options")
def recovery_options(timetable_slot_id: int, lecture_date: str, days_ahead: int = 14,
                     me=Depends(get_logged_in_teacher)):
    lost = run_query_one(
        """
        SELECT ts.timetable_slot_id, ts.section_course_offering_id, ts.lab_batch_id,
               ts.day_of_week, ts.start_time, ts.end_time,
               sco.section_id, s.section_name, lb.lab_batch_code,
               c.course_code, c.course_name, c.course_type,
               cr.classroom_id, cr.room_number, cr.room_type,
               fca.faculty_id, CONCAT(f.first_name, ' ', f.last_name) AS faculty_name
        FROM timetable_slot ts
        JOIN section_course_offering sco
             ON sco.section_course_offering_id = ts.section_course_offering_id
        JOIN section s ON s.section_id = sco.section_id
        LEFT JOIN lab_batch lb ON lb.lab_batch_id = ts.lab_batch_id
        JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
        JOIN course c ON c.course_id = pc.course_id
        JOIN classroom cr ON cr.classroom_id = ts.classroom_id
        JOIN faculty_course_assignment fca
             ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
        JOIN faculty f ON f.faculty_id = fca.faculty_id
        WHERE ts.timetable_slot_id = %s
        """,
        (timetable_slot_id,),
    )
    if lost is None:
        raise HTTPException(status_code=404, detail="That lecture does not exist")

    missed_on = datetime.date.fromisoformat(lecture_date)
    week = load_week()
    rooms = run_query(
        "SELECT classroom_id, room_number, room_type, seating_capacity, "
        "concurrent_group_capacity FROM classroom ORDER BY room_number"
    )

    # Cover work already promised on specific dates, so we do not double-book
    # a teacher who has agreed to take somebody else's class.
    promised = run_query(
        """
        SELECT sa.substitute_faculty_id AS faculty_id, cr.lecture_date,
               ts.start_time, ts.end_time
        FROM substitution_assignment sa
        JOIN cancellation_request cr
             ON cr.cancellation_request_id = sa.cancellation_request_id
        JOIN timetable_slot ts ON ts.timetable_slot_id = cr.timetable_slot_id
        WHERE sa.assignment_status IN ('PROPOSED', 'ASSIGNED')
        """
    )

    length = minutes(lost["end_time"]) - minutes(lost["start_time"])
    want_lab = lost["room_type"] == "LAB"
    options = []

    # Read the period list once. It was being fetched inside the day loop,
    # which meant a fresh query for every day searched.
    slot_periods = [p for p in periods()
                    if minutes(p["end_time"]) - minutes(p["start_time"]) == length]

    for offset in range(1, days_ahead + 1):
        when = missed_on + datetime.timedelta(days=offset)
        if when.weekday() > 5:          # no Sunday classes
            continue
        day = DAYS[when.weekday()]

        for period in slot_periods:
            start, end = period["start_time"], period["end_time"]

            # --- hard rule: the students must be free -----------------------
            clash = False
            for slot in week:
                if slot["day_of_week"] != day:
                    continue
                if not overlaps(start, end, slot["start_time"], slot["end_time"]):
                    continue
                if lost["lab_batch_id"]:
                    # a lab batch is busy if that batch, or its whole section
                    # in a lecture, is occupied
                    if slot["lab_batch_id"] == lost["lab_batch_id"]:
                        clash = True; break
                    if slot["lab_batch_id"] is None and slot["section_id"] == lost["section_id"]:
                        clash = True; break
                elif slot["section_id"] == lost["section_id"]:
                    clash = True; break
            if clash:
                continue

            # --- hard rule: the teacher must be free ------------------------
            busy = any(
                slot["faculty_id"] == lost["faculty_id"]
                and slot["day_of_week"] == day
                and overlaps(start, end, slot["start_time"], slot["end_time"])
                for slot in week
            )
            if busy:
                continue
            covering = any(
                p["faculty_id"] == lost["faculty_id"]
                and p["lecture_date"] == when.isoformat()
                and overlaps(start, end, p["start_time"], p["end_time"])
                for p in promised
            )
            if covering:
                continue

            # --- hard rule: a room of the right kind must have space --------
            free_rooms = []
            for room in rooms:
                if (room["room_type"] == "LAB") != want_lab:
                    continue
                used = sum(
                    1 for slot in week
                    if slot["classroom_id"] == room["classroom_id"]
                    and slot["day_of_week"] == day
                    and overlaps(start, end, slot["start_time"], slot["end_time"])
                )
                if used < int(room["concurrent_group_capacity"]):
                    free_rooms.append(room)
            if not free_rooms:
                continue

            # prefer the room the class normally sits in
            usual = [r for r in free_rooms if r["classroom_id"] == lost["classroom_id"]]
            room = usual[0] if usual else free_rooms[0]

            # --- soft rules: score what is left -----------------------------
            score = 100
            notes = []

            score -= offset * 3
            notes.append(f"{offset} day{'s' if offset > 1 else ''} after the missed class")

            if day == lost["day_of_week"] and start == lost["start_time"]:
                score += 12
                notes.append("same weekday and hour as the regular class")
            if room["classroom_id"] == lost["classroom_id"]:
                score += 6
                notes.append(f"their usual room ({room['room_number']})")
            else:
                notes.append(f"room {room['room_number']}")
            if minutes(start) >= minutes("16:45"):
                score -= 14
                notes.append("late in the day")
            if day == "SAT":
                score -= 18
                notes.append("Saturday")

            options.append({
                "date": when.isoformat(), "day_of_week": day,
                "start_time": start, "end_time": end,
                "room_number": room["room_number"], "classroom_id": room["classroom_id"],
                "score": score, "notes": notes,
                "free_room_count": len(free_rooms),
            })

    options.sort(key=lambda o: (-o["score"], o["date"], o["start_time"]))

    return {
        "lecture": lost,
        "missed_on": lecture_date,
        "searched_days": days_ahead,
        "options": options[:6],
        "total_found": len(options),
    }


class AcceptRecovery(BaseModel):
    timetable_slot_id: int
    missed_on: str
    date: str
    start_time: str
    end_time: str
    room_number: str


@router.post("/recovery/accept")
def accept_recovery(data: AcceptRecovery, me=Depends(get_logged_in_teacher)):
    """
    Records the chosen make-up plan.

    The timetable only holds a weekly pattern, so a one-off make-up class has
    nowhere of its own to live. We write it against the date that was missed
    as a 'RESCHEDULED' lecture_log row — a status the schema already had —
    with the plan in the remarks. No new table needed.
    """
    slot = run_query_one(
        """
        SELECT fca.faculty_id FROM timetable_slot ts
        JOIN faculty_course_assignment fca
             ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
        WHERE ts.timetable_slot_id = %s
        """,
        (data.timetable_slot_id,),
    )
    if slot is None:
        raise HTTPException(status_code=404, detail="That lecture does not exist")
    if slot["faculty_id"] != me["faculty_id"]:
        raise HTTPException(status_code=403, detail="Only the teacher of this class can arrange its make-up")

    already = run_query_one(
        "SELECT lecture_log_id FROM lecture_log WHERE timetable_slot_id = %s AND lecture_date = %s",
        (data.timetable_slot_id, data.missed_on),
    )
    if already is not None:
        raise HTTPException(status_code=400, detail="This date already has a lecture log entry")

    plan = (f"Make-up class on {data.date} at {data.start_time}-{data.end_time} "
            f"in room {data.room_number}")
    run_update(
        "INSERT INTO lecture_log (timetable_slot_id, delivered_by_faculty_id, lecture_date, "
        "actual_hours_taken, delivery_status, remarks) VALUES (%s, %s, %s, 0, 'RESCHEDULED', %s)",
        (data.timetable_slot_id, me["faculty_id"], data.missed_on, plan),
    )
    return {"message": plan + " has been recorded."}


# ---------------------------------------------------------------------------
# 3. Resource allocation
# ---------------------------------------------------------------------------
# The department view: who is carrying too much, which rooms sit empty, and
# what would actually fix it. Every suggestion names the two people or rooms
# involved and the size of the imbalance, so it can be acted on or argued
# with. faculty.max_weekly_workload_hours has been in the schema from the
# start and is finally used here.
# ---------------------------------------------------------------------------
@router.get("/allocation")
def allocation(me=Depends(get_logged_in_teacher)):
    staff = run_query(
        """
        SELECT f.faculty_id, CONCAT(f.first_name, ' ', f.last_name) AS name,
               f.employee_code, f.designation, f.max_weekly_workload_hours,
               COALESCE((SELECT SUM(TIME_TO_SEC(TIMEDIFF(ts.end_time, ts.start_time)))/3600
                           FROM timetable_slot ts
                           JOIN faculty_course_assignment fca
                                ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
                          WHERE fca.faculty_id = f.faculty_id), 0) AS weekly_hours,
               (SELECT COUNT(*) FROM timetable_slot ts2
                  JOIN faculty_course_assignment fca2
                       ON fca2.faculty_course_assignment_id = ts2.faculty_course_assignment_id
                 WHERE fca2.faculty_id = f.faculty_id) AS weekly_classes,
               (SELECT COUNT(*) FROM lecture_log ll
                 WHERE ll.delivered_by_faculty_id = f.faculty_id
                   AND ll.delivery_status = 'DELIVERED') AS lectures_taken,
               (SELECT COUNT(*) FROM faculty_course_assignment fca3
                 WHERE fca3.faculty_id = f.faculty_id AND fca3.is_active = 1) AS subjects
        FROM faculty f
        WHERE f.is_active = 1
        ORDER BY weekly_hours DESC, name
        """
    )
    for person in staff:
        person["weekly_hours"] = round(float(person["weekly_hours"]), 1)
        person["max_weekly_workload_hours"] = float(person["max_weekly_workload_hours"])
        person["headroom"] = round(person["max_weekly_workload_hours"] - person["weekly_hours"], 1)
        person["load_percent"] = round(
            person["weekly_hours"] / person["max_weekly_workload_hours"] * 100, 1
        ) if person["max_weekly_workload_hours"] else 0

    # How busy each room is, against the number of periods in a teaching week.
    period_count = len(periods())
    teaching_days = len({s["day_of_week"] for s in load_week()})
    capacity = max(period_count * teaching_days, 1)

    rooms = run_query(
        """
        SELECT cr.classroom_id, cr.room_number, cr.room_type, cr.building_name,
               cr.seating_capacity, cr.concurrent_group_capacity,
               (SELECT COUNT(*) FROM timetable_slot ts
                 WHERE ts.classroom_id = cr.classroom_id) AS bookings
        FROM classroom cr
        ORDER BY bookings DESC, cr.room_number
        """
    )
    for room in rooms:
        room["utilisation"] = round(int(room["bookings"]) / capacity * 100, 1)

    # --- what is actually wrong, and what would fix it ---------------------
    findings = []

    over = [p for p in staff if p["headroom"] < 0]
    under = [p for p in staff if p["headroom"] >= 4]
    for person in over:
        fix = ""
        if under:
            helper = max(under, key=lambda p: p["headroom"])
            fix = (f" {helper['name']} has {helper['headroom']} hours spare and could "
                   f"take some of it.")
        findings.append({
            "kind": "overloaded", "severity": "high",
            "title": f"{person['name']} is over the weekly limit",
            "detail": (f"{person['weekly_hours']} hours scheduled against a "
                       f"{person['max_weekly_workload_hours']} hour limit." + fix),
        })

    if staff:
        busiest, quietest = staff[0], staff[-1]
        spread = round(busiest["weekly_hours"] - quietest["weekly_hours"], 1)
        if spread >= 6:
            findings.append({
                "kind": "imbalance", "severity": "medium",
                "title": "Teaching hours are unevenly spread",
                "detail": (f"{busiest['name']} carries {busiest['weekly_hours']} hours a week "
                           f"while {quietest['name']} carries {quietest['weekly_hours']} — "
                           f"a {spread} hour gap."),
            })

    for room in rooms:
        if room["utilisation"] >= 75:
            findings.append({
                "kind": "room-pressure", "severity": "medium",
                "title": f"Room {room['room_number']} is close to full",
                "detail": (f"Booked for {room['bookings']} of {capacity} slots "
                           f"({room['utilisation']}%). Little room for a make-up class."),
            })
    idle = [r for r in rooms if int(r["bookings"]) == 0]
    if idle:
        findings.append({
            "kind": "room-idle", "severity": "low",
            "title": f"{len(idle)} room(s) are never used",
            "detail": ", ".join(r["room_number"] + " (" + r["room_type"].lower() + ")"
                                for r in idle) + " — free for make-up classes.",
        })

    uncovered = run_query(
        """
        SELECT COUNT(*) AS n FROM cancellation_request cr
        LEFT JOIN substitution_assignment sa
             ON sa.cancellation_request_id = cr.cancellation_request_id
            AND sa.assignment_status = 'ASSIGNED'
        WHERE cr.request_status <> 'WITHDRAWN' AND sa.substitution_assignment_id IS NULL
        """
    )[0]["n"]
    if uncovered:
        findings.append({
            "kind": "uncovered", "severity": "high",
            "title": f"{uncovered} cancelled lecture(s) have nobody teaching them",
            "detail": "Open the Recovery planner on each one to find a make-up slot.",
        })

    rank = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: rank[f["severity"]])

    return {
        "staff": staff, "rooms": rooms, "findings": findings,
        "week_capacity": capacity, "periods_per_day": period_count,
        "teaching_days": teaching_days,
    }


# ---------------------------------------------------------------------------
# 4. The day view, for students and coordinators
# ---------------------------------------------------------------------------
# What actually happens on one date for one class: who really teaches each
# hour, what was cancelled, what has no cover, and what has been moved.
# ---------------------------------------------------------------------------
@router.get("/day")
def day_view(section_id: int, date: str, me=Depends(get_logged_in_teacher)):
    when = datetime.date.fromisoformat(date)
    if when.weekday() > 5:
        return {"date": date, "day_of_week": "SUN", "section": None, "lectures": []}
    day = DAYS[when.weekday()]

    section = run_query_one(
        """
        SELECT s.section_id, s.section_name, p.program_code, b.admission_year
        FROM section s
        JOIN academic_batch b ON b.batch_id = s.batch_id
        JOIN program p ON p.program_id = b.program_id
        WHERE s.section_id = %s
        """,
        (section_id,),
    )
    if section is None:
        raise HTTPException(status_code=404, detail="That class was not found")

    lectures = run_query(
        """
        SELECT ts.timetable_slot_id, ts.start_time, ts.end_time,
               c.course_code, c.course_name, c.course_type,
               cr.room_number, lb.lab_batch_code,
               CONCAT(f.first_name, ' ', f.last_name) AS scheduled_teacher,

               cancel.cancellation_request_id, cancel.reason,
               CONCAT(sub.first_name, ' ', sub.last_name) AS substitute_name,
               sa.assignment_status,
               log.delivery_status, log.remarks AS log_remarks, log.actual_hours_taken
        FROM timetable_slot ts
        JOIN section_course_offering sco
             ON sco.section_course_offering_id = ts.section_course_offering_id
        JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
        JOIN course c ON c.course_id = pc.course_id
        JOIN classroom cr ON cr.classroom_id = ts.classroom_id
        LEFT JOIN lab_batch lb ON lb.lab_batch_id = ts.lab_batch_id
        JOIN faculty_course_assignment fca
             ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
        JOIN faculty f ON f.faculty_id = fca.faculty_id
        LEFT JOIN cancellation_request cancel
               ON cancel.timetable_slot_id = ts.timetable_slot_id
              AND cancel.lecture_date = %s
              AND cancel.request_status <> 'WITHDRAWN'
        LEFT JOIN substitution_assignment sa
               ON sa.cancellation_request_id = cancel.cancellation_request_id
        LEFT JOIN faculty sub ON sub.faculty_id = sa.substitute_faculty_id
        LEFT JOIN lecture_log log
               ON log.timetable_slot_id = ts.timetable_slot_id
              AND log.lecture_date = %s
        WHERE sco.section_id = %s AND ts.day_of_week = %s
        ORDER BY ts.start_time, lb.lab_batch_code
        """,
        (date, date, section_id, day),
    )

    for row in lectures:
        # Work out the one sentence a student actually needs.
        if row["delivery_status"] == "RESCHEDULED":
            row["state"] = "moved"
            row["teacher"] = row["scheduled_teacher"]
            row["note"] = row["log_remarks"] or "Moved to another slot"
        elif row["cancellation_request_id"] is None:
            row["state"] = "conducted" if row["delivery_status"] == "DELIVERED" else "scheduled"
            row["teacher"] = row["scheduled_teacher"]
            row["note"] = "Class conducted" if row["state"] == "conducted" else "As timetabled"
        elif row["assignment_status"] == "ASSIGNED":
            row["state"] = "covered"
            row["teacher"] = row["substitute_name"]
            row["note"] = f"{row['substitute_name']} is taking this instead of {row['scheduled_teacher']}"
        elif row["substitute_name"]:
            row["state"] = "pending"
            row["teacher"] = None
            row["note"] = f"Cancelled — waiting for {row['substitute_name']} to reply"
        else:
            row["state"] = "uncovered"
            row["teacher"] = None
            row["note"] = "Cancelled — no teacher arranged yet"

    return {"date": date, "day_of_week": day, "section": section, "lectures": lectures}


@router.get("/coordinator")
def coordinator(me=Depends(get_logged_in_teacher)):
    """Everything still needing somebody's attention, in one list."""
    open_items = run_query(
        """
        SELECT cr.cancellation_request_id, cr.lecture_date, cr.reason, cr.request_status,
               ts.timetable_slot_id, ts.day_of_week, ts.start_time, ts.end_time,
               c.course_code, c.course_name, s.section_name, lb.lab_batch_code,
               room.room_number,
               CONCAT(owner.first_name, ' ', owner.last_name) AS scheduled_teacher,
               CONCAT(sub.first_name, ' ', sub.last_name) AS substitute_name,
               sa.assignment_status,
               log.delivery_status
        FROM cancellation_request cr
        JOIN timetable_slot ts ON ts.timetable_slot_id = cr.timetable_slot_id
        JOIN section_course_offering sco
             ON sco.section_course_offering_id = ts.section_course_offering_id
        JOIN section s ON s.section_id = sco.section_id
        JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
        JOIN course c ON c.course_id = pc.course_id
        JOIN classroom room ON room.classroom_id = ts.classroom_id
        LEFT JOIN lab_batch lb ON lb.lab_batch_id = ts.lab_batch_id
        JOIN faculty_course_assignment fca
             ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
        JOIN faculty owner ON owner.faculty_id = fca.faculty_id
        LEFT JOIN substitution_assignment sa
               ON sa.cancellation_request_id = cr.cancellation_request_id
        LEFT JOIN faculty sub ON sub.faculty_id = sa.substitute_faculty_id
        LEFT JOIN lecture_log log
               ON log.timetable_slot_id = ts.timetable_slot_id
              AND log.lecture_date = cr.lecture_date
        WHERE cr.request_status <> 'WITHDRAWN'
        ORDER BY cr.lecture_date
        """
    )

    for row in open_items:
        if row["delivery_status"] == "RESCHEDULED":
            row["state"] = "moved"
        elif row["assignment_status"] == "ASSIGNED":
            row["state"] = "covered"
        elif row["substitute_name"]:
            row["state"] = "pending"
        else:
            row["state"] = "uncovered"

    needs_action = [r for r in open_items if r["state"] in ("uncovered", "pending")]
    return {
        "all": open_items,
        "needs_action": needs_action,
        "counts": {
            "uncovered": sum(1 for r in open_items if r["state"] == "uncovered"),
            "pending": sum(1 for r in open_items if r["state"] == "pending"),
            "covered": sum(1 for r in open_items if r["state"] == "covered"),
            "moved": sum(1 for r in open_items if r["state"] == "moved"),
        },
    }
