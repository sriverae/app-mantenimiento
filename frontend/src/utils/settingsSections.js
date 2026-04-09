export const SETTINGS_SECTIONS = [
  { key: 'ordenes-trabajo', label: 'Ordenes de Trabajo', path: '/settings/ordenes-trabajo' },
  { key: 'historial-ot', label: 'Historial de OT', path: '/settings/importaciones/historial-ot' },
  { key: 'cronograma', label: 'Cronograma de mantenimiento', path: '/settings/importaciones/cronograma' },
  { key: 'equipos', label: 'Equipos', path: '/settings/importaciones/equipos' },
  { key: 'paquetes', label: 'Paquetes de mantenimiento', path: '/settings/importaciones/paquetes' },
  { key: 'materiales', label: 'Materiales', path: '/settings/importaciones/materiales' },
  { key: 'personal', label: 'Personal y usuarios', path: '/settings/importaciones/personal' },
];

export const SETTINGS_IMPORT_DESCRIPTIONS = {
  'historial-ot': 'Importa ordenes de trabajo cerradas desde Excel hacia el Historial de OT.',
  cronograma: 'Carga cronogramas preventivos por fecha desde Excel hacia Plan de mantenimiento.',
  equipos: 'Importa equipos de planta desde Excel y agrega columnas extras al maestro si aparecen en el archivo.',
  paquetes: 'Carga paquetes PM desde Excel o genera paquetes desde PDF con lectura automatica de actividades.',
  materiales: 'Importa listados grandes de materiales y repuestos desde Excel.',
  personal: 'Importa personal desde Excel y, si quieres, crea usuarios del sistema en lote.',
};
