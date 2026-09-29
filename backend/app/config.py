"""
Settings, read once from backend/.env.

Nothing here has a sensible default for production — if a value is missing
the app fails at startup rather than running against the wrong database.
"""
import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


def _required(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is not set in backend/.env")
    return value


DB_HOST = _required("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_NAME = _required("DB_NAME")
DB_USER = _required("DB_USER")
DB_PASSWORD = _required("DB_PASSWORD")

# There is deliberately no setting to switch encryption to the database off.
# Remotely it would send the password in plain text. Locally it breaks too:
# MySQL 8+ signs users in with caching_sha2_password, which needs an encrypted
# connection whenever its password cache is cold — after every restart of
# MySQL — so an unencrypted app cannot connect until something else has.

JWT_SECRET_KEY = _required("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
