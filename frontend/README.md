# Continuity — Frontend

React (Vite) with a hand-written "liquid glass" interface: frosted panels over
a slowly drifting gradient, with motion from **Framer Motion** and icons from
**lucide-react**. There is no component library — every surface comes from
`src/styles.css`.

## Running it

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The backend must be running on port 8000 (see
`backend/README.md`). If the backend ever moves, change the address in
`src/config.js` — that is the only place it is written.

## Pages

| Page | What it does |
|---|---|
| Login | Email and password |
| My Timetable | Your week. Classes you agreed to cover for someone else appear in green on the date you take them. Click any lecture to hand it over or mark it conducted |
| Classes | Any class's full week. A lab hour shows every batch (G1/G2/G3) separately with its own teacher and lab. Your own lectures are highlighted — the only ones you can hand over |
| Requests | Lectures waiting for your answer, the ones you agreed to cover, and the ones you handed over |
| Syllabus | One card per subject you teach, with a progress ring. Open one to tick off subtopics (theory) or experiments (labs), and to read that subject's lecture history |
| History | Every lecture you conducted, plus how the teaching load is spread across the department |
| Intelligence | Provision for the planned admin/AI features. Placeholders only — see `docs/ROADMAP.md` |

## Handing a lecture over

Click one of your lectures, then **Cannot take it**. You get a list of everyone
the class could go to, each with a one-line reason:

- teachers of **that same subject** come first, tagged `teaches DBMSL`, and
  the reason says whether they already teach that exact class
- everyone else who is free follows
- anyone who is busy is shown greyed out with why

Pick somebody, or leave it unpicked and the system sends it to the teacher who
is free and has taught the fewest lectures so far.

## Files

```
frontend/src/
  styles.css                the whole design system
  ui.jsx                    glass panels, modal, toasts, progress ring, date helpers
  api.js                    fetch helpers and the saved login token
  config.js                 the backend address
  App.jsx                   routes
  components/
    Shell.jsx               background + top bar + page transition
    Nav.jsx                 top bar, with the highlight that glides between tabs
    TimetableGrid.jsx       the week grid, used by both timetable pages
    SlotDialog.jsx          the popup: mark conducted, or choose who takes it
  pages/
    Login.jsx  MyTimetable.jsx  ClassTimetable.jsx  Requests.jsx
    Syllabus.jsx  SyllabusDetail.jsx  History.jsx  Intelligence.jsx
```

The grid puts one row per start time and one column per day. A cell can hold
several boxes, which is how three lab batches sit side by side in one hour.
