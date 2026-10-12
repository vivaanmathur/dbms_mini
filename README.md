# Continuity

Lecture continuity for a university department: timetables, handing a lecture
over when a teacher cannot take it, syllabus progress, and — for the people
responsible — whether every class is on course to finish its syllabus.

Built for the Department of Computer Engineering and Technology (DCET), MIT
World Peace University, starting with **SY AI&DS G (2026-27)**.

FastAPI and plain SQL on MySQL / MariaDB (hosted on Hostinger), with a React
frontend.

## Documentation

| | |
|---|---|
| [**Setup**](docs/SETUP.md) | running it day to day; a new setup step by step: the `.env` file, backend and frontend commands, signing in, troubleshooting |
| [**Database**](docs/DATABASE.md) | every SQL statement the project uses, by kind: database setup, DCL, DDL, functions, procedures, triggers, views, DML, TCL |
| [Backend](backend/README.md) | how the API is organised, how access is checked |
| [Frontend](frontend/README.md) | how the interface is organised |
| [Roadmap](docs/ROADMAP.md) | the direction an external reviewer suggested, and what has been built |
| [Legacy](docs/legacy/) | notes on the original prototype's database |

**Quick start** (already set up): `cd backend && .venv/bin/uvicorn app.main:app --port 8000`,
and in a second terminal `cd frontend && npx vite --port 5173`. Then open
http://localhost:5173.

---

## Who sees what

What you see is decided by the roles you hold. One person can hold several —
a programme coordinator who also teaches, say — and switches between their
dashboards from the top bar.

| Role | Covers | Sees |
|---|---|---|
| **Administrator** | the whole system | the admin console — organisation, calendar, rooms, subjects and syllabus, classes, who teaches what, staff and roles, students, logins, the timetable editor, the audit trail — plus a setup checklist |
| **Programme Director** | a department (e.g. DCET) | every class in the department side by side, worst first |
| **Programme Coordinator** | a programme (e.g. AI&DS) | every class in the programme |
| **Year Coordinator** | one year, across a programme or a whole department | every class in that year |
| **Class Teacher** | one class (e.g. SY AI&DS G) | that class: today, this week, every subject's progress, what needs arranging |
| **Faculty** | the subjects they teach | their week, requests from colleagues, their syllabus, their lecture history |
| **Student** | their own class, and their own lab batch | who is *really* teaching them today, what has changed this week, how far each subject has got |

Students are entirely separate from staff. A login belongs to exactly one
staff member or exactly one student — never both — and the database enforces
it.

Teachers get **Insights** for the classes they teach: syllabus risk and a
day view. Anyone with an oversight role also sees what needs arranging, and
teaching load and room use.

## The model

```
department (DCET)
  └─ programme (B.Tech AI&DS)
       └─ class          SY AI&DS G, 2026-27
            └─ lab batch G1, G2, G3

subject                 defined once
  └─ offering           that subject, offered to one class, for one term
       └─ teaching      who teaches it — the WHOLE CLASS, or ONE LAB BATCH.
                        Never a mix for the same subject.
            └─ session  when and where it meets each week: a lecture,
                        tutorial, practical or evaluation — for the
                        teaching's own audience, or for chosen batches
                        (an evaluation of G1 and G2 only)
```

A subject can be offered to many classes. For each class it is taught either
by one teacher to the whole class, or batch by batch with one teacher per
batch. A timetable session is a weekly *rule*; the app projects it into dated
lectures across the term, so a lecture cancelled on one date is cancelled on
that date only.

## Running it

See [docs/SETUP.md](docs/SETUP.md). Accounts and the temporary password are
written to `backend/SEED_CREDENTIALS.local.md`, which git ignores. Everyone
chooses their own password at first sign-in.

## What is real, and what is not

**Real — from the teammate's original data** (`backend/sql/legacy/`):
the department, the programme, the faculty, the subjects and the rooms.

**Real — the Panel G timetable** (SY AI&DS G, 2026-27 odd semester): all 33
weekly sessions, including the evaluations and the CNM tutorial. Read off the
issued timetable, with these judgement calls where it was not explicit
(all in `backend/scripts/seed.py`, `TIMETABLE`):

- DSL batches follow the order the teachers are listed: G1 Patil, G2 Karande,
  G3 Kulkarni. DBMSL: G2 Betgeri, G1 and G3 Mitkari
- evaluations are run by the subject's teacher; the DS-I evaluation of G3
  (at the same hour as G1 and G2's) by Kulkarni, its lab teacher
- ESD's teacher is recorded as "Sakshi" with no surname or email, and no
  login until an admin completes the record
- UE-I (Sat afternoon) has no teacher and is left unassigned; Mentor-Mentee
  hours are not scheduled; RIDE is not offered to Panel G this semester

**A template** — the syllabus units, topics and experiments for each subject.
They are a reasonable starting point, meant to be corrected by the teachers
who teach them, from Admin → Subjects & syllabus.

**Demo** — four accounts that exist so each dashboard can be seen before real
people are given roles: an administrator, a programme director, a coordinator
(who is also year coordinator and class teacher, to show one person holding
several roles), and a student. Their names say *Demo* and their emails end in
`@continuity.local`.

Nobody real is given a leadership role: who the class teacher or year
coordinator actually is was not in the source data. Assign real people from
Admin → Staff & roles.

## What the database does itself

The rules that must always hold are enforced in the database, not only in the
application — so they hold no matter what writes to it.

| | |
|---|---|
| **26 tables** | organisation, calendar, classes, people, teaching, timetable, cancellations, cover, make-ups, lecture log, syllabus, audit |
| **CHECK constraints** | a login belongs to exactly one staff member or student; each role has exactly the scope it needs; a syllabus tick points at exactly one subtopic or experiment; times and hours are sane |
| **Generated columns + unique keys** | one current term; one class teacher per class; one whole-class teacher per subject; at most one live cover request per cancellation; no duplicate roles |
| **7 triggers** | refuse mixing whole-class and per-batch teaching; keep a student's batch inside their class; refuse a lecture logged on the wrong weekday or outside the term; keep a cancellation's status in step with cover and make-ups |
| **`sp_save_slot`** | the only way a session is created or moved. Refuses the teacher double-booked — by person, across every subject they teach — the room over capacity, students already busy (compared by who actually attends — a G3 evaluation does not block a G1 lab), and a practical outside a lab |
| **Functions** | `fn_class_label`, `fn_delivered_hours` (regular lectures plus make-ups actually held) |
| **5 views** | `vw_class`, `vw_slot_audience` (who attends each session), `vw_timetable`, `vw_assignment_progress`, `vw_staff_load` |

Every statement is in [docs/DATABASE.md](docs/DATABASE.md).

`sp_save_slot` replaces the original `sp_schedule_slot`, which checked teacher
clashes by teacher-and-subject pairing — so a teacher of two subjects could be
booked into both at once. That was a real bug in the original schema; four of
the ten teachers were exposed to it.

## The substitute and recovery logic

Nothing here is machine learning, and nothing calls out to a model.

**Handing over a lecture**: a teacher picks a colleague from a list with
teachers of the same subject first, each with a one-line reason; or leaves it
to the system, which asks the free teacher with the fewest lectures this
term. A teacher who declines is not asked again for that lecture, and it moves
to the next.

**Syllabus risk** compares how much of each syllabus is covered against how
much of the term has gone. A subject with nothing recorded is reported as
*no record* rather than *critical* — the system cannot tell untaught from
unrecorded, and says so.

**Recovery planning** searches the next fortnight for a make-up slot. Three
hard rules decide whether a slot is offered — students free, teacher free, a
suitable room free — and soft rules only move the score.

## Testing

`backend/tests/e2e.py` signs in as every role and checks 50 things end to
end, including that each role is refused what it should not reach. It
changes data, so run it against a fresh seed and reseed afterwards.
