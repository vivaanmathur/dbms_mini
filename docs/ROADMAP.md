# Roadmap - Learning Continuity System

> **Status: tentative.** The direction below came from an **external faculty
> reviewer**, not from the project team. Vivaan has not given his own view on
> it yet, so nothing here is settled. Where work has started, it is
> **frontend only** - screens and placeholders - so that the shape of the idea
> can be seen and argued about before any backend or database work is
> committed to.

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

*Status:* not started. **Note this contradicts a decision already taken** -
the team deliberately chose to show non-subject teachers as well, so that a
lecture can be handed to anyone who is free. Needs a decision, see
"Open questions".

### 2. Explainable substitute recommender
Filter out ineligible faculty, then rank the rest on subject expertise,
experience with that section, current and projected workload, historical
acceptance rate and response time, and student impact. Show the top three with
plain-language reasons, and let faculty approve. The intelligence becomes
visible and the decision stays accountable.

*Status:* **partly built.** `GET /delegate/candidates` already returns every
candidate with `teaches_subject`, `knows_this_class`, `is_free`,
`lectures_taken`, `weekly_classes` and a one-line `reason` such as
*"Teaches DBMS to this very class"*. Acceptance rate and response time are not
tracked yet - that needs new columns or a new table.

### 3. Missed-learning risk dashboard
Join the lecture log to the syllabus tables. Per section and course show
planned hours, delivered hours, pending substitutions, completed topics and
weeks remaining. Flag courses likely to fall behind and propose recovery slots.

*Status:* the data now exists (`vw_syllabus_progress`, `fn_delivered_hours`,
`lecture_log`). The dashboard itself is a **frontend placeholder**. Any
prediction must be checked against real or clearly-labelled simulated history -
with a dataset this small, no claim of model accuracy would be honest.

### 4. Recovery-plan optimizer
When nobody can cover a class, generate options - a different time, a room
change, a different teacher, a make-up lab - and score them on conflicts,
hours recovered, faculty load and disruption to students. A constraint solver
such as OR-Tools suits this.

*Status:* **frontend placeholder only.** This is the largest piece of work
listed here.

### 5. Student and coordinator views
A read-only student timetable showing the *actual* teacher, room, cancellation
and recovery plan for a date. A coordinator dashboard to resolve uncovered
classes and track sections at risk. That closes the loop:
**detect -> recommend -> approve -> notify -> conduct -> measure.**

*Status:* not started. Would need a student role, which the `app_user.user_role`
enum does not currently have (`ADMIN`, `HOD`, `FACULTY` only) - so it would mean
either a schema change or a read-only public view.

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
   enforced. The current build deliberately lets a teacher hand a class to
   anybody who is free, because that is what was asked for. These cannot both
   be true - which wins?
2. **How much is honestly "AI"?** A ranking rule and a constraint solver are
   not machine learning. Calling them AI in front of judges is risky; calling
   them what they are is defensible. Where should the line be drawn?
3. **Scope.** Suggestions 3, 4 and 5 are each substantial. Which one is the
   single headline feature, given the time left?
4. **The `sp_schedule_slot` bug in suggestion 1 is real** and worth fixing on
   its own merits, independently of whatever else is decided.
