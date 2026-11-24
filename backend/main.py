import os
import sqlite3
import secrets
import uuid
import hmac
import hashlib
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Mapping

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
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
                "createdAt" TEXT NOT NULL,
                "createdById" TEXT NOT NULL DEFAULT '',
                "createdByName" TEXT NOT NULL DEFAULT '',
                "preventiveActive" BOOLEAN NOT NULL DEFAULT FALSE,
                "preventiveKm" INTEGER NOT NULL DEFAULT 0,
                "preventiveType" TEXT NOT NULL DEFAULT 'KM',
                "preventiveValue" INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS app_users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                username TEXT NOT NULL UNIQUE,
                "passwordHash" TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'operador')),
                "createdAt" TEXT NOT NULL
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS app_sessions (
                token TEXT PRIMARY KEY,
                "userId" TEXT NOT NULL,
                "createdAt" TEXT NOT NULL,
                "expiresAt" TEXT NOT NULL
            )
            """
        )
        if engine.dialect.name == "sqlite":
            trailer_columns = {
                row[1] for row in connection.exec_driver_sql("PRAGMA table_info(trailers)").all()
            }
            if "createdById" not in trailer_columns:
                connection.exec_driver_sql(
                    'ALTER TABLE trailers ADD COLUMN "createdById" TEXT NOT NULL DEFAULT \'\''
                )
            if "createdByName" not in trailer_columns:
                connection.exec_driver_sql(
                    'ALTER TABLE trailers ADD COLUMN "createdByName" TEXT NOT NULL DEFAULT \'\''
                )
            if "preventiveActive" not in trailer_columns:
                connection.exec_driver_sql(
                    'ALTER TABLE trailers ADD COLUMN "preventiveActive" BOOLEAN NOT NULL DEFAULT FALSE'
                )
            if "preventiveKm" not in trailer_columns:
                connection.exec_driver_sql(
                    'ALTER TABLE trailers ADD COLUMN "preventiveKm" INTEGER NOT NULL DEFAULT 0'
                )
            if "preventiveType" not in trailer_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE trailers ADD COLUMN \"preventiveType\" TEXT NOT NULL DEFAULT 'KM'"
                )
            if "preventiveValue" not in trailer_columns:
                connection.exec_driver_sql(
                    'ALTER TABLE trailers ADD COLUMN "preventiveValue" INTEGER NOT NULL DEFAULT 0'
                )
        else:
            existing_columns = {
                row[0] for row in connection.execute(
                    text(
                        """
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_name = 'trailers'
                        """
                    )
                ).all()
            }
            if "createdById" not in existing_columns:
                connection.exec_driver_sql(
                    'ALTER TABLE trailers ADD COLUMN "createdById" TEXT NOT NULL DEFAULT \'\''
                )
            if "createdByName" not in existing_columns:
                connection.exec_driver_sql(
                    'ALTER TABLE trailers ADD COLUMN "createdByName" TEXT NOT NULL DEFAULT \'\''
                )
            if "preventiveActive" not in existing_columns:
                connection.exec_driver_sql(
                    'ALTER TABLE trailers ADD COLUMN "preventiveActive" BOOLEAN NOT NULL DEFAULT FALSE'
                )
            if "preventiveKm" not in existing_columns:
                connection.exec_driver_sql(
                    'ALTER TABLE trailers ADD COLUMN "preventiveKm" INTEGER NOT NULL DEFAULT 0'
                )
            if "preventiveType" not in existing_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE trailers ADD COLUMN \"preventiveType\" TEXT NOT NULL DEFAULT 'KM'"
                )
            if "preventiveValue" not in existing_columns:
                connection.exec_driver_sql(
                    'ALTER TABLE trailers ADD COLUMN "preventiveValue" INTEGER NOT NULL DEFAULT 0'
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
    preventiveActive: bool = False
    preventiveKm: int | None = Field(default=None, ge=0, le=9999999)
    preventiveType: Literal["KM", "DIAS"] = "KM"
    preventiveValue: int | None = Field(default=None, ge=1, le=9999999)

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
    preventiveActive: bool | None = None
    preventiveKm: int | None = Field(default=None, ge=0, le=9999999)
    preventiveType: Literal["KM", "DIAS"] | None = None
    preventiveValue: int | None = Field(default=None, ge=1, le=9999999)


class AuthSetup(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("O usuário é obrigatório.")
        return normalized


class AuthLogin(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=1, max_length=128)


class AuthUserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=6, max_length=128)
    role: Literal["admin", "operador"] = "operador"


class AuthUserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    username: str | None = Field(default=None, min_length=3, max_length=40)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: Literal["admin", "operador"] | None = None


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt, expected = stored.split("$", 2)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, AttributeError):
        return False


def session_token(request: Request, authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    cookie_token = request.cookies.get("frota_session")
    return cookie_token or None


def current_user(
    request: Request,
    authorization: str | None = Header(default=None),
) -> Mapping:
    token = session_token(request, authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Faça login para continuar.")
    with database() as connection:
        session = connection.execute(
            text(
                """
                SELECT u.id, u.name, u.username, u.role
                FROM app_sessions s
                JOIN app_users u ON u.id = s."userId"
                WHERE s.token = :token AND s."expiresAt" > :now
                """
            ),
            {"token": token, "now": datetime.now(timezone.utc).isoformat()},
        ).mappings().first()
    if session is None:
        raise HTTPException(status_code=401, detail="Sua sessão expirou. Faça login novamente.")
    return session


def trailer_dict(row: Mapping) -> dict:
    return dict(row)


initialize_database()
migrate_legacy_sqlite_data()
app = FastAPI(title="FROTA BLU-GASPAR", version="1.0.0")


@app.get("/api/auth/status")
def auth_status():
    with database() as connection:
        user_count = connection.execute(text("SELECT COUNT(*) AS count FROM app_users")).mappings().first()["count"]
    return {"needsSetup": user_count == 0}


@app.post("/api/auth/setup")
def auth_setup(payload: AuthSetup, response: Response):
    with database() as connection:
        user_count = connection.execute(text("SELECT COUNT(*) AS count FROM app_users")).mappings().first()["count"]
        if user_count:
            raise HTTPException(status_code=409, detail="A configuração inicial já foi concluída.")
        username = payload.username.strip().lower()
        if connection.execute(text("SELECT id FROM app_users WHERE username = :username"), {"username": username}).first():
            raise HTTPException(status_code=409, detail="Este usuário já existe.")
        user = {
            "id": str(uuid.uuid4()),
            "name": payload.name.strip(),
            "username": username,
            "passwordHash": password_hash(payload.password),
            "role": "admin",
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        connection.execute(
            text(
                """
                INSERT INTO app_users (id, name, username, "passwordHash", role, "createdAt")
                VALUES (:id, :name, :username, :passwordHash, :role, :createdAt)
                """
            ),
            user,
        )
    return login_session(user["id"], user["name"], user["username"], user["role"], response)


@app.post("/api/auth/login")
def auth_login(payload: AuthLogin, response: Response):
    with database() as connection:
        user = connection.execute(
            text("SELECT * FROM app_users WHERE username = :username"),
            {"username": payload.username.strip().lower()},
        ).mappings().first()
    if user is None or not verify_password(payload.password, user["passwordHash"]):
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos.")
    return login_session(user["id"], user["name"], user["username"], user["role"], response)


def login_session(user_id: str, name: str, username: str, role: str, response: Response) -> dict:
    token = secrets.token_urlsafe(48)
    created_at = datetime.now(timezone.utc)
    expires_at = created_at.timestamp() + (12 * 60 * 60)
    expires_iso = datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat()
    with database() as connection:
        connection.execute(
            text(
                """
                INSERT INTO app_sessions (token, "userId", "createdAt", "expiresAt")
                VALUES (:token, :userId, :createdAt, :expiresAt)
                """
            ),
            {
                "token": token,
                "userId": user_id,
                "createdAt": created_at.isoformat(),
                "expiresAt": expires_iso,
            },
        )
    response.set_cookie(
        "frota_session",
        token,
        httponly=True,
        secure=bool(os.environ.get("VERCEL")),
        samesite="lax",
        max_age=12 * 60 * 60,
    )
    return {"token": token, "user": {"id": user_id, "name": name, "username": username, "role": role}}


@app.post("/api/auth/logout")
def auth_logout(response: Response, request: Request, authorization: str | None = Header(default=None)):
    token = session_token(request, authorization)
    if token:
        with database() as connection:
            connection.execute(text("DELETE FROM app_sessions WHERE token = :token"), {"token": token})
    response.delete_cookie("frota_session")
    return {"status": "ok"}


@app.get("/api/auth/me")
def auth_me(user: Mapping = Depends(current_user)):
    return {"id": user["id"], "name": user["name"], "username": user["username"], "role": user["role"]}


@app.get("/api/auth/users")
def list_users(user: Mapping = Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Somente administradores podem listar usuários.")
    with database() as connection:
        rows = connection.execute(
            text('SELECT id, name, username, role, "createdAt" FROM app_users ORDER BY name ASC')
        ).mappings().all()
    return [dict(row) for row in rows]


@app.post("/api/auth/users", status_code=201)
def create_user(payload: AuthUserCreate, user: Mapping = Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Somente administradores podem criar usuários.")
    with database() as connection:
        existing = connection.execute(
            text("SELECT id FROM app_users WHERE username = :username"),
            {"username": payload.username.strip().lower()},
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Este usuário já existe.")
        created = {
            "id": str(uuid.uuid4()),
            "name": payload.name.strip(),
            "username": payload.username.strip().lower(),
            "passwordHash": password_hash(payload.password),
            "role": payload.role,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        connection.execute(
            text(
                """
                INSERT INTO app_users (id, name, username, "passwordHash", role, "createdAt")
                VALUES (:id, :name, :username, :passwordHash, :role, :createdAt)
                """
            ),
            created,
        )
    return {"id": created["id"], "name": created["name"], "username": created["username"], "role": created["role"]}


@app.patch("/api/auth/users/{user_id}")
def update_user(user_id: str, payload: AuthUserUpdate, user: Mapping = Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Somente administradores podem editar usuários.")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Informe ao menos um campo para atualizar.")
    with database() as connection:
        row = connection.execute(
            text("SELECT id, name, username, role FROM app_users WHERE id = :id"),
            {"id": user_id},
        ).mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        updated = dict(row)
        if "name" in changes:
            updated["name"] = changes["name"].strip()
        if "username" in changes:
            username = changes["username"].strip().lower()
            existing = connection.execute(
                text("SELECT id FROM app_users WHERE username = :username AND id != :id"),
                {"username": username, "id": user_id},
            ).first()
            if existing:
                raise HTTPException(status_code=409, detail="Este usuário já existe.")
            updated["username"] = username
        if "role" in changes:
            updated["role"] = changes["role"]
        assignments = {
            "name": updated["name"],
            "username": updated["username"],
            "role": updated["role"],
        }
        sql_parts = ['name = :name', 'username = :username', 'role = :role']
        if changes.get("password"):
            assignments["passwordHash"] = password_hash(changes["password"])
            sql_parts.append('"passwordHash" = :passwordHash')
        assignments["id"] = user_id
        connection.execute(
            text(f"UPDATE app_users SET {', '.join(sql_parts)} WHERE id = :id"),
            assignments,
        )
    return {"id": user_id, "name": updated["name"], "username": updated["username"], "role": updated["role"]}


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
def create_trailer(payload: TrailerCreate, user: Mapping = Depends(current_user)):
    data = payload.model_dump()
    if data["preventiveActive"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Somente administradores podem registrar preventiva.")
    if data["preventiveActive"] and not data["preventiveValue"]:
        label = "km ultrapassados" if data["preventiveType"] == "KM" else "dias vencidos"
        raise HTTPException(status_code=422, detail=f"Informe a quantidade de {label}.")
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
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdById": user["id"],
        "createdByName": user["name"],
        "preventiveActive": data["preventiveActive"],
        "preventiveKm": (data["preventiveValue"] or 0) if data["preventiveType"] == "KM" else 0,
        "preventiveType": data["preventiveType"],
        "preventiveValue": data["preventiveValue"] or 0,
    }
    try:
        with database() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO trailers
                        (id, plate, "loadStatus", location, "dockNumber", situation, reason, "createdAt", "createdById", "createdByName", "preventiveActive", "preventiveKm", "preventiveType", "preventiveValue")
                    VALUES
                        (:id, :plate, :loadStatus, :location, :dockNumber, :situation, :reason, :createdAt, :createdById, :createdByName, :preventiveActive, :preventiveKm, :preventiveType, :preventiveValue)
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
def update_trailer(trailer_id: str, payload: TrailerUpdate, user: Mapping = Depends(current_user)):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Informe ao menos um campo para atualizar.")
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Somente administradores podem usar ações rápidas.")
    if ("preventiveActive" in changes or "preventiveKm" in changes) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Somente administradores podem alterar preventivas.")
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
        if "preventiveActive" in changes:
            updated["preventiveActive"] = bool(changes["preventiveActive"])
        if "preventiveKm" in changes:
            updated["preventiveKm"] = changes["preventiveKm"] or 0
        if "preventiveType" in changes:
            updated["preventiveType"] = changes["preventiveType"]
        if "preventiveValue" in changes:
            updated["preventiveValue"] = changes["preventiveValue"] or 0
        if "preventiveKm" in changes and "preventiveValue" not in changes:
            updated["preventiveValue"] = updated["preventiveKm"]
            updated["preventiveType"] = "KM"
        if updated["preventiveActive"] and not updated["preventiveValue"]:
            raise HTTPException(status_code=422, detail="Informe o valor vencido da preventiva.")
        if not updated["preventiveActive"]:
            updated["preventiveKm"] = 0
            updated["preventiveValue"] = 0

        columns = {
            "loadStatus": updated["loadStatus"],
            "location": updated["location"],
            "dockNumber": updated["dockNumber"],
            "situation": updated["situation"],
            "reason": updated["reason"],
            "preventiveActive": updated["preventiveActive"],
            "preventiveKm": updated["preventiveKm"],
            "preventiveType": updated["preventiveType"],
            "preventiveValue": updated["preventiveValue"]
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
def delete_trailer(trailer_id: str, user: Mapping = Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Somente administradores podem dar saída em carretas.")
    with database() as connection:
        result = connection.execute(
            text("DELETE FROM trailers WHERE id = :id"),
            {"id": trailer_id}
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Carreta não encontrada.")
    return Response(status_code=204)
