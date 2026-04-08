import { getSharedDocument, putSharedDocument } from './api';

export const SHARED_DOCUMENT_KEYS = {
  rrhh: 'pmp_rrhh_tecnicos_v1',
  materials: 'pmp_materiales_v1',
  equipmentColumns: 'pmp_equipos_columns_v1',
  equipmentItems: 'pmp_equipos_items_v1',
  equipmentExchangeHistory: 'pmp_equipos_exchange_history_v1',
  amef: 'pmp_amef_v1',
  maintenancePlans: 'pmp_fechas_plans_v1',
  maintenancePlansKm: 'pmp_km_plans_v1',
  maintenancePackages: 'pmp_paquetes_mantenimiento_v1',
  otAlerts: 'pmp_ot_alertas_v1',
  otHistory: 'pmp_ot_historial_v1',
  otWorkReports: 'pmp_ot_work_reports_v1',
  bajasHistory: 'pmp_bajas_history_v1',
};

export async function loadSharedDocument(key, fallback) {
  try {
    const data = await getSharedDocument(key);
    return data ?? fallback;
  } catch (error) {
    console.error(`Error cargando documento compartido ${key}:`, error);
    return fallback;
  }
}

export async function saveSharedDocument(key, data) {
  return putSharedDocument(key, data);
}
