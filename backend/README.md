# Faculty Lecture Scheduler - Backend

FastAPI + plain SQL (mysql-connector-python). **No ORM** - every query is
written by hand with `%s` placeholders, which is what the DBMS part of the
project is about.

The database is the one already running on Hostinger
(`u129569208_lectureplanner`). We did not change its structure at all - no
CREATE, ALTER or DROP anywhere in this code. We only INSERT / UPDATE / SELECT,
and we call the `sp_schedule_slot` procedure that was already there.

## What the app does

1. A teacher logs in with their college email.
2. **My Timetable** - the lectures and labs that teacher has to take. If they
   agreed to cover a class for somebody else, that class also shows up here on
   the date it happens, in green.
3. **Class Timetable** - the whole week of any class. In a lab hour all three
   lab batches are shown together.
4. A teacher can **cancel one of their own lectures** on a date. The backend
   then finds a teacher who is free at that hour and sends them the request.
5. That teacher **approves** (they now take the class) or **rejects** (it is
   passed on to the next free teacher).
6. After taking a class, a teacher **marks it as conducted**. That row goes
   into `lecture_log`.

### How the substitute is chosen

`find_free_teacher()` in `app/main.py` does it in one SELECT:

- skip the teacher who cancelled, and anyone who already said no,
- skip anyone who has a class of their own in that hour,
- skip anyone already covering a different class in that hour on that date,
- **order what is left by how many lectures they have conducted**
  (counted from `lecture_log`), lowest first, so the work stays even,
- among teachers with the same count, prefer one who already teaches that
  subject, then go by name.

## Files

```
backend/
  app/
    database.py   opening the connection and running SQL
    auth.py       password checking and the login token
    main.py       the FastAPI app and every route
  scripts/
    add_more_data.py    fills in the timetable (writes docs/DATA_INSERTED.md)
    clear_demo_data.py  empties cancellations / substitutions / lecture logs
  requirements.txt
  .env            database details (not shared publicly)
```

## Running it

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- Swagger docs (every route, try them out): http://localhost:8000/docs

## A note on the Hostinger limit

The hosting account only allows **500 new MySQL connections per hour**. That
is why `app/database.py` makes a small pool of 5 connections once and every
query borrows one from it instead of opening its own. If you ever see
`max_connections_per_hour`, it just means too many connections were opened in
that hour - wait for the next hour and it works again.

## Logins

Every teacher in the `faculty` table has a login. The password is their first
name followed by 123, for example:

| Email | Password |
|---|---|
| santushti.betgeri@mitwpu.edu.in | Santushti123 |
| anand.dhawale@mitwpu.edu.in | Anand123 |
| manisha.patil@mitwpu.edu.in | Manisha123 |

## Routes

| Method | Route | What it does |
|---|---|---|
| POST | `/auth/login` | log in with email + password, returns a token |
| GET | `/auth/me` | who is logged in |
| GET | `/timetable/my` | view 1 - my own timetable, plus the classes I am covering |
| GET | `/classes` | the list of classes for the dropdown |
| GET | `/timetable/class/{section_id}` | view 2 - one class's timetable, showing any date where the teacher changed |
| POST | `/cancel-lecture` | cancel my lecture and propose a free teacher |
| GET | `/requests/incoming` | requests waiting for my answer |
| POST | `/requests/{id}/approve` | I will take the class |
| POST | `/requests/{id}/reject` | pass it to the next free teacher |
| GET | `/requests/covering` | classes I agreed to cover |
| GET | `/requests/sent` | my cancelled lectures and who covers them |
| POST | `/mark-conducted` | write the lecture into `lecture_log` |
| GET | `/lecture-log` | the lectures I conducted |
| GET | `/teacher-load` | how many lectures each teacher has taken |

## Database tables we use

`faculty`, `app_user`, `section`, `lab_batch`, `course`,
`program_curriculum`, `section_course_offering`, `faculty_course_assignment`,
`classroom`, `timetable_slot` for the timetable, and
`cancellation_request`, `substitution_assignment`, `lecture_log` for the
cancel / approve / conducted part.

The approve-reject flow needed no new table because the statuses were already
in the schema: `cancellation_request.request_status` is
PENDING / APPROVED / REJECTED / WITHDRAWN and
`substitution_assignment.assignment_status` is
PROPOSED / ASSIGNED / COMPLETED / CANCELLED. A request starts as PROPOSED,
becomes ASSIGNED when the teacher says yes, and if they say no we point the
same row at the next teacher and keep it PROPOSED. The list of teachers who
already said no is kept in that row's `remarks` column, like `rejected:3,7`.
