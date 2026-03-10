@echo off
chcp 65001 >nul
color 0A
title Sistema de Gestión de Mantenimiento

echo ╔═══════════════════════════════════════════════════════╗
echo ║   SISTEMA DE GESTIÓN DE MANTENIMIENTO                ║
echo ║   Iniciando servicios...                             ║
echo ╚═══════════════════════════════════════════════════════╝
echo.

REM Verificar si existe el entorno virtual
if not exist "backend\venv\Scripts\activate.bat" (
    echo ⚠️  ADVERTENCIA: Entorno virtual no encontrado
    echo.
    echo Creando entorno virtual...
    cd backend
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r requirements.txt
    cd ..
    echo ✅ Entorno virtual creado
    echo.
)

echo [1/3] 🔧 Iniciando Backend (API)...
start "Mantenimiento - Backend" cmd /k "cd backend && venv\Scripts\activate.bat && python api.py"
timeout /t 5 /nobreak >nul

echo [2/3] 🌐 Iniciando Frontend (Aplicación Web)...
start "Mantenimiento - Frontend" cmd /k "cd frontend && npm start"
timeout /t 10 /nobreak >nul

echo [3/3] ¿Deseas exponer a internet con Cloudflare Tunnel? (S/N)
set /p TUNNEL="Respuesta: "

if /i "%TUNNEL%"=="S" (
    echo 🌍 Iniciando Cloudflare Tunnel...
    start "Mantenimiento - Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000"
    echo.
    echo ✅ Túnel iniciado. Revisa la terminal para obtener la URL pública.
) else (
    echo ⏭️  Túnel omitido. Solo accesible en red local.
)

echo.
echo ╔═══════════════════════════════════════════════════════╗
echo ║   ✅ SISTEMA INICIADO CORRECTAMENTE                   ║
echo ╚═══════════════════════════════════════════════════════╝
echo.
echo 📱 Acceso Local:
echo    - Frontend: http://localhost:3000
echo    - Backend:  http://localhost:8000
echo    - API Docs: http://localhost:8000/docs
echo.
echo 🌐 Acceso en Red Local:
echo    - Encuentra tu IP con: ipconfig
echo    - Usa: http://TU_IP:3000
echo.
echo 💡 IMPORTANTE:
echo    - NO CIERRES ESTA VENTANA
echo    - Mantén las 2-3 ventanas de terminal abiertas
echo    - Para detener: cierra todas las ventanas de terminal
echo.
echo Presiona cualquier tecla para mantener esta ventana abierta...
pause >nul
