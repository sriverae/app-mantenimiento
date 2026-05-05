import { hasMinRole } from './roleAccess';

export const SETTINGS_SECTIONS = [
  { key: 'listas-desplegables', label: 'Listas desplegables', path: '/settings/listas-desplegables', minRole: 'PLANNER', importable: false },
  { key: 'ordenes-trabajo', label: 'Ordenes de Trabajo', path: '/settings/ordenes-trabajo', minRole: 'INGENIERO', importable: false },
  { key: 'contadores', label: 'Contadores', path: '/settings/contadores', minRole: 'INGENIERO', importable: false },
  { key: 'formato-pdf-ot', label: 'Formato PDF OT', path: '/settings/formato-pdf-ot', minRole: 'PLANNER', importable: false },
  { key: 'historial-ot', label: 'Historial de OT', path: '/settings/importaciones/historial-ot', minRole: 'INGENIERO', importable: true },
  { key: 'cronograma', label: 'Cronograma de mantenimiento', path: '/settings/importaciones/cronograma', minRole: 'INGENIERO', importable: true },
  { key: 'equipos', label: 'Equipos', path: '/settings/importaciones/equipos', minRole: 'INGENIERO', importable: true },
  { key: 'paquetes', label: 'Paquetes de mantenimiento', path: '/settings/importaciones/paquetes', minRole: 'INGENIERO', importable: true },
  { key: 'materiales', label: 'Materiales', path: '/settings/importaciones/materiales', minRole: 'INGENIERO', importable: true },
  { key: 'personal', label: 'Personal y usuarios', path: '/settings/importaciones/personal', minRole: 'INGENIERO', importable: true },
];

export function getVisibleSettingsSections(userOrRole) {
  return SETTINGS_SECTIONS.filter((section) => hasMinRole(userOrRole, section.minRole));
}

export function getDefaultSettingsPath(userOrRole) {
  return getVisibleSettingsSections(userOrRole)[0]?.path || '/settings/listas-desplegables';
}

export const SETTINGS_IMPORT_DESCRIPTIONS = {
  'historial-ot': 'Importa ordenes de trabajo cerradas desde Excel hacia el Historial de OT.',
  cronograma: 'Carga cronogramas preventivos por fecha desde Excel hacia Plan de mantenimiento.',
  equipos: 'Importa equipos de planta desde Excel y agrega columnas extras al maestro si aparecen en el archivo.',
  paquetes: 'Carga paquetes PM desde Excel o genera paquetes desde PDF con lectura automatica de actividades.',
  materiales: 'Importa listados grandes de materiales y repuestos desde Excel.',
  personal: 'Importa personal desde Excel y, si quieres, crea usuarios del sistema en lote.',
};
