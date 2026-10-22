# Database

Every SQL statement the project needs, grouped by kind. The DDL, functions,
procedures, triggers and views below are copied from
[`backend/sql/schema.sql`](../backend/sql/schema.sql) and
[`backend/sql/routines.sql`](../backend/sql/routines.sql), which are what
actually gets loaded. The DML and TCL examples are the real statements the
backend runs, from the file named with each one.

For what each table means and how they connect, see [SCHEMA.md](SCHEMA.md).

Works on **MySQL 8.0.16+** and **MariaDB 10.5+**. The live database is
MariaDB 11.8 on Hostinger.

## Contents

1. [Database setup](#1-database-setup)
2. [DCL: users and privileges](#2-dcl-users-and-privileges)
3. [DDL: tables and constraints](#3-ddl-tables-and-constraints)
4. [Functions](#4-functions)
5. [Procedures](#5-procedures)
6. [Triggers](#6-triggers)
7. [Views](#7-views)
8. [DML: reading and changing data](#8-dml-reading-and-changing-data)
9. [TCL: transactions](#9-tcl-transactions)
10. [Cursors](#10-cursors)
11. [Loading order, in one place](#11-loading-order-in-one-place)

---

## 1. Database setup

The order matters: the database and its user, then the tables (section 3),
then the functions, procedures, triggers and views (sections 4 to 7), then
the starting data.

```sql
CREATE DATABASE continuity
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE continuity;

SET NAMES utf8mb4;
```

On **Hostinger** (and most shared hosting) you cannot run `CREATE DATABASE`
or `CREATE USER` yourself. Create the database and its user in hPanel →
Databases → MySQL Databases instead. Hostinger prefixes both names with your
account id (for example `u129569208_lectureplanner`). Then carry on from
section 3.

The easiest way to load sections 3 to 7 is the project's own loader, which
reads `backend/.env` and runs both files in order:

```bash
cd backend
.venv/bin/python -m scripts.load_schema           # into an empty database
.venv/bin/python -m scripts.load_schema --empty   # drops everything in it first
.venv/bin/python -m scripts.seed                  # the starting data (section 8)
```

It works where the `mysql` command-line client cannot sign in, as on
Hostinger. With a local MySQL you can also run the files directly:

```bash
mysql -u root continuity < backend/sql/schema.sql
mysql -u root continuity < backend/sql/routines.sql
```

---

## 2. DCL: users and privileges

The app signs in as its own user, which can reach only its own database. It
never uses `root`.

```sql
-- the app's login (pick your own strong password)
CREATE USER 'continuity'@'localhost' IDENTIFIED BY 'choose-a-strong-password';

-- everything inside its own database, and nothing outside it
GRANT ALL PRIVILEGES ON continuity.* TO 'continuity'@'localhost';

FLUSH PRIVILEGES;

-- check what it has
SHOW GRANTS FOR 'continuity'@'localhost';
```

Changing the password, and taking access away:

```sql
ALTER USER 'continuity'@'localhost' IDENTIFIED BY 'a-new-strong-password';

REVOKE ALL PRIVILEGES ON continuity.* FROM 'continuity'@'localhost';
DROP USER 'continuity'@'localhost';
```

**Creating functions with binary logging on.** MySQL and MariaDB with binary
logging enabled only let a privileged account create stored functions. If
loading section 4 fails with error 1419, load the routines as `root`, or run
this once as an administrator:

```sql
SET GLOBAL log_bin_trust_function_creators = 1;
```

On Hostinger the database user already has what it needs.

Application-level access (who may see which class) is not done with SQL
grants: it is decided by the `role_assignment` table and checked by the
backend on every request.

---

## 3. DDL: tables and constraints

26 tables. Every rule that must always hold is written into the table as a
`CHECK` constraint, a foreign key, a unique key, or a generated column with a
unique key. That way the rule holds whatever program writes the row.

| Technique | Used for |
|---|---|
| `CHECK` | a login belongs to exactly one staff member or one student; each role has exactly the scope it needs; a syllabus tick points at exactly one subtopic or experiment; times end after they start; hours and capacities are in range |
| Generated column + `UNIQUE` | only one current term; one class teacher per class; one whole-class teacher per subject; at most one live cover request per cancellation; no duplicate roles |
| `FOREIGN KEY ... ON DELETE CASCADE` | children that mean nothing without their parent (a timetable session's batch list, a syllabus topic's subtopics) |
| `FOREIGN KEY` (restrict) | everything else, so removing something still in use fails loudly |

```sql
SET NAMES utf8mb4;
```

### `department`

```sql
-- Organisation
CREATE TABLE department (
  department_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(20)  NOT NULL UNIQUE,
  name           VARCHAR(160) NOT NULL UNIQUE,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
```

### `program`

```sql
CREATE TABLE program (
  program_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id  BIGINT UNSIGNED NOT NULL,
  code           VARCHAR(30)  NOT NULL UNIQUE,
  name           VARCHAR(180) NOT NULL,
  short_name     VARCHAR(30)  NOT NULL,          -- "AI&DS", used in class names
  degree_level   VARCHAR(30)  NOT NULL DEFAULT 'UNDERGRADUATE',
  duration_years TINYINT UNSIGNED NOT NULL DEFAULT 4,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_program_department FOREIGN KEY (department_id) REFERENCES department(department_id),
  CONSTRAINT chk_program_duration CHECK (duration_years BETWEEN 1 AND 6)
) ENGINE=InnoDB;
```

### `academic_term`

```sql
-- Calendar
CREATE TABLE academic_term (
  term_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,     -- "2026-27 Odd Semester"
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_current  BOOLEAN NOT NULL DEFAULT FALSE,
  -- only one term may be current: NULL for every non-current term, so the
  -- unique index below only ever sees one value
  current_key TINYINT GENERATED ALWAYS AS (IF(is_current, 1, NULL)) STORED,
  CONSTRAINT chk_term_dates CHECK (end_date > start_date),
  UNIQUE KEY uq_one_current_term (current_key)
) ENGINE=InnoDB;
```

### `period`

```sql
-- The periods of the teaching day, so the timetable editor offers real
-- slots instead of free-typed times.
CREATE TABLE period (
  period_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(30) NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  sort_order  TINYINT UNSIGNED NOT NULL,
  CONSTRAINT chk_period_times CHECK (end_time > start_time),
  UNIQUE KEY uq_period_times (start_time, end_time)
) ENGINE=InnoDB;
```

### `section`

```sql
-- Classes
CREATE TABLE section (
  section_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  program_id     BIGINT UNSIGNED NOT NULL,
  year_of_study  TINYINT UNSIGNED NOT NULL,     -- 1 FY, 2 SY, 3 TY, 4 LY
  division       VARCHAR(10) NOT NULL,          -- "G"
  academic_year  VARCHAR(9)  NOT NULL,          -- "2026-27"
  student_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_section_program FOREIGN KEY (program_id) REFERENCES program(program_id),
  CONSTRAINT chk_section_year CHECK (year_of_study BETWEEN 1 AND 6),
  UNIQUE KEY uq_section (program_id, year_of_study, division, academic_year)
) ENGINE=InnoDB;
```

### `lab_batch`

```sql
CREATE TABLE lab_batch (
  lab_batch_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  section_id    BIGINT UNSIGNED NOT NULL,
  code          VARCHAR(10) NOT NULL,           -- "G1"
  CONSTRAINT fk_lab_batch_section FOREIGN KEY (section_id) REFERENCES section(section_id),
  UNIQUE KEY uq_lab_batch (section_id, code)
) ENGINE=InnoDB;
```

### `room`

```sql
-- Rooms
CREATE TABLE room (
  room_id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code                 VARCHAR(30) NOT NULL UNIQUE,
  building             VARCHAR(60) NOT NULL,
  floor                VARCHAR(10),
  capacity             SMALLINT UNSIGNED NOT NULL,
  room_type            ENUM('LECTURE','LAB') NOT NULL,
  -- how many lab batches can share the room at once (a big lab can hold two)
  concurrent_capacity  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT chk_room_capacity CHECK (capacity > 0),
  CONSTRAINT chk_room_concurrent CHECK (concurrent_capacity BETWEEN 1 AND 6)
) ENGINE=InnoDB;
```

### `staff`

```sql
-- People
CREATE TABLE staff (
  staff_id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id     BIGINT UNSIGNED NOT NULL,
  employee_code     VARCHAR(30) NOT NULL UNIQUE,
  first_name        VARCHAR(80) NOT NULL,
  last_name         VARCHAR(80) NOT NULL,
  email             VARCHAR(255) NOT NULL UNIQUE,
  designation       VARCHAR(100) NOT NULL DEFAULT 'Assistant Professor',
  max_weekly_hours  DECIMAL(4,1) NOT NULL DEFAULT 18.0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_department FOREIGN KEY (department_id) REFERENCES department(department_id),
  CONSTRAINT chk_staff_hours CHECK (max_weekly_hours > 0)
) ENGINE=InnoDB;
```

### `student`

```sql
CREATE TABLE student (
  student_id    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  section_id    BIGINT UNSIGNED NOT NULL,
  lab_batch_id  BIGINT UNSIGNED NULL,
  prn           VARCHAR(30) NOT NULL UNIQUE,     -- permanent registration number
  roll_no       VARCHAR(15),
  first_name    VARCHAR(80) NOT NULL,
  last_name     VARCHAR(80) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_section FOREIGN KEY (section_id) REFERENCES section(section_id),
  CONSTRAINT fk_student_batch FOREIGN KEY (lab_batch_id) REFERENCES lab_batch(lab_batch_id)
) ENGINE=InnoDB;
```

### `app_user`

```sql
-- A login. Exactly one of staff_id / student_id is set — which is what keeps
-- the student side of the system entirely separate from the staff side.
CREATE TABLE app_user (
  user_id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email                 VARCHAR(255) NOT NULL UNIQUE,
  password_hash         VARCHAR(255) NOT NULL,
  staff_id              BIGINT UNSIGNED NULL UNIQUE,
  student_id            BIGINT UNSIGNED NULL UNIQUE,
  must_change_password  BOOLEAN NOT NULL DEFAULT TRUE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at         DATETIME NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_staff   FOREIGN KEY (staff_id)   REFERENCES staff(staff_id),
  CONSTRAINT fk_user_student FOREIGN KEY (student_id) REFERENCES student(student_id),
  CONSTRAINT chk_user_one_owner CHECK (
    (staff_id IS NOT NULL AND student_id IS NULL) OR
    (staff_id IS NULL AND student_id IS NOT NULL)
  )
) ENGINE=InnoDB;
```

### `role_assignment`

```sql
-- One row per role a staff member holds. The scope columns say WHAT the role
-- covers, and which of them must be filled depends on the role:
--
--   ADMIN                nothing — the whole system
--   FACULTY              nothing — what they teach comes from teaching_assignment
--   PROGRAM_DIRECTOR     department_id
--   PROGRAM_COORDINATOR  program_id
--   YEAR_COORDINATOR     year_of_study, plus EITHER a department (that year
--                        across the department) OR a programme
--   CLASS_TEACHER        section_id
CREATE TABLE role_assignment (
  role_assignment_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id            BIGINT UNSIGNED NOT NULL,
  role                ENUM('ADMIN','PROGRAM_DIRECTOR','PROGRAM_COORDINATOR',
                           'YEAR_COORDINATOR','CLASS_TEACHER','FACULTY') NOT NULL,
  department_id       BIGINT UNSIGNED NULL,
  program_id          BIGINT UNSIGNED NULL,
  year_of_study       TINYINT UNSIGNED NULL,
  section_id          BIGINT UNSIGNED NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- the same role with the same scope cannot be given twice
  scope_key VARCHAR(80) GENERATED ALWAYS AS (CONCAT_WS(':',
      role, IFNULL(department_id, '-'), IFNULL(program_id, '-'),
      IFNULL(year_of_study, '-'), IFNULL(section_id, '-'))) STORED,
  -- a class has at most one class teacher
  class_teacher_of BIGINT UNSIGNED GENERATED ALWAYS AS
      (IF(role = 'CLASS_TEACHER', section_id, NULL)) STORED,

  CONSTRAINT fk_role_staff      FOREIGN KEY (staff_id)      REFERENCES staff(staff_id),
  CONSTRAINT fk_role_department FOREIGN KEY (department_id) REFERENCES department(department_id),
  CONSTRAINT fk_role_program    FOREIGN KEY (program_id)    REFERENCES program(program_id),
  CONSTRAINT fk_role_section    FOREIGN KEY (section_id)    REFERENCES section(section_id),
  CONSTRAINT chk_role_scope CHECK (
    (role IN ('ADMIN','FACULTY')
       AND department_id IS NULL AND program_id IS NULL
       AND year_of_study IS NULL AND section_id IS NULL)
    OR (role = 'PROGRAM_DIRECTOR'
       AND department_id IS NOT NULL AND program_id IS NULL
       AND year_of_study IS NULL AND section_id IS NULL)
    OR (role = 'PROGRAM_COORDINATOR'
       AND program_id IS NOT NULL AND department_id IS NULL
       AND year_of_study IS NULL AND section_id IS NULL)
    OR (role = 'YEAR_COORDINATOR'
       AND year_of_study IS NOT NULL AND section_id IS NULL
       AND ((department_id IS NOT NULL AND program_id IS NULL)
         OR (department_id IS NULL AND program_id IS NOT NULL)))
    OR (role = 'CLASS_TEACHER'
       AND section_id IS NOT NULL AND department_id IS NULL
       AND program_id IS NULL AND year_of_study IS NULL)
  ),
  UNIQUE KEY uq_role_scope (staff_id, scope_key),
  UNIQUE KEY uq_one_class_teacher (class_teacher_of)
) ENGINE=InnoDB;
```

### `subject`

```sql
-- Subjects and who teaches them
CREATE TABLE subject (
  subject_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  program_id     BIGINT UNSIGNED NOT NULL,
  code           VARCHAR(30)  NOT NULL UNIQUE,
  name           VARCHAR(200) NOT NULL,
  subject_type   ENUM('THEORY','PRACTICAL') NOT NULL,
  credits        DECIMAL(3,1) NOT NULL DEFAULT 0,
  planned_hours  DECIMAL(5,1) NOT NULL,
  CONSTRAINT fk_subject_program FOREIGN KEY (program_id) REFERENCES program(program_id),
  CONSTRAINT chk_subject_hours CHECK (planned_hours > 0),
  CONSTRAINT chk_subject_credits CHECK (credits >= 0)
) ENGINE=InnoDB;
```

### `subject_offering`

```sql
-- A subject offered to one class for one term. The same subject can be
-- offered to many classes.
CREATE TABLE subject_offering (
  offering_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_id   BIGINT UNSIGNED NOT NULL,
  section_id   BIGINT UNSIGNED NOT NULL,
  term_id      BIGINT UNSIGNED NOT NULL,
  CONSTRAINT fk_offering_subject FOREIGN KEY (subject_id) REFERENCES subject(subject_id),
  CONSTRAINT fk_offering_section FOREIGN KEY (section_id) REFERENCES section(section_id),
  CONSTRAINT fk_offering_term    FOREIGN KEY (term_id)    REFERENCES academic_term(term_id),
  UNIQUE KEY uq_offering (subject_id, section_id, term_id)
) ENGINE=InnoDB;
```

### `teaching_assignment`

```sql
-- Who teaches an offering. lab_batch_id NULL means the whole class; a value
-- means that one batch. The triggers further down make sure the two are
-- never mixed for the same offering, and that the batch really belongs to
-- the offering's class.
CREATE TABLE teaching_assignment (
  assignment_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  offering_id    BIGINT UNSIGNED NOT NULL,
  lab_batch_id   BIGINT UNSIGNED NULL,
  staff_id       BIGINT UNSIGNED NOT NULL,
  -- NULLs never collide in a unique index, so the whole-class case is keyed
  -- as batch 0 to stop two whole-class teachers being assigned
  batch_key      BIGINT UNSIGNED GENERATED ALWAYS AS (IFNULL(lab_batch_id, 0)) STORED,
  CONSTRAINT fk_assignment_offering FOREIGN KEY (offering_id)  REFERENCES subject_offering(offering_id),
  CONSTRAINT fk_assignment_batch    FOREIGN KEY (lab_batch_id) REFERENCES lab_batch(lab_batch_id),
  CONSTRAINT fk_assignment_staff    FOREIGN KEY (staff_id)     REFERENCES staff(staff_id),
  UNIQUE KEY uq_assignment (offering_id, batch_key)
) ENGINE=InnoDB;
```

### `timetable_slot`

```sql
-- Timetable
-- A weekly rule, not a lecture: "this assignment meets Monday 09:30 in VY115".
-- The actual dated lectures are this rule projected across the term.
CREATE TABLE timetable_slot (
  slot_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id  BIGINT UNSIGNED NOT NULL,
  room_id        BIGINT UNSIGNED NOT NULL,
  day_of_week    ENUM('MON','TUE','WED','THU','FRI','SAT') NOT NULL,
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  -- what kind of session this is. A PRACTICAL must be held in a lab; an
  -- EVALUATION of a lab subject can be held in an ordinary classroom.
  session_type   ENUM('LECTURE','TUTORIAL','PRACTICAL','EVALUATION') NOT NULL DEFAULT 'LECTURE',
  CONSTRAINT fk_slot_assignment FOREIGN KEY (assignment_id) REFERENCES teaching_assignment(assignment_id),
  CONSTRAINT fk_slot_room       FOREIGN KEY (room_id)       REFERENCES room(room_id),
  CONSTRAINT chk_slot_times CHECK (end_time > start_time),
  KEY ix_slot_day_time (day_of_week, start_time)
) ENGINE=InnoDB;
```

### `slot_batch`

```sql
-- Who attends a session, when it is not simply the teaching assignment's own
-- audience. Most sessions have no rows here: they are for the whole class, or
-- for the one lab batch their assignment covers. Rows narrow or widen that —
-- "DBMS evaluation, G1 and G2 only", or "OOP lab evaluation, all batches
-- together". vw_slot_audience resolves every session to the batches it
-- actually holds.
CREATE TABLE slot_batch (
  slot_id       BIGINT UNSIGNED NOT NULL,
  lab_batch_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (slot_id, lab_batch_id),
  CONSTRAINT fk_slot_batch_slot  FOREIGN KEY (slot_id) REFERENCES timetable_slot(slot_id) ON DELETE CASCADE,
  CONSTRAINT fk_slot_batch_batch FOREIGN KEY (lab_batch_id) REFERENCES lab_batch(lab_batch_id)
) ENGINE=InnoDB;
```

### `cancellation`

```sql
-- When a lecture cannot happen
CREATE TABLE cancellation (
  cancellation_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slot_id                BIGINT UNSIGNED NOT NULL,
  lecture_date           DATE NOT NULL,
  reason                 VARCHAR(500) NOT NULL,
  requested_by_staff_id  BIGINT UNSIGNED NOT NULL,
  status  ENUM('OPEN','COVERED','RESCHEDULED','WITHDRAWN') NOT NULL DEFAULT 'OPEN',
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cancel_slot  FOREIGN KEY (slot_id) REFERENCES timetable_slot(slot_id),
  CONSTRAINT fk_cancel_staff FOREIGN KEY (requested_by_staff_id) REFERENCES staff(staff_id),
  UNIQUE KEY uq_cancel_once (slot_id, lecture_date)
) ENGINE=InnoDB;
```

### `cover_request`

```sql
-- Every time someone is asked to cover a cancelled lecture, and what they
-- said. Keeping the full history (rather than overwriting one row) is what
-- lets the system avoid asking the same person twice, and show who declined.
CREATE TABLE cover_request (
  cover_id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cancellation_id  BIGINT UNSIGNED NOT NULL,
  staff_id         BIGINT UNSIGNED NOT NULL,
  chosen_by        ENUM('TEACHER','SYSTEM') NOT NULL,
  status           ENUM('PENDING','ACCEPTED','DECLINED','WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  requested_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at     DATETIME NULL,
  -- at most one live (pending or accepted) request per cancellation
  live_key BIGINT UNSIGNED GENERATED ALWAYS AS
      (IF(status IN ('PENDING','ACCEPTED'), cancellation_id, NULL)) STORED,
  CONSTRAINT fk_cover_cancellation FOREIGN KEY (cancellation_id) REFERENCES cancellation(cancellation_id),
  CONSTRAINT fk_cover_staff        FOREIGN KEY (staff_id)        REFERENCES staff(staff_id),
  UNIQUE KEY uq_cover_asked_once (cancellation_id, staff_id),
  UNIQUE KEY uq_one_live_cover (live_key)
) ENGINE=InnoDB;
```

### `makeup_session`

```sql
-- A make-up class arranged for a lecture nobody could cover.
CREATE TABLE makeup_session (
  makeup_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cancellation_id  BIGINT UNSIGNED NOT NULL UNIQUE,
  session_date     DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  room_id          BIGINT UNSIGNED NOT NULL,
  staff_id         BIGINT UNSIGNED NOT NULL,
  status           ENUM('PLANNED','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_makeup_cancellation FOREIGN KEY (cancellation_id) REFERENCES cancellation(cancellation_id),
  CONSTRAINT fk_makeup_room  FOREIGN KEY (room_id)  REFERENCES room(room_id),
  CONSTRAINT fk_makeup_staff FOREIGN KEY (staff_id) REFERENCES staff(staff_id),
  CONSTRAINT chk_makeup_times CHECK (end_time > start_time)
) ENGINE=InnoDB;
```

### `lecture_log`

```sql
-- What was actually taught.
CREATE TABLE lecture_log (
  log_id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slot_id                BIGINT UNSIGNED NOT NULL,
  lecture_date           DATE NOT NULL,
  delivered_by_staff_id  BIGINT UNSIGNED NOT NULL,
  hours                  DECIMAL(4,2) NOT NULL,
  remarks                VARCHAR(500),
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_slot  FOREIGN KEY (slot_id) REFERENCES timetable_slot(slot_id),
  CONSTRAINT fk_log_staff FOREIGN KEY (delivered_by_staff_id) REFERENCES staff(staff_id),
  CONSTRAINT chk_log_hours CHECK (hours > 0 AND hours <= 8),
  UNIQUE KEY uq_log_once (slot_id, lecture_date)
) ENGINE=InnoDB;
```

### `syllabus_unit`

```sql
-- Syllabus
-- Defined once per subject. Progress through it is tracked per teaching
-- assignment, so each lab batch moves through the experiments on its own.
CREATE TABLE syllabus_unit (
  unit_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_id     BIGINT UNSIGNED NOT NULL,
  unit_number    TINYINT UNSIGNED NOT NULL,
  title          VARCHAR(200) NOT NULL,
  planned_hours  DECIMAL(5,1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_unit_subject FOREIGN KEY (subject_id) REFERENCES subject(subject_id),
  UNIQUE KEY uq_unit (subject_id, unit_number)
) ENGINE=InnoDB;
```

### `syllabus_topic`

```sql
CREATE TABLE syllabus_topic (
  topic_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  unit_id       BIGINT UNSIGNED NOT NULL,
  topic_number  TINYINT UNSIGNED NOT NULL,
  title         VARCHAR(200) NOT NULL,
  CONSTRAINT fk_topic_unit FOREIGN KEY (unit_id) REFERENCES syllabus_unit(unit_id) ON DELETE CASCADE,
  UNIQUE KEY uq_topic (unit_id, topic_number)
) ENGINE=InnoDB;
```

### `syllabus_subtopic`

```sql
CREATE TABLE syllabus_subtopic (
  subtopic_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  topic_id         BIGINT UNSIGNED NOT NULL,
  subtopic_number  TINYINT UNSIGNED NOT NULL,
  title            VARCHAR(250) NOT NULL,
  CONSTRAINT fk_subtopic_topic FOREIGN KEY (topic_id) REFERENCES syllabus_topic(topic_id) ON DELETE CASCADE,
  UNIQUE KEY uq_subtopic (topic_id, subtopic_number)
) ENGINE=InnoDB;
```

### `practical_experiment`

```sql
CREATE TABLE practical_experiment (
  experiment_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_id         BIGINT UNSIGNED NOT NULL,
  experiment_number  TINYINT UNSIGNED NOT NULL,
  title              VARCHAR(250) NOT NULL,
  planned_hours      DECIMAL(4,1) NOT NULL DEFAULT 2,
  CONSTRAINT fk_experiment_subject FOREIGN KEY (subject_id) REFERENCES subject(subject_id),
  UNIQUE KEY uq_experiment (subject_id, experiment_number)
) ENGINE=InnoDB;
```

### `syllabus_progress`

```sql
CREATE TABLE syllabus_progress (
  progress_id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id          BIGINT UNSIGNED NOT NULL,
  subtopic_id            BIGINT UNSIGNED NULL,
  experiment_id          BIGINT UNSIGNED NULL,
  completed_on           DATE NOT NULL,
  completed_by_staff_id  BIGINT UNSIGNED NOT NULL,
  log_id                 BIGINT UNSIGNED NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_progress_assignment FOREIGN KEY (assignment_id) REFERENCES teaching_assignment(assignment_id),
  CONSTRAINT fk_progress_subtopic   FOREIGN KEY (subtopic_id)   REFERENCES syllabus_subtopic(subtopic_id),
  CONSTRAINT fk_progress_experiment FOREIGN KEY (experiment_id) REFERENCES practical_experiment(experiment_id),
  CONSTRAINT fk_progress_staff      FOREIGN KEY (completed_by_staff_id) REFERENCES staff(staff_id),
  CONSTRAINT fk_progress_log        FOREIGN KEY (log_id) REFERENCES lecture_log(log_id),
  CONSTRAINT chk_progress_one_item CHECK (
    (subtopic_id IS NOT NULL AND experiment_id IS NULL) OR
    (subtopic_id IS NULL AND experiment_id IS NOT NULL)
  ),
  UNIQUE KEY uq_progress_subtopic   (assignment_id, subtopic_id),
  UNIQUE KEY uq_progress_experiment (assignment_id, experiment_id)
) ENGINE=InnoDB;
```

### `audit_log`

```sql
-- Audit trail
CREATE TABLE audit_log (
  audit_id    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NULL,
  action      VARCHAR(40) NOT NULL,          -- CREATE / UPDATE / DELETE / LOGIN ...
  entity      VARCHAR(40) NOT NULL,          -- "subject", "timetable_slot" ...
  entity_id   BIGINT UNSIGNED NULL,
  summary     VARCHAR(300) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE SET NULL,
  KEY ix_audit_time (created_at)
) ENGINE=InnoDB;
```

### Removing tables: `DROP` and `TRUNCATE`

The seed script empties every table before loading the starting data. It
lists the tables children first, and switches foreign key checks off for
those statements only:

```sql
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE audit_log;
TRUNCATE TABLE syllabus_progress;
-- ... and so on through every table, down to department
SET FOREIGN_KEY_CHECKS = 1;
```

`scripts.load_schema --empty` removes everything before loading again:

```sql
DROP TRIGGER trg_log_before_insert;            -- every trigger
DROP PROCEDURE sp_save_slot;                   -- every procedure
DROP FUNCTION fn_class_label;                  -- every function
DROP VIEW vw_timetable;                        -- every view
DROP TABLE timetable_slot;                     -- every table
```

---

## 4. Functions

### `fn_class_label`

```sql
DELIMITER $$

-- Helper: the human name of a class, "SY AI&DS G (2026-27)"
CREATE FUNCTION fn_class_label(p_section_id BIGINT UNSIGNED)
RETURNS VARCHAR(80)
READS SQL DATA
BEGIN
  DECLARE v_label VARCHAR(80);
  SELECT CONCAT(
           ELT(s.year_of_study, 'FY', 'SY', 'TY', 'LY', 'Y5', 'Y6'), ' ',
           p.short_name, ' ', s.division, ' (', s.academic_year, ')')
    INTO v_label
    FROM section s
    JOIN program p ON p.program_id = s.program_id
   WHERE s.section_id = p_section_id;
  RETURN v_label;
END$$

DELIMITER ;
```

### `fn_delivered_hours`

```sql
DELIMITER $$

-- Hours actually delivered for one teaching assignment: regular lectures
-- logged, plus make-up classes that took place. Without the second part a
-- lost lecture that WAS recovered would still look lost.
CREATE FUNCTION fn_delivered_hours(p_assignment_id BIGINT UNSIGNED)
RETURNS DECIMAL(7,2)
READS SQL DATA
BEGIN
  DECLARE v_regular DECIMAL(7,2);
  DECLARE v_makeup DECIMAL(7,2);

  SELECT COALESCE(SUM(ll.hours), 0)
    INTO v_regular
    FROM lecture_log ll
    JOIN timetable_slot ts ON ts.slot_id = ll.slot_id
   WHERE ts.assignment_id = p_assignment_id;

  SELECT COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(m.end_time, m.start_time)) / 3600), 0)
    INTO v_makeup
    FROM makeup_session m
    JOIN cancellation c    ON c.cancellation_id = m.cancellation_id
    JOIN timetable_slot ts ON ts.slot_id = c.slot_id
   WHERE ts.assignment_id = p_assignment_id AND m.status = 'DELIVERED';

  RETURN v_regular + v_makeup;
END$$

DELIMITER ;
```

Used inside queries like any built-in function:

```sql
SELECT section_id, fn_class_label(section_id) AS label FROM section;
SELECT fn_delivered_hours(42) AS hours_delivered;
```

---

## 5. Procedures

### `sp_check_assignment`

```sql
DELIMITER $$

-- teaching_assignment: a subject is taught to the whole class OR batch by
-- batch, never a mixture — and a batch must belong to the class.
CREATE PROCEDURE sp_check_assignment(
  IN p_assignment_id BIGINT UNSIGNED,   -- NULL when inserting
  IN p_offering_id   BIGINT UNSIGNED,
  IN p_lab_batch_id  BIGINT UNSIGNED)
BEGIN
  DECLARE v_section BIGINT UNSIGNED;
  DECLARE v_batch_section BIGINT UNSIGNED;

  SELECT section_id INTO v_section
    FROM subject_offering WHERE offering_id = p_offering_id;

  IF p_lab_batch_id IS NOT NULL THEN
    SELECT section_id INTO v_batch_section
      FROM lab_batch WHERE lab_batch_id = p_lab_batch_id;
    IF v_batch_section IS NULL OR v_batch_section <> v_section THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'That lab batch does not belong to this class';
    END IF;

    IF EXISTS (SELECT 1 FROM teaching_assignment
                WHERE offering_id = p_offering_id AND lab_batch_id IS NULL
                  AND assignment_id <> IFNULL(p_assignment_id, 0)) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This subject is already taught to the whole class; remove that before assigning by batch';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM teaching_assignment
                WHERE offering_id = p_offering_id AND lab_batch_id IS NOT NULL
                  AND assignment_id <> IFNULL(p_assignment_id, 0)) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This subject is already taught batch by batch; remove those before assigning the whole class';
    END IF;
  END IF;
END$$

DELIMITER ;
```

### `sp_save_slot`

```sql
DELIMITER $$

-- sp_save_slot — the one place a timetable slot is created or moved.
--
-- It refuses anything that would put a person or a room in two places:
--   * the TEACHER already teaching at that time — compared by staff_id,
--     across every subject they teach. (The previous version compared the
--     teacher-and-subject pairing, so someone teaching two subjects could be
--     booked into both at once.)
--   * the ROOM already holding as many groups as it can take
--   * the STUDENTS already busy: two sessions of one class clash unless
--     their audiences share no batch (a whole-class session shares every
--     batch). See vw_slot_audience for how a session's audience is found.
--   * a PRACTICAL session held in a room that is not a lab
--
-- p_type is LECTURE, TUTORIAL, PRACTICAL or EVALUATION.
-- p_batches is '' for the assignment's own audience, or a comma-separated
-- list of lab_batch ids ('3,4') when this session is for other batches —
-- "DBMS evaluation, G1 and G2", "OOP lab evaluation, all batches together".
--
-- Pass p_slot_id = NULL to create; pass an id to move an existing slot (it
-- is then excluded from its own clash checks). Returns the slot id.
CREATE PROCEDURE sp_save_slot(
  IN p_slot_id        BIGINT UNSIGNED,
  IN p_assignment_id  BIGINT UNSIGNED,
  IN p_room_id        BIGINT UNSIGNED,
  IN p_day            VARCHAR(3),
  IN p_start          TIME,
  IN p_end            TIME,
  IN p_type           VARCHAR(10),
  IN p_batches        VARCHAR(255))
BEGIN
  DECLARE v_staff    BIGINT UNSIGNED;
  DECLARE v_section  BIGINT UNSIGNED;
  DECLARE v_batch    BIGINT UNSIGNED;
  DECLARE v_type     VARCHAR(10);
  DECLARE v_room_type VARCHAR(10);
  DECLARE v_room_cap TINYINT;
  DECLARE v_in_room  INT;
  DECLARE v_self     BIGINT UNSIGNED DEFAULT IFNULL(p_slot_id, 0);
  DECLARE v_batches  VARCHAR(255) DEFAULT REPLACE(IFNULL(p_batches, ''), ' ', '');
  DECLARE v_whole    BOOLEAN;
  DECLARE v_id       BIGINT UNSIGNED;

  IF p_end <= p_start THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The session must end after it starts';
  END IF;

  SELECT ta.staff_id, so.section_id, ta.lab_batch_id, sub.subject_type
    INTO v_staff, v_section, v_batch, v_type
    FROM teaching_assignment ta
    JOIN subject_offering so ON so.offering_id = ta.offering_id
    JOIN subject sub         ON sub.subject_id = so.subject_id
   WHERE ta.assignment_id = p_assignment_id;

  IF v_staff IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That teaching assignment does not exist';
  END IF;

  SELECT room_type, concurrent_capacity INTO v_room_type, v_room_cap
    FROM room WHERE room_id = p_room_id;

  IF v_room_type IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That room does not exist';
  END IF;
  IF p_type NOT IN ('LECTURE','TUTORIAL','PRACTICAL','EVALUATION') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown session type';
  END IF;
  IF p_type = 'PRACTICAL' AND v_type <> 'PRACTICAL' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a practical subject can have a practical session';
  END IF;
  IF p_type = 'PRACTICAL' AND v_room_type <> 'LAB' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A practical has to be held in a lab';
  END IF;

  -- every batch named must belong to this class
  IF v_batches <> '' AND
     (SELECT COUNT(*) FROM lab_batch
       WHERE section_id = v_section AND FIND_IN_SET(lab_batch_id, v_batches))
     <> LENGTH(v_batches) - LENGTH(REPLACE(v_batches, ',', '')) + 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Those batches are not all in this class';
  END IF;
  SET v_whole = (v_batches = '' AND v_batch IS NULL);

  -- the teacher, across everything they teach
  IF EXISTS (
      SELECT 1 FROM timetable_slot ts
        JOIN teaching_assignment ta ON ta.assignment_id = ts.assignment_id
       WHERE ta.staff_id = v_staff
         AND ts.day_of_week = p_day
         AND ts.start_time < p_end AND ts.end_time > p_start
         AND ts.slot_id <> v_self) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The teacher is already teaching at that time';
  END IF;

  -- the room
  SELECT COUNT(*) INTO v_in_room
    FROM timetable_slot ts
   WHERE ts.room_id = p_room_id
     AND ts.day_of_week = p_day
     AND ts.start_time < p_end AND ts.end_time > p_start
     AND ts.slot_id <> v_self;
  IF v_in_room >= v_room_cap THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The room is already full at that time';
  END IF;

  -- the students
  IF EXISTS (
      SELECT 1 FROM timetable_slot ts
        JOIN vw_slot_audience a ON a.slot_id = ts.slot_id
       WHERE a.section_id = v_section
         AND ts.day_of_week = p_day
         AND ts.start_time < p_end AND ts.end_time > p_start
         AND ts.slot_id <> v_self
         AND (   v_whole                     -- a whole-class session clashes with anything
              OR a.lab_batch_id IS NULL      -- anything clashes with a whole-class session
              OR (v_batches <> '' AND FIND_IN_SET(a.lab_batch_id, v_batches))
              OR (v_batches =  '' AND a.lab_batch_id = v_batch))
     ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Those students already have a class at that time';
  END IF;

  IF p_slot_id IS NULL THEN
    INSERT INTO timetable_slot (assignment_id, room_id, day_of_week, start_time, end_time, session_type)
    VALUES (p_assignment_id, p_room_id, p_day, p_start, p_end, p_type);
    SET v_id = LAST_INSERT_ID();
  ELSE
    UPDATE timetable_slot
       SET assignment_id = p_assignment_id, room_id = p_room_id,
           day_of_week = p_day, start_time = p_start, end_time = p_end,
           session_type = p_type
     WHERE slot_id = p_slot_id;
    SET v_id = p_slot_id;
  END IF;

  DELETE FROM slot_batch WHERE slot_id = v_id;
  IF v_batches <> '' THEN
    INSERT INTO slot_batch (slot_id, lab_batch_id)
    SELECT v_id, lab_batch_id FROM lab_batch
     WHERE section_id = v_section AND FIND_IN_SET(lab_batch_id, v_batches);
  END IF;
  SELECT v_id AS slot_id;
END$$

DELIMITER ;
```

Calling it, as the admin timetable editor and the seed script do. The last
two arguments are the session type and a comma-separated list of lab batch
ids (empty for the teaching assignment's own audience):

```sql
-- a new session (slot id NULL): DBMS evaluation for batches 1 and 2, Tuesday 09:30
CALL sp_save_slot(NULL, 2, 1, 'TUE', '09:30', '10:30', 'EVALUATION', '1,2');

-- move session 7 to Friday, same teaching assignment
CALL sp_save_slot(7, 2, 3, 'FRI', '10:45', '11:45', 'LECTURE', '');
```

A clash stops it with `SIGNAL SQLSTATE '45000'` and a message such as
*The teacher is already teaching at that time*. The backend shows that
message to the user as it is.

---

## 6. Triggers

### `trg_assignment_before_insert`

```sql
DELIMITER $$

CREATE TRIGGER trg_assignment_before_insert
BEFORE INSERT ON teaching_assignment FOR EACH ROW
BEGIN
  CALL sp_check_assignment(NULL, NEW.offering_id, NEW.lab_batch_id);
END$$

DELIMITER ;
```

### `trg_assignment_before_update`

```sql
DELIMITER $$

CREATE TRIGGER trg_assignment_before_update
BEFORE UPDATE ON teaching_assignment FOR EACH ROW
BEGIN
  CALL sp_check_assignment(OLD.assignment_id, NEW.offering_id, NEW.lab_batch_id);
END$$

DELIMITER ;
```

### `trg_student_before_insert`

```sql
DELIMITER $$

-- student: the lab batch must be in the student's own class
CREATE TRIGGER trg_student_before_insert
BEFORE INSERT ON student FOR EACH ROW
BEGIN
  IF NEW.lab_batch_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM lab_batch
        WHERE lab_batch_id = NEW.lab_batch_id AND section_id = NEW.section_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'That lab batch is not in the student''s class';
  END IF;
END$$

DELIMITER ;
```

### `trg_student_before_update`

```sql
DELIMITER $$

CREATE TRIGGER trg_student_before_update
BEFORE UPDATE ON student FOR EACH ROW
BEGIN
  IF NEW.lab_batch_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM lab_batch
        WHERE lab_batch_id = NEW.lab_batch_id AND section_id = NEW.section_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'That lab batch is not in the student''s class';
  END IF;
END$$

DELIMITER ;
```

### `trg_log_before_insert`

```sql
DELIMITER $$

-- lecture_log: a lecture can only be logged on a day it actually happens —
-- the right weekday, inside the term the class is running in.
CREATE TRIGGER trg_log_before_insert
BEFORE INSERT ON lecture_log FOR EACH ROW
BEGIN
  DECLARE v_day VARCHAR(3);
  DECLARE v_start DATE;
  DECLARE v_end DATE;

  SELECT ts.day_of_week, t.start_date, t.end_date
    INTO v_day, v_start, v_end
    FROM timetable_slot ts
    JOIN teaching_assignment ta ON ta.assignment_id = ts.assignment_id
    JOIN subject_offering so    ON so.offering_id = ta.offering_id
    JOIN academic_term t        ON t.term_id = so.term_id
   WHERE ts.slot_id = NEW.slot_id;

  IF ELT(WEEKDAY(NEW.lecture_date) + 1, 'MON','TUE','WED','THU','FRI','SAT','SUN') <> v_day THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'That date is not a day this lecture runs';
  END IF;
  IF NEW.lecture_date < v_start OR NEW.lecture_date > v_end THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'That date falls outside the term';
  END IF;
END$$

DELIMITER ;
```

### `trg_cover_after_update`

```sql
DELIMITER $$

-- Keep a cancellation's status in step with what happened to it, so it can
-- never read OPEN while somebody has in fact agreed to cover it.
CREATE TRIGGER trg_cover_after_update
AFTER UPDATE ON cover_request FOR EACH ROW
BEGIN
  IF NEW.status = 'ACCEPTED' AND OLD.status <> 'ACCEPTED' THEN
    UPDATE cancellation SET status = 'COVERED'
     WHERE cancellation_id = NEW.cancellation_id;
  END IF;
END$$

DELIMITER ;
```

### `trg_makeup_after_insert`

```sql
DELIMITER $$

CREATE TRIGGER trg_makeup_after_insert
AFTER INSERT ON makeup_session FOR EACH ROW
BEGIN
  UPDATE cancellation SET status = 'RESCHEDULED'
   WHERE cancellation_id = NEW.cancellation_id;
END$$

DELIMITER ;
```

---

## 7. Views

### `vw_class`

```sql
-- Views

-- Every class with its full name and where it sits in the organisation.
CREATE OR REPLACE VIEW vw_class AS
SELECT s.section_id, fn_class_label(s.section_id) AS label,
       s.year_of_study, s.division, s.academic_year, s.student_count,
       p.program_id, p.code AS program_code, p.short_name AS program_short,
       d.department_id, d.code AS department_code
FROM section s
JOIN program p    ON p.program_id = s.program_id
JOIN department d ON d.department_id = p.department_id;
```

### `vw_slot_audience`

```sql
-- Who attends each session: one row per batch, or a single row with a NULL
-- batch when the whole class attends. A session's own slot_batch rows win;
-- without them it has its teaching assignment's audience.
CREATE OR REPLACE VIEW vw_slot_audience AS
SELECT ts.slot_id, so.section_id, sb.lab_batch_id
FROM timetable_slot ts
JOIN teaching_assignment ta ON ta.assignment_id = ts.assignment_id
JOIN subject_offering so    ON so.offering_id = ta.offering_id
JOIN slot_batch sb          ON sb.slot_id = ts.slot_id
UNION ALL
SELECT ts.slot_id, so.section_id, ta.lab_batch_id
FROM timetable_slot ts
JOIN teaching_assignment ta ON ta.assignment_id = ts.assignment_id
JOIN subject_offering so    ON so.offering_id = ta.offering_id
WHERE NOT EXISTS (SELECT 1 FROM slot_batch sb WHERE sb.slot_id = ts.slot_id);
```

### `vw_timetable`

```sql
-- The timetable, readable: names instead of ids.
--   lab_batch_id    the one batch attending, or NULL for the whole class or
--                   for several batches (so clash checks treat those as the
--                   whole class, which is the safe side)
--   lab_batch_code  who attends, for people: 'G1', 'G1, G2', or NULL
CREATE OR REPLACE VIEW vw_timetable AS
SELECT ts.slot_id, ts.day_of_week, ts.start_time, ts.end_time, ts.session_type,
       ta.assignment_id,
       CASE WHEN aud.n IS NULL THEN ta.lab_batch_id
            WHEN aud.n = 1     THEN aud.only_id END AS lab_batch_id,
       IFNULL(aud.codes, lb.code) AS lab_batch_code,
       ta.lab_batch_id AS assignment_batch_id,
       so.offering_id, so.term_id,
       sub.subject_id, sub.code AS subject_code, sub.name AS subject_name,
       sub.subject_type,
       s.section_id, fn_class_label(s.section_id) AS class_label,
       st.staff_id, CONCAT(st.first_name, ' ', st.last_name) AS teacher_name,
       r.room_id, r.code AS room_code, r.room_type
FROM timetable_slot ts
JOIN teaching_assignment ta ON ta.assignment_id = ts.assignment_id
JOIN subject_offering so    ON so.offering_id = ta.offering_id
JOIN subject sub            ON sub.subject_id = so.subject_id
JOIN section s              ON s.section_id = so.section_id
JOIN staff st               ON st.staff_id = ta.staff_id
JOIN room r                 ON r.room_id = ts.room_id
LEFT JOIN lab_batch lb      ON lb.lab_batch_id = ta.lab_batch_id
LEFT JOIN (SELECT sb.slot_id, COUNT(*) AS n, MIN(sb.lab_batch_id) AS only_id,
                  GROUP_CONCAT(b.code ORDER BY b.code SEPARATOR ', ') AS codes
             FROM slot_batch sb JOIN lab_batch b ON b.lab_batch_id = sb.lab_batch_id
            GROUP BY sb.slot_id) aud ON aud.slot_id = ts.slot_id;
```

### `vw_assignment_progress`

```sql
-- How far each teaching assignment is through its syllabus.
CREATE OR REPLACE VIEW vw_assignment_progress AS
SELECT ta.assignment_id, ta.offering_id, ta.lab_batch_id, ta.staff_id,
       so.section_id, sub.subject_id, sub.code AS subject_code, sub.subject_type,
       CASE sub.subject_type
         WHEN 'PRACTICAL' THEN
           (SELECT COUNT(*) FROM practical_experiment e WHERE e.subject_id = sub.subject_id)
         ELSE
           (SELECT COUNT(*) FROM syllabus_subtopic st
              JOIN syllabus_topic t ON t.topic_id = st.topic_id
              JOIN syllabus_unit u  ON u.unit_id  = t.unit_id
             WHERE u.subject_id = sub.subject_id)
       END AS total_items,
       (SELECT COUNT(*) FROM syllabus_progress p
         WHERE p.assignment_id = ta.assignment_id) AS completed_items
FROM teaching_assignment ta
JOIN subject_offering so ON so.offering_id = ta.offering_id
JOIN subject sub         ON sub.subject_id = so.subject_id;
```

### `vw_staff_load`

```sql
-- Each teacher's scheduled week against their contracted limit.
CREATE OR REPLACE VIEW vw_staff_load AS
SELECT st.staff_id, CONCAT(st.first_name, ' ', st.last_name) AS name,
       st.max_weekly_hours,
       COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(ts.end_time, ts.start_time))) / 3600, 0) AS weekly_hours,
       COUNT(ts.slot_id) AS weekly_sessions
FROM staff st
LEFT JOIN teaching_assignment ta ON ta.staff_id = st.staff_id
LEFT JOIN timetable_slot ts      ON ts.assignment_id = ta.assignment_id
WHERE st.is_active = TRUE
GROUP BY st.staff_id, st.first_name, st.last_name, st.max_weekly_hours;
```

---

## 8. DML: reading and changing data

The backend uses plain parameterised SQL. Every `%s` is filled in by the
database driver, never pasted into the string, so input cannot change the
query. The examples show the statements with sample values in place of `%s`.

### `INSERT`

Starting data, from `backend/scripts/seed.py` (a cut-down sample; the script
loads the full department, faculty, subjects, rooms and the Panel G
timetable):

```sql
INSERT INTO department (code, name)
VALUES ('DCET', 'Department of Computer Engineering and Technology');

INSERT INTO program (department_id, code, name, short_name, degree_level, duration_years)
VALUES (1, 'BTECH-AIDS', 'B.Tech in Artificial Intelligence and Data Science', 'AI&DS', 'UNDERGRADUATE', 5);

INSERT INTO academic_term (name, start_date, end_date, is_current)
VALUES ('2026-27 Odd Semester', '2026-07-20', '2027-01-15', TRUE);

INSERT INTO period (label, start_time, end_time, sort_order)
VALUES ('P1', '08:30', '09:30', 1);

INSERT INTO section (program_id, year_of_study, division, academic_year)
VALUES (1, 2, 'G', '2026-27');

INSERT INTO lab_batch (section_id, code) VALUES (1, 'G1'), (1, 'G2'), (1, 'G3');

INSERT INTO room (code, building, floor, capacity, room_type, concurrent_capacity)
VALUES ('VY115', 'VY', '1', 60, 'LECTURE', 1);

INSERT INTO staff (department_id, employee_code, first_name, last_name, email, designation)
VALUES (1, 'FAC-SBETGERI', 'Santushti', 'Betgeri', 'santushti.betgeri@mitwpu.edu.in', 'Faculty');

INSERT INTO role_assignment (staff_id, role) VALUES (1, 'FACULTY');

INSERT INTO app_user (email, password_hash, staff_id, must_change_password)
VALUES ('santushti.betgeri@mitwpu.edu.in', '<bcrypt hash>', 1, TRUE);

INSERT INTO subject (program_id, code, name, subject_type, planned_hours, credits)
VALUES (1, 'DBMS', 'Database Management Systems', 'THEORY', 45, 3);

INSERT INTO subject_offering (subject_id, section_id, term_id) VALUES (1, 1, 1);

INSERT INTO teaching_assignment (offering_id, lab_batch_id, staff_id) VALUES (1, NULL, 1);
```

Timetable sessions are never inserted directly: they go through
`sp_save_slot` (section 5) so the clash checks always run.

Handing a lecture over, from `backend/app/routers/handover.py`:

```sql
INSERT INTO cancellation (slot_id, lecture_date, reason, requested_by_staff_id)
VALUES (7, '2026-10-20', 'Workshop', 1);

INSERT INTO cover_request (cancellation_id, staff_id, chosen_by)
VALUES (3, 2, 'TEACHER');
```

Recording a lecture as taught (`handover.py`) and ticking off the syllabus
(`syllabus.py`):

```sql
INSERT INTO lecture_log (slot_id, lecture_date, delivered_by_staff_id, hours, remarks)
VALUES (7, '2026-10-13', 1, 1.00, 'Intro to normalisation');

INSERT INTO syllabus_progress (assignment_id, subtopic_id, experiment_id, completed_on, completed_by_staff_id)
VALUES (2, 15, NULL, '2026-10-13', 1);
```

Booking a make-up class, from `insight.py`:

```sql
INSERT INTO makeup_session (cancellation_id, session_date, start_time, end_time, room_id, staff_id)
VALUES (3, '2026-10-24', '13:30', '14:30', 5, 1);
```

### `SELECT`

A teacher's week, from `backend/app/sessions.py`. The view does the joins:

```sql
SELECT v.slot_id, v.day_of_week, v.start_time, v.end_time, v.session_type,
       v.subject_code, v.lab_batch_code, v.class_label, v.teacher_name, v.room_code
FROM vw_timetable v
WHERE v.staff_id = 1
ORDER BY FIELD(v.day_of_week, 'MON','TUE','WED','THU','FRI','SAT'), v.start_time;
```

A student's week: only the sessions their batch actually attends.

```sql
SELECT v.*
FROM vw_timetable v
WHERE v.section_id = 1
  AND EXISTS (SELECT 1 FROM vw_slot_audience a
               WHERE a.slot_id = v.slot_id
                 AND (a.lab_batch_id IS NULL OR a.lab_batch_id = 1));
```

Who could cover a lecture, from `handover.py` (shortened). Correlated
subqueries count each candidate's clashes and lectures this term:

```sql
SELECT st.staff_id, CONCAT(st.first_name, ' ', st.last_name) AS name,
       EXISTS (SELECT 1 FROM teaching_assignment ta
                 JOIN subject_offering so ON so.offering_id = ta.offering_id
                WHERE ta.staff_id = st.staff_id AND so.subject_id = 1) AS teaches_subject,
       (SELECT COUNT(*) FROM timetable_slot ts
          JOIN teaching_assignment ta ON ta.assignment_id = ts.assignment_id
         WHERE ta.staff_id = st.staff_id AND ts.day_of_week = 'TUE'
           AND ts.start_time < '15:30' AND ts.end_time > '13:30') AS own_clash,
       (SELECT COUNT(*) FROM lecture_log ll
         WHERE ll.delivered_by_staff_id = st.staff_id
           AND ll.lecture_date BETWEEN '2026-07-20' AND '2027-01-15') AS lectures_taken
FROM staff st
JOIN role_assignment ra ON ra.staff_id = st.staff_id AND ra.role = 'FACULTY'
WHERE st.is_active = TRUE
  AND EXISTS (SELECT 1 FROM app_user u WHERE u.staff_id = st.staff_id AND u.is_active = TRUE);
```

Each teacher's weekly hours against their contract, from `insight.py`:

```sql
SELECT name, max_weekly_hours, weekly_hours, weekly_sessions
FROM vw_staff_load
ORDER BY weekly_hours DESC;
```

### `UPDATE`

Accepting, declining and withdrawing cover, from `handover.py`. Accepting
fires `trg_cover_after_update`, which marks the cancellation `COVERED`:

```sql
UPDATE cover_request SET status = 'ACCEPTED', responded_at = NOW() WHERE cover_id = 5;

UPDATE cover_request SET status = 'DECLINED', responded_at = NOW() WHERE cover_id = 5;

UPDATE cover_request SET status = 'WITHDRAWN', responded_at = NOW()
 WHERE cancellation_id = 3 AND status IN ('PENDING','ACCEPTED');
UPDATE cancellation SET status = 'WITHDRAWN' WHERE cancellation_id = 3;
```

Passwords, from `auth.py` and `admin/people.py`:

```sql
UPDATE app_user SET password_hash = '<bcrypt hash>', must_change_password = FALSE WHERE user_id = 4;
UPDATE app_user SET password_hash = '<bcrypt hash>', must_change_password = TRUE  WHERE user_id = 4;
```

A make-up class that took place, from `insight.py`:

```sql
UPDATE makeup_session SET status = 'DELIVERED' WHERE makeup_id = 2;
```

### `DELETE`

```sql
-- unticking a syllabus item (syllabus.py)
DELETE FROM syllabus_progress WHERE progress_id = 9;

-- removing a timetable session that has no history (admin/timetable.py);
-- its slot_batch rows go with it through ON DELETE CASCADE
DELETE FROM timetable_slot WHERE slot_id = 34;
```

---

## 9. TCL: transactions

Everything that changes more than one row runs inside a transaction, so it
happens completely or not at all. Single statements run with autocommit on.
The backend's `transaction()` helper in `backend/app/db.py` does this:

```sql
SET autocommit = 0;
START TRANSACTION;
  -- ... the statements ...
COMMIT;        -- if they all succeeded
-- or
ROLLBACK;      -- if any of them failed: nothing is kept
SET autocommit = 1;
```

A real one: a teacher declines a cover request and it passes to the next
free teacher (`handover.py`). Without the transaction, a failure halfway could
leave a lecture declined by one person and offered to nobody:

```sql
START TRANSACTION;

UPDATE cover_request SET status = 'DECLINED', responded_at = NOW() WHERE cover_id = 5;

INSERT INTO cover_request (cancellation_id, staff_id, chosen_by) VALUES (3, 8, 'SYSTEM');

INSERT INTO audit_log (user_id, action, entity, entity_id, summary)
VALUES (4, 'DECLINE', 'cover_request', 5, 'Declined to cover a lecture');

COMMIT;
```

Booking a make-up class works the same way: the `makeup_session` insert, the
trigger that marks the cancellation `RESCHEDULED`, withdrawing any pending
cover request and the audit row all commit together.

The seed script loads all the starting data in one transaction. One caveat:
`TRUNCATE` is DDL, so the server commits it at once and a later `ROLLBACK`
cannot undo it.

---

## 10. Cursors

None. Every rule is a single set-based query: for example, `sp_save_slot`
checks all clashes with `EXISTS` subqueries over the whole timetable at once,
not by stepping through rows one at a time with a cursor. That is shorter,
faster, and easier to check. Row-by-row work, such as walking through
candidates for cover in order, is done in the Python backend.

---

## 11. Loading order, in one place

1. `CREATE DATABASE`, `CREATE USER`, `GRANT` (sections 1 and 2), or create
   both in hPanel on Hostinger
2. `backend/sql/schema.sql`: section 3
3. `backend/sql/routines.sql`: sections 4 to 7
4. `python -m scripts.seed`: the starting data (section 8)

Steps 2 and 3 together: `python -m scripts.load_schema`.
