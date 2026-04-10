# -*- coding: utf-8 -*-
"""
API REST — Sistema de Gestión de Mantenimiento  v3
FastAPI · SQLAlchemy async · JWT · RBAC · Registro con aprobación
"""
import hashlib
import asyncio
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import (
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token, create_refresh_token,
    decode_access_token,
    get_current_user, get_db,
    hash_password, verify_password,
    require_any_role, require_encargado_up,
    require_ingeniero, require_planner_up,
    ROLE_HIERARCHY,
)
from db import SessionLocal, init_db
from models import (
    AccountStatus, Day, DayStatus, Evidence,
    RefreshToken, Role, Setting, Task, TaskMember,
    TaskNote, TaskPart, TaskPhoto, TaskReschedule, TaskStatus, User, WorkLog,
)

import os
import uuid
import aiofiles
from pathlib import Path

try:
    import cloudinary
    import cloudinary.uploader
    from cloudinary.utils import cloudinary_url
except Exception:  # pragma: no cover - keeps local dev resilient before install
    cloudinary = None
    cloudinary_url = None

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
ALLOWED_ORIGIN_REGEX = os.getenv("ALLOWED_ORIGIN_REGEX", "").strip() or None
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "").strip()
CLOUDINARY_FOLDER = os.getenv("CLOUDINARY_FOLDER", "maintenance-app/tasks").strip().strip("/")
CLOUDINARY_ENABLED = bool(
    cloudinary
    and CLOUDINARY_CLOUD_NAME
    and CLOUDINARY_API_KEY
    and CLOUDINARY_API_SECRET
)

if CLOUDINARY_ENABLED:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print("✅ Base de datos lista")
    yield

app = FastAPI(title="Maintenance App API", version="3.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
# ╔═══════════════════════════════════════════════════════╗
# ║            REAL-TIME PRESENCE (WebSocket)            ║
# ╚═══════════════════════════════════════════════════════╝

from collections import defaultdict
import json

class PresenceManager:
    """Tracks who is currently viewing each task."""
    def __init__(self):
        # task_id -> {user_id: {"name": str, "ws": WebSocket}}
        self._rooms: dict[int, dict[int, dict]] = defaultdict(dict)

    async def join(self, task_id: int, user_id: int, user_name: str, ws: WebSocket):
        self._rooms[task_id][user_id] = {"name": user_name, "ws": ws}
        await self._broadcast(task_id)

    async def leave(self, task_id: int, user_id: int):
        self._rooms[task_id].pop(user_id, None)
        if not self._rooms[task_id]:
            del self._rooms[task_id]
        else:
            await self._broadcast(task_id)

    async def _broadcast(self, task_id: int):
        viewers = [{"id": uid, "name": v["name"]} for uid, v in self._rooms[task_id].items()]
        msg = json.dumps({"type": "presence", "viewers": viewers})
        dead = []
        for uid, v in self._rooms[task_id].items():
            try:
                await v["ws"].send_text(msg)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self._rooms[task_id].pop(uid, None)

presence = PresenceManager()


@app.websocket("/ws/tasks/{task_id}")
async def task_presence(task_id: int, websocket: WebSocket, token: str = "", db: AsyncSession = Depends(get_db)):
    await websocket.accept()
    user_id, user_name = 0, "Desconocido"
    try:
        payload = decode_access_token(token)
        if payload:
            user_id = int(payload.get("sub", 0))
            # Get full_name from DB
            u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
            user_name = u.full_name if u else payload.get("username", "Desconocido")
    except Exception:
        pass

    await presence.join(task_id, user_id, user_name, websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive ping
    except WebSocketDisconnect:
        pass
    finally:
        await presence.leave(task_id, user_id)




# ╔═══════════════════════════════════════════════════════╗
# ║               PYDANTIC SCHEMAS                        ║
# ╚═══════════════════════════════════════════════════════╝

def _validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Mínimo 8 caracteres")
    if not any(c.isupper() for c in v):
        raise ValueError("Debe tener al menos una mayúscula")
    if not any(c.isdigit() for c in v):
        raise ValueError("Debe tener al menos un número")
    return v

# ── Auth ──────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username        : str
    full_name       : str
    password        : str
    role            : str = Role.TECNICO.value
    secret_question : str | None = None
    secret_answer   : str | None = None

    @field_validator("password")
    @classmethod
    def val_pw(cls, v): return _validate_password(v)

    @field_validator("role")
    @classmethod
    def val_role(cls, v):
        valid = [r.value for r in Role]
        if v not in valid:
            raise ValueError(f"Rol inválido. Opciones: {valid}")
        return v

    @field_validator("secret_answer")
    @classmethod
    def val_answer(cls, v):
        if v is not None:
            return v.strip().lower()
        return v

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password    : str

    @field_validator("new_password")
    @classmethod
    def val_pw(cls, v): return _validate_password(v)

class RefreshRequest(BaseModel):
    refresh_token: str

class UserResponse(BaseModel):
    id             : int
    username       : str
    full_name      : str
    role           : str
    account_status : str
    telegram_id    : Optional[int] = None

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token  : str
    refresh_token : str
    token_type    : str = "bearer"
    user          : UserResponse

# ── User management ───────────────────────────────────────
class UserCreate(BaseModel):
    username  : str
    full_name : str
    password  : str
    role      : str = Role.TECNICO.value

    @field_validator("password")
    @classmethod
    def val_pw(cls, v): return _validate_password(v)

    @field_validator("role")
    @classmethod
    def val_role(cls, v):
        valid = [r.value for r in Role]
        if v not in valid:
            raise ValueError(f"Rol inválido: {valid}")
        return v

class UserUpdate(BaseModel):
    full_name      : Optional[str]  = None
    role           : Optional[str]  = None
    account_status : Optional[str]  = None

class ApprovalRequest(BaseModel):
    action          : str   # "approve" | "reject"
    rejection_note  : str   = ""
    role_override   : Optional[str] = None  # INGENIERO can change role on approval

# ── Tasks ─────────────────────────────────────────────────
class TaskCreate(BaseModel):
    day_date    : str
    area        : str
    equipo      : str
    description : str
    priority    : str = "MEDIA"

class TaskUpdate(BaseModel):
    area             : Optional[str] = None
    equipo           : Optional[str] = None
    description      : Optional[str] = None
    priority         : Optional[str] = None
    status           : Optional[str] = None
    rescheduled_date : Optional[str] = None

class TaskResponse(BaseModel):
    id               : int
    day_date         : str
    area             : str
    equipo           : str
    description      : str
    priority         : str
    status           : str
    created_by       : int
    is_hidden        : bool
    rescheduled_date : Optional[str]
    members          : List[int] = []

    class Config:
        from_attributes = True

# ── WorkLogs ──────────────────────────────────────────────
class WorkLogCreate(BaseModel):
    task_id  : int
    start_dt : str
    end_dt   : str
    notes    : str = ""

class WorkLogUpdate(BaseModel):
    start_dt : str
    end_dt   : str
    notes    : str = ""

class WorkLogResponse(BaseModel):
    id          : int
    day_date    : str
    task_id     : int
    telegram_id : int
    user_name   : str
    start_dt    : datetime
    end_dt      : datetime
    notes       : str

    class Config:
        from_attributes = True

# ── Days ──────────────────────────────────────────────────
class DayResponse(BaseModel):
    date      : str
    status    : str
    closed_by : Optional[int]
    closed_at : Optional[datetime]

    class Config:
        from_attributes = True


# -- Shared JSON documents ----------------------------------------------------
class SharedDocumentPayload(BaseModel):
    data: Any


class SharedDocumentResponse(BaseModel):
    key: str
    data: Any


DOCUMENT_RULES = {
    "pmp_rrhh_tecnicos_v1": {"read": Role.TECNICO.value, "write": Role.INGENIERO.value, "default": []},
    "pmp_materiales_v1": {"read": Role.TECNICO.value, "write": Role.INGENIERO.value, "default": []},
    "pmp_equipos_columns_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_equipos_items_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_equipos_exchange_history_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_amef_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_fechas_plans_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_km_plans_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_paquetes_mantenimiento_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_avisos_mantenimiento_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_ot_alertas_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_ot_deleted_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_ot_sequence_settings_v1": {"read": Role.TECNICO.value, "write": Role.INGENIERO.value, "default": []},
    "pmp_ot_historial_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
    "pmp_ot_work_reports_v1": {"read": Role.TECNICO.value, "write": Role.TECNICO.value, "default": []},
    "pmp_bajas_history_v1": {"read": Role.TECNICO.value, "write": Role.ENCARGADO.value, "default": []},
}


def _assert_document_access(key: str, current_user: User, action: str):
    rule = DOCUMENT_RULES.get(key)
    if not rule:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    min_role = rule[action]
    if ROLE_HIERARCHY.get(current_user.role, 0) < ROLE_HIERARCHY[min_role]:
        raise HTTPException(status_code=403, detail="Sin permisos para este documento")
    return rule


# ── Task access helper ───────────────────────────────────────────────────────
async def require_task_access(task_id: int, current_user: User, db: AsyncSession):
    """Verifica que el usuario esté asignado a la tarea, o sea ENCARGADO+."""
    is_manager = ROLE_HIERARCHY.get(current_user.role, 0) >= ROLE_HIERARCHY[Role.ENCARGADO.value]
    if is_manager:
        return
    member = (await db.execute(
        select(TaskMember).where(TaskMember.task_id == task_id, TaskMember.telegram_id == current_user.id)
    )).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Solo los técnicos asignados a esta tarea pueden realizar esta acción")


# ╔═══════════════════════════════════════════════════════╗
# ║                    AUTH ENDPOINTS                     ║
# ╚═══════════════════════════════════════════════════════╝

@app.post("/api/auth/register")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Open self-registration. Account is created with PENDING status.
    User cannot log in until an INGENIERO approves it.
    """
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ese nombre de usuario ya está en uso")

    new_user = User(
        username            = body.username.strip(),
        full_name           = body.full_name.strip(),
        password_hash       = hash_password(body.password),
        role                = body.role,
        account_status      = AccountStatus.PENDING.value,
        secret_question     = body.secret_question or None,
        secret_answer_hash  = hash_password(body.secret_answer) if body.secret_answer else None,
    )
    db.add(new_user)
    await db.commit()
    return {
        "message": (
            "Registro exitoso. Tu cuenta está pendiente de aprobación por un Ingeniero. "
            "Te avisarán cuando puedas ingresar."
        )
    }


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.username == body.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    if user.account_status == AccountStatus.PENDING.value:
        raise HTTPException(
            status_code=403,
            detail="Tu cuenta está pendiente de aprobación. Contacta a un Ingeniero."
        )
    if user.account_status == AccountStatus.INACTIVE.value:
        raise HTTPException(status_code=403, detail="Tu cuenta ha sido desactivada.")

    access_token             = create_access_token(user.id, user.username, user.role)
    raw_refresh, hash_ref    = create_refresh_token()
    expires                  = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(user_id=user.id, token_hash=hash_ref, expires_at=expires))
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        user=UserResponse.model_validate(user),
    )


@app.post("/api/auth/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()
    now        = datetime.now(timezone.utc)

    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked    == False,
            RefreshToken.expires_at  > now,
        )
    )
    db_token = result.scalar_one_or_none()
    if not db_token:
        raise HTTPException(status_code=401, detail="Refresh token inválido o expirado")

    db_token.revoked = True
    user = (await db.execute(
        select(User).where(User.id == db_token.user_id, User.account_status == AccountStatus.ACTIVE.value)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no disponible")

    access_token          = create_access_token(user.id, user.username, user.role)
    raw_refresh, hash_ref = create_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=hash_ref, expires_at=now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)))
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        user=UserResponse.model_validate(user),
    )


@app.post("/api/auth/logout")
async def logout(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    token = result.scalar_one_or_none()
    if token:
        token.revoked = True
        await db.commit()
    return {"message": "Sesión cerrada"}


@app.get("/api/auth/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@app.post("/api/auth/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": "Contraseña actualizada"}


# ╔═══════════════════════════════════════════════════════╗
# ║              USER MANAGEMENT + APPROVALS              ║
# ╚═══════════════════════════════════════════════════════╝

@app.post("/api/users/", response_model=UserResponse)
async def create_user(
    body: UserCreate,
    current_user: User = Depends(require_ingeniero),
    db: AsyncSession = Depends(get_db),
):
    if (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    new = User(
        username       = body.username.strip(),
        full_name      = body.full_name.strip(),
        password_hash  = hash_password(body.password),
        role           = body.role,
        account_status = AccountStatus.ACTIVE.value,  # created by admin → immediately active
        approved_by    = current_user.id,
        approved_at    = datetime.now(timezone.utc),
    )
    db.add(new)
    await db.commit()
    await db.refresh(new)
    return UserResponse.model_validate(new)


@app.get("/api/users/", response_model=List[UserResponse])
async def get_users(
    account_status: Optional[str] = None,
    current_user: User = Depends(require_encargado_up),
    db: AsyncSession = Depends(get_db),
):
    query = select(User)
    if account_status:
        query = query.where(User.account_status == account_status)
    query = query.order_by(User.created_at.desc())
    result = await db.execute(query)
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@app.get("/api/users/pending", response_model=List[UserResponse])
async def get_pending_users(
    current_user: User = Depends(require_ingeniero),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.account_status == AccountStatus.PENDING.value).order_by(User.created_at)
    )
    return [UserResponse.model_validate(u) for u in result.scalars().all()]



@app.post("/api/users/{user_id}/approve")
async def approve_or_reject_user(
    user_id: int,
    body: ApprovalRequest,
    current_user: User = Depends(require_ingeniero),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if body.action == "approve":
        user.account_status = AccountStatus.ACTIVE.value
        user.approved_by    = current_user.id
        user.approved_at    = datetime.now(timezone.utc)
        user.rejection_note = ""
        if body.role_override:
            valid = [r.value for r in Role]
            if body.role_override not in valid:
                raise HTTPException(status_code=400, detail=f"Rol inválido: {valid}")
            user.role = body.role_override
        await db.commit()
        return {"message": f"Usuario {user.username} aprobado como {user.role}"}

    elif body.action == "reject":
        user.account_status = AccountStatus.INACTIVE.value
        user.rejected_by    = current_user.id
        user.rejection_note = body.rejection_note
        await db.commit()
        return {"message": f"Usuario {user.username} rechazado"}

    raise HTTPException(status_code=400, detail="Acción inválida. Usa 'approve' o 'reject'")


@app.put("/api/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    updates: UserUpdate,
    current_user: User = Depends(require_ingeniero),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if updates.full_name      is not None: user.full_name      = updates.full_name
    if updates.role           is not None:
        valid = [r.value for r in Role]
        if updates.role not in valid:
            raise HTTPException(status_code=400, detail=f"Rol inválido: {valid}")
        user.role = updates.role
    if updates.account_status is not None: user.account_status = updates.account_status
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


# ╔═══════════════════════════════════════════════════════╗
# ║                       DAYS                           ║
# ╚═══════════════════════════════════════════════════════╝

@app.get("/api/days/", response_model=List[DayResponse])
async def get_days(limit: int = 30, current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Day).order_by(Day.date.desc()).limit(limit))
    return result.scalars().all()

@app.get("/api/days/{day_date}", response_model=DayResponse)
async def get_day(day_date: str, current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Day).where(Day.date == day_date))
    day = result.scalar_one_or_none()
    if not day:
        day = Day(date=day_date, status=DayStatus.OPEN.value)
        db.add(day); await db.commit(); await db.refresh(day)
    return day

@app.post("/api/days/{day_date}/close")
async def close_day(day_date: str, current_user: User = Depends(require_planner_up), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Day).where(Day.date == day_date))
    day = result.scalar_one_or_none()
    if not day: day = Day(date=day_date); db.add(day)
    day.status = DayStatus.CLOSED.value; day.closed_by = current_user.id; day.closed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Día cerrado"}

@app.post("/api/days/{day_date}/reopen")
async def reopen_day(day_date: str, current_user: User = Depends(require_planner_up), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Day).where(Day.date == day_date))
    day = result.scalar_one_or_none()
    if not day: raise HTTPException(status_code=404, detail="Día no encontrado")
    day.status = DayStatus.OPEN.value; day.closed_by = None; day.closed_at = None
    await db.commit()
    return {"message": "Día reabierto"}


# ╔═══════════════════════════════════════════════════════╗
# ║                       TASKS                          ║
# ╚═══════════════════════════════════════════════════════╝

async def _build_task_response(task: Task, db: AsyncSession) -> TaskResponse:
    members = list((await db.execute(
        select(TaskMember.telegram_id).where(TaskMember.task_id == task.id)
    )).scalars().all())
    return TaskResponse(
        id=task.id, day_date=task.day_date, area=task.area, equipo=task.equipo,
        description=task.description, priority=task.priority, status=task.status,
        created_by=task.created_by, is_hidden=task.is_hidden,
        rescheduled_date=task.rescheduled_date, members=members,
    )

@app.post("/api/tasks/", response_model=TaskResponse)
async def create_task(task: TaskCreate, current_user: User = Depends(require_planner_up), db: AsyncSession = Depends(get_db)):
    db_task = Task(day_date=task.day_date, area=task.area, equipo=task.equipo,
        description=task.description, priority=task.priority,
        status=TaskStatus.DRAFT.value, created_by=current_user.id)
    db.add(db_task); await db.commit(); await db.refresh(db_task)
    return await _build_task_response(db_task, db)

@app.get("/api/tasks/", response_model=List[TaskResponse])
async def get_tasks(
    day_date: Optional[str] = None,
    status: Optional[str] = None,
    include_hidden: bool = False,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if day_date:        conditions.append(Task.day_date == day_date)
    if status:          conditions.append(Task.status   == status)
    if not include_hidden: conditions.append(Task.is_hidden == False)
    # TECNICO cannot see DRAFT tasks
    if ROLE_HIERARCHY.get(current_user.role, 0) < ROLE_HIERARCHY[Role.ENCARGADO.value]:
        conditions.append(Task.status != TaskStatus.DRAFT.value)
    query = select(Task)
    if conditions: query = query.where(and_(*conditions))
    query = query.order_by(Task.created_at.desc())
    tasks = (await db.execute(query)).scalars().all()

    # batch-load members (no N+1)
    ids = [t.id for t in tasks]
    members_map = {i: [] for i in ids}
    if ids:
        for tid, tgid in (await db.execute(
            select(TaskMember.task_id, TaskMember.telegram_id).where(TaskMember.task_id.in_(ids))
        )).all():
            members_map[tid].append(tgid)

    return [TaskResponse(
        id=t.id, day_date=t.day_date, area=t.area, equipo=t.equipo,
        description=t.description, priority=t.priority, status=t.status,
        created_by=t.created_by, is_hidden=t.is_hidden,
        rescheduled_date=t.rescheduled_date, members=members_map[t.id],
    ) for t in tasks]

@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db)):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task: raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return await _build_task_response(task, db)

@app.put("/api/tasks/{task_id}")
async def update_task(task_id: int, task_update: TaskUpdate, current_user: User = Depends(require_encargado_up), db: AsyncSession = Depends(get_db)):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task: raise HTTPException(status_code=404, detail="Tarea no encontrada")
    # Block marking DONE if any assigned technician has no worklog
    if task_update.status == TaskStatus.DONE.value:
        # Get assigned member IDs
        member_ids = (await db.execute(
            select(TaskMember.telegram_id).where(TaskMember.task_id == task_id)
        )).scalars().all()

        if not member_ids:
            raise HTTPException(
                status_code=400,
                detail="No se puede completar la tarea sin técnicos asignados."
            )

        # Get IDs of members who have registered hours
        logged_ids = (await db.execute(
            select(WorkLog.telegram_id).where(WorkLog.task_id == task_id).distinct()
        )).scalars().all()

        missing_ids = set(member_ids) - set(logged_ids)
        if missing_ids:
            # Get names of technicians who haven't logged
            missing_users = (await db.execute(
                select(User.full_name).where(User.id.in_(missing_ids))
            )).scalars().all()
            names = ", ".join(missing_users)
            raise HTTPException(
                status_code=400,
                detail=f"Los siguientes técnicos aún no han registrado sus horas: {names}"
            )
    for k, v in task_update.model_dump(exclude_none=True).items(): setattr(task, k, v)
    await db.commit()
    return {"message": "Tarea actualizada"}




@app.post("/api/tasks/{task_id}/reopen")
async def reopen_task(task_id: int, current_user: User = Depends(require_encargado_up), db: AsyncSession = Depends(get_db)):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task: raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.status != TaskStatus.DONE:
        raise HTTPException(status_code=400, detail="Solo se pueden reabrir tareas completadas")
    task.status = TaskStatus.IN_PROGRESS
    await db.commit()
    return {"message": "Tarea reabierta"}

@app.post("/api/tasks/{task_id}/publish")
async def publish_task(task_id: int, current_user: User = Depends(require_encargado_up), db: AsyncSession = Depends(get_db)):
    """Cambiar estado de DRAFT a OPEN para que sea visible para todos."""
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task: raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.status != TaskStatus.DRAFT.value:
        raise HTTPException(status_code=400, detail="La tarea ya fue publicada")
    task.status = TaskStatus.OPEN.value
    await db.commit()
    return {"message": "Tarea publicada y visible para todos"}

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int, current_user: User = Depends(require_encargado_up), db: AsyncSession = Depends(get_db)):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task: raise HTTPException(status_code=404, detail="Tarea no encontrada")
    task.is_hidden = True; await db.commit()
    return {"message": "Tarea ocultada"}

@app.post("/api/tasks/{task_id}/members/{user_id}")
async def add_task_member(task_id: int, user_id: int, current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db)):
    if user_id != current_user.id and ROLE_HIERARCHY.get(current_user.role, 0) < ROLE_HIERARCHY[Role.ENCARGADO.value]:
        raise HTTPException(status_code=403, detail="Solo ENCARGADO o superior puede asignar otros usuarios")
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task: raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if (await db.execute(select(TaskMember).where(and_(TaskMember.task_id == task_id, TaskMember.telegram_id == user_id)))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El usuario ya es miembro")
    db.add(TaskMember(task_id=task_id, telegram_id=user_id))
    if task.status == TaskStatus.OPEN.value: task.status = TaskStatus.IN_PROGRESS.value
    await db.commit()
    return {"message": "Miembro agregado"}

@app.delete("/api/tasks/{task_id}/members/{user_id}")
async def remove_task_member(task_id: int, user_id: int, current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db)):
    if user_id != current_user.id and ROLE_HIERARCHY.get(current_user.role, 0) < ROLE_HIERARCHY[Role.ENCARGADO.value]:
        raise HTTPException(status_code=403, detail="Solo ENCARGADO o superior puede remover otros usuarios")

    result = await db.execute(delete(TaskMember).where(and_(TaskMember.task_id == task_id, TaskMember.telegram_id == user_id)))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    # Eliminar todos los registros del técnico en esta tarea
    await db.execute(delete(WorkLog).where(and_(WorkLog.task_id == task_id, WorkLog.telegram_id == user_id)))
    await db.execute(delete(TaskNote).where(and_(TaskNote.task_id == task_id, TaskNote.user_id == user_id)))
    await db.execute(delete(TaskPart).where(and_(TaskPart.task_id == task_id, TaskPart.added_by == user_id)))

    # Fotos: eliminar archivos del disco también
    photos = (await db.execute(
        select(TaskPhoto).where(and_(TaskPhoto.task_id == task_id, TaskPhoto.uploaded_by == user_id))
    )).scalars().all()
    for photo in photos:
        await _delete_photo_asset(photo.filename)
    await db.execute(delete(TaskPhoto).where(and_(TaskPhoto.task_id == task_id, TaskPhoto.uploaded_by == user_id)))

    await db.commit()
    return {"message": "Miembro removido y sus registros eliminados"}


# ╔═══════════════════════════════════════════════════════╗
# ║                     WORKLOGS                         ║
# ╚═══════════════════════════════════════════════════════╝

@app.post("/api/worklogs/", response_model=WorkLogResponse)
async def create_worklog(wl: WorkLogCreate, current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db)):
    task = (await db.execute(select(Task).where(Task.id == wl.task_id))).scalar_one_or_none()
    if not task: raise HTTPException(status_code=404, detail="Tarea no encontrada")
    await require_task_access(wl.task_id, current_user, db)
    if task.status == TaskStatus.DONE:
        raise HTTPException(status_code=400, detail="La tarea está completada. Debe reabrirse para modificar registros.")
    try:
        start = datetime.fromisoformat(wl.start_dt)
        end   = datetime.fromisoformat(wl.end_dt)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido")
    if end <= start:
        raise HTTPException(status_code=400, detail="La hora de fin debe ser posterior a la de inicio")

    # Verificar que el técnico no tenga ya un registro en esta tarea
    existing = (await db.execute(
        select(WorkLog).where(WorkLog.task_id == wl.task_id, WorkLog.telegram_id == current_user.id)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Ya tienes un registro de horas en esta tarea. Edítalo en lugar de crear uno nuevo.")

    # Verificar solapamiento horario con otras tareas
    overlap = (await db.execute(
        select(WorkLog).where(
            WorkLog.telegram_id == current_user.id,
            WorkLog.start_dt < end,
            WorkLog.end_dt > start,
        )
    )).scalar_one_or_none()
    if overlap:
        raise HTTPException(
            status_code=400,
            detail=f"Conflicto de horario: ya tienes un registro de {overlap.start_dt.strftime('%H:%M')} a {overlap.end_dt.strftime('%H:%M')} en otra tarea."
        )

    db_wl = WorkLog(day_date=task.day_date, task_id=wl.task_id, telegram_id=current_user.id,
        user_name=current_user.full_name, start_dt=start, end_dt=end, notes=wl.notes)
    db.add(db_wl); await db.commit(); await db.refresh(db_wl)
    return db_wl


@app.put("/api/worklogs/{worklog_id}", response_model=WorkLogResponse)
async def update_worklog(worklog_id: int, body: WorkLogUpdate, current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db)):
    wl = (await db.execute(select(WorkLog).where(WorkLog.id == worklog_id))).scalar_one_or_none()
    if not wl: raise HTTPException(status_code=404, detail="Registro no encontrado")
    is_manager = ROLE_HIERARCHY.get(current_user.role, 0) >= ROLE_HIERARCHY[Role.ENCARGADO.value]
    if wl.telegram_id != current_user.id and not is_manager:
        raise HTTPException(status_code=403, detail="Sin permiso")
    task = (await db.execute(select(Task).where(Task.id == wl.task_id))).scalar_one_or_none()
    if task and task.status == TaskStatus.DONE:
        raise HTTPException(status_code=400, detail="La tarea está completada. Debe reabrirse para modificar registros.")
    try:
        start = datetime.fromisoformat(body.start_dt)
        end   = datetime.fromisoformat(body.end_dt)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido")
    if end <= start:
        raise HTTPException(status_code=400, detail="La hora de fin debe ser posterior a la de inicio")

    # Verificar solapamiento excluyendo el registro actual
    overlap = (await db.execute(
        select(WorkLog).where(
            WorkLog.telegram_id == current_user.id,
            WorkLog.id != worklog_id,
            WorkLog.start_dt < end,
            WorkLog.end_dt > start,
        )
    )).scalar_one_or_none()
    if overlap:
        raise HTTPException(
            status_code=400,
            detail=f"Conflicto de horario: ya tienes un registro de {overlap.start_dt.strftime('%H:%M')} a {overlap.end_dt.strftime('%H:%M')} en otra tarea."
        )

    wl.start_dt = start
    wl.end_dt   = end
    wl.notes    = body.notes
    await db.commit(); await db.refresh(wl)
    return wl

@app.get("/api/worklogs/", response_model=List[WorkLogResponse])
async def get_worklogs(
    task_id: Optional[int] = None, day_date: Optional[str] = None, user_id: Optional[int] = None,
    current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db),
):
    conditions = []
    if task_id:   conditions.append(WorkLog.task_id    == task_id)
    if day_date:  conditions.append(WorkLog.day_date   == day_date)
    is_manager = ROLE_HIERARCHY.get(current_user.role, 0) >= ROLE_HIERARCHY[Role.ENCARGADO.value]
    if user_id:
        conditions.append(WorkLog.telegram_id == (user_id if is_manager else current_user.id))
    elif not is_manager:
        conditions.append(WorkLog.telegram_id == current_user.id)
    query = select(WorkLog)
    if conditions: query = query.where(and_(*conditions))
    return (await db.execute(query.order_by(WorkLog.start_dt.desc()))).scalars().all()

@app.delete("/api/worklogs/{worklog_id}")
async def delete_worklog(worklog_id: int, current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db)):
    wl = (await db.execute(select(WorkLog).where(WorkLog.id == worklog_id))).scalar_one_or_none()
    if not wl: raise HTTPException(status_code=404, detail="Registro no encontrado")
    is_manager = ROLE_HIERARCHY.get(current_user.role, 0) >= ROLE_HIERARCHY[Role.ENCARGADO.value]
    if wl.telegram_id != current_user.id and not is_manager:
        raise HTTPException(status_code=403, detail="Sin permiso")
    await db.execute(delete(WorkLog).where(WorkLog.id == worklog_id)); await db.commit()
    return {"message": "Registro eliminado"}



# ╔═══════════════════════════════════════════════════════╗
# ║                   TASK NOTES                         ║
# ╚═══════════════════════════════════════════════════════╝

class TaskNoteCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def not_empty(cls, v):
        if not v.strip():
            raise ValueError("La nota no puede estar vacía")
        return v.strip()

class TaskNoteResponse(BaseModel):
    id         : int
    task_id    : int
    user_id    : int
    user_name  : str
    content    : str
    created_at : datetime

    class Config:
        from_attributes = True


@app.post("/api/tasks/{task_id}/notes", response_model=TaskNoteResponse)
async def add_task_note(
    task_id: int,
    body: TaskNoteCreate,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    await require_task_access(task_id, current_user, db)
    note = TaskNote(
        task_id   = task_id,
        user_id   = current_user.id,
        user_name = current_user.full_name,
        content   = body.content,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@app.get("/api/tasks/{task_id}/notes", response_model=List[TaskNoteResponse])
async def get_task_notes(
    task_id: int,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaskNote)
        .where(TaskNote.task_id == task_id)
        .order_by(TaskNote.created_at.asc())
    )
    return result.scalars().all()


@app.delete("/api/tasks/{task_id}/notes/{note_id}")
async def delete_task_note(
    task_id: int,
    note_id: int,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    note = (await db.execute(
        select(TaskNote).where(TaskNote.id == note_id, TaskNote.task_id == task_id)
    )).scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    is_manager = ROLE_HIERARCHY.get(current_user.role, 0) >= ROLE_HIERARCHY[Role.ENCARGADO.value]
    if note.user_id != current_user.id and not is_manager:
        raise HTTPException(status_code=403, detail="Sin permiso para eliminar esta nota")
    await db.execute(delete(TaskNote).where(TaskNote.id == note_id))
    await db.commit()
    return {"message": "Nota eliminada"}


# ╔═══════════════════════════════════════════════════════╗
# ║                  TASK PARTS                          ║
# ╚═══════════════════════════════════════════════════════╝

class TaskPartCreate(BaseModel):
    description : str
    unit        : str = "und"
    quantity    : float = 1.0

    @field_validator("description")
    @classmethod
    def not_empty(cls, v):
        if not v.strip():
            raise ValueError("La descripción no puede estar vacía")
        return v.strip()

    @field_validator("quantity")
    @classmethod
    def positive(cls, v):
        if v <= 0:
            raise ValueError("La cantidad debe ser mayor a 0")
        return v

class TaskPartResponse(BaseModel):
    id          : int
    task_id     : int
    added_by    : int
    user_name   : str
    description : str
    unit        : str
    quantity    : float
    created_at  : datetime

    class Config:
        from_attributes = True


@app.post("/api/tasks/{task_id}/parts", response_model=TaskPartResponse)
async def add_task_part(
    task_id: int,
    body: TaskPartCreate,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    await require_task_access(task_id, current_user, db)
    part = TaskPart(
        task_id     = task_id,
        added_by    = current_user.id,
        user_name   = current_user.full_name,
        description = body.description,
        unit        = body.unit,
        quantity    = body.quantity,
    )
    db.add(part)
    await db.commit()
    await db.refresh(part)
    return part


@app.get("/api/tasks/{task_id}/parts", response_model=List[TaskPartResponse])
async def get_task_parts(
    task_id: int,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaskPart)
        .where(TaskPart.task_id == task_id)
        .order_by(TaskPart.created_at.asc())
    )
    return result.scalars().all()


@app.delete("/api/tasks/{task_id}/parts/{part_id}")
async def delete_task_part(
    task_id: int,
    part_id: int,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    part = (await db.execute(
        select(TaskPart).where(TaskPart.id == part_id, TaskPart.task_id == task_id)
    )).scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Repuesto no encontrado")
    is_manager = ROLE_HIERARCHY.get(current_user.role, 0) >= ROLE_HIERARCHY[Role.ENCARGADO.value]
    if part.added_by != current_user.id and not is_manager:
        raise HTTPException(status_code=403, detail="Sin permiso para eliminar este repuesto")
    await db.execute(delete(TaskPart).where(TaskPart.id == part_id))
    await db.commit()
    return {"message": "Repuesto eliminado"}


# ╔═══════════════════════════════════════════════════════╗
# ║                  TASK PHOTOS                         ║
# ╚═══════════════════════════════════════════════════════╝

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
PHOTO_CATEGORIES   = {"ANTES", "DESPUÉS"}  # Solo 1 por categoría, se reemplaza si ya existe


class TaskPhotoResponse(BaseModel):
    id          : int
    task_id     : int
    uploaded_by : int
    user_name   : str
    category    : str
    filename    : str
    caption     : str
    created_at  : datetime
    url         : str = ""

    class Config:
        from_attributes = True


class RescheduleBody(BaseModel):
    new_date : str
    reason   : str = ""

RescheduleRequest = RescheduleBody  # alias

class RescheduleResponse(BaseModel):
    id             : int
    task_id        : int
    rescheduled_by : int
    user_name      : str
    old_date       : str
    new_date       : str
    reason         : str
    created_at     : datetime

    class Config:
        from_attributes = True


def _is_cloudinary_photo_ref(filename: str) -> bool:
    return isinstance(filename, str) and filename.startswith("cloudinary:")


def _cloudinary_public_id(filename: str) -> str:
    return filename.split(":", 1)[1] if _is_cloudinary_photo_ref(filename) else filename


async def _store_photo_asset(task_id: int, content: bytes, ext: str) -> str:
    if CLOUDINARY_ENABLED:
        upload_result = await asyncio.to_thread(
            cloudinary.uploader.upload,
            content,
            folder=CLOUDINARY_FOLDER or None,
            public_id=f"task_{task_id}_{uuid.uuid4().hex[:10]}",
            resource_type="image",
            overwrite=True,
        )
        return f"cloudinary:{upload_result['public_id']}"

    unique_name = f"task{task_id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = UPLOAD_DIR / unique_name
    async with aiofiles.open(file_path, "wb") as f_out:
        await f_out.write(content)
    return unique_name


async def _delete_photo_asset(filename: str) -> None:
    if not filename:
        return

    if _is_cloudinary_photo_ref(filename):
        if CLOUDINARY_ENABLED:
            await asyncio.to_thread(
                cloudinary.uploader.destroy,
                _cloudinary_public_id(filename),
                resource_type="image",
                invalidate=True,
            )
        return

    file_path = UPLOAD_DIR / filename
    if file_path.exists():
        file_path.unlink()


def _photo_url(filename: str, request_base: str = "") -> str:
    if _is_cloudinary_photo_ref(filename):
        if not cloudinary_url:
            return ""
        url, _ = cloudinary_url(_cloudinary_public_id(filename), secure=True, resource_type="image")
        return url

    base = (request_base or API_BASE_URL).rstrip("/")
    return f"{base}/uploads/{filename}"


@app.post("/api/tasks/{task_id}/photos", response_model=TaskPhotoResponse)
async def upload_task_photo(
    task_id : int,
    file    : UploadFile = File(...),
    category: str        = Form("DURANTE"),
    caption : str        = Form(""),
    current_user: User   = Depends(require_any_role),
    db: AsyncSession     = Depends(get_db),
):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    await require_task_access(task_id, current_user, db)

    cat = category.upper()
    if cat not in PHOTO_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Categoría inválida. Usa: {PHOTO_CATEGORIES}")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Tipo de archivo no permitido. Usa: {ALLOWED_EXTENSIONS}")

    # Read and check size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 10 MB")

    stored_filename = await _store_photo_asset(task_id, content, ext)

    # Si ya existe una foto de esta categoría para la tarea, eliminar la anterior
    existing = (await db.execute(
        select(TaskPhoto).where(TaskPhoto.task_id == task_id, TaskPhoto.category == cat)
    )).scalar_one_or_none()
    if existing:
        await _delete_photo_asset(existing.filename)
        await db.execute(delete(TaskPhoto).where(TaskPhoto.id == existing.id))

    photo = TaskPhoto(
        task_id     = task_id,
        uploaded_by = current_user.id,
        user_name   = current_user.full_name,
        category    = cat,
        filename    = stored_filename,
        caption     = caption.strip(),
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)

    resp = TaskPhotoResponse.model_validate(photo)
    resp.url = _photo_url(stored_filename)
    return resp


@app.get("/api/tasks/{task_id}/photos", response_model=list[TaskPhotoResponse])
async def get_task_photos(
    task_id: int,
    current_user: User = Depends(require_any_role),
    db: AsyncSession   = Depends(get_db),
):
    result = await db.execute(
        select(TaskPhoto)
        .where(TaskPhoto.task_id == task_id)
        .order_by(TaskPhoto.category, TaskPhoto.created_at)
    )
    photos = result.scalars().all()
    out = []
    for p in photos:
        r = TaskPhotoResponse.model_validate(p)
        r.url = _photo_url(p.filename)
        out.append(r)
    return out


@app.delete("/api/tasks/{task_id}/photos/{photo_id}")
async def delete_task_photo(
    task_id : int,
    photo_id: int,
    current_user: User = Depends(require_any_role),
    db: AsyncSession   = Depends(get_db),
):
    photo = (await db.execute(
        select(TaskPhoto).where(TaskPhoto.id == photo_id, TaskPhoto.task_id == task_id)
    )).scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="Foto no encontrada")

    is_manager = ROLE_HIERARCHY.get(current_user.role, 0) >= ROLE_HIERARCHY[Role.ENCARGADO.value]
    if photo.uploaded_by != current_user.id and not is_manager:
        raise HTTPException(status_code=403, detail="Sin permiso para eliminar esta foto")

    await _delete_photo_asset(photo.filename)

    await db.execute(delete(TaskPhoto).where(TaskPhoto.id == photo_id))
    await db.commit()
    return {"message": "Foto eliminada"}



# ╔═══════════════════════════════════════════════════════╗
# ║                  TASK PDF REPORT                     ║
# ╚═══════════════════════════════════════════════════════╝

from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Image as RLImage, KeepTogether,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from fastapi.responses import StreamingResponse
import urllib.request


# Color palette
C_PRIMARY   = colors.HexColor("#2563eb")
C_SUCCESS   = colors.HexColor("#059669")
C_WARNING   = colors.HexColor("#f59e0b")
C_DANGER    = colors.HexColor("#dc2626")
C_GRAY      = colors.HexColor("#6b7280")
C_LIGHT     = colors.HexColor("#f3f4f6")
C_DARK      = colors.HexColor("#111827")
C_WHITE     = colors.white

STATUS_COLORS = {
    "DRAFT": C_GRAY, "OPEN": C_PRIMARY, "IN_PROGRESS": C_WARNING,
    "DONE": C_SUCCESS, "CANCELLED": C_DANGER,
}
STATUS_LABELS = {
    "DRAFT": "Borrador", "OPEN": "Abierta", "IN_PROGRESS": "En Progreso",
    "DONE": "Completada", "CANCELLED": "Cancelada",
}
PRIORITY_COLORS = {"ALTA": C_DANGER, "MEDIA": C_WARNING, "BAJA": C_SUCCESS}


def _fmt_date(s):
    if not s: return "—"
    try:
        y, m, d = s.split("-"); return f"{d}/{m}/{y}"
    except Exception:
        return s


def _fmt_dt(dt):
    if not dt: return "—"
    try:
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return str(dt)


def _load_image(filename: str, max_w=8*cm, max_h=7*cm):
    """Load image from local disk or Cloudinary and return a scaled RLImage."""
    try:
        if _is_cloudinary_photo_ref(filename) or str(filename).startswith("http"):
            with urllib.request.urlopen(_photo_url(filename), timeout=20) as response:
                data = response.read()
            img = RLImage(BytesIO(data))
        else:
            path = UPLOAD_DIR / filename
            if not path.exists():
                return None
            img = RLImage(str(path))
        img._restrictSize(max_w, max_h)
        return img
    except Exception:
        return None


@app.get("/api/tasks/{task_id}/report.pdf")
async def generate_task_report(
    task_id: int,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    # ── Fetch all data ─────────────────────────────────────────────────────────
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    worklogs = (await db.execute(
        select(WorkLog).where(WorkLog.task_id == task_id).order_by(WorkLog.start_dt)
    )).scalars().all()
    notes = (await db.execute(
        select(TaskNote).where(TaskNote.task_id == task_id).order_by(TaskNote.created_at)
    )).scalars().all()
    parts = (await db.execute(
        select(TaskPart).where(TaskPart.task_id == task_id).order_by(TaskPart.created_at)
    )).scalars().all()
    photos = (await db.execute(
        select(TaskPhoto).where(TaskPhoto.task_id == task_id).order_by(TaskPhoto.category)
    )).scalars().all()
    reschedules = (await db.execute(
        select(TaskReschedule).where(TaskReschedule.task_id == task_id).order_by(TaskReschedule.created_at)
    )).scalars().all()
    member_ids = (await db.execute(
        select(TaskMember.telegram_id).where(TaskMember.task_id == task_id)
    )).scalars().all()
    member_users = []
    if member_ids:
        member_users = (await db.execute(
            select(User).where(User.id.in_(member_ids))
        )).scalars().all()

    total_hours = sum(
        (wl.end_dt - wl.start_dt).total_seconds() / 3600 for wl in worklogs
    )

    # ── Build PDF ──────────────────────────────────────────────────────────────
    buf = BytesIO()
    PAGE_W, PAGE_H = A4
    MARGIN = 1.8*cm
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=MARGIN, leftMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
    )
    CW = PAGE_W - 2*MARGIN  # content width

    styles = getSampleStyleSheet()
    S = {
        "h1":    ParagraphStyle("h1",  fontSize=11, textColor=C_PRIMARY,  fontName="Helvetica-Bold", spaceBefore=16, spaceAfter=8, borderPad=0),
        "body":  ParagraphStyle("body",fontSize=9,  textColor=C_DARK,     fontName="Helvetica",      spaceAfter=3,   leading=14),
        "small": ParagraphStyle("sml", fontSize=8,  textColor=C_GRAY,     fontName="Helvetica",      spaceAfter=2,   leading=11),
        "bold":  ParagraphStyle("bld", fontSize=9,  textColor=C_DARK,     fontName="Helvetica-Bold", spaceAfter=2),
        "center":ParagraphStyle("ctr", fontSize=9,  textColor=C_DARK,     fontName="Helvetica",      alignment=TA_CENTER),
        "right": ParagraphStyle("rgt", fontSize=8,  textColor=C_GRAY,     fontName="Helvetica",      alignment=TA_RIGHT),
    }

    status_val  = task.status if isinstance(task.status, str) else task.status.value
    status_color = STATUS_COLORS.get(status_val, C_GRAY)
    status_label = STATUS_LABELS.get(status_val, status_val)
    priority_color = PRIORITY_COLORS.get(task.priority, C_GRAY)

    story = []

    # ══ HEADER BANNER ══════════════════════════════════════════════════════════
    hdr = Table([[
        Paragraph("<b>INFORME DE TAREA DE MANTENIMIENTO</b>",
            ParagraphStyle("hb", fontSize=15, textColor=C_WHITE, fontName="Helvetica-Bold")),
        Paragraph(f"<b>Tarea #{task.id}</b><br/>{_fmt_date(task.day_date)}",
            ParagraphStyle("hb2", fontSize=9, textColor=colors.HexColor("#bfdbfe"), fontName="Helvetica", alignment=TA_RIGHT)),
    ]], colWidths=[CW*0.7, CW*0.3])
    hdr.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), C_PRIMARY),
        ("TOPPADDING",    (0,0),(-1,-1), 14),
        ("BOTTOMPADDING", (0,0),(-1,-1), 14),
        ("LEFTPADDING",   (0,0),(-1,-1), 16),
        ("RIGHTPADDING",  (0,0),(-1,-1), 16),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("ROUNDEDCORNERS",(0,0),(-1,-1), [6,6,6,6]),
    ]))
    story.append(hdr)
    story.append(Spacer(1, 10))

    # ── Task title ─────────────────────────────────────────────────────────────
    story.append(Paragraph(task.description,
        ParagraphStyle("ttl", fontSize=17, textColor=C_DARK, fontName="Helvetica-Bold", spaceAfter=10, leading=20)))

    # ══ INFO GRID ══════════════════════════════════════════════════════════════
    def cell(label, value, value_color=C_DARK):
        return [
            Paragraph(label, ParagraphStyle("lbl", fontSize=7.5, textColor=C_GRAY, fontName="Helvetica-Bold", spaceAfter=1, textTransform="uppercase")),
            Paragraph(str(value), ParagraphStyle("val", fontSize=10, textColor=value_color, fontName="Helvetica-Bold")),
        ]

    grid_data = [[
        cell("Área",             task.area or "—"),
        cell("Equipo",           task.equipo or "—"),
        cell("Prioridad",        task.priority, priority_color),
        cell("Estado",           status_label, status_color),
        cell("Fecha programada", _fmt_date(task.day_date)),
        cell("Horas totales",    f"{total_hours:.1f} h", C_PRIMARY),
    ]]
    col_w = CW / 6
    grid = Table(grid_data, colWidths=[col_w]*6)
    grid.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), C_LIGHT),
        ("TOPPADDING",    (0,0),(-1,-1), 10),
        ("BOTTOMPADDING", (0,0),(-1,-1), 10),
        ("LEFTPADDING",   (0,0),(-1,-1), 10),
        ("RIGHTPADDING",  (0,0),(-1,-1), 10),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("LINEAFTER",     (0,0),(4,-1),  0.5, colors.HexColor("#d1d5db")),
        ("ROUNDEDCORNERS",(0,0),(-1,-1), [6,6,6,6]),
    ]))
    story.append(grid)

    # ══ TÉCNICOS ═══════════════════════════════════════════════════════════════
    if member_users:
        story.append(Paragraph("👷 Técnicos asignados", S["h1"]))
        m_data = [[
            Paragraph("Nombre",   ParagraphStyle("th", fontSize=8.5, textColor=C_WHITE, fontName="Helvetica-Bold")),
            Paragraph("Usuario",  ParagraphStyle("th", fontSize=8.5, textColor=C_WHITE, fontName="Helvetica-Bold")),
            Paragraph("Rol",      ParagraphStyle("th", fontSize=8.5, textColor=C_WHITE, fontName="Helvetica-Bold")),
        ]] + [[
            Paragraph(u.full_name,     S["body"]),
            Paragraph(f"@{u.username}", S["small"]),
            Paragraph(u.role,          S["small"]),
        ] for u in member_users]
        m_tbl = Table(m_data, colWidths=[CW*0.5, CW*0.3, CW*0.2])
        m_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,0),  C_PRIMARY),
            ("BACKGROUND",    (0,1),(-1,-1), C_WHITE),
            ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_WHITE, C_LIGHT]),
            ("TOPPADDING",    (0,0),(-1,-1), 8),
            ("BOTTOMPADDING", (0,0),(-1,-1), 8),
            ("LEFTPADDING",   (0,0),(-1,-1), 12),
            ("GRID",          (0,0),(-1,-1), 0.5, colors.HexColor("#e5e7eb")),
            ("ROUNDEDCORNERS",(0,0),(-1,-1), [4,4,4,4]),
        ]))
        story.append(m_tbl)

    # ══ FOTOS ══════════════════════════════════════════════════════════════════
    photo_antes   = next((p for p in photos if p.category == "ANTES"),   None)
    photo_despues = next((p for p in photos if p.category == "DESPUÉS"), None)

    if photo_antes or photo_despues:
        story.append(Paragraph("📷 Evidencia fotográfica", S["h1"]))
        half = (CW - 0.4*cm) / 2

        def make_photo_cell(photo, label, accent):
            content = []
            if photo:
                img = _load_image(photo.filename, max_w=half - 1*cm, max_h=8*cm)
                if img:
                    content.append(img)
                else:
                    content.append(Paragraph("⚠ Imagen no encontrada en el servidor",
                        ParagraphStyle("warn", fontSize=8, textColor=C_GRAY, fontName="Helvetica", alignment=TA_CENTER)))
            else:
                content.append(Paragraph("Sin foto registrada",
                    ParagraphStyle("noph", fontSize=9, textColor=C_GRAY, fontName="Helvetica", alignment=TA_CENTER)))

            caption = photo.caption if photo and photo.caption else ""
            lbl_style = ParagraphStyle("cap", fontSize=9, textColor=accent, fontName="Helvetica-Bold",
                                       alignment=TA_CENTER, spaceAfter=0)
            cap_style = ParagraphStyle("cap2", fontSize=8, textColor=C_GRAY, fontName="Helvetica", alignment=TA_CENTER)

            inner = [[Paragraph(label, lbl_style)]]
            for c in content:
                inner.append([c])
            if caption:
                inner.append([Paragraph(caption, cap_style)])

            t = Table(inner, colWidths=[half - 0.4*cm])
            t.setStyle(TableStyle([
                ("ALIGN",         (0,0),(-1,-1), "CENTER"),
                ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
                ("TOPPADDING",    (0,0),(-1,-1), 8),
                ("BOTTOMPADDING", (0,0),(-1,-1), 8),
                ("BACKGROUND",    (0,0),(-1,0),  colors.HexColor("#f8fafc")),
                ("BACKGROUND",    (0,1),(-1,-1), C_WHITE),
                ("LINEBELOW",     (0,0),(-1,0),  1, accent),
            ]))
            return t

        antes_cell   = make_photo_cell(photo_antes,   "🔴 ANTES",   C_DANGER)
        despues_cell = make_photo_cell(photo_despues, "🟢 DESPUÉS", C_SUCCESS)

        photo_row = Table([[antes_cell, despues_cell]], colWidths=[half, half],
                          hAlign="LEFT", spaceAfter=0)
        photo_row.setStyle(TableStyle([
            ("LEFTPADDING",   (0,0),(-1,-1), 0),
            ("RIGHTPADDING",  (0,0),(-1,-1), 0),
            ("TOPPADDING",    (0,0),(-1,-1), 0),
            ("BOTTOMPADDING", (0,0),(-1,-1), 0),
            ("COLPADDING",    (0,0),(-1,-1), 0.2*cm),
            ("BOX",           (0,0),(0,-1),  0.5, colors.HexColor("#e5e7eb")),
            ("BOX",           (1,0),(1,-1),  0.5, colors.HexColor("#e5e7eb")),
        ]))
        story.append(photo_row)

    # ══ NOTAS ══════════════════════════════════════════════════════════════════
    if notes:
        story.append(Paragraph("📝 Descripción del trabajo realizado", S["h1"]))
        for i, n in enumerate(notes):
            bg = C_WHITE if i % 2 == 0 else C_LIGHT
            note_tbl = Table([
                [Paragraph(f"<b>{n.user_name}</b>", S["bold"]),
                 Paragraph(_fmt_dt(n.created_at),   S["right"])],
                [Paragraph(n.content.replace("\n", "<br/>"), S["body"]), ""],
            ], colWidths=[CW*0.65, CW*0.35])
            note_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0,0),(-1,-1), bg),
                ("SPAN",          (0,1),(1,1)),
                ("TOPPADDING",    (0,0),(-1,-1), 8),
                ("BOTTOMPADDING", (0,0),(-1,-1), 8),
                ("LEFTPADDING",   (0,0),(-1,-1), 12),
                ("RIGHTPADDING",  (0,0),(-1,-1), 12),
                ("LINEBELOW",     (0,-1),(-1,-1), 0.5, colors.HexColor("#e5e7eb")),
            ]))
            story.append(note_tbl)

    # ══ REPUESTOS ══════════════════════════════════════════════════════════════
    if parts:
        story.append(Paragraph("🔩 Repuestos y materiales utilizados", S["h1"]))
        def th(t): return Paragraph(t, ParagraphStyle("th", fontSize=8.5, textColor=C_WHITE, fontName="Helvetica-Bold"))
        p_data = [[th("#"), th("Descripción"), th("Und."), th("Cantidad"), th("Registrado por")]]
        for i, p in enumerate(parts, 1):
            qty = str(int(p.quantity)) if p.quantity == int(p.quantity) else f"{p.quantity:.2f}"
            bg = C_WHITE if i % 2 != 0 else C_LIGHT
            p_data.append([
                Paragraph(str(i),    ParagraphStyle("c", fontSize=9, fontName="Helvetica", alignment=TA_CENTER)),
                Paragraph(p.description, S["body"]),
                Paragraph(p.unit,    ParagraphStyle("c", fontSize=9, fontName="Helvetica", alignment=TA_CENTER)),
                Paragraph(qty,       ParagraphStyle("c", fontSize=9, fontName="Helvetica-Bold", alignment=TA_CENTER, textColor=C_PRIMARY)),
                Paragraph(p.user_name, S["small"]),
            ])
        p_tbl = Table(p_data, colWidths=[CW*0.05, CW*0.40, CW*0.10, CW*0.13, CW*0.32])
        p_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,0),  C_PRIMARY),
            ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_WHITE, C_LIGHT]),
            ("TOPPADDING",    (0,0),(-1,-1), 7),
            ("BOTTOMPADDING", (0,0),(-1,-1), 7),
            ("LEFTPADDING",   (0,0),(-1,-1), 8),
            ("GRID",          (0,0),(-1,-1), 0.5, colors.HexColor("#e5e7eb")),
        ]))
        story.append(p_tbl)

    # ══ WORKLOGS ═══════════════════════════════════════════════════════════════
    if worklogs:
        story.append(Paragraph("⏱ Registros de trabajo", S["h1"]))
        def th(t): return Paragraph(t, ParagraphStyle("th", fontSize=8.5, textColor=C_WHITE, fontName="Helvetica-Bold"))
        wl_data = [[th("Técnico"), th("Inicio"), th("Fin"), th("Horas"), th("Notas")]]
        for wl in worklogs:
            hrs = (wl.end_dt - wl.start_dt).total_seconds() / 3600
            wl_data.append([
                Paragraph(wl.user_name,    S["body"]),
                Paragraph(_fmt_dt(wl.start_dt), S["small"]),
                Paragraph(_fmt_dt(wl.end_dt),   S["small"]),
                Paragraph(f"<b>{hrs:.1f}h</b>", ParagraphStyle("h", fontSize=9, fontName="Helvetica-Bold", textColor=C_PRIMARY, alignment=TA_CENTER)),
                Paragraph(wl.notes or "—", S["small"]),
            ])
        # Total row
        wl_data.append([
            Paragraph("", S["small"]),
            Paragraph("", S["small"]),
            Paragraph("<b>TOTAL</b>", ParagraphStyle("tot", fontSize=9, fontName="Helvetica-Bold", alignment=TA_RIGHT)),
            Paragraph(f"<b>{total_hours:.1f}h</b>", ParagraphStyle("tot2", fontSize=11, fontName="Helvetica-Bold", textColor=C_PRIMARY, alignment=TA_CENTER)),
            Paragraph("", S["small"]),
        ])
        wl_tbl = Table(wl_data, colWidths=[CW*0.27, CW*0.18, CW*0.18, CW*0.10, CW*0.27])
        wl_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,0),   C_PRIMARY),
            ("BACKGROUND",    (0,-1),(-1,-1), colors.HexColor("#eff6ff")),
            ("ROWBACKGROUNDS",(0,1),(-1,-2),  [C_WHITE, C_LIGHT]),
            ("TOPPADDING",    (0,0),(-1,-1),  7),
            ("BOTTOMPADDING", (0,0),(-1,-1),  7),
            ("LEFTPADDING",   (0,0),(-1,-1),  8),
            ("GRID",          (0,0),(-1,-1),  0.5, colors.HexColor("#e5e7eb")),
            ("LINEABOVE",     (0,-1),(-1,-1), 1.5, C_PRIMARY),
        ]))
        story.append(wl_tbl)

    # ══ REPROGRAMACIONES ═══════════════════════════════════════════════════════
    if reschedules:
        story.append(Paragraph("📅 Historial de reprogramaciones", S["h1"]))
        def th(t): return Paragraph(t, ParagraphStyle("th", fontSize=8.5, textColor=C_WHITE, fontName="Helvetica-Bold"))
        r_data = [[th("Fecha anterior"), th("Nueva fecha"), th("Por"), th("Motivo"), th("Registrado")]]
        for r in reschedules:
            r_data.append([
                Paragraph(_fmt_date(r.old_date), S["body"]),
                Paragraph(_fmt_date(r.new_date), ParagraphStyle("nd", fontSize=9, fontName="Helvetica-Bold", textColor=C_WARNING)),
                Paragraph(r.user_name,           S["small"]),
                Paragraph(r.reason or "—",       S["body"]),
                Paragraph(_fmt_dt(r.created_at), S["small"]),
            ])
        r_tbl = Table(r_data, colWidths=[CW*0.14, CW*0.14, CW*0.20, CW*0.32, CW*0.20])
        r_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,0),  C_WARNING),
            ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_WHITE, colors.HexColor("#fffbeb")]),
            ("TOPPADDING",    (0,0),(-1,-1), 7),
            ("BOTTOMPADDING", (0,0),(-1,-1), 7),
            ("LEFTPADDING",   (0,0),(-1,-1), 8),
            ("GRID",          (0,0),(-1,-1), 0.5, colors.HexColor("#e5e7eb")),
        ]))
        story.append(r_tbl)

    # ══ FOOTER ═════════════════════════════════════════════════════════════════
    story.append(Spacer(1, 20))
    footer_bar = Table([[
        Paragraph(
            f"Generado el {datetime.now().strftime('%d/%m/%Y %H:%M')} por <b>{current_user.full_name}</b>  ·  Sistema de Mantenimiento",
            ParagraphStyle("ft", fontSize=7.5, textColor=C_WHITE, fontName="Helvetica", alignment=TA_CENTER)
        )
    ]], colWidths=[CW])
    footer_bar.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), C_PRIMARY),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("ROUNDEDCORNERS",(0,0),(-1,-1), [4,4,4,4]),
    ]))
    story.append(footer_bar)

    doc.build(story)
    buf.seek(0)
    filename = f"informe_tarea_{task.id}_{task.day_date}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.post("/api/tasks/{task_id}/reschedule", response_model=RescheduleResponse)
async def reschedule_task(
    task_id: int,
    body: RescheduleRequest,
    current_user: User = Depends(require_encargado_up),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.status == TaskStatus.DONE:
        raise HTTPException(status_code=400, detail="No se puede reprogramar una tarea completada. Reábrela primero.")
    if task.day_date == body.new_date:
        raise HTTPException(status_code=400, detail="La nueva fecha es igual a la fecha actual")

    record = TaskReschedule(
        task_id        = task_id,
        rescheduled_by = current_user.id,
        user_name      = current_user.full_name,
        old_date       = task.day_date,
        new_date       = body.new_date,
        reason         = body.reason.strip(),
    )
    db.add(record)
    task.day_date = body.new_date
    # Reiniciar: borrar todos los registros de horas de la tarea
    await db.execute(delete(WorkLog).where(WorkLog.task_id == task_id))
    # Volver a OPEN si estaba IN_PROGRESS
    if task.status == TaskStatus.IN_PROGRESS:
        task.status = TaskStatus.OPEN
    await db.commit()
    await db.refresh(record)
    return record


@app.get("/api/tasks/{task_id}/reschedules", response_model=list[RescheduleResponse])
async def get_reschedules(
    task_id: int,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaskReschedule)
        .where(TaskReschedule.task_id == task_id)
        .order_by(TaskReschedule.created_at.desc())
    )
    return result.scalars().all()


@app.post("/api/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    current_user: User = Depends(require_encargado_up),
    db: AsyncSession = Depends(get_db),
):
    """ENCARGADO+ resetea la contraseña de un usuario. Devuelve contraseña temporal."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes resetear tu propia contraseña")

    # Generate readable temp password: word + 4 digits + !
    import random
    words = ["Mant", "Tarea", "Turno", "Equip", "Planta"]
    temp_pw = random.choice(words) + str(random.randint(1000, 9999)) + "!"
    user.password_hash = hash_password(temp_pw)
    await db.commit()
    return {"temp_password": temp_pw, "username": user.username, "full_name": user.full_name}


# ╔═══════════════════════════════════════════════════════╗
# ║            RECUPERACIÓN POR PREGUNTA SECRETA         ║
# ╚═══════════════════════════════════════════════════════╝

PREGUNTAS = [
    "¿Nombre de tu primera mascota?",
    "¿Ciudad donde naciste?",
    "¿Nombre de tu escuela primaria?",
    "¿Apodo de infancia?",
    "¿Nombre de tu mejor amigo de la infancia?",
    "¿Cuál es el modelo de tu primer auto?",
    "¿Cuál es el segundo nombre de tu madre?",
]


class SetSecretQuestionRequest(BaseModel):
    question : str
    answer   : str

    @field_validator("answer")
    @classmethod
    def not_empty(cls, v):
        if not v.strip():
            raise ValueError("La respuesta no puede estar vacía")
        return v.strip().lower()  # normalize to lowercase


class GetSecretQuestionResponse(BaseModel):
    question : str


class RecoverPasswordRequest(BaseModel):
    username : str
    answer   : str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong(cls, v):
        if len(v) < 8:
            raise ValueError("Mínimo 8 caracteres")
        if not any(c.isupper() for c in v):
            raise ValueError("Debe tener al menos una mayúscula")
        if not any(c.isdigit() for c in v):
            raise ValueError("Debe tener al menos un número")
        return v


@app.get("/api/auth/secret-questions")
async def list_secret_questions():
    """Devuelve las preguntas disponibles (público)."""
    return {"questions": PREGUNTAS}


@app.post("/api/auth/set-secret-question")
async def set_secret_question(
    body: SetSecretQuestionRequest,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    """El usuario configura su pregunta secreta (requiere login)."""
    if body.question not in PREGUNTAS:
        raise HTTPException(status_code=400, detail="Pregunta no válida")
    current_user.secret_question   = body.question
    current_user.secret_answer_hash = hash_password(body.answer.strip().lower())
    await db.commit()
    return {"message": "Pregunta secreta configurada"}


@app.get("/api/auth/secret-question/{username}")
async def get_secret_question(username: str, db: AsyncSession = Depends(get_db)):
    """Devuelve la pregunta secreta de un usuario por username (público)."""
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not user or not user.secret_question:
        raise HTTPException(status_code=404, detail="Este usuario no tiene pregunta secreta configurada. Contacta a tu INGENIERO para resetear tu contraseña.")
    return {"question": user.secret_question}


@app.post("/api/auth/recover-password")
async def recover_password(body: RecoverPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Recupera contraseña verificando la respuesta secreta (público)."""
    user = (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
    if not user or not user.secret_question or not user.secret_answer_hash:
        raise HTTPException(status_code=404, detail="Usuario no encontrado o sin pregunta secreta configurada")
    if user.account_status != AccountStatus.ACTIVE.value:
        raise HTTPException(status_code=403, detail="Cuenta inactiva. Contacta a tu administrador.")
    # Verify answer (case-insensitive)
    if not verify_password(body.answer.strip().lower(), user.secret_answer_hash):
        raise HTTPException(status_code=400, detail="Respuesta incorrecta")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": "Contraseña actualizada correctamente"}

# ╔═══════════════════════════════════════════════════════╗
# ║                      STATS                           ║
# ╚═══════════════════════════════════════════════════════╝

@app.get("/api/stats/today")
async def get_today_stats(current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db)):
    today = date.today().isoformat()
    total = (await db.execute(select(func.count(Task.id)).where(and_(Task.day_date == today, Task.is_hidden == False)))).scalar() or 0
    by_status = {s: c for s, c in (await db.execute(
        select(Task.status, func.count(Task.id)).where(and_(Task.day_date == today, Task.is_hidden == False)).group_by(Task.status)
    )).all()}
    wls = (await db.execute(select(WorkLog).where(WorkLog.day_date == today))).scalars().all()
    total_h = sum((w.end_dt - w.start_dt).total_seconds() / 3600 for w in wls)
    return {"date": today, "total_tasks": total, "tasks_by_status": by_status,
            "total_hours": round(total_h, 2), "total_worklogs": len(wls)}

@app.get("/api/stats/user/{user_id}")
async def get_user_stats(user_id: int, days: int = 7, current_user: User = Depends(require_any_role), db: AsyncSession = Depends(get_db)):
    is_manager = ROLE_HIERARCHY.get(current_user.role, 0) >= ROLE_HIERARCHY[Role.ENCARGADO.value]
    if user_id != current_user.id and not is_manager:
        raise HTTPException(status_code=403, detail="Sin permiso")
    start = (date.today() - timedelta(days=days)).isoformat()
    assigned = (await db.execute(
        select(func.count(TaskMember.task_id.distinct())).where(TaskMember.telegram_id == user_id)
        .join(Task, Task.id == TaskMember.task_id).where(Task.day_date >= start)
    )).scalar() or 0
    wls = (await db.execute(
        select(WorkLog).where(and_(
            WorkLog.telegram_id == user_id,
            func.date(WorkLog.start_dt) >= start
        ))
    )).scalars().all()
    total_h = sum((w.end_dt - w.start_dt).total_seconds() / 3600 for w in wls)
    return {"user_id": user_id, "period_days": days, "tasks_assigned": assigned,
            "total_hours": round(total_h, 2), "total_worklogs": len(wls)}


@app.get("/api/documents/{key}", response_model=SharedDocumentResponse)
async def get_shared_document(
    key: str,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    rule = _assert_document_access(key, current_user, "read")
    setting = (await db.execute(select(Setting).where(Setting.key == key))).scalar_one_or_none()
    if not setting or not setting.value:
        return SharedDocumentResponse(key=key, data=rule["default"])

    try:
        data = json.loads(setting.value)
    except json.JSONDecodeError:
        data = rule["default"]
    return SharedDocumentResponse(key=key, data=data)


@app.put("/api/documents/{key}", response_model=SharedDocumentResponse)
async def put_shared_document(
    key: str,
    body: SharedDocumentPayload,
    current_user: User = Depends(require_any_role),
    db: AsyncSession = Depends(get_db),
):
    _assert_document_access(key, current_user, "write")
    setting = (await db.execute(select(Setting).where(Setting.key == key))).scalar_one_or_none()
    serialized = json.dumps(body.data, ensure_ascii=False)
    if setting:
        setting.value = serialized
    else:
        db.add(Setting(key=key, value=serialized))
    await db.commit()
    return SharedDocumentResponse(key=key, data=body.data)


@app.get("/")
async def root():
    return {"message": "Maintenance App API v3", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
