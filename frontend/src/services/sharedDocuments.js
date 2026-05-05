import { getSharedDocument, putSharedDocument } from './api';

const documentVersions = new Map();
const conflictedDocuments = new Set();

export const SHARED_DOCUMENT_CONFLICT_EVENT = 'shared-document-conflict';

export class SharedDocumentConflictError extends Error {
  constructor(key, sourceError) {
    const serverMessage = sourceError?.response?.data?.detail;
    super(serverMessage || 'El documento fue modificado por otro usuario. Recarga antes de guardar.');
    this.name = 'SharedDocumentConflictError';
    this.key = key;
    this.sourceError = sourceError;
    this.status = sourceError?.response?.status || 409;
    this.isSharedDocumentConflict = true;
  }
}

export function isSharedDocumentConflict(error) {
  return Boolean(error?.isSharedDocumentConflict || [409, 428].includes(error?.response?.status));
}

export function getSharedDocumentErrorMessage(error) {
  if (isSharedDocumentConflict(error)) {
    return 'Hay cambios nuevos guardados por otro usuario. Recarga la pantalla antes de seguir editando para no pisar informacion.';
  }
  return error?.response?.data?.detail || error?.message || 'No se pudo guardar el documento compartido.';
}

function notifySharedDocumentConflict(error) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SHARED_DOCUMENT_CONFLICT_EVENT, {
    detail: {
      key: error.key,
      status: error.status,
      message: getSharedDocumentErrorMessage(error),
    },
  }));
}

async function ensureDocumentVersion(key) {
  if (documentVersions.has(key)) return documentVersions.get(key);
  const document = await getSharedDocument(key);
  if (!document?.version) {
    throw new Error(`No se pudo obtener la version actual de ${key}`);
  }
  documentVersions.set(key, document.version);
  return document.version;
}

export const SHARED_DOCUMENT_KEYS = {
  rrhh: 'pmp_rrhh_tecnicos_v1',
  rrhhAttendance: 'pmp_rrhh_asistencia_v1',
  configurableLists: 'pmp_dropdown_lists_v1',
  materials: 'pmp_materiales_v1',
  equipmentColumns: 'pmp_equipos_columns_v1',
  equipmentItems: 'pmp_equipos_items_v1',
  equipmentExchangeHistory: 'pmp_equipos_exchange_history_v1',
  amef: 'pmp_amef_v1',
  amefComponentFunctions: 'pmp_amef_component_functions_v1',
  maintenancePlans: 'pmp_fechas_plans_v1',
  maintenancePlansKm: 'pmp_km_plans_v1',
  maintenanceCountersHistory: 'pmp_km_counters_history_v1',
  maintenancePackages: 'pmp_paquetes_mantenimiento_v1',
  maintenanceNotices: 'pmp_avisos_mantenimiento_v1',
  executiveAudit: 'pmp_executive_audit_v1',
  operationalEvents: 'pmp_operational_events_v1',
  otAlerts: 'pmp_ot_alertas_v1',
  otDeleted: 'pmp_ot_deleted_v1',
  otSequenceSettings: 'pmp_ot_sequence_settings_v1',
  otHistory: 'pmp_ot_historial_v1',
  otWorkReports: 'pmp_ot_work_reports_v1',
  otPdfFormat: 'pmp_ot_pdf_format_v1',
  bajasHistory: 'pmp_bajas_history_v1',
};

export async function loadSharedDocument(key, fallback) {
  try {
    const document = await getSharedDocument(key);
    if (document?.version) {
      documentVersions.set(key, document.version);
      conflictedDocuments.delete(key);
    }
    return document?.data ?? fallback;
  } catch (error) {
    console.error(`Error cargando documento compartido ${key}:`, error);
    return fallback;
  }
}

export async function saveSharedDocument(key, data) {
  if (conflictedDocuments.has(key)) {
    const blockedError = new SharedDocumentConflictError(key);
    notifySharedDocumentConflict(blockedError);
    throw blockedError;
  }

  const version = await ensureDocumentVersion(key);
  try {
    const document = await putSharedDocument(key, data, version);
    if (document?.version) {
      documentVersions.set(key, document.version);
    }
    return document?.data ?? data;
  } catch (error) {
    if (isSharedDocumentConflict(error)) {
      documentVersions.delete(key);
      conflictedDocuments.add(key);
      const conflictError = error instanceof SharedDocumentConflictError
        ? error
        : new SharedDocumentConflictError(key, error);
      notifySharedDocumentConflict(conflictError);
      throw conflictError;
    }
    throw error;
  }
}
