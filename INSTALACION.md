# 📖 GUÍA DE INSTALACIÓN PASO A PASO

Esta guía te ayudará a instalar y configurar el Sistema de Gestión de Mantenimiento en tu PC para que funcione como servidor.

## 📋 Tabla de Contenidos

1. [Preparación](#1-preparación)
2. [Instalación del Backend](#2-instalación-del-backend)
3. [Instalación del Frontend](#3-instalación-del-frontend)
4. [Exponer a Internet](#4-exponer-a-internet-gratis)
5. [Uso desde Móvil](#5-uso-desde-móvil)
6. [Mantenimiento](#6-mantenimiento)

---

## 1. Preparación

### 1.1 Instalar Python (para el Backend)

#### Windows:
1. Ir a https://www.python.org/downloads/
2. Descargar Python 3.11 o superior
3. **IMPORTANTE**: Marcar la casilla "Add Python to PATH" durante la instalación
4. Verificar instalación:
   ```cmd
   python --version
   ```

#### Linux/Mac:
```bash
# Verificar si ya está instalado
python3 --version

# Si no está instalado (Ubuntu/Debian):
sudo apt update
sudo apt install python3 python3-pip

# Mac con Homebrew:
brew install python3
```

### 1.2 Instalar Node.js (para el Frontend)

1. Ir a https://nodejs.org/
2. Descargar la versión LTS (recomendada)
3. Instalar siguiendo el asistente
4. Verificar instalación:
   ```cmd
   node --version
   npm --version
   ```

### 1.3 Descargar el Proyecto

Extraer la carpeta `maintenance-app` en una ubicación de tu PC, por ejemplo:
- Windows: `C:\Users\TuNombre\maintenance-app`
- Linux/Mac: `/home/tunombre/maintenance-app`

---

## 2. Instalación del Backend

### 2.1 Abrir Terminal en la Carpeta del Backend

#### Windows:
1. Abrir el Explorador de Archivos
2. Navegar a `maintenance-app\backend`
3. En la barra de dirección, escribir `cmd` y presionar Enter

#### Linux/Mac:
```bash
cd /ruta/a/maintenance-app/backend
```

### 2.2 Crear Entorno Virtual (Recomendado)

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

Verás `(venv)` al inicio de la línea de comandos.

### 2.3 Instalar Dependencias

```bash
pip install -r requirements.txt
```

Esto instalará: FastAPI, SQLAlchemy, Uvicorn, etc.

### 2.4 Configurar Variables de Entorno

```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

El archivo `.env` ya está configurado por defecto. No necesitas modificarlo.

### 2.5 Iniciar el Backend

```bash
python api.py
```

Deberías ver:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
✅ Base de datos inicializada
```

**¡El backend está corriendo!** Mantén esta ventana abierta.

Para verificar, abre tu navegador y ve a: http://localhost:8000
Deberías ver: `{"message":"Maintenance App API","version":"1.0.0"}`

---

## 3. Instalación del Frontend

### 3.1 Abrir Nueva Terminal en la Carpeta del Frontend

**IMPORTANTE**: No cierres la terminal del backend. Abre una NUEVA terminal.

#### Windows:
1. Abrir el Explorador de Archivos
2. Navegar a `maintenance-app\frontend`
3. En la barra de dirección, escribir `cmd` y presionar Enter

#### Linux/Mac:
```bash
# En una nueva terminal
cd /ruta/a/maintenance-app/frontend
```

### 3.2 Instalar Dependencias

```bash
npm install
```

Esto tardará unos minutos. Descargará React y todas las dependencias necesarias.

### 3.3 Configurar Variables de Entorno

```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

El archivo `.env` debe contener:
```
REACT_APP_API_URL=http://localhost:8000
```

### 3.4 Iniciar el Frontend

```bash
npm start
```

Se abrirá automáticamente tu navegador en: http://localhost:3000

**¡La aplicación está funcionando!** 🎉

---

## 4. Exponer a Internet (GRATIS)

Para que otros puedan acceder desde sus móviles fuera de tu red local, necesitas exponer tu servidor a internet.

### Opción A: Cloudflare Tunnel (Recomendado - 100% Gratis)

#### 4.1 Instalar Cloudflare Tunnel

**Windows:**
1. Descargar desde: https://github.com/cloudflare/cloudflared/releases
2. Descargar `cloudflared-windows-amd64.exe`
3. Renombrar a `cloudflared.exe`
4. Mover a una carpeta en PATH o usar ruta completa

**Linux:**
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared
```

**Mac:**
```bash
brew install cloudflare/cloudflare/cloudflared
```

#### 4.2 Crear Túnel

```bash
cloudflared tunnel --url http://localhost:3000
```

Verás algo como:
```
Your quick Tunnel has been created! Visit it at:
https://random-words-1234.trycloudflare.com
```

**¡Esa es tu URL pública!** Compártela con tu equipo. La URL cambia cada vez que reinicias el túnel.

#### 4.3 Mantener el Túnel Activo

Para que el túnel esté siempre activo, puedes:

1. **Crear un túnel permanente** (requiere cuenta gratis de Cloudflare):
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create maintenance
   cloudflared tunnel route dns maintenance app.tudominio.com
   ```

2. **O ejecutarlo en segundo plano**:
   ```bash
   # Windows (PowerShell)
   Start-Process cloudflared -ArgumentList "tunnel --url http://localhost:3000" -WindowStyle Hidden
   
   # Linux/Mac
   nohup cloudflared tunnel --url http://localhost:3000 &
   ```

### Opción B: ngrok (Alternativa - Gratis con límites)

1. Registrarse en https://ngrok.com (gratis)
2. Descargar ngrok
3. Ejecutar:
   ```bash
   ngrok http 3000
   ```

**Nota**: La versión gratis de ngrok tiene un límite de conexiones por mes.

---

## 5. Uso desde Móvil

### 5.1 Acceso en Red Local (Sin Internet)

Si estás en la misma red WiFi que tu PC:

1. **Obtener IP de tu PC**:
   
   **Windows:**
   ```cmd
   ipconfig
   ```
   Buscar "Dirección IPv4" (ej: 192.168.1.100)
   
   **Linux/Mac:**
   ```bash
   ifconfig
   # o
   ip addr show
   ```

2. **En tu móvil**:
   - Conectarte a la misma red WiFi
   - Abrir navegador
   - Ir a: `http://TU_IP:3000` (ej: http://192.168.1.100:3000)

### 5.2 Instalar como Aplicación (PWA)

#### Android (Chrome):
1. Abrir la app en Chrome
2. Tocar los tres puntos (⋮)
3. Seleccionar "Añadir a pantalla de inicio"
4. Tocar "Añadir"
5. ¡La app aparecerá en tu pantalla de inicio!

#### iOS (Safari):
1. Abrir la app en Safari
2. Tocar el botón "Compartir" (cuadro con flecha)
3. Desplazarse y tocar "Añadir a pantalla de inicio"
4. Tocar "Añadir"

### 5.3 Actualizar URL del Backend (Si usas Cloudflare/ngrok)

Si expusiste tu backend a internet, necesitas actualizar la URL en el frontend:

1. Editar `frontend/.env`:
   ```
   REACT_APP_API_URL=https://tu-url-de-cloudflare.com
   ```

2. Reiniciar el frontend:
   ```bash
   # Detener con Ctrl+C
   npm start
   ```

---

## 6. Mantenimiento

### 6.1 Iniciar el Sistema Diariamente

Necesitarás iniciar ambos servidores cada vez que reinicies tu PC:

**Terminal 1 - Backend:**
```bash
cd maintenance-app/backend
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

python api.py
```

**Terminal 2 - Frontend:**
```bash
cd maintenance-app/frontend
npm start
```

**Terminal 3 (Opcional) - Túnel:**
```bash
cloudflared tunnel --url http://localhost:3000
```

### 6.2 Script de Inicio Automático (Windows)

Crear un archivo `start.bat` en `maintenance-app`:

```batch
@echo off
echo Iniciando Sistema de Mantenimiento...

start "Backend" cmd /k "cd backend && venv\Scripts\activate && python api.py"
timeout /t 5
start "Frontend" cmd /k "cd frontend && npm start"
timeout /t 10
start "Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000"

echo Sistema iniciado!
pause
```

Doble clic en `start.bat` para iniciar todo.

### 6.3 Script de Inicio Automático (Linux/Mac)

Crear un archivo `start.sh` en `maintenance-app`:

```bash
#!/bin/bash
echo "Iniciando Sistema de Mantenimiento..."

# Backend
cd backend
source venv/bin/activate
python api.py &
BACKEND_PID=$!

# Esperar 5 segundos
sleep 5

# Frontend
cd ../frontend
npm start &
FRONTEND_PID=$!

# Túnel (opcional)
sleep 10
cloudflared tunnel --url http://localhost:3000 &
TUNNEL_PID=$!

echo "Sistema iniciado!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Tunnel PID: $TUNNEL_PID"
echo "Presiona Ctrl+C para detener todo"

wait
```

Dar permisos y ejecutar:
```bash
chmod +x start.sh
./start.sh
```

### 6.4 Detener el Sistema

1. Cerrar las terminales del Backend y Frontend
2. O presionar `Ctrl+C` en cada terminal

### 6.5 Respaldo de la Base de Datos

La base de datos está en: `backend/db.sqlite3`

Para hacer un respaldo:
```bash
# Windows
copy backend\db.sqlite3 backup\db_backup_FECHA.sqlite3

# Linux/Mac
cp backend/db.sqlite3 backup/db_backup_$(date +%Y%m%d).sqlite3
```

**Recomendación**: Hacer respaldos semanales.

---

## 🆘 Solución de Problemas Comunes

### Problema: "Python no se reconoce como comando"
**Solución**: Reinstalar Python marcando "Add to PATH" o agregar manualmente a PATH.

### Problema: "npm no se reconoce como comando"
**Solución**: Reinstalar Node.js o reiniciar la terminal después de la instalación.

### Problema: "Error: port 8000 is already in use"
**Solución**: Ya hay un proceso usando el puerto 8000. Matar el proceso o cambiar el puerto en `api.py`.

### Problema: No puedo acceder desde mi móvil
**Solución**: 
1. Verificar que estás en la misma red WiFi
2. Desactivar firewall temporalmente
3. Usar la IP correcta (no 127.0.0.1 ni localhost)

### Problema: La base de datos está corrupta
**Solución**:
```bash
cd backend
# Renombrar la base de datos actual
mv db.sqlite3 db.sqlite3.old
# Reiniciar el backend (creará una nueva)
python api.py
```

---

## ✅ Lista de Verificación

- [ ] Python instalado (>= 3.8)
- [ ] Node.js instalado (>= 14)
- [ ] Backend iniciado sin errores
- [ ] Frontend iniciado y abre en navegador
- [ ] Puedo crear un usuario
- [ ] Puedo crear una tarea
- [ ] (Opcional) Túnel configurado
- [ ] Acceso desde móvil funcionando
- [ ] App instalada en pantalla de inicio

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los mensajes de error en las terminales
2. Consulta la sección de solución de problemas
3. Verifica que todos los pasos se siguieron correctamente

**¡Felicidades! Tu sistema está funcionando.** 🎉

Para aprender a usar la aplicación, consulta el manual de usuario (próximamente).
