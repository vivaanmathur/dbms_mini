"""
Wipes the database and loads the starting data.

    cd backend && .venv/bin/python -m scripts.seed

WHAT IS REAL
------------
Everything about SY AI&DS G comes from the timetable in
sql/legacy/02_sample_data_live.sql: the ten faculty, the twelve subjects, the
ten rooms and the sixteen weekly sessions. Who teaches which class or batch
is read straight off those sessions.

That timetable is incomplete — no Friday, and OSC, SCHIE, RIDE and UE1 have
no sessions at all. It is loaded exactly as it is. An administrator fills in
the rest from the Timetable editor; nothing here invents sessions to make the
week look fuller.

WHAT IS NOT REAL
----------------
  * The syllabus units, topics and experiments are a starting TEMPLATE for
    each subject, meant to be corrected by the teachers who teach it.
  * Four DEMO accounts exist so each dashboard can be seen before real people
    are given roles: an administrator, a programme director, a coordinator
    (who is also year coordinator and class teacher, to show one person with
    several roles) and a student. Their names say "Demo" and their emails
    end in @continuity.local.

Nobody real is given a leadership role here — who the class teacher or year
coordinator actually is was not in the source data. Assign real people from
Admin -> People -> Roles.

Every seeded account starts with the same temporary password and must
change it at first sign-in. It is written to SEED_CREDENTIALS.local.md,
which git ignores.
"""
import os
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import transaction  # noqa: E402
from app.security import hash_password  # noqa: E402
from scripts.syllabus_data import PRACTICAL, THEORY  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)

# Every table, children before parents, so TRUNCATE never trips a foreign key.
TABLES = [
    "audit_log", "syllabus_progress", "lecture_log", "makeup_session",
    "cover_request", "cancellation", "timetable_slot", "teaching_assignment",
    "subject_offering", "practical_experiment", "syllabus_subtopic",
    "syllabus_topic", "syllabus_unit", "subject", "role_assignment",
    "app_user", "student", "staff", "room", "lab_batch", "section",
    "period", "academic_term", "program", "department",
]

FACULTY = [
    # employee code, first, last, email  — from the source data
    ("FAC-SBETGERI", "Santushti", "Betgeri", "santushti.betgeri@mitwpu.edu.in"),
    ("FAC-SMITKARI", "Shoma", "Mitkari", "shoma.mitkari@mitwpu.edu.in"),
    ("FAC-PBHOSALE", "Poonam", "Bhosale", "poonam.bhosale@mitwpu.edu.in"),
    ("FAC-MPATIL", "Manisha", "Patil", "manisha.patil@mitwpu.edu.in"),
    ("FAC-AKULKARNI", "Anushree", "Kulkarni", "anushree.kulkarni@mitwpu.edu.in"),
    ("FAC-SKARANDE", "Shridevi", "Karande", "shridevi.karande@mitwpu.edu.in"),
    ("FAC-ADHAWALE", "Anand", "Dhawale", "anand.dhawale@mitwpu.edu.in"),
    ("FAC-ATAWARI", "Anand", "Tiwari", "anand.tiwari@mitwpu.edu.in"),
    ("FAC-RSHROFF", "Rupal", "Shroff", "rupal.shroff@mitwpu.edu.in"),
    ("FAC-RUMALE", "Rashmi", "Umale", "rashmi.umale@mitwpu.edu.in"),
]

SUBJECTS = [
    # code, name, type, planned hours, credits — from the source data
    ("DBMS", "Database Management Systems", "THEORY", 45, 3),
    ("DBMSL", "Database Management Systems Laboratory", "PRACTICAL", 30, 1),
    ("OOPL", "Object Oriented Programming Laboratory", "PRACTICAL", 30, 1),
    ("DS1", "Data Structures I", "THEORY", 45, 3),
    ("DSL", "Data Structures I Laboratory", "PRACTICAL", 30, 1),
    ("OSC", "Operating System Concepts", "THEORY", 45, 3),
    ("OSCL", "Operating System Concepts Laboratory", "PRACTICAL", 30, 1),
    ("ESD", "Employability and Life Skills Development Training Programme", "THEORY", 20, 1),
    ("CNM", "Calculus and Numerical Methods", "THEORY", 45, 3),
    ("SCHIE", "Spiritual and Cultural Heritage Indian Experience", "THEORY", 22, 1),
    ("RIDE", "Research Innovation Design Entrepreneurship", "PRACTICAL", 15, 1),
    ("UE1", "University Elective I", "THEORY", 30, 2),
]

ROOMS = [
    # code, building, floor, capacity, type, concurrent groups — from the source data
    ("VY115", "VY", "1", 60, "LECTURE", 1), ("VY103", "VY", "1", 60, "LECTURE", 1),
    ("VY114", "VY", "1", 60, "LECTURE", 1), ("VY201", "VY", "2", 60, "LECTURE", 1),
    ("VY303", "VY", "3", 60, "LECTURE", 1), ("VY030", "VY", "0", 60, "LAB", 2),
    ("VY126", "VY", "1", 30, "LAB", 1), ("VY127", "VY", "1", 30, "LAB", 1),
    ("VY225", "VY", "2", 30, "LAB", 1), ("VY330", "VY", "3", 30, "LAB", 1),
]

# The college day. Labs run across two consecutive periods.
PERIODS = [
    ("P1", "08:30", "09:30"), ("P2", "09:30", "10:30"), ("P3", "10:45", "11:45"),
    ("P4", "11:45", "12:45"), ("P5", "13:30", "14:30"), ("P6", "14:30", "15:30"),
    ("P7", "15:45", "16:45"), ("P8", "16:45", "17:45"),
]

# The real timetable for SY AI&DS G — all sixteen sessions, nothing added.
TIMETABLE = [
    # day,  start,   end,     subject, batch, teacher,         room
    ("MON", "08:30", "09:30", "DS1",   None, "FAC-MPATIL",    "VY115"),
    ("MON", "09:30", "10:30", "DBMS",  None, "FAC-SBETGERI",  "VY115"),
    ("MON", "11:45", "12:45", "CNM",   None, "FAC-RSHROFF",   "VY103"),
    ("MON", "13:30", "15:30", "DSL",   "G1", "FAC-AKULKARNI", "VY030"),
    ("MON", "13:30", "15:30", "OOPL",  "G2", "FAC-PBHOSALE",  "VY126"),
    ("MON", "13:30", "15:30", "DBMSL", "G3", "FAC-SMITKARI",  "VY127"),
    ("TUE", "13:30", "15:30", "OOPL",  "G1", "FAC-PBHOSALE",  "VY126"),
    ("TUE", "13:30", "15:30", "DBMSL", "G2", "FAC-SBETGERI",  "VY127"),
    ("TUE", "13:30", "15:30", "OSCL",  "G3", "FAC-ADHAWALE",  "VY330"),
    ("WED", "13:30", "15:30", "DSL",   "G1", "FAC-AKULKARNI", "VY030"),
    ("WED", "13:30", "15:30", "OSCL",  "G2", "FAC-ADHAWALE",  "VY225"),
    ("WED", "13:30", "15:30", "DSL",   "G3", "FAC-MPATIL",    "VY030"),
    ("THU", "08:30", "10:30", "ESD",   None, "FAC-ATAWARI",   "VY303"),
    ("THU", "13:30", "15:30", "OSCL",  "G1", "FAC-ADHAWALE",  "VY225"),
    ("THU", "13:30", "15:30", "DSL",   "G2", "FAC-SKARANDE",  "VY030"),
    ("THU", "13:30", "15:30", "OOPL",  "G3", "FAC-PBHOSALE",  "VY126"),
]

# Assignments the source data records (in its faculty_course_assignment table)
# but for which the timetable captured no session.
ASSIGNED_WITHOUT_SESSIONS = [
    ("OSC", None, "FAC-ADHAWALE"),
    ("SCHIE", None, "FAC-RUMALE"),
]

DEMO_STAFF = [
    # code, first, last, email, roles
    ("DEMO-ADMIN", "Demo", "Administrator", "admin@continuity.local", ["ADMIN"]),
    ("DEMO-DIRECTOR", "Demo", "Director", "director@continuity.local", ["PROGRAM_DIRECTOR"]),
    ("DEMO-COORD", "Demo", "Coordinator", "coordinator@continuity.local",
     ["PROGRAM_COORDINATOR", "YEAR_COORDINATOR", "CLASS_TEACHER"]),
]


def wipe(tx):
    tx.execute("SET FOREIGN_KEY_CHECKS = 0")
    for table in TABLES:
        tx.execute(f"TRUNCATE TABLE {table}")
    tx.execute("SET FOREIGN_KEY_CHECKS = 1")
    print(f"  wiped {len(TABLES)} tables")


def seed(tx, temp_password):
    password_hash = hash_password(temp_password)

    # --- organisation -------------------------------------------------------
    dept = tx.execute(
        "INSERT INTO department (code, name) VALUES (%s, %s)",
        ("DCET", "Department of Computer Engineering and Technology"))
    program = tx.execute(
        "INSERT INTO program (department_id, code, name, short_name, degree_level, duration_years) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (dept, "BTECH-AIDS", "B.Tech in Artificial Intelligence and Data Science",
         "AI&DS", "UNDERGRADUATE", 5))   # 5 years, as the source data has it
    term = tx.execute(
        "INSERT INTO academic_term (name, start_date, end_date, is_current) VALUES (%s, %s, %s, TRUE)",
        ("2026-27 Odd Semester", "2026-07-20", "2027-01-15"))
    for order, (label, start, end) in enumerate(PERIODS, start=1):
        tx.execute("INSERT INTO period (label, start_time, end_time, sort_order) VALUES (%s, %s, %s, %s)",
                   (label, start, end, order))
    print("  department, programme, term, periods")

    # --- the class ----------------------------------------------------------
    section = tx.execute(
        "INSERT INTO section (program_id, year_of_study, division, academic_year) VALUES (%s, 2, 'G', '2026-27')",
        (program,))
    batches = {}
    for code in ("G1", "G2", "G3"):
        batches[code] = tx.execute(
            "INSERT INTO lab_batch (section_id, code) VALUES (%s, %s)", (section, code))
    print("  SY AI&DS G (2026-27) with batches G1, G2, G3")

    rooms = {}
    for code, building, floor, capacity, kind, groups in ROOMS:
        rooms[code] = tx.execute(
            "INSERT INTO room (code, building, floor, capacity, room_type, concurrent_capacity) "
            "VALUES (%s, %s, %s, %s, %s, %s)", (code, building, floor, capacity, kind, groups))
    print(f"  {len(rooms)} rooms")

    # --- people -------------------------------------------------------------
    staff = {}
    for code, first, last, email in FACULTY:
        staff[code] = tx.execute(
            "INSERT INTO staff (department_id, employee_code, first_name, last_name, email, designation) "
            "VALUES (%s, %s, %s, %s, %s, 'Faculty')", (dept, code, first, last, email))
        tx.execute("INSERT INTO role_assignment (staff_id, role) VALUES (%s, 'FACULTY')", (staff[code],))
        tx.execute(
            "INSERT INTO app_user (email, password_hash, staff_id, must_change_password) VALUES (%s, %s, %s, TRUE)",
            (email, password_hash, staff[code]))
    print(f"  {len(FACULTY)} faculty, each with a login")

    for code, first, last, email, roles in DEMO_STAFF:
        staff[code] = tx.execute(
            "INSERT INTO staff (department_id, employee_code, first_name, last_name, email, designation) "
            "VALUES (%s, %s, %s, %s, %s, 'Demo account')", (dept, code, first, last, email))
        tx.execute(
            "INSERT INTO app_user (email, password_hash, staff_id, must_change_password) VALUES (%s, %s, %s, TRUE)",
            (email, password_hash, staff[code]))
        for role in roles:
            scope = {
                "ADMIN": (None, None, None, None),
                "PROGRAM_DIRECTOR": (dept, None, None, None),
                "PROGRAM_COORDINATOR": (None, program, None, None),
                "YEAR_COORDINATOR": (None, program, 2, None),
                "CLASS_TEACHER": (None, None, None, section),
            }[role]
            tx.execute(
                "INSERT INTO role_assignment (staff_id, role, department_id, program_id, year_of_study, section_id) "
                "VALUES (%s, %s, %s, %s, %s, %s)", (staff[code], role) + scope)

    demo_student = tx.execute(
        "INSERT INTO student (section_id, lab_batch_id, prn, roll_no, first_name, last_name, email) "
        "VALUES (%s, %s, 'DEMO-0001', '1', 'Demo', 'Student', 'student@continuity.local')",
        (section, batches["G1"]))
    tx.execute(
        "INSERT INTO app_user (email, password_hash, student_id, must_change_password) VALUES (%s, %s, %s, TRUE)",
        ("student@continuity.local", password_hash, demo_student))
    print("  4 demo accounts: admin, director, coordinator (3 roles), student")

    # --- subjects and who teaches them --------------------------------------
    subjects, offerings = {}, {}
    for code, name, kind, hours, credits in SUBJECTS:
        subjects[code] = tx.execute(
            "INSERT INTO subject (program_id, code, name, subject_type, planned_hours, credits) "
            "VALUES (%s, %s, %s, %s, %s, %s)", (program, code, name, kind, hours, credits))
        offerings[code] = tx.execute(
            "INSERT INTO subject_offering (subject_id, section_id, term_id) VALUES (%s, %s, %s)",
            (subjects[code], section, term))
    print(f"  {len(subjects)} subjects, each offered to SY AI&DS G")

    # one assignment per (subject, batch) — read off the real timetable
    assignments = {}
    wanted = [(s, b, t) for _, _, _, s, b, t, _ in TIMETABLE] + ASSIGNED_WITHOUT_SESSIONS
    for subject_code, batch, teacher in wanted:
        key = (subject_code, batch)
        if key in assignments:
            continue
        assignments[key] = tx.execute(
            "INSERT INTO teaching_assignment (offering_id, lab_batch_id, staff_id) VALUES (%s, %s, %s)",
            (offerings[subject_code], batches.get(batch), staff[teacher]))
    print(f"  {len(assignments)} teaching assignments")

    # every session goes through sp_save_slot, so the database itself checks
    # for clashes exactly as it will for anything added later
    for day, start, end, subject_code, batch, _teacher, room in TIMETABLE:
        tx.call("sp_save_slot", (None, assignments[(subject_code, batch)], rooms[room], day, start, end))
    print(f"  {len(TIMETABLE)} timetable sessions (all passed the clash checks)")

    # --- syllabus template --------------------------------------------------
    items = 0
    for code, units in THEORY.items():
        for unit_number, title, hours, topics in units:
            unit = tx.execute(
                "INSERT INTO syllabus_unit (subject_id, unit_number, title, planned_hours) VALUES (%s, %s, %s, %s)",
                (subjects[code], unit_number, title, hours))
            for topic_number, (topic_title, subs) in enumerate(topics, start=1):
                topic = tx.execute(
                    "INSERT INTO syllabus_topic (unit_id, topic_number, title) VALUES (%s, %s, %s)",
                    (unit, topic_number, topic_title))
                for n, sub_title in enumerate(subs, start=1):
                    tx.execute(
                        "INSERT INTO syllabus_subtopic (topic_id, subtopic_number, title) VALUES (%s, %s, %s)",
                        (topic, n, sub_title))
                    items += 1
    for code, experiments in PRACTICAL.items():
        for n, title in enumerate(experiments, start=1):
            tx.execute(
                "INSERT INTO practical_experiment (subject_id, experiment_number, title) VALUES (%s, %s, %s)",
                (subjects[code], n, title))
            items += 1
    print(f"  syllabus template: {items} subtopics and experiments")

    tx.execute(
        "INSERT INTO audit_log (user_id, action, entity, summary) VALUES (NULL, 'SEED', 'database', %s)",
        ("Database reset and loaded with SY AI&DS G (2026-27)",))


def write_credentials(temp_password):
    path = os.path.join(BACKEND, "SEED_CREDENTIALS.local.md")
    lines = [
        "# Seeded accounts — LOCAL ONLY, never commit",
        "",
        "Every account below starts with this temporary password and must",
        "choose a new one at first sign-in:",
        "",
        f"    {temp_password}",
        "",
        "## Demo accounts",
        "",
        "| Email | What you see |",
        "|---|---|",
        "| admin@continuity.local | Administrator — manages everything |",
        "| director@continuity.local | Programme Director — the whole department |",
        "| coordinator@continuity.local | Programme Coordinator + Year Coordinator + Class Teacher of SY G |",
        "| student@continuity.local | Student in SY AI&DS G, batch G1 |",
        "",
        "## Faculty (real people, from the source data)",
        "",
    ]
    lines += [f"- {email}" for _, _, _, email in FACULTY]
    with open(path, "w") as handle:
        handle.write("\n".join(lines) + "\n")
    return path


if __name__ == "__main__":
    temp_password = "Continuity-" + secrets.token_hex(3) + "7"
    print("--- resetting the database ---")
    with transaction() as tx:
        wipe(tx)
        seed(tx, temp_password)
    path = write_credentials(temp_password)
    print(f"\nDone. Sign-in details are in {os.path.relpath(path)} (git ignores it).")
