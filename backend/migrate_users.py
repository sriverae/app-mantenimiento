#!/usr/bin/env python3
"""
migrate_users.py — Ejecutar UNA SOLA VEZ para migrar usuarios existentes al nuevo sistema.

Qué hace:
  1. Para cada usuario que ya existe sin password_hash, asigna:
     - username  = su telegram_id como string  (ej: "123456789")
     - password  = una contraseña temporal aleatoria
  2. Si no existe ningún INGENIERO, crea el usuario INITIAL_ADMIN_USERNAME
     usando INITIAL_ADMIN_PASSWORD. No usa contraseña por defecto.

Uso:
  cd backend
  python migrate_users.py
"""
import asyncio, secrets, sys, os
sys.path.insert(0, os.path.dirname(__file__))

from db import SessionLocal, init_db
from models import AccountStatus, User, Role
from auth import hash_password
from sqlalchemy import select

INITIAL_ADMIN_USERNAME = os.getenv("INITIAL_ADMIN_USERNAME", "admin").strip() or "admin"
INITIAL_ADMIN_PASSWORD = os.getenv("INITIAL_ADMIN_PASSWORD", "").strip()


def make_temp_password() -> str:
    return f"Cambiar{100000 + secrets.randbelow(900000)}!"

async def main():
    await init_db()
    async with SessionLocal() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()

        migrated = 0
        for u in users:
            needs_migration = not u.password_hash or len(u.password_hash) < 10
            needs_username  = not u.username

            if needs_migration or needs_username:
                temp_password = ""
                if needs_username:
                    # Use telegram_id as username, or fallback to id
                    u.username = str(u.telegram_id) if u.telegram_id else f"user{u.id}"
                if needs_migration:
                    temp_password = make_temp_password()
                    u.password_hash = hash_password(temp_password)
                migrated += 1
                suffix = f" | temp_password='{temp_password}'" if temp_password else ""
                print(f"  ✅ Migrado: id={u.id} | nuevo_username='{u.username}' | full_name='{u.full_name}' | role={u.role}{suffix}")

        # Ensure at least one INGENIERO exists
        has_ingeniero = any(u.role == Role.INGENIERO.value and u.password_hash for u in users)
        if not has_ingeniero:
            if not INITIAL_ADMIN_PASSWORD:
                print("  ⚠️  No existe INGENIERO y no se creó admin porque falta INITIAL_ADMIN_PASSWORD.")
                print("      Define INITIAL_ADMIN_PASSWORD y vuelve a ejecutar la migración.")
            else:
                admin = User(
                    username=INITIAL_ADMIN_USERNAME,
                    full_name="Administrador",
                    password_hash=hash_password(INITIAL_ADMIN_PASSWORD),
                    role=Role.INGENIERO.value,
                    account_status=AccountStatus.ACTIVE.value,
                )
                db.add(admin)
                print(f"  ✅ Creado usuario admin '{INITIAL_ADMIN_USERNAME}' (INGENIERO)")

        await db.commit()

        if migrated == 0 and has_ingeniero:
            print("✔  No hay usuarios que migrar. Todo está al día.")
        else:
            print(f"\n✅ Migración completa. {migrated} usuario(s) actualizados.")
            print("   Las contraseñas temporales se imprimieron junto a cada usuario migrado.")
            print("   Cada usuario debe cambiar su contraseña al primer login.")

asyncio.run(main())
