# -*- coding: utf-8 -*-
import os
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from models import Base

DB_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///db.sqlite3")

engine       = create_async_engine(DB_URL, echo=False)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.exec_driver_sql("PRAGMA foreign_keys=OFF;")

        # ── Migrar tabla users a la nueva estructura antes de create_all ──────
        await _migrate_users_table(conn)

        # ── Crear tablas nuevas / actualizar existentes ───────────────────────
        await conn.run_sync(Base.metadata.create_all)

        # ── Columnas legacy en otras tablas ───────────────────────────────────
        async def add_col(table, col, definition):
            rows = await conn.exec_driver_sql(f"PRAGMA table_info({table});")
            if col not in [r[1] for r in rows.fetchall()]:
                await conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {col} {definition};")
                print(f"  ✅ Columna {col} agregada a {table}")

        await add_col("tasks",     "is_hidden",       "BOOLEAN NOT NULL DEFAULT 0")
        await add_col("tasks",     "rescheduled_date", "VARCHAR(10)")
        await add_col("work_logs", "user_name",        "VARCHAR(128) DEFAULT ''")
        await add_col("users",     "secret_question",  "VARCHAR(256)")
        await add_col("users",     "secret_answer_hash", "VARCHAR(256)")

        await conn.exec_driver_sql("PRAGMA foreign_keys=ON;")

    await _seed_admin()


async def _migrate_users_table(conn):
    """
    Recrea la tabla users con la estructura correcta si viene de la versión
    antigua (que tenía is_active NOT NULL, telegram_id NOT NULL, etc.).
    Es completamente idempotente: si ya tiene la estructura nueva, no hace nada.
    """
    # Ver si la tabla existe
    tables = await conn.exec_driver_sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users';"
    )
    if not tables.fetchone():
        return  # tabla nueva, create_all se encarga

    rows = await conn.exec_driver_sql("PRAGMA table_info(users);")
    cols = {r[1]: r for r in rows.fetchall()}
    # r = (cid, name, type, notnull, dflt_value, pk)

    # Detectar si necesita migración: is_active NOT NULL o telegram_id NOT NULL
    needs_migration = False
    if "is_active" in cols and cols["is_active"][3]:   # notnull=1
        needs_migration = True
    if "telegram_id" in cols and cols["telegram_id"][3]:
        needs_migration = True
    if "account_status" not in cols:
        needs_migration = True

    if not needs_migration:
        return

    print("  🔧 Migrando tabla users a nueva estructura...")

    # Columnas que existen en la tabla actual y que vamos a preservar
    keep_cols = [
        c for c in [
            "id", "username", "full_name", "password_hash", "role",
            "created_at", "last_login", "telegram_id",
        ]
        if c in cols
    ]
    keep_cols_sql = ", ".join(keep_cols)

    await conn.exec_driver_sql("""
        CREATE TABLE users_new (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        VARCHAR(64) UNIQUE,
            full_name       VARCHAR(128) DEFAULT '',
            password_hash   VARCHAR(256) DEFAULT '',
            role            VARCHAR(16)  DEFAULT 'TECNICO',
            account_status  VARCHAR(16)  DEFAULT 'ACTIVE',
            created_at      DATETIME     DEFAULT (CURRENT_TIMESTAMP),
            last_login      DATETIME,
            approved_by     INTEGER,
            approved_at     DATETIME,
            rejected_by     INTEGER,
            rejection_note  VARCHAR(256) DEFAULT '',
            telegram_id     BIGINT
        );
    """)

    # Copiar datos existentes
    await conn.exec_driver_sql(f"""
        INSERT INTO users_new ({keep_cols_sql})
        SELECT {keep_cols_sql} FROM users;
    """)

    # Usuarios ya existentes se marcan ACTIVE (eran del bot de Telegram)
    await conn.exec_driver_sql(
        "UPDATE users_new SET account_status = 'ACTIVE' WHERE account_status IS NULL;"
    )

    await conn.exec_driver_sql("DROP TABLE users;")
    await conn.exec_driver_sql("ALTER TABLE users_new RENAME TO users;")
    print("  ✅ Tabla users migrada correctamente")


async def _seed_admin() -> None:
    """Crear admin INGENIERO si no existe ningún usuario."""
    from auth import hash_password
    from models import AccountStatus, Role, User
    from sqlalchemy import func, select

    async with SessionLocal() as session:
        count = (await session.execute(select(func.count(User.id)))).scalar()
        if count == 0:
            admin = User(
                username       = "admin",
                full_name      = "Administrador",
                password_hash  = hash_password("Admin1234!"),
                role           = Role.INGENIERO.value,
                account_status = AccountStatus.ACTIVE.value,
            )
            session.add(admin)
            await session.commit()
            print("✅ Usuario admin creado  →  admin / Admin1234!")
            print("⚠️  Cambia la contraseña inmediatamente.")

