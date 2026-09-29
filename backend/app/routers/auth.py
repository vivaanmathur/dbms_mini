"""Signing in, finding out who you are, and choosing your own password."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from app import audit
from app.db import execute, fetch_one
from app.security import (check_password, hash_password, make_token,
                          password_problem, signed_in_any)

router = APIRouter(prefix="/auth", tags=["Sign in"])


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    """The form field is called 'username' by the OAuth2 standard; it takes
    the email address."""
    user = fetch_one(
        "SELECT user_id, password_hash, is_active, must_change_password FROM app_user WHERE email = %s",
        (form.username.strip().lower(),),
    )
    # The same message whether the email or the password was wrong, so the
    # form cannot be used to discover which emails have accounts.
    if user is None or not check_password(form.password, user["password_hash"]):
        raise HTTPException(401, "That email and password do not match.")
    if not user["is_active"]:
        raise HTTPException(403, "This account has been switched off. Ask an administrator.")

    execute("UPDATE app_user SET last_login_at = NOW() WHERE user_id = %s", (user["user_id"],))
    return {
        "access_token": make_token(user["user_id"]),
        "token_type": "bearer",
        "must_change_password": bool(user["must_change_password"]),
    }


@router.get("/me")
def me(principal=Depends(signed_in_any)):
    """Everything the interface needs to decide which dashboards to offer."""
    return principal.public()


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
def change_password(data: PasswordChange, principal=Depends(signed_in_any)):
    user = fetch_one("SELECT password_hash FROM app_user WHERE user_id = %s", (principal.user_id,))
    if not check_password(data.current_password, user["password_hash"]):
        raise HTTPException(400, "Your current password is not right.")
    if data.new_password == data.current_password:
        raise HTTPException(400, "Choose a password different from the current one.")
    problem = password_problem(data.new_password)
    if problem:
        raise HTTPException(400, problem)

    execute(
        "UPDATE app_user SET password_hash = %s, must_change_password = FALSE WHERE user_id = %s",
        (hash_password(data.new_password), principal.user_id),
    )
    audit.record(principal, "PASSWORD", "app_user", principal.user_id, "Changed their own password")
    return {"message": "Password changed."}
