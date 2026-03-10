from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import (
    BigInteger, Boolean, DateTime, ForeignKey, String, Text, func, UniqueConstraint
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Role(str, Enum):
    INGENIERO = "INGENIERO"
    PLANNER = "PLANNER"
    ENCARGADO = "ENCARGADO"
    TECNICO = "TECNICO"
    ASISTENTE = "ASISTENTE"


class DayStatus(str, Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class TaskStatus(str, Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    CANCELLED = "CANCELLED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    full_name: Mapped[str] = mapped_column(String(128), default="")
    role: Mapped[str] = mapped_column(String(16), default=Role.TECNICO.value)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Day(Base):
    __tablename__ = "days"

    date: Mapped[str] = mapped_column(String(10), primary_key=True)  # YYYY-MM-DD
    status: Mapped[str] = mapped_column(String(8), default=DayStatus.OPEN.value)
    closed_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    day_date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    area: Mapped[str] = mapped_column(String(64), default="")
    equipo: Mapped[str] = mapped_column(String(64), default="")
    description: Mapped[str] = mapped_column(String(512), default="")
    priority: Mapped[str] = mapped_column(String(8), default="MEDIA")  # ALTA/MEDIA/BAJA
    status: Mapped[str] = mapped_column(String(16), default=TaskStatus.OPEN.value)
    created_by: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    rescheduled_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD para reprogramar


class TaskMember(Base):
    __tablename__ = "task_members"
    __table_args__ = (UniqueConstraint("task_id", "telegram_id", name="uq_task_member"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkLog(Base):
    __tablename__ = "work_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    day_date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    user_name: Mapped[str] = mapped_column(String(128), default="")  # NUEVO: Nombre del usuario

    start_dt: Mapped[datetime] = mapped_column(DateTime(timezone=False))  # local naive
    end_dt: Mapped[datetime] = mapped_column(DateTime(timezone=False))    # local naive

    notes: Mapped[str] = mapped_column(Text, default="")
    parts: Mapped[str] = mapped_column(Text, default="")  # texto libre por ahora
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Evidence(Base):
    __tablename__ = "evidences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    day_date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    file_id: Mapped[str] = mapped_column(String(256))  # telegram file_id
    caption: Mapped[str] = mapped_column(String(512), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(2048), default="")
