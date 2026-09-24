-- ---------------------------------------------------------------------------
-- Syllabus tracking - NEW TABLES
-- ---------------------------------------------------------------------------
-- Added for the "lecture history + syllabus progress" feature.
--
-- Nothing already in the database is modified. These are five brand new
-- tables and one new view; no existing table, view, function or procedure is
-- altered or dropped, so everything built earlier keeps working.
--
-- A THEORY course is broken down as:   unit -> topic -> subtopic
-- A PRACTICAL course is broken down as: experiment
--
-- A teacher ticks off a subtopic (or an experiment) for one class, and that
-- tick is one row in syllabus_progress.
-- ---------------------------------------------------------------------------

USE u129569208_lectureplanner;

-- Unit 1, Unit 2, ... of a theory course
CREATE TABLE IF NOT EXISTS syllabus_unit (
  unit_id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id     BIGINT UNSIGNED NOT NULL,
  unit_number   TINYINT UNSIGNED NOT NULL,
  unit_title    VARCHAR(200) NOT NULL,
  planned_hours DECIMAL(5,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_unit_course FOREIGN KEY (course_id) REFERENCES course(course_id),
  CONSTRAINT chk_unit_number CHECK (unit_number > 0),
  CONSTRAINT chk_unit_hours CHECK (planned_hours >= 0),
  UNIQUE KEY uq_unit_course_number (course_id, unit_number)
) ENGINE=InnoDB;

-- The topics inside one unit
CREATE TABLE IF NOT EXISTS syllabus_topic (
  topic_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  unit_id      BIGINT UNSIGNED NOT NULL,
  topic_number TINYINT UNSIGNED NOT NULL,
  topic_title  VARCHAR(200) NOT NULL,
  CONSTRAINT fk_topic_unit FOREIGN KEY (unit_id) REFERENCES syllabus_unit(unit_id),
  CONSTRAINT chk_topic_number CHECK (topic_number > 0),
  UNIQUE KEY uq_topic_unit_number (unit_id, topic_number)
) ENGINE=InnoDB;

-- The smallest piece a teacher ticks off in a theory course
CREATE TABLE IF NOT EXISTS syllabus_subtopic (
  subtopic_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  topic_id        BIGINT UNSIGNED NOT NULL,
  subtopic_number TINYINT UNSIGNED NOT NULL,
  subtopic_title  VARCHAR(250) NOT NULL,
  CONSTRAINT fk_subtopic_topic FOREIGN KEY (topic_id) REFERENCES syllabus_topic(topic_id),
  CONSTRAINT chk_subtopic_number CHECK (subtopic_number > 0),
  UNIQUE KEY uq_subtopic_topic_number (topic_id, subtopic_number)
) ENGINE=InnoDB;

-- A practical course is a numbered list of experiments instead
CREATE TABLE IF NOT EXISTS practical_experiment (
  experiment_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id         BIGINT UNSIGNED NOT NULL,
  experiment_number TINYINT UNSIGNED NOT NULL,
  experiment_title  VARCHAR(250) NOT NULL,
  planned_hours     DECIMAL(5,2) NOT NULL DEFAULT 2,
  CONSTRAINT fk_experiment_course FOREIGN KEY (course_id) REFERENCES course(course_id),
  CONSTRAINT chk_experiment_number CHECK (experiment_number > 0),
  CONSTRAINT chk_experiment_hours CHECK (planned_hours >= 0),
  UNIQUE KEY uq_experiment_course_number (course_id, experiment_number)
) ENGINE=InnoDB;

-- One row = "this class has finished this subtopic / this experiment".
-- Progress is per CLASS (section_course_offering), because section G and
-- section H move through the syllabus at their own speed.
CREATE TABLE IF NOT EXISTS syllabus_progress (
  progress_id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  section_course_offering_id BIGINT UNSIGNED NOT NULL,
  subtopic_id                BIGINT UNSIGNED NULL,
  experiment_id              BIGINT UNSIGNED NULL,
  completed_on               DATE NOT NULL,
  completed_by_faculty_id    BIGINT UNSIGNED NOT NULL,
  lecture_log_id             BIGINT UNSIGNED NULL,
  remarks                    VARCHAR(500),
  created_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_progress_offering FOREIGN KEY (section_course_offering_id)
    REFERENCES section_course_offering(section_course_offering_id),
  CONSTRAINT fk_progress_subtopic FOREIGN KEY (subtopic_id)
    REFERENCES syllabus_subtopic(subtopic_id),
  CONSTRAINT fk_progress_experiment FOREIGN KEY (experiment_id)
    REFERENCES practical_experiment(experiment_id),
  CONSTRAINT fk_progress_faculty FOREIGN KEY (completed_by_faculty_id)
    REFERENCES faculty(faculty_id),
  CONSTRAINT fk_progress_log FOREIGN KEY (lecture_log_id)
    REFERENCES lecture_log(lecture_log_id),
  -- exactly one of the two must be filled in, never both, never neither
  CONSTRAINT chk_progress_one_item CHECK (
    (subtopic_id IS NOT NULL AND experiment_id IS NULL) OR
    (subtopic_id IS NULL AND experiment_id IS NOT NULL)
  ),
  -- a class cannot finish the same subtopic / experiment twice
  UNIQUE KEY uq_progress_subtopic (section_course_offering_id, subtopic_id),
  UNIQUE KEY uq_progress_experiment (section_course_offering_id, experiment_id)
) ENGINE=InnoDB;

-- How far each class has got in each subject, worked out live.
CREATE OR REPLACE VIEW vw_syllabus_progress AS
SELECT sco.section_course_offering_id,
       s.section_name,
       c.course_code,
       c.course_name,
       c.course_type,
       (SELECT COUNT(*)
          FROM syllabus_subtopic st
          JOIN syllabus_topic t ON t.topic_id = st.topic_id
          JOIN syllabus_unit u  ON u.unit_id  = t.unit_id
         WHERE u.course_id = c.course_id)
     + (SELECT COUNT(*)
          FROM practical_experiment e
         WHERE e.course_id = c.course_id) AS total_items,
       (SELECT COUNT(*)
          FROM syllabus_progress p
         WHERE p.section_course_offering_id = sco.section_course_offering_id) AS completed_items,
       ROUND(
         (SELECT COUNT(*) FROM syllabus_progress p
           WHERE p.section_course_offering_id = sco.section_course_offering_id)
         / NULLIF(
             (SELECT COUNT(*)
                FROM syllabus_subtopic st
                JOIN syllabus_topic t ON t.topic_id = st.topic_id
                JOIN syllabus_unit u  ON u.unit_id  = t.unit_id
               WHERE u.course_id = c.course_id)
           + (SELECT COUNT(*) FROM practical_experiment e WHERE e.course_id = c.course_id), 0)
         * 100, 2) AS percent_complete
FROM section_course_offering sco
JOIN section s ON s.section_id = sco.section_id
JOIN program_curriculum pc ON pc.curriculum_id = sco.curriculum_id
JOIN course c ON c.course_id = pc.course_id;
