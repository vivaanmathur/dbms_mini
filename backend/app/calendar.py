"""
The term calendar.

The term now lives in the academic_term table rather than in two constants
in the code, so an administrator can start a new semester without anyone
editing Python. Everything with a date — week navigation, week numbers,
whether a lecture can be logged — reads from here.
"""
import datetime

from fastapi import HTTPException

from app.db import fetch_one

DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"]
DAY_INDEX = {day: i for i, day in enumerate(DAYS)}


def today():
    return datetime.date.today()


def current_term():
    term = fetch_one(
        "SELECT term_id, name, start_date, end_date FROM academic_term WHERE is_current = TRUE"
    )
    if term is None:
        raise HTTPException(409, "No term is marked as current. An administrator needs to set one.")
    term["start"] = datetime.date.fromisoformat(term["start_date"])
    term["end"] = datetime.date.fromisoformat(term["end_date"])
    return term


def monday_of(day):
    return day - datetime.timedelta(days=day.weekday())


def parse_date(text):
    try:
        return datetime.date.fromisoformat(text)
    except (TypeError, ValueError):
        raise HTTPException(400, "Dates must look like 2026-09-28.")


def resolve_week(week_start, term):
    """The Monday of the requested week, held inside the term. With no
    request, the week we are in now."""
    start = monday_of(parse_date(week_start)) if week_start else monday_of(today())
    return max(monday_of(term["start"]), min(monday_of(term["end"]), start))


def week_dates(week_start):
    return {day: (week_start + datetime.timedelta(days=i)).isoformat()
            for i, day in enumerate(DAYS)}


def week_header(week_start, term):
    first, last = monday_of(term["start"]), monday_of(term["end"])
    return {
        "term_id": term["term_id"],
        "term_name": term["name"],
        "term_start": term["start_date"],
        "term_end": term["end_date"],
        "week_start": week_start.isoformat(),
        "week_end": (week_start + datetime.timedelta(days=5)).isoformat(),
        "week_number": ((week_start - first).days // 7) + 1,
        "total_weeks": ((last - first).days // 7) + 1,
        "has_previous": week_start > first,
        "has_next": week_start < last,
        "is_current_week": week_start == monday_of(today()),
        "dates": week_dates(week_start),
    }


def term_progress(term, on=None):
    on = on or today()
    total = (term["end"] - term["start"]).days
    gone = max(0, min(total, (on - term["start"]).days))
    return {
        "weeks_total": round(total / 7, 1),
        "weeks_elapsed": round(gone / 7, 1),
        "weeks_left": round((total - gone) / 7, 1),
        "fraction_elapsed": gone / total if total else 0,
    }


def check_lecture_date(day_of_week, lecture_date, term):
    """A dated lecture must fall on its own weekday, inside the term."""
    if lecture_date.weekday() > 5 or DAYS[lecture_date.weekday()] != day_of_week:
        raise HTTPException(400, f"This lecture runs on {day_of_week}; pick a date on that day.")
    if lecture_date < term["start"] or lecture_date > term["end"]:
        raise HTTPException(
            400, f"The term runs {term['start_date']} to {term['end_date']}; that date is outside it.")


def minutes(clock):
    hour, minute = [int(part) for part in str(clock).split(":")[:2]]
    return hour * 60 + minute


def overlaps(start_a, end_a, start_b, end_b):
    return minutes(start_a) < minutes(end_b) and minutes(end_a) > minutes(start_b)
