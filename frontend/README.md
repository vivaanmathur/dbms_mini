# Continuity — Frontend

React (Vite). There is no component library — every surface is defined in
`src/styles.css`. Motion comes from **Framer Motion**, icons from
**lucide-react**.

## The design

Five rules, written at the top of `styles.css` and followed everywhere:

1. **Paper and ink.** A warm off-white page, near-black text. Nothing glows.
2. **Hairlines, not shadows.** Structure comes from 1px rules — the timetable
   is ruled the way a printed schedule is. Elevation is used almost nowhere.
3. **Colour carries meaning, never decoration.** The interface is monochrome.
   Pine, ochre and oxblood appear only to say *covered*, *waiting* and
   *problem*. A colour that is not telling you something does not belong on
   screen.
4. **Type does the work.** Newsreader (serif) for titles and figures, Inter
   for everything functional, small caps for labels. Numerals are tabular so
   columns of times and hours line up.
5. **Motion is brief and small.** Every surface that responds to a pointer
   says so three times — it warms on hover, gives on press, and draws a ring
   on keyboard focus. Nothing travels more than a few pixels and nothing
   takes longer than 400ms.

## Colour schemes

Each teacher picks their own from the control in the top bar. Six palettes
ship in `src/theme.js`: **Archive** (warm cream, the default), **Oxford**
(cool grey and navy), **Claret** (warm blush), **Sage**, **Graphite** and
**Nocturne** (dark).

The choice is saved against that teacher's faculty id, so two teachers sharing
a computer never inherit each other's colours, and it is applied before React
paints so there is no flash of the wrong palette on load.

Every palette obeys the same rules, so none of them turns the interface into
a toy. Tokens are named by **role** rather than by colour — `--ink` is the
foreground and `--paper` the background — which is why the dark palette is
just an inversion of values and needs no separate CSS anywhere.

## The motion

- **Buttons** lift 1px on hover, compress on press, and the primary button has
  a light wash that sweeps across it
- **Nav tabs** grow a hairline out from the centre on hover; the active rule
  slides between tabs as one shared element
- **Timetable entries and syllabus rows** widen their ruled edge as the
  pointer enters
- **Finishing a topic** draws a line through it over 340ms rather than simply
  striking it out, and the checkbox springs
- **Figures** count up to their value instead of snapping to it
- **Loading** uses shimmering skeletons that keep the page's shape, not a
  spinner that replaces it
- **Lists** arrive staggered; **modals** scale in from 98%
- All of it is switched off under `prefers-reduced-motion`

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
| Insights | Three tabs, all working: **Syllabus risk** (is each class going to finish in time, and why), **Resource allocation** (teaching load against contract, room use, what is out of balance) and **Day view** (what actually happens on one date). The recovery planner opens from the risk tab |

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
    WeekBar.jsx             moving through the semester one week at a time
    SlotDialog.jsx          the popup: mark conducted, or choose who takes it
    RecoveryDialog.jsx      make-up slots for a lecture nobody could cover
  pages/
    Login.jsx  MyTimetable.jsx  ClassTimetable.jsx  Requests.jsx
    Syllabus.jsx  SyllabusDetail.jsx  History.jsx  Insights.jsx
```

The grid puts one row per start time and one column per day. A cell can hold
several boxes, which is how three lab batches sit side by side in one hour.
