# -*- coding: utf-8 -*-
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from models import Base

DB_URL = "sqlite+aiosqlite:///db.sqlite3"

engine = create_async_engine(DB_URL, echo=False)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

async def init_db() -> None:
    async with engine.begin() as conn:
        # (Recomendado) habilitar FK en SQLite
        await conn.exec_driver_sql("PRAGMA foreign_keys=ON;")

        # crea tablas nuevas si no existen
        await conn.run_sync(Base.metadata.create_all)

        # --- auto-migración: agregar columna is_hidden si no existe ---
        cols = await conn.exec_driver_sql("PRAGMA table_info(tasks);")
        col_names = [row[1] for row in cols.fetchall()]  # row[1]=name
        if "is_hidden" not in col_names:
            await conn.exec_driver_sql("ALTER TABLE tasks ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT 0;")
        
        # --- auto-migración: agregar columna user_name en work_logs ---
        wl_cols = await conn.exec_driver_sql("PRAGMA table_info(work_logs);")
        wl_col_names = [row[1] for row in wl_cols.fetchall()]
        if "user_name" not in wl_col_names:
            await conn.exec_driver_sql("ALTER TABLE work_logs ADD COLUMN user_name VARCHAR(128) DEFAULT '';")
            print("✅ Columna user_name agregada a work_logs")
        
        # --- auto-migración: agregar columna rescheduled_date en tasks ---
        task_cols = await conn.exec_driver_sql("PRAGMA table_info(tasks);")
        task_col_names = [row[1] for row in task_cols.fetchall()]
        if "rescheduled_date" not in task_col_names:
            await conn.exec_driver_sql("ALTER TABLE tasks ADD COLUMN rescheduled_date VARCHAR(10);")
            print("✅ Columna rescheduled_date agregada a tasks")
