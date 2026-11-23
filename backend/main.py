import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field, field_validator


DATABASE_PATH = Path(os.environ.get("CARRETAS_DB", Path(__file__).with_name("carretas.db")))


@contextmanager
def database():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS trailers (
                id TEXT PRIMARY KEY,
                plate TEXT NOT NULL UNIQUE,
                "loadStatus" TEXT NOT NULL CHECK ("loadStatus" IN ('Carregada', 'Vazia')),
                location TEXT NOT NULL CHECK (location IN ('Pátio', 'Doca')),
                "dockNumber" TEXT NOT NULL DEFAULT '',
                situation TEXT NOT NULL CHECK (situation IN ('Liberada', 'Bloqueada')),
                reason TEXT NOT NULL DEFAULT '',
                "createdAt" TEXT NOT NULL
            )
            """
        )


class TrailerCreate(BaseModel):
    plate: str = Field(min_length=1, max_length=10)
    loadStatus: Literal["Carregada", "Vazia"]
    location: Literal["Pátio", "Doca"]
    dockNumber: str | None = Field(default=None, max_length=12)
    situation: Literal["Liberada", "Bloqueada"]
    reason: str | None = Field(default=None, max_length=100)

    @field_validator("plate")
    @classmethod
    def normalize_plate(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("A placa é obrigatória.")
        return normalized


class TrailerUpdate(BaseModel):
    loadStatus: Literal["Carregada", "Vazia"] | None = None
    location: Literal["Pátio", "Doca"] | None = None
    dockNumber: str | None = Field(default=None, max_length=12)
    situation: Literal["Liberada", "Bloqueada"] | None = None
    reason: str | None = Field(default=None, max_length=100)


def trailer_dict(row: sqlite3.Row) -> dict:
    return dict(row)


initialize_database()
app = FastAPI(title="FROTA BLU-GASPAR", version="1.0.0")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/trailers")
def list_trailers():
    with database() as connection:
        rows = connection.execute(
            'SELECT * FROM trailers ORDER BY "createdAt" DESC, plate ASC'
        ).fetchall()
    return [trailer_dict(row) for row in rows]


@app.post("/api/trailers", status_code=201)
def create_trailer(payload: TrailerCreate):
    data = payload.model_dump()
    dock_number = (data["dockNumber"] or "").strip() if data["location"] == "Doca" else ""
    reason = (data["reason"] or "").strip() if data["situation"] == "Bloqueada" else ""
    if data["location"] == "Doca" and not dock_number:
        raise HTTPException(status_code=422, detail="O número da doca é obrigatório.")
    if data["situation"] == "Bloqueada" and not reason:
        raise HTTPException(status_code=422, detail="O motivo do bloqueio é obrigatório.")

    trailer = {
        "id": str(uuid.uuid4()),
        "plate": data["plate"],
        "loadStatus": data["loadStatus"],
        "location": data["location"],
        "dockNumber": dock_number,
        "situation": data["situation"],
        "reason": reason,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    try:
        with database() as connection:
            connection.execute(
                """
                INSERT INTO trailers
                    (id, plate, "loadStatus", location, "dockNumber", situation, reason, "createdAt")
                VALUES
                    (:id, :plate, :loadStatus, :location, :dockNumber, :situation, :reason, :createdAt)
                """,
                trailer
            )
    except sqlite3.IntegrityError as error:
        if "plate" in str(error).lower():
            raise HTTPException(status_code=409, detail="Já existe uma carreta cadastrada com esta placa.") from error
        raise
    return trailer


@app.patch("/api/trailers/{trailer_id}")
def update_trailer(trailer_id: str, payload: TrailerUpdate):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Informe ao menos um campo para atualizar.")
    if any(changes.get(key) is None for key in ("loadStatus", "location", "situation") if key in changes):
        raise HTTPException(status_code=422, detail="Status, local e situação não podem ficar vazios.")
    with database() as connection:
        row = connection.execute("SELECT * FROM trailers WHERE id = ?", (trailer_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Carreta não encontrada.")
        current = trailer_dict(row)
        updated = {**current, **changes}
        if updated["location"] == "Doca":
            updated["dockNumber"] = (updated.get("dockNumber") or "").strip()
            if not updated["dockNumber"]:
                raise HTTPException(status_code=422, detail="O número da doca é obrigatório.")
        else:
            updated["dockNumber"] = ""
        if updated["situation"] == "Bloqueada":
            updated["reason"] = (updated.get("reason") or "").strip()
            if not updated["reason"]:
                raise HTTPException(status_code=422, detail="O motivo do bloqueio é obrigatório.")
        else:
            updated["reason"] = ""

        columns = {
            "loadStatus": updated["loadStatus"],
            "location": updated["location"],
            "dockNumber": updated["dockNumber"],
            "situation": updated["situation"],
            "reason": updated["reason"]
        }
        assignments = ", ".join(f'"{name}" = ?' for name in columns)
        connection.execute(
            f"UPDATE trailers SET {assignments} WHERE id = ?",
            (*columns.values(), trailer_id)
        )
        result = connection.execute("SELECT * FROM trailers WHERE id = ?", (trailer_id,)).fetchone()
    return trailer_dict(result)


@app.delete("/api/trailers/{trailer_id}", status_code=204)
def delete_trailer(trailer_id: str):
    with database() as connection:
        cursor = connection.execute("DELETE FROM trailers WHERE id = ?", (trailer_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Carreta não encontrada.")
    return Response(status_code=204)
