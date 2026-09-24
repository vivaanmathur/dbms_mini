USE u129569208_lectureplanner;
USE u129569208_lectureplanner;
START TRANSACTION;
INSERT INTO department (department_code,department_name) VALUES ('DCET','Department of Computer Engineering and Technology');
SET @dept_id=LAST_INSERT_ID();
INSERT INTO program (department_id,program_code,program_name,degree_level,duration_years,total_semesters) VALUES (@dept_id,'BTECH-AIDS','B.Tech in Artificial Intelligence and Data Science','UNDERGRADUATE',5,10);
SET @program_id=LAST_INSERT_ID();
INSERT INTO academic_batch (program_id,admission_year,graduation_year,current_year_number,current_semester) VALUES (@program_id,2024,2029,2,3);
SET @batch_id=LAST_INSERT_ID();
INSERT INTO section (batch_id,section_name,student_count) VALUES (@batch_id,'G',0);
SET @section_id=LAST_INSERT_ID();
INSERT INTO lab_batch (section_id,lab_batch_code) VALUES (@section_id,'G1'),(@section_id,'G2'),(@section_id,'G3');

INSERT INTO faculty (department_id,employee_code,first_name,last_name,email,designation) VALUES
(@dept_id,'FAC-SBETGERI','Santushti','Betgeri','santushti.betgeri@mitwpu.edu.in','Faculty'),
(@dept_id,'FAC-SMITKARI','Shoma','Mitkari','shoma.mitkari@mitwpu.edu.in','Faculty'),
(@dept_id,'FAC-PBHOSALE','Poonam','Bhosale','poonam.bhosale@mitwpu.edu.in','Faculty'),
(@dept_id,'FAC-MPATIL','Manisha','Patil','manisha.patil@mitwpu.edu.in','Faculty'),
(@dept_id,'FAC-AKULKARNI','Anushree','Kulkarni','anushree.kulkarni@mitwpu.edu.in','Faculty'),
(@dept_id,'FAC-SKARANDE','Shridevi','Karande','shridevi.karande@mitwpu.edu.in','Faculty'),
(@dept_id,'FAC-ADHAWALE','Anand','Dhawale','anand.dhawale@mitwpu.edu.in','Faculty'),
(@dept_id,'FAC-ATAWARI','Anand','Tiwari','anand.tiwari@mitwpu.edu.in','Faculty'),
(@dept_id,'FAC-RSHROFF','Rupal','Shroff','rupal.shroff@mitwpu.edu.in','Faculty'),
(@dept_id,'FAC-RUMALE','Rashmi','Umale','rashmi.umale@mitwpu.edu.in','Faculty');

INSERT INTO course (course_code,course_name,course_type,total_planned_hours,credit_units) VALUES
('DBMS','Database Management Systems','THEORY',45,3),('DBMSL','Database Management Systems Laboratory','PRACTICAL',30,1),('OOPL','Object Oriented Programming Laboratory','PRACTICAL',30,1),('DS1','Data Structures I','THEORY',45,3),('DSL','Data Structures I Laboratory','PRACTICAL',30,1),('OSC','Operating System Concepts','THEORY',45,3),('OSCL','Operating System Concepts Laboratory','PRACTICAL',30,1),('ESD','Employability and Life Skills Development Training Programme','THEORY',20,1),('CNM','Calculus and Numerical Methods','THEORY',45,3),('SCHIE','Spiritual and Cultural Heritage Indian Experience','THEORY',22,1),('RIDE','Research Innovation Design Entrepreneurship','PRACTICAL',15,1),('UE1','University Elective I','THEORY',30,2);

INSERT INTO program_curriculum (program_id,course_id,offered_year_number,offered_semester,is_mandatory) SELECT @program_id,course_id,2,3,TRUE FROM course;
INSERT INTO faculty_course_assignment (faculty_id,course_id,assigned_on) SELECT f.faculty_id,c.course_id,CURRENT_DATE FROM faculty f JOIN course c WHERE (f.employee_code='FAC-SBETGERI' AND c.course_code IN ('DBMS','DBMSL')) OR (f.employee_code='FAC-SMITKARI' AND c.course_code='DBMSL') OR (f.employee_code='FAC-PBHOSALE' AND c.course_code='OOPL') OR (f.employee_code='FAC-MPATIL' AND c.course_code IN ('DS1','DSL')) OR (f.employee_code='FAC-AKULKARNI' AND c.course_code='DSL') OR (f.employee_code='FAC-SKARANDE' AND c.course_code='DSL') OR (f.employee_code='FAC-ADHAWALE' AND c.course_code IN ('OSC','OSCL')) OR (f.employee_code='FAC-ATAWARI' AND c.course_code='ESD') OR (f.employee_code='FAC-RSHROFF' AND c.course_code='CNM') OR (f.employee_code='FAC-RUMALE' AND c.course_code='SCHIE');
INSERT INTO classroom (room_number,building_name,floor_no,seating_capacity,room_type,concurrent_group_capacity) VALUES ('VY115','VY','1',60,'LECTURE',1),('VY103','VY','1',60,'LECTURE',1),('VY114','VY','1',60,'LECTURE',1),('VY201','VY','2',60,'LECTURE',1),('VY303','VY','3',60,'LECTURE',1),('VY030','VY','0',60,'LAB',2),('VY126','VY','1',30,'LAB',1),('VY127','VY','1',30,'LAB',1),('VY225','VY','2',30,'LAB',1),('VY330','VY','3',30,'LAB',1);
INSERT INTO section_course_offering (section_id,curriculum_id) SELECT @section_id,curriculum_id FROM program_curriculum WHERE program_id=@program_id;
COMMIT;

CALL sp_schedule_slot('BTECH-AIDS',2024,'G',NULL,'DS1','FAC-MPATIL','VY115','MON','08:30','09:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G',NULL,'DBMS','FAC-SBETGERI','VY115','MON','09:30','10:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G',NULL,'CNM','FAC-RSHROFF','VY103','MON','11:45','12:45');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G1','DSL','FAC-AKULKARNI','VY030','MON','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G2','OOPL','FAC-PBHOSALE','VY126','MON','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G3','DBMSL','FAC-SMITKARI','VY127','MON','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G1','OOPL','FAC-PBHOSALE','VY126','TUE','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G2','DBMSL','FAC-SBETGERI','VY127','TUE','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G3','OSCL','FAC-ADHAWALE','VY330','TUE','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G1','DSL','FAC-AKULKARNI','VY030','WED','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G2','OSCL','FAC-ADHAWALE','VY225','WED','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G3','DSL','FAC-MPATIL','VY030','WED','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G',NULL,'ESD','FAC-ATAWARI','VY303','THU','08:30','10:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G1','OSCL','FAC-ADHAWALE','VY225','THU','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G2','DSL','FAC-SKARANDE','VY030','THU','13:30','15:30');
CALL sp_schedule_slot('BTECH-AIDS',2024,'G','G3','OOPL','FAC-PBHOSALE','VY126','THU','13:30','15:30');
SELECT * FROM vw_timetable ORDER BY FIELD(day_of_week,'MON','TUE','WED','THU','FRI','SAT'),start_time,lab_batch_code;

INSERT INTO app_user (faculty_id, email, password_hash, user_role)
SELECT faculty_id, email, '$2b$12$2kF6iKN.AnkwtAnKdWizfuWy5ADDCWQDVo6XPb8ykicgm6OXDoA1e', 'FACULTY' FROM faculty WHERE employee_code='FAC-SBETGERI';
INSERT INTO app_user (faculty_id, email, password_hash, user_role)
SELECT faculty_id, email, '$2b$12$iT4sNhxGxsjJpMrhmVKJmOY8TpI8HbDUpvY1Qj6QdiQ5DPX7bEvja', 'FACULTY' FROM faculty WHERE employee_code='FAC-SMITKARI';
INSERT INTO app_user (faculty_id, email, password_hash, user_role)
SELECT faculty_id, email, '$2b$12$emOf8xU2xEfs5L1KEI9RyuidsCRaJpgOe5UiK/3StKHxgyGPJZfP.', 'FACULTY' FROM faculty WHERE employee_code='FAC-PBHOSALE';
INSERT INTO app_user (faculty_id, email, password_hash, user_role)
SELECT faculty_id, email, '$2b$12$xAz9IBd/YndNR/tQ8SOVbeN6zrG.u/qKCcEmZ77sFlABv18jiCtNG', 'FACULTY' FROM faculty WHERE employee_code='FAC-MPATIL';
INSERT INTO app_user (faculty_id, email, password_hash, user_role)
SELECT faculty_id, email, '$2b$12$IhGaLmYAUq13G8GefYV35u6kq2oOzwIizTtM3QYc3n/dp9YZ/uFhG', 'FACULTY' FROM faculty WHERE employee_code='FAC-AKULKARNI';
INSERT INTO app_user (faculty_id, email, password_hash, user_role)
SELECT faculty_id, email, '$2b$12$GO5bIlOPbSP7ZlrLIvsh..nS55dAoWfoA5D7w9UQqPeS5l1T/ditm', 'FACULTY' FROM faculty WHERE employee_code='FAC-SKARANDE';
INSERT INTO app_user (faculty_id, email, password_hash, user_role)
SELECT faculty_id, email, '$2b$12$XOyLoPg0y7i9WSDZQwwwyeOyH0./cq7tM7u3sapZ3M1sHSP7.PgSO', 'FACULTY' FROM faculty WHERE employee_code='FAC-ADHAWALE';
INSERT INTO app_user (faculty_id, email, password_hash, user_role)
SELECT faculty_id, email, '$2b$12$XOyLoPg0y7i9WSDZQwwwyeOyH0./cq7tM7u3sapZ3M1sHSP7.PgSO', 'FACULTY' FROM faculty WHERE employee_code='FAC-ATAWARI';
INSERT INTO app_user (faculty_id, email, password_hash, user_role)
SELECT faculty_id, email, '$2b$12$2A1eMeWl5Dxn0FFc2Qhf6OPSEDAHpJxjlzx4.i.PVZ/nOfzp0Kgea', 'FACULTY' FROM faculty WHERE employee_code='FAC-RSHROFF';
INSERT INTO app_user (faculty_id, email, password_hash, user_role)
SELECT faculty_id, email, '$2b$12$6VLSOiUTMyqP.CV9dXhGn.xx5H9NnDD9bjlkKY4nlCgIBuxFsLZxu', 'FACULTY' FROM faculty WHERE employee_code='FAC-RUMALE';
