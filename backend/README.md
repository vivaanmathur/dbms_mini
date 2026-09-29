# Continuity — backend

FastAPI and plain, parameterised SQL (mysql-connector-python). No ORM: every
query in the project can be read where it runs. See the project README for
what the system does and how to run it.

```
app/
  main.py        the app; wires the routers together
  config.py      settings from .env — refuses to start if one is missing
  db.py          connection pool, query helpers, transactions, readable errors
  security.py    passwords, tokens, and who can see what (roles and scopes)
  calendar.py    the term, weeks, and whether a date is a real lecture day
  sessions.py    turns weekly timetable rules into dated lectures with a state
  audit.py       the audit trail
  routers/
    auth.py        sign in, who am I, change password
    dashboard.py   one dashboard per role
    timetable.py   a week, a class's week, a day
    handover.py    hand over, cover, and record lectures
    syllabus.py    syllabus progress per class and lab batch
    insight.py     risk, needs-arranging, make-up planning, load
    admin/         everything an administrator manages
sql/
  schema.sql     the tables
  routines.sql   triggers, functions, procedures, views
  legacy/        the original prototype schema and data, for reference
scripts/
  setup_local_db.sh  create a local database from nothing
  seed.py            wipe and load the starting data
  syllabus_data.py   the syllabus template
tests/
  e2e.py         49 end-to-end checks across every role
```

## How access works

Every request becomes a *principal*: the person plus every role they hold,
each with its scope. What they can see is the union of what their roles cover
(`security.py`). A route asks for what it needs — `staff_only`,
`teaching_only`, `admin_only`, `student_only` — and anything about a
particular class also checks `require_section`.

New accounts start with a temporary password and every route except
change-password answers `403 PASSWORD_CHANGE_REQUIRED` until it is replaced.
Passwords need ten characters, mixed case and a digit.

## Writes that must not come apart

Anything that changes two things at once runs in `db.transaction()`:
handing over (cancellation + cover request), accepting cover, declining and
passing it on, booking a make-up (make-up + withdrawing a pending request),
recording a lecture with what it covered, creating a person with their login,
and bulk-enrolling students — which is all or nothing.

## Errors

Database errors come back as sentences. Messages raised by the triggers and
`sp_save_slot` — "The teacher is already teaching at that time" — pass
straight through; duplicate keys, broken references and CHECK failures are
translated in `db.py`.

The API is self-documenting at http://localhost:8001/docs.
