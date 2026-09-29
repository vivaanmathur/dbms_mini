"""
List / create / edit / delete for the simple things an administrator
manages — departments, programmes, terms, periods, rooms and subjects.

Each resource is described once (its table, its fields, how to name a row in
the audit trail) and gets the same four routes. The SQL is still plain,
parameterised SQL; only column names come from this file, never from the
request, so nothing a user sends can change the shape of a query.
"""
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import create_model

from app import audit
from app.db import execute, fetch_all, fetch_one
from app.security import admin_only


class Resource:
    def __init__(self, name: str, table: str, pk: str, fields: dict,
                 order_by: str, label: Callable[[dict], str],
                 list_sql: Optional[str] = None, clean: Optional[Callable[[dict], dict]] = None):
        """
        fields maps a column to (python type, required?). Only these columns
        can ever be written.
        """
        self.name, self.table, self.pk = name, table, pk
        self.fields, self.order_by, self.label = fields, order_by, label
        self.list_sql = list_sql or f"SELECT * FROM {table} ORDER BY {order_by}"
        self.clean = clean or (lambda d: d)

        self.CreateModel = create_model(
            f"{name.title()}Create",
            **{col: ((kind, ...) if required else (Optional[kind], None))
               for col, (kind, required) in fields.items()})
        self.UpdateModel = create_model(
            f"{name.title()}Update",
            **{col: (Optional[kind], None) for col, (kind, _) in fields.items()})

    def _row(self, row_id):
        row = fetch_one(f"SELECT * FROM {self.table} WHERE {self.pk} = %s", (row_id,))
        if row is None:
            raise HTTPException(404, "Not found.")
        return row

    def mount(self, router: APIRouter):
        CreateModel, UpdateModel = self.CreateModel, self.UpdateModel

        def list_all(me=Depends(admin_only)):
            return fetch_all(self.list_sql)

        def create(data: CreateModel, me=Depends(admin_only)):  # type: ignore[valid-type]
            values = self.clean({k: v for k, v in data.model_dump().items() if v is not None})
            columns = list(values)
            new_id = execute(
                f"INSERT INTO {self.table} ({', '.join(columns)}) "
                f"VALUES ({', '.join(['%s'] * len(columns))})",
                tuple(values[c] for c in columns))
            row = self._row(new_id)
            audit.record(me, "CREATE", self.table, new_id, f"Added {self.label(row)}")
            return row

        def update(row_id: int, data: UpdateModel, me=Depends(admin_only)):  # type: ignore[valid-type]
            self._row(row_id)
            values = self.clean(data.model_dump(exclude_unset=True))
            if values:
                execute(
                    f"UPDATE {self.table} SET {', '.join(f'{c} = %s' for c in values)} "
                    f"WHERE {self.pk} = %s",
                    tuple(values.values()) + (row_id,))
            row = self._row(row_id)
            audit.record(me, "UPDATE", self.table, row_id, f"Edited {self.label(row)}")
            return row

        def delete(row_id: int, me=Depends(admin_only)):
            row = self._row(row_id)
            # a foreign key refusing the delete comes back as a readable 400
            execute(f"DELETE FROM {self.table} WHERE {self.pk} = %s", (row_id,))
            audit.record(me, "DELETE", self.table, row_id, f"Removed {self.label(row)}")
            return {"message": f"Removed {self.label(row)}."}

        path = f"/{self.name}"
        router.add_api_route(path, list_all, methods=["GET"], summary=f"List {self.name}")
        router.add_api_route(path, create, methods=["POST"], summary=f"Add to {self.name}")
        router.add_api_route(path + "/{row_id}", update, methods=["PUT"], summary=f"Edit in {self.name}")
        router.add_api_route(path + "/{row_id}", delete, methods=["DELETE"], summary=f"Remove from {self.name}")


def upper(*columns):
    """Codes are stored upper-case so "vy115" and "VY115" are the same room."""
    def clean(values: dict[str, Any]):
        for c in columns:
            if values.get(c):
                values[c] = values[c].strip().upper()
        return values
    return clean
