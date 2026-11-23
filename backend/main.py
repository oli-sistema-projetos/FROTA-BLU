import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Mapping

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, URL, make_url
from sqlalchemy.exc import IntegrityError


load_dotenv()

DATABASE_PATH = Path(os.environ.get("CARRETAS_DB", Path(__file__).with_name("carretas.db")))
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

if os.environ.get("VERCEL") == "1" and not DATABASE_URL:
    raise RuntimeError("Configure DATABASE_URL nas variáveis de ambiente do Vercel.")

if DATABASE_URL:
    database_url: URL = make_url(DATABASE_URL)
    if database_url.drivername in ("postgres", "postgresql"):
        database_url = database_url.set(drivername="postgresql+psycopg")
    if database_url.get_backend_name() == "postgresql" and "sslmode" not in database_url.query:
        database_url = database_url.update_query_dict({"sslmode": "require"})
    engine = create_engine(database_url, pool_pre_ping=True)
else:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    sqlite_url = "sqlite:///" + DATABASE_PATH.resolve().as_posix()
    engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})


@contextmanager
def database():
    with engine.begin() as connection:
        yield connection


def initialize_database():
    with database() as connection:
        connection.exec_driver_sql(
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
        if engine.dialect.name == "postgresql":
            connection.exec_driver_sql(
                """
                CREATE TABLE IF NOT EXISTS app_migrations (
                    key TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )


def migrate_legacy_sqlite_data():
    if engine.dialect.name != "postgresql" or not DATABASE_PATH.is_file():
        return

    with sqlite3.connect(DATABASE_PATH) as local_connection:
        exists = local_connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trailers'"
        ).fetchone()
        if not exists:
            return
        local_connection.row_factory = sqlite3.Row
        legacy_rows = local_connection.execute("SELECT * FROM trailers").fetchall()

    with database() as connection:
        already_migrated = connection.execute(
            text("SELECT key FROM app_migrations WHERE key = :key"),
            {"key": "sqlite-trailers-v1"}
        ).first()
        if already_migrated:
            return
        for row in legacy_rows:
            connection.execute(
                text(
                    """
                    INSERT INTO trailers
                        (id, plate, "loadStatus", location, "dockNumber", situation, reason, "createdAt")
                    VALUES
                        (:id, :plate, :loadStatus, :location, :dockNumber, :situation, :reason, :createdAt)
                    ON CONFLICT DO NOTHING
                    """
                ),
                dict(row)
            )
        connection.execute(
            text("INSERT INTO app_migrations (key, applied_at) VALUES (:key, :applied_at) ON CONFLICT DO NOTHING"),
            {"key": "sqlite-trailers-v1", "applied_at": datetime.now(timezone.utc).isoformat()}
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


def trailer_dict(row: Mapping) -> dict:
    return dict(row)


initialize_database()
migrate_legacy_sqlite_data()
app = FastAPI(title="FROTA BLU-GASPAR", version="1.0.0")


@app.get("/api/health")
def health():
    return {"status": "ok", "database": engine.dialect.name}


@app.get("/api/trailers")
def list_trailers():
    with database() as connection:
        rows = connection.execute(
            text('SELECT * FROM trailers ORDER BY "createdAt" DESC, plate ASC')
        ).mappings().all()
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
                text(
                    """
                    INSERT INTO trailers
                        (id, plate, "loadStatus", location, "dockNumber", situation, reason, "createdAt")
                    VALUES
                        (:id, :plate, :loadStatus, :location, :dockNumber, :situation, :reason, :createdAt)
                    """
                ),
                trailer
            )
    except IntegrityError as error:
        if "plate" in str(error.orig).lower():
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
        row = connection.execute(
            text("SELECT * FROM trailers WHERE id = :id"),
            {"id": trailer_id}
        ).mappings().first()
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
        assignments = ", ".join(f'"{name}" = :{name}' for name in columns)
        connection.execute(
            text(f"UPDATE trailers SET {assignments} WHERE id = :id"),
            {**columns, "id": trailer_id}
        )
        result = connection.execute(
            text("SELECT * FROM trailers WHERE id = :id"),
            {"id": trailer_id}
        ).mappings().first()
    return trailer_dict(result)


@app.delete("/api/trailers/{trailer_id}", status_code=204)
def delete_trailer(trailer_id: str):
    with database() as connection:
        result = connection.execute(
            text("DELETE FROM trailers WHERE id = :id"),
            {"id": trailer_id}
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Carreta não encontrada.")
    return Response(status_code=204)
