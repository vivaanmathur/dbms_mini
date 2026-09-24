"""
Empties the three "activity" tables so you can demo the app from a clean
start (for example just before a review).

It only deletes cancellations, substitutions and lecture logs. The timetable,
the teachers, the courses and the logins are all left alone.

Run it from the backend folder:   python -m scripts.clear_demo_data
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import run_query, run_update  # noqa: E402

TABLES = [
    # substitution_assignment points at cancellation_request, so it goes first
    "substitution_assignment",
    "cancellation_request",
    "lecture_log",
]

if __name__ == "__main__":
    for table in TABLES:
        before = run_query("SELECT COUNT(*) AS c FROM " + table)[0]["c"]
        run_update("DELETE FROM " + table)
        print("cleared", table, "-", before, "rows deleted")
    print("\nDone. The timetable and the logins were not touched.")
