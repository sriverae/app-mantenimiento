# -*- coding: utf-8 -*-
import os
import secrets
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from models import Base


def _normalize_database_url(raw_url: str) -> str:
    url = (raw_url or "").strip() or "sqlite+aiosqlite:///db.sqlite3"
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql+asyncpg://"):
        parts = urlsplit(url)
        params = dict(parse_qsl(parts.query, keep_blank_values=True))
        sslmode = params.pop("sslmode", None)
        if sslmode and "ssl" not in params:
            params["ssl"] = sslmode
        query = urlencode(params)
        url = urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))
    return url


DB_URL = _normalize_database_url(os.getenv("DATABASE_URL", "sqlite+aiosqlite:///db.sqlite3"))
IS_SQLITE = DB_URL.startswith("sqlite")
APP_ENV = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "development")).lower()
IS_PRODUCTION = APP_ENV in {"prod", "production"}
ALLOW_SQLITE_IN_PRODUCTION = os.getenv("ALLOW_SQLITE_IN_PRODUCTION") == "1"

if IS_PRODUCTION and IS_SQLITE and not ALLOW_SQLITE_IN_PRODUCTION:
    raise RuntimeError(
        "SQLite no esta permitido en produccion. Configura DATABASE_URL hacia PostgreSQL "
        "o define ALLOW_SQLITE_IN_PRODUCTION=1 solo si sabes exactamente lo que haces."
    )

engine_kwargs = {
    "echo": False,
    "pool_pre_ping": not IS_SQLITE,
}
if not IS_SQLITE:
    engine_kwargs.update({
        "pool_size": int(os.getenv("DB_POOL_SIZE", "10")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "20")),
        "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "30")),
        "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", "1800")),
    })

engine = create_async_engine(DB_URL, **engine_kwargs)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

if IS_SQLITE:
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.execute("PRAGMA busy_timeout=5000;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA temp_store=MEMORY;")
        cursor.close()


async def init_db() -> None:
    async with engine.begin() as conn:
        if IS_SQLITE:
            if os.getenv("SQLITE_SIMULATION_NO_JOURNAL") == "1":
                await conn.exec_driver_sql("PRAGMA journal_mode=OFF;")
                await conn.exec_driver_sql("PRAGMA synchronous=OFF;")
            else:
                await conn.exec_driver_sql("PRAGMA journal_mode=WAL;")
                await conn.exec_driver_sql("PRAGMA busy_timeout=5000;")
            await conn.exec_driver_sql("PRAGMA foreign_keys=OFF;")
            await _migrate_users_table_sqlite(conn)
            await conn.run_sync(Base.metadata.create_all)
            await _add_legacy_sqlite_columns(conn)
            await conn.exec_driver_sql("PRAGMA foreign_keys=ON;")
        else:
            # For a new managed Postgres instance we can bootstrap directly
            # from the current SQLAlchemy models.
            await conn.run_sync(Base.metadata.create_all)
            await _migrate_settings_value_postgres(conn)

    await _seed_admin()


async def _add_legacy_sqlite_columns(conn):
    async def add_col(table, col, definition):
        rows = await conn.exec_driver_sql(f"PRAGMA table_info({table});")
        if col not in [r[1] for r in rows.fetchall()]:
            await conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {col} {definition};")
            print(f"  ✅ Columna {col} agregada a {table}")

    await add_col("tasks", "is_hidden", "BOOLEAN NOT NULL DEFAULT 0")
    await add_col("tasks", "rescheduled_date", "VARCHAR(10)")
    await add_col("work_logs", "user_name", "VARCHAR(128) DEFAULT ''")
    await add_col("users", "secret_question", "VARCHAR(256)")
    await add_col("users", "secret_answer_hash", "VARCHAR(256)")


async def _migrate_settings_value_postgres(conn):
    """Allow shared application documents to grow beyond small VARCHAR limits."""
    await conn.exec_driver_sql("ALTER TABLE settings ALTER COLUMN value TYPE TEXT;")


async def _migrate_users_table_sqlite(conn):
    """
    Rebuild the users table only for legacy SQLite databases created before
    the current structure existed. New Postgres databases do not need this.
    """
    tables = await conn.exec_driver_sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users';"
    )
    if not tables.fetchone():
        return

    rows = await conn.exec_driver_sql("PRAGMA table_info(users);")
    cols = {r[1]: r for r in rows.fetchall()}

    needs_migration = False
    if "is_active" in cols and cols["is_active"][3]:
        needs_migration = True
    if "telegram_id" in cols and cols["telegram_id"][3]:
        needs_migration = True
    if "account_status" not in cols:
        needs_migration = True

    if not needs_migration:
        return

    print("  🔧 Migrando tabla users a nueva estructura...")

    keep_cols = [
        c
        for c in [
            "id",
            "username",
            "full_name",
            "password_hash",
            "role",
            "created_at",
            "last_login",
            "telegram_id",
        ]
        if c in cols
    ]
    keep_cols_sql = ", ".join(keep_cols)

    await conn.exec_driver_sql(
        """
        CREATE TABLE users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username VARCHAR(64) UNIQUE,
            full_name VARCHAR(128) DEFAULT '',
            password_hash VARCHAR(256) DEFAULT '',
            role VARCHAR(16) DEFAULT 'TECNICO',
            account_status VARCHAR(16) DEFAULT 'ACTIVE',
            created_at DATETIME DEFAULT (CURRENT_TIMESTAMP),
            last_login DATETIME,
            approved_by INTEGER,
            approved_at DATETIME,
            rejected_by INTEGER,
            rejection_note VARCHAR(256) DEFAULT '',
            telegram_id BIGINT
        );
        """
    )

    await conn.exec_driver_sql(
        f"""
        INSERT INTO users_new ({keep_cols_sql})
        SELECT {keep_cols_sql} FROM users;
        """
    )

    await conn.exec_driver_sql(
        "UPDATE users_new SET account_status = 'ACTIVE' WHERE account_status IS NULL;"
    )

    await conn.exec_driver_sql("DROP TABLE users;")
    await conn.exec_driver_sql("ALTER TABLE users_new RENAME TO users;")
    print("  ✅ Tabla users migrada correctamente")


async def _seed_admin() -> None:
    """Create a default admin only when the database is empty."""
    from auth import hash_password
    from models import AccountStatus, Role, User

    async with SessionLocal() as session:
        count = (await session.execute(select(func.count(User.id)))).scalar()
        if count == 0:
            initial_username = os.getenv("INITIAL_ADMIN_USERNAME", "admin").strip() or "admin"
            initial_password = os.getenv("INITIAL_ADMIN_PASSWORD", "").strip()
            production_env = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "")).lower() in {"prod", "production"}
            allow_insecure_default = os.getenv("ALLOW_INSECURE_DEFAULT_ADMIN") == "1" or (IS_SQLITE and not production_env)
            if not initial_password and not allow_insecure_default:
                print("⚠️  Base vacia sin INITIAL_ADMIN_PASSWORD; no se creo admin por seguridad.")
                return

            password = initial_password or f"Local{secrets.token_urlsafe(9)}1!"
            admin = User(
                username=initial_username,
                full_name="Administrador",
                password_hash=hash_password(password),
                role=Role.INGENIERO.value,
                account_status=AccountStatus.ACTIVE.value,
            )
            session.add(admin)
            await session.commit()
            print(f"✅ Usuario admin creado  ->  {initial_username}")
            if not initial_password:
                print(f"⚠️  Contraseña local temporal para {initial_username}: {password}")
                print("⚠️  Cambiala inmediatamente y no la reutilices en produccion.")
