-- ===========================================================================
-- Continuity — schema
-- ===========================================================================
-- MySQL 8.0.16+ / MariaDB 10.5+. Run against an EMPTY database.
--
-- The model this schema encodes:
--
--   department (DCET)
--     └─ program (B.Tech AI & DS)
--          └─ section  = one class, e.g. SY AI&DS G for 2026-27
--               └─ lab_batch  G1, G2, G3
--
--   subject            a course, defined once
--   subject_offering   that subject offered to one class for one term
--   teaching_assignment
--                      who teaches an offering — to the whole class, OR to one
--                      lab batch. Never both for the same offering.
--   timetable_slot     when and where an assignment meets each week
--
--   staff              anyone employed: teachers, coordinators, admins
--   role_assignment    a staff member can hold several roles at once, each
--                      with its own scope (a department, a programme, a year,
--                      a class)
--   student            entirely separate from staff; a student never holds a
--                      staff role
--   app_user           a login, belonging to exactly one staff member OR
--                      exactly one student
--
-- A note on CHECK constraints: MySQL will not let a CHECK read a column that a
-- foreign key cascades on. Where a column appears in a CHECK its foreign key
-- is therefore left as RESTRICT — which is also the safer behaviour: removing
-- something still referenced should fail loudly, not silently cascade.
-- ===========================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Organisation
-- ---------------------------------------------------------------------------
CREATE TABLE department (
  department_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(20)  NOT NULL UNIQUE,
  name           VARCHAR(160) NOT NULL UNIQUE,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

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

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Classes
-- ---------------------------------------------------------------------------
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

CREATE TABLE lab_batch (
  lab_batch_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  section_id    BIGINT UNSIGNED NOT NULL,
  code          VARCHAR(10) NOT NULL,           -- "G1"
  CONSTRAINT fk_lab_batch_section FOREIGN KEY (section_id) REFERENCES section(section_id),
  UNIQUE KEY uq_lab_batch (section_id, code)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Subjects and who teaches them
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Timetable
-- ---------------------------------------------------------------------------
-- A weekly rule, not a lecture: "this assignment meets Monday 09:30 in VY115".
-- The actual dated lectures are this rule projected across the term.
CREATE TABLE timetable_slot (
  slot_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id  BIGINT UNSIGNED NOT NULL,
  room_id        BIGINT UNSIGNED NOT NULL,
  day_of_week    ENUM('MON','TUE','WED','THU','FRI','SAT') NOT NULL,
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  CONSTRAINT fk_slot_assignment FOREIGN KEY (assignment_id) REFERENCES teaching_assignment(assignment_id),
  CONSTRAINT fk_slot_room       FOREIGN KEY (room_id)       REFERENCES room(room_id),
  CONSTRAINT chk_slot_times CHECK (end_time > start_time),
  KEY ix_slot_day_time (day_of_week, start_time)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- When a lecture cannot happen
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Syllabus
-- ---------------------------------------------------------------------------
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

CREATE TABLE syllabus_topic (
  topic_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  unit_id       BIGINT UNSIGNED NOT NULL,
  topic_number  TINYINT UNSIGNED NOT NULL,
  title         VARCHAR(200) NOT NULL,
  CONSTRAINT fk_topic_unit FOREIGN KEY (unit_id) REFERENCES syllabus_unit(unit_id) ON DELETE CASCADE,
  UNIQUE KEY uq_topic (unit_id, topic_number)
) ENGINE=InnoDB;

CREATE TABLE syllabus_subtopic (
  subtopic_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  topic_id         BIGINT UNSIGNED NOT NULL,
  subtopic_number  TINYINT UNSIGNED NOT NULL,
  title            VARCHAR(250) NOT NULL,
  CONSTRAINT fk_subtopic_topic FOREIGN KEY (topic_id) REFERENCES syllabus_topic(topic_id) ON DELETE CASCADE,
  UNIQUE KEY uq_subtopic (topic_id, subtopic_number)
) ENGINE=InnoDB;

CREATE TABLE practical_experiment (
  experiment_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_id         BIGINT UNSIGNED NOT NULL,
  experiment_number  TINYINT UNSIGNED NOT NULL,
  title              VARCHAR(250) NOT NULL,
  planned_hours      DECIMAL(4,1) NOT NULL DEFAULT 2,
  CONSTRAINT fk_experiment_subject FOREIGN KEY (subject_id) REFERENCES subject(subject_id),
  UNIQUE KEY uq_experiment (subject_id, experiment_number)
) ENGINE=InnoDB;

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

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
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
