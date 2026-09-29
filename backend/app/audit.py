"""
A record of who changed what. Every administrative write goes through here,
so the audit page can answer "who moved this lecture, and when".
"""
from app.db import execute


def record(me, action, entity, entity_id, summary, tx=None):
    run = tx.execute if tx is not None else execute
    run(
        "INSERT INTO audit_log (user_id, action, entity, entity_id, summary) "
        "VALUES (%s, %s, %s, %s, %s)",
        (me.user_id if me else None, action, entity, entity_id, summary[:300]),
    )
