"""
Fills in SIMULATED teaching history so the risk dashboard has something to
show. Run it from the backend folder:  python -m scripts.seed_history

Why this exists
---------------
The risk dashboard compares how much of the syllabus a class has covered
against how far through the term it is. With an almost empty lecture_log,
every subject reads "critical", which demonstrates nothing.

This writes a believable term's worth of history: different classes move at
different speeds, so the dashboard shows a real spread from "on track" to
"critical".

THIS IS SIMULATED DATA. It is not a record of real teaching. Wipe it with
    python -m scripts.clear_demo_data
which empties lecture_log, syllabus_progress, cancellations and substitutions.
"""
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import run_query, run_update  # noqa: E402
from app.insight import TERM_START, DAYS  # noqa: E402

TODAY = datetime.date(2026, 9, 28)

# How far through its syllabus each class is, as a percentage. Cycled over the
# subjects so the dashboard shows every band rather than one flat colour.
# Centred on how much of a six month semester has gone by TODAY, so the
# dashboard shows every band rather than one flat colour.
PACES = [52, 44, 40, 47, 33, 38, 26, 43, 20, 35, 9, 29, 48, 39, 6, 31]


def occurrences(day_of_week, upto, weeks):
    """The last few dates this weekly slot actually fell on."""
    target = DAYS.index(day_of_week)
    dates, cursor = [], upto
    while len(dates) < weeks and cursor > TERM_START:
        if cursor.weekday() == target:
            dates.append(cursor)
        cursor -= datetime.timedelta(days=1)
    return dates


def seed_syllabus():
    offerings = run_query(
        """
        SELECT sco.section_course_offering_id AS oid, c.course_id, c.course_type,
               s.section_name, c.course_code
        FROM section_course_offering sco
        JOIN section s ON s.section_id = sco.section_id
        JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
        JOIN course c ON c.course_id = pc.course_id
        ORDER BY sco.section_course_offering_id
        """
    )

    # who teaches each class, so the tick is attributed to a real person
    owner_of = {}
    for row in run_query(
        """
        SELECT DISTINCT ts.section_course_offering_id AS oid, fca.faculty_id
        FROM timetable_slot ts
        JOIN faculty_course_assignment fca
             ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
        """
    ):
        owner_of.setdefault(row["oid"], row["faculty_id"])

    days_gone = (TODAY - TERM_START).days
    added = 0

    for index, offering in enumerate(offerings):
        faculty_id = owner_of.get(offering["oid"])
        if faculty_id is None:
            continue                      # nobody teaches it, nothing to record

        if offering["course_type"] == "PRACTICAL":
            items = run_query(
                "SELECT experiment_id AS id FROM practical_experiment "
                "WHERE course_id = %s ORDER BY experiment_number",
                (offering["course_id"],),
            )
            column = "experiment_id"
        else:
            items = run_query(
                """
                SELECT st.subtopic_id AS id
                FROM syllabus_subtopic st
                JOIN syllabus_topic t ON t.topic_id = st.topic_id
                JOIN syllabus_unit u  ON u.unit_id  = t.unit_id
                WHERE u.course_id = %s
                ORDER BY u.unit_number, t.topic_number, st.subtopic_number
                """,
                (offering["course_id"],),
            )
            column = "subtopic_id"

        if not items:
            continue

        pace = PACES[index % len(PACES)]
        take = round(len(items) * pace / 100)
        chosen = items[:take]
        if not chosen:
            continue

        # spread the completion dates evenly across the term so far
        rows = []
        for position, item in enumerate(chosen):
            day = TERM_START + datetime.timedelta(
                days=int(days_gone * (position + 1) / (len(chosen) + 1))
            )
            rows.append((offering["oid"], item["id"], day.isoformat(), faculty_id))

        values = ",".join(["(%s, %s, %s, %s, 'Simulated history')"] * len(rows))
        flat = [x for row in rows for x in row]
        run_update(
            f"INSERT IGNORE INTO syllabus_progress "
            f"(section_course_offering_id, {column}, completed_on, completed_by_faculty_id, remarks) "
            f"VALUES {values}",
            flat,
        )
        added += len(rows)
        print(f"  {offering['course_code']:6} Sec{offering['section_name']}  {pace}% -> {len(rows)} items")

    print(f"\n  {added} syllabus items marked")


def seed_lecture_log(weeks=5):
    slots = run_query(
        """
        SELECT ts.timetable_slot_id AS id, ts.day_of_week, ts.start_time, ts.end_time,
               fca.faculty_id
        FROM timetable_slot ts
        JOIN faculty_course_assignment fca
             ON fca.faculty_course_assignment_id = ts.faculty_course_assignment_id
        """
    )
    rows = []
    for slot in slots:
        hours = ((int(slot["end_time"][:2]) * 60 + int(slot["end_time"][3:]))
                 - (int(slot["start_time"][:2]) * 60 + int(slot["start_time"][3:]))) / 60
        for day in occurrences(slot["day_of_week"], TODAY - datetime.timedelta(days=1), weeks):
            rows.append((slot["id"], slot["faculty_id"], day.isoformat(), hours))

    # one statement per hundred rows keeps it quick over a remote connection
    for start in range(0, len(rows), 100):
        chunk = rows[start:start + 100]
        values = ",".join(["(%s, %s, %s, %s, 'DELIVERED', 'Simulated history')"] * len(chunk))
        flat = [x for row in chunk for x in row]
        run_update(
            "INSERT IGNORE INTO lecture_log (timetable_slot_id, delivered_by_faculty_id, "
            "lecture_date, actual_hours_taken, delivery_status, remarks) VALUES " + values,
            flat,
        )
    print(f"  {len(rows)} lectures logged across the last {weeks} weeks")


def clear_previous():
    """
    Remove what an earlier run of THIS script wrote, so re-running it does
    not pile history on top of history. Rows a teacher ticked by hand are
    left alone - only our own 'Simulated history' rows go.
    """
    for table in ["syllabus_progress", "lecture_log"]:
        run_update(f"DELETE FROM {table} WHERE remarks = 'Simulated history'")
    print("  cleared anything a previous run of this script wrote")


if __name__ == "__main__":
    print("--- clearing earlier simulated rows ---")
    clear_previous()
    print("\n--- syllabus progress (simulated) ---")
    seed_syllabus()
    print("\n--- lecture log (simulated) ---")
    seed_lecture_log()
    print("\nDone. This is simulated data - clear it with scripts.clear_demo_data")
