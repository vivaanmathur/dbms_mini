"""
Administration: staff, the roles they hold, students, and sign-in accounts.

New accounts get a one-time password generated here and shown to the
administrator exactly once; the person must replace it at first sign-in.
Nothing ever stores or displays a password in readable form again.
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import audit
from app.db import execute, fetch_all, fetch_one, transaction
from app.security import admin_only, hash_password

router = APIRouter()


def temporary_password():
    """Readable enough to read out, strong enough to be safe for a day."""
    return "Temp-" + secrets.token_hex(3) + "-" + str(secrets.randbelow(90) + 10)


def _email(value):
    value = value.strip().lower()
    if "@" not in value or "." not in value.split("@")[-1]:
        raise HTTPException(400, "That does not look like an email address.")
    return value


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------
@router.get("/staff")
def list_staff(me=Depends(admin_only)):
    staff = fetch_all(
        """
        SELECT st.*, d.code AS department_code,
               u.user_id, u.is_active AS login_active, u.must_change_password, u.last_login_at,
               l.weekly_hours
        FROM staff st
        JOIN department d ON d.department_id = st.department_id
        LEFT JOIN app_user u ON u.staff_id = st.staff_id
        LEFT JOIN vw_staff_load l ON l.staff_id = st.staff_id
        ORDER BY st.is_active DESC, st.first_name, st.last_name
        """)
    roles = fetch_all(
        """
        SELECT ra.role_assignment_id, ra.staff_id, ra.role, ra.department_id, ra.program_id,
               ra.year_of_study, ra.section_id,
               d.code AS department_code, p.short_name AS program_short,
               IF(ra.section_id IS NULL, NULL, fn_class_label(ra.section_id)) AS class_label
        FROM role_assignment ra
        LEFT JOIN department d ON d.department_id = ra.department_id
        LEFT JOIN program p ON p.program_id = ra.program_id
        """)
    for person in staff:
        person["roles"] = [r for r in roles if r["staff_id"] == person["staff_id"]]
        person["has_login"] = person["user_id"] is not None
    return staff


class StaffIn(BaseModel):
    department_id: int
    employee_code: str
    first_name: str
    last_name: str
    email: str
    designation: str = "Faculty"
    max_weekly_hours: float = 18
    teaches: bool = True            # give them the FACULTY role
    create_login: bool = True


@router.post("/staff")
def create_staff(data: StaffIn, me=Depends(admin_only)):
    email = _email(data.email)
    password = temporary_password() if data.create_login else None
    with transaction() as tx:
        staff_id = tx.execute(
            "INSERT INTO staff (department_id, employee_code, first_name, last_name, email, designation, "
            "max_weekly_hours) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (data.department_id, data.employee_code.strip().upper(), data.first_name.strip(),
             data.last_name.strip(), email, data.designation.strip(), data.max_weekly_hours))
        if data.teaches:
            tx.execute("INSERT INTO role_assignment (staff_id, role) VALUES (%s, 'FACULTY')", (staff_id,))
        if password:
            tx.execute("INSERT INTO app_user (email, password_hash, staff_id, must_change_password) "
                       "VALUES (%s, %s, %s, TRUE)", (email, hash_password(password), staff_id))
        audit.record(me, "CREATE", "staff", staff_id, f"Added {data.first_name} {data.last_name}", tx)
    return {"staff_id": staff_id, "temporary_password": password}


class StaffEdit(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    designation: str | None = None
    max_weekly_hours: float | None = None
    department_id: int | None = None
    is_active: bool | None = None


@router.put("/staff/{staff_id}")
def edit_staff(staff_id: int, data: StaffEdit, me=Depends(admin_only)):
    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "email" in values:
        values["email"] = _email(values["email"])
    if not values:
        return {"message": "Nothing to change."}
    with transaction() as tx:
        tx.execute(f"UPDATE staff SET {', '.join(f'{k} = %s' for k in values)} WHERE staff_id = %s",
                   tuple(values.values()) + (staff_id,))
        # the sign-in email follows the staff email
        if "email" in values:
            tx.execute("UPDATE app_user SET email = %s WHERE staff_id = %s", (values["email"], staff_id))
        name = tx.fetch_one("SELECT CONCAT(first_name, ' ', last_name) AS n FROM staff WHERE staff_id = %s",
                            (staff_id,))["n"]
        what = "Deactivated" if values.get("is_active") is False else "Edited"
        audit.record(me, "UPDATE", "staff", staff_id, f"{what} {name}", tx)
    return {"message": "Saved."}


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------
class RoleIn(BaseModel):
    role: str
    department_id: int | None = None
    program_id: int | None = None
    year_of_study: int | None = None
    section_id: int | None = None


SCOPE_NEEDS = {
    "ADMIN": [], "FACULTY": [],
    "PROGRAM_DIRECTOR": ["department_id"],
    "PROGRAM_COORDINATOR": ["program_id"],
    "CLASS_TEACHER": ["section_id"],
}


@router.post("/staff/{staff_id}/roles")
def add_role(staff_id: int, data: RoleIn, me=Depends(admin_only)):
    """The database's chk_role_scope is the final word on which scope a role
    needs; checking here first just gives a clearer message."""
    role = data.role.upper()
    values = data.model_dump()
    if role == "YEAR_COORDINATOR":
        if not data.year_of_study or bool(data.department_id) == bool(data.program_id):
            raise HTTPException(400, "A year coordinator needs a year, and either a department or a programme.")
        keep = ["year_of_study", "department_id" if data.department_id else "program_id"]
    elif role in SCOPE_NEEDS:
        keep = SCOPE_NEEDS[role]
        missing = [k for k in keep if not values.get(k)]
        if missing:
            raise HTTPException(400, f"A {role.replace('_', ' ').lower()} needs a {missing[0].replace('_id', '')}.")
    else:
        raise HTTPException(400, "That is not a role.")

    scope = {k: (values[k] if k in keep else None)
             for k in ("department_id", "program_id", "year_of_study", "section_id")}
    if role == "CLASS_TEACHER":
        existing = fetch_one(
            "SELECT CONCAT(st.first_name, ' ', st.last_name) AS n FROM role_assignment ra "
            "JOIN staff st ON st.staff_id = ra.staff_id WHERE ra.role = 'CLASS_TEACHER' AND ra.section_id = %s",
            (scope["section_id"],))
        if existing:
            raise HTTPException(400, f"{existing['n']} is already the class teacher of that class.")

    new = execute(
        "INSERT INTO role_assignment (staff_id, role, department_id, program_id, year_of_study, section_id) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (staff_id, role, scope["department_id"], scope["program_id"], scope["year_of_study"],
         scope["section_id"]))
    name = fetch_one("SELECT CONCAT(first_name, ' ', last_name) AS n FROM staff WHERE staff_id = %s",
                     (staff_id,))["n"]
    audit.record(me, "CREATE", "role_assignment", new, f"Made {name} {role.replace('_', ' ').lower()}")
    return {"role_assignment_id": new}


@router.delete("/roles/{role_assignment_id}")
def remove_role(role_assignment_id: int, me=Depends(admin_only)):
    row = fetch_one(
        "SELECT ra.role, ra.staff_id, CONCAT(st.first_name, ' ', st.last_name) AS n FROM role_assignment ra "
        "JOIN staff st ON st.staff_id = ra.staff_id WHERE ra.role_assignment_id = %s", (role_assignment_id,))
    if row is None:
        raise HTTPException(404, "Not found.")
    # never let the last administrator remove the last way back in
    if row["role"] == "ADMIN":
        admins = fetch_one("SELECT COUNT(*) AS n FROM role_assignment WHERE role = 'ADMIN'")["n"]
        if admins <= 1:
            raise HTTPException(400, "This is the only administrator. Make someone else an administrator first.")
    execute("DELETE FROM role_assignment WHERE role_assignment_id = %s", (role_assignment_id,))
    audit.record(me, "DELETE", "role_assignment", role_assignment_id,
                 f"Removed {row['role'].replace('_', ' ').lower()} from {row['n']}")
    return {"message": "Removed."}


# ---------------------------------------------------------------------------
# Students
# ---------------------------------------------------------------------------
@router.get("/students")
def list_students(section_id: int | None = None, me=Depends(admin_only)):
    where, values = ("WHERE s.section_id = %s", (section_id,)) if section_id else ("", ())
    return fetch_all(
        f"""
        SELECT s.*, fn_class_label(s.section_id) AS class_label, lb.code AS lab_batch_code,
               u.user_id, u.is_active AS login_active, u.must_change_password, u.last_login_at
        FROM student s
        LEFT JOIN lab_batch lb ON lb.lab_batch_id = s.lab_batch_id
        LEFT JOIN app_user u ON u.student_id = s.student_id
        {where}
        ORDER BY s.section_id, CAST(s.roll_no AS UNSIGNED), s.last_name
        """, values)


class StudentIn(BaseModel):
    section_id: int
    lab_batch_id: int | None = None
    prn: str
    roll_no: str | None = None
    first_name: str
    last_name: str
    email: str
    create_login: bool = True


def _add_student(tx, data):
    email = _email(data.email)
    student_id = tx.execute(
        "INSERT INTO student (section_id, lab_batch_id, prn, roll_no, first_name, last_name, email) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (data.section_id, data.lab_batch_id, data.prn.strip().upper(), data.roll_no,
         data.first_name.strip(), data.last_name.strip(), email))
    password = None
    if data.create_login:
        password = temporary_password()
        tx.execute("INSERT INTO app_user (email, password_hash, student_id, must_change_password) "
                   "VALUES (%s, %s, %s, TRUE)", (email, hash_password(password), student_id))
    return student_id, password


@router.post("/students")
def create_student(data: StudentIn, me=Depends(admin_only)):
    with transaction() as tx:
        student_id, password = _add_student(tx, data)
        audit.record(me, "CREATE", "student", student_id, f"Enrolled {data.first_name} {data.last_name}", tx)
    return {"student_id": student_id, "temporary_password": password}


class StudentBatch(BaseModel):
    students: list[StudentIn]


@router.post("/students/bulk")
def create_students(data: StudentBatch, me=Depends(admin_only)):
    """Enrol a whole class at once — pasted from a spreadsheet. All or
    nothing: if any row is wrong, none are added, and the error says which."""
    created = []
    with transaction() as tx:
        for number, row in enumerate(data.students, start=1):
            try:
                student_id, password = _add_student(tx, row)
            except HTTPException as error:
                raise HTTPException(error.status_code, f"Row {number} ({row.prn}): {error.detail}")
            created.append({"prn": row.prn, "name": f"{row.first_name} {row.last_name}",
                            "email": row.email.lower(), "temporary_password": password})
        audit.record(me, "CREATE", "student", None, f"Enrolled {len(created)} students", tx)
    return {"created": created}


class StudentEdit(BaseModel):
    section_id: int | None = None
    lab_batch_id: int | None = None
    roll_no: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    is_active: bool | None = None


@router.put("/students/{student_id}")
def edit_student(student_id: int, data: StudentEdit, me=Depends(admin_only)):
    values = data.model_dump(exclude_unset=True)
    if "email" in values and values["email"]:
        values["email"] = _email(values["email"])
    if not values:
        return {"message": "Nothing to change."}
    with transaction() as tx:
        tx.execute(f"UPDATE student SET {', '.join(f'{k} = %s' for k in values)} WHERE student_id = %s",
                   tuple(values.values()) + (student_id,))
        if values.get("email"):
            tx.execute("UPDATE app_user SET email = %s WHERE student_id = %s", (values["email"], student_id))
        audit.record(me, "UPDATE", "student", student_id, "Edited a student", tx)
    return {"message": "Saved."}


# ---------------------------------------------------------------------------
# Sign-in accounts
# ---------------------------------------------------------------------------
class LoginFor(BaseModel):
    staff_id: int | None = None
    student_id: int | None = None


@router.post("/logins")
def create_login(data: LoginFor, me=Depends(admin_only)):
    """Give an existing person a sign-in account."""
    if (data.staff_id is None) == (data.student_id is None):
        raise HTTPException(400, "Choose one staff member or one student.")
    table, key, value = (("staff", "staff_id", data.staff_id) if data.staff_id
                         else ("student", "student_id", data.student_id))
    person = fetch_one(f"SELECT email, CONCAT(first_name, ' ', last_name) AS n FROM {table} WHERE {key} = %s",
                       (value,))
    if person is None:
        raise HTTPException(404, "Not found.")
    password = temporary_password()
    new = execute(f"INSERT INTO app_user (email, password_hash, {key}, must_change_password) "
                  "VALUES (%s, %s, %s, TRUE)", (person["email"], hash_password(password), value))
    audit.record(me, "CREATE", "app_user", new, f"Created a login for {person['n']}")
    return {"temporary_password": password}


@router.post("/logins/{user_id}/reset")
def reset_password(user_id: int, me=Depends(admin_only)):
    """For someone locked out. The new password works once; they must choose
    their own immediately after."""
    if user_id == me.user_id:
        raise HTTPException(400, "Change your own password from your account menu.")
    row = fetch_one("SELECT email FROM app_user WHERE user_id = %s", (user_id,))
    if row is None:
        raise HTTPException(404, "Not found.")
    password = temporary_password()
    execute("UPDATE app_user SET password_hash = %s, must_change_password = TRUE WHERE user_id = %s",
            (hash_password(password), user_id))
    audit.record(me, "PASSWORD", "app_user", user_id, f"Reset the password for {row['email']}")
    return {"temporary_password": password}


class LoginState(BaseModel):
    is_active: bool


@router.put("/logins/{user_id}")
def set_login_state(user_id: int, data: LoginState, me=Depends(admin_only)):
    if user_id == me.user_id and not data.is_active:
        raise HTTPException(400, "You cannot switch off your own account.")
    execute("UPDATE app_user SET is_active = %s WHERE user_id = %s", (data.is_active, user_id))
    audit.record(me, "UPDATE", "app_user", user_id, "Enabled a login" if data.is_active else "Disabled a login")
    return {"message": "Saved."}
