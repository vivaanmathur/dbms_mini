# Roadmap - Learning Continuity System

> **Status.** Most of what follows has now been built and is in `main` — see
> each section. The direction came from an **external faculty reviewer**, not
> from the project team.

## The reviewer's core argument

The app today stops at *"cancel a lecture, find a free teacher, approve, log
it"* - which reads as faculty convenience. The suggestion is to reframe it as a
**Learning Continuity System**: when a class is at risk, predict the impact on
students, find the best recovery plan, and show whether teaching hours and
syllabus progress are back on track. The story becomes *protecting students'
learning* rather than *saving teachers time*.

The reviewer was explicit that this does not guarantee a top finish, and that
the project currently contains **no AI model** - the "fair" substitute pick is
a SQL ranking rule, and should be described as exactly that.

## The five suggestions

### 1. Fix scheduling correctness first
Before any intelligence is added, tighten the rules.

- Subject qualification should be a **hard filter**, not a tie breaker.
- Nothing currently accounts for leave, maximum workload, or faculty
  preferences.
- `sp_schedule_slot` checks faculty clashes using the *faculty-course
  assignment id* rather than the faculty id, so one teacher assigned to two
  different courses could be booked into both at the same time
  (`backend/sql/01_schema_live.sql`). **Verified: this is real.** Four
  teachers currently hold two courses each - Santushti Betgeri (DBMS +
  DBMSL), Manisha Patil (DS1 + DSL), Anand Dhawale (OSC + OSCL) and Anand
  Tiwari (OSCL + ESD) - so all four can be double booked through the
  procedure. The app's own substitute search is not affected: it compares
  `faculty_id`, which is correct. Only direct calls to `sp_schedule_slot`
  (such as the seeding script) can create the clash.
- Approval and assignment should be atomic so two simultaneous approvals
  cannot create conflicting bookings.

*Status:* the double-booking bug is **fixed** — `sp_save_slot`
checks clashes by `staff_id` across every subject. Handing over and recovery
run in transactions. Maximum weekly hours are enforced as a finding, not a
block. Leave and faculty preferences are still not modelled. Subject
qualification is still **not** a hard filter — **that contradicts a decision already taken** -
the team deliberately chose to show non-subject teachers as well, so that a
lecture can be handed to anyone who is free. Needs a decision, see
"Open questions".

### 2. Explainable substitute recommender
Filter out ineligible faculty, then rank the rest on subject expertise,
experience with that section, current and projected workload, historical
acceptance rate and response time, and student impact. Show the top three with
plain-language reasons, and let faculty approve. The intelligence becomes
visible and the decision stays accountable.

*Status:* **works, and stays as it is.** `GET /delegate/candidates` returns
every candidate with `teaches_subject`, `knows_this_class`, `is_free`,
`lectures_taken`, `weekly_classes` and a one-line `reason` such as
*"Teaches DBMS to this very class"*, and it is used by the hand-over dialog.

It is **deliberately not presented as a headline feature** and has no card on
the Insights page. Acceptance rate and response time were never added. The
team's position is that ranking colleagues is not what makes this project
worth looking at - the syllabus risk, recovery planning and allocation work
below is.

### 3. Missed-learning risk dashboard
Join the lecture log to the syllabus tables. Per section and course show
planned hours, delivered hours, pending substitutions, completed topics and
weeks remaining. Flag courses likely to fall behind and propose recovery slots.

*Status:* **built.** `GET /risk`, shown on Insights -> Syllabus risk. It
compares syllabus coverage against the share of the term elapsed, bands each
class, and lists the reasons in plain words. A subject with no timetabled
hours is reported as *not timetabled* rather than *critical*, because that is
a scheduling gap and not a class falling behind.

No prediction and no model: it is arithmetic that can explain itself. The
history it reads is written by `scripts/seed_history.py` and is **clearly
labelled simulated data**.

### 4. Recovery-plan optimizer
When nobody can cover a class, generate options - a different time, a room
change, a different teacher, a make-up lab - and score them on conflicts,
hours recovered, faculty load and disruption to students. A constraint solver
such as OR-Tools suits this.

*Status:* **built.** `GET /recovery/options` searches every slot in the next
fortnight. Three hard rules decide whether a slot is offered at all - the
class free, the teacher free, a room of the right kind free - and soft rules
only move the score. Each option lists the reasons behind its score.

Accepting one writes a `RESCHEDULED` row into `lecture_log`, a status the
schema already had, so **no new table was needed**. OR-Tools was not used: the
search space here is a fortnight of periods, small enough to enumerate
exactly, and an exact enumeration is easier to defend than a solver.

### 5. Student and coordinator views
A read-only student timetable showing the *actual* teacher, room, cancellation
and recovery plan for a date. A coordinator dashboard to resolve uncovered
classes and track sections at risk. That closes the loop:
**detect -> recommend -> approve -> notify -> conduct -> measure.**

*Status:* **built, for staff.** `GET /day` powers Insights -> Day view: pick a
class and a date and see who genuinely teaches each hour after cancellations,
cover and make-ups. `GET /coordinator` lists everything still needing
arranging, with the recovery planner one click away.

*Now:* **students now have their own sign-in and dashboard** —
who is really teaching them today, what changed this week, and each subject's
progress, limited to their own lab batch. Coordinators and directors have a
dashboard of every class they oversee.

## Suggested demo narrative

One polished scenario rather than several disconnected features:

1. A teacher cancels tomorrow's DBMS lecture.
2. The system shows the effect on that section's delivered hours and syllabus
   target.
3. It recommends three eligible substitutes, with reasons.
4. One rejects, the next accepts. If everybody declines, the optimizer proposes
   a make-up slot.
5. Student and coordinator views update.
6. A closing dashboard shows the class recovered and the risk reduced.

Alongside it, a comparison against the plain rule: uncovered lectures, time to
find coverage, scheduling conflicts, workload balance. Demo or simulated data
must be labelled as such.

## Open questions for the team

1. **Hard filter or free choice?** Suggestion 1 wants subject qualification
   enforced. The build deliberately lets a teacher hand a class to anybody who
   is free, because that is what was asked for, and that has been kept. Still
   worth a decision before a review.
2. **How much is honestly "AI"?** Settled in practice: **none of it is
   called AI.** Everything built is arithmetic or an exact search, and the
   interface says so. That is defensible under questioning in a way that a
   vague claim of intelligence is not.
3. ~~The `sp_schedule_slot` bug~~ — fixed by `sp_save_slot`.
4. ~~Students cannot see any of this~~ — they have their own dashboard.
