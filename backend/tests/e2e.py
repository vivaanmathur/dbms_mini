"""
End-to-end check of every role, against a running backend.

    python -m scripts.seed          # a fresh database first — this test changes data
    uvicorn app.main:app --port 8001
    python tests/e2e.py
    python -m scripts.seed          # and reset afterwards

It signs in as each seeded account (changing their passwords in the process),
hands lectures over, accepts and declines cover, records lectures, books a
make-up, and uses the admin console — then checks every result, including
that each role is refused what it should not reach.

Run it ONLY against the local development database. The scenario uses dates
in the 2026-27 odd semester and assumes it is run during it.
"""
import json, re, urllib.request, urllib.parse, urllib.error
BASE = "http://localhost:8001"
TEMP = re.search(r"^\s{4}(\S+)\s*$", open(__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__))), "SEED_CREDENTIALS.local.md")).read(), re.M).group(1)
# a fresh password each run, meeting the rules: 10+ chars, mixed case, a digit
NEW = "Test-" + __import__("secrets").token_hex(4) + "-Aa1"
ok = fail = 0

def call(method, path, token=None, body=None, form=None):
    data, headers = None, {}
    if form is not None:
        data = urllib.parse.urlencode(form).encode(); headers["Content-Type"] = "application/x-www-form-urlencoded"
    if body is not None:
        data = json.dumps(body).encode(); headers["Content-Type"] = "application/json"
    if token: headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, {"detail": raw.decode()[:300]}

def check(label, cond, extra=""):
    global ok, fail
    if cond: ok += 1; print(f"  ok    {label}")
    else: fail += 1; print(f"  FAIL  {label}  {extra}")

def signin(email):
    st, d = call("POST", "/auth/login", form={"username": email, "password": TEMP})
    if st == 200 and d["must_change_password"]:
        call("POST", "/auth/change-password", d["access_token"], {"current_password": TEMP, "new_password": NEW})
        return d["access_token"]
    st, d = call("POST", "/auth/login", form={"username": email, "password": NEW})
    return d["access_token"]

print("=== sign in & the first-login password rule ===")
st, d = call("POST", "/auth/login", form={"username": "santushti.betgeri@mitwpu.edu.in", "password": "wrong"})
check("wrong password refused", st == 401)
st, d = call("POST", "/auth/login", form={"username": "santushti.betgeri@mitwpu.edu.in", "password": TEMP})
check("temporary password accepted, flagged for change", st == 200 and d["must_change_password"])
t = d["access_token"]
st, _ = call("GET", "/dashboard/faculty", t)
check("blocked from the app until the password is changed", st == 403)
st, e = call("POST", "/auth/change-password", t, {"current_password": TEMP, "new_password": "short"})
check("weak password refused", st == 400, e)
st, _ = call("POST", "/auth/change-password", t, {"current_password": TEMP, "new_password": NEW})
check("strong password accepted", st == 200)
betgeri = signin("santushti.betgeri@mitwpu.edu.in")
st, d = call("GET", "/dashboard/faculty", betgeri)
check("after changing, the app opens", st == 200)

print("\n=== roles decide dashboards ===")
coord = signin("coordinator@continuity.local")
st, me = call("GET", "/auth/me", coord)
roles = [r["role"] for r in me["roles"]]
check("coordinator holds three roles", roles == ["PROGRAM_COORDINATOR", "YEAR_COORDINATOR", "CLASS_TEACHER"], roles)
print("        ", [f"{r['role']}: {r['scope_label']}" for r in me["roles"]])
student = signin("student@continuity.local")
admin = signin("admin@continuity.local")
director = signin("director@continuity.local")

print("\n=== who can reach what ===")
check("student cannot open the faculty dashboard", call("GET", "/dashboard/faculty", student)[0] == 403)
check("faculty cannot open administration", call("GET", "/admin/staff", betgeri)[0] == 403)
check("coordinator cannot open administration", call("GET", "/admin/staff", coord)[0] == 403)
check("admin can", call("GET", "/admin/staff", admin)[0] == 200)

print("\n=== faculty: week, handing over to a chosen colleague ===")
st, wk = call("GET", "/timetable/mine?week_start=2026-09-28", betgeri)
check("Betgeri's week loads", st == 200, wk)
mine = {(s["day_of_week"], s["subject_code"], s.get("lab_batch_code")): s for s in wk["sessions"]}
print("         her sessions:", sorted(f"{k[0]} {k[1]}{' '+k[2] if k[2] else ''}" for k in mine))
lab = mine[("TUE", "DBMSL", "G2")]
st, e = call("POST", "/handover", betgeri, {"slot_id": lab["slot_id"], "lecture_date": "2026-09-29", "reason": "x"})
check("today's lab, already started, cannot be handed over", st == 400 and "already started" in e["detail"], e)
st, c = call("GET", f"/handover/candidates?slot_id={lab['slot_id']}&lecture_date=2026-10-06", betgeri)
top = c["candidates"][0]
check("a teacher of the same subject is listed first", top["teaches_subject"] and top["name"] == "Shoma Mitkari", top)
print(f"         first: {top['name']} — {top['reason']}")
st, r = call("POST", "/handover", betgeri, {"slot_id": lab["slot_id"], "lecture_date": "2026-10-06",
                                           "reason": "Workshop", "delegate_to_staff_id": top["staff_id"]})
check("handed over to her", st == 200, r)
mitkari = signin("shoma.mitkari@mitwpu.edu.in")
st, inc = call("GET", "/cover/incoming", mitkari)
check("it reaches her", st == 200 and len(inc) == 1, inc)
st, r = call("POST", f"/cover/{inc[0]['cover_id']}/accept", mitkari)
check("she accepts", st == 200, r)
st, wk = call("GET", "/timetable/mine?week_start=2026-10-05", betgeri)
s = [x for x in wk["sessions"] if x["slot_id"] == lab["slot_id"]][0]
check("Betgeri's grid shows it covered", s["state"] == "covered" and s["actual_teacher"] == "Shoma Mitkari", s["state"])
st, wk = call("GET", "/timetable/mine?week_start=2026-10-05", mitkari)
check("Mitkari's grid shows the cover", any(x.get("kind") == "cover" for x in wk["sessions"]))
st, wk2 = call("GET", "/timetable/mine?week_start=2026-10-12", betgeri)
check("and next week it is back to normal", all(x["state"] == "scheduled" for x in wk2["sessions"]))

print("\n=== recording what was taught ===")
st, opts = call("GET", f"/syllabus/lecture-options?slot_id={lab['slot_id']}", mitkari)
exp = [o for o in opts if o["kind"] == "experiment"][:1]
st, r = call("POST", "/lectures/conducted", mitkari, {"slot_id": lab["slot_id"], "lecture_date": "2026-10-06",
             "experiment_ids": [o["id"] for o in exp]})
check("the cover teacher cannot log it before it happens", st == 400 and "finished" in r["detail"], r)
st, r = call("POST", "/lectures/conducted", betgeri, {"slot_id": lab["slot_id"], "lecture_date": "2026-09-29",
             "experiment_ids": [o["id"] for o in exp]})
check("today's lab, now finished, is logged by its teacher with an experiment", st == 200, r)
dbms = mine[("MON", "DBMS", None)]
st, opts = call("GET", f"/syllabus/lecture-options?slot_id={dbms['slot_id']}", betgeri)
st, r = call("POST", "/lectures/conducted", betgeri, {"slot_id": dbms["slot_id"], "lecture_date": "2026-09-28",
             "remarks": "Intro", "subtopic_ids": [opts[0]["id"], opts[1]["id"]]})
check("own lecture logged with two subtopics", st == 200, r)
st, r = call("POST", "/lectures/conducted", betgeri, {"slot_id": dbms["slot_id"], "lecture_date": "2026-09-29"})
check("logging on the wrong weekday refused", st == 400, r)

print("\n=== decline passes it on; nobody free leaves it for a coordinator ===")
mon_lab = [x for x in call("GET", "/timetable/mine?week_start=2026-10-05", mitkari)[1]["sessions"] if x["subject_code"] == "DBMSL"][0]
st, r = call("POST", "/handover", mitkari, {"slot_id": mon_lab["slot_id"], "lecture_date": "2026-10-05", "reason": "Leave"})
check("system picks someone", st == 200, r); print("        ", r["message"])
first = r["message"].split("Sent to ")[1].split(" to accept")[0]
emails = {"Santushti Betgeri": "santushti.betgeri", "Poonam Bhosale": "poonam.bhosale", "Manisha Patil": "manisha.patil",
          "Anushree Kulkarni": "anushree.kulkarni", "Shridevi Karande": "shridevi.karande", "Anand Dhawale": "anand.dhawale",
          "Anand Tiwari": "anand.tiwari", "Rupal Shroff": "rupal.shroff", "Rashmi Umale": "rashmi.umale"}
who = signin(emails[first] + "@mitwpu.edu.in")
inc = call("GET", "/cover/incoming", who)[1]
st, r = call("POST", f"/cover/{inc[0]['cover_id']}/decline", who)
check("declining hands it to the next person", st == 200 and "gone to" in r["message"], r); print("        ", r["message"])

print("\n=== class teacher, coordinators, director ===")
sec = call("GET", "/classes", coord)[1][0]["section_id"]
st, cd = call("GET", f"/dashboard/class/{sec}", coord)
check("class dashboard loads", st == 200, cd)
print(f"         {cd['class']['label']}: {len(cd['subjects'])} subject assignments, class teacher {cd['class']['class_teacher']}")
pc = [r for r in me["roles"] if r["role"] == "PROGRAM_COORDINATOR"][0]
st, sd = call("GET", f"/dashboard/scope/{pc['role_assignment_id']}", coord)
check("programme coordinator view loads", st == 200, sd); print("        ", sd["totals"])
dme = call("GET", "/auth/me", director)[1]
st, dd = call("GET", f"/dashboard/scope/{dme['roles'][0]['role_assignment_id']}", director)
check("director view loads", st == 200, dd)
st, rk = call("GET", "/insight/risk", coord)
bands = {}
for i in rk["items"]: bands[i["band"]] = bands.get(i["band"], 0) + 1
check("risk is computed per subject and batch", st == 200 and rk["items"], rk); print("        ", bands, "| unassigned:", [u["subject_code"] for u in rk["unassigned"]])

print("\n=== student ===")
st, sd = call("GET", "/dashboard/student", student)
check("student dashboard loads", st == 200, sd)
st, wk = call("GET", "/timetable/mine?week_start=2026-09-28", student)
batches = {x.get("lab_batch_code") for x in wk["sessions"]}
check("a G1 student sees only sessions G1 attends", all(b is None or "G1" in b.split(", ") for b in batches), batches)
check("including the evaluations G1 shares with other batches", "G1, G2" in batches, batches)

print("\n=== recovery for a lecture nobody takes ===")
st, att = call("GET", "/insight/attention", coord)
print("         needing arrangement:", [(a["subject_code"], a["lecture_date"], a["state"]) for a in att])
# make one with nobody free: every candidate declines until the list runs out
cid = None
for _ in range(12):
    att = call("GET", "/insight/attention", coord)[1]
    pend = [a for a in att if a["state"] == "pending"]
    if not pend: break
    name = pend[0]["waiting_on"]; tk = signin(emails[name] + "@mitwpu.edu.in") if name in emails else betgeri
    cov = call("GET", "/cover/incoming", tk)[1][0]; call("POST", f"/cover/{cov['cover_id']}/decline", tk)
att = call("GET", "/insight/attention", coord)[1]
unc = [a for a in att if a["state"] == "uncovered"]
check("once everyone declines it becomes uncovered", bool(unc), att)
if unc:
    st, ro = call("GET", f"/insight/recovery/{unc[0]['cancellation_id']}", coord)
    check("recovery search finds make-up slots", st == 200 and ro["found"] > 0, ro)
    best = ro["options"][0]; print(f"         {ro['found']} slots; best: {best['day_of_week']} {best['date']} {best['start_time']} {best['room_code']} — {'; '.join(best['notes'])}")
    st, r = call("POST", f"/insight/recovery/{unc[0]['cancellation_id']}", coord,
                 {"date": best["date"], "start_time": best["start_time"], "end_time": best["end_time"], "room_id": best["room_id"]})
    check("make-up booked by the coordinator", st == 200, r)
    st, again = call("GET", f"/insight/recovery/{unc[0]['cancellation_id']}", coord)
    check("and it is no longer open", st == 400, again)

print("\n=== administration ===")
st, ad = call("GET", "/dashboard/admin", admin)
check("admin dashboard loads", st == 200, ad)
for c in ad["checks"]:
    if c["count"]: print(f"         [{c['count']}] {c['title']}: {', '.join(c['items'][:5])}")
depts = call("GET", "/admin/departments", admin)[1]; progs = call("GET", "/admin/programmes", admin)[1]
st, nc = call("POST", "/admin/classes", admin, {"program_id": progs[0]["program_id"], "year_of_study": 2, "division": "h",
               "academic_year": "2026-27", "batches": ["H1", "H2"]})
check("admin creates a new class with batches", st == 200 and nc["label"] == "SY AI&DS H (2026-27)", nc)
check("a faculty member cannot see that class", call("GET", f"/timetable/class/{nc['section_id']}", betgeri)[0] == 403)
check("the coordinator can (it is in their programme)", call("GET", f"/timetable/class/{nc['section_id']}", coord)[0] == 200)
subj = {s["code"]: s for s in call("GET", "/admin/subjects", admin)[1]}
st, of = call("POST", f"/admin/classes/{nc['section_id']}/offerings", admin, {"subject_id": subj["DBMS"]["subject_id"]})
check("offers DBMS to the new class — one subject, two classes", st == 200, of)
staff = {s["employee_code"]: s for s in call("GET", "/admin/staff", admin)[1]}
st, asg = call("POST", "/admin/assignments", admin, {"offering_id": of["offering_id"], "staff_id": staff["FAC-SBETGERI"]["staff_id"]})
check("assigns Betgeri to teach it there too", st == 200, asg)
rooms = {r["code"]: r for r in call("GET", "/admin/rooms", admin)[1]}
st, e = call("POST", "/admin/timetable", admin, {"assignment_id": asg["assignment_id"], "room_id": rooms["VY114"]["room_id"],
              "day_of_week": "MON", "start_time": "09:30", "end_time": "10:30"})
check("clash refused: she teaches G at that hour", st == 400 and "teacher" in e["detail"], e); print("        ", e["detail"])
st, ok_slot = call("POST", "/admin/timetable", admin, {"assignment_id": asg["assignment_id"], "room_id": rooms["VY114"]["room_id"],
              "day_of_week": "WED", "start_time": "10:45", "end_time": "11:45"})
check("a free hour is accepted", st == 200, ok_slot)
st, e = call("POST", f"/admin/staff/{staff['FAC-SMITKARI']['staff_id']}/roles", admin, {"role": "CLASS_TEACHER", "section_id": sec})
check("a second class teacher for G refused, with the name", st == 400 and "already" in e["detail"], e); print("        ", e["detail"])
st, e = call("POST", f"/admin/staff/{staff['FAC-SMITKARI']['staff_id']}/roles", admin, {"role": "CLASS_TEACHER", "section_id": nc["section_id"]})
check("but she can be class teacher of H", st == 200, e)
st, bulk = call("POST", "/admin/students/bulk", admin, {"students": [
    {"section_id": nc["section_id"], "prn": "TEST-01", "roll_no": "1", "first_name": "Asha", "last_name": "Rao", "email": "asha@test.local"},
    {"section_id": nc["section_id"], "prn": "TEST-02", "roll_no": "2", "first_name": "Ravi", "last_name": "Iyer", "email": "bad-email"}]})
check("bulk enrolment is all-or-nothing and names the bad row", st == 400 and "Row 2" in bulk["detail"], bulk); print("        ", bulk["detail"])
st, lst = call("GET", f"/admin/students?section_id={nc['section_id']}", admin)
check("…so nothing was added", st == 200 and len(lst) == 0, lst)
st, a = call("GET", "/admin/audit", admin)
check("the audit trail recorded all of it", st == 200 and len(a) > 10, a)
print("         latest:", [x["summary"] for x in a[:4]])

print(f"\n{ok} passed, {fail} failed")
