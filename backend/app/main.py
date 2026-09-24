"""
Faculty Lecture Scheduler - backend (FastAPI + plain SQL, no ORM)

What this app does
------------------
1. A teacher logs in with their college email.
2. "My Timetable" shows every lecture/lab that teacher has to take.
3. "Class Timetable" shows the full week of any class (section). A lab hour
   shows all the lab batches (G1/G2/G3) that are running in that hour.
4. If a teacher cannot take one of THEIR OWN lectures, they cancel it. The
   backend then looks for another teacher who is free at that day+time and
   sends the request to them.
5. That other teacher approves (they now take the class) or rejects (the
   request is passed on to the next free teacher).
6. After taking a class the teacher marks it as conducted. That goes into the
   lecture_log table, and those numbers are what decide who gets the next
   substitution request (the teacher with the fewest lectures so far).

Tables used for steps 4, 5 and 6 (already present in the database, nothing new
was created): cancellation_request, substitution_assignment and lecture_log.
"""
import datetime

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.auth import check_password, get_logged_in_teacher, make_token
from app.database import run_query, run_query_one, run_update

app = FastAPI(title="Faculty Lecture Scheduler")

# Let our React app (running on port 5173) talk to this backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DAY_NUMBER = {"MON": 0, "TUE": 1, "WED": 2, "THU": 3, "FRI": 4, "SAT": 5}


# ---------------------------------------------------------------------------
# what the frontend sends us
# ---------------------------------------------------------------------------
class CancelLecture(BaseModel):
    timetable_slot_id: int
    lecture_date: str  # "2026-09-22"
    reason: str
    # Who to hand the class to. If the teacher does not pick anybody, the
    # system chooses the fairest free teacher by itself.
    delegate_to_faculty_id: int | None = None


class ConductedLecture(BaseModel):
    timetable_slot_id: int
    lecture_date: str
    remarks: str = ""
    # what was actually taught in that class, ticked off by the teacher
    covered_subtopic_ids: list[int] = []
    covered_experiment_ids: list[int] = []


class MarkSyllabus(BaseModel):
    section_course_offering_id: int
    subtopic_id: int | None = None
    experiment_id: int | None = None
    completed_on: str
    remarks: str = ""


# ---------------------------------------------------------------------------
# login
# ---------------------------------------------------------------------------
@app.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    """The login form field is called 'username' but we put the email in it."""
    user = run_query_one(
        "SELECT * FROM app_user WHERE email = %s AND is_active = 1", (form.username,)
    )
    if user is None or not check_password(form.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Wrong email or password")

    teacher = run_query_one(
        "SELECT faculty_id, first_name, last_name FROM faculty WHERE faculty_id = %s",
        (user["faculty_id"],),
    )
    return {
        "access_token": make_token(user["user_id"]),
        "token_type": "bearer",
        "email": user["email"],
        "faculty_id": teacher["faculty_id"],
        "name": teacher["first_name"] + " " + teacher["last_name"],
    }


@app.get("/auth/me")
def who_am_i(me=Depends(get_logged_in_teacher)):
    return me


# ---------------------------------------------------------------------------
# the two timetable views
# ---------------------------------------------------------------------------
# This one big SELECT joins everything a timetable box needs to show:
# course, teacher, room and (for labs) which batch it is.
SLOT_QUERY = """
    SELECT ts.timetable_slot_id, ts.section_course_offering_id,
           ts.day_of_week, ts.start_time, ts.end_time,
           c.course_code, c.course_name, c.course_type,
           cr.room_number, cr.room_type,
           s.section_id, s.section_name,
           lb.lab_batch_code,
           f.faculty_id, CONCAT(f.first_name, ' ', f.last_name) AS faculty_name
    FROM timetable_slot ts
    JOIN section_course_offering sco
         ON sco.section_course_offering_id = ts.section_course_offering_id
    JOIN section s   ON s.section_id = sco.section_id
    JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
    JOIN course c    ON c.course_id = pc.course_id
    JOIN classroom cr ON cr.classroom_id = ts.classroom_id
    JOIN faculty_course_assignment fca
         ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
    JOIN faculty f   ON f.faculty_id = fca.faculty_id
    LEFT JOIN lab_batch lb ON lb.lab_batch_id = ts.lab_batch_id
    WHERE {where}
    ORDER BY FIELD(ts.day_of_week, 'MON','TUE','WED','THU','FRI','SAT'),
             ts.start_time, lb.lab_batch_code
"""


def get_cancellations(slot_ids):
    """
    For the slots we are about to show, find every cancellation on them and
    who is covering. The frontend puts this inside the timetable box.
    """
    if len(slot_ids) == 0:
        return []
    placeholders = ",".join(["%s"] * len(slot_ids))
    return run_query(
        """
        SELECT cr.cancellation_request_id, cr.timetable_slot_id, cr.lecture_date,
               cr.reason, cr.request_status,
               CONCAT(asked.first_name, ' ', asked.last_name) AS cancelled_by,
               sa.assignment_status,
               sub.faculty_id AS substitute_faculty_id,
               CONCAT(sub.first_name, ' ', sub.last_name) AS substitute_name
        FROM cancellation_request cr
        JOIN faculty asked ON asked.faculty_id = cr.requested_by_faculty_id
        LEFT JOIN substitution_assignment sa
               ON sa.cancellation_request_id = cr.cancellation_request_id
        LEFT JOIN faculty sub ON sub.faculty_id = sa.substitute_faculty_id
        WHERE cr.timetable_slot_id IN (""" + placeholders + """)
          AND cr.request_status <> 'WITHDRAWN'
        ORDER BY cr.lecture_date
        """,
        tuple(slot_ids),
    )


def add_extra_info(slots):
    """
    Puts the cancellations and the conducted-lecture entries of each slot
    inside that slot, so one timetable box has everything it needs.
    """
    slot_ids = [s["timetable_slot_id"] for s in slots]
    changes = get_cancellations(slot_ids)
    logs = get_logs(slot_ids)
    for slot in slots:
        slot["changes"] = [c for c in changes if c["timetable_slot_id"] == slot["timetable_slot_id"]]
        slot["logs"] = [l for l in logs if l["timetable_slot_id"] == slot["timetable_slot_id"]]
    return slots


@app.get("/timetable/my")
def my_timetable(me=Depends(get_logged_in_teacher)):
    """
    View 1: the logged-in teacher's own timetable.

    It has two parts:
      - the lectures that are permanently theirs, and
      - the one-off classes they agreed to cover for somebody else. Those are
        only on one date, so they are marked with covering_for / covering_date
        and the frontend draws them in a different colour.
    """
    slots = run_query(SLOT_QUERY.format(where="f.faculty_id = %s"), (me["faculty_id"],))
    for slot in slots:
        slot["covering_for"] = None
        slot["covering_date"] = None

    # Which classes did I say yes to covering, and on which date?
    covers = run_query(
        """
        SELECT cr.timetable_slot_id, cr.lecture_date,
               CONCAT(asked.first_name, ' ', asked.last_name) AS cancelled_by
        FROM substitution_assignment sa
        JOIN cancellation_request cr
             ON cr.cancellation_request_id = sa.cancellation_request_id
        JOIN faculty asked ON asked.faculty_id = cr.requested_by_faculty_id
        WHERE sa.substitute_faculty_id = %s AND sa.assignment_status = 'ASSIGNED'
        """,
        (me["faculty_id"],),
    )

    if covers:
        # Fetch all the covered slots in ONE query. Asking for them one at a
        # time meant a separate round trip to the server for each cover.
        ids = [c["timetable_slot_id"] for c in covers]
        placeholders = ",".join(["%s"] * len(ids))
        borrowed_rows = run_query(
            SLOT_QUERY.format(where="ts.timetable_slot_id IN (" + placeholders + ")"),
            tuple(ids),
        )
        by_id = {row["timetable_slot_id"]: row for row in borrowed_rows}

        for cover in covers:
            found = by_id.get(cover["timetable_slot_id"])
            if found is None:
                continue
            borrowed = dict(found)  # a copy, since one slot can be covered twice
            borrowed["covering_for"] = cover["cancelled_by"]
            borrowed["covering_date"] = cover["lecture_date"]
            slots.append(borrowed)

    return add_extra_info(slots)


@app.get("/classes")
def list_classes(me=Depends(get_logged_in_teacher)):
    """The dropdown on the class timetable page."""
    return run_query(
        """
        SELECT s.section_id, s.section_name, b.admission_year,
               p.program_code, p.program_name
        FROM section s
        JOIN academic_batch b ON b.batch_id = s.batch_id
        JOIN program p ON p.program_id = b.program_id
        ORDER BY p.program_code, b.admission_year, s.section_name
        """
    )


@app.get("/timetable/class/{section_id}")
def class_timetable(section_id: int, me=Depends(get_logged_in_teacher)):
    """View 2: the whole week for one class, every teacher and every batch."""
    slots = run_query(SLOT_QUERY.format(where="s.section_id = %s"), (section_id,))
    return add_extra_info(slots)


# ---------------------------------------------------------------------------
# cancelling a lecture + finding a free teacher
# ---------------------------------------------------------------------------
def find_free_teacher(day, start_time, end_time, lecture_date, course_code, skip_ids):
    """
    Finds one teacher who is free in that hour. "Free" means:
      - they are not already teaching something in that hour (any day repeats
        every week, so we only compare day + time), and
      - they are not already covering some other cancelled class on that date.

    Out of all the free teachers we pick the FAIREST one: the teacher who has
    conducted the fewest lectures so far (counted from the lecture_log table).
    If two teachers have taken the same number, the one who already teaches
    that subject is preferred, and after that we just go by name.
    """
    not_these = ",".join(["%s"] * len(skip_ids))
    return run_query_one(
        """
        SELECT f.faculty_id, CONCAT(f.first_name, ' ', f.last_name) AS name,
               (SELECT COUNT(*) FROM lecture_log ll
                WHERE ll.delivered_by_faculty_id = f.faculty_id
                  AND ll.delivery_status = 'DELIVERED') AS lectures_taken
        FROM faculty f
        WHERE f.is_active = 1
          AND f.faculty_id NOT IN (""" + not_these + """)
          AND f.faculty_id NOT IN (
                SELECT fca.faculty_id
                FROM timetable_slot t
                JOIN faculty_course_assignment fca
                     ON fca.faculty_course_assignment_id = t.faculty_course_assignment_id
                WHERE t.day_of_week = %s
                  AND t.start_time < %s AND t.end_time > %s
          )
          AND f.faculty_id NOT IN (
                SELECT sa.substitute_faculty_id
                FROM substitution_assignment sa
                JOIN cancellation_request c2
                     ON c2.cancellation_request_id = sa.cancellation_request_id
                JOIN timetable_slot t2
                     ON t2.timetable_slot_id = c2.timetable_slot_id
                WHERE c2.lecture_date = %s
                  AND sa.assignment_status IN ('PROPOSED', 'ASSIGNED')
                  AND t2.start_time < %s AND t2.end_time > %s
          )
        ORDER BY
          lectures_taken ASC,
          (f.faculty_id IN (SELECT fca2.faculty_id
                            FROM faculty_course_assignment fca2
                            JOIN course c3 ON c3.course_id = fca2.course_id
                            WHERE c3.course_code = %s AND fca2.is_active = 1)) DESC,
          f.first_name
        LIMIT 1
        """,
        tuple(skip_ids) + (day, end_time, start_time, lecture_date, end_time, start_time, course_code),
    )


def rejected_ids(remarks):
    """We keep the list of teachers who said no inside the remarks column,
    like 'rejected:3,7'. That way we do not need a new table for it."""
    if not remarks or "rejected:" not in remarks:
        return []
    return [int(x) for x in remarks.split("rejected:")[1].split(",") if x.strip()]


def list_candidates(slot, lecture_date, my_faculty_id):
    """
    Everybody this class could be handed to, with the facts the teacher needs
    to choose: do they teach this subject, are they free in that hour, and how
    many lectures have they taken so far.

    We deliberately do NOT hide the teachers who do not teach the subject -
    the teacher choosing can see everyone and decide. Teachers of the same
    subject are simply shown first.
    """
    rows = run_query(
        """
        SELECT f.faculty_id,
               CONCAT(f.first_name, ' ', f.last_name) AS name,
               f.employee_code, f.designation,

               -- do they already teach this subject?
               EXISTS (SELECT 1 FROM faculty_course_assignment fca
                       JOIN course c ON c.course_id = fca.course_id
                       WHERE fca.faculty_id = f.faculty_id
                         AND c.course_code = %s AND fca.is_active = 1) AS teaches_subject,

               -- have they taught this exact class (same section) before?
               EXISTS (SELECT 1 FROM timetable_slot t0
                       JOIN faculty_course_assignment fca0
                            ON fca0.faculty_course_assignment_id = t0.faculty_course_assignment_id
                       WHERE fca0.faculty_id = f.faculty_id
                         AND t0.section_course_offering_id = %s) AS knows_this_class,

               -- a class of their own at the same time
               (SELECT COUNT(*) FROM timetable_slot t
                  JOIN faculty_course_assignment fca2
                       ON fca2.faculty_course_assignment_id = t.faculty_course_assignment_id
                 WHERE fca2.faculty_id = f.faculty_id
                   AND t.day_of_week = %s
                   AND t.start_time < %s AND t.end_time > %s) AS own_clashes,

               -- already covering somebody else at the same time on that date
               (SELECT COUNT(*) FROM substitution_assignment sa
                  JOIN cancellation_request c2
                       ON c2.cancellation_request_id = sa.cancellation_request_id
                  JOIN timetable_slot t2 ON t2.timetable_slot_id = c2.timetable_slot_id
                 WHERE sa.substitute_faculty_id = f.faculty_id
                   AND c2.lecture_date = %s
                   AND sa.assignment_status IN ('PROPOSED', 'ASSIGNED')
                   AND t2.start_time < %s AND t2.end_time > %s) AS cover_clashes,

               -- how much work they are already carrying
               (SELECT COUNT(*) FROM lecture_log ll
                 WHERE ll.delivered_by_faculty_id = f.faculty_id
                   AND ll.delivery_status = 'DELIVERED') AS lectures_taken,
               (SELECT COUNT(*) FROM timetable_slot t3
                  JOIN faculty_course_assignment fca3
                       ON fca3.faculty_course_assignment_id = t3.faculty_course_assignment_id
                 WHERE fca3.faculty_id = f.faculty_id) AS weekly_classes
        FROM faculty f
        WHERE f.is_active = 1 AND f.faculty_id <> %s
        ORDER BY teaches_subject DESC, (own_clashes + cover_clashes) ASC,
                 lectures_taken ASC, f.first_name
        """,
        (slot["course_code"], slot["section_course_offering_id"], slot["day_of_week"],
         slot["end_time"], slot["start_time"], lecture_date,
         slot["end_time"], slot["start_time"], my_faculty_id),
    )

    for row in rows:
        row["teaches_subject"] = bool(row["teaches_subject"])
        row["knows_this_class"] = bool(row["knows_this_class"])
        row["is_free"] = (row["own_clashes"] + row["cover_clashes"]) == 0

        # a short human sentence explaining why they are or are not suitable
        if row["own_clashes"] > 0:
            row["reason"] = "Has their own class at this time"
        elif row["cover_clashes"] > 0:
            row["reason"] = "Already covering another class at this time"
        elif row["teaches_subject"] and row["knows_this_class"]:
            row["reason"] = "Teaches " + slot["course_code"] + " to this very class"
        elif row["teaches_subject"]:
            row["reason"] = "Teaches " + slot["course_code"] + " already"
        else:
            row["reason"] = "Free at this time"

    return rows


@app.get("/delegate/candidates")
def delegate_candidates(timetable_slot_id: int, lecture_date: str,
                        me=Depends(get_logged_in_teacher)):
    """The list the teacher picks from when handing over a lecture."""
    slot = run_query_one(SLOT_QUERY.format(where="ts.timetable_slot_id = %s"), (timetable_slot_id,))
    if slot is None:
        raise HTTPException(status_code=404, detail="That lecture does not exist")
    if slot["faculty_id"] != me["faculty_id"]:
        raise HTTPException(status_code=403, detail="You can only hand over your own lectures")

    candidates = list_candidates(slot, lecture_date, me["faculty_id"])
    free_ones = [c for c in candidates if c["is_free"]]
    return {
        "slot": slot,
        "candidates": candidates,
        # who the system would pick if the teacher does not choose
        "suggested_faculty_id": free_ones[0]["faculty_id"] if free_ones else None,
    }


def check_chosen_teacher(faculty_id, slot, lecture_date, my_faculty_id):
    """Makes sure the teacher the user picked is really allowed to take it."""
    if faculty_id == my_faculty_id:
        raise HTTPException(status_code=400, detail="You cannot hand the class to yourself")

    for candidate in list_candidates(slot, lecture_date, my_faculty_id):
        if candidate["faculty_id"] == faculty_id:
            if not candidate["is_free"]:
                raise HTTPException(status_code=400, detail=candidate["reason"])
            return {"faculty_id": faculty_id, "name": candidate["name"],
                    "lectures_taken": candidate["lectures_taken"]}
    raise HTTPException(status_code=404, detail="That teacher was not found")


@app.post("/cancel-lecture")
def cancel_lecture(data: CancelLecture, me=Depends(get_logged_in_teacher)):
    """
    A teacher cancels one of their own lectures on one date. We save the
    cancellation and immediately propose it to a free teacher.
    """
    slot = run_query_one(
        SLOT_QUERY.format(where="ts.timetable_slot_id = %s"), (data.timetable_slot_id,)
    )
    if slot is None:
        raise HTTPException(status_code=404, detail="That lecture does not exist")

    # Rule: you can only cancel your OWN lecture.
    if slot["faculty_id"] != me["faculty_id"]:
        raise HTTPException(status_code=403, detail="You can only cancel your own lectures")

    # The date must actually fall on the day that lecture happens.
    chosen = datetime.date.fromisoformat(data.lecture_date)
    if chosen.weekday() != DAY_NUMBER[slot["day_of_week"]]:
        raise HTTPException(
            status_code=400,
            detail="This lecture is on " + slot["day_of_week"] + ", please pick such a date",
        )

    already = run_query_one(
        "SELECT cancellation_request_id FROM cancellation_request "
        "WHERE timetable_slot_id = %s AND lecture_date = %s",
        (data.timetable_slot_id, data.lecture_date),
    )
    if already is not None:
        raise HTTPException(status_code=400, detail="This lecture is already cancelled on that date")

    request_id = run_update(
        "INSERT INTO cancellation_request "
        "(timetable_slot_id, requested_by_faculty_id, lecture_date, reason, request_status) "
        "VALUES (%s, %s, %s, %s, 'PENDING')",
        (data.timetable_slot_id, me["faculty_id"], data.lecture_date, data.reason),
    )

    if data.delegate_to_faculty_id is not None:
        # The teacher picked somebody from the list themselves.
        free_teacher = check_chosen_teacher(
            data.delegate_to_faculty_id, slot, data.lecture_date, me["faculty_id"]
        )
    else:
        # Nobody picked, so the system chooses the fairest free teacher.
        free_teacher = find_free_teacher(
            slot["day_of_week"], slot["start_time"], slot["end_time"],
            data.lecture_date, slot["course_code"], [me["faculty_id"]],
        )

    if free_teacher is None:
        return {
            "message": "Lecture cancelled, but no other teacher is free at that time.",
            "substitute": None,
        }

    run_update(
        "INSERT INTO substitution_assignment "
        "(cancellation_request_id, substitute_faculty_id, assignment_status, remarks) "
        "VALUES (%s, %s, 'PROPOSED', %s)",
        (request_id, free_teacher["faculty_id"], "rejected:"),
    )
    return {
        "message": (
            "Request sent to " + free_teacher["name"] + " for approval "
            "(free at that time, and has taken only "
            + str(free_teacher["lectures_taken"]) + " lectures so far)."
        ),
        "substitute": free_teacher["name"],
    }


# ---------------------------------------------------------------------------
# approving / rejecting a request
# ---------------------------------------------------------------------------
REQUEST_QUERY = """
    SELECT sa.substitution_assignment_id, sa.assignment_status, sa.remarks,
           sa.substitute_faculty_id,
           cr.cancellation_request_id, cr.lecture_date, cr.reason, cr.request_status,
           cr.requested_by_faculty_id,
           CONCAT(asked.first_name, ' ', asked.last_name) AS cancelled_by,
           CONCAT(sub.first_name, ' ', sub.last_name) AS substitute_name,
           ts.timetable_slot_id, ts.day_of_week, ts.start_time, ts.end_time,
           c.course_code, c.course_name, cr2.room_number,
           s.section_name, lb.lab_batch_code
    FROM substitution_assignment sa
    JOIN cancellation_request cr
         ON cr.cancellation_request_id = sa.cancellation_request_id
    JOIN faculty asked ON asked.faculty_id = cr.requested_by_faculty_id
    JOIN faculty sub   ON sub.faculty_id = sa.substitute_faculty_id
    JOIN timetable_slot ts ON ts.timetable_slot_id = cr.timetable_slot_id
    JOIN section_course_offering sco
         ON sco.section_course_offering_id = ts.section_course_offering_id
    JOIN section s ON s.section_id = sco.section_id
    JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
    JOIN course c  ON c.course_id = pc.course_id
    JOIN classroom cr2 ON cr2.classroom_id = ts.classroom_id
    LEFT JOIN lab_batch lb ON lb.lab_batch_id = ts.lab_batch_id
    WHERE {where}
    ORDER BY cr.lecture_date
"""


@app.get("/requests/incoming")
def requests_for_me(me=Depends(get_logged_in_teacher)):
    """Classes that other teachers want ME to take. I can approve or reject."""
    return run_query(
        REQUEST_QUERY.format(
            where="sa.substitute_faculty_id = %s AND sa.assignment_status = 'PROPOSED'"
        ),
        (me["faculty_id"],),
    )


@app.get("/requests/covering")
def classes_i_am_covering(me=Depends(get_logged_in_teacher)):
    """Classes of other teachers that I agreed to take."""
    return run_query(
        REQUEST_QUERY.format(
            where="sa.substitute_faculty_id = %s AND sa.assignment_status = 'ASSIGNED'"
        ),
        (me["faculty_id"],),
    )


@app.get("/requests/sent")
def requests_i_sent(me=Depends(get_logged_in_teacher)):
    """My own cancelled lectures and who is covering them."""
    return run_query(
        REQUEST_QUERY.format(where="cr.requested_by_faculty_id = %s"), (me["faculty_id"],)
    )


@app.post("/requests/{substitution_id}/approve")
def approve_request(substitution_id: int, me=Depends(get_logged_in_teacher)):
    """I agree to take the class. The timetable now shows my name for it."""
    request = run_query_one(
        REQUEST_QUERY.format(where="sa.substitution_assignment_id = %s"), (substitution_id,)
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if request["substitute_faculty_id"] != me["faculty_id"]:
        raise HTTPException(status_code=403, detail="This request was not sent to you")
    if request["assignment_status"] != "PROPOSED":
        raise HTTPException(status_code=400, detail="This request is already answered")

    run_update(
        "UPDATE substitution_assignment SET assignment_status = 'ASSIGNED' "
        "WHERE substitution_assignment_id = %s",
        (substitution_id,),
    )
    run_update(
        "UPDATE cancellation_request SET request_status = 'APPROVED', "
        "reviewed_by_user_id = %s, reviewed_at = NOW(), review_remarks = %s "
        "WHERE cancellation_request_id = %s",
        (me["user_id"], "Accepted by substitute teacher", request["cancellation_request_id"]),
    )
    return {"message": "You are now taking this class."}


@app.post("/requests/{substitution_id}/reject")
def reject_request(substitution_id: int, me=Depends(get_logged_in_teacher)):
    """
    I cannot take it either. We remember that I said no, and hand the request
    to the next teacher who is free in that hour.
    """
    request = run_query_one(
        REQUEST_QUERY.format(where="sa.substitution_assignment_id = %s"), (substitution_id,)
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if request["substitute_faculty_id"] != me["faculty_id"]:
        raise HTTPException(status_code=403, detail="This request was not sent to you")
    if request["assignment_status"] != "PROPOSED":
        raise HTTPException(status_code=400, detail="This request is already answered")

    said_no = rejected_ids(request["remarks"]) + [me["faculty_id"]]
    skip = said_no + [request["requested_by_faculty_id"]]

    next_teacher = find_free_teacher(
        request["day_of_week"], request["start_time"], request["end_time"],
        request["lecture_date"], request["course_code"], skip,
    )

    if next_teacher is None:
        # Nobody else is free, so the class stays cancelled with no substitute.
        run_update(
            "UPDATE substitution_assignment SET assignment_status = 'CANCELLED', remarks = %s "
            "WHERE substitution_assignment_id = %s",
            ("rejected:" + ",".join(str(i) for i in said_no), substitution_id),
        )
        return {"message": "You rejected it. No other teacher is free, so nobody is assigned."}

    run_update(
        "UPDATE substitution_assignment SET substitute_faculty_id = %s, "
        "assignment_status = 'PROPOSED', remarks = %s "
        "WHERE substitution_assignment_id = %s",
        (
            next_teacher["faculty_id"],
            "rejected:" + ",".join(str(i) for i in said_no),
            substitution_id,
        ),
    )
    return {"message": "You rejected it. The request went to " + next_teacher["name"] + "."}


# ---------------------------------------------------------------------------
# lecture log - the record of which lectures were actually conducted
# ---------------------------------------------------------------------------
def get_logs(slot_ids):
    """Every lecture already marked as conducted on the given slots."""
    if len(slot_ids) == 0:
        return []
    placeholders = ",".join(["%s"] * len(slot_ids))
    return run_query(
        """
        SELECT ll.lecture_log_id, ll.timetable_slot_id, ll.lecture_date,
               ll.actual_hours_taken, ll.delivery_status, ll.remarks,
               ll.delivered_by_faculty_id,
               CONCAT(f.first_name, ' ', f.last_name) AS delivered_by
        FROM lecture_log ll
        JOIN faculty f ON f.faculty_id = ll.delivered_by_faculty_id
        WHERE ll.timetable_slot_id IN (""" + placeholders + """)
        ORDER BY ll.lecture_date
        """,
        tuple(slot_ids),
    )


@app.post("/mark-conducted")
def mark_conducted(data: ConductedLecture, me=Depends(get_logged_in_teacher)):
    """
    The teacher says "I took this class". We save it in lecture_log with the
    number of hours worked out from the slot timing.

    Allowed for the teacher the slot belongs to, and also for a substitute
    whose request was approved for that date.
    """
    slot = run_query_one(
        SLOT_QUERY.format(where="ts.timetable_slot_id = %s"), (data.timetable_slot_id,)
    )
    if slot is None:
        raise HTTPException(status_code=404, detail="That lecture does not exist")

    substitute = run_query_one(
        """
        SELECT sa.substitute_faculty_id
        FROM substitution_assignment sa
        JOIN cancellation_request cr
             ON cr.cancellation_request_id = sa.cancellation_request_id
        WHERE cr.timetable_slot_id = %s AND cr.lecture_date = %s
          AND sa.assignment_status = 'ASSIGNED'
        """,
        (data.timetable_slot_id, data.lecture_date),
    )
    substitute_id = substitute["substitute_faculty_id"] if substitute else None

    if me["faculty_id"] != slot["faculty_id"] and me["faculty_id"] != substitute_id:
        raise HTTPException(status_code=403, detail="This is not your lecture")

    # If the class was given away, only the substitute can mark it conducted.
    if substitute_id is not None and me["faculty_id"] != substitute_id:
        raise HTTPException(
            status_code=400, detail="You cancelled this lecture, the substitute teacher marks it"
        )

    chosen = datetime.date.fromisoformat(data.lecture_date)
    if chosen.weekday() != DAY_NUMBER[slot["day_of_week"]]:
        raise HTTPException(
            status_code=400,
            detail="This lecture is on " + slot["day_of_week"] + ", please pick such a date",
        )

    already = run_query_one(
        "SELECT lecture_log_id FROM lecture_log WHERE timetable_slot_id = %s AND lecture_date = %s",
        (data.timetable_slot_id, data.lecture_date),
    )
    if already is not None:
        raise HTTPException(status_code=400, detail="This lecture is already marked on that date")

    # How long the class is, e.g. "13:30" to "15:30" is 2 hours.
    start_hour, start_minute = [int(x) for x in slot["start_time"].split(":")]
    end_hour, end_minute = [int(x) for x in slot["end_time"].split(":")]
    hours = ((end_hour * 60 + end_minute) - (start_hour * 60 + start_minute)) / 60.0

    run_update(
        "INSERT INTO lecture_log (timetable_slot_id, delivered_by_faculty_id, lecture_date, "
        "actual_hours_taken, delivery_status, remarks) VALUES (%s, %s, %s, %s, 'DELIVERED', %s)",
        (data.timetable_slot_id, me["faculty_id"], data.lecture_date, hours, data.remarks),
    )
    return {"message": "Saved. " + str(hours) + " hour(s) added to your lecture log."}


@app.get("/lecture-log")
def my_lecture_log(me=Depends(get_logged_in_teacher)):
    """Every lecture this teacher has conducted, newest first."""
    return run_query(
        """
        SELECT ll.lecture_log_id, ll.lecture_date, ll.actual_hours_taken,
               ll.delivery_status, ll.remarks,
               ts.day_of_week, ts.start_time, ts.end_time,
               c.course_code, c.course_name, cr.room_number,
               s.section_name, lb.lab_batch_code,
               CONCAT(owner.first_name, ' ', owner.last_name) AS regular_teacher
        FROM lecture_log ll
        JOIN timetable_slot ts ON ts.timetable_slot_id = ll.timetable_slot_id
        JOIN section_course_offering sco
             ON sco.section_course_offering_id = ts.section_course_offering_id
        JOIN section s ON s.section_id = sco.section_id
        JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
        JOIN course c ON c.course_id = pc.course_id
        JOIN classroom cr ON cr.classroom_id = ts.classroom_id
        JOIN faculty_course_assignment fca
             ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
        JOIN faculty owner ON owner.faculty_id = fca.faculty_id
        LEFT JOIN lab_batch lb ON lb.lab_batch_id = ts.lab_batch_id
        WHERE ll.delivered_by_faculty_id = %s
        ORDER BY ll.lecture_date DESC, ts.start_time
        """,
        (me["faculty_id"],),
    )


@app.get("/teacher-load")
def teacher_load(me=Depends(get_logged_in_teacher)):
    """
    How many lectures each teacher has conducted. This is the list the
    substitution algorithm looks at - whoever is at the top of it (fewest
    lectures) and is free at that hour gets the next request.
    """
    return run_query(
        """
        SELECT f.faculty_id, CONCAT(f.first_name, ' ', f.last_name) AS name,
               COUNT(ll.lecture_log_id) AS lectures_taken,
               COALESCE(SUM(ll.actual_hours_taken), 0) AS hours_taken
        FROM faculty f
        LEFT JOIN lecture_log ll
               ON ll.delivered_by_faculty_id = f.faculty_id
              AND ll.delivery_status = 'DELIVERED'
        WHERE f.is_active = 1
        GROUP BY f.faculty_id, name
        ORDER BY lectures_taken ASC, name
        """
    )


# ---------------------------------------------------------------------------
# syllabus - what has actually been taught
# ---------------------------------------------------------------------------
# A theory course is  unit -> topic -> subtopic,  a practical course is a list
# of experiments. The teacher ticks off subtopics / experiments as they finish
# them, and every tick is one row in syllabus_progress.
# ---------------------------------------------------------------------------
@app.get("/syllabus/my-subjects")
def my_subjects(me=Depends(get_logged_in_teacher)):
    """
    Every subject-and-class pair this teacher handles, with how far along the
    syllabus it is. This is the list on the Syllabus page.
    """
    return run_query(
        """
        SELECT DISTINCT
               sco.section_course_offering_id,
               s.section_name, c.course_code, c.course_name, c.course_type,
               c.total_planned_hours,
               v.total_items, v.completed_items, v.percent_complete,
               fn_delivered_hours(sco.section_course_offering_id) AS delivered_hours
        FROM timetable_slot ts
        JOIN section_course_offering sco
             ON sco.section_course_offering_id = ts.section_course_offering_id
        JOIN section s ON s.section_id = sco.section_id
        JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
        JOIN course c ON c.course_id = pc.course_id
        JOIN faculty_course_assignment fca
             ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
        JOIN vw_syllabus_progress v
             ON v.section_course_offering_id = sco.section_course_offering_id
        WHERE fca.faculty_id = %s
        ORDER BY c.course_code, s.section_name
        """,
        (me["faculty_id"],),
    )


@app.get("/syllabus/{section_course_offering_id}")
def syllabus_for_class(section_course_offering_id: int, me=Depends(get_logged_in_teacher)):
    """
    The whole syllabus of one subject for one class, with a tick on whatever
    has already been covered.
    """
    offering = run_query_one(
        """
        SELECT sco.section_course_offering_id, s.section_name,
               c.course_id, c.course_code, c.course_name, c.course_type
        FROM section_course_offering sco
        JOIN section s ON s.section_id = sco.section_id
        JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
        JOIN course c ON c.course_id = pc.course_id
        WHERE sco.section_course_offering_id = %s
        """,
        (section_course_offering_id,),
    )
    if offering is None:
        raise HTTPException(status_code=404, detail="That subject was not found")

    # everything already ticked off for this class
    done = run_query(
        """
        SELECT p.progress_id, p.subtopic_id, p.experiment_id, p.completed_on, p.remarks,
               CONCAT(f.first_name, ' ', f.last_name) AS completed_by
        FROM syllabus_progress p
        JOIN faculty f ON f.faculty_id = p.completed_by_faculty_id
        WHERE p.section_course_offering_id = %s
        """,
        (section_course_offering_id,),
    )
    done_subtopics = {row["subtopic_id"]: row for row in done if row["subtopic_id"]}
    done_experiments = {row["experiment_id"]: row for row in done if row["experiment_id"]}

    units = []
    experiments = []

    if offering["course_type"] == "PRACTICAL":
        for row in run_query(
            "SELECT experiment_id, experiment_number, experiment_title, planned_hours "
            "FROM practical_experiment WHERE course_id = %s ORDER BY experiment_number",
            (offering["course_id"],),
        ):
            row["done"] = done_experiments.get(row["experiment_id"])
            experiments.append(row)
    else:
        # Read the three levels in three queries and stitch them together
        # here. Querying per unit and per topic meant about seventeen round
        # trips to the server for one page.
        units = run_query(
            "SELECT unit_id, unit_number, unit_title, planned_hours "
            "FROM syllabus_unit WHERE course_id = %s ORDER BY unit_number",
            (offering["course_id"],),
        )
        topics = run_query(
            """
            SELECT t.topic_id, t.unit_id, t.topic_number, t.topic_title
            FROM syllabus_topic t
            JOIN syllabus_unit u ON u.unit_id = t.unit_id
            WHERE u.course_id = %s
            ORDER BY t.topic_number
            """,
            (offering["course_id"],),
        )
        subtopics = run_query(
            """
            SELECT st.subtopic_id, st.topic_id, st.subtopic_number, st.subtopic_title
            FROM syllabus_subtopic st
            JOIN syllabus_topic t ON t.topic_id = st.topic_id
            JOIN syllabus_unit u  ON u.unit_id  = t.unit_id
            WHERE u.course_id = %s
            ORDER BY st.subtopic_number
            """,
            (offering["course_id"],),
        )

        for subtopic in subtopics:
            subtopic["done"] = done_subtopics.get(subtopic["subtopic_id"])
        for topic in topics:
            topic["subtopics"] = [s for s in subtopics if s["topic_id"] == topic["topic_id"]]
        for unit in units:
            unit["topics"] = [t for t in topics if t["unit_id"] == unit["unit_id"]]

    progress = run_query_one(
        "SELECT total_items, completed_items, percent_complete FROM vw_syllabus_progress "
        "WHERE section_course_offering_id = %s",
        (section_course_offering_id,),
    )

    return {"offering": offering, "units": units, "experiments": experiments,
            "progress": progress}


def i_teach_this(offering_id, faculty_id):
    """True if this teacher has any class of this subject for this section."""
    row = run_query_one(
        """
        SELECT 1 AS yes FROM timetable_slot ts
        JOIN faculty_course_assignment fca
             ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
        WHERE ts.section_course_offering_id = %s AND fca.faculty_id = %s
        LIMIT 1
        """,
        (offering_id, faculty_id),
    )
    return row is not None


@app.post("/syllabus/mark")
def mark_syllabus(data: MarkSyllabus, me=Depends(get_logged_in_teacher)):
    """Tick off one subtopic or one experiment for this class."""
    if (data.subtopic_id is None) == (data.experiment_id is None):
        raise HTTPException(status_code=400, detail="Send either a subtopic or an experiment")
    if not i_teach_this(data.section_course_offering_id, me["faculty_id"]):
        raise HTTPException(status_code=403, detail="You do not teach this subject to this class")

    already = run_query_one(
        "SELECT progress_id FROM syllabus_progress WHERE section_course_offering_id = %s "
        "AND subtopic_id <=> %s AND experiment_id <=> %s",
        (data.section_course_offering_id, data.subtopic_id, data.experiment_id),
    )
    if already is not None:
        raise HTTPException(status_code=400, detail="This is already marked as covered")

    run_update(
        "INSERT INTO syllabus_progress (section_course_offering_id, subtopic_id, experiment_id, "
        "completed_on, completed_by_faculty_id, remarks) VALUES (%s, %s, %s, %s, %s, %s)",
        (data.section_course_offering_id, data.subtopic_id, data.experiment_id,
         data.completed_on, me["faculty_id"], data.remarks),
    )
    return {"message": "Marked as covered."}


@app.delete("/syllabus/mark/{progress_id}")
def unmark_syllabus(progress_id: int, me=Depends(get_logged_in_teacher)):
    """Undo a tick, in case it was marked by mistake."""
    row = run_query_one(
        "SELECT section_course_offering_id FROM syllabus_progress WHERE progress_id = %s",
        (progress_id,),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    if not i_teach_this(row["section_course_offering_id"], me["faculty_id"]):
        raise HTTPException(status_code=403, detail="You do not teach this subject to this class")

    run_update("DELETE FROM syllabus_progress WHERE progress_id = %s", (progress_id,))
    return {"message": "Unmarked."}


@app.get("/syllabus/{section_course_offering_id}/history")
def syllabus_history(section_course_offering_id: int, me=Depends(get_logged_in_teacher)):
    """
    The lecture history of one subject: every class that was conducted, and
    what was taught in it. This is the "lecture history log".
    """
    return run_query(
        """
        SELECT ll.lecture_log_id, ll.lecture_date, ll.actual_hours_taken, ll.remarks,
               CONCAT(f.first_name, ' ', f.last_name) AS taken_by,
               ts.start_time, ts.end_time, cr.room_number, lb.lab_batch_code,
               GROUP_CONCAT(COALESCE(st.subtopic_title, pe.experiment_title)
                            ORDER BY st.subtopic_title SEPARATOR ' | ') AS covered
        FROM lecture_log ll
        JOIN timetable_slot ts ON ts.timetable_slot_id = ll.timetable_slot_id
        JOIN faculty f ON f.faculty_id = ll.delivered_by_faculty_id
        JOIN classroom cr ON cr.classroom_id = ts.classroom_id
        LEFT JOIN lab_batch lb ON lb.lab_batch_id = ts.lab_batch_id
        LEFT JOIN syllabus_progress p ON p.lecture_log_id = ll.lecture_log_id
        LEFT JOIN syllabus_subtopic st ON st.subtopic_id = p.subtopic_id
        LEFT JOIN practical_experiment pe ON pe.experiment_id = p.experiment_id
        WHERE ts.section_course_offering_id = %s
        GROUP BY ll.lecture_log_id, ll.lecture_date, ll.actual_hours_taken, ll.remarks,
                 taken_by, ts.start_time, ts.end_time, cr.room_number, lb.lab_batch_code
        ORDER BY ll.lecture_date DESC, ts.start_time
        """,
        (section_course_offering_id,),
    )
