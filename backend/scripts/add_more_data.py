"""
Adds more sample data so the timetable actually looks like a real week.

It does NOT change the database structure - no CREATE / ALTER / DROP here,
only INSERTs and calls to the sp_schedule_slot procedure that already exists.

Every statement it runs is also written to docs/DATA_INSERTED.md so we have a
record of exactly what went into the database.

Run it from the backend folder:      python -m scripts.add_more_data
It is safe to run twice - it skips anything that is already there.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import call_procedure, run_query, run_query_one, run_update  # noqa: E402

PROGRAM = "BTECH-AIDS"
YEAR = 2024
BATCH_ID = 1

# Every statement this script needs, in order. We keep the whole list (even
# the ones that were already inserted on an earlier run) so that
# docs/DATA_INSERTED.md always shows the complete set of SQL we used.
statements = []


def remember(sql, values):
    statements.append(readable(sql, values))


def run(sql, values=()):
    """Runs one statement and remembers it for the documentation file."""
    remember(sql, values)
    run_update(sql, values)
    print("OK  ", readable(sql, values)[:110])


def readable(sql, values):
    """Turns the %s placeholders back into real values, just for the doc."""
    text = " ".join(sql.split())
    for value in values:
        if value is None:
            shown = "NULL"
        elif isinstance(value, str):
            shown = "'" + value + "'"
        else:
            shown = str(value)
        text = text.replace("%s", shown, 1)
    return text + ";"


def add_slot(section, lab_batch, course, employee, room, day, start, end):
    """
    Books one timetable slot through the stored procedure, so MySQL itself
    checks that the teacher, the room and the lab batch are all free.
    """
    already = run_query_one(
        """
        SELECT ts.timetable_slot_id
        FROM timetable_slot ts
        JOIN section_course_offering sco
             ON sco.section_course_offering_id = ts.section_course_offering_id
        JOIN section s ON s.section_id = sco.section_id
        JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
        JOIN course c ON c.course_id = pc.course_id
        LEFT JOIN lab_batch lb ON lb.lab_batch_id = ts.lab_batch_id
        WHERE s.section_name = %s AND c.course_code = %s
          AND ts.day_of_week = %s AND ts.start_time = %s
          AND (lb.lab_batch_code = %s OR (lb.lab_batch_code IS NULL AND %s IS NULL))
        """,
        (section, course, day, start, lab_batch, lab_batch),
    )
    call = "CALL sp_schedule_slot(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
    values = (PROGRAM, YEAR, section, lab_batch, course, employee, room, day, start, end)
    remember(call, values)
    if already is not None:
        print("skip ", section, course, day, start, lab_batch or "", "(already there)")
        return
    call_procedure("sp_schedule_slot", values)
    print("OK  ", readable(call, values)[:110])


# ---------------------------------------------------------------------------
# 1. Fill in the rest of the week for the class that already exists (G)
# ---------------------------------------------------------------------------
SECTION_G_SLOTS = [
    # day, start, end, course, teacher, room, lab batch
    ("MON", "10:45:00", "11:45:00", "OSC",   "FAC-ADHAWALE",  "VY115", None),
    ("TUE", "08:30:00", "09:30:00", "DBMS",  "FAC-SBETGERI",  "VY115", None),
    ("TUE", "09:30:00", "10:30:00", "OSC",   "FAC-ADHAWALE",  "VY115", None),
    ("TUE", "10:45:00", "11:45:00", "DS1",   "FAC-MPATIL",    "VY115", None),
    ("TUE", "11:45:00", "12:45:00", "SCHIE", "FAC-RUMALE",    "VY103", None),
    ("WED", "08:30:00", "09:30:00", "CNM",   "FAC-RSHROFF",   "VY103", None),
    ("WED", "09:30:00", "10:30:00", "DS1",   "FAC-MPATIL",    "VY115", None),
    ("WED", "10:45:00", "11:45:00", "DBMS",  "FAC-SBETGERI",  "VY115", None),
    ("WED", "11:45:00", "12:45:00", "OSC",   "FAC-ADHAWALE",  "VY115", None),
    ("THU", "10:45:00", "11:45:00", "CNM",   "FAC-RSHROFF",   "VY103", None),
    ("THU", "11:45:00", "12:45:00", "SCHIE", "FAC-RUMALE",    "VY103", None),
    ("FRI", "08:30:00", "09:30:00", "DBMS",  "FAC-SBETGERI",  "VY115", None),
    ("FRI", "09:30:00", "10:30:00", "DS1",   "FAC-MPATIL",    "VY115", None),
    ("FRI", "10:45:00", "11:45:00", "OSC",   "FAC-ADHAWALE",  "VY115", None),
    ("FRI", "11:45:00", "12:45:00", "ESD",   "FAC-ATAWARI",   "VY303", None),
    ("FRI", "13:30:00", "15:30:00", "DBMSL", "FAC-SMITKARI",  "VY127", "G1"),
    ("FRI", "13:30:00", "15:30:00", "OOPL",  "FAC-PBHOSALE",  "VY126", "G2"),
    ("FRI", "13:30:00", "15:30:00", "DSL",   "FAC-SKARANDE",  "VY030", "G3"),
]

# ---------------------------------------------------------------------------
# 2. A second class (section H) so the "class timetable" page has a choice.
#    H has its labs in the morning and its lectures late afternoon, because
#    the teachers are busy with section G in between.
# ---------------------------------------------------------------------------
SECTION_H_SLOTS = [
    ("MON", "08:30:00", "10:30:00", "DBMSL", "FAC-SMITKARI",  "VY127", "H1"),
    ("MON", "08:30:00", "10:30:00", "OOPL",  "FAC-PBHOSALE",  "VY126", "H2"),
    ("MON", "08:30:00", "10:30:00", "DSL",   "FAC-AKULKARNI", "VY030", "H3"),
    ("MON", "15:45:00", "16:45:00", "DS1",   "FAC-MPATIL",    "VY115", None),
    ("MON", "16:45:00", "17:45:00", "DBMS",  "FAC-SBETGERI",  "VY115", None),
    ("TUE", "08:30:00", "10:30:00", "OOPL",  "FAC-PBHOSALE",  "VY126", "H1"),
    ("TUE", "08:30:00", "10:30:00", "DSL",   "FAC-SKARANDE",  "VY030", "H2"),
    ("TUE", "08:30:00", "10:30:00", "DBMSL", "FAC-SMITKARI",  "VY127", "H3"),
    ("TUE", "15:45:00", "16:45:00", "OSC",   "FAC-ADHAWALE",  "VY115", None),
    ("TUE", "16:45:00", "17:45:00", "CNM",   "FAC-RSHROFF",   "VY103", None),
    ("WED", "08:30:00", "10:30:00", "DSL",   "FAC-AKULKARNI", "VY030", "H1"),
    ("WED", "08:30:00", "10:30:00", "DBMSL", "FAC-SMITKARI",  "VY127", "H2"),
    ("WED", "08:30:00", "10:30:00", "OOPL",  "FAC-PBHOSALE",  "VY126", "H3"),
    ("WED", "15:45:00", "16:45:00", "DBMS",  "FAC-SBETGERI",  "VY115", None),
    ("WED", "16:45:00", "17:45:00", "DS1",   "FAC-MPATIL",    "VY115", None),
    ("THU", "08:30:00", "10:30:00", "OSCL",  "FAC-ADHAWALE",  "VY225", "H1"),
    ("THU", "15:45:00", "16:45:00", "CNM",   "FAC-RSHROFF",   "VY103", None),
    ("THU", "16:45:00", "17:45:00", "SCHIE", "FAC-RUMALE",    "VY103", None),
    ("FRI", "08:30:00", "10:30:00", "OSCL",  "FAC-ADHAWALE",  "VY225", "H2"),
    ("FRI", "08:30:00", "10:30:00", "OSCL",  "FAC-ATAWARI",   "VY330", "H3"),
    ("FRI", "15:45:00", "16:45:00", "OSC",   "FAC-ADHAWALE",  "VY115", None),
    ("FRI", "16:45:00", "17:45:00", "ESD",   "FAC-ATAWARI",   "VY303", None),
]


def make_section_h():
    """Creates section H, its three lab batches and its course offerings."""
    insert_section = "INSERT INTO section (batch_id, section_name, student_count) VALUES (%s, %s, %s)"
    section = run_query_one("SELECT section_id FROM section WHERE section_name = 'H'")
    if section is None:
        run(insert_section, (BATCH_ID, "H", 60))
        section = run_query_one("SELECT section_id FROM section WHERE section_name = 'H'")
    else:
        remember(insert_section, (BATCH_ID, "H", 60))
    section_id = section["section_id"]

    for code in ["H1", "H2", "H3"]:
        exists = run_query_one(
            "SELECT lab_batch_id FROM lab_batch WHERE section_id = %s AND lab_batch_code = %s",
            (section_id, code),
        )
        if exists is None:
            run("INSERT INTO lab_batch (section_id, lab_batch_code) VALUES (%s, %s)", (section_id, code))
        else:
            remember("INSERT INTO lab_batch (section_id, lab_batch_code) VALUES (%s, %s)", (section_id, code))

    # Section H studies the same subjects as section G.
    for row in run_query("SELECT curriculum_id FROM program_curriculum ORDER BY curriculum_id"):
        exists = run_query_one(
            "SELECT section_course_offering_id FROM section_course_offering "
            "WHERE section_id = %s AND curriculum_id = %s",
            (section_id, row["curriculum_id"]),
        )
        offering_sql = "INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (%s, %s)"
        if exists is None:
            run(offering_sql, (section_id, row["curriculum_id"]))
        else:
            remember(offering_sql, (section_id, row["curriculum_id"]))
    return section_id


def give_tiwari_the_os_lab():
    """
    Only one teacher was allowed to take the OS lab, which is not enough for
    two classes. We let Anand Tiwari take it as well.
    """
    exists = run_query_one(
        """
        SELECT fca.faculty_course_assignment_id
        FROM faculty_course_assignment fca
        JOIN faculty f ON f.faculty_id = fca.faculty_id
        JOIN course c ON c.course_id = fca.course_id
        WHERE f.employee_code = 'FAC-ATAWARI' AND c.course_code = 'OSCL'
        """
    )
    sql = (
        "INSERT INTO faculty_course_assignment (faculty_id, course_id, assigned_on, is_active) "
        "SELECT f.faculty_id, c.course_id, CURDATE(), 1 FROM faculty f, course c "
        "WHERE f.employee_code = %s AND c.course_code = %s"
    )
    if exists is not None:
        remember(sql, ("FAC-ATAWARI", "OSCL"))
        return
    run(sql, ("FAC-ATAWARI", "OSCL"))


def write_doc():
    folder = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "docs")
    folder = os.path.abspath(folder)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "DATA_INSERTED.md")

    lines = [
        "# SQL run against the database",
        "",
        "These are all the statements `backend/scripts/add_more_data.py` executed to",
        "make the timetable usable. **No table structure was changed** - there is no",
        "CREATE, ALTER or DROP here, only INSERTs and calls to the `sp_schedule_slot`",
        "procedure that was already in the database.",
        "",
        "`sp_schedule_slot` is what actually inserts into `timetable_slot`. We used it",
        "instead of a plain INSERT because the procedure itself refuses a booking if",
        "the teacher, the room or the lab batch is already busy in that hour.",
        "",
        "```sql",
    ]
    lines.extend(statements)
    lines.append("```")
    lines.extend([
        "",
        "## What this added",
        "",
        "* The rest of the week for **section G** - it only had Monday to Thursday",
        "  mornings before, now it runs Monday to Friday.",
        "* A whole second class, **section H**, with its own three lab batches",
        "  (H1, H2, H3) and its own timetable, so the Class Timetable page has",
        "  more than one class to choose from. Section H has its labs in the",
        "  morning and its lectures late afternoon, because the teachers are busy",
        "  with section G in between.",
        "* One extra `faculty_course_assignment` so that Anand Tiwari can also",
        "  take the OS lab - one teacher was not enough for two classes.",
        "",
        "## Clearing the demo data",
        "",
        "`backend/scripts/clear_demo_data.py` empties `cancellation_request`,",
        "`substitution_assignment` and `lecture_log` if you want to start a demo",
        "from scratch. It does not touch the timetable or the logins.",
    ])
    with open(path, "w") as handle:
        handle.write("\n".join(lines) + "\n")
    print("\nWrote", path, "with", len(statements), "statements")


if __name__ == "__main__":
    print("--- section G: filling in the rest of the week ---")
    for day, start, end, course, teacher, room, lab in SECTION_G_SLOTS:
        add_slot("G", lab, course, teacher, room, day, start, end)

    print("\n--- creating section H ---")
    make_section_h()
    give_tiwari_the_os_lab()

    print("\n--- section H: its timetable ---")
    for day, start, end, course, teacher, room, lab in SECTION_H_SLOTS:
        add_slot("H", lab, course, teacher, room, day, start, end)

    write_doc()
