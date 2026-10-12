"""
Load the schema and the routines into the database named in backend/.env.

    cd backend
    .venv/bin/python -m scripts.load_schema            # an empty database
    .venv/bin/python -m scripts.load_schema --empty    # drop everything first

--empty removes EVERY table, view, procedure, function and trigger in that
database before loading — take a backup first if it holds anything you need.

Works with hosted databases (MariaDB on Hostinger) where the command-line
client cannot sign in, because it uses the same driver as the app.
"""
import os
import sys

import mysql.connector

from app import config

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ("sql/schema.sql", "sql/routines.sql")


def statements(path):
    """Split a .sql file into statements, honouring DELIMITER lines."""
    delimiter, buf = ";", []
    with open(path) as handle:
        for line in handle:
            bare = line.strip()
            if bare.upper().startswith("DELIMITER "):
                delimiter = bare.split()[1]
                continue
            if not bare or bare.startswith("--"):
                continue
            buf.append(line.rstrip("\n"))
            if bare.endswith(delimiter):
                text = "\n".join(buf).rstrip()
                yield text[: -len(delimiter)]
                buf = []
    if "".join(buf).strip():
        yield "\n".join(buf)


def empty(cur):
    cur.execute("SET FOREIGN_KEY_CHECKS = 0")
    cur.execute("SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = DATABASE()")
    for (name,) in cur.fetchall():
        cur.execute(f"DROP TRIGGER `{name}`")
    cur.execute("SELECT routine_name, routine_type FROM information_schema.routines "
                "WHERE routine_schema = DATABASE()")
    for name, kind in cur.fetchall():
        cur.execute(f"DROP {kind} `{name}`")
    cur.execute("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = DATABASE()")
    objects = cur.fetchall()
    for name, kind in objects:
        if kind == "VIEW":
            cur.execute(f"DROP VIEW `{name}`")
    for name, kind in objects:
        if kind != "VIEW":
            cur.execute(f"DROP TABLE `{name}`")
    cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    print(f"  emptied: {len(objects)} tables and views, plus routines and triggers")


def main():
    conn = mysql.connector.connect(
        host=config.DB_HOST, port=config.DB_PORT, user=config.DB_USER,
        password=config.DB_PASSWORD, database=config.DB_NAME,
        use_pure=True, autocommit=True, connection_timeout=60)
    cur = conn.cursor()
    print(f"--- loading the schema into {config.DB_NAME} on {config.DB_HOST} ---")

    cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()")
    existing = cur.fetchone()[0]
    if existing and "--empty" not in sys.argv:
        sys.exit(f"  {config.DB_NAME} already has {existing} tables. Re-run with --empty to replace them.")
    if "--empty" in sys.argv:
        empty(cur)

    for relative in FILES:
        count = 0
        for sql in statements(os.path.join(BACKEND, relative)):
            try:
                cur.execute(sql)
            except mysql.connector.Error as error:
                sys.exit(f"  FAILED in {relative}:\n{sql[:400]}\n  -> {error}")
            count += 1
        print(f"  {relative}: {count} statements")

    cur.execute("SELECT table_type, COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = DATABASE() GROUP BY table_type")
    print("  now:", ", ".join(f"{n} {kind.lower()}" for kind, n in cur.fetchall()))
    print("\nNext:  .venv/bin/python -m scripts.seed")


if __name__ == "__main__":
    main()
