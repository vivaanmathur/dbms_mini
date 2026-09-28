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
4. A teacher can **hand over one of their own lectures** on a date. They pick
   who takes it from a list that puts **teachers of the same subject first**,
   or they leave it unpicked and the backend chooses the fairest free teacher.
5. That teacher **approves** (they now take the class) or **rejects** (it is
   passed on to the next free teacher).
6. After taking a class, a teacher **marks it as conducted**. That row goes
   into `lecture_log`.
7. A teacher ticks off what they actually taught — subtopics for a theory
   course, experiment numbers for a lab — and the syllabus progress for that
   class updates.

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
    database.py   opening connections (pooled) and running SQL
    auth.py       password checking and the login token
    main.py       timetables, handing lectures over, syllabus
    insight.py    risk, recovery planning, allocation, the day view
  scripts/
    add_more_data.py    fills in the timetable (writes docs/DATA_INSERTED.md)
    setup_syllabus.py   creates the syllabus tables and content
    seed_history.py     SIMULATED teaching history, so risk has something to show
    clear_demo_data.py  empties cancellations / substitutions / lecture logs
  sql/03_syllabus.sql   the new tables
  requirements.txt
  .env            database details (not shared publicly)
```

## The department features

None of these use machine learning, and nothing calls out to a model. They
are arithmetic over the timetable and a constraint search — which is the
point, because every number can explain itself in a sentence.

**Syllabus risk** compares how much of the syllabus a class has actually
covered against how far through the term it is, and bands it. A subject with
no hours on the timetable is reported as *not timetabled* rather than
*critical*, because that is a scheduling gap, not a class falling behind.

**Recovery planning** searches every slot in the next fortnight. Three hard
rules decide whether a slot is even offered — the class free, the teacher
free, a room of the right kind free. Soft rules only move the score: sooner
is better, the usual room is better, late evenings and Saturdays are worse.
An accepted plan is written as a `RESCHEDULED` row in `lecture_log`, a status
the schema already had, so no new table was needed.

**Allocation** reads each teacher's `max_weekly_workload_hours` (finally
used) against their scheduled hours, and how often each room is booked.
Findings name both sides of an imbalance so they can be acted on.

**Day view** answers what actually happens on one date: who really teaches
each hour after cancellations, cover and make-ups.

## A note on the term dates

`TERM_START` and `TERM_END` are constants at the top of `app/insight.py`. A
finished system would read them from an academic calendar table; this schema
has none, so they sit where they can be seen and corrected rather than being
buried inside a query.

## Simulated data

`scripts/seed_history.py` writes a believable term of teaching history so the
risk dashboard has a spread to show instead of every subject reading
"critical". **It is simulated, not a record of real teaching.** Clear it with
`python -m scripts.clear_demo_data`.

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
| GET | `/delegate/candidates` | who this lecture could be handed to, and why |
| POST | `/mark-conducted` | write the lecture into `lecture_log` |
| GET | `/syllabus/my-subjects` | my subjects with syllabus progress |
| GET | `/syllabus/{offering_id}` | the full unit/topic/subtopic tree, with ticks |
| POST | `/syllabus/mark` | tick off a subtopic or an experiment |
| DELETE | `/syllabus/mark/{id}` | undo a tick |
| GET | `/syllabus/{offering_id}/history` | lecture history for that subject |
| GET | `/risk` | is each class going to finish its syllabus in time |
| GET | `/recovery/options` | make-up slots where class, teacher and room are all free |
| POST | `/recovery/accept` | record the chosen make-up plan |
| GET | `/allocation` | teaching load against contract, room use, what is out of balance |
| GET | `/day` | what actually happens on one date for one class |
| GET | `/coordinator` | every cancellation still needing attention |
| GET | `/lecture-log` | the lectures I conducted |
| GET | `/teacher-load` | how many lectures each teacher has taken |

## Database tables we use

`faculty`, `app_user`, `section`, `lab_batch`, `course`,
`program_curriculum`, `section_course_offering`, `faculty_course_assignment`,
`classroom`, `timetable_slot` for the timetable, and
`cancellation_request`, `substitution_assignment`, `lecture_log` for the
cancel / approve / conducted part, and `syllabus_unit`, `syllabus_topic`,
`syllabus_subtopic`, `practical_experiment`, `syllabus_progress` (plus the
`vw_syllabus_progress` view) for syllabus tracking.

The five syllabus tables are the **only** things ever added to the database;
see `docs/DATABASE_CHANGES.md` for every statement and how to undo them.

The approve-reject flow needed no new table because the statuses were already
in the schema: `cancellation_request.request_status` is
PENDING / APPROVED / REJECTED / WITHDRAWN and
`substitution_assignment.assignment_status` is
PROPOSED / ASSIGNED / COMPLETED / CANCELLED. A request starts as PROPOSED,
becomes ASSIGNED when the teacher says yes, and if they say no we point the
same row at the next teacher and keep it PROPOSED. The list of teachers who
already said no is kept in that row's `remarks` column, like `rejected:3,7`.
