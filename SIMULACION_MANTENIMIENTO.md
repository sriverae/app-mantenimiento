# Simulacion integral multirol de mantenimiento

- Base aislada: `D:\bots\maintenance-app\backend\simulation_maintenance_20260421_173841.sqlite3`
- Fecha de referencia: `2026-04-21`
- Clave comun de usuarios simulados: `Simula1234!`

## Usuarios simulados

- `ing_sim` / `Simula1234!` / INGENIERO / Ingrid Vargas Jefa Mantto
- `planner_sim` / `Simula1234!` / PLANNER / Paolo Medina Planner
- `enc_mec` / `Simula1234!` / ENCARGADO / Carlos Salazar Encargado Mecanico
- `enc_ele` / `Simula1234!` / ENCARGADO / Rosa Villanueva Encargada Electrica
- `tec_mcruz` / `Simula1234!` / TECNICO / Manuel de la Cruz Jimenez
- `tec_halauce` / `Simula1234!` / TECNICO / Hernan Alauce Alarcon
- `tec_jperez` / `Simula1234!` / TECNICO / Juan Perez Huaman
- `tec_lquispe` / `Simula1234!` / TECNICO / Luis Quispe Torres
- `tec_atorres` / `Simula1234!` / TECNICO / Ana Torres Rios
- `sup_kt` / `Simula1234!` / SUPERVISOR / Kiara Tenorio Supervisora
- `ope_rl` / `Simula1234!` / OPERADOR / Ruben Lopez Operador

## Datos cargados

- RRHH: 9 registros, incluyendo 5 tecnicos propios, 2 encargados y 2 terceros.
- Equipos: 10 equipos con despiece para AMEF.
- Paquetes PM: 10.
- Cronogramas por fecha: 10.
- Planes Km/Hr: 5.
- Materiales: 15 con stock y costo unitario.
- OT activas: 10 (Creada: 2, Liberada: 4, Pendiente: 3, Solicitud de cierre: 1).
- OT cerradas historicas: 10.
- Notificaciones de trabajo activas: 6.
- Avisos de mantenimiento: 10.
- Registros AMEF: 20.

## Flujos simulados

- Ingeniero: revisa AMEF, costos historicos, cierre tecnico y PDF de OT cerradas.
- Planner: revisa itinerario, asistencia, avisos, cronograma y contadores Km/Hr.
- Encargados: crean, reprograman, liberan y solicitan cierre de OT.
- Tecnicos: registran notificaciones de trabajo con materiales y horas.
- Supervisor/Operador: crean avisos de mantenimiento y consultan historial.

## Hallazgos detectados

- Cierre OT: 1 notificacion(es) de servicio no tienen costo; deben bloquear el cierre.
- Notificaciones: 1 registro(s) tienen inconsistencia de fecha; deben quedar visibles.

## Riesgos funcionales que conviene abordar

- Concurrencia: varios modulos guardan documentos completos con PUT. Si dos usuarios editan al mismo tiempo el mismo documento, el ultimo guardado puede pisar cambios del primero. Recomendacion: agregar version/updated_at por documento u operaciones PATCH por entidad.
- Numeracion OT: la numeracion correlativa sigue dependiendo de lectura y escritura de un documento compartido. En uso simultaneo real, dos liberaciones al mismo tiempo podrian solicitar el mismo siguiente numero. Recomendacion: endpoint transaccional backend para asignar numero OT.
- Stock: la reserva/consumo de materiales tambien se calcula desde documentos completos. Recomendacion: endpoint transaccional para notificacion de trabajo + descuento/reversion de stock.
- Configuracion: en PostgreSQL se necesitaba `settings.value` como TEXT para soportar JSON grande. Esta simulacion deja preparado el modelo y migracion.

## Como usar la base simulada

En PowerShell, para arrancar backend contra esta base:

```powershell
$env:DATABASE_URL='sqlite+aiosqlite:///D:/bots/maintenance-app/backend/simulation_maintenance_20260421_173841.sqlite3'
cd backend
uvicorn api:app --reload
```

Luego inicia el frontend normalmente y entra con cualquiera de los usuarios simulados.
