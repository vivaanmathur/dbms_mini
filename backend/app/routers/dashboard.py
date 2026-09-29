"""
The dashboards. Which ones a person sees is decided by the roles they hold;
someone with several roles gets several dashboards and switches between them.

    /dashboard/faculty             FACULTY
    /dashboard/class/{section}     CLASS_TEACHER (and anyone overseeing that class)
    /dashboard/scope/{role}        YEAR_COORDINATOR, PROGRAM_COORDINATOR, PROGRAM_DIRECTOR
    /dashboard/admin               ADMIN
    /dashboard/student             STUDENT
"""
import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.calendar import current_term, monday_of, term_progress, week_dates
from app.db import fetch_all, fetch_one, placeholders
from app.routers.insight import attention, risk
from app.routers.syllabus import for_class, mine as my_syllabus
from app.security import (admin_only, require_section, sections_for_roles,
                          staff_only, student_only, teaching_only)
from app.sessions import dated_day, dated_week, makeups_between, weekly_slots

router = APIRouter(prefix="/dashboard", tags=["Dashboards"])


def _today_for(where, values):
    today = datetime.date.today()
    lectures = dated_day(weekly_slots(where, values), today)
    lectures += makeups_between(where, values, today.isoformat(), today.isoformat())
    return sorted(lectures, key=lambda l: (l["start_time"], l.get("lab_batch_code") or ""))


def _week_counts(where, values):
    """This week so far: how many lectures were due, and how many happened."""
    week = monday_of(datetime.date.today())
    today = datetime.date.today().isoformat()
    sessions = [s for s in dated_week(weekly_slots(where, values), week) if s["date"] <= today]
    return {
        "due": len(sessions),
        "conducted": sum(1 for s in sessions if s["state"] == "conducted"),
        "covered": sum(1 for s in sessions if s["state"] == "covered"),
        "lost": sum(1 for s in sessions if s["state"] in ("uncovered", "pending")),
        "moved": sum(1 for s in sessions if s["state"] == "moved"),
    }


# ---------------------------------------------------------------------------
@router.get("/faculty")
def faculty(me=Depends(teaching_only)):
    term = current_term()
    lectures = _today_for("v.staff_id = %s", (me.staff_id,))

    # other teachers' lectures I agreed to take today
    today = datetime.date.today().isoformat()
    for row in fetch_all(
        """
        SELECT c.slot_id, CONCAT(req.first_name, ' ', req.last_name) AS covering_for
        FROM cover_request cr
        JOIN cancellation c ON c.cancellation_id = cr.cancellation_id
        JOIN staff req ON req.staff_id = c.requested_by_staff_id
        WHERE cr.staff_id = %s AND cr.status = 'ACCEPTED' AND c.lecture_date = %s
        """, (me.staff_id, today)):
        for lecture in dated_day(weekly_slots("v.slot_id = %s", (row["slot_id"],)), datetime.date.today()):
            lecture["kind"] = "cover"
            lecture["covering_for"] = row["covering_for"]
            lectures.append(lecture)
    lectures.sort(key=lambda l: l["start_time"])

    stats = fetch_one(
        """
        SELECT
          (SELECT COUNT(*) FROM cover_request WHERE staff_id = %s AND status = 'PENDING') AS requests_waiting,
          (SELECT COUNT(*) FROM cover_request cr JOIN cancellation c ON c.cancellation_id = cr.cancellation_id
            WHERE cr.staff_id = %s AND cr.status = 'ACCEPTED' AND c.lecture_date >= CURDATE()) AS covering_ahead,
          (SELECT COUNT(*) FROM lecture_log WHERE delivered_by_staff_id = %s
            AND lecture_date BETWEEN %s AND %s) AS lectures_this_term,
          (SELECT COALESCE(SUM(hours), 0) FROM lecture_log WHERE delivered_by_staff_id = %s
            AND lecture_date BETWEEN %s AND %s) AS hours_this_term,
          (SELECT COUNT(*) FROM cancellation WHERE requested_by_staff_id = %s AND status = 'OPEN') AS open_handovers
        """,
        (me.staff_id, me.staff_id, me.staff_id, term["start_date"], term["end_date"],
         me.staff_id, term["start_date"], term["end_date"], me.staff_id),
    )
    return {
        "today": lectures,
        "stats": stats,
        "week": _week_counts("v.staff_id = %s", (me.staff_id,)),
        "subjects": my_syllabus(me),
        "term": dict(term_progress(term), name=term["name"]),
    }


# ---------------------------------------------------------------------------
@router.get("/class/{section_id}")
def class_dashboard(section_id: int, me=Depends(staff_only)):
    require_section(me, section_id)
    info = fetch_one("SELECT * FROM vw_class WHERE section_id = %s", (section_id,))
    if info is None:
        raise HTTPException(404, "That class does not exist.")
    info["batches"] = fetch_all("SELECT lab_batch_id, code FROM lab_batch WHERE section_id = %s ORDER BY code",
                                (section_id,))
    info["students"] = fetch_one("SELECT COUNT(*) AS n FROM student WHERE section_id = %s AND is_active",
                                 (section_id,))["n"]
    teacher = fetch_one(
        "SELECT CONCAT(st.first_name, ' ', st.last_name) AS name FROM role_assignment ra "
        "JOIN staff st ON st.staff_id = ra.staff_id WHERE ra.role = 'CLASS_TEACHER' AND ra.section_id = %s",
        (section_id,))
    info["class_teacher"] = teacher and teacher["name"]

    term = current_term()
    return {
        "class": info,
        "today": _today_for("v.section_id = %s", (section_id,)),
        "week": _week_counts("v.section_id = %s", (section_id,)),
        "subjects": for_class(section_id, me),
        "risk": risk(section_id, me),
        "attention": attention(section_id, me),
        "term": dict(term_progress(term), name=term["name"]),
    }


# ---------------------------------------------------------------------------
@router.get("/scope/{role_assignment_id}")
def scope_dashboard(role_assignment_id: int, me=Depends(staff_only)):
    """A year coordinator's, programme coordinator's or director's view: every
    class they oversee, side by side."""
    role = next((r for r in me.roles if r["role_assignment_id"] == role_assignment_id), None)
    if role is None or role["role"] not in ("YEAR_COORDINATOR", "PROGRAM_COORDINATOR", "PROGRAM_DIRECTOR"):
        raise HTTPException(404, "You do not hold that role.")

    sections = sorted(sections_for_roles([role]))   # the classes this one role covers
    term = current_term()
    if not sections:
        return {"role": role, "classes": [], "attention": [], "totals": {}, "term": term_progress(term)}

    classes = fetch_all(
        f"SELECT * FROM vw_class WHERE section_id IN ({placeholders(sections)}) "
        "ORDER BY program_short, year_of_study, division", tuple(sections))
    everything = risk(None, me)["items"]
    for c in classes:
        mine = [i for i in everything if i["section_id"] == c["section_id"]]
        measured = [i for i in mine if i["band"] not in ("not timetabled", "no syllabus", "no record")]
        c["subjects"] = len(mine)
        c["average_percent"] = round(sum(i["percent"] for i in measured) / len(measured), 1) if measured else None
        c["bands"] = {band: sum(1 for i in mine if i["band"] == band)
                      for band in ("critical", "at risk", "no record", "watch", "on track",
                                   "not timetabled", "no syllabus")}
        c["week"] = _week_counts("v.section_id = %s", (c["section_id"],))
        teacher = fetch_one(
            "SELECT CONCAT(st.first_name, ' ', st.last_name) AS name FROM role_assignment ra "
            "JOIN staff st ON st.staff_id = ra.staff_id WHERE ra.role = 'CLASS_TEACHER' AND ra.section_id = %s",
            (c["section_id"],))
        c["class_teacher"] = teacher and teacher["name"]

    open_items = [a for a in attention(None, me) if a["section_id"] in sections]
    staff = fetch_one(
        f"SELECT COUNT(DISTINCT ta.staff_id) AS n FROM teaching_assignment ta "
        f"JOIN subject_offering so ON so.offering_id = ta.offering_id WHERE so.section_id IN ({placeholders(sections)})",
        tuple(sections))["n"]
    students = fetch_one(
        f"SELECT COUNT(*) AS n FROM student WHERE is_active AND section_id IN ({placeholders(sections)})",
        tuple(sections))["n"]
    return {
        "role": role,
        "classes": classes,
        "attention": open_items,
        "totals": {"classes": len(classes), "teachers": staff, "students": students,
                   "open": len(open_items),
                   "critical": sum(c["bands"]["critical"] for c in classes),
                   "at_risk": sum(c["bands"]["at risk"] for c in classes)},
        "term": dict(term_progress(term), name=term["name"]),
    }


# ---------------------------------------------------------------------------
@router.get("/admin")
def admin(me=Depends(admin_only)):
    counts = fetch_one(
        """
        SELECT (SELECT COUNT(*) FROM department) AS departments,
               (SELECT COUNT(*) FROM program) AS programmes,
               (SELECT COUNT(*) FROM section) AS classes,
               (SELECT COUNT(*) FROM staff WHERE is_active) AS staff,
               (SELECT COUNT(*) FROM student WHERE is_active) AS students,
               (SELECT COUNT(*) FROM subject) AS subjects,
               (SELECT COUNT(*) FROM room) AS rooms,
               (SELECT COUNT(*) FROM timetable_slot) AS sessions,
               (SELECT COUNT(*) FROM app_user WHERE is_active) AS logins
        """)

    # What is still missing before the system is fully set up. Each entry
    # names the exact things to fix and where to fix them.
    term = fetch_one("SELECT term_id, name FROM academic_term WHERE is_current")
    checks = []

    def check(key, title, rows, fix, label):
        checks.append({"key": key, "title": title, "count": len(rows), "fix": fix,
                       "items": [label(r) for r in rows[:12]]})

    if term is None:
        checks.append({"key": "term", "title": "No term is marked as current", "count": 1,
                       "fix": "Setup → Terms", "items": []})
    else:
        check("unassigned", "Subjects offered to a class with nobody teaching them",
              fetch_all("""SELECT fn_class_label(so.section_id) AS c, sub.code FROM subject_offering so
                           JOIN subject sub ON sub.subject_id = so.subject_id
                           WHERE so.term_id = %s AND NOT EXISTS
                             (SELECT 1 FROM teaching_assignment ta WHERE ta.offering_id = so.offering_id)
                           ORDER BY c, sub.code""", (term["term_id"],)),
              "Teaching → Assignments", lambda r: f"{r['code']} · {r['c']}")
        check("unscheduled", "Teaching assignments with no session on the timetable",
              fetch_all("""SELECT fn_class_label(so.section_id) AS c, sub.code, lb.code AS b,
                                  CONCAT(st.first_name, ' ', st.last_name) AS t
                           FROM teaching_assignment ta
                           JOIN subject_offering so ON so.offering_id = ta.offering_id
                           JOIN subject sub ON sub.subject_id = so.subject_id
                           JOIN staff st ON st.staff_id = ta.staff_id
                           LEFT JOIN lab_batch lb ON lb.lab_batch_id = ta.lab_batch_id
                           WHERE so.term_id = %s AND NOT EXISTS
                             (SELECT 1 FROM timetable_slot ts WHERE ts.assignment_id = ta.assignment_id)
                           ORDER BY c, sub.code, b""", (term["term_id"],)),
              "Timetable", lambda r: f"{r['code']}{' ' + r['b'] if r['b'] else ''} · {r['t']}")
        # a lab taught batch by batch where some batch has no teacher
        check("batch_gap", "Lab batches with no teacher for a practical",
              fetch_all("""SELECT fn_class_label(so.section_id) AS c, sub.code, lb.code AS b
                           FROM subject_offering so
                           JOIN subject sub ON sub.subject_id = so.subject_id
                           JOIN lab_batch lb ON lb.section_id = so.section_id
                           WHERE so.term_id = %s AND sub.subject_type = 'PRACTICAL'
                             AND EXISTS (SELECT 1 FROM teaching_assignment t
                                          WHERE t.offering_id = so.offering_id AND t.lab_batch_id IS NOT NULL)
                             AND NOT EXISTS (SELECT 1 FROM teaching_assignment t
                                              WHERE t.offering_id = so.offering_id AND t.lab_batch_id = lb.lab_batch_id)
                           ORDER BY c, sub.code, b""", (term["term_id"],)),
              "Teaching → Assignments", lambda r: f"{r['code']} {r['b']} · {r['c']}")

    check("no_class_teacher", "Classes without a class teacher",
          fetch_all("""SELECT label FROM vw_class c WHERE NOT EXISTS
                         (SELECT 1 FROM role_assignment ra WHERE ra.role = 'CLASS_TEACHER'
                           AND ra.section_id = c.section_id) ORDER BY label"""),
          "People → Roles", lambda r: r["label"])
    check("no_students", "Classes with no students enrolled",
          fetch_all("""SELECT label FROM vw_class c WHERE NOT EXISTS
                         (SELECT 1 FROM student s WHERE s.section_id = c.section_id AND s.is_active)
                       ORDER BY label"""),
          "People → Students", lambda r: r["label"])
    check("no_login", "Staff who cannot sign in",
          fetch_all("""SELECT CONCAT(first_name, ' ', last_name) AS n FROM staff st WHERE st.is_active
                         AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.staff_id = st.staff_id)
                       ORDER BY n"""),
          "People → Staff", lambda r: r["n"])
    check("no_syllabus", "Subjects with no syllabus entered",
          fetch_all("""SELECT code FROM subject s WHERE
                         (s.subject_type = 'THEORY' AND NOT EXISTS (SELECT 1 FROM syllabus_unit u WHERE u.subject_id = s.subject_id))
                      OR (s.subject_type = 'PRACTICAL' AND NOT EXISTS (SELECT 1 FROM practical_experiment e WHERE e.subject_id = s.subject_id))
                       ORDER BY code"""),
          "Subjects", lambda r: r["code"])

    recent = fetch_all(
        """
        SELECT a.audit_id, a.action, a.entity, a.summary, a.created_at,
               COALESCE(CONCAT(st.first_name, ' ', st.last_name), 'System') AS who
        FROM audit_log a
        LEFT JOIN app_user u ON u.user_id = a.user_id
        LEFT JOIN staff st ON st.staff_id = u.staff_id
        ORDER BY a.audit_id DESC LIMIT 12
        """)
    return {"counts": counts, "checks": checks, "recent": recent,
            "term": term and term["name"]}


# ---------------------------------------------------------------------------
@router.get("/student")
def student(me=Depends(student_only)):
    who = fetch_one(
        """
        SELECT s.student_id, s.prn, s.roll_no, s.section_id, s.lab_batch_id, lb.code AS lab_batch_code,
               fn_class_label(s.section_id) AS class_label
        FROM student s LEFT JOIN lab_batch lb ON lb.lab_batch_id = s.lab_batch_id
        WHERE s.student_id = %s
        """, (me.student_id,))
    where = "v.section_id = %s AND (v.lab_batch_id IS NULL OR v.lab_batch_id = %s)"
    values = (who["section_id"], who["lab_batch_id"])

    # anything this week that is not going ahead as timetabled
    week = monday_of(datetime.date.today())
    dates = week_dates(week)
    changes = [s for s in dated_week(weekly_slots(where, values), week)
               if s["state"] in ("covered", "pending", "uncovered", "moved")]
    changes += makeups_between(where, values, dates["MON"], dates["SAT"])
    changes.sort(key=lambda s: (s["date"], s["start_time"]))

    term = current_term()
    return {
        "student": who,
        "today": _today_for(where, values),
        "changes": changes,
        "subjects": for_class(who["section_id"], me),
        "term": dict(term_progress(term), name=term["name"]),
    }
