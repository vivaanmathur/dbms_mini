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

# Encryption to the database. It may only be switched off for a database on
# this same machine; a remote database always gets TLS, because turning it
# off there would send the password across the network in plain text.
DB_SSL = os.getenv("DB_SSL", "on").lower() != "off"
if not DB_SSL and DB_HOST not in ("127.0.0.1", "localhost", "::1"):
    raise RuntimeError("DB_SSL=off is only allowed for a local database")

JWT_SECRET_KEY = _required("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
