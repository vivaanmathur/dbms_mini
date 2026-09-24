# Faculty Lecture Scheduler - Frontend

React (with Vite) and **Material UI** for all the buttons, tables and dialogs.

## Running it

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The backend must also be running on port 8000
(see `backend/README.md`). If you ever move the backend, change the address in
`src/config.js` - that is the only place it is written.

## Pages

| Page | What you see |
|---|---|
| Login | email + password |
| My Timetable | your own week. A class you agreed to cover for another teacher also appears here, in green, on the date you take it. Click any lecture to cancel it or mark it conducted |
| Class Timetable | pick a class and see its whole week. A lab hour shows every batch (G1, G2, G3) separately. Your own lectures have a blue line on the left - those are the only ones you can cancel. If a lecture was given to a substitute, the box says so, like `25 Sep: Shoma Mitkari -> Santushti Betgeri` |
| Requests | classes other teachers want you to take (approve / reject), the classes you agreed to cover, and the lectures you cancelled |
| Lecture Log | every lecture you actually conducted, plus a table of how many lectures each teacher has taken |

## Files

```
frontend/src/
  config.js                 the backend address
  api.js                    small fetch() helpers + the saved login token
  App.jsx                   the routes
  components/
    Navbar.jsx              the top bar
    TimetableGrid.jsx       the week grid, used by BOTH timetable pages
    SlotDialog.jsx          the popup when you click a lecture
  pages/
    Login.jsx
    MyTimetable.jsx
    ClassTimetable.jsx
    Requests.jsx
    LectureLog.jsx
```

The grid puts one row per start time and one column per day. A cell can hold
more than one box, which is how three lab batches show up side by side in the
same hour.
