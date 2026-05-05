from __future__ import annotations
from datetime import datetime
from enum import Enum
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text, func, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Role(str, Enum):
    INGENIERO = "INGENIERO"
    PLANNER   = "PLANNER"
    ENCARGADO = "ENCARGADO"
    TECNICO   = "TECNICO"
    SUPERVISOR = "SUPERVISOR"
    OPERADOR   = "OPERADOR"


class AccountStatus(str, Enum):
    PENDING  = "PENDING"   # awaiting INGENIERO approval
    ACTIVE   = "ACTIVE"
    INACTIVE = "INACTIVE"


class DayStatus(str, Enum):
    OPEN   = "OPEN"
    CLOSED = "CLOSED"


class TaskStatus(str, Enum):
    DRAFT       = "DRAFT"       # solo visible para INGENIERO/PLANNER/ENCARGADO
    OPEN        = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    DONE        = "DONE"
    CANCELLED   = "CANCELLED"


class User(Base):
    __tablename__ = "users"

    id            : Mapped[int]           = mapped_column(primary_key=True, autoincrement=True)
    username      : Mapped[str]           = mapped_column(String(64), unique=True, index=True)
    full_name     : Mapped[str]           = mapped_column(String(128), default="")
    password_hash : Mapped[str]           = mapped_column(String(256))
    role          : Mapped[str]           = mapped_column(String(16), default=Role.TECNICO.value)
    # PENDING → needs approval, ACTIVE → can login, INACTIVE → disabled
    account_status: Mapped[str]           = mapped_column(String(16), default=AccountStatus.ACTIVE.value)
    created_at    : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login    : Mapped[datetime|None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by   : Mapped[int|None]      = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at   : Mapped[datetime|None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by   : Mapped[int|None]      = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    rejection_note: Mapped[str]           = mapped_column(String(256), default="")
    telegram_id      : Mapped[int|None]      = mapped_column(BigInteger, nullable=True, unique=True)
    secret_question  : Mapped[str|None]       = mapped_column(String(256), nullable=True)
    secret_answer_hash: Mapped[str|None]      = mapped_column(String(256), nullable=True)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id         : Mapped[int]      = mapped_column(primary_key=True, autoincrement=True)
    user_id    : Mapped[int]      = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash : Mapped[str]      = mapped_column(String(256), unique=True, index=True)
    expires_at : Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked    : Mapped[bool]     = mapped_column(Boolean, default=False)


class Day(Base):
    __tablename__ = "days"

    date       : Mapped[str]           = mapped_column(String(10), primary_key=True)
    status     : Mapped[str]           = mapped_column(String(8),  default=DayStatus.OPEN.value)
    closed_by  : Mapped[int|None]      = mapped_column(BigInteger, nullable=True)
    closed_at  : Mapped[datetime|None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())


class Task(Base):
    __tablename__ = "tasks"

    id               : Mapped[int]      = mapped_column(primary_key=True, autoincrement=True)
    day_date         : Mapped[str]      = mapped_column(String(10), index=True)
    area             : Mapped[str]      = mapped_column(String(64),  default="")
    equipo           : Mapped[str]      = mapped_column(String(64),  default="")
    description      : Mapped[str]      = mapped_column(String(512), default="")
    priority         : Mapped[str]      = mapped_column(String(8),   default="MEDIA")
    status           : Mapped[str]      = mapped_column(String(16),  default=TaskStatus.OPEN.value)
    created_by       : Mapped[int]      = mapped_column(BigInteger)
    created_at       : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at       : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_hidden        : Mapped[bool]     = mapped_column(Boolean, default=False)
    rescheduled_date : Mapped[str|None] = mapped_column(String(10), nullable=True)


class TaskMember(Base):
    __tablename__ = "task_members"
    __table_args__ = (UniqueConstraint("task_id", "telegram_id", name="uq_task_member"),)

    id          : Mapped[int]      = mapped_column(primary_key=True, autoincrement=True)
    task_id     : Mapped[int]      = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    telegram_id : Mapped[int]      = mapped_column(BigInteger, index=True)
    created_at  : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkLog(Base):
    __tablename__ = "work_logs"

    id         : Mapped[int]      = mapped_column(primary_key=True, autoincrement=True)
    day_date   : Mapped[str]      = mapped_column(String(10), index=True)
    task_id    : Mapped[int]      = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    telegram_id: Mapped[int]      = mapped_column(BigInteger, index=True)
    user_name  : Mapped[str]      = mapped_column(String(128), default="")
    start_dt   : Mapped[datetime] = mapped_column(DateTime(timezone=False))
    end_dt     : Mapped[datetime] = mapped_column(DateTime(timezone=False))
    notes      : Mapped[str]      = mapped_column(Text, default="")
    parts      : Mapped[str]      = mapped_column(Text, default="")
    created_at : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Evidence(Base):
    __tablename__ = "evidences"

    id         : Mapped[int]      = mapped_column(primary_key=True, autoincrement=True)
    day_date   : Mapped[str]      = mapped_column(String(10), index=True)
    task_id    : Mapped[int]      = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    telegram_id: Mapped[int]      = mapped_column(BigInteger, index=True)
    file_id    : Mapped[str]      = mapped_column(String(256))
    caption    : Mapped[str]      = mapped_column(String(512), default="")
    created_at : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Setting(Base):
    __tablename__ = "settings"

    key   : Mapped[str] = mapped_column(String(64),   primary_key=True)
    value : Mapped[str] = mapped_column(Text, default="")


class TaskNote(Base):
    """Notas visibles para todos los miembros de la tarea."""
    __tablename__ = "task_notes"

    id         : Mapped[int]      = mapped_column(primary_key=True, autoincrement=True)
    task_id    : Mapped[int]      = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id    : Mapped[int]      = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    user_name  : Mapped[str]      = mapped_column(String(128), default="")
    content    : Mapped[str]      = mapped_column(Text, default="")
    created_at : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskPart(Base):
    """Repuestos/materiales de la tarea — visibles y editables por todos."""
    __tablename__ = "task_parts"

    id         : Mapped[int]      = mapped_column(primary_key=True, autoincrement=True)
    task_id    : Mapped[int]      = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    added_by   : Mapped[int]      = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    user_name  : Mapped[str]      = mapped_column(String(128), default="")
    description: Mapped[str]      = mapped_column(String(256), default="")
    unit       : Mapped[str]      = mapped_column(String(16),  default="und")
    quantity   : Mapped[float]    = mapped_column(default=1.0)
    created_at : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskPhoto(Base):
    """Fotos de la tarea categorizadas como ANTES / DURANTE / DESPUÉS."""
    __tablename__ = "task_photos"

    id         : Mapped[int]      = mapped_column(primary_key=True, autoincrement=True)
    task_id    : Mapped[int]      = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[int]      = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    user_name  : Mapped[str]      = mapped_column(String(128), default="")
    category   : Mapped[str]      = mapped_column(String(16),  default="DURANTE")  # ANTES | DURANTE | DESPUÉS
    filename   : Mapped[str]      = mapped_column(String(256))   # stored filename on disk
    caption    : Mapped[str]      = mapped_column(String(256), default="")
    created_at : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskReschedule(Base):
    """Historial de reprogramaciones de una tarea."""
    __tablename__ = "task_reschedules"

    id           : Mapped[int]      = mapped_column(primary_key=True, autoincrement=True)
    task_id      : Mapped[int]      = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    rescheduled_by: Mapped[int]     = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    user_name    : Mapped[str]      = mapped_column(String(128), default="")
    old_date     : Mapped[str]      = mapped_column(String(10))
    new_date     : Mapped[str]      = mapped_column(String(10))
    reason       : Mapped[str]      = mapped_column(String(256), default="")
    created_at   : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
