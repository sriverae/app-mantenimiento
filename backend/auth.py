# -*- coding: utf-8 -*-
"""
Auth utilities: password hashing, JWT access/refresh tokens, RBAC helpers.
"""
import hashlib
import os
import secrets
import warnings
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import SessionLocal
from models import RefreshToken, Role, User

# ---------------------------------------------------------------------------
# Configuration (read from env; sensible defaults only for local dev)
# ---------------------------------------------------------------------------
_ENV = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "development")).lower()
_SECRET_FROM_ENV = os.getenv("JWT_SECRET_KEY", "").strip()
if not _SECRET_FROM_ENV and _ENV in {"prod", "production"}:
    raise RuntimeError("JWT_SECRET_KEY es obligatorio en produccion")
if not _SECRET_FROM_ENV:
    warnings.warn(
        "JWT_SECRET_KEY no esta configurado; se usara una clave temporal solo para desarrollo.",
        RuntimeWarning,
        stacklevel=2,
    )
SECRET_KEY: str = _SECRET_FROM_ENV or secrets.token_hex(32)
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
def _now_utc() -> datetime:
    return datetime.now(timezone.utc)

def create_access_token(user_id: int, username: str, role: str) -> str:
    expire = _now_utc() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token() -> tuple[str, str]:
    """Returns (raw_token, hashed_token). Store the hash, send the raw."""
    raw = secrets.token_urlsafe(64)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed

def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

# ---------------------------------------------------------------------------
# FastAPI dependency: get current user from Bearer token
# ---------------------------------------------------------------------------
bearer_scheme = HTTPBearer()

async def get_db():
    async with SessionLocal() as session:
        yield session

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_access_token(credentials.credentials)
    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id, User.account_status == "ACTIVE"))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    return user

# ---------------------------------------------------------------------------
# Role-based access control helpers
# ---------------------------------------------------------------------------
ROLE_HIERARCHY: dict[str, int] = {
    Role.INGENIERO.value: 6,
    Role.PLANNER.value: 5,
    Role.ENCARGADO.value: 4,
    Role.TECNICO.value: 3,
    Role.SUPERVISOR.value: 2,
    Role.OPERADOR.value: 1,
}

def require_roles(allowed: List[str]):
    """Dependency factory — raises 403 if user role is not in allowed list."""
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado. Roles permitidos: {', '.join(allowed)}",
            )
        return current_user
    return _check

def require_min_role(min_role: str):
    """Dependency factory — user must have >= hierarchy level than min_role."""
    min_level = ROLE_HIERARCHY[min_role]
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        user_level = ROLE_HIERARCHY.get(current_user.role, 0)
        if user_level < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Se requiere al menos el rol {min_role}",
            )
        return current_user
    return _check

# Convenience shortcuts
require_ingeniero = require_roles([Role.INGENIERO.value])
require_planner_up = require_min_role(Role.PLANNER.value)
require_encargado_up = require_min_role(Role.ENCARGADO.value)
require_any_role = require_min_role(Role.OPERADOR.value)  # any authenticated user
