# Database changes for the syllabus feature

Everything below was run against the live database by
`backend/scripts/setup_syllabus.py`. It is all **additive**: five new
tables and one new view. No existing table, view, function or stored
procedure was altered or dropped, so every feature built before this
still works exactly as it did.

## Why new tables were needed

The old schema could say *how many hours* of a course had been
delivered, but it had nowhere to record *what was actually taught*.
Tracking units, topics and subtopics (and experiment numbers for the
labs) needs its own tables.

## The design

```
course
  |-- syllabus_unit        (Unit 1, Unit 2, ...)        THEORY courses
        |-- syllabus_topic
              |-- syllabus_subtopic   <- the thing a teacher ticks off
  |-- practical_experiment (Experiment 1, 2, ...)       PRACTICAL courses

syllabus_progress  = one tick. It points at a subtopic OR an experiment
                     (a CHECK constraint enforces exactly one), and at
                     the section_course_offering, because section G and
                     section H move through the syllabus separately.
```

## 1. Tables and view created

```sql
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
CREATE TABLE IF NOT EXISTS syllabus_topic (
  topic_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  unit_id      BIGINT UNSIGNED NOT NULL,
  topic_number TINYINT UNSIGNED NOT NULL,
  topic_title  VARCHAR(200) NOT NULL,
  CONSTRAINT fk_topic_unit FOREIGN KEY (unit_id) REFERENCES syllabus_unit(unit_id),
  CONSTRAINT chk_topic_number CHECK (topic_number > 0),
  UNIQUE KEY uq_topic_unit_number (unit_id, topic_number)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS syllabus_subtopic (
  subtopic_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  topic_id        BIGINT UNSIGNED NOT NULL,
  subtopic_number TINYINT UNSIGNED NOT NULL,
  subtopic_title  VARCHAR(250) NOT NULL,
  CONSTRAINT fk_subtopic_topic FOREIGN KEY (topic_id) REFERENCES syllabus_topic(topic_id),
  CONSTRAINT chk_subtopic_number CHECK (subtopic_number > 0),
  UNIQUE KEY uq_subtopic_topic_number (topic_id, subtopic_number)
) ENGINE=InnoDB;
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
  CONSTRAINT chk_progress_one_item CHECK (
    (subtopic_id IS NOT NULL AND experiment_id IS NULL) OR
    (subtopic_id IS NULL AND experiment_id IS NOT NULL)
  ),
  UNIQUE KEY uq_progress_subtopic (section_course_offering_id, subtopic_id),
  UNIQUE KEY uq_progress_experiment (section_course_offering_id, experiment_id)
) ENGINE=InnoDB;
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
```

## 2. Syllabus content inserted

Totals now in the database: **28 units, 44 topics, 114 subtopics, 45 experiments**.

```sql
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (1, 1, 'Introduction to Database Systems', 8);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (1, 1, 'Database Concepts');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (1, 1, 'File system versus DBMS');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (1, 2, 'Three schema architecture');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (1, 3, 'Data independence');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (1, 2, 'Data Models');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (2, 1, 'Hierarchical and network models');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (2, 2, 'Relational model');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (2, 3, 'Object oriented model');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (1, 2, 'Entity Relationship Modelling', 9);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (2, 1, 'ER Model');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (3, 1, 'Entities and attributes');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (3, 2, 'Relationships and cardinality');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (3, 3, 'Weak entity sets');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (2, 2, 'Extended ER');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (4, 1, 'Generalisation and specialisation');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (4, 2, 'Converting an ER diagram to tables');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (1, 3, 'Relational Model and SQL', 12);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (3, 1, 'Relational Algebra');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (5, 1, 'Selection, projection and join');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (5, 2, 'Set operations');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (5, 3, 'Division operation');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (3, 2, 'SQL');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (6, 1, 'DDL commands');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (6, 2, 'DML commands and simple queries');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (6, 3, 'Joins and subqueries');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (6, 4, 'Views and indexes');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (1, 4, 'Relational Database Design', 8);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (4, 1, 'Functional Dependencies');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (7, 1, 'Armstrong''s axioms');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (7, 2, 'Closure of attributes and keys');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (4, 2, 'Normal Forms');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (8, 1, '1NF, 2NF and 3NF');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (8, 2, 'BCNF');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (8, 3, 'Decomposition and lossless join');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (1, 5, 'Transactions and Concurrency', 8);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (5, 1, 'Transactions');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (9, 1, 'ACID properties');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (9, 2, 'States of a transaction');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (5, 2, 'Concurrency Control');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (10, 1, 'Lock based protocols');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (10, 2, 'Two phase locking');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (10, 3, 'Deadlock handling');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (5, 3, 'Recovery');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (11, 1, 'Log based recovery');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (11, 2, 'Checkpoints');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (4, 1, 'Introduction to Data Structures', 7);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (6, 1, 'Basics');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (12, 1, 'Abstract data types');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (12, 2, 'Time and space complexity');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (12, 3, 'Asymptotic notation');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (4, 2, 'Arrays and Linked Lists', 10);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (7, 1, 'Arrays');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (13, 1, 'One and two dimensional arrays');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (13, 2, 'Sparse matrices');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (7, 2, 'Linked Lists');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (14, 1, 'Singly linked list');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (14, 2, 'Doubly linked list');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (14, 3, 'Circular linked list');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (4, 3, 'Stacks and Queues', 9);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (8, 1, 'Stacks');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (15, 1, 'Stack operations');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (15, 2, 'Infix to postfix conversion');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (15, 3, 'Recursion using stacks');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (8, 2, 'Queues');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (16, 1, 'Linear queue');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (16, 2, 'Circular queue');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (16, 3, 'Priority queue');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (4, 4, 'Trees', 10);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (9, 1, 'Binary Trees');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (17, 1, 'Tree traversals');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (17, 2, 'Binary search tree operations');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (9, 2, 'Balanced Trees');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (18, 1, 'AVL trees and rotations');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (18, 2, 'Threaded binary trees');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (4, 5, 'Searching and Sorting', 9);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (10, 1, 'Searching');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (19, 1, 'Linear search');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (19, 2, 'Binary search');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (10, 2, 'Sorting');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (20, 1, 'Bubble and selection sort');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (20, 2, 'Insertion and shell sort');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (20, 3, 'Quick and merge sort');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (20, 4, 'Radix sort');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (6, 1, 'Introduction to Operating Systems', 7);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (11, 1, 'Operating System Basics');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (21, 1, 'Functions of an operating system');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (21, 2, 'Types of operating systems');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (21, 3, 'System calls');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (6, 2, 'Process Management', 10);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (12, 1, 'Processes');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (22, 1, 'Process states');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (22, 2, 'Process control block');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (22, 3, 'Threads');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (12, 2, 'CPU Scheduling');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (23, 1, 'FCFS and SJF');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (23, 2, 'Round robin scheduling');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (23, 3, 'Priority scheduling');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (6, 3, 'Synchronisation and Deadlock', 10);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (13, 1, 'Process Synchronisation');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (24, 1, 'The critical section problem');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (24, 2, 'Semaphores');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (24, 3, 'Producer consumer problem');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (13, 2, 'Deadlock');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (25, 1, 'Necessary conditions');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (25, 2, 'Banker''s algorithm');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (25, 3, 'Detection and recovery');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (6, 4, 'Memory Management', 10);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (14, 1, 'Main Memory');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (26, 1, 'Contiguous allocation');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (26, 2, 'Paging');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (26, 3, 'Segmentation');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (14, 2, 'Virtual Memory');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (27, 1, 'Demand paging');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (27, 2, 'Page replacement algorithms');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (27, 3, 'Thrashing');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (6, 5, 'File Systems and I/O', 8);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (15, 1, 'File System');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (28, 1, 'File allocation methods');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (28, 2, 'Directory structure');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (15, 2, 'Disk Management');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (29, 1, 'Disk scheduling algorithms');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (9, 1, 'Differential Calculus', 9);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (16, 1, 'Differentiation');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (30, 1, 'Successive differentiation');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (30, 2, 'Taylor and Maclaurin series');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (30, 3, 'Indeterminate forms');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (9, 2, 'Partial Differentiation', 9);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (17, 1, 'Partial Derivatives');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (31, 1, 'Partial differentiation');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (31, 2, 'Euler''s theorem');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (31, 3, 'Maxima and minima of two variables');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (9, 3, 'Integral Calculus', 9);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (18, 1, 'Integration');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (32, 1, 'Beta and gamma functions');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (32, 2, 'Double and triple integrals');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (32, 3, 'Applications of integration');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (9, 4, 'Numerical Solution of Equations', 9);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (19, 1, 'Roots of Equations');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (33, 1, 'Bisection method');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (33, 2, 'Newton Raphson method');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (33, 3, 'Regula falsi method');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (19, 2, 'Systems of Equations');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (34, 1, 'Gauss elimination');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (34, 2, 'Gauss Seidel iteration');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (9, 5, 'Interpolation and Numerical Integration', 9);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (20, 1, 'Interpolation');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (35, 1, 'Newton''s forward and backward formulae');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (35, 2, 'Lagrange''s interpolation');
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (20, 2, 'Numerical Integration');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (36, 1, 'Trapezoidal rule');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (36, 2, 'Simpson''s rules');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (8, 1, 'Communication Skills', 7);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (21, 1, 'Communication');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (37, 1, 'Verbal communication');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (37, 2, 'Written communication');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (37, 3, 'Presentation skills');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (8, 2, 'Aptitude and Reasoning', 7);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (22, 1, 'Aptitude');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (38, 1, 'Quantitative aptitude');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (38, 2, 'Logical reasoning');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (8, 3, 'Career Readiness', 6);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (23, 1, 'Placement Preparation');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (39, 1, 'Resume building');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (39, 2, 'Group discussion');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (39, 3, 'Interview skills');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (10, 1, 'Indian Knowledge Systems', 8);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (24, 1, 'Ancient Knowledge');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (40, 1, 'Vedic literature');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (40, 2, 'Science in ancient India');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (10, 2, 'Art and Heritage', 7);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (25, 1, 'Indian Culture');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (41, 1, 'Indian classical art forms');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (41, 2, 'Architecture and heritage sites');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (10, 3, 'Philosophy and Values', 7);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (26, 1, 'Indian Thought');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (42, 1, 'Schools of Indian philosophy');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (42, 2, 'Ethics and values in modern life');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (12, 1, 'Foundations of the Elective', 15);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (27, 1, 'Introduction');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (43, 1, 'Scope of the elective area');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (43, 2, 'Core concepts');
INSERT INTO syllabus_unit (course_id, unit_number, unit_title, planned_hours) VALUES (12, 2, 'Applications', 15);
INSERT INTO syllabus_topic (unit_id, topic_number, topic_title) VALUES (28, 1, 'Applied Work');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (44, 1, 'Case studies');
INSERT INTO syllabus_subtopic (topic_id, subtopic_number, subtopic_title) VALUES (44, 2, 'Mini project');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (2, 1, 'Draw an ER diagram and convert it to relational tables');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (2, 2, 'DDL commands - create, alter, drop');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (2, 3, 'DML commands and integrity constraints');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (2, 4, 'SQL queries using joins');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (2, 5, 'Subqueries, views and indexes');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (2, 6, 'PL/SQL blocks and stored procedures');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (2, 7, 'Cursors and triggers');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (2, 8, 'Normalisation case study up to BCNF');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (2, 9, 'Transactions, commit, rollback and savepoints');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (2, 10, 'Mini project - database with a front end');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (3, 1, 'Classes, objects and member functions');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (3, 2, 'Constructors and destructors');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (3, 3, 'Function overloading and operator overloading');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (3, 4, 'Inheritance and its types');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (3, 5, 'Polymorphism and virtual functions');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (3, 6, 'Templates and generic programming');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (3, 7, 'Exception handling');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (3, 8, 'File handling');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (3, 9, 'Standard template library / collections');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (3, 10, 'Mini project using object oriented design');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (5, 1, 'Array operations and sparse matrix representation');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (5, 2, 'Singly linked list operations');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (5, 3, 'Doubly and circular linked lists');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (5, 4, 'Stack using array and using linked list');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (5, 5, 'Infix to postfix conversion and evaluation');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (5, 6, 'Linear queue and circular queue');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (5, 7, 'Binary search tree operations');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (5, 8, 'Binary tree traversals');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (5, 9, 'Comparison of sorting algorithms');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (5, 10, 'Searching techniques and hashing');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (7, 1, 'Basic Linux commands');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (7, 2, 'Shell scripting');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (7, 3, 'Process creation using fork and exec');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (7, 4, 'CPU scheduling - FCFS and SJF');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (7, 5, 'CPU scheduling - round robin and priority');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (7, 6, 'Producer consumer problem using semaphores');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (7, 7, 'Banker''s algorithm for deadlock avoidance');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (7, 8, 'Page replacement algorithms');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (7, 9, 'Disk scheduling algorithms');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (7, 10, 'Memory allocation strategies');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (11, 1, 'Problem identification and definition');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (11, 2, 'Literature survey');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (11, 3, 'Design thinking and ideation');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (11, 4, 'Prototype development');
INSERT INTO practical_experiment (course_id, experiment_number, experiment_title) VALUES (11, 5, 'Project presentation and report');
```

## Rolling it back

These five tables are not used by anything that existed before, so
dropping them puts the database back exactly as it was:

```sql
DROP VIEW IF EXISTS vw_syllabus_progress;
DROP TABLE IF EXISTS syllabus_progress;
DROP TABLE IF EXISTS syllabus_subtopic;
DROP TABLE IF EXISTS syllabus_topic;
DROP TABLE IF EXISTS syllabus_unit;
DROP TABLE IF EXISTS practical_experiment;
```
