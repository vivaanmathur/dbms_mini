USE u129569208_lectureplanner;
-- MySQL 8.0+ / MariaDB 10.5+. Run after selecting your empty database.
USE u129569208_lectureplanner;

CREATE TABLE department (
  department_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_code VARCHAR(20) NOT NULL UNIQUE,
  department_name VARCHAR(160) NOT NULL UNIQUE,
  contact_email VARCHAR(255), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE program (
  program_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id BIGINT UNSIGNED NOT NULL, program_code VARCHAR(30) NOT NULL UNIQUE,
  program_name VARCHAR(180) NOT NULL, degree_level VARCHAR(30) NOT NULL,
  duration_years TINYINT UNSIGNED NOT NULL, total_semesters TINYINT UNSIGNED NOT NULL,
  CONSTRAINT fk_program_department FOREIGN KEY (department_id) REFERENCES department(department_id),
  CONSTRAINT chk_program_duration CHECK (duration_years > 0), CONSTRAINT chk_program_semesters CHECK (total_semesters > 0)
) ENGINE=InnoDB;

CREATE TABLE faculty (
  faculty_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id BIGINT UNSIGNED NOT NULL, employee_code VARCHAR(30) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL, last_name VARCHAR(80) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
  designation VARCHAR(100) NOT NULL, max_weekly_workload_hours DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_faculty_department FOREIGN KEY (department_id) REFERENCES department(department_id),
  CONSTRAINT chk_faculty_hours CHECK (max_weekly_workload_hours > 0)
) ENGINE=InnoDB;

CREATE TABLE app_user (
  user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, faculty_id BIGINT UNSIGNED NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
  user_role ENUM('ADMIN','HOD','FACULTY') NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_user_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id)
) ENGINE=InnoDB;

CREATE TABLE academic_batch (
  batch_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, program_id BIGINT UNSIGNED NOT NULL,
  admission_year SMALLINT UNSIGNED NOT NULL, graduation_year SMALLINT UNSIGNED NOT NULL,
  current_year_number TINYINT UNSIGNED NOT NULL, current_semester TINYINT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_batch_program FOREIGN KEY (program_id) REFERENCES program(program_id),
  CONSTRAINT chk_batch_years CHECK (graduation_year >= admission_year),
  CONSTRAINT chk_batch_year CHECK (current_year_number > 0), CONSTRAINT chk_batch_sem CHECK (current_semester > 0),
  UNIQUE KEY uq_batch_program_year (program_id,admission_year)
) ENGINE=InnoDB;

CREATE TABLE section (
  section_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, batch_id BIGINT UNSIGNED NOT NULL,
  section_name VARCHAR(20) NOT NULL, student_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_section_batch FOREIGN KEY (batch_id) REFERENCES academic_batch(batch_id),
  UNIQUE KEY uq_section_batch_name (batch_id,section_name)
) ENGINE=InnoDB;

CREATE TABLE lab_batch (
  lab_batch_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, section_id BIGINT UNSIGNED NOT NULL,
  lab_batch_code VARCHAR(20) NOT NULL,
  CONSTRAINT fk_lab_batch_section FOREIGN KEY (section_id) REFERENCES section(section_id),
  UNIQUE KEY uq_lab_batch_section_code (section_id,lab_batch_code)
) ENGINE=InnoDB;

CREATE TABLE course (
  course_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, course_code VARCHAR(30) NOT NULL UNIQUE,
  course_name VARCHAR(200) NOT NULL, course_type ENUM('THEORY','PRACTICAL','TUTORIAL') NOT NULL,
  total_planned_hours DECIMAL(6,2) NOT NULL, credit_units DECIMAL(4,1) NOT NULL,
  CONSTRAINT chk_course_hours CHECK (total_planned_hours > 0), CONSTRAINT chk_course_credit CHECK (credit_units >= 0)
) ENGINE=InnoDB;

CREATE TABLE program_curriculum (
  curriculum_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, program_id BIGINT UNSIGNED NOT NULL,
  course_id BIGINT UNSIGNED NOT NULL, offered_year_number TINYINT UNSIGNED NOT NULL,
  offered_semester TINYINT UNSIGNED NOT NULL, is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_curriculum_program FOREIGN KEY (program_id) REFERENCES program(program_id),
  CONSTRAINT fk_curriculum_course FOREIGN KEY (course_id) REFERENCES course(course_id),
  UNIQUE KEY uq_curriculum (program_id,course_id,offered_semester)
) ENGINE=InnoDB;

CREATE TABLE faculty_course_assignment (
  faculty_course_assignment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  faculty_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED NOT NULL,
  assigned_on DATE NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_fca_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id),
  CONSTRAINT fk_fca_course FOREIGN KEY (course_id) REFERENCES course(course_id),
  UNIQUE KEY uq_faculty_course (faculty_id,course_id)
) ENGINE=InnoDB;

CREATE TABLE classroom (
  classroom_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, room_number VARCHAR(30) NOT NULL UNIQUE,
  building_name VARCHAR(100) NOT NULL, floor_no VARCHAR(20), seating_capacity SMALLINT UNSIGNED NOT NULL,
  room_type ENUM('LECTURE','LAB') NOT NULL, concurrent_group_capacity TINYINT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT chk_room_capacity CHECK (seating_capacity > 0), CONSTRAINT chk_room_groups CHECK (concurrent_group_capacity > 0)
) ENGINE=InnoDB;

CREATE TABLE section_course_offering (
  section_course_offering_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, section_id BIGINT UNSIGNED NOT NULL,
  curriculum_id BIGINT UNSIGNED NOT NULL,
  CONSTRAINT fk_offering_section FOREIGN KEY (section_id) REFERENCES section(section_id),
  CONSTRAINT fk_offering_curriculum FOREIGN KEY (curriculum_id) REFERENCES program_curriculum(curriculum_id),
  UNIQUE KEY uq_section_curriculum (section_id,curriculum_id)
) ENGINE=InnoDB;

CREATE TABLE timetable_slot (
  timetable_slot_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, section_course_offering_id BIGINT UNSIGNED NOT NULL,
  lab_batch_id BIGINT UNSIGNED NULL, faculty_course_assignment_id BIGINT UNSIGNED NOT NULL,
  classroom_id BIGINT UNSIGNED NOT NULL, day_of_week ENUM('MON','TUE','WED','THU','FRI','SAT') NOT NULL,
  start_time TIME NOT NULL, end_time TIME NOT NULL,
  CONSTRAINT fk_slot_offering FOREIGN KEY (section_course_offering_id) REFERENCES section_course_offering(section_course_offering_id),
  CONSTRAINT fk_slot_lab FOREIGN KEY (lab_batch_id) REFERENCES lab_batch(lab_batch_id),
  CONSTRAINT fk_slot_faculty_course FOREIGN KEY (faculty_course_assignment_id) REFERENCES faculty_course_assignment(faculty_course_assignment_id),
  CONSTRAINT fk_slot_room FOREIGN KEY (classroom_id) REFERENCES classroom(classroom_id),
  CONSTRAINT chk_slot_time CHECK (end_time > start_time),
  KEY ix_slot_day_room (day_of_week,classroom_id,start_time), KEY ix_slot_lab (lab_batch_id)
) ENGINE=InnoDB;

CREATE TABLE cancellation_request (
  cancellation_request_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, timetable_slot_id BIGINT UNSIGNED NOT NULL,
  requested_by_faculty_id BIGINT UNSIGNED NOT NULL, lecture_date DATE NOT NULL, reason VARCHAR(1000) NOT NULL,
  request_status ENUM('PENDING','APPROVED','REJECTED','WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  reviewed_by_user_id BIGINT UNSIGNED NULL, reviewed_at DATETIME NULL, review_remarks VARCHAR(1000),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cancel_slot FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slot(timetable_slot_id),
  CONSTRAINT fk_cancel_faculty FOREIGN KEY (requested_by_faculty_id) REFERENCES faculty(faculty_id),
  CONSTRAINT fk_cancel_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES app_user(user_id),
  UNIQUE KEY uq_cancel_slot_date (timetable_slot_id,lecture_date)
) ENGINE=InnoDB;

CREATE TABLE substitution_assignment (
  substitution_assignment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, cancellation_request_id BIGINT UNSIGNED NOT NULL UNIQUE,
  substitute_faculty_id BIGINT UNSIGNED NOT NULL, assignment_status ENUM('PROPOSED','ASSIGNED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PROPOSED',
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, remarks VARCHAR(1000),
  CONSTRAINT fk_sub_cancel FOREIGN KEY (cancellation_request_id) REFERENCES cancellation_request(cancellation_request_id),
  CONSTRAINT fk_sub_faculty FOREIGN KEY (substitute_faculty_id) REFERENCES faculty(faculty_id)
) ENGINE=InnoDB;

CREATE TABLE lecture_log (
  lecture_log_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, timetable_slot_id BIGINT UNSIGNED NOT NULL,
  delivered_by_faculty_id BIGINT UNSIGNED NOT NULL, lecture_date DATE NOT NULL,
  actual_hours_taken DECIMAL(5,2) NOT NULL DEFAULT 0, delivery_status ENUM('DELIVERED','CANCELLED','MISSED','RESCHEDULED') NOT NULL,
  remarks VARCHAR(1000), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_slot FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slot(timetable_slot_id),
  CONSTRAINT fk_log_faculty FOREIGN KEY (delivered_by_faculty_id) REFERENCES faculty(faculty_id),
  CONSTRAINT chk_log_hours CHECK (actual_hours_taken >= 0), UNIQUE KEY uq_log_slot_date (timetable_slot_id,lecture_date)
) ENGINE=InnoDB;

DELIMITER $$
CREATE FUNCTION fn_delivered_hours(p_offering_id BIGINT UNSIGNED) RETURNS DECIMAL(8,2) READS SQL DATA
BEGIN
  DECLARE v_hours DECIMAL(8,2);
  SELECT COALESCE(SUM(CASE WHEN ll.delivery_status='DELIVERED' THEN ll.actual_hours_taken ELSE 0 END),0) INTO v_hours
  FROM timetable_slot ts LEFT JOIN lecture_log ll ON ll.timetable_slot_id=ts.timetable_slot_id
  WHERE ts.section_course_offering_id=p_offering_id;
  RETURN v_hours;
END$$

CREATE PROCEDURE sp_schedule_slot(IN p_program VARCHAR(30), IN p_admission_year SMALLINT, IN p_section VARCHAR(20),
 IN p_lab VARCHAR(20), IN p_course VARCHAR(30), IN p_employee VARCHAR(30), IN p_room VARCHAR(30), IN p_day VARCHAR(3), IN p_start TIME, IN p_end TIME)
BEGIN
  DECLARE v_offering BIGINT UNSIGNED; DECLARE v_lab BIGINT UNSIGNED DEFAULT NULL; DECLARE v_fca BIGINT UNSIGNED;
  DECLARE v_room BIGINT UNSIGNED; DECLARE v_limit TINYINT; DECLARE v_count INT;
  IF p_end<=p_start THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid slot time'; END IF;
  SELECT sco.section_course_offering_id INTO v_offering FROM section_course_offering sco JOIN section s ON s.section_id=sco.section_id JOIN academic_batch b ON b.batch_id=s.batch_id JOIN program p ON p.program_id=b.program_id JOIN program_curriculum pc ON pc.curriculum_id=sco.curriculum_id JOIN course c ON c.course_id=pc.course_id WHERE p.program_code=p_program AND b.admission_year=p_admission_year AND s.section_name=p_section AND c.course_code=p_course;
  SELECT fca.faculty_course_assignment_id INTO v_fca FROM faculty_course_assignment fca JOIN faculty f ON f.faculty_id=fca.faculty_id JOIN course c ON c.course_id=fca.course_id WHERE f.employee_code=p_employee AND c.course_code=p_course AND fca.is_active=TRUE;
  SELECT classroom_id,concurrent_group_capacity INTO v_room,v_limit FROM classroom WHERE room_number=p_room;
  IF v_offering IS NULL OR v_fca IS NULL OR v_room IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Offering, faculty course assignment, or room missing'; END IF;
  IF p_lab IS NOT NULL THEN SELECT lb.lab_batch_id INTO v_lab FROM lab_batch lb JOIN section_course_offering sco ON sco.section_id=lb.section_id WHERE lb.lab_batch_code=p_lab AND sco.section_course_offering_id=v_offering; IF v_lab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Lab batch is not in this section'; END IF; END IF;
  IF EXISTS(SELECT 1 FROM timetable_slot ts WHERE ts.day_of_week=p_day AND ts.start_time<p_end AND ts.end_time>p_start AND ts.faculty_course_assignment_id=v_fca) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Faculty conflict'; END IF;
  IF v_lab IS NOT NULL AND EXISTS(SELECT 1 FROM timetable_slot ts WHERE ts.day_of_week=p_day AND ts.start_time<p_end AND ts.end_time>p_start AND ts.lab_batch_id=v_lab) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Lab batch conflict'; END IF;
  SELECT COUNT(*) INTO v_count FROM timetable_slot ts WHERE ts.classroom_id=v_room AND ts.day_of_week=p_day AND ts.start_time<p_end AND ts.end_time>p_start;
  IF v_count>=v_limit THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Room conflict'; END IF;
  INSERT INTO timetable_slot(section_course_offering_id,lab_batch_id,faculty_course_assignment_id,classroom_id,day_of_week,start_time,end_time) VALUES(v_offering,v_lab,v_fca,v_room,p_day,p_start,p_end);
END$$
DELIMITER ;

CREATE OR REPLACE VIEW vw_section_course_delivery AS
SELECT s.section_name,b.admission_year,c.course_code,c.course_name,c.total_planned_hours,
 fn_delivered_hours(sco.section_course_offering_id) AS delivered_hours,
 ROUND(fn_delivered_hours(sco.section_course_offering_id)/NULLIF(c.total_planned_hours,0)*100,2) AS delivery_percentage
FROM section_course_offering sco JOIN section s ON s.section_id=sco.section_id JOIN academic_batch b ON b.batch_id=s.batch_id JOIN program_curriculum pc ON pc.curriculum_id=sco.curriculum_id JOIN course c ON c.course_id=pc.course_id;

CREATE OR REPLACE VIEW vw_timetable AS
SELECT ts.day_of_week,ts.start_time,ts.end_time,s.section_name,lb.lab_batch_code,c.course_code,c.course_name,cr.room_number,CONCAT(f.first_name,' ',f.last_name) AS faculty_name
FROM timetable_slot ts JOIN section_course_offering sco ON sco.section_course_offering_id=ts.section_course_offering_id JOIN section s ON s.section_id=sco.section_id LEFT JOIN lab_batch lb ON lb.lab_batch_id=ts.lab_batch_id JOIN program_curriculum pc ON pc.curriculum_id=sco.curriculum_id JOIN course c ON c.course_id=pc.course_id JOIN classroom cr ON cr.classroom_id=ts.classroom_id JOIN faculty_course_assignment fca ON fca.faculty_course_assignment_id=ts.faculty_course_assignment_id JOIN faculty f ON f.faculty_id=fca.faculty_id;