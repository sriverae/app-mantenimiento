# 📱 MANUAL DE USUARIO - Sistema de Gestión de Mantenimiento

Guía rápida para usar la aplicación móvil/web de gestión de mantenimiento.

## 🚀 Inicio Rápido

### 1. Acceder a la Aplicación

**Desde tu móvil o computadora:**
- Abrir navegador (Chrome, Safari, Firefox, Edge)
- Ir a la URL proporcionada por tu administrador:
  - Red local: `http://IP_DEL_SERVIDOR:3000`
  - Internet: `https://tu-url-cloudflare.com`

### 2. Primer Ingreso

Al abrir la app por primera vez:

1. **Seleccionar tu usuario** de la lista (si ya existe)
   - O crear uno nuevo si eres nuevo

2. **Crear nuevo usuario:**
   - Ingresar tu nombre completo
   - Seleccionar tu rol (Técnico, Encargado, etc.)
   - Tocar "Registrar"

3. ¡Listo! Ya estás dentro del sistema

---

## 📋 Funciones Principales

### Dashboard (Pantalla Principal)

Al iniciar sesión verás:

- **Estadísticas del día:**
  - Total de tareas
  - Tareas abiertas, en progreso y completadas
  - Horas trabajadas
  - Número de registros

- **Tareas de hoy:**
  - Lista de tareas programadas para hoy
  - Ver detalles tocando cada tarea

- **Mis tareas asignadas:**
  - Tareas en las que estás participando

---

## ✅ Trabajar con Tareas

### Crear una Nueva Tarea

1. Tocar botón **➕ Nueva Tarea**
2. Completar los datos:
   - **Fecha**: Cuándo se debe realizar
   - **Área**: Ubicación (Producción, Almacén, etc.)
   - **Equipo**: Máquina o equipo específico
   - **Descripción**: Qué se debe hacer
   - **Prioridad**: Alta, Media o Baja
3. Tocar **Crear Tarea**

### Ver Todas las Tareas

1. Ir a la pestaña **📋 Tareas**
2. Usar filtros:
   - **Fecha**: Ver tareas de un día específico
   - **Estado**: Filtrar por Abierta, En Progreso, Completada

### Ver Detalle de una Tarea

1. Tocar cualquier tarea de la lista
2. Verás:
   - Descripción completa
   - Área y equipo
   - Estado y prioridad
   - Miembros asignados
   - Registros de trabajo

### Unirse a una Tarea

1. Abrir el detalle de la tarea
2. Tocar **Unirme a esta Tarea**
3. Ahora podrás registrar horas en esta tarea

### Salir de una Tarea

1. Abrir el detalle de la tarea
2. Tocar **Salir de la Tarea**
3. Confirmar la acción

---

## ⏱️ Registrar Horas de Trabajo

### Crear un Registro

1. Abrir una tarea en la que estés asignado
2. Tocar **⏱️ Registrar Horas**
3. Completar:
   - **Hora de Inicio**: Cuándo empezaste a trabajar
   - **Hora de Fin**: Cuándo terminaste
   - **Notas**: Qué hiciste (opcional)
   - **Repuestos**: Materiales usados (opcional)
4. Tocar **Guardar Registro**

### Ver Mis Registros

1. Ir a la pestaña **⏱️ Mis Registros**
2. Seleccionar período (7, 15, 30 días)
3. Ver:
   - Horas trabajadas por día
   - Tareas en las que trabajaste
   - Notas y repuestos utilizados

### Eliminar un Registro

1. En Mis Registros, tocar el botón **🗑️** del registro
2. Confirmar la eliminación
3. Solo puedes eliminar tus propios registros

---

## 👥 Roles y Permisos

### Técnico / Asistente
- ✅ Ver tareas
- ✅ Unirse a tareas
- ✅ Registrar horas de trabajo
- ✅ Ver sus propios registros
- ❌ No puede crear tareas
- ❌ No puede cerrar días
- ❌ No puede modificar tareas de otros

### Encargado
- ✅ Todo lo del Técnico
- ✅ Crear nuevas tareas
- ✅ Modificar tareas
- ✅ Marcar tareas como completadas
- ❌ No puede cerrar días

### Planner / Ingeniero
- ✅ Control total del sistema
- ✅ Crear y modificar cualquier tarea
- ✅ Cerrar y reabrir días
- ✅ Ver estadísticas de todos
- ✅ Eliminar tareas

---

## 📊 Comprender los Estados

### Estados de Tareas

- **🔵 Abierta**: Tarea nueva, nadie trabajando
- **🟡 En Progreso**: Alguien está trabajando en ella
- **🟢 Completada**: Trabajo finalizado
- **⚫ Cancelada**: Tarea cancelada

### Prioridades

- **🔴 ALTA**: Urgente, atender primero
- **🟡 MEDIA**: Prioridad normal
- **🔵 BAJA**: Puede esperar

---

## 📱 Instalar como Aplicación

### Android (Chrome)

1. Abrir la app en Chrome
2. Tocar los tres puntos (⋮) arriba a la derecha
3. Seleccionar **"Añadir a pantalla de inicio"**
4. Tocar **"Añadir"**
5. ¡La app aparece en tu pantalla de inicio!

### iPhone/iPad (Safari)

1. Abrir la app en Safari
2. Tocar el botón **Compartir** (cuadro con flecha ⬆️)
3. Desplazarse hacia abajo
4. Tocar **"Añadir a pantalla de inicio"**
5. Tocar **"Añadir"**

### Beneficios de Instalar

- ✅ Acceso directo desde tu pantalla de inicio
- ✅ Funciona como app nativa
- ✅ Pantalla completa (sin barra del navegador)
- ✅ Más rápida
- ✅ Funciona parcialmente sin internet

---

## 💡 Consejos y Buenas Prácticas

### Para Técnicos

1. **Registra tus horas el mismo día**
   - Es más fácil recordar qué hiciste
   - Más preciso

2. **Sé específico en las notas**
   - Escribe qué problema encontraste
   - Qué solución aplicaste
   - Facilitará el trabajo futuro

3. **Registra todos los repuestos**
   - Ayuda a controlar inventario
   - Permite planificar compras

### Para Encargados

1. **Crea tareas con descripciones claras**
   - Facilita que los técnicos sepan qué hacer
   - Incluye ubicación exacta

2. **Asigna prioridades correctamente**
   - Alta: solo para emergencias o crítico
   - Media: trabajo normal del día
   - Baja: puede esperar

3. **Revisa los registros diariamente**
   - Verifica que las horas sean razonables
   - Asegúrate que el trabajo esté completo

### Para Todos

1. **Mantén el móvil cargado**
   - Para registrar en el momento

2. **Verifica la conexión**
   - La app necesita internet para funcionar
   - En red local, estar conectado al WiFi

3. **Cierra sesión si compartes el dispositivo**
   - Tocar "Salir" en el menú superior

---

## 🔍 Búsqueda y Filtros

### Filtrar Tareas por Fecha

1. En la página de Tareas
2. Seleccionar la fecha en el filtro
3. Solo se mostrarán tareas de ese día

### Filtrar por Estado

1. En la página de Tareas
2. Seleccionar estado en el dropdown
3. Ver solo tareas abiertas, en progreso, etc.

### Buscar Mis Tareas

1. En Dashboard
2. Sección "Mis Tareas Asignadas"
3. O filtrar en Tareas por las que tengas asignadas

---

## ❓ Preguntas Frecuentes

### ¿Puedo trabajar sin internet?

**Parcialmente**. Si instalaste la app como PWA, algunas funciones básicas funcionan offline, pero para registrar horas o crear tareas necesitas conexión.

### ¿Qué pasa si me equivoco en un registro?

Puedes eliminarlo y crear uno nuevo. Solo puedes eliminar tus propios registros.

### ¿Puedo modificar una tarea después de crearla?

Depende de tu rol. Encargados, Planners e Ingenieros sí pueden. Técnicos no.

### ¿Las horas se calculan automáticamente?

Sí, el sistema calcula automáticamente las horas entre inicio y fin.

### ¿Puedo ver el trabajo de otros técnicos?

Sí, en el detalle de cada tarea puedes ver todos los registros de trabajo de todos los miembros.

### ¿Dónde están mis fotos/evidencias?

Esta versión inicial no incluye fotos. Si tu empresa lo requiere, se puede agregar en una actualización futura.

### ¿Qué pasa si cierro la app sin guardar?

Toda la información se guarda inmediatamente al tocar "Guardar". Si cierras antes, se perderá.

---

## 🆘 Solución de Problemas

### No puedo acceder a la app

1. Verifica tu conexión a internet/WiFi
2. Verifica que la URL sea correcta
3. Pregunta al administrador si el servidor está activo

### La app está lenta

1. Cierra otras apps en tu móvil
2. Recarga la página (deslizar hacia abajo)
3. Revisa tu conexión a internet

### No puedo crear una tarea

Verifica que tu rol te permita crear tareas (Encargado o superior).

### No veo el botón "Registrar Horas"

Primero debes unirte a la tarea tocando "Unirme a esta Tarea".

### Aparece un error al guardar

1. Verifica que todos los campos obligatorios (*) estén completos
2. Verifica que las horas de fin sean posteriores a las de inicio
3. Revisa tu conexión a internet

---

## 📞 Soporte

Para reportar problemas o solicitar ayuda:

1. Contacta a tu supervisor inmediato
2. O al administrador del sistema
3. Describe el problema con detalle:
   - ¿Qué intentabas hacer?
   - ¿Qué pasó?
   - ¿Mensaje de error?

---

## 🎓 Video Tutoriales

*(Próximamente se agregarán videos tutoriales para cada función)*

---

**¡Gracias por usar el Sistema de Gestión de Mantenimiento!** 🔧✨

*Versión 1.0 - Febrero 2026*
