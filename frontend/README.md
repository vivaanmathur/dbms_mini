# Continuity — frontend

React (Vite), Framer Motion and lucide-react. No component library: every
surface is defined in `src/styles.css` and `src/admin.css`. See the project
README for what the system does and how to run it.

The app asks the server who you are and builds itself from your roles: the
pages in the top bar, the dashboards you can switch between, and what each
lecture dialog lets you do. The browser keeps only a token — roles can never
be changed from here.

```
src/
  auth.jsx          who is signed in; which dashboards their roles give them
  api.js            requests, the token, and the sign-out / password-change signals
  theme.js          six palettes, remembered per account
  styles.css        the design system — paper and ink, hairlines, colour for meaning only
  admin.css         additions for the multi-role screens
  ui.jsx            cards, modals, toasts, figures, skeletons, date helpers
  components/
    Nav.jsx         the top bar, the role switcher and the account menu
    TimetableGrid   one week, ruled like a printed schedule
    WeekBar         moving through the term a week at a time
    lectures.jsx    how a single dated lecture is shown everywhere
    LectureDialog   hand over, take back, or record a lecture and what it covered
    RecoveryDialog  arranging a make-up class
  pages/
    dashboards/     Faculty, Class, Scope (year / programme / director), Admin, Student
    admin/          the console: classes & teaching, timetable editor, subjects &
                    syllabus, staff & roles, students, organisation & calendar, audit
    MyTimetable, ClassTimetable, Requests, Syllabus, SyllabusDetail, History, Insights,
    Login, ChangePassword
```

`src/config.js` points at the backend — port 8001 on this branch.
