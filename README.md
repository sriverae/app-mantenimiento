# 🔧 Sistema de Gestión de Mantenimiento - Aplicación Móvil (PWA)

Sistema completo de gestión de mantenimiento con interfaz web progresiva (PWA) que se puede instalar en dispositivos móviles.

## 📋 Descripción

Este proyecto convierte tu bot de Telegram en una aplicación web moderna que funciona en:
- ✅ Navegadores web (Chrome, Firefox, Safari, Edge)
- ✅ Dispositivos móviles (Android e iOS)
- ✅ Se puede instalar como aplicación nativa
- ✅ Funciona offline (con limitaciones)

## 🏗️ Arquitectura

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   App Móvil     │ ←──→ │   Backend API   │ ←──→ │  Base de Datos  │
│   (React PWA)   │      │   (FastAPI)     │      │   (SQLite)      │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

## 📁 Estructura del Proyecto

```
maintenance-app/
├── backend/              # API REST en Python (FastAPI)
│   ├── api.py           # Endpoints de la API
│   ├── db.py            # Configuración de base de datos
│   ├── models.py        # Modelos SQLAlchemy
│   ├── requirements.txt # Dependencias Python
│   └── .env.example     # Configuración de ejemplo
│
└── frontend/            # Aplicación web (React PWA)
    ├── public/          # Archivos estáticos
    │   ├── index.html
    │   ├── manifest.json
    │   └── service-worker.js
    ├── src/
    │   ├── pages/       # Páginas de la app
    │   ├── services/    # Comunicación con API
    │   ├── App.js       # Componente principal
    │   └── index.js     # Punto de entrada
    └── package.json     # Dependencias Node.js
```

## 🚀 Características

### Backend (API)
- ✅ Gestión de usuarios y roles
- ✅ CRUD completo de tareas
- ✅ Registro de horas de trabajo
- ✅ Evidencias fotográficas
- ✅ Estadísticas y reportes
- ✅ Control de días (abrir/cerrar)

### Frontend (PWA)
- ✅ Dashboard con estadísticas
- ✅ Lista y creación de tareas
- ✅ Detalle de tareas con registros
- ✅ Registro de horas de trabajo
- ✅ Interfaz responsive (móvil y desktop)
- ✅ Instalable como app nativa
- ✅ Navegación inferior en móvil

## 💻 Requisitos del Sistema

### Para el Backend (Tu PC/Servidor)
- Python 3.8 o superior
- 2 GB RAM mínimo
- Windows, Linux o macOS

### Para los Usuarios (Móvil/Desktop)
- Navegador moderno (Chrome, Firefox, Safari, Edge)
- Conexión a internet
- No requiere instalación desde tiendas

## 📦 Instalación

Ver el archivo `INSTALACION.md` para instrucciones detalladas paso a paso.

Resumen rápido:

1. **Backend:**
   ```bash
   cd backend
   pip install -r requirements.txt
   cp .env.example .env
   python api.py
   ```

2. **Frontend:**
   ```bash
   cd frontend
   npm install
   cp .env.example .env
   npm start
   ```

3. **Exponer a internet:**
   - Usar Cloudflare Tunnel (gratis) o ngrok
   - Ver guía en `INSTALACION.md`

## 🌐 Acceso

- **Backend API:** http://localhost:8000
- **Frontend Web:** http://localhost:3000
- **Documentación API:** http://localhost:8000/docs

## 👥 Roles de Usuario

- **INGENIERO**: Control total del sistema
- **PLANNER**: Planificación y supervisión
- **ENCARGADO**: Gestión de equipo
- **TECNICO**: Ejecución de tareas
- **ASISTENTE**: Soporte

## 🔒 Seguridad

- No hay autenticación compleja por simplicidad
- Los usuarios se auto-seleccionan al entrar
- Recomendado solo para redes internas o VPN
- Para producción, agregar autenticación JWT

## 📱 Instalación como PWA

### En Android (Chrome):
1. Abrir la app en Chrome
2. Menú → "Añadir a pantalla de inicio"
3. La app aparecerá como aplicación nativa

### En iOS (Safari):
1. Abrir la app en Safari
2. Tocar el botón "Compartir"
3. "Añadir a pantalla de inicio"

## 🛠️ Desarrollo

### Backend
```bash
cd backend
python api.py  # Modo desarrollo con auto-reload
```

### Frontend
```bash
cd frontend
npm start  # Servidor de desarrollo en puerto 3000
```

## 📊 API Endpoints Principales

- `GET /api/tasks/` - Listar tareas
- `POST /api/tasks/` - Crear tarea
- `GET /api/tasks/{id}` - Detalle de tarea
- `POST /api/worklogs/` - Registrar horas
- `GET /api/stats/today` - Estadísticas del día

Ver documentación completa en: http://localhost:8000/docs

## 🐛 Solución de Problemas

### El backend no inicia
- Verificar que Python está instalado: `python --version`
- Verificar que las dependencias están instaladas
- Revisar el archivo `.env`

### El frontend no carga
- Verificar que Node.js está instalado: `node --version`
- Ejecutar `npm install` de nuevo
- Verificar que el backend esté corriendo

### No puedo acceder desde mi móvil
- Verificar que estés en la misma red WiFi
- Usar la IP local de tu PC en lugar de localhost
- O configurar Cloudflare Tunnel

## 📄 Licencia

Este proyecto es de código abierto para uso interno.

## 👨‍💻 Soporte

Para reportar problemas o sugerencias, contacta al administrador del sistema.

---

**¡Gracias por usar el Sistema de Gestión de Mantenimiento!** 🔧✨
