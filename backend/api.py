# -*- coding: utf-8 -*-
"""
API REST para el sistema de mantenimiento
FastAPI backend que expone endpoints para la app móvil
"""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, and_, or_
from datetime import datetime, date, timedelta
from typing import List, Optional
from pydantic import BaseModel
from pathlib import Path
import os

from db import SessionLocal, init_db
from models import (
    User, Role, Day, DayStatus,
    Task, TaskStatus, TaskMember, WorkLog, Evidence, Setting
)

app = FastAPI(title="Maintenance App API", version="1.0.0")

# CORS para permitir peticiones desde el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especifica tu dominio
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency para obtener sesión de base de datos
async def get_db():
    async with SessionLocal() as session:
        yield session

# ==================== MODELOS PYDANTIC ====================

class UserCreate(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    full_name: str
    role: str = Role.TECNICO.value

class UserResponse(BaseModel):
    id: int
    telegram_id: int
    username: Optional[str]
    full_name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True

class TaskCreate(BaseModel):
    day_date: str  # YYYY-MM-DD
    area: str
    equipo: str
    description: str
    priority: str = "MEDIA"

class TaskUpdate(BaseModel):
    area: Optional[str] = None
    equipo: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    rescheduled_date: Optional[str] = None

class TaskResponse(BaseModel):
    id: int
    day_date: str
    area: str
    equipo: str
    description: str
    priority: str
    status: str
    created_by: int
    is_hidden: bool
    rescheduled_date: Optional[str]
    members: List[int] = []

    class Config:
        from_attributes = True

class WorkLogCreate(BaseModel):
    task_id: int
    telegram_id: int
    user_name: str
    start_dt: str  # ISO format
    end_dt: str    # ISO format
    notes: str = ""
    parts: str = ""

class WorkLogResponse(BaseModel):
    id: int
    day_date: str
    task_id: int
    telegram_id: int
    user_name: str
    start_dt: datetime
    end_dt: datetime
    notes: str
    parts: str

    class Config:
        from_attributes = True

class EvidenceCreate(BaseModel):
    task_id: int
    telegram_id: int
    file_id: str
    caption: str = ""

class DayResponse(BaseModel):
    date: str
    status: str
    closed_by: Optional[int]
    closed_at: Optional[datetime]

    class Config:
        from_attributes = True

# ==================== ENDPOINTS ====================

@app.on_event("startup")
async def startup():
    await init_db()
    print("✅ Base de datos inicializada")

@app.get("/")
async def root():
    return {"message": "Maintenance App API", "version": "1.0.0"}

# -------------------- USUARIOS --------------------

@app.post("/api/users/", response_model=UserResponse)
async def create_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    """Crear un nuevo usuario"""
    # Verificar si ya existe
    result = await db.execute(
        select(User).where(User.telegram_id == user.telegram_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Usuario ya existe")
    
    db_user = User(
        telegram_id=user.telegram_id,
        username=user.username,
        full_name=user.full_name,
        role=user.role
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

@app.get("/api/users/", response_model=List[UserResponse])
async def get_users(db: AsyncSession = Depends(get_db)):
    """Obtener todos los usuarios activos"""
    result = await db.execute(
        select(User).where(User.is_active == True).order_by(User.full_name)
    )
    users = result.scalars().all()
    return users

@app.get("/api/users/{telegram_id}", response_model=UserResponse)
async def get_user(telegram_id: int, db: AsyncSession = Depends(get_db)):
    """Obtener un usuario por telegram_id"""
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user

@app.put("/api/users/{telegram_id}/role")
async def update_user_role(telegram_id: int, role: str, db: AsyncSession = Depends(get_db)):
    """Actualizar rol de usuario"""
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    user.role = role
    await db.commit()
    return {"message": "Rol actualizado"}

# -------------------- DÍAS --------------------

@app.get("/api/days/", response_model=List[DayResponse])
async def get_days(limit: int = 30, db: AsyncSession = Depends(get_db)):
    """Obtener últimos días"""
    result = await db.execute(
        select(Day).order_by(Day.date.desc()).limit(limit)
    )
    days = result.scalars().all()
    return days

@app.get("/api/days/{day_date}", response_model=DayResponse)
async def get_day(day_date: str, db: AsyncSession = Depends(get_db)):
    """Obtener información de un día específico"""
    result = await db.execute(
        select(Day).where(Day.date == day_date)
    )
    day = result.scalar_one_or_none()
    
    if not day:
        # Crear el día si no existe
        day = Day(date=day_date, status=DayStatus.OPEN.value)
        db.add(day)
        await db.commit()
        await db.refresh(day)
    
    return day

@app.post("/api/days/{day_date}/close")
async def close_day(day_date: str, telegram_id: int, db: AsyncSession = Depends(get_db)):
    """Cerrar un día"""
    result = await db.execute(
        select(Day).where(Day.date == day_date)
    )
    day = result.scalar_one_or_none()
    
    if not day:
        day = Day(date=day_date)
        db.add(day)
    
    day.status = DayStatus.CLOSED.value
    day.closed_by = telegram_id
    day.closed_at = datetime.now()
    
    await db.commit()
    return {"message": "Día cerrado exitosamente"}

@app.post("/api/days/{day_date}/reopen")
async def reopen_day(day_date: str, db: AsyncSession = Depends(get_db)):
    """Reabrir un día"""
    result = await db.execute(
        select(Day).where(Day.date == day_date)
    )
    day = result.scalar_one_or_none()
    
    if not day:
        raise HTTPException(status_code=404, detail="Día no encontrado")
    
    day.status = DayStatus.OPEN.value
    day.closed_by = None
    day.closed_at = None
    
    await db.commit()
    return {"message": "Día reabierto exitosamente"}

# -------------------- TAREAS --------------------

@app.post("/api/tasks/", response_model=TaskResponse)
async def create_task(task: TaskCreate, telegram_id: int, db: AsyncSession = Depends(get_db)):
    """Crear una nueva tarea"""
    db_task = Task(
        day_date=task.day_date,
        area=task.area,
        equipo=task.equipo,
        description=task.description,
        priority=task.priority,
        status=TaskStatus.OPEN.value,
        created_by=telegram_id
    )
    db.add(db_task)
    await db.commit()
    await db.refresh(db_task)
    
    response = TaskResponse(
        id=db_task.id,
        day_date=db_task.day_date,
        area=db_task.area,
        equipo=db_task.equipo,
        description=db_task.description,
        priority=db_task.priority,
        status=db_task.status,
        created_by=db_task.created_by,
        is_hidden=db_task.is_hidden,
        rescheduled_date=db_task.rescheduled_date,
        members=[]
    )
    return response

@app.get("/api/tasks/", response_model=List[TaskResponse])
async def get_tasks(
    day_date: Optional[str] = None,
    status: Optional[str] = None,
    include_hidden: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Obtener tareas con filtros opcionales"""
    query = select(Task)
    
    conditions = []
    if day_date:
        conditions.append(Task.day_date == day_date)
    if status:
        conditions.append(Task.status == status)
    if not include_hidden:
        conditions.append(Task.is_hidden == False)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.order_by(Task.created_at.desc())
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    # Obtener miembros de cada tarea
    response = []
    for task in tasks:
        members_result = await db.execute(
            select(TaskMember.telegram_id).where(TaskMember.task_id == task.id)
        )
        members = [m for m in members_result.scalars().all()]
        
        response.append(TaskResponse(
            id=task.id,
            day_date=task.day_date,
            area=task.area,
            equipo=task.equipo,
            description=task.description,
            priority=task.priority,
            status=task.status,
            created_by=task.created_by,
            is_hidden=task.is_hidden,
            rescheduled_date=task.rescheduled_date,
            members=members
        ))
    
    return response

@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Obtener una tarea específica"""
    result = await db.execute(
        select(Task).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    # Obtener miembros
    members_result = await db.execute(
        select(TaskMember.telegram_id).where(TaskMember.task_id == task_id)
    )
    members = [m for m in members_result.scalars().all()]
    
    return TaskResponse(
        id=task.id,
        day_date=task.day_date,
        area=task.area,
        equipo=task.equipo,
        description=task.description,
        priority=task.priority,
        status=task.status,
        created_by=task.created_by,
        is_hidden=task.is_hidden,
        rescheduled_date=task.rescheduled_date,
        members=members
    )

@app.put("/api/tasks/{task_id}")
async def update_task(task_id: int, task_update: TaskUpdate, db: AsyncSession = Depends(get_db)):
    """Actualizar una tarea"""
    result = await db.execute(
        select(Task).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    if task_update.area is not None:
        task.area = task_update.area
    if task_update.equipo is not None:
        task.equipo = task_update.equipo
    if task_update.description is not None:
        task.description = task_update.description
    if task_update.priority is not None:
        task.priority = task_update.priority
    if task_update.status is not None:
        task.status = task_update.status
    if task_update.rescheduled_date is not None:
        task.rescheduled_date = task_update.rescheduled_date
    
    await db.commit()
    return {"message": "Tarea actualizada"}

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Eliminar una tarea (soft delete)"""
    result = await db.execute(
        select(Task).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    task.is_hidden = True
    await db.commit()
    return {"message": "Tarea ocultada"}

@app.post("/api/tasks/{task_id}/members/{telegram_id}")
async def add_task_member(task_id: int, telegram_id: int, db: AsyncSession = Depends(get_db)):
    """Agregar un miembro a una tarea"""
    # Verificar que la tarea existe
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    # Verificar si ya es miembro
    result = await db.execute(
        select(TaskMember).where(
            and_(TaskMember.task_id == task_id, TaskMember.telegram_id == telegram_id)
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Usuario ya es miembro de esta tarea")
    
    member = TaskMember(task_id=task_id, telegram_id=telegram_id)
    db.add(member)
    
    # Actualizar status de tarea si estaba OPEN
    if task.status == TaskStatus.OPEN.value:
        task.status = TaskStatus.IN_PROGRESS.value
    
    await db.commit()
    return {"message": "Miembro agregado a la tarea"}

@app.delete("/api/tasks/{task_id}/members/{telegram_id}")
async def remove_task_member(task_id: int, telegram_id: int, db: AsyncSession = Depends(get_db)):
    """Remover un miembro de una tarea"""
    result = await db.execute(
        delete(TaskMember).where(
            and_(TaskMember.task_id == task_id, TaskMember.telegram_id == telegram_id)
        )
    )
    await db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Miembro no encontrado en esta tarea")
    
    return {"message": "Miembro removido de la tarea"}

# -------------------- REGISTROS DE TRABAJO --------------------

@app.post("/api/worklogs/", response_model=WorkLogResponse)
async def create_worklog(worklog: WorkLogCreate, db: AsyncSession = Depends(get_db)):
    """Crear un registro de trabajo"""
    # Verificar que la tarea existe
    result = await db.execute(select(Task).where(Task.id == worklog.task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    # Parsear fechas
    try:
        start = datetime.fromisoformat(worklog.start_dt)
        end = datetime.fromisoformat(worklog.end_dt)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido")
    
    if end <= start:
        raise HTTPException(status_code=400, detail="La hora de fin debe ser posterior a la de inicio")
    
    db_worklog = WorkLog(
        day_date=task.day_date,
        task_id=worklog.task_id,
        telegram_id=worklog.telegram_id,
        user_name=worklog.user_name,
        start_dt=start,
        end_dt=end,
        notes=worklog.notes,
        parts=worklog.parts
    )
    db.add(db_worklog)
    await db.commit()
    await db.refresh(db_worklog)
    return db_worklog

@app.get("/api/worklogs/", response_model=List[WorkLogResponse])
async def get_worklogs(
    task_id: Optional[int] = None,
    day_date: Optional[str] = None,
    telegram_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """Obtener registros de trabajo con filtros opcionales"""
    query = select(WorkLog)
    
    conditions = []
    if task_id:
        conditions.append(WorkLog.task_id == task_id)
    if day_date:
        conditions.append(WorkLog.day_date == day_date)
    if telegram_id:
        conditions.append(WorkLog.telegram_id == telegram_id)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.order_by(WorkLog.start_dt.desc())
    
    result = await db.execute(query)
    worklogs = result.scalars().all()
    return worklogs

@app.delete("/api/worklogs/{worklog_id}")
async def delete_worklog(worklog_id: int, db: AsyncSession = Depends(get_db)):
    """Eliminar un registro de trabajo"""
    result = await db.execute(
        delete(WorkLog).where(WorkLog.id == worklog_id)
    )
    await db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    return {"message": "Registro eliminado"}

# -------------------- ESTADÍSTICAS --------------------

@app.get("/api/stats/today")
async def get_today_stats(db: AsyncSession = Depends(get_db)):
    """Obtener estadísticas del día actual"""
    today = date.today().isoformat()
    
    # Total de tareas
    result = await db.execute(
        select(func.count(Task.id)).where(
            and_(Task.day_date == today, Task.is_hidden == False)
        )
    )
    total_tasks = result.scalar() or 0
    
    # Tareas por estado
    result = await db.execute(
        select(Task.status, func.count(Task.id))
        .where(and_(Task.day_date == today, Task.is_hidden == False))
        .group_by(Task.status)
    )
    tasks_by_status = {status: count for status, count in result.all()}
    
    # Total de horas trabajadas
    result = await db.execute(
        select(WorkLog).where(WorkLog.day_date == today)
    )
    worklogs = result.scalars().all()
    total_hours = sum(
        (wl.end_dt - wl.start_dt).total_seconds() / 3600 
        for wl in worklogs
    )
    
    return {
        "date": today,
        "total_tasks": total_tasks,
        "tasks_by_status": tasks_by_status,
        "total_hours": round(total_hours, 2),
        "total_worklogs": len(worklogs)
    }

@app.get("/api/stats/user/{telegram_id}")
async def get_user_stats(telegram_id: int, days: int = 7, db: AsyncSession = Depends(get_db)):
    """Obtener estadísticas de un usuario"""
    start_date = (date.today() - timedelta(days=days)).isoformat()
    
    # Tareas asignadas
    result = await db.execute(
        select(func.count(TaskMember.task_id.distinct()))
        .where(TaskMember.telegram_id == telegram_id)
        .join(Task, Task.id == TaskMember.task_id)
        .where(Task.day_date >= start_date)
    )
    tasks_assigned = result.scalar() or 0
    
    # Horas trabajadas
    result = await db.execute(
        select(WorkLog).where(
            and_(
                WorkLog.telegram_id == telegram_id,
                WorkLog.day_date >= start_date
            )
        )
    )
    worklogs = result.scalars().all()
    total_hours = sum(
        (wl.end_dt - wl.start_dt).total_seconds() / 3600 
        for wl in worklogs
    )
    
    return {
        "telegram_id": telegram_id,
        "period_days": days,
        "tasks_assigned": tasks_assigned,
        "total_hours": round(total_hours, 2),
        "total_worklogs": len(worklogs)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
