"""
Login helpers: checking the password and making/reading the login token.
"""
import datetime
import os

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from passlib.context import CryptContext

from app.database import run_query_one

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me")
ALGORITHM = "HS256"
TOKEN_VALID_MINUTES = 480  # 8 hours, so it does not expire during a demo

password_helper = CryptContext(schemes=["bcrypt"], deprecated="auto")

# This tells FastAPI to look for "Authorization: Bearer <token>" on requests.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def check_password(typed_password, stored_hash):
    return password_helper.verify(typed_password, stored_hash)


def make_token(user_id):
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=TOKEN_VALID_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expires_at}, SECRET_KEY, algorithm=ALGORITHM)


def get_logged_in_teacher(token=Depends(oauth2_scheme)):
    """
    Every protected route uses this. It reads the token, finds the user in
    app_user, and returns that teacher's row (joined with faculty so we also
    get their name and faculty_id).
    """
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = data["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Please login again")

    teacher = run_query_one(
        """
        SELECT u.user_id, u.email, u.user_role, f.faculty_id,
               f.first_name, f.last_name, f.employee_code
        FROM app_user u
        JOIN faculty f ON f.faculty_id = u.faculty_id
        WHERE u.user_id = %s AND u.is_active = 1
        """,
        (user_id,),
    )
    if teacher is None:
        raise HTTPException(status_code=401, detail="Please login again")
    return teacher
