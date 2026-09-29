"""
Database access. Plain SQL with %s placeholders — no ORM — so every query in
the project is visible and parameterised.

Two ways to talk to the database:

  fetch_all / fetch_one / execute / call   one statement, committed at once
  with transaction() as tx:                several statements that must all
                                           happen or none of them do

The connection pool waits for a free connection instead of failing when all
are busy, and replaces connections the server has dropped. Both of those
were real failures under load in the prototype.
"""
import datetime
import decimal
import time
from contextlib import contextmanager

import mysql.connector
from fastapi import HTTPException
from mysql.connector import errorcode, pooling

from app import config

POOL_SIZE = 10
WAIT_SECONDS = 20

_pool = None


def _make_pool():
    options = dict(
        pool_name="continuity",
        pool_size=POOL_SIZE,
        host=config.DB_HOST,
        port=config.DB_PORT,
        database=config.DB_NAME,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        autocommit=True,
        # the pure-Python driver: the C one failed its TLS handshake with the
        # hosted MariaDB on some networks, while this one connects cleanly
        use_pure=True,
        time_zone="+05:30",
    )
    return pooling.MySQLConnectionPool(**options)


def _borrow():
    global _pool
    if _pool is None:
        _pool = _make_pool()
    give_up_at = time.time() + WAIT_SECONDS
    while True:
        try:
            return _pool.get_connection()
        except pooling.PoolError:
            if time.time() >= give_up_at:
                raise HTTPException(503, "The database is busy. Please try again.")
            time.sleep(0.05)


def _give_back(conn):
    """If the server already dropped this connection, closing it fails and the
    pool loses the slot — so put a fresh connection in its place."""
    try:
        conn.close()
    except mysql.connector.Error:
        try:
            _pool.add_connection()
        except mysql.connector.Error:
            pass


# ---------------------------------------------------------------------------
# Turning MySQL values into JSON-friendly ones
# ---------------------------------------------------------------------------
def _clean(value):
    if isinstance(value, datetime.timedelta):          # TIME columns
        minutes = int(value.total_seconds()) // 60
        return "%02d:%02d" % (minutes // 60, minutes % 60)
    if isinstance(value, datetime.datetime):
        return value.isoformat(sep=" ", timespec="minutes")
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (bytes, bytearray)):
        return value.decode()
    return value


def _clean_row(row):
    return {key: _clean(value) for key, value in row.items()}


# ---------------------------------------------------------------------------
# Turning database errors into messages a person can act on
# ---------------------------------------------------------------------------
FRIENDLY = {
    errorcode.ER_DUP_ENTRY: "That already exists.",
    errorcode.ER_ROW_IS_REFERENCED_2: "It is still in use elsewhere, so it cannot be removed.",
    errorcode.ER_NO_REFERENCED_ROW_2: "Something it refers to does not exist.",
    errorcode.ER_CHECK_CONSTRAINT_VIOLATED: "That combination of values is not allowed.",
}


def _translate(error):
    """SIGNAL messages from the triggers and procedures are already written
    for people, so pass those straight through."""
    if error.sqlstate == "45000":
        return HTTPException(400, error.msg)
    if error.errno in FRIENDLY:
        return HTTPException(400, FRIENDLY[error.errno])
    return HTTPException(500, "Database error: " + str(error.msg))


class _Runner:
    """What a transaction hands you: the same helpers, on one connection."""

    def __init__(self, conn):
        self.conn = conn

    def fetch_all(self, sql, values=()):
        cursor = self.conn.cursor(dictionary=True)
        try:
            cursor.execute(sql, values)
            return [_clean_row(r) for r in cursor.fetchall()]
        except mysql.connector.Error as error:
            raise _translate(error)
        finally:
            cursor.close()

    def fetch_one(self, sql, values=()):
        rows = self.fetch_all(sql, values)
        return rows[0] if rows else None

    def execute(self, sql, values=()):
        """INSERT / UPDATE / DELETE. Returns the new id, or rows affected."""
        cursor = self.conn.cursor()
        try:
            cursor.execute(sql, values)
            return cursor.lastrowid or cursor.rowcount
        except mysql.connector.Error as error:
            raise _translate(error)
        finally:
            cursor.close()

    def call(self, procedure, values=()):
        """Calls a stored procedure and returns the rows of its last SELECT."""
        cursor = self.conn.cursor(dictionary=True)
        try:
            cursor.callproc(procedure, values)
            rows = []
            for result in cursor.stored_results():
                rows = [_clean_row(r) for r in result.fetchall()]
            return rows
        except mysql.connector.Error as error:
            raise _translate(error)
        finally:
            cursor.close()


def _once(method, sql, values=()):
    """Run one statement on a borrowed connection, retrying once if the
    connection turned out to be stale."""
    last = None
    for _ in range(2):
        conn = _borrow()
        try:
            return getattr(_Runner(conn), method)(sql, values)
        except (mysql.connector.InterfaceError, mysql.connector.OperationalError) as error:
            last = error
        finally:
            _give_back(conn)
    raise HTTPException(503, "Lost the connection to the database: " + str(last))


def fetch_all(sql, values=()):
    return _once("fetch_all", sql, values)


def fetch_one(sql, values=()):
    return _once("fetch_one", sql, values)


def execute(sql, values=()):
    return _once("execute", sql, values)


def call(procedure, values=()):
    return _once("call", procedure, values)


@contextmanager
def transaction():
    """
        with transaction() as tx:
            tx.execute(...)
            tx.execute(...)

    Everything inside commits together, or — if anything raises — rolls
    back together. Used wherever two writes must not come apart, such as
    accepting a cover request and closing the cancellation it answers.
    """
    conn = _borrow()
    conn.autocommit = False
    try:
        conn.start_transaction()
        yield _Runner(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.autocommit = True
        _give_back(conn)


def placeholders(items):
    """'%s,%s,%s' for an IN (...) list. Callers must not pass an empty list."""
    return ",".join(["%s"] * len(items))
