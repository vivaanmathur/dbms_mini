"""
All the database code for the project.

We are NOT using an ORM. We just run plain SQL with %s placeholders (so
nobody can do SQL injection on us).

One thing to know: our Hostinger account only allows 500 new connections per
hour. If we opened a brand new connection for every single query we would run
out very fast. So we make a small pool of connections once, and every query
borrows one and gives it back.
"""
import datetime
import os

import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv

load_dotenv()  # reads the .env file that sits next to this project

connection_pool = None


def get_connection():
    """Borrows one connection from the pool, making the pool the first time."""
    global connection_pool
    if connection_pool is None:
        connection_pool = pooling.MySQLConnectionPool(
            pool_name="scheduler_pool",
            pool_size=5,
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", 3306)),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            autocommit=True,
            # use_pure = use the plain-Python version of the MySQL driver.
            # The default (C) version kept failing its encrypted login with
            # "Lost connection ... reading authorization packet" on some
            # networks, while the Python version logs in fine and is still
            # encrypted. Please do not switch this off, and do NOT fix it with
            # ssl_disabled=True - that would send the password in plain text.
            use_pure=True,
        )
    return connection_pool.get_connection()


def fix_times(row):
    """MySQL gives back TIME columns as a timedelta (like '8:30:00' becoming
    30600 seconds). That looks ugly in JSON, so we turn it into "08:30".
    Dates become "2026-09-23" the same way."""
    clean = {}
    for key, value in row.items():
        if isinstance(value, datetime.timedelta):
            total_minutes = int(value.total_seconds()) // 60
            clean[key] = "%02d:%02d" % (total_minutes // 60, total_minutes % 60)
        elif isinstance(value, datetime.date):
            clean[key] = value.isoformat()
        else:
            clean[key] = value
    return clean


def _give_back(conn):
    """Returns a connection to the pool. If the server already dropped it,
    closing can itself fail, and we do not want that to hide the real error."""
    try:
        conn.close()
    except mysql.connector.Error:
        pass


def _run(sql, values, wants_rows):
    """
    Runs one statement. If the connection we borrowed had gone stale (the
    server drops idle ones), we throw it away and try once more with a
    fresh one - otherwise a page would fail for no good reason.
    """
    last_error = None
    for attempt in range(2):
        conn = None
        try:
            conn = get_connection()
            cursor = conn.cursor(dictionary=wants_rows)
            try:
                cursor.execute(sql, values)
                if wants_rows:
                    return cursor.fetchall()
                return cursor.lastrowid
            finally:
                cursor.close()
        except (mysql.connector.InterfaceError, mysql.connector.OperationalError) as error:
            last_error = error  # a broken connection, worth one retry
        finally:
            if conn is not None:
                _give_back(conn)
    raise last_error


def run_query(sql, values=()):
    """Runs a SELECT and gives back a list of dictionaries."""
    return [fix_times(row) for row in _run(sql, values, True)]


def run_query_one(sql, values=()):
    """Same as run_query but returns only the first row (or None)."""
    rows = run_query(sql, values)
    if len(rows) == 0:
        return None
    return rows[0]


def run_update(sql, values=()):
    """Runs an INSERT / UPDATE / DELETE. Returns the new id for an INSERT."""
    return _run(sql, values, False)


def call_procedure(name, values=()):
    """
    Calls one of the stored procedures, for example sp_schedule_slot.

    We use callproc() and not execute("CALL ..."), because a plain execute
    can leave leftover results sitting on the connection, and then the next
    query that borrows that connection from the pool just hangs.
    """
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.callproc(name, values)
        # read anything the procedure left behind so the connection is clean
        for leftover in cursor.stored_results():
            leftover.fetchall()
    finally:
        cursor.close()
        _give_back(conn)
