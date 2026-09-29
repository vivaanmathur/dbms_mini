"""
Who is asking, and what they are allowed to see.

A login belongs to either a staff member or a student — never both. A staff
member can hold several roles at once (a programme coordinator who also
teaches, say), and each role has its own scope. What a person can see is the
UNION of everything their roles cover.

    ADMIN                the whole system, and the only role that manages it
    PROGRAM_DIRECTOR     everything in their department
    PROGRAM_COORDINATOR  everything in their programme
    YEAR_COORDINATOR     one year of study, across a department or a programme
    CLASS_TEACHER        one class
    FACULTY              the classes they teach
    STUDENT              their own class, read-only
"""
import datetime

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app import config
from app.db import fetch_all, fetch_one

_passwords = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

STAFF_ROLES = ["ADMIN", "PROGRAM_DIRECTOR", "PROGRAM_COORDINATOR",
               "YEAR_COORDINATOR", "CLASS_TEACHER", "FACULTY"]

# Oversight roles see every class in their scope. Order matters: it is the
# order dashboards are offered in, broadest first.
ROLE_ORDER = {role: i for i, role in enumerate(STAFF_ROLES + ["STUDENT"])}

MIN_PASSWORD_LENGTH = 10


# ---------------------------------------------------------------------------
# Passwords and tokens
# ---------------------------------------------------------------------------
def hash_password(plain):
    return _passwords.hash(plain)


def check_password(plain, hashed):
    try:
        return _passwords.verify(plain, hashed)
    except ValueError:
        return False


def password_problem(plain):
    """Why a new password is not acceptable, or None if it is."""
    if len(plain) < MIN_PASSWORD_LENGTH:
        return f"Use at least {MIN_PASSWORD_LENGTH} characters."
    if plain.lower() == plain or plain.upper() == plain:
        return "Mix upper and lower case letters."
    if not any(ch.isdigit() for ch in plain):
        return "Include at least one number."
    return None


def make_token(user_id):
    expires = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        minutes=config.JWT_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expires},
                      config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ---------------------------------------------------------------------------
# The principal
# ---------------------------------------------------------------------------
class Principal:
    def __init__(self, user, roles):
        self.user_id = user["user_id"]
        self.email = user["email"]
        self.staff_id = user["staff_id"]
        self.student_id = user["student_id"]
        self.name = user["name"]
        self.must_change_password = bool(user["must_change_password"])
        self.roles = roles                      # list of role dicts
        self._sections = None

    @property
    def is_student(self):
        return self.student_id is not None

    @property
    def is_admin(self):
        return self.has("ADMIN")

    def has(self, role):
        return any(r["role"] == role for r in self.roles)

    def roles_of(self, role):
        return [r for r in self.roles if r["role"] == role]

    # -- what can they see ---------------------------------------------------
    def section_ids(self):
        """Every class this person may look at. Worked out once per request."""
        if self._sections is None:
            self._sections = _visible_sections(self)
        return self._sections

    def can_see_section(self, section_id):
        return int(section_id) in self.section_ids()

    def oversees_section(self, section_id):
        """Can they act on a class they do not personally teach — arrange a
        make-up for it, say. Faculty alone cannot; any oversight role can."""
        if self.is_admin:
            return True
        oversight = [r for r in self.roles if r["role"] not in ("FACULTY",)]
        if not oversight:
            return False
        return int(section_id) in _sections_for_roles(oversight)

    def public(self):
        return {
            "user_id": self.user_id,
            "email": self.email,
            "name": self.name,
            "kind": "student" if self.is_student else "staff",
            "staff_id": self.staff_id,
            "student_id": self.student_id,
            "must_change_password": self.must_change_password,
            "roles": self.roles,
        }


def _sections_for_roles(roles):
    ids = set()
    for role in roles:
        kind = role["role"]
        if kind == "ADMIN":
            rows = fetch_all("SELECT section_id FROM section")
        elif kind == "PROGRAM_DIRECTOR":
            rows = fetch_all(
                "SELECT s.section_id FROM section s JOIN program p ON p.program_id = s.program_id "
                "WHERE p.department_id = %s", (role["department_id"],))
        elif kind == "PROGRAM_COORDINATOR":
            rows = fetch_all("SELECT section_id FROM section WHERE program_id = %s",
                             (role["program_id"],))
        elif kind == "YEAR_COORDINATOR":
            if role["program_id"]:
                rows = fetch_all(
                    "SELECT section_id FROM section WHERE program_id = %s AND year_of_study = %s",
                    (role["program_id"], role["year_of_study"]))
            else:
                rows = fetch_all(
                    "SELECT s.section_id FROM section s JOIN program p ON p.program_id = s.program_id "
                    "WHERE p.department_id = %s AND s.year_of_study = %s",
                    (role["department_id"], role["year_of_study"]))
        elif kind == "CLASS_TEACHER":
            rows = [{"section_id": role["section_id"]}]
        else:
            rows = []
        ids.update(int(r["section_id"]) for r in rows)
    return ids


def _visible_sections(principal):
    if principal.is_student:
        row = fetch_one("SELECT section_id FROM student WHERE student_id = %s",
                        (principal.student_id,))
        return {int(row["section_id"])} if row else set()

    ids = _sections_for_roles(principal.roles)
    if principal.has("FACULTY"):
        taught = fetch_all(
            """
            SELECT DISTINCT so.section_id
            FROM teaching_assignment ta
            JOIN subject_offering so ON so.offering_id = ta.offering_id
            WHERE ta.staff_id = %s
            """,
            (principal.staff_id,),
        )
        ids.update(int(r["section_id"]) for r in taught)
    return ids


def _load_roles(staff_id):
    """Every role a staff member holds, with a readable name for its scope."""
    rows = fetch_all(
        """
        SELECT ra.role_assignment_id, ra.role, ra.department_id, ra.program_id,
               ra.year_of_study, ra.section_id,
               d.code AS department_code, d.name AS department_name,
               p.short_name AS program_short, p.name AS program_name,
               IF(ra.section_id IS NULL, NULL, fn_class_label(ra.section_id)) AS class_label,
               yd.code AS year_department_code
        FROM role_assignment ra
        LEFT JOIN department d  ON d.department_id = ra.department_id
        LEFT JOIN program p     ON p.program_id = ra.program_id
        LEFT JOIN department yd ON yd.department_id = ra.department_id
        WHERE ra.staff_id = %s
        """,
        (staff_id,),
    )
    years = {1: "First Year", 2: "Second Year", 3: "Third Year", 4: "Final Year"}
    for r in rows:
        role = r["role"]
        if role == "ADMIN":
            r["scope_label"] = "Whole system"
        elif role == "FACULTY":
            r["scope_label"] = "Subjects you teach"
        elif role == "PROGRAM_DIRECTOR":
            r["scope_label"] = r["department_name"]
        elif role == "PROGRAM_COORDINATOR":
            r["scope_label"] = r["program_name"]
        elif role == "YEAR_COORDINATOR":
            where = r["program_short"] or r["year_department_code"]
            r["scope_label"] = f"{years.get(r['year_of_study'], 'Year ' + str(r['year_of_study']))} · {where}"
        elif role == "CLASS_TEACHER":
            r["scope_label"] = r["class_label"]
    rows.sort(key=lambda r: ROLE_ORDER[r["role"]])
    return rows


def _load_principal(user_id):
    user = fetch_one(
        """
        SELECT u.user_id, u.email, u.staff_id, u.student_id, u.must_change_password,
               u.is_active,
               COALESCE(CONCAT(st.first_name, ' ', st.last_name),
                        CONCAT(sd.first_name, ' ', sd.last_name)) AS name,
               COALESCE(st.is_active, sd.is_active) AS owner_active
        FROM app_user u
        LEFT JOIN staff st   ON st.staff_id = u.staff_id
        LEFT JOIN student sd ON sd.student_id = u.student_id
        WHERE u.user_id = %s
        """,
        (user_id,),
    )
    if user is None or not user["is_active"] or not user["owner_active"]:
        return None

    if user["student_id"]:
        roles = [{"role": "STUDENT", "role_assignment_id": None,
                  "scope_label": "Your class"}]
    else:
        roles = _load_roles(user["staff_id"])
    return Principal(user, roles)


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------
def _from_token(token):
    if not token:
        raise HTTPException(401, "Please sign in.")
    try:
        user_id = int(jwt.decode(token, config.JWT_SECRET_KEY,
                                 algorithms=[config.JWT_ALGORITHM])["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    principal = _load_principal(user_id)
    if principal is None:
        raise HTTPException(401, "This account is not active.")
    return principal


def signed_in_any(token: str = Depends(_bearer)):
    """Signed in, even if they still have to change their password. Only the
    change-password route uses this."""
    return _from_token(token)


def signed_in(token: str = Depends(_bearer)):
    """Signed in and past the first-login password change."""
    principal = _from_token(token)
    if principal.must_change_password:
        raise HTTPException(403, "PASSWORD_CHANGE_REQUIRED")
    return principal


def staff_only(me=Depends(signed_in)):
    if me.is_student:
        raise HTTPException(403, "This is for staff only.")
    return me


def student_only(me=Depends(signed_in)):
    if not me.is_student:
        raise HTTPException(403, "This is for students only.")
    return me


def admin_only(me=Depends(signed_in)):
    if not me.is_admin:
        raise HTTPException(403, "Only an administrator can do that.")
    return me


def teaching_only(me=Depends(staff_only)):
    if not me.has("FACULTY"):
        raise HTTPException(403, "Only teaching staff can do that.")
    return me


def require_section(me, section_id):
    """Stop someone reading a class outside everything their roles cover."""
    if not me.can_see_section(section_id):
        raise HTTPException(403, "That class is outside what you have access to.")
