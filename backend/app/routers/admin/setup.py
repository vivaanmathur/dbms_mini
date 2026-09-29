"""
Administration: the organisation, the calendar, rooms, subjects and their
syllabus.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import audit
from app.db import execute, fetch_all, fetch_one, transaction
from app.routers.admin.resource import Resource, upper
from app.security import admin_only

router = APIRouter()

Resource(
    "departments", "department", "department_id",
    {"code": (str, True), "name": (str, True)},
    order_by="code", label=lambda r: r["code"], clean=upper("code"),
).mount(router)

Resource(
    "programmes", "program", "program_id",
    {"department_id": (int, True), "code": (str, True), "name": (str, True),
     "short_name": (str, True), "degree_level": (str, False), "duration_years": (int, False)},
    order_by="code", label=lambda r: r["code"], clean=upper("code"),
    list_sql="""SELECT p.*, d.code AS department_code FROM program p
                JOIN department d ON d.department_id = p.department_id ORDER BY p.code""",
).mount(router)

Resource(
    "terms", "academic_term", "term_id",
    {"name": (str, True), "start_date": (str, True), "end_date": (str, True)},
    order_by="start_date DESC", label=lambda r: r["name"],
    list_sql="SELECT term_id, name, start_date, end_date, is_current FROM academic_term ORDER BY start_date DESC",
).mount(router)

Resource(
    "periods", "period", "period_id",
    {"label": (str, True), "start_time": (str, True), "end_time": (str, True), "sort_order": (int, True)},
    order_by="sort_order", label=lambda r: f"{r['label']} ({r['start_time']}–{r['end_time']})",
).mount(router)

Resource(
    "rooms", "room", "room_id",
    {"code": (str, True), "building": (str, True), "floor": (str, False), "capacity": (int, True),
     "room_type": (str, True), "concurrent_capacity": (int, False)},
    order_by="code", label=lambda r: r["code"], clean=upper("code", "room_type"),
).mount(router)

Resource(
    "subjects", "subject", "subject_id",
    {"program_id": (int, True), "code": (str, True), "name": (str, True),
     "subject_type": (str, True), "credits": (float, False), "planned_hours": (float, True)},
    order_by="code", label=lambda r: r["code"], clean=upper("code", "subject_type"),
    list_sql="""
        SELECT s.*, p.short_name AS program_short,
               (SELECT COUNT(*) FROM subject_offering so WHERE so.subject_id = s.subject_id) AS offered_to,
               CASE s.subject_type
                 WHEN 'PRACTICAL' THEN (SELECT COUNT(*) FROM practical_experiment e WHERE e.subject_id = s.subject_id)
                 ELSE (SELECT COUNT(*) FROM syllabus_subtopic st JOIN syllabus_topic t ON t.topic_id = st.topic_id
                       JOIN syllabus_unit u ON u.unit_id = t.unit_id WHERE u.subject_id = s.subject_id)
               END AS syllabus_items
        FROM subject s JOIN program p ON p.program_id = s.program_id ORDER BY s.code""",
).mount(router)


@router.post("/terms/{term_id}/make-current")
def make_current(term_id: int, me=Depends(admin_only)):
    """Only one term can be current (a unique index enforces it), so clear the
    old one and set the new one in a single transaction."""
    term = fetch_one("SELECT name FROM academic_term WHERE term_id = %s", (term_id,))
    if term is None:
        raise HTTPException(404, "Not found.")
    with transaction() as tx:
        tx.execute("UPDATE academic_term SET is_current = FALSE WHERE is_current")
        tx.execute("UPDATE academic_term SET is_current = TRUE WHERE term_id = %s", (term_id,))
        audit.record(me, "UPDATE", "academic_term", term_id, f"Made {term['name']} the current term", tx)
    return {"message": f"{term['name']} is now the current term."}


# ---------------------------------------------------------------------------
# Editing a subject's syllabus
# ---------------------------------------------------------------------------
@router.get("/subjects/{subject_id}/syllabus")
def syllabus(subject_id: int, me=Depends(admin_only)):
    subject = fetch_one("SELECT * FROM subject WHERE subject_id = %s", (subject_id,))
    if subject is None:
        raise HTTPException(404, "Not found.")
    if subject["subject_type"] == "PRACTICAL":
        return {"subject": subject, "units": [], "experiments": fetch_all(
            "SELECT * FROM practical_experiment WHERE subject_id = %s ORDER BY experiment_number",
            (subject_id,))}
    units = fetch_all("SELECT * FROM syllabus_unit WHERE subject_id = %s ORDER BY unit_number", (subject_id,))
    topics = fetch_all("SELECT t.* FROM syllabus_topic t JOIN syllabus_unit u ON u.unit_id = t.unit_id "
                       "WHERE u.subject_id = %s ORDER BY t.topic_number", (subject_id,))
    subs = fetch_all("SELECT st.* FROM syllabus_subtopic st JOIN syllabus_topic t ON t.topic_id = st.topic_id "
                     "JOIN syllabus_unit u ON u.unit_id = t.unit_id WHERE u.subject_id = %s "
                     "ORDER BY st.subtopic_number", (subject_id,))
    for t in topics:
        t["subtopics"] = [s for s in subs if s["topic_id"] == t["topic_id"]]
    for u in units:
        u["topics"] = [t for t in topics if t["unit_id"] == u["unit_id"]]
    return {"subject": subject, "units": units, "experiments": []}


class Item(BaseModel):
    title: str
    planned_hours: float | None = None


def _next(table, parent_col, parent_id, number_col):
    row = fetch_one(f"SELECT COALESCE(MAX({number_col}), 0) + 1 AS n FROM {table} WHERE {parent_col} = %s",
                    (parent_id,))
    return row["n"]


@router.post("/subjects/{subject_id}/units")
def add_unit(subject_id: int, data: Item, me=Depends(admin_only)):
    n = _next("syllabus_unit", "subject_id", subject_id, "unit_number")
    new = execute("INSERT INTO syllabus_unit (subject_id, unit_number, title, planned_hours) VALUES (%s,%s,%s,%s)",
                  (subject_id, n, data.title.strip(), data.planned_hours or 0))
    audit.record(me, "CREATE", "syllabus_unit", new, f"Added unit {n}: {data.title}")
    return {"unit_id": new}


@router.post("/units/{unit_id}/topics")
def add_topic(unit_id: int, data: Item, me=Depends(admin_only)):
    n = _next("syllabus_topic", "unit_id", unit_id, "topic_number")
    new = execute("INSERT INTO syllabus_topic (unit_id, topic_number, title) VALUES (%s,%s,%s)",
                  (unit_id, n, data.title.strip()))
    audit.record(me, "CREATE", "syllabus_topic", new, f"Added topic: {data.title}")
    return {"topic_id": new}


@router.post("/topics/{topic_id}/subtopics")
def add_subtopic(topic_id: int, data: Item, me=Depends(admin_only)):
    n = _next("syllabus_subtopic", "topic_id", topic_id, "subtopic_number")
    new = execute("INSERT INTO syllabus_subtopic (topic_id, subtopic_number, title) VALUES (%s,%s,%s)",
                  (topic_id, n, data.title.strip()))
    audit.record(me, "CREATE", "syllabus_subtopic", new, f"Added subtopic: {data.title}")
    return {"subtopic_id": new}


@router.post("/subjects/{subject_id}/experiments")
def add_experiment(subject_id: int, data: Item, me=Depends(admin_only)):
    n = _next("practical_experiment", "subject_id", subject_id, "experiment_number")
    new = execute("INSERT INTO practical_experiment (subject_id, experiment_number, title, planned_hours) "
                  "VALUES (%s,%s,%s,%s)", (subject_id, n, data.title.strip(), data.planned_hours or 2))
    audit.record(me, "CREATE", "practical_experiment", new, f"Added experiment {n}: {data.title}")
    return {"experiment_id": new}


SYLLABUS_TABLES = {
    "unit": ("syllabus_unit", "unit_id"),
    "topic": ("syllabus_topic", "topic_id"),
    "subtopic": ("syllabus_subtopic", "subtopic_id"),
    "experiment": ("practical_experiment", "experiment_id"),
}


@router.put("/syllabus/{kind}/{item_id}")
def rename_item(kind: str, item_id: int, data: Item, me=Depends(admin_only)):
    if kind not in SYLLABUS_TABLES:
        raise HTTPException(404, "Not found.")
    table, pk = SYLLABUS_TABLES[kind]
    execute(f"UPDATE {table} SET title = %s WHERE {pk} = %s", (data.title.strip(), item_id))
    audit.record(me, "UPDATE", table, item_id, f"Renamed a {kind} to {data.title}")
    return {"message": "Saved."}


@router.delete("/syllabus/{kind}/{item_id}")
def delete_item(kind: str, item_id: int, me=Depends(admin_only)):
    """Deleting a unit or topic takes its children with it (ON DELETE
    CASCADE); anything a class has already been marked as covering is
    protected by its foreign key and the delete is refused."""
    if kind not in SYLLABUS_TABLES:
        raise HTTPException(404, "Not found.")
    table, pk = SYLLABUS_TABLES[kind]
    execute(f"DELETE FROM {table} WHERE {pk} = %s", (item_id,))
    audit.record(me, "DELETE", table, item_id, f"Removed a {kind}")
    return {"message": "Removed."}
