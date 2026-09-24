"""
Creates the new syllabus tables and fills them with the real syllabus.

Run it from the backend folder:   python -m scripts.setup_syllabus

- The tables come from sql/03_syllabus.sql (CREATE TABLE IF NOT EXISTS, so
  running this twice is safe and never wipes anything).
- The content comes from scripts/syllabus_data.py.
- Every statement it runs is written to docs/DATABASE_CHANGES.md.

It only ADDS things. It never drops or alters a table that was already there.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import run_query, run_query_one, run_update  # noqa: E402
from scripts.syllabus_data import PRACTICAL, THEORY  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
PROJECT = os.path.dirname(BACKEND)

created_tables = []
inserted = []


def split_sql(text):
    """Cuts a .sql file into single statements and throws away the comments."""
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("--") or stripped == "":
            continue
        lines.append(line)
    statements = []
    for piece in "\n".join(lines).split(";"):
        if piece.strip():
            statements.append(piece.strip())
    return statements


def readable(sql, values):
    text = " ".join(sql.split())
    for value in values:
        if value is None:
            shown = "NULL"
        elif isinstance(value, str):
            shown = "'" + value.replace("'", "''") + "'"
        else:
            shown = str(value)
        text = text.replace("%s", shown, 1)
    return text + ";"


def insert(sql, values):
    """Runs an INSERT and remembers it for the documentation file."""
    inserted.append(readable(sql, values))
    return run_update(sql, values)


def remember_only(sql, values):
    """The row is already in the database from an earlier run, but it still
    belongs in the documentation - that is the SQL we used to put it there."""
    inserted.append(readable(sql, values))


def create_tables():
    path = os.path.join(BACKEND, "sql", "03_syllabus.sql")
    with open(path) as handle:
        statements = split_sql(handle.read())

    for statement in statements:
        if statement.upper().startswith("USE "):
            continue  # we are already connected to the right database
        run_update(statement)
        created_tables.append(statement + ";")
        first_line = " ".join(statement.split())[:80]
        print("OK  ", first_line)


def course_id_of(course_code):
    row = run_query_one("SELECT course_id FROM course WHERE course_code = %s", (course_code,))
    return row["course_id"] if row else None


def fill_theory():
    for course_code, units in THEORY.items():
        course_id = course_id_of(course_code)
        if course_id is None:
            print("skip  no such course:", course_code)
            continue

        for unit_number, unit_title, hours, topics in units:
            unit = run_query_one(
                "SELECT unit_id FROM syllabus_unit WHERE course_id = %s AND unit_number = %s",
                (course_id, unit_number),
            )
            if unit is None:
                unit_id = insert(
                    "INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) "
                    "VALUES (%s, %s, %s, %s)",
                    (course_id, unit_number, unit_title, hours),
                )
            else:
                unit_id = unit["unit_id"]
                remember_only(
                    "INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) "
                    "VALUES (%s, %s, %s, %s)",
                    (course_id, unit_number, unit_title, hours),
                )

            for topic_number, (topic_title, subtopics) in enumerate(topics, start=1):
                topic = run_query_one(
                    "SELECT topic_id FROM syllabus_topic WHERE unit_id = %s AND topic_number = %s",
                    (unit_id, topic_number),
                )
                if topic is None:
                    topic_id = insert(
                        "INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) "
                        "VALUES (%s, %s, %s)",
                        (unit_id, topic_number, topic_title),
                    )
                else:
                    topic_id = topic["topic_id"]
                    remember_only(
                        "INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) "
                        "VALUES (%s, %s, %s)",
                        (unit_id, topic_number, topic_title),
                    )

                for sub_number, subtopic_title in enumerate(subtopics, start=1):
                    exists = run_query_one(
                        "SELECT subtopic_id FROM syllabus_subtopic "
                        "WHERE topic_id = %s AND subtopic_number = %s",
                        (topic_id, sub_number),
                    )
                    subtopic_sql = (
                        "INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) "
                        "VALUES (%s, %s, %s)"
                    )
                    if exists is None:
                        insert(subtopic_sql, (topic_id, sub_number, subtopic_title))
                    else:
                        remember_only(subtopic_sql, (topic_id, sub_number, subtopic_title))
        print("OK   syllabus for", course_code)


def fill_practical():
    for course_code, experiments in PRACTICAL.items():
        course_id = course_id_of(course_code)
        if course_id is None:
            print("skip  no such course:", course_code)
            continue
        for number, title in enumerate(experiments, start=1):
            exists = run_query_one(
                "SELECT experiment_id FROM practical_experiment "
                "WHERE course_id = %s AND experiment_number = %s",
                (course_id, number),
            )
            experiment_sql = (
                "INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) "
                "VALUES (%s, %s, %s)"
            )
            if exists is None:
                insert(experiment_sql, (course_id, number, title))
            else:
                remember_only(experiment_sql, (course_id, number, title))
        print("OK   experiments for", course_code)


def write_doc():
    folder = os.path.join(PROJECT, "docs")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "DATABASE_CHANGES.md")

    counts = run_query(
        """
        SELECT (SELECT COUNT(*) FROM syllabus_unit) AS units,
               (SELECT COUNT(*) FROM syllabus_topic) AS topics,
               (SELECT COUNT(*) FROM syllabus_subtopic) AS subtopics,
               (SELECT COUNT(*) FROM practical_experiment) AS experiments
        """
    )[0]

    lines = [
        "# Database changes for the syllabus feature",
        "",
        "Everything below was run against the live database by",
        "`backend/scripts/setup_syllabus.py`. It is all **additive**: five new",
        "tables and one new view. No existing table, view, function or stored",
        "procedure was altered or dropped, so every feature built before this",
        "still works exactly as it did.",
        "",
        "## Why new tables were needed",
        "",
        "The old schema could say *how many hours* of a course had been",
        "delivered, but it had nowhere to record *what was actually taught*.",
        "Tracking units, topics and subtopics (and experiment numbers for the",
        "labs) needs its own tables.",
        "",
        "## The design",
        "",
        "```",
        "course",
        "  |-- syllabus_unit        (Unit 1, Unit 2, ...)        THEORY courses",
        "        |-- syllabus_topic",
        "              |-- syllabus_subtopic   <- the thing a teacher ticks off",
        "  |-- practical_experiment (Experiment 1, 2, ...)       PRACTICAL courses",
        "",
        "syllabus_progress  = one tick. It points at a subtopic OR an experiment",
        "                     (a CHECK constraint enforces exactly one), and at",
        "                     the section_course_offering, because section G and",
        "                     section H move through the syllabus separately.",
        "```",
        "",
        "## 1. Tables and view created",
        "",
        "```sql",
    ]
    lines.extend(created_tables)
    lines.extend([
        "```",
        "",
        "## 2. Syllabus content inserted",
        "",
        "Totals now in the database: **%d units, %d topics, %d subtopics, "
        "%d experiments**." % (counts["units"], counts["topics"],
                               counts["subtopics"], counts["experiments"]),
        "",
        "```sql",
    ])
    if inserted:
        lines.extend(inserted)
    else:
        lines.append("-- nothing new inserted, the content was already there")
    lines.extend([
        "```",
        "",
        "## Rolling it back",
        "",
        "These five tables are not used by anything that existed before, so",
        "dropping them puts the database back exactly as it was:",
        "",
        "```sql",
        "DROP VIEW IF EXISTS vw_syllabus_progress;",
        "DROP TABLE IF EXISTS syllabus_progress;",
        "DROP TABLE IF EXISTS syllabus_subtopic;",
        "DROP TABLE IF EXISTS syllabus_topic;",
        "DROP TABLE IF EXISTS syllabus_unit;",
        "DROP TABLE IF EXISTS practical_experiment;",
        "```",
    ])

    with open(path, "w") as handle:
        handle.write("\n".join(lines) + "\n")
    print("\nWrote", path)


if __name__ == "__main__":
    print("--- creating the new tables ---")
    create_tables()
    print("\n--- filling in the theory syllabus ---")
    fill_theory()
    print("\n--- filling in the lab experiments ---")
    fill_practical()
    write_doc()
