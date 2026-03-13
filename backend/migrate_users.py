#!/usr/bin/env python3
"""
migrate_users.py — Ejecutar UNA SOLA VEZ para migrar usuarios existentes al nuevo sistema.

Qué hace:
  1. Para cada usuario que ya existe sin password_hash, asigna:
     - username  = su telegram_id como string  (ej: "123456789")
     - password  = "Cambiar1234!"  (contraseña temporal)
  2. Si no existe ningún INGENIERO, crea el usuario admin / Admin1234!

Uso:
  cd backend
  python migrate_users.py
"""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))

from db import SessionLocal, init_db
from models import User, Role
from auth import hash_password
from sqlalchemy import select

TEMP_PASSWORD = "Cambiar1234!"

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
                if needs_username:
                    # Use telegram_id as username, or fallback to id
                    u.username = str(u.telegram_id) if u.telegram_id else f"user{u.id}"
                if needs_migration:
                    u.password_hash = hash_password(TEMP_PASSWORD)
                migrated += 1
                print(f"  ✅ Migrado: id={u.id} | nuevo_username='{u.username}' | full_name='{u.full_name}' | role={u.role}")

        # Ensure at least one INGENIERO exists
        has_ingeniero = any(u.role == Role.INGENIERO.value and u.password_hash for u in users)
        if not has_ingeniero:
            admin = User(
                username="admin",
                full_name="Administrador",
                password_hash=hash_password("Admin1234!"),
                role=Role.INGENIERO.value,
                is_active=True,
            )
            db.add(admin)
            print("  ✅ Creado usuario admin / Admin1234! (INGENIERO)")

        await db.commit()

        if migrated == 0 and has_ingeniero:
            print("✔  No hay usuarios que migrar. Todo está al día.")
        else:
            print(f"\n✅ Migración completa. {migrated} usuario(s) actualizados.")
            print(f"   Contraseña temporal asignada: '{TEMP_PASSWORD}'")
            print(f"   Cada usuario debe cambiar su contraseña al primer login.")

asyncio.run(main())
