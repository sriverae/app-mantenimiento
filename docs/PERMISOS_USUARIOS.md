# Documento de permisos por nivel de usuario

Actualizado: 2026-05-07

Este documento describe los permisos actuales del sistema de mantenimiento. La regla mas importante es que hay dos capas:

1. **Interfaz web:** muestra u oculta menus, botones y acciones segun el rol.
2. **Servidor:** valida el permiso real al leer o guardar informacion. Si una pantalla mostrara una accion por error, el servidor puede bloquear el guardado.

La fuente de verdad para guardados criticos es el servidor.

## 1. Jerarquia de roles

La jerarquia actual, de mayor a menor, es:

| Nivel | Rol | Descripcion operativa |
| --- | --- | --- |
| 6 | INGENIERO | Control maximo del sistema, configuracion avanzada, importaciones, historial cerrado y usuarios. |
| 5 | PLANNER | Planificacion, control, asistencia, cierre/revision de OT y configuraciones operativas. |
| 4 | ENCARGADO | Gestion operativa, equipos, planes PMP, AMEF, OT activas y supervision de tecnicos. |
| 3 | TECNICO | Ejecucion de trabajo, registros/notificaciones, evidencias y consulta operativa. |
| 2 | SUPERVISOR | Rol principalmente de consulta; puede crear avisos de mantenimiento. |
| 1 | OPERADOR | Rol principalmente de consulta; puede crear avisos de mantenimiento. |

Los roles **SUPERVISOR** y **OPERADOR** son tratados como roles de solo lectura en la mayor parte de modulos, salvo en avisos de mantenimiento.

## 2. Acceso general a paginas

| Modulo / ruta | Rol minimo para entrar |
| --- | --- |
| Dashboard | Cualquier usuario autenticado |
| Indicadores | OPERADOR |
| Notificaciones de Trabajo | Cualquier usuario autenticado |
| Mis registros / worklogs | Cualquier usuario autenticado |
| RRHH: personal propio, tercero, asistencia e historial | OPERADOR |
| Materiales | OPERADOR |
| PMP: equipos | OPERADOR |
| PMP: planes por fecha | OPERADOR |
| PMP: planes por km | OPERADOR |
| PMP: paquetes | OPERADOR |
| PMP: gestion de OT | OPERADOR |
| PMP: avisos de mantenimiento | OPERADOR |
| PMP: historial de OT | OPERADOR |
| PMP: calendario | OPERADOR |
| PMP: AMEF | OPERADOR |
| PMP: bajas e historial | OPERADOR |
| PMP: intercambios e historial | OPERADOR |
| Historial de contadores | INGENIERO |
| Centro de control | PLANNER |
| Analitica ejecutiva | PLANNER |
| Eventos operativos | PLANNER |
| Bitacora ejecutiva | PLANNER |
| Configuracion: listas desplegables | PLANNER |
| Configuracion: formato PDF OT | PLANNER |
| Configuracion: ordenes de trabajo | INGENIERO |
| Configuracion: contadores | INGENIERO |
| Configuracion: importaciones masivas | INGENIERO |
| Usuarios | ENCARGADO para entrar, pero acciones criticas dependen del servidor |

## 3. Permisos reales de documentos compartidos

Estos permisos son los que aplica el servidor al guardar documentos JSON compartidos:

| Documento / modulo de datos | Leer desde | Escribir desde |
| --- | --- | --- |
| Personal RRHH | OPERADOR | INGENIERO |
| Asistencia RRHH | OPERADOR | PLANNER |
| Listas desplegables | OPERADOR | PLANNER |
| Materiales | OPERADOR | INGENIERO |
| Columnas de equipos | OPERADOR | ENCARGADO |
| Inventario de equipos | OPERADOR | ENCARGADO |
| Historial de intercambios | OPERADOR | ENCARGADO |
| AMEF | OPERADOR | ENCARGADO |
| Plan PMP por fechas | OPERADOR | ENCARGADO |
| Plan PMP por km | OPERADOR | ENCARGADO |
| Historial de contadores km | OPERADOR | ENCARGADO |
| Paquetes de mantenimiento | OPERADOR | ENCARGADO |
| Avisos de mantenimiento | OPERADOR | OPERADOR |
| Bitacora ejecutiva / auditoria | OPERADOR | TECNICO |
| Alertas / OT activas | OPERADOR | ENCARGADO |
| OT eliminadas | OPERADOR | ENCARGADO |
| Correlativo / secuencia de OT | OPERADOR | INGENIERO |
| Historial de OT cerradas | OPERADOR | ENCARGADO, con restriccion especial |
| Notificaciones / reportes de trabajo OT | OPERADOR | TECNICO |
| Formato PDF OT | OPERADOR | PLANNER |
| Historial de bajas | OPERADOR | ENCARGADO |

### Restriccion especial del historial de OT cerradas

Aunque ENCARGADO y superiores pueden escribir en el documento de historial, existe una regla adicional:

- **INGENIERO** puede modificar o eliminar una OT ya cerrada en el historial.
- Roles menores a INGENIERO solo pueden anexar informacion nueva sin alterar registros cerrados existentes.
- Si un rol menor intenta modificar o eliminar una OT cerrada, el servidor responde con bloqueo.

## 4. Permisos por rol

### INGENIERO

Puede:

- Entrar a todos los modulos visibles del sistema.
- Crear, editar, aprobar, rechazar, activar, desactivar y administrar usuarios segun reglas de jerarquia.
- Aprobar usuarios pendientes y cambiar el rol al aprobarlos.
- Configurar ordenes de trabajo, correlativos y contadores.
- Ejecutar importaciones masivas: historial OT, cronograma, equipos, paquetes, materiales y personal/usuarios.
- Editar el historial de OT cerradas.
- Modificar o eliminar una OT cerrada en historial.
- Gestionar materiales desde el servidor.
- Gestionar RRHH desde el servidor.
- Gestionar control, analitica, eventos operativos y bitacora.
- Gestionar equipos, planes, paquetes, AMEF, bajas e intercambios.
- En Notificaciones de Trabajo:
  - Ver OT liberadas y solicitudes de cierre.
  - Editar OT liberadas.
  - Reprogramar OT liberadas.
  - Crear notificaciones de trabajo.
  - Crear notificaciones de servicio de terceros.
  - Solicitar cierre.
  - Devolver una solicitud de cierre a Liberada.
  - Cerrar OT.
  - Ocultar o mostrar OT liberadas para tecnicos/encargados.
- En Gestion de OT:
  - Crear OT.
  - Liberar OT pendiente/creada, salvo si esta vencida sin reprogramar.
  - Editar OT solo si esta Liberada.
  - Reprogramar OT Pendiente, Creada o Liberada.
  - Devolver solicitud de cierre a Liberada.
  - Cerrar OT.
  - Eliminar OT activas.
- Crear, revisar, aceptar y rechazar avisos de mantenimiento.

No debe:

- Saltarse las validaciones tecnicas del cierre de OT.
- Liberar directamente una OT vencida sin reprogramarla primero.

### PLANNER

Puede:

- Entrar a Dashboard, Indicadores, Control, Analitica, Eventos operativos y Bitacora.
- Entrar a configuraciones de listas desplegables y formato PDF OT.
- Gestionar asistencia de RRHH.
- Gestionar listas desplegables.
- Gestionar formato PDF OT.
- Gestionar equipos, planes, paquetes, AMEF, bajas, intercambios y OT activas si el servidor lo permite por nivel minimo de documento.
- En Notificaciones de Trabajo:
  - Ver OT liberadas y solicitudes de cierre.
  - Editar OT liberadas.
  - Reprogramar OT liberadas.
  - Crear notificaciones de trabajo.
  - Crear notificaciones de servicio de terceros.
  - Solicitar cierre.
  - Devolver solicitud de cierre a Liberada.
  - Cerrar OT.
  - Ocultar o mostrar OT liberadas para tecnicos/encargados.
- En Gestion de OT:
  - Crear OT.
  - Liberar OT pendiente/creada, salvo si esta vencida sin reprogramar.
  - Editar OT solo si esta Liberada.
  - Reprogramar OT Pendiente, Creada o Liberada.
  - Devolver solicitud de cierre a Liberada.
  - Cerrar OT.
  - Eliminar OT activas.
- Crear, revisar, aceptar y rechazar avisos de mantenimiento.
- Cerrar y reabrir dias del modulo de tareas diario.

No puede:

- Entrar a configuracion de ordenes de trabajo.
- Entrar a configuracion de contadores.
- Ejecutar importaciones masivas.
- Modificar o eliminar OT ya cerradas en historial.
- Crear usuarios desde el servidor.
- Aprobar usuarios pendientes.
- Cambiar roles de usuarios.

### ENCARGADO

Puede:

- Entrar a modulos operativos PMP y de consulta.
- Gestionar equipos, columnas de equipos, planes por fecha, planes por km, paquetes, AMEF, bajas e intercambios.
- Escribir en OT activas y documentos operativos que requieren ENCARGADO.
- Entrar a Usuarios, pero las acciones criticas reales dependen del servidor y de la jerarquia.
- En Notificaciones de Trabajo:
  - Ver OT liberadas que no esten ocultas para campo.
  - Crear notificaciones de trabajo.
  - Crear notificaciones de servicio de terceros.
  - Editar OT liberadas.
  - Reprogramar OT liberadas.
  - Solicitar cierre.
- En Gestion de OT:
  - Crear OT.
  - Liberar OT pendiente/creada, salvo si esta vencida sin reprogramar.
  - Editar OT solo si esta Liberada.
  - Reprogramar OT Pendiente, Creada o Liberada.
  - Eliminar OT activas.
- Crear, revisar, aceptar y rechazar avisos de mantenimiento.
- Publicar, actualizar, reabrir y ocultar tareas del modulo diario.
- Asignar o remover otros usuarios en tareas.

No puede:

- Cerrar OT desde solicitud de cierre si la accion esta restringida a PLANNER/INGENIERO en Notificaciones.
- Devolver solicitud de cierre desde Notificaciones si la accion esta restringida a PLANNER/INGENIERO.
- Ocultar OT liberadas para tecnicos/encargados; esa accion esta reservada a PLANNER/INGENIERO.
- Modificar o eliminar OT cerradas en historial.
- Gestionar importaciones masivas.
- Configurar correlativos de OT o contadores.
- Gestionar materiales o RRHH si el servidor exige INGENIERO.

### TECNICO

Puede:

- Entrar a Dashboard, Indicadores y modulos de consulta basicos.
- Ver Notificaciones de Trabajo asignadas a el.
- Usar el boton para ver OT de companeros cuando aplique.
- Asignarse una OT de companero en la vista correspondiente si esta liberada y no asignada a el.
- Registrar notificaciones de trabajo en OT Liberada asignada.
- Editar o eliminar sus propias notificaciones de trabajo mientras la OT no este en Solicitud de cierre.
- Subir evidencias y archivos permitidos.
- Registrar worklogs / horas en tareas a las que tiene acceso.
- Ver sus propios registros.
- Crear avisos de mantenimiento.

No puede:

- Crear OT.
- Liberar OT.
- Editar OT liberada a nivel de cabecera.
- Reprogramar OT.
- Solicitar cierre, salvo que una regla futura lo habilite; actualmente esta reservado a PLANNER/ENCARGADO/INGENIERO.
- Cerrar OT.
- Devolver OT a Liberada.
- Crear notificaciones de servicio de terceros.
- Ver solicitudes de cierre como cola de aprobacion.
- Modificar notificaciones de otros tecnicos.
- Editar notificaciones si la OT esta en Solicitud de cierre.
- Ver tareas en borrador.
- Gestionar usuarios, materiales, RRHH, equipos, AMEF, planes, paquetes, importaciones o configuraciones.

### SUPERVISOR

Puede:

- Entrar a paginas de consulta permitidas por rol minimo OPERADOR.
- Ver Dashboard, Indicadores, Equipos, Planes, Historial OT, RRHH, Materiales y otros modulos de consulta.
- Crear avisos de mantenimiento.
- Ver solo sus propios avisos cuando actua como creador sin permisos de revision.
- Consultar informacion operativa.

No puede:

- Editar la mayoria de modulos, porque es rol de solo lectura.
- Revisar, aceptar o rechazar avisos.
- Crear, liberar, reprogramar, cerrar o eliminar OT.
- Registrar notificaciones de trabajo.
- Gestionar usuarios.
- Gestionar configuraciones o importaciones.

### OPERADOR

Puede:

- Entrar a paginas de consulta permitidas por rol minimo OPERADOR.
- Ver Dashboard, Indicadores, Equipos, Planes, Historial OT, RRHH, Materiales y otros modulos de consulta.
- Crear avisos de mantenimiento.
- Ver solo sus propios avisos cuando actua como creador sin permisos de revision.

No puede:

- Editar la mayoria de modulos, porque es rol de solo lectura.
- Revisar, aceptar o rechazar avisos.
- Crear, liberar, reprogramar, cerrar o eliminar OT.
- Registrar notificaciones de trabajo.
- Gestionar usuarios.
- Gestionar configuraciones o importaciones.

## 5. Permisos por modulo funcional

### Dashboard

- Todos los usuarios autenticados pueden verlo.
- PLANNER e INGENIERO ven itinerarios diarios de gestion.
- SUPERVISOR y OPERADOR tienen enfoque de consulta y avisos.

### Indicadores

- Todos los usuarios desde OPERADOR pueden entrar.
- La pantalla calcula indicadores por periodo y por equipo.
- No es una pantalla principal de edicion operativa.

### Gestion de OT

Estados relevantes:

- Pendiente / Creada.
- Liberada.
- Solicitud de cierre.
- Cerrada, migrada al historial.

Reglas:

- Una OT Pendiente o Creada no vencida permanece visualmente blanca.
- Una OT Pendiente o Creada vencida se muestra en rojo suave.
- Una OT vencida sin liberar no puede liberarse directamente: primero debe reprogramarse.
- Al reprogramar una OT vencida, se conserva el historial de reprogramaciones.
- Al cerrar OT, la continuidad de operacion pregunta que paso entre la fecha vencida y la ultima reprogramacion.
- Una OT Liberada se muestra en verde suave.
- Una OT en Solicitud de cierre se muestra en naranja suave.
- Editar OT solo aplica cuando esta Liberada.
- Cerrar OT solo aplica cuando esta en Solicitud de cierre.

### Notificaciones de Trabajo

Reglas por rol:

- TECNICO ve principalmente sus OT asignadas.
- TECNICO puede cambiar a vista de companeros cuando aplique.
- TECNICO registra trabajo solo en OT Liberada y, normalmente, sobre OT asignadas o asumidas.
- TECNICO solo puede modificar sus propios registros de trabajo.
- PLANNER, ENCARGADO e INGENIERO pueden crear reportes de servicio de terceros.
- PLANNER, ENCARGADO e INGENIERO pueden editar y reprogramar OT Liberadas desde esta pantalla.
- PLANNER, ENCARGADO e INGENIERO pueden solicitar cierre.
- PLANNER e INGENIERO pueden devolver a Liberada o cerrar una Solicitud de cierre.
- PLANNER e INGENIERO pueden ocultar/mostrar OT Liberadas para personal de campo.

Bloqueos:

- Si la OT esta en Solicitud de cierre, ya no se editan ni eliminan notificaciones de trabajo.
- Para cerrar OT se validan costos, continuidad, cierre tecnico y reglas vigentes.

### Avisos de mantenimiento

- Cualquier usuario autenticado puede crear avisos.
- SUPERVISOR y OPERADOR son creadores, pero no revisores; ven principalmente sus avisos.
- ENCARGADO, PLANNER e INGENIERO pueden revisar, aceptar o rechazar avisos.
- Al aceptar avisos se puede relacionar con OT segun flujo operativo.

### Historial de OT

- Todos desde OPERADOR pueden consultar.
- Exportacion y visualizacion dependen de la pantalla.
- Solo INGENIERO puede modificar o eliminar una OT cerrada ya existente.
- Roles menores pueden anexar nuevas OT cerradas cuando el flujo operativo lo permite, pero no alterar registros existentes.

### RRHH y asistencia

- Personal RRHH: lectura desde OPERADOR; escritura real en servidor desde INGENIERO.
- Asistencia: lectura desde OPERADOR; escritura desde PLANNER.
- El historial de asistencia es consultable desde OPERADOR.

### Materiales

- Lectura desde OPERADOR.
- Escritura real desde INGENIERO.
- SUPERVISOR y OPERADOR quedan en modo solo lectura.

### Equipos

- Lectura desde OPERADOR.
- Escritura desde ENCARGADO.
- Incluye inventario, columnas dinamicas, fotos/manuales/anexos de equipos segun datos guardados en servidor.

### Planes PMP por fecha y por km

- Lectura desde OPERADOR.
- Escritura desde ENCARGADO.
- Historial de contadores esta como pagina exclusiva para INGENIERO, aunque el documento de historial de contadores permite escritura desde ENCARGADO en la capa de documento.

### Paquetes de mantenimiento

- Lectura desde OPERADOR.
- Escritura desde ENCARGADO.
- Listas desplegables internas pueden requerir PLANNER para gestionarlas.

### AMEF

- Lectura desde OPERADOR.
- Escritura desde ENCARGADO.
- Modos de falla solo deben asociarse a componentes.
- SUPERVISOR y OPERADOR consultan, pero no editan.

### Intercambios y bajas

- Lectura desde OPERADOR.
- Escritura desde ENCARGADO.
- Historiales asociados tambien se guardan bajo permiso de ENCARGADO.

### Control, analitica, eventos operativos y bitacora

- Acceso desde PLANNER.
- PLANNER e INGENIERO pueden revisar gestion ejecutiva, eventos, auditoria y analitica.
- Eventos operativos alimentan itinerarios y registros historicos.

### Configuraciones

- Listas desplegables: PLANNER.
- Formato PDF OT: PLANNER.
- Ordenes de trabajo / correlativos: INGENIERO.
- Contadores: INGENIERO.
- Importaciones masivas: INGENIERO.

### Usuarios

Reglas de servidor:

- Crear usuario directamente: INGENIERO.
- Ver usuarios: ENCARGADO o superior.
- Ver usuarios pendientes: INGENIERO.
- Aprobar o rechazar usuarios pendientes: INGENIERO.
- Editar usuario: INGENIERO.
- Resetear contrasena: ENCARGADO o superior, pero solo si el objetivo tiene rol inferior.
- Nadie puede gestionar usuarios de igual o mayor jerarquia que el propio.

Regla de UI:

- La pagina de usuarios aparece desde ENCARGADO.
- La interfaz tambien bloquea acciones sobre usuarios con rol igual o superior.

## 6. Archivos y fotos

- Subida generica de fotos/documentos permitidos: cualquier usuario autenticado.
- El archivo queda guardado en servidor o Cloudinary segun configuracion.
- La visibilidad y permanencia funcional dependen del documento compartido que referencia ese archivo.
- Borrado generico de archivos subidos: cualquier usuario autenticado puede eliminar el asset huerfano; la capa documental controla si el dato sigue vinculado.
- Fotos de tareas antiguas: el usuario puede borrar sus propias fotos; ENCARGADO o superior puede borrar fotos de otros.

## 7. Tareas diarias / modulo antiguo de tareas

- Crear tarea diaria: PLANNER o superior.
- Ver tareas: cualquier usuario autenticado, pero TECNICO no ve borradores.
- Ver tareas ocultas: solo ENCARGADO o superior.
- Editar tarea: ENCARGADO o superior.
- Publicar tarea: ENCARGADO o superior.
- Reabrir tarea completada: ENCARGADO o superior.
- Ocultar/eliminar tarea: ENCARGADO o superior.
- Agregar/remover miembros:
  - Cada usuario puede agregarse o retirarse a si mismo si tiene acceso.
  - ENCARGADO o superior puede asignar o remover a otros.
- Crear worklog:
  - Cualquier usuario autenticado con acceso a la tarea.
  - No se puede si la tarea esta completada.
- Editar/eliminar worklog:
  - El dueno del registro puede modificarlo.
  - ENCARGADO o superior puede modificar registros de otros.

## 8. Observaciones importantes

- La jerarquia aplica como regla general: un rol superior hereda accesos de roles inferiores cuando se usa `minRole`.
- No todos los botones dependen solo de jerarquia; algunas acciones dependen del estado de la OT.
- En OT, el estado manda:
  - Pendiente/Creada: puede reprogramarse o liberarse si no esta vencida.
  - Vencida sin liberar: debe reprogramarse antes de liberarse.
  - Liberada: permite notificaciones, edicion de cabecera segun rol y solicitud de cierre.
  - Solicitud de cierre: bloquea edicion de notificaciones; permite revision/cierre por PLANNER/INGENIERO.
  - Cerrada: pasa al historial; solo INGENIERO puede modificarla.
- Los roles SUPERVISOR y OPERADOR existen para consulta y levantamiento de avisos, no para gestion de mantenimiento.
- Hay permisos historicos en algunas pantallas que pueden mostrar acciones a roles intermedios, pero si el servidor exige un rol mayor, el guardado sera rechazado.
