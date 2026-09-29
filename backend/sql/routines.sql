-- ===========================================================================
-- Continuity — triggers, functions, procedures and views
-- ===========================================================================
-- Run after schema.sql. Statements are separated by $$ because the bodies of
-- triggers and procedures contain semicolons of their own.
--
-- The rule followed here: anything that must ALWAYS be true about the data
-- is enforced in the database, not only in the application, so it holds no
-- matter which program writes the row. The application checks the same
-- things first to give friendlier messages; these are the backstop.
-- ===========================================================================

DELIMITER $$

-- ---------------------------------------------------------------------------
-- Helper: the human name of a class, "SY AI&DS G (2026-27)"
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Hours actually delivered for one teaching assignment
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_delivered_hours(p_assignment_id BIGINT UNSIGNED)
RETURNS DECIMAL(7,2)
READS SQL DATA
BEGIN
  DECLARE v_hours DECIMAL(7,2);
  SELECT COALESCE(SUM(ll.hours), 0)
    INTO v_hours
    FROM lecture_log ll
    JOIN timetable_slot ts ON ts.slot_id = ll.slot_id
   WHERE ts.assignment_id = p_assignment_id;
  RETURN v_hours;
END$$

-- ---------------------------------------------------------------------------
-- teaching_assignment: a subject is taught to the whole class OR batch by
-- batch, never a mixture — and a batch must belong to the class.
-- ---------------------------------------------------------------------------
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

CREATE TRIGGER trg_assignment_before_insert
BEFORE INSERT ON teaching_assignment FOR EACH ROW
BEGIN
  CALL sp_check_assignment(NULL, NEW.offering_id, NEW.lab_batch_id);
END$$

CREATE TRIGGER trg_assignment_before_update
BEFORE UPDATE ON teaching_assignment FOR EACH ROW
BEGIN
  CALL sp_check_assignment(OLD.assignment_id, NEW.offering_id, NEW.lab_batch_id);
END$$

-- ---------------------------------------------------------------------------
-- student: the lab batch must be in the student's own class
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- lecture_log: a lecture can only be logged on a day it actually happens —
-- the right weekday, inside the term the class is running in.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Keep a cancellation's status in step with what happened to it, so it can
-- never read OPEN while somebody has in fact agreed to cover it.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_cover_after_update
AFTER UPDATE ON cover_request FOR EACH ROW
BEGIN
  IF NEW.status = 'ACCEPTED' AND OLD.status <> 'ACCEPTED' THEN
    UPDATE cancellation SET status = 'COVERED'
     WHERE cancellation_id = NEW.cancellation_id;
  END IF;
END$$

CREATE TRIGGER trg_makeup_after_insert
AFTER INSERT ON makeup_session FOR EACH ROW
BEGIN
  UPDATE cancellation SET status = 'RESCHEDULED'
   WHERE cancellation_id = NEW.cancellation_id;
END$$

-- ---------------------------------------------------------------------------
-- sp_save_slot — the one place a timetable slot is created or moved.
--
-- It refuses anything that would put a person or a room in two places:
--   * the TEACHER already teaching at that time — compared by staff_id,
--     across every subject they teach. (The previous version compared the
--     teacher-and-subject pairing, so someone teaching two subjects could be
--     booked into both at once.)
--   * the ROOM already holding as many groups as it can take
--   * the STUDENTS already busy: the whole class in anything, or this batch
--     in anything, or the whole class if this is a batch session
--   * a practical held in a room that is not a lab
--
-- Pass p_slot_id = NULL to create; pass an id to move an existing slot (it
-- is then excluded from its own clash checks). Returns the slot id.
-- ---------------------------------------------------------------------------
CREATE PROCEDURE sp_save_slot(
  IN p_slot_id        BIGINT UNSIGNED,
  IN p_assignment_id  BIGINT UNSIGNED,
  IN p_room_id        BIGINT UNSIGNED,
  IN p_day            VARCHAR(3),
  IN p_start          TIME,
  IN p_end            TIME)
BEGIN
  DECLARE v_staff    BIGINT UNSIGNED;
  DECLARE v_section  BIGINT UNSIGNED;
  DECLARE v_batch    BIGINT UNSIGNED;
  DECLARE v_type     VARCHAR(10);
  DECLARE v_room_type VARCHAR(10);
  DECLARE v_room_cap TINYINT;
  DECLARE v_in_room  INT;
  DECLARE v_self     BIGINT UNSIGNED DEFAULT IFNULL(p_slot_id, 0);

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
  IF v_type = 'PRACTICAL' AND v_room_type <> 'LAB' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A practical has to be held in a lab';
  END IF;

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
        JOIN teaching_assignment ta ON ta.assignment_id = ts.assignment_id
        JOIN subject_offering so    ON so.offering_id = ta.offering_id
       WHERE so.section_id = v_section
         AND ts.day_of_week = p_day
         AND ts.start_time < p_end AND ts.end_time > p_start
         AND ts.slot_id <> v_self
         AND (   v_batch IS NULL             -- a whole-class session clashes with anything
              OR ta.lab_batch_id IS NULL     -- anything clashes with a whole-class session
              OR ta.lab_batch_id = v_batch)  -- a batch clashes with itself
     ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Those students already have a class at that time';
  END IF;

  IF p_slot_id IS NULL THEN
    INSERT INTO timetable_slot (assignment_id, room_id, day_of_week, start_time, end_time)
    VALUES (p_assignment_id, p_room_id, p_day, p_start, p_end);
    SELECT LAST_INSERT_ID() AS slot_id;
  ELSE
    UPDATE timetable_slot
       SET assignment_id = p_assignment_id, room_id = p_room_id,
           day_of_week = p_day, start_time = p_start, end_time = p_end
     WHERE slot_id = p_slot_id;
    SELECT p_slot_id AS slot_id;
  END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Every class with its full name and where it sits in the organisation.
CREATE OR REPLACE VIEW vw_class AS
SELECT s.section_id, fn_class_label(s.section_id) AS label,
       s.year_of_study, s.division, s.academic_year, s.student_count,
       p.program_id, p.code AS program_code, p.short_name AS program_short,
       d.department_id, d.code AS department_code
FROM section s
JOIN program p    ON p.program_id = s.program_id
JOIN department d ON d.department_id = p.department_id;

-- The timetable, readable: names instead of ids.
CREATE OR REPLACE VIEW vw_timetable AS
SELECT ts.slot_id, ts.day_of_week, ts.start_time, ts.end_time,
       ta.assignment_id, ta.lab_batch_id, lb.code AS lab_batch_code,
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
LEFT JOIN lab_batch lb      ON lb.lab_batch_id = ta.lab_batch_id;

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
