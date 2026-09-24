# SQL run against the database

These are all the statements `backend/scripts/add_more_data.py` executed to
make the timetable usable. **No table structure was changed** - there is no
CREATE, ALTER or DROP here, only INSERTs and calls to the `sp_schedule_slot`
procedure that was already in the database.

`sp_schedule_slot` is what actually inserts into `timetable_slot`. We used it
instead of a plain INSERT because the procedure itself refuses a booking if
the teacher, the room or the lab batch is already busy in that hour.

```sql
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'OSC', 'FAC-ADHAWALE', 'VY115', 'MON', '10:45:00', '11:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'DBMS', 'FAC-SBETGERI', 'VY115', 'TUE', '08:30:00', '09:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'OSC', 'FAC-ADHAWALE', 'VY115', 'TUE', '09:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'DS1', 'FAC-MPATIL', 'VY115', 'TUE', '10:45:00', '11:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'SCHIE', 'FAC-RUMALE', 'VY103', 'TUE', '11:45:00', '12:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'CNM', 'FAC-RSHROFF', 'VY103', 'WED', '08:30:00', '09:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'DS1', 'FAC-MPATIL', 'VY115', 'WED', '09:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'DBMS', 'FAC-SBETGERI', 'VY115', 'WED', '10:45:00', '11:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'OSC', 'FAC-ADHAWALE', 'VY115', 'WED', '11:45:00', '12:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'CNM', 'FAC-RSHROFF', 'VY103', 'THU', '10:45:00', '11:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'SCHIE', 'FAC-RUMALE', 'VY103', 'THU', '11:45:00', '12:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'DBMS', 'FAC-SBETGERI', 'VY115', 'FRI', '08:30:00', '09:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'DS1', 'FAC-MPATIL', 'VY115', 'FRI', '09:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'OSC', 'FAC-ADHAWALE', 'VY115', 'FRI', '10:45:00', '11:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', NULL, 'ESD', 'FAC-ATAWARI', 'VY303', 'FRI', '11:45:00', '12:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', 'G1', 'DBMSL', 'FAC-SMITKARI', 'VY127', 'FRI', '13:30:00', '15:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', 'G2', 'OOPL', 'FAC-PBHOSALE', 'VY126', 'FRI', '13:30:00', '15:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'G', 'G3', 'DSL', 'FAC-SKARANDE', 'VY030', 'FRI', '13:30:00', '15:30:00');
INSERT INTO section (batch_id, section_name, student_count) VALUES (1, 'H', 60);
INSERT INTO lab_batch (section_id, lab_batch_code) VALUES (2, 'H1');
INSERT INTO lab_batch (section_id, lab_batch_code) VALUES (2, 'H2');
INSERT INTO lab_batch (section_id, lab_batch_code) VALUES (2, 'H3');
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 1);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 2);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 3);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 4);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 5);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 6);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 7);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 8);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 9);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 10);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 11);
INSERT INTO section_course_offering (section_id, curriculum_id) VALUES (2, 12);
INSERT INTO faculty_course_assignment (faculty_id, course_id, assigned_on, is_active) SELECT f.faculty_id, c.course_id, CURDATE(), 1 FROM faculty f, course c WHERE f.employee_code = 'FAC-ATAWARI' AND c.course_code = 'OSCL';
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H1', 'DBMSL', 'FAC-SMITKARI', 'VY127', 'MON', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H2', 'OOPL', 'FAC-PBHOSALE', 'VY126', 'MON', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H3', 'DSL', 'FAC-AKULKARNI', 'VY030', 'MON', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', NULL, 'DS1', 'FAC-MPATIL', 'VY115', 'MON', '15:45:00', '16:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', NULL, 'DBMS', 'FAC-SBETGERI', 'VY115', 'MON', '16:45:00', '17:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H1', 'OOPL', 'FAC-PBHOSALE', 'VY126', 'TUE', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H2', 'DSL', 'FAC-SKARANDE', 'VY030', 'TUE', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H3', 'DBMSL', 'FAC-SMITKARI', 'VY127', 'TUE', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', NULL, 'OSC', 'FAC-ADHAWALE', 'VY115', 'TUE', '15:45:00', '16:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', NULL, 'CNM', 'FAC-RSHROFF', 'VY103', 'TUE', '16:45:00', '17:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H1', 'DSL', 'FAC-AKULKARNI', 'VY030', 'WED', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H2', 'DBMSL', 'FAC-SMITKARI', 'VY127', 'WED', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H3', 'OOPL', 'FAC-PBHOSALE', 'VY126', 'WED', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', NULL, 'DBMS', 'FAC-SBETGERI', 'VY115', 'WED', '15:45:00', '16:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', NULL, 'DS1', 'FAC-MPATIL', 'VY115', 'WED', '16:45:00', '17:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H1', 'OSCL', 'FAC-ADHAWALE', 'VY225', 'THU', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', NULL, 'CNM', 'FAC-RSHROFF', 'VY103', 'THU', '15:45:00', '16:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', NULL, 'SCHIE', 'FAC-RUMALE', 'VY103', 'THU', '16:45:00', '17:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H2', 'OSCL', 'FAC-ADHAWALE', 'VY225', 'FRI', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', 'H3', 'OSCL', 'FAC-ATAWARI', 'VY330', 'FRI', '08:30:00', '10:30:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', NULL, 'OSC', 'FAC-ADHAWALE', 'VY115', 'FRI', '15:45:00', '16:45:00');
CALL sp_schedule_slot('BTECH-AIDS', 2024, 'H', NULL, 'ESD', 'FAC-ATAWARI', 'VY303', 'FRI', '16:45:00', '17:45:00');
```

## What this added

* The rest of the week for **section G** - it only had Monday to Thursday
  mornings before, now it runs Monday to Friday.
* A whole second class, **section H**, with its own three lab batches
  (H1, H2, H3) and its own timetable, so the Class Timetable page has
  more than one class to choose from. Section H has its labs in the
  morning and its lectures late afternoon, because the teachers are busy
  with section G in between.
* One extra `faculty_course_assignment` so that Anand Tiwari can also
  take the OS lab - one teacher was not enough for two classes.

## Clearing the demo data

`backend/scripts/clear_demo_data.py` empties `cancellation_request`,
`substitution_assignment` and `lecture_log` if you want to start a demo
from scratch. It does not touch the timetable or the logins.
