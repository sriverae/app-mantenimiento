import React, { useEffect, useMemo, useState } from 'react';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import ConfigurableSelectField from '../components/ConfigurableSelectField';
import TableFilterRow from '../components/TableFilterRow';
import CatalogSearchSelect from '../components/CatalogSearchSelect';
import ImagePreviewModal from '../components/ImagePreviewModal';
import { useAuth } from '../context/AuthContext';
import useConfigurableLists from '../hooks/useConfigurableLists';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { uploadPhotoAttachment } from '../services/api';
import {
  getSharedDocumentErrorMessage,
  loadSharedDocument,
  saveSharedDocument,
  SHARED_DOCUMENT_KEYS,
} from '../services/sharedDocuments';
import { DEFAULT_MATERIALS, normalizeMaterialsCatalog } from '../utils/materialsCatalog';
import { getAlertConsistencySummary } from '../utils/otConsistency';
import EditLiberatedOtModal from '../components/EditLiberatedOtModal';
import { formatDateDisplay, formatDateTimeDisplay } from '../utils/dateFormat';
import { advanceKmPlanCycle, getCurrentPlanCycleEntry } from '../utils/kmCounters';
import { getDatePlanOccurrencesInWindow } from '../utils/datePlanCycle';
import {
  formatOtNumber,
  getOtSequenceConfigForYear,
  inferMaxOtSequenceForYear,
  upsertOtSequenceConfig,
} from '../utils/otSequence';
import {
  buildMaintenanceNoticesFromReports,
  buildObservationText,
  getObservationPreset,
  getNoticeStatusColor,
  summarizeNoticeForDisplay,
  WORK_OBSERVATION_PRESETS,
} from '../utils/maintenanceNotices';
import { appendAuditEntry } from '../utils/auditLog';
import {
  getServiceCost,
  getServiceProviderLabel,
  summarizeServiceReports,
} from '../utils/workReportServices';
import { isReadOnlyRole } from '../utils/roleAccess';
import { filterRowsByColumns } from '../utils/tableFilters';
import { DEFAULT_OT_PDF_SETTINGS, normalizeOtPdfSettings, openIndustrialOtReportPdf } from '../utils/otPdfReport';
import { applyOtReprogramming } from '../utils/otReprogramming';
import {
  firstValidationError,
  toNonNegativeNumber,
  validateNonNegativeFields,
  validatePositiveFields,
  validateRequiredFields,
  validateTextFields,
} from '../utils/formValidation';
import {
  findReportsMissingRequiredEvidence,
  buildUploadedPhotoPayload,
  getPhotoSource,
  getWorkReportEvidencePhotos,
  hasRequiredWorkReportEvidence,
  WORK_REPORT_PHOTO_SLOTS,
} from '../utils/workReportEvidence';
import { applyEquipmentExchange, getEquipmentLabel, getNodeLabel } from '../utils/equipmentExchange';

const PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlans;
const KM_PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlansKm;
const PACKAGES_KEY = SHARED_DOCUMENT_KEYS.maintenancePackages;
const EQUIPOS_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const OT_DELETED_KEY = SHARED_DOCUMENT_KEYS.otDeleted;
const OT_SEQUENCE_KEY = SHARED_DOCUMENT_KEYS.otSequenceSettings;
const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;
const OT_WORK_REPORTS_KEY = SHARED_DOCUMENT_KEYS.otWorkReports;
const NOTICES_KEY = SHARED_DOCUMENT_KEYS.maintenanceNotices;
const EXCHANGE_HISTORY_KEY = SHARED_DOCUMENT_KEYS.equipmentExchangeHistory;
const AMEF_KEY = SHARED_DOCUMENT_KEYS.amef;
const PDF_FORMAT_KEY = SHARED_DOCUMENT_KEYS.otPdfFormat;
const RETURN_REASON_OPTIONS = [
  'Fecha/hora inconsistente',
  'Costo de servicio pendiente',
  'Modo de falla sin definir',
  'Causa raiz por completar',
  'Accion correctiva por precisar',
  'Descripcion tecnica incompleta',
  'Validacion de materiales/consumos',
  'Otro',
];
const RRHH_KEY = SHARED_DOCUMENT_KEYS.rrhh;
const MATERIALES_KEY = SHARED_DOCUMENT_KEYS.materials;
const RRHH_FALLBACK = [
  { id: 1, codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', cargo: 'Técnico', especialidad: 'Mecánico', capacidad_hh_dia: '12.00' },
  { id: 2, codigo: 'ELE-1', nombres_apellidos: 'Hernan Alauce Alarcón', cargo: 'Encargado', especialidad: 'Eléctrico', capacidad_hh_dia: '12.00' },
];
const MATERIALES_FALLBACK = DEFAULT_MATERIALS;

const isKmPlanInAlertWindow = (plan) => {
  const actual = Number(plan.km_actual) || 0;
  const target = Number(plan.proximo_km) || 0;
  const alertKm = Number(plan.alerta_km) || 0;
  return target > 0 && actual >= Math.max(target - alertKm, 0);
};

const buildKmAlertId = (plan) => `km_${plan.id}_${Number(plan.proximo_km) || 0}`;

const compareOtAlerts = (a, b) => {
  const aIsDate = /^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha_ejecutar || ''));
  const bIsDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha_ejecutar || ''));

  if (aIsDate && bIsDate) {
    return new Date(a.fecha_ejecutar) - new Date(b.fecha_ejecutar);
  }
  if (!aIsDate && !bIsDate) {
    return (Number(a.km_restantes) || 0) - (Number(b.km_restantes) || 0);
  }
  return aIsDate ? -1 : 1;
};

const getTodayDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const isOverdueUnreleasedOt = (alert, todayKey = getTodayDateKey()) => {
  const status = String(alert?.status_ot || '').trim();
  const dueDate = String(alert?.fecha_ejecutar || '').trim();
  return ['Pendiente', 'Creada'].includes(status) && isDateKey(dueDate) && dueDate < todayKey;
};

const getReprogrammingContinuityRange = (alert = {}) => {
  const entries = (Array.isArray(alert?.reprogramaciones) ? alert.reprogramaciones : [])
    .filter((item) => isDateKey(item?.fecha_anterior) && isDateKey(item?.fecha_nueva))
    .sort((a, b) => String(a.fecha_anterior).localeCompare(String(b.fecha_anterior)));
  if (!entries.length) return null;
  const start = entries[0].fecha_anterior;
  const end = entries.reduce((latest, item) => (
    String(item.fecha_nueva || '') > String(latest || '') ? item.fecha_nueva : latest
  ), entries[entries.length - 1].fecha_nueva);
  if (!isDateKey(start) || !isDateKey(end) || end <= start) return null;
  return { start, end, count: entries.length };
};

const getOtVisualTone = (alert, isSelected = false) => {
  const status = String(alert?.status_ot || '').trim();
  if (isOverdueUnreleasedOt(alert)) {
    return {
      key: 'overdue',
      label: 'Vencida sin liberar',
      background: isSelected ? '#fee2e2' : '#fef2f2',
      border: isSelected ? '#ef4444' : '#fecaca',
      text: '#991b1b',
      chipBackground: '#fee2e2',
      chipText: '#991b1b',
    };
  }
  if (status === 'Liberada') {
    return {
      key: 'released',
      label: 'Liberada',
      background: isSelected ? '#dcfce7' : '#f0fdf4',
      border: isSelected ? '#22c55e' : '#bbf7d0',
      text: '#166534',
      chipBackground: '#dcfce7',
      chipText: '#166534',
    };
  }
  if (status === 'Solicitud de cierre') {
    return {
      key: 'close_request',
      label: 'Solicitud de cierre',
      background: isSelected ? '#ffedd5' : '#fff7ed',
      border: isSelected ? '#f97316' : '#fed7aa',
      text: '#9a3412',
      chipBackground: '#ffedd5',
      chipText: '#9a3412',
    };
  }
  if (['Pendiente', 'Creada'].includes(status)) {
    return {
      key: 'fresh_unreleased',
      label: status,
      background: '#fff',
      border: isSelected ? '#93c5fd' : '#e5e7eb',
      text: '#334155',
      chipBackground: '#f8fafc',
      chipText: '#334155',
    };
  }
  return {
    key: 'default',
    label: status || 'Sin estado',
    background: isSelected ? '#dbeafe' : '#fff',
    border: isSelected ? '#93c5fd' : '#e5e7eb',
    text: '#1d4ed8',
    chipBackground: '#eff6ff',
    chipText: '#1d4ed8',
  };
};

const buildManualOtId = () => `manual_${Date.now()}`;
const renumberOtRows = (rows) => [...rows].sort(compareOtAlerts).map((row, index) => ({ ...row, orden: index + 1 }));

const PRIORITY_OPTIONS = ['Baja', 'Media', 'Alta', 'Critica'];
const VC_OPTIONS = ['V.C - DIA', 'V.C - HRA', 'V.C - KM'];
const OT_TYPE_OPTIONS = ['Preventivo', 'Correctivo', 'Predictivo', 'Inspeccion', 'Lubricacion', 'Mejora'];

const parseCapacityValue = (value) => {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(',', '.')
    .trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCost = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
};

const isMissingCapacityValue = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return true;
  if (/^(n\.?a\.?|na|s\/?d|sin dato|no aplica)$/i.test(text)) return true;
  return parseCapacityValue(text) <= 0;
};

const normalizeAssignableText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const isInternalOtStaff = (item) => {
  const cargo = normalizeAssignableText(item?.cargo);
  return cargo.includes('tecnico')
    || cargo.includes('cnico')
    || cargo.includes('encargado')
    || cargo.includes('operador');
};

const isAssignableOtStaff = (item) => (
  isInternalOtStaff(item) || normalizeAssignableText(item?.tipo_personal) === 'tercero'
);

const splitActivities = (value) => String(value || '')
  .split(/\r?\n+/)
  .map((item) => item.trim())
  .filter(Boolean);

const formatActivities = (items) => (Array.isArray(items) ? items : [])
  .map((item) => String(item || '').trim())
  .filter(Boolean)
  .join('\n');

const normalizePackageActivities = (pkg) => (Array.isArray(pkg?.actividades) ? pkg.actividades : [])
  .map((item) => String(item || '').trim())
  .filter(Boolean);

const cleanActivityRowsForDisplay = (value) => {
  const rows = splitActivities(value);
  if (!rows.length) return [];
  return rows.filter((item, index) => {
    if (index !== 0) return true;
    const text = normalizeAssignableText(item);
    return !(/^x?\d+\s*[-:]/.test(text) && text.includes('paquete'));
  });
};

const getVcFromAlert = (alert) => {
  if (!alert) return 'V.C - DIA';
  if (alert.origen_programacion === 'KM' || String(alert.tipo_mantto || '').toLowerCase().includes('km')) return 'V.C - KM';
  return 'V.C - DIA';
};

const buildCreateFormFromAlert = (alert) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  return {
    equipo_id: alert?.equipo_id || '',
    codigo: alert?.codigo || '',
    descripcion: alert?.descripcion || '',
    area_trabajo: alert?.area_trabajo || '',
    prioridad: alert?.prioridad || 'Media',
    vc: alert?.vc || getVcFromAlert(alert),
    responsable: alert?.responsable || '',
    tipo_mantto: alert?.tipo_mantto || (alert ? 'Preventivo' : 'Correctivo'),
    tiempo_min: alert?.tiempo_min || '',
    fecha: alert?.fecha_ejecutar || todayStr,
    servicio: alert?.servicio || '',
    paquete_pm_id: alert?.paquete_pm_id || '',
    actividades: splitActivities(alert?.actividad),
  };
};

const allocateNextOtNumber = async (year) => {
  const safeYear = Number(year) || new Date().getFullYear();
  const [sequenceSettings, activeAlerts, historyRows] = await Promise.all([
    loadSharedDocument(OT_SEQUENCE_KEY, []),
    loadSharedDocument(OT_ALERTS_KEY, []),
    loadSharedDocument(OT_HISTORY_KEY, []),
  ]);
  const detectedMax = inferMaxOtSequenceForYear([...(Array.isArray(activeAlerts) ? activeAlerts : []), ...(Array.isArray(historyRows) ? historyRows : [])], safeYear);
  const currentConfig = getOtSequenceConfigForYear(sequenceSettings, safeYear, detectedMax);
  const nextSequence = currentConfig.next_number;
  const nextSettings = upsertOtSequenceConfig(sequenceSettings, {
    year: safeYear,
    start_number: currentConfig.start_number,
    last_number: nextSequence,
  });
  await saveSharedDocument(OT_SEQUENCE_KEY, nextSettings);
  return formatOtNumber(safeYear, nextSequence);
};

const buildReservationMap = (alerts, excludeAlertId = null) => {
  const reserved = new Map();
  alerts
    .filter((item) => item.id !== excludeAlertId && ['Creada', 'Liberada'].includes(item.status_ot))
    .forEach((item) => {
      (item.materiales_detalle || []).forEach((material) => {
        const key = String(material.id ?? material.materialId ?? material.codigo ?? '');
        if (!key) return;
        reserved.set(key, (reserved.get(key) || 0) + (Number(material.cantidad) || 0));
      });
    });
  return reserved;
};

const calculateHoursBetween = (fechaInicio, horaInicio, fechaFin, horaFin) => {
  if (!fechaInicio || !horaInicio || !fechaFin || !horaFin) return 0;
  const inicio = new Date(`${fechaInicio}T${horaInicio}:00`);
  const fin = new Date(`${fechaFin}T${horaFin}:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return 0;
  const diff = (fin.getTime() - inicio.getTime()) / (1000 * 60 * 60);
  return diff > 0 ? Number(diff.toFixed(2)) : 0;
};

const parseLocalDateTime = (fecha, hora, fallbackHora = '00:00') => {
  if (!fecha) return null;
  const normalizedHora = /^\d{2}:\d{2}/.test(String(hora || '')) ? String(hora).slice(0, 5) : fallbackHora;
  const parsed = new Date(`${fecha}T${normalizedHora}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateInputValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeInputValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const hoursBetweenDates = (start, end) => {
  if (!(start instanceof Date) || !(end instanceof Date)) return 0;
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return diff > 0 ? Number(diff.toFixed(2)) : 0;
};

const clampIntervalHours = (start, end, minStart, maxEnd) => {
  if (!start || !end || !minStart || !maxEnd) return 0;
  const clampedStart = start < minStart ? minStart : start;
  const clampedEnd = end > maxEnd ? maxEnd : end;
  return hoursBetweenDates(clampedStart, clampedEnd);
};

const getReportRange = (report) => {
  const start = parseLocalDateTime(report?.fechaInicio, report?.horaInicio, '00:00');
  const end = parseLocalDateTime(report?.fechaFin, report?.horaFin, '23:59');
  if (!start || !end || end <= start) return null;
  return { start, end };
};

const buildCloseOtReferenceRange = (reports = [], registro = {}, fallbackDate = '') => {
  const ranges = (Array.isArray(reports) ? reports : [])
    .map(getReportRange)
    .filter(Boolean);
  if (ranges.length) {
    const firstStart = ranges.reduce((min, range) => (range.start < min ? range.start : min), ranges[0].start);
    const lastEnd = ranges.reduce((max, range) => (range.end > max ? range.end : max), ranges[0].end);
    return {
      fecha_inicio: toDateInputValue(firstStart),
      hora_inicio: toTimeInputValue(firstStart),
      fecha_fin: toDateInputValue(lastEnd),
      hora_fin: toTimeInputValue(lastEnd),
      source: 'reports',
    };
  }
  return {
    fecha_inicio: registro.fecha_inicio || fallbackDate || new Date().toISOString().slice(0, 10),
    hora_inicio: registro.hora_inicio || '08:00',
    fecha_fin: registro.fecha_fin || fallbackDate || new Date().toISOString().slice(0, 10),
    hora_fin: registro.hora_fin || '09:00',
    source: 'release',
  };
};

const getReportUnavailableHours = (report) => {
  if (report?.estado_equipo !== 'Parada de equipo') return 0;
  const range = getReportRange(report);
  if (!range) return 0;
  if (report?.parada_alcance === 'parcial') {
    const start = parseLocalDateTime(report.fechaInicio, report.parada_hora_inicio || report.horaInicio, report.horaInicio || '00:00');
    const end = parseLocalDateTime(report.fechaFin, report.parada_hora_fin || report.horaFin, report.horaFin || '23:59');
    return clampIntervalHours(start, end, range.start, range.end);
  }
  return hoursBetweenDates(range.start, range.end);
};

const normalizeGapStatus = (value) => value || 'PENDIENTE';

const getGapUnavailableHours = (gap) => {
  const status = normalizeGapStatus(gap?.estado);
  const start = parseLocalDateTime(gap?.fecha_inicio, gap?.hora_inicio, '00:00');
  const end = parseLocalDateTime(gap?.fecha_fin, gap?.hora_fin, '23:59');
  if (!start || !end || end <= start) return 0;
  if (status === 'PARADA_TOTAL') return hoursBetweenDates(start, end);
  if (status === 'PARADA_PARCIAL') {
    const partialStart = parseLocalDateTime(gap?.parada_fecha_inicio, gap?.parada_hora_inicio, '00:00');
    const partialEnd = parseLocalDateTime(gap?.parada_fecha_fin, gap?.parada_hora_fin, '23:59');
    return clampIntervalHours(partialStart, partialEnd, start, end);
  }
  return 0;
};

const buildOperationalGapPeriods = (form, reports = [], existing = []) => {
  const otStart = parseLocalDateTime(form.fecha_inicio, form.hora_inicio, '00:00');
  const otEnd = parseLocalDateTime(form.fecha_fin, form.hora_fin, '23:59');
  if (!otStart || !otEnd || otEnd <= otStart) return [];

  const existingById = new Map((Array.isArray(existing) ? existing : []).map((item) => [item.id, item]));
  const intervals = (Array.isArray(reports) ? reports : [])
    .map(getReportRange)
    .filter(Boolean)
    .map((range) => ({
      start: range.start < otStart ? otStart : range.start,
      end: range.end > otEnd ? otEnd : range.end,
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  intervals.forEach((range) => {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
      return;
    }
    if (range.end > last.end) last.end = range.end;
  });

  const gaps = [];
  let cursor = otStart;
  [...merged, { start: otEnd, end: otEnd }].forEach((range) => {
    if (range.start > cursor) {
      const id = `${toDateInputValue(cursor)}_${toTimeInputValue(cursor)}__${toDateInputValue(range.start)}_${toTimeInputValue(range.start)}`;
      const previous = existingById.get(id) || {};
      gaps.push({
        id,
        fecha_inicio: toDateInputValue(cursor),
        hora_inicio: toTimeInputValue(cursor),
        fecha_fin: toDateInputValue(range.start),
        hora_fin: toTimeInputValue(range.start),
        horas_periodo: hoursBetweenDates(cursor, range.start),
        estado: previous.estado || 'PENDIENTE',
        parada_fecha_inicio: previous.parada_fecha_inicio || toDateInputValue(cursor),
        parada_hora_inicio: previous.parada_hora_inicio || toTimeInputValue(cursor),
        parada_fecha_fin: previous.parada_fecha_fin || toDateInputValue(range.start),
        parada_hora_fin: previous.parada_hora_fin || toTimeInputValue(range.start),
        observacion: previous.observacion || '',
      });
    }
    if (range.end > cursor) cursor = range.end;
  });
  return gaps;
};

const splitDateTimeValue = (dateValue, fallbackTime = '00:00') => {
  const raw = String(dateValue || '').trim();
  if (!raw) return { date: '', time: fallbackTime };
  if (raw.includes('T')) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        date: parsed.toISOString().slice(0, 10),
        time: parsed.toTimeString().slice(0, 5) || fallbackTime,
      };
    }
  }
  return {
    date: raw.slice(0, 10),
    time: raw.length >= 16 ? raw.slice(11, 16) : fallbackTime,
  };
};

const buildLifecycleGapPeriods = (alert = {}, existing = []) => {
  const existingById = new Map((Array.isArray(existing) ? existing : []).map((item) => [item.id, item]));
  const noticeEventTime = alert.hora_visualizacion_evento
    || alert.hora_emision_aviso
    || alert.aviso_origen?.hora_evidencia
    || '00:00';
  const noticeStart = splitDateTimeValue(
    alert.fecha_visualizacion_evento
      || alert.fecha_emision_aviso
      || alert.aviso_origen?.fecha_evidencia
      || alert.aviso_origen?.fecha_aviso
      || alert.aviso_origen?.created_at
      || alert.aviso_creado_at
      || alert.created_at,
    noticeEventTime,
  );
  const acceptedAt = splitDateTimeValue(
    alert.fecha_aceptacion_aviso
      || alert.aviso_origen?.accepted_at,
    '00:00',
  );
  const releasedAt = splitDateTimeValue(
    alert.registro_ot?.fecha_liberacion
      || alert.fecha_liberacion_ot,
    '00:00',
  );
  const scheduledAt = {
    date: alert.fecha_programada || alert.fecha_ejecutar || '',
    time: alert.hora_programada || alert.hora_ejecutar || '00:00',
  };
  const executionStart = {
    date: alert.registro_ot?.fecha_inicio || alert.fecha_ejecutar || '',
    time: alert.registro_ot?.hora_inicio || '00:00',
  };
  const points = [
    { key: 'aviso', label: 'Evento visualizado', ...noticeStart },
    { key: 'aceptacion', label: 'Aceptacion de aviso', ...acceptedAt },
    { key: 'liberacion', label: 'Liberacion OT', ...releasedAt },
    { key: 'ejecucion', label: 'Inicio de ejecucion', ...executionStart },
  ].filter((item) => item.date);

  const periods = [];
  const reprogrammingRange = getReprogrammingContinuityRange(alert);
  if (reprogrammingRange) {
    const startDate = parseLocalDateTime(reprogrammingRange.start, scheduledAt.time || '00:00', '00:00');
    const endDate = parseLocalDateTime(reprogrammingRange.end, scheduledAt.time || '00:00', '00:00');
    if (startDate && endDate && endDate > startDate) {
      const id = 'lifecycle_fecha_vencida_reprogramacion';
      const previous = existingById.get(id) || {};
      periods.push({
        id,
        origen: 'CICLO_OT',
        etapa_inicio: 'Fecha vencida sin liberar',
        etapa_fin: 'Ultima reprogramacion',
        fecha_inicio: reprogrammingRange.start,
        hora_inicio: scheduledAt.time || '00:00',
        fecha_fin: reprogrammingRange.end,
        hora_fin: scheduledAt.time || '00:00',
        horas_periodo: hoursBetweenDates(startDate, endDate),
        estado: previous.estado || 'PENDIENTE',
        parada_fecha_inicio: previous.parada_fecha_inicio || reprogrammingRange.start,
        parada_hora_inicio: previous.parada_hora_inicio || scheduledAt.time || '00:00',
        parada_fecha_fin: previous.parada_fecha_fin || reprogrammingRange.end,
        parada_hora_fin: previous.parada_hora_fin || scheduledAt.time || '00:00',
        observacion: previous.observacion || '',
        confirmado_por: previous.confirmado_por || '',
        confirmado_en: previous.confirmado_en || '',
      });
    }
  }
  const scheduledDate = parseLocalDateTime(scheduledAt.date, scheduledAt.time, '00:00');
  const executionDate = parseLocalDateTime(executionStart.date, executionStart.time, '00:00');
  if (scheduledDate && executionDate && executionDate > scheduledDate) {
    const id = 'lifecycle_programada_ejecucion';
    const previous = existingById.get(id) || {};
    periods.push({
      id,
      origen: 'CICLO_OT',
      etapa_inicio: 'Fecha programada',
      etapa_fin: 'Inicio real de ejecucion',
      fecha_inicio: scheduledAt.date,
      hora_inicio: scheduledAt.time,
      fecha_fin: executionStart.date,
      hora_fin: executionStart.time,
      horas_periodo: hoursBetweenDates(scheduledDate, executionDate),
      estado: previous.estado || 'PENDIENTE',
      parada_fecha_inicio: previous.parada_fecha_inicio || scheduledAt.date,
      parada_hora_inicio: previous.parada_hora_inicio || scheduledAt.time,
      parada_fecha_fin: previous.parada_fecha_fin || executionStart.date,
      parada_hora_fin: previous.parada_hora_fin || executionStart.time,
      observacion: previous.observacion || '',
      confirmado_por: previous.confirmado_por || '',
      confirmado_en: previous.confirmado_en || '',
    });
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const startDate = parseLocalDateTime(start.date, start.time, '00:00');
    const endDate = parseLocalDateTime(end.date, end.time, '00:00');
    if (!startDate || !endDate || endDate <= startDate) continue;
    const id = `lifecycle_${start.key}_${end.key}`;
    const previous = existingById.get(id) || {};
    periods.push({
      id,
      origen: 'CICLO_OT',
      etapa_inicio: start.label,
      etapa_fin: end.label,
      fecha_inicio: start.date,
      hora_inicio: start.time,
      fecha_fin: end.date,
      hora_fin: end.time,
      horas_periodo: hoursBetweenDates(startDate, endDate),
      estado: previous.estado || 'PENDIENTE',
      parada_fecha_inicio: previous.parada_fecha_inicio || start.date,
      parada_hora_inicio: previous.parada_hora_inicio || start.time,
      parada_fecha_fin: previous.parada_fecha_fin || end.date,
      parada_hora_fin: previous.parada_hora_fin || end.time,
      observacion: previous.observacion || '',
      confirmado_por: previous.confirmado_por || '',
      confirmado_en: previous.confirmado_en || '',
    });
  }
  return periods;
};

const openCloseReportPdf = (alert, reports, catalog, pdfSettings) => {
  openIndustrialOtReportPdf(alert, reports, catalog, pdfSettings);
};

const aggregateTimeByTechnician = (personalDetalle = [], reports = []) => {
  const staffById = new Map((personalDetalle || []).map((item) => [String(item.id), item]));
  const staffByName = new Map((personalDetalle || []).map((item) => [String(item.nombres_apellidos || '').trim().toLowerCase(), item]));
  const aggregated = new Map();

  (reports || []).forEach((report) => {
    (report.tecnicos || []).forEach((row) => {
      const tecnicoId = row.tecnicoId !== null && row.tecnicoId !== undefined && row.tecnicoId !== '' ? String(row.tecnicoId) : '';
      const tecnicoNombre = String(row.tecnico || '').trim();
      const tecnicoKey = tecnicoId || tecnicoNombre.toLowerCase();
      if (!tecnicoKey) return;

      const matchedStaff = (tecnicoId && staffById.get(tecnicoId)) || staffByName.get(tecnicoNombre.toLowerCase()) || null;
      const existing = aggregated.get(tecnicoKey);
      aggregated.set(tecnicoKey, {
        id: matchedStaff?.id ?? existing?.id ?? tecnicoKey,
        codigo: matchedStaff?.codigo ?? existing?.codigo ?? 'N.A.',
        nombre: matchedStaff?.nombres_apellidos ?? existing?.nombre ?? tecnicoNombre ?? 'Tecnico',
        especialidad: matchedStaff?.especialidad ?? existing?.especialidad ?? 'N.A.',
        costo_hora: Number(matchedStaff?.costo_hora ?? existing?.costo_hora ?? 0),
        horas: Number(((existing?.horas || 0) + (Number(row.horas) || 0)).toFixed(2)),
      });
    });
  });

  return Array.from(aggregated.values()).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
};

const getReportEffectiveDurationHours = (report = {}) => {
  const technicianHours = (Array.isArray(report.tecnicos) ? report.tecnicos : [])
    .map((row) => Number(row?.horas) || 0)
    .filter((value) => value > 0);
  if (technicianHours.length) return Math.max(...technicianHours);
  return Number(report.totalHoras || 0) || 0;
};

const calculateEffectiveWorkDurationFromReports = (reports = []) => Number(
  (Array.isArray(reports) ? reports : [])
    .reduce((sum, report) => sum + getReportEffectiveDurationHours(report), 0)
    .toFixed(2),
);

function ModalTiempoEfectivo({ personalDetalle, tiempoPersonalActual, maxHorasSugeridas, onClose, onSave, readOnly = false, description = '' }) {
  const [rows, setRows] = useState(() => {
    const mapActual = new Map((tiempoPersonalActual || []).map((item) => [String(item.id), item.horas]));
    return (personalDetalle || []).map((item) => ({
      id: item.id,
      codigo: item.codigo,
      nombre: item.nombres_apellidos,
      especialidad: item.especialidad,
      horas: mapActual.get(String(item.id)) ?? 0,
    }));
  });

  useEffect(() => {
    const nextRows = (tiempoPersonalActual || []).length
      ? (tiempoPersonalActual || []).map((item) => ({
        id: item.id,
        codigo: item.codigo || 'N.A.',
        nombre: item.nombre || item.nombres_apellidos || 'Tecnico',
        especialidad: item.especialidad || 'N.A.',
        horas: item.horas || 0,
      }))
      : (personalDetalle || []).map((item) => ({
        id: item.id,
        codigo: item.codigo,
        nombre: item.nombres_apellidos,
        especialidad: item.especialidad,
        horas: 0,
      }));
    setRows(nextRows);
  }, [personalDetalle, tiempoPersonalActual]);

  const totalHoras = rows.reduce((sum, item) => sum + (Number(item.horas) || 0), 0);
  const timeRowsColumns = useMemo(() => [
    { id: 'nombre', label: 'Tecnico' },
    { id: 'codigo', label: 'Codigo' },
    { id: 'especialidad', label: 'Especialidad' },
    { id: 'horas', label: 'Horas trabajadas' },
  ], []);
  const timeRowsFilters = useTableColumnFilters(timeRowsColumns);
  const visibleTimeRows = useMemo(
    () => filterRowsByColumns(rows, timeRowsColumns, timeRowsFilters.filters),
    [rows, timeRowsColumns, timeRowsFilters.filters],
  );

  const updateHoras = (id, value) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, horas: value } : row)));
  };

  const submit = () => {
    const validationError = validateNonNegativeFields(rows.map((item, index) => [`Horas tecnico ${index + 1}`, item.horas]));
    if (validationError) {
      window.alert(validationError);
      return;
    }
    const payload = rows.map((item) => ({ ...item, horas: Number(item.horas) || 0 }));
    const excedido = payload.find((item) => item.horas > maxHorasSugeridas);
    if (excedido) {
      window.alert(`El técnico ${excedido.nombre} excede el máximo sugerido (${maxHorasSugeridas.toFixed(2)} Hh).`);
      return;
    }
    onSave({
      tiempoPersonal: payload,
      totalHoras: Number(payload.reduce((sum, item) => sum + item.horas, 0).toFixed(2)),
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .5)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(520px, 100%)', background: '#fff', borderRadius: '.65rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Tiempo efectivo por técnico</h3>
          <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Selecciona el técnico por nombre y registra sus horas trabajadas.</p>
        </div>
        <div style={{ padding: '1rem 1.2rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>Técnico</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>CÃ³digo</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>Especialidad</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>Horas trabajadas</th>
                </tr>
                <TableFilterRow columns={timeRowsColumns} rows={rows} filters={timeRowsFilters.filters} onChange={timeRowsFilters.setFilter} />
              </thead>
              <tbody>
                {visibleTimeRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{row.nombre}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{row.codigo || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{row.especialidad}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem', width: '180px' }}>
                      {readOnly ? (
                        <div style={{ fontWeight: 600, color: '#111827' }}>{Number(row.horas || 0).toFixed(2)}</div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          max={maxHorasSugeridas}
                          className="form-input"
                          value={row.horas}
                          onChange={(e) => updateHoras(row.id, e.target.value)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {!visibleTimeRows.length && (
                  <tr>
                    <td colSpan={4} style={{ border: '1px solid #e5e7eb', padding: '.8rem', textAlign: 'center', color: '#6b7280' }}>
                      {rows.length ? 'Sin resultados para los filtros aplicados.' : 'No hay técnicos asignados en esta OT.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '.8rem', fontWeight: 600, color: '#1f2937' }}>
            Tiempo efectivo - personal (Hh): {Number(totalHoras).toFixed(2)}
          </div>
          {description && (
            <div style={{ marginTop: '.45rem', fontSize: '.9rem', color: '#374151' }}>
              {description}
            </div>
          )}
          <div style={{ marginTop: '.35rem', fontSize: '.9rem', color: '#6b7280' }}>
            Sugerencia: máximo por técnico = {Number(maxHorasSugeridas || 0).toFixed(2)} Hh (según hora inicio/fin).
          </div>
        </div>
        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '.65rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
          {!readOnly && <button type="button" className="btn btn-primary" onClick={submit}>Guardar tiempo</button>}
        </div>
      </div>
    </div>
  );
}

export function ModalReprogramarOt({ alert, onClose, onSubmit }) {
  const [newDate, setNewDate] = useState(alert?.fecha_ejecutar || new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  const submit = () => {
    if (!newDate) {
      window.alert('Selecciona la nueva fecha programada para la OT.');
      return;
    }
    if (newDate === alert?.fecha_ejecutar) {
      window.alert('La nueva fecha debe ser diferente a la fecha actual.');
      return;
    }
    if (alert?.fecha_ejecutar && isDateKey(alert.fecha_ejecutar) && isDateKey(newDate) && newDate <= alert.fecha_ejecutar) {
      window.alert('La nueva fecha debe ser posterior a la fecha programada actual.');
      return;
    }
    if (!reason.trim()) {
      window.alert('Indica el motivo de la reprogramacion.');
      return;
    }
    const validationError = validateTextFields([['Motivo de reprogramacion', reason]]);
    if (validationError) {
      window.alert(validationError);
      return;
    }
    onSubmit({
      fecha_anterior: alert?.fecha_ejecutar || '',
      fecha_nueva: newDate,
      motivo: reason.trim(),
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', display: 'grid', placeItems: 'center', zIndex: 1100, padding: '1rem' }}>
      <div className="card" style={{ width: 'min(620px, 96vw)', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '.9rem' }}>
          <div>
            <h3 className="card-title" style={{ marginBottom: '.25rem' }}>Reprogramar OT</h3>
            <p style={{ color: '#6b7280', margin: 0 }}>
              {alert?.ot_numero || 'OT sin numero'} · {alert?.codigo || 'N.A.'} · {alert?.descripcion || 'Sin descripcion'}
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>

        <div className="alert alert-warning" style={{ marginBottom: '.9rem' }}>
          Fecha actual programada: <strong>{formatDateDisplay(alert?.fecha_ejecutar || '', 'N.A.')}</strong>.
          La reprogramacion quedara registrada en el historial interno de la OT.
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: '.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nueva fecha programada *</label>
            <input type="date" className="form-input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Motivo de reprogramacion *</label>
            <textarea
              className="form-textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ejemplo: equipo no disponible, espera de repuesto, prioridad operativa, falta de ventana de parada..."
              rows={4}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={submit}>Guardar reprogramacion</button>
        </div>
      </div>
    </div>
  );
}

export function ModalCrearOt({
  initialAlert,
  equipmentItems,
  packageItems,
  rrhhItems = [],
  dropdownOptions = {},
  canManageConfigurableLists = false,
  onQuickAddOption,
  mode = 'create',
  title,
  subtitle,
  submitLabel: submitLabelOverride,
  showLeadDays = false,
  lockDate = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => buildCreateFormFromAlert(initialAlert));
  const [descriptionFilter, setDescriptionFilter] = useState(initialAlert?.descripcion || '');
  const [codeFilter, setCodeFilter] = useState(initialAlert?.codigo || '');
  const [areaFilter, setAreaFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const [activityInput, setActivityInput] = useState('');
  const [activities, setActivities] = useState(() => buildCreateFormFromAlert(initialAlert).actividades);
  const [leadDays, setLeadDays] = useState(Math.max(0, Number(initialAlert?.dias_anticipacion_alerta) || 0));
  const eligibleAssignableRrhh = rrhhItems.filter(isAssignableOtStaff);

  void eligibleAssignableRrhh;
  const isEditMode = mode === 'edit';
  const modalTitle = title || (isEditMode ? 'Editar OT pendiente' : 'OT no programada / Crear OT');
  const submitLabel = submitLabelOverride || (isEditMode ? 'Guardar cambios OT' : 'Registrar OT');
  const otStatusLabel = initialAlert?.status_ot || 'Pendiente';
  const priorityOptions = dropdownOptions.priorities || PRIORITY_OPTIONS;
  const vcOptions = dropdownOptions.vcOptions || VC_OPTIONS;
  const responsibleOptions = dropdownOptions.responsibles || [];
  const maintenanceTypeOptions = dropdownOptions.maintenanceTypes || OT_TYPE_OPTIONS;
  const areaOptions = dropdownOptions.areas || [];
  const equipmentAreas = useMemo(() => Array.from(new Set((equipmentItems || []).map((item) => item.area_trabajo).filter(Boolean))).sort(), [equipmentItems]);
  const equipmentBrands = useMemo(() => Array.from(new Set((equipmentItems || []).map((item) => item.marca).filter(Boolean))).sort(), [equipmentItems]);
  const equipmentStatuses = useMemo(() => Array.from(new Set((equipmentItems || []).map((item) => item.estado).filter(Boolean))).sort(), [equipmentItems]);

  useEffect(() => {
    const next = buildCreateFormFromAlert(initialAlert);
    setForm(next);
    setDescriptionFilter(initialAlert?.descripcion || '');
    setCodeFilter(initialAlert?.codigo || '');
    setAreaFilter('');
    setBrandFilter('');
    setStatusFilter('');
    setPackageFilter('');
    setActivityInput('');
    setActivities(next.actividades);
    setLeadDays(Math.max(0, Number(initialAlert?.dias_anticipacion_alerta) || 0));
  }, [initialAlert]);

  const handleQuickAdd = async (key, label, field) => {
    const result = await onQuickAddOption?.(key, label);
    if (result?.added && result.value) {
      setForm((prev) => ({ ...prev, [field]: result.value }));
    }
  };

  const selectedPackage = useMemo(
    () => (packageItems || []).find((item) => String(item.id) === String(form.paquete_pm_id)) || null,
    [packageItems, form.paquete_pm_id],
  );

  const filteredPackages = useMemo(() => {
    const query = packageFilter.trim().toLowerCase();
    if (!query) return packageItems || [];
    return (packageItems || []).filter((item) => `${item.codigo || ''} ${item.nombre || ''}`.toLowerCase().includes(query));
  }, [packageItems, packageFilter]);

  const filteredEquipments = useMemo(() => (equipmentItems || []).filter((item) => {
    const matchesDesc = !descriptionFilter.trim() || String(item.descripcion || '').toLowerCase().includes(descriptionFilter.trim().toLowerCase());
    const matchesCode = !codeFilter.trim() || String(item.codigo || '').toLowerCase().includes(codeFilter.trim().toLowerCase());
    const matchesArea = !areaFilter || String(item.area_trabajo || '') === areaFilter;
    const matchesBrand = !brandFilter || String(item.marca || '') === brandFilter;
    const matchesStatus = !statusFilter || String(item.estado || '') === statusFilter;
    return matchesDesc && matchesCode && matchesArea && matchesBrand && matchesStatus;
  }), [equipmentItems, descriptionFilter, codeFilter, areaFilter, brandFilter, statusFilter]);
  const activityTableRows = useMemo(
    () => activities.map((activity, index) => ({ id: `${index}_${activity}`, index, activity })),
    [activities],
  );
  const createActivityColumns = useMemo(() => [
    { id: 'item', label: 'Item', getValue: (row) => row.index + 1 },
    { id: 'activity', label: 'Descripcion de las actividades' },
    { id: 'accion', label: 'Accion', filterable: false },
  ], []);
  const createActivityFilters = useTableColumnFilters(createActivityColumns);
  const visibleCreateActivities = useMemo(
    () => filterRowsByColumns(activityTableRows, createActivityColumns, createActivityFilters.filters),
    [activityTableRows, createActivityColumns, createActivityFilters.filters],
  );

  const selectedEquipment = useMemo(
    () => (equipmentItems || []).find((item) => String(item.id) === String(form.equipo_id))
      || (equipmentItems || []).find((item) => String(item.codigo || '').toUpperCase() === String(form.codigo || '').toUpperCase())
      || null,
    [equipmentItems, form.equipo_id, form.codigo],
  );

  const selectEquipment = (equipment) => {
    setForm((prev) => ({
      ...prev,
      equipo_id: equipment.id,
      codigo: equipment.codigo || '',
      descripcion: equipment.descripcion || '',
      area_trabajo: equipment.area_trabajo || '',
      prioridad: prev.prioridad || equipment.criticidad || 'Media',
    }));
    setDescriptionFilter(equipment.descripcion || '');
    setCodeFilter(equipment.codigo || '');
  };

  const addActivity = () => {
    const text = activityInput.trim();
    if (!text) return;
    const validationError = validateTextFields([['Actividad', text]]);
    if (validationError) {
      window.alert(validationError);
      return;
    }
    setActivities((prev) => [...prev, text]);
    setActivityInput('');
  };

  const removeActivity = (index) => {
    setActivities((prev) => prev.filter((_, idx) => idx !== index));
  };

  const applyPackage = () => {
    if (!selectedPackage) {
      window.alert('Selecciona un paquete PM antes de aplicarlo.');
      return;
    }
    const nextActivities = normalizePackageActivities(selectedPackage);
    setActivities(nextActivities);
    setForm((prev) => ({
      ...prev,
      vc: selectedPackage.vc || prev.vc,
      tiempo_min: selectedPackage.tiempo_min || prev.tiempo_min,
      servicio: prev.servicio || selectedPackage.nombre || '',
    }));
  };

  const submit = () => {
    const validationError = firstValidationError(
      validateRequiredFields([
        ['Codigo', form.codigo],
        ['Descripcion', form.descripcion],
        ['Fecha OT', form.fecha],
      ]),
      validateTextFields([
        ['Codigo', form.codigo],
        ['Descripcion', form.descripcion],
        ['Area de trabajo', form.area_trabajo],
        ['Responsable', form.responsable],
        ['Servicio', form.servicio],
        ...activities.map((activity, index) => [`Actividad ${index + 1}`, activity]),
      ]),
      validateNonNegativeFields([['Tiempo estimado', form.tiempo_min]]),
    );
    if (validationError) {
      window.alert(validationError);
      return;
    }
    if (!activities.length) {
      window.alert('Agrega al menos una actividad de mantenimiento.');
      return;
    }

    onSubmit({
      ...form,
      codigo: form.codigo.trim().toUpperCase(),
      descripcion: form.descripcion.trim(),
      area_trabajo: form.area_trabajo.trim() || 'N.A.',
      responsable: form.responsable.trim() || 'N.A.',
      tipo_mantto: form.tipo_mantto || 'Correctivo',
      tiempo_min: toNonNegativeNumber(form.tiempo_min),
      servicio: form.servicio.trim(),
      actividad: formatActivities(activities),
      paquete_pm_nombre: selectedPackage?.nombre || '',
      dias_anticipacion_alerta: showLeadDays ? Math.max(0, Math.trunc(Number(leadDays) || 0)) : (Number(form.dias_anticipacion_alerta) || 0),
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .5)', zIndex: 1350, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(1260px, 100%)', maxHeight: '94vh', overflow: 'auto', background: '#f8fafc', borderRadius: '.85rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', background: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '.2rem' }}>{modalTitle}</h3>
            <p style={{ color: '#6b7280', fontSize: '.92rem', margin: 0 }}>
              {subtitle || (isEditMode && initialAlert
                ? `Edita la OT ${initialAlert.codigo} - ${initialAlert.descripcion} con el mismo formato con el que fue creada.`
                : initialAlert
                  ? `Creacion de OT para ${initialAlert.codigo} - ${initialAlert.descripcion}.`
                  : 'Selecciona un equipo desde inventario y registra la OT.')}
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ padding: '1rem 1.2rem 1.2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem', marginBottom: '1rem' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '.9rem', padding: '.9rem 1rem' }}>
              <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.25rem' }}>Equipo seleccionado</div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedEquipment ? `${selectedEquipment.codigo} - ${selectedEquipment.descripcion}` : 'Sin equipo seleccionado'}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '.9rem', padding: '.9rem 1rem' }}>
              <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.25rem' }}>Estado inicial</div>
              <div style={{ fontWeight: 700, color: '#b45309' }}>{otStatusLabel}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '.9rem', padding: '.9rem 1rem' }}>
              <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.25rem' }}>Actividades cargadas</div>
              <div style={{ fontWeight: 700, color: '#2563eb' }}>{activities.length}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '.9rem', padding: '.9rem 1rem' }}>
              <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.25rem' }}>Paquete PM</div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedPackage?.nombre || 'No aplicado'}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.05rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', marginBottom: '.9rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Busqueda de equipo</h4>
                <p style={{ color: '#6b7280', fontSize: '.9rem', margin: 0 }}>Filtra por area, descripcion, codigo, marca o estado y selecciona el equipo.</p>
              </div>
              <span style={{ fontSize: '.86rem', color: '#475569', fontWeight: 700 }}>{filteredEquipments.length} resultado(s)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, .8fr) minmax(240px, 1.3fr) minmax(150px, .7fr) minmax(150px, .7fr) minmax(150px, .7fr)', gap: '.75rem', marginBottom: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Area</label>
                <select className="form-select" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                  <option value="">Todas</option>
                  {equipmentAreas.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripcion</label>
                <input className="form-input" value={descriptionFilter} onChange={(e) => setDescriptionFilter(e.target.value)} placeholder="Ej: Pre limpia, montacargas..." />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Codigo</label>
                <input className="form-input" value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} placeholder="Ej: IAISPL1" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Marca</label>
                <select className="form-select" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
                  <option value="">Todas</option>
                  {equipmentBrands.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado</label>
                <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Todos</option>
                  {equipmentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Equipo</label>
              <select
                className="form-select"
                value={selectedEquipment?.id || ''}
                onChange={(e) => {
                  const equipment = filteredEquipments.find((item) => String(item.id) === String(e.target.value));
                  if (equipment) selectEquipment(equipment);
                }}
              >
                <option value="">Selecciona un equipo...</option>
                {filteredEquipments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.codigo} - {item.descripcion} | {item.area_trabajo || 'N.A.'} | {item.marca || 'N.A.'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div className="card" style={{ marginBottom: 0 }}>
                <h4 className="card-title" style={{ marginBottom: '.85rem' }}>Datos de la OT</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '.8rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Codigo</label>
                    <input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                  </div>
                  <ConfigurableSelectField
                    label="Prioridad"
                    value={form.prioridad}
                    options={priorityOptions}
                    onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
                    onQuickAdd={() => handleQuickAdd('prioridades', 'prioridad', 'prioridad')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona prioridad"
                  />
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label className="form-label">Descripcion</label>
                    <input className="form-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
                  </div>
                  <ConfigurableSelectField
                    label="V.C"
                    value={form.vc}
                    options={vcOptions}
                    onChange={(e) => setForm({ ...form, vc: e.target.value })}
                    onQuickAdd={() => handleQuickAdd('variaciones_control', 'V.C', 'vc')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona V.C"
                  />
                  <ConfigurableSelectField
                    label="Responsable"
                    value={form.responsable}
                    options={responsibleOptions}
                    onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                    onQuickAdd={() => handleQuickAdd('responsables', 'responsable', 'responsable')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona responsable"
                  />
                  <ConfigurableSelectField
                    label="Tipo de mantto"
                    value={form.tipo_mantto}
                    options={maintenanceTypeOptions}
                    onChange={(e) => setForm({ ...form, tipo_mantto: e.target.value })}
                    onQuickAdd={() => handleQuickAdd('tipos_mantenimiento', 'tipo de mantenimiento', 'tipo_mantto')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona tipo"
                  />
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Tiempo (min.)</label>
                    <input type="number" min="0" className="form-input" value={form.tiempo_min} onChange={(e) => setForm({ ...form, tiempo_min: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Fecha</label>
                    <input type="date" className="form-input" value={form.fecha} disabled={lockDate} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                  </div>
                  {showLeadDays && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Aviso anticipado (dias)</label>
                      <input type="number" min="0" className="form-input" value={leadDays} onChange={(e) => setLeadDays(Math.max(0, Number(e.target.value) || 0))} />
                    </div>
                  )}
                  <ConfigurableSelectField
                    label="Area de trabajo"
                    value={form.area_trabajo}
                    options={areaOptions}
                    onChange={(e) => setForm({ ...form, area_trabajo: e.target.value })}
                    onQuickAdd={() => handleQuickAdd('areas_trabajo', 'area de trabajo', 'area_trabajo')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona area"
                  />
                </div>
              </div>

              <div className="card" style={{ marginBottom: 0 }}>
                <h4 className="card-title" style={{ marginBottom: '.85rem' }}>Paquete PM</h4>
                <div className="form-group" style={{ marginBottom: '.65rem' }}>
                  <label className="form-label">Filtrar paquete</label>
                  <input className="form-input" value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)} placeholder="Filtrar paquete por nombre o codigo..." />
                </div>
                <div className="form-group" style={{ marginBottom: '.65rem' }}>
                  <label className="form-label">Seleccion</label>
                  <select className="form-select" value={form.paquete_pm_id || ''} onChange={(e) => setForm({ ...form, paquete_pm_id: e.target.value })}>
                    <option value="">-- Seleccionar paquete --</option>
                    {filteredPackages.map((item) => (
                      <option key={item.id} value={item.id}>{item.codigo} - {item.nombre}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '.88rem', color: '#6b7280' }}>
                    {selectedPackage
                      ? `${selectedPackage.vc || 'V.C'} · ${selectedPackage.tiempo_min || 0} min · ${normalizePackageActivities(selectedPackage).length} actividades`
                      : 'Puedes aplicar un paquete para cargar actividades y tiempos.'}
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={applyPackage}>Aplicar paquete</button>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', marginBottom: '.85rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Actividades de mantenimiento</h4>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '.9rem' }}>Agrega tareas manuales o aplica un paquete PM para cargar varias de una vez.</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) auto', gap: '.6rem', marginBottom: '.8rem' }}>
              <input className="form-input" value={activityInput} onChange={(e) => setActivityInput(e.target.value)} placeholder="Escribe una actividad y agregala" />
              <button type="button" className="btn btn-primary" onClick={addActivity}>Agregar</button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '.8rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#eff6ff' }}>
                    <th style={{ borderBottom: '1px solid #dbeafe', padding: '.5rem', width: '80px', color: '#1e3a8a' }}>Item</th>
                    <th style={{ borderBottom: '1px solid #dbeafe', padding: '.5rem', textAlign: 'left', color: '#1e3a8a' }}>Descripcion de las actividades</th>
                    <th style={{ borderBottom: '1px solid #dbeafe', padding: '.5rem', width: '100px', color: '#1e3a8a' }}>Accion</th>
                  </tr>
                  <TableFilterRow columns={createActivityColumns} rows={activityTableRows} filters={createActivityFilters.filters} onChange={createActivityFilters.setFilter} />
                </thead>
                <tbody>
                  {visibleCreateActivities.map((row) => (
                    <tr key={row.id}>
                      <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem', textAlign: 'center', fontWeight: 700 }}>{row.index + 1}</td>
                      <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem' }}>{row.activity}</td>
                      <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem', textAlign: 'center' }}>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeActivity(row.index)}>Quitar</button>
                      </td>
                    </tr>
                  ))}
                  {!visibleCreateActivities.length && (
                    <tr>
                      <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                        {activities.length ? 'Sin resultados para los filtros aplicados.' : 'Sin actividades registradas.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="form-group" style={{ marginBottom: 0, marginTop: '1rem' }}>
              <label className="form-label">Servicio / observacion general</label>
              <input className="form-input" value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value })} placeholder="Ej: Cambio de aceite, inspeccion mecanica, limpieza profunda..." />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 0, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: '.2rem' }}>
                  {isEditMode ? `La OT se mantendra en estado ${otStatusLabel}` : 'La OT se registrara en estado Pendiente'}
                </div>
                <div style={{ fontSize: '.9rem', color: '#475569' }}>
                  {isEditMode
                    ? 'Puedes ajustar los datos de planificacion antes de liberarla. El numero de OT seguira vacio hasta la liberacion.'
                    : 'El numero de OT se asignara recien cuando uses la opcion Liberar OT.'}
                </div>
              </div>
              <button type="button" className="btn btn-primary" onClick={submit}>{submitLabel}</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '.65rem', background: '#fff' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={submit}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

function FailureModeCatalogModal({ options, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const visibleOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (Array.isArray(options) ? options : []).filter((item) => {
      const haystack = `${item.componente || ''} ${item.modo_falla || ''} ${item.causa_falla || ''} ${item.accion_recomendada || ''}`.toLowerCase();
      return !q || haystack.includes(q);
    });
  }, [options, query]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.58)', zIndex: 1700, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div className="card" style={{ width: 'min(980px, 96vw)', maxHeight: '88vh', overflow: 'auto', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem' }}>
          <div>
            <h3 className="card-title" style={{ marginBottom: '.2rem' }}>Catalogo de modos de falla</h3>
            <p style={{ color: '#6b7280', margin: 0, fontSize: '.9rem' }}>Selecciona el modo de falla que corresponde al cierre tecnico.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
        <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por componente, modo, causa o accion" style={{ marginBottom: '.75rem' }} />
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '.75rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                {['Componente', 'Modo de falla', 'Causa probable', 'Accion recomendada', 'NPR', 'Accion'].map((header) => (
                  <th key={header} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleOptions.map((item) => (
                <tr key={item.id}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.componente || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem', fontWeight: 700 }}>{item.modo_falla || 'Sin modo'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.causa_falla || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.accion_recomendada || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.npr || 0}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onPick(item.id)}>Seleccionar</button>
                  </td>
                </tr>
              ))}
              {!visibleOptions.length && (
                <tr>
                  <td colSpan={6} style={{ border: '1px solid #e5e7eb', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                    No hay modos AMEF que coincidan con la busqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ModalCerrarOT({ alert, reports = [], equiposItems = [], onClose, onSubmit, onReturnToLiberated, initialAction = 'close' }) {
  const { user } = useAuth();
  const {
    getOptions,
    addOptionQuickly,
    canManage: canManageConfigurableLists,
  } = useConfigurableLists();
  const canClassifyGapPeriods = ['ENCARGADO', 'PLANNER', 'INGENIERO', 'ADMIN'].includes(String(user?.role || '').toUpperCase());
  const [showTiempoModal, setShowTiempoModal] = useState(false);
  const [showFailureModeCatalog, setShowFailureModeCatalog] = useState(false);
  const [expandedReportIds, setExpandedReportIds] = useState({});
  const [editableReports, setEditableReports] = useState(() => (Array.isArray(reports) ? reports.map((item) => ({ ...item })) : []));
  const [uploadingClosePhotoSlot, setUploadingClosePhotoSlot] = useState('');
  const [amefItems, setAmefItems] = useState([]);
  const [amefComponentFilter, setAmefComponentFilter] = useState('');
  const [exchangeSourceQuery, setExchangeSourceQuery] = useState('');
  const [exchangeTargetQuery, setExchangeTargetQuery] = useState('');
  const initialExchangeSourceId = useMemo(() => {
    const rows = Array.isArray(equiposItems) ? equiposItems : [];
    const matched = rows.find((eq) => String(eq.id) === String(alert.equipo_id || ''))
      || rows.find((eq) => String(eq.codigo || '').trim().toUpperCase() === String(alert.codigo || '').trim().toUpperCase());
    return matched?.id || rows[0]?.id || '';
  }, [equiposItems, alert.equipo_id, alert.codigo]);
  const [exchangeForm, setExchangeForm] = useState(() => ({
    enabled: false,
    sourceId: initialExchangeSourceId,
    nodeId: '',
    targetId: '',
    motivo: '',
  }));
  const closeReferenceRange = buildCloseOtReferenceRange(reports, alert.registro_ot || {}, alert.fecha_ejecutar || '');
  const [form, setForm] = useState(() => {
    return {
      codigo: alert.codigo || '',
      descripcion: alert.descripcion || '',
      fecha_inicio: alert.cierre_ot?.fecha_inicio || closeReferenceRange.fecha_inicio,
      fecha_fin: alert.cierre_ot?.fecha_fin || closeReferenceRange.fecha_fin,
      hora_inicio: alert.cierre_ot?.hora_inicio || closeReferenceRange.hora_inicio,
      hora_fin: alert.cierre_ot?.hora_fin || closeReferenceRange.hora_fin,
      observaciones: alert.cierre_ot?.observaciones || '',
      cierre_observation_preset: alert.cierre_ot?.cierre_observation_preset || '',
      cierre_observation_detail: alert.cierre_ot?.cierre_observation_detail || '',
      tipo_mantenimiento: alert.tipo_mantto || 'Preventivo',
      puesto_trabajo_resp: alert.responsable || 'N.A.',
      tiempo_efectivo_hh: alert.cierre_ot?.tiempo_efectivo_hh ?? 0,
      tiempo_indisponible_generico: alert.cierre_ot?.tiempo_indisponible_generico ?? 0,
      tiempo_indisponible_operacional: alert.cierre_ot?.tiempo_indisponible_operacional ?? 0,
      capacidad_equipo_manual: alert.cierre_ot?.capacidad_equipo_manual || '',
      costo_tonelada_hora: alert.cierre_ot?.costo_tonelada_hora ?? '',
      tiempo_personal: alert.cierre_ot?.tiempo_personal || [],
      estado_equipo: ['Parada de equipo', 'Operativo durante mantenimiento'].includes(alert.cierre_ot?.estado_equipo)
        ? alert.cierre_ot.estado_equipo
        : 'Operativo durante mantenimiento',
      parada_alcance: alert.cierre_ot?.parada_alcance || 'total',
      parada_hora_inicio: alert.cierre_ot?.parada_hora_inicio || closeReferenceRange.hora_inicio,
      parada_hora_fin: alert.cierre_ot?.parada_hora_fin || closeReferenceRange.hora_fin,
      componente_intervenido: alert.cierre_ot?.componente_intervenido || '',
      modo_falla_origen: alert.cierre_ot?.modo_falla_origen || '',
      modo_falla: alert.cierre_ot?.modo_falla || '',
      causa_raiz: alert.cierre_ot?.causa_raiz || '',
      accion_correctiva: alert.cierre_ot?.accion_correctiva || '',
      recomendacion_tecnica: alert.cierre_ot?.recomendacion_tecnica || '',
      motivo_devolucion_tipo: alert.cierre_ot?.motivo_devolucion_tipo || '',
      motivo_devolucion_detalle: alert.cierre_ot?.motivo_devolucion_detalle || '',
      responsable_correccion: alert.cierre_ot?.responsable_correccion || '',
      fecha_objetivo_reenvio: alert.cierre_ot?.fecha_objetivo_reenvio || '',
    };
  });
  const [gapPeriods, setGapPeriods] = useState(() => buildOperationalGapPeriods(
    {
      fecha_inicio: closeReferenceRange.fecha_inicio,
      hora_inicio: closeReferenceRange.hora_inicio,
      fecha_fin: closeReferenceRange.fecha_fin,
      hora_fin: closeReferenceRange.hora_fin,
    },
    reports,
    alert.cierre_ot?.periodos_sin_notificacion || [],
  ));
  const [lifecycleGapPeriods, setLifecycleGapPeriods] = useState(() => buildLifecycleGapPeriods(
    alert,
    alert.cierre_ot?.periodos_ciclo_ot || [],
  ));
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const personalDetalle = useMemo(() => alert.personal_detalle || [], [alert.personal_detalle]);
  const materialesDetalle = useMemo(() => alert.materiales_detalle || [], [alert.materiales_detalle]);
  const tiempoPersonalCalculado = useMemo(
    () => aggregateTimeByTechnician(personalDetalle, editableReports),
    [personalDetalle, editableReports],
  );
  const tiempoTotalCalculado = useMemo(
    () => calculateEffectiveWorkDurationFromReports(editableReports),
    [editableReports],
  );
  const totalHorasHombreCalculado = useMemo(
    () => Number(tiempoPersonalCalculado.reduce((sum, item) => sum + (Number(item.horas) || 0), 0).toFixed(2)),
    [tiempoPersonalCalculado],
  );
  const derivedNotices = useMemo(
    () => buildMaintenanceNoticesFromReports(alert, editableReports, [], 'Revision de cierre'),
    [alert, editableReports],
  );
  const serviceSummary = useMemo(
    () => summarizeServiceReports(editableReports),
    [editableReports],
  );
  const selectedCloseObservationPreset = useMemo(
    () => getObservationPreset(form.cierre_observation_preset),
    [form.cierre_observation_preset],
  );
  const closeActivityRows = useMemo(
    () => cleanActivityRowsForDisplay(alert.actividad),
    [alert.actividad],
  );
  const reportUnavailableHours = useMemo(
    () => Number((editableReports || []).reduce((sum, report) => sum + getReportUnavailableHours(report), 0).toFixed(2)),
    [editableReports],
  );
  const gapUnavailableHours = useMemo(
    () => Number((gapPeriods || []).reduce((sum, gap) => sum + getGapUnavailableHours(gap), 0).toFixed(2)),
    [gapPeriods],
  );
  const lifecycleUnavailableHours = useMemo(
    () => Number((lifecycleGapPeriods || []).reduce((sum, gap) => sum + getGapUnavailableHours(gap), 0).toFixed(2)),
    [lifecycleGapPeriods],
  );
  const totalOperationalUnavailableHours = useMemo(
    () => Number((reportUnavailableHours + gapUnavailableHours + lifecycleUnavailableHours).toFixed(2)),
    [reportUnavailableHours, gapUnavailableHours, lifecycleUnavailableHours],
  );
  const pendingGapPeriods = useMemo(
    () => [...gapPeriods, ...lifecycleGapPeriods].filter((gap) => normalizeGapStatus(gap.estado) === 'PENDIENTE'),
    [gapPeriods, lifecycleGapPeriods],
  );
  const selectedAmefEquipment = useMemo(() => {
    const rows = Array.isArray(equiposItems) ? equiposItems : [];
    return rows.find((eq) => String(eq.id) === String(alert.equipo_id || ''))
      || rows.find((eq) => String(eq.codigo || '').trim().toUpperCase() === String(alert.codigo || '').trim().toUpperCase())
      || null;
  }, [equiposItems, alert.equipo_id, alert.codigo]);
  const equipmentCapacityText = selectedAmefEquipment?.capacidad || alert.capacidad || 'N.A.';
  const equipmentCapacityMissing = isMissingCapacityValue(equipmentCapacityText);
  const effectiveCapacityText = equipmentCapacityMissing
    ? String(form.capacidad_equipo_manual || '').trim()
    : equipmentCapacityText;
  const equipmentCapacityValue = useMemo(
    () => parseCapacityValue(effectiveCapacityText),
    [effectiveCapacityText],
  );
  const hasEquipmentStopForDowntimeCost = Number(form.tiempo_indisponible_operacional || 0) > 0;
  const downtimeCostPerTonHour = hasEquipmentStopForDowntimeCost ? Number(form.costo_tonelada_hora || 0) : 0;
  const downtimeCost = useMemo(
    () => Number((equipmentCapacityValue * (Number.isFinite(downtimeCostPerTonHour) ? downtimeCostPerTonHour : 0) * Number(form.tiempo_indisponible_operacional || 0)).toFixed(2)),
    [equipmentCapacityValue, downtimeCostPerTonHour, form.tiempo_indisponible_operacional],
  );
  const exchangeSourceEquipo = useMemo(
    () => (Array.isArray(equiposItems) ? equiposItems : []).find((eq) => String(eq.id) === String(exchangeForm.sourceId)) || null,
    [equiposItems, exchangeForm.sourceId],
  );
  const exchangeSourceNodes = useMemo(
    () => (Array.isArray(exchangeSourceEquipo?.despiece) ? exchangeSourceEquipo.despiece : []),
    [exchangeSourceEquipo],
  );
  const exchangeTargetOptions = useMemo(
    () => (Array.isArray(equiposItems) ? equiposItems : []).filter((eq) => String(eq.id) !== String(exchangeForm.sourceId)),
    [equiposItems, exchangeForm.sourceId],
  );
  const filteredExchangeSourceOptions = useMemo(() => {
    const q = exchangeSourceQuery.trim().toLowerCase();
    const rows = Array.isArray(equiposItems) ? equiposItems : [];
    if (!q) return rows;
    return rows.filter((eq) => `${eq.codigo || ''} ${eq.descripcion || ''} ${eq.area_trabajo || ''}`.toLowerCase().includes(q));
  }, [equiposItems, exchangeSourceQuery]);
  const filteredExchangeTargetOptions = useMemo(() => {
    const q = exchangeTargetQuery.trim().toLowerCase();
    if (!q) return exchangeTargetOptions;
    return exchangeTargetOptions.filter((eq) => `${eq.codigo || ''} ${eq.descripcion || ''} ${eq.area_trabajo || ''}`.toLowerCase().includes(q));
  }, [exchangeTargetOptions, exchangeTargetQuery]);
  const isReturnIntent = initialAction === 'return';
  const [selectedNoticeIds, setSelectedNoticeIds] = useState(() => derivedNotices.map((item) => item.id));
  const maxHorasSugeridas = useMemo(
    () => calculateHoursBetween(form.fecha_inicio, form.hora_inicio, form.fecha_fin, form.hora_fin),
    [form.fecha_inicio, form.hora_inicio, form.fecha_fin, form.hora_fin],
  );
  const amefOptions = useMemo(
    () => (Array.isArray(amefItems) ? amefItems : [])
      .filter((item) => {
        const alertCode = String(alert.codigo || '').trim().toUpperCase();
        const matchedCode = String(selectedAmefEquipment?.codigo || '').trim().toUpperCase();
        const itemCode = String(item.equipo_codigo || '').trim().toUpperCase();
        const itemEquipmentId = String(item.equipo_id || '');
        const alertEquipmentId = String(alert.equipo_id || '');
        const matchedEquipmentId = String(selectedAmefEquipment?.id || '');
        return Boolean(
          (alertEquipmentId && itemEquipmentId === alertEquipmentId)
          || (matchedEquipmentId && itemEquipmentId === matchedEquipmentId)
          || (alertCode && itemCode === alertCode)
          || (matchedCode && itemCode === matchedCode),
        );
      })
      .map((item) => ({
        id: String(item.id),
        componentId: String(item.componente_id || ''),
        componente: item.componente_nombre || item.componente_codigo || 'Componente general',
        modo_falla: item.modo_falla || '',
        causa_falla: item.causa_falla || '',
        accion_recomendada: item.accion_recomendada || '',
        estado_accion: item.estado_accion || 'Pendiente',
        fecha_compromiso: item.fecha_compromiso || '',
        npr: (Number(item.severidad) || 0) * (Number(item.ocurrencia) || 0) * (Number(item.deteccion) || 0),
        label: `${item.componente_nombre || item.componente_codigo || 'Componente'} · ${item.modo_falla || 'Sin modo'}`,
      })),
    [amefItems, alert.codigo, alert.equipo_id, selectedAmefEquipment],
  );
  const amefComponentOptions = useMemo(
    () => Array.from(
      amefOptions.reduce((map, item) => {
        const key = String(item.componentId || item.componente || '');
        if (!map.has(key)) {
          map.set(key, {
            id: key,
            nombre: item.componente,
            count: 0,
          });
        }
        map.get(key).count += 1;
        return map;
      }, new Map()).values(),
    ).sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''))),
    [amefOptions],
  );
  const filteredAmefOptions = useMemo(
    () => (amefComponentFilter
      ? amefOptions.filter((item) => String(item.componentId || item.componente || '') === String(amefComponentFilter))
      : amefOptions),
    [amefOptions, amefComponentFilter],
  );
  const amefOptionsByComponent = useMemo(
    () => amefComponentOptions
      .map((component) => ({
        ...component,
        items: filteredAmefOptions.filter((item) => String(item.componentId || item.componente || '') === String(component.id)),
      }))
      .filter((group) => group.items.length > 0),
    [amefComponentOptions, filteredAmefOptions],
  );
  const selectedAmefOption = useMemo(
    () => amefOptions.find((item) => item.id === String(form.modo_falla_origen || '')) || null,
    [amefOptions, form.modo_falla_origen],
  );
  const responsibleOptions = useMemo(
    () => getOptions('responsables', ['Mecanico', 'Electricista', 'Mecanicos', 'Ingeniero', 'Planner', 'Terceros']),
    [getOptions],
  );
  const closeReportColumns = useMemo(() => [
    { id: 'detalle', label: 'Detalle', filterable: false },
    { id: 'codigo', label: 'Codigo', getValue: (report) => report.reportCode || report.id || '' },
    { id: 'inicio', label: 'Inicio', getValue: (report) => formatDateTimeDisplay(report.fechaInicio || '', report.horaInicio || '', 'N.A.') },
    { id: 'fin', label: 'Fin', getValue: (report) => formatDateTimeDisplay(report.fechaFin || '', report.horaFin || '', 'N.A.') },
    { id: 'horas', label: 'Horas', getValue: (report) => Number(report.totalHoras || 0).toFixed(2) },
    { id: 'tecnicos', label: 'Tecnicos', getValue: (report) => report.tecnicos?.length || 0 },
    { id: 'materiales', label: 'Materiales extra', getValue: (report) => report.materialesExtra?.length || 0 },
    { id: 'observaciones', label: 'Observaciones' },
  ], []);
  const closeReportFilters = useTableColumnFilters(closeReportColumns);
  const visibleCloseReports = useMemo(
    () => filterRowsByColumns(editableReports, closeReportColumns, closeReportFilters.filters),
    [editableReports, closeReportColumns, closeReportFilters.filters],
  );
  const closePersonnelColumns = useMemo(() => [
    { id: 'codigo', label: 'Codigo' },
    { id: 'nombres_apellidos', label: 'Nombres' },
    { id: 'especialidad', label: 'Especialidad' },
  ], []);
  const closePersonnelFilters = useTableColumnFilters(closePersonnelColumns);
  const visibleClosePersonnel = useMemo(
    () => filterRowsByColumns(personalDetalle, closePersonnelColumns, closePersonnelFilters.filters),
    [personalDetalle, closePersonnelColumns, closePersonnelFilters.filters],
  );
  const closeMaterialColumns = useMemo(() => [
    { id: 'codigo', label: 'Codigo' },
    { id: 'descripcion', label: 'Descripcion' },
    { id: 'cantidad', label: 'Cant.' },
  ], []);
  const closeMaterialFilters = useTableColumnFilters(closeMaterialColumns);
  const visibleCloseMaterials = useMemo(
    () => filterRowsByColumns(materialesDetalle, closeMaterialColumns, closeMaterialFilters.filters),
    [materialesDetalle, closeMaterialColumns, closeMaterialFilters.filters],
  );
  const closeNoticeColumns = useMemo(() => [
    { id: 'crear', label: 'Crear', filterable: false },
    { id: 'aviso_codigo', label: 'Aviso' },
    { id: 'fecha_aviso', label: 'Fecha', getValue: (notice) => formatDateDisplay(notice.fecha_aviso || '', 'N.A.') },
    { id: 'categoria', label: 'Categoria' },
    { id: 'detalle', label: 'Detalle', getValue: (notice) => summarizeNoticeForDisplay(notice) },
    { id: 'source_report_code', label: 'Origen' },
  ], []);
  const closeNoticeFilters = useTableColumnFilters(closeNoticeColumns);
  const visibleCloseNotices = useMemo(
    () => filterRowsByColumns(derivedNotices, closeNoticeColumns, closeNoticeFilters.filters),
    [derivedNotices, closeNoticeColumns, closeNoticeFilters.filters],
  );

  useEffect(() => {
    let active = true;
    loadSharedDocument(AMEF_KEY, []).then((data) => {
      if (!active) return;
      setAmefItems(Array.isArray(data) ? data : []);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      tiempo_personal: tiempoPersonalCalculado,
      tiempo_efectivo_hh: tiempoTotalCalculado,
    }));
  }, [tiempoPersonalCalculado, tiempoTotalCalculado]);

  useEffect(() => {
    if (!form.cierre_observation_preset) return;
    const nextObservation = buildObservationText(form.cierre_observation_preset, form.cierre_observation_detail);
    setForm((prev) => (
      prev.observaciones === nextObservation
        ? prev
        : { ...prev, observaciones: nextObservation }
    ));
  }, [form.cierre_observation_preset, form.cierre_observation_detail, form.observaciones]);

  useEffect(() => {
    setForm((prev) => {
      const nextGeneric = maxHorasSugeridas;
      const nextOperational = Math.min(totalOperationalUnavailableHours, nextGeneric);

      if (
        Number(prev.tiempo_indisponible_generico) === Number(nextGeneric)
        && Number(prev.tiempo_indisponible_operacional) === Number(nextOperational)
      ) {
        return prev;
      }

      return {
        ...prev,
        tiempo_indisponible_generico: nextGeneric,
        tiempo_indisponible_operacional: nextOperational,
      };
    });
  }, [maxHorasSugeridas, totalOperationalUnavailableHours]);

  useEffect(() => {
    setGapPeriods((prev) => buildOperationalGapPeriods({
      fecha_inicio: form.fecha_inicio,
      hora_inicio: form.hora_inicio,
      fecha_fin: form.fecha_fin,
      hora_fin: form.hora_fin,
    }, editableReports, prev));
  }, [form.fecha_inicio, form.hora_inicio, form.fecha_fin, form.hora_fin, editableReports]);

  useEffect(() => {
    setEditableReports(Array.isArray(reports) ? reports.map((item) => ({ ...item })) : []);
  }, [reports]);

  useEffect(() => {
    setSelectedNoticeIds(derivedNotices.map((item) => item.id));
  }, [derivedNotices]);

  useEffect(() => {
    setExchangeForm((prev) => {
      if (!initialExchangeSourceId) return prev;
      const currentExists = (Array.isArray(equiposItems) ? equiposItems : []).some((eq) => String(eq.id) === String(prev.sourceId));
      if (prev.sourceId && currentExists) return prev;
      return {
        ...prev,
        sourceId: initialExchangeSourceId,
        targetId: (Array.isArray(equiposItems) ? equiposItems : []).find((eq) => String(eq.id) !== String(initialExchangeSourceId))?.id || '',
      };
    });
  }, [initialExchangeSourceId, equiposItems]);

  useEffect(() => {
    if (selectedAmefOption) {
      const nextFilter = String(selectedAmefOption.componentId || selectedAmefOption.componente || '');
      if (nextFilter && nextFilter !== amefComponentFilter) {
        setAmefComponentFilter(nextFilter);
      }
      return;
    }
    if (!amefComponentFilter && String(form.componente_intervenido || '').trim()) {
      const matched = amefComponentOptions.find((item) => String(item.nombre || '').trim() === String(form.componente_intervenido || '').trim());
      if (matched) {
        setAmefComponentFilter(matched.id);
      }
    }
  }, [selectedAmefOption, amefComponentFilter, form.componente_intervenido, amefComponentOptions]);

  const updateServiceReportCost = (reportId, value) => {
    setEditableReports((prev) => prev.map((item) => (
      String(item.id) !== String(reportId)
        ? item
        : {
          ...item,
          serviceCost: value,
        }
    )));
  };

  const updateEditableReport = (reportId, patch) => {
    setEditableReports((prev) => prev.map((item) => (
      String(item.id) !== String(reportId)
        ? item
        : {
          ...item,
          ...patch,
        }
    )));
  };

  const updateGapPeriod = (gapId, patch) => {
    setGapPeriods((prev) => prev.map((item) => (
      item.id !== gapId
        ? item
        : {
          ...item,
          ...patch,
          confirmado_por: user?.full_name || user?.username || user?.role || 'Sistema',
          confirmado_en: new Date().toISOString(),
        }
    )));
  };

  const updateLifecycleGapPeriod = (gapId, patch) => {
    setLifecycleGapPeriods((prev) => prev.map((item) => (
      item.id !== gapId
        ? item
        : {
          ...item,
          ...patch,
          confirmado_por: user?.full_name || user?.username || user?.role || 'Sistema',
          confirmado_en: new Date().toISOString(),
        }
    )));
  };

  const uploadCloseReportEvidence = async (reportId, slotKey, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Selecciona una imagen valida.');
      return;
    }
    const slot = WORK_REPORT_PHOTO_SLOTS.find((item) => item.key === slotKey);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scope', `close_work_notification_${alert.id}_${reportId}_${slotKey}`);
    formData.append('category', slot?.label || slotKey);
    formData.append('caption', file.name);
    setUploadingClosePhotoSlot(`${reportId}_${slotKey}`);
    try {
      const uploaded = await uploadPhotoAttachment(formData);
      const payload = buildUploadedPhotoPayload(uploaded, {
        category: slot?.label || slotKey,
        original_name: file.name,
      });
      setEditableReports((prev) => prev.map((item) => {
        if (String(item.id) !== String(reportId)) return item;
        const currentPhotos = getWorkReportEvidencePhotos(item);
        const nextPhotos = {
          before: currentPhotos.before || null,
          after: currentPhotos.after || null,
          [slotKey]: payload,
        };
        return {
          ...item,
          evidencePhotos: nextPhotos,
          evidence_photos: nextPhotos,
        };
      }));
    } catch (err) {
      console.error('Error subiendo evidencia desde cierre OT:', err);
      window.alert(err?.response?.data?.detail || 'No se pudo subir la foto de evidencia.');
    } finally {
      setUploadingClosePhotoSlot('');
    }
  };

  const handleAmefComponentChange = (value) => {
    setAmefComponentFilter(value);
    const selectedComponent = amefComponentOptions.find((item) => String(item.id) === String(value));
    setForm((prev) => {
      const next = {
        ...prev,
        componente_intervenido: selectedComponent?.nombre || prev.componente_intervenido,
      };
      if (prev.modo_falla_origen && !['NINGUNA', 'MANUAL'].includes(prev.modo_falla_origen)) {
        const stillValid = amefOptions.find(
          (item) => item.id === String(prev.modo_falla_origen)
            && String(item.componentId || item.componente || '') === String(value),
        );
        if (!stillValid) {
          next.modo_falla_origen = '';
          next.modo_falla = '';
          next.causa_raiz = '';
        }
      }
      return next;
    });
  };

  const handleFailureModeChange = (value) => {
    if (value === 'NINGUNA') {
      setForm((prev) => ({
        ...prev,
        modo_falla_origen: 'NINGUNA',
        componente_intervenido: prev.componente_intervenido || 'N.A.',
        modo_falla: 'Ninguna',
        causa_raiz: prev.causa_raiz || 'N.A.',
        accion_correctiva: prev.accion_correctiva || 'N.A.',
        recomendacion_tecnica: prev.recomendacion_tecnica || 'N.A.',
      }));
      return;
    }

    if (value === 'MANUAL') {
      setForm((prev) => ({
        ...prev,
        modo_falla_origen: 'MANUAL',
        modo_falla: '',
        causa_raiz: '',
      }));
      return;
    }

    const selectedAmef = amefOptions.find((item) => item.id === String(value));
    if (!selectedAmef) return;

    if (selectedAmef.componentId) {
      setAmefComponentFilter(String(selectedAmef.componentId));
    }

    setForm((prev) => ({
      ...prev,
      modo_falla_origen: selectedAmef.id,
      componente_intervenido: selectedAmef.componente || prev.componente_intervenido,
      modo_falla: selectedAmef.modo_falla || '',
      causa_raiz: selectedAmef.causa_falla || '',
      accion_correctiva: prev.accion_correctiva || selectedAmef.accion_recomendada || '',
      recomendacion_tecnica: prev.recomendacion_tecnica || selectedAmef.accion_recomendada || '',
    }));
  };

  const submit = () => {
    if (maxHorasSugeridas <= 0) {
      window.alert('La fecha/hora fin debe ser mayor a la fecha/hora inicio para poder cerrar la OT.');
      return;
    }
    if (serviceSummary.hasMissingServiceCost) {
      window.alert(`No puedes cerrar esta OT porque hay ${serviceSummary.missingCostReports.length} notificacion(es) de servicio sin costo registrado.`);
      return;
    }
    const reportsMissingEvidence = findReportsMissingRequiredEvidence(editableReports);
    if (reportsMissingEvidence.length) {
      window.alert(`No puedes cerrar esta OT porque ${reportsMissingEvidence.length} notificacion(es) no tienen foto ANTES y DESPUES.`);
      return;
    }
    if ((!form.tiempo_efectivo_hh || Number(form.tiempo_efectivo_hh) <= 0) && serviceSummary.serviceReports.length === 0) {
      window.alert('No hay horas acumuladas en las notificaciones de trabajo para cerrar la OT.');
      return;
    }
    if (gapPeriods.length && !canClassifyGapPeriods) {
      window.alert('Solo Encargado, Planner o Ingeniero pueden confirmar los periodos sin notificacion antes del cierre.');
      return;
    }
    if (pendingGapPeriods.length) {
      window.alert(`Esta OT tiene ${pendingGapPeriods.length} periodo(s) sin notificacion pendiente(s) de clasificar. Confirma si el equipo estuvo operativo, parado o fuera de turno antes de cerrar.`);
      return;
    }
    const invalidPartialGap = gapPeriods.find((gap) => normalizeGapStatus(gap.estado) === 'PARADA_PARCIAL' && getGapUnavailableHours(gap) <= 0);
    if (invalidPartialGap) {
      window.alert('Hay un periodo sin notificacion marcado como parada parcial, pero no tiene un rango de parada valido.');
      return;
    }
    if (form.cierre_observation_preset && !String(form.cierre_observation_detail || '').trim()) {
      window.alert('Detalla la observacion de cierre antes de cerrar la OT.');
      return;
    }
    const numericValidationError = validateNonNegativeFields([
      ['Tiempo efectivo', form.tiempo_efectivo_hh],
      ['Tiempo indisponible generico', form.tiempo_indisponible_generico],
      ['Tiempo indisponible operacional', form.tiempo_indisponible_operacional],
      ['Costo por tonelada hora', form.costo_tonelada_hora || 0],
    ]);
    if (numericValidationError) {
      window.alert(numericValidationError);
      return;
    }
    if (Number(form.tiempo_indisponible_operacional) > Number(form.tiempo_indisponible_generico || 0)) {
      window.alert('El tiempo indisponible operacional no puede ser mayor al tiempo indisponible genérico.');
      return;
    }
    const isNoFailureMode = form.modo_falla_origen === 'NINGUNA'
      || String(form.modo_falla || '').trim().toLowerCase() === 'ninguna';
    if (!String(form.modo_falla || '').trim()) {
      window.alert('Debes seleccionar un modo de falla desde el AMEF, registrar uno manual o elegir la opción Ninguna.');
      return;
    }
    if (!isNoFailureMode && !String(form.componente_intervenido || selectedAmefOption?.componente || '').trim()) {
      window.alert('Debes indicar el componente intervenido antes de cerrar la OT.');
      return;
    }
    if (!isNoFailureMode && !String(form.causa_raiz || '').trim()) {
      window.alert('Debes registrar la causa raiz antes de cerrar la OT.');
      return;
    }
    if (!isNoFailureMode && !String(form.accion_correctiva || '').trim()) {
      window.alert('Debes registrar la accion correctiva ejecutada antes de cerrar la OT.');
      return;
    }
    const textValidationError = validateTextFields([
      ['Componente intervenido', isNoFailureMode ? 'N.A.' : form.componente_intervenido],
      ['Modo de falla', form.modo_falla],
      ['Causa raiz', isNoFailureMode ? 'N.A.' : form.causa_raiz],
      ['Accion correctiva', isNoFailureMode ? 'N.A.' : form.accion_correctiva],
      ['Recomendacion tecnica', isNoFailureMode ? 'N.A.' : form.recomendacion_tecnica],
      ['Observaciones de cierre', form.observaciones],
    ]);
    if (textValidationError) {
      window.alert(textValidationError);
      return;
    }
    if (exchangeForm.enabled) {
      if (!exchangeForm.sourceId || !exchangeForm.nodeId || !exchangeForm.targetId) {
        window.alert('Completa origen, subequipo y destino del intercambio antes de cerrar la OT.');
        return;
      }
      if (String(exchangeForm.sourceId) === String(exchangeForm.targetId)) {
        window.alert('El equipo destino del intercambio debe ser diferente al equipo origen.');
        return;
      }
    }
    let updateEquipmentCapacity = false;
    if (hasEquipmentStopForDowntimeCost && equipmentCapacityMissing && String(form.capacidad_equipo_manual || '').trim() && equipmentCapacityValue > 0) {
      updateEquipmentCapacity = window.confirm('Este equipo no tiene capacidad registrada en inventario. Deseas guardar esta capacidad tambien en el maestro del equipo?');
    }

    onSubmit({
      ...form,
      componente_intervenido: isNoFailureMode ? (form.componente_intervenido || 'N.A.') : (form.componente_intervenido || selectedAmefOption?.componente || ''),
      modo_falla_origen: isNoFailureMode ? 'NINGUNA' : form.modo_falla_origen,
      causa_raiz: isNoFailureMode ? (form.causa_raiz || 'N.A.') : form.causa_raiz,
      accion_correctiva: isNoFailureMode ? (form.accion_correctiva || 'N.A.') : form.accion_correctiva,
      recomendacion_tecnica: isNoFailureMode ? (form.recomendacion_tecnica || 'N.A.') : form.recomendacion_tecnica,
      tiempo_efectivo_hh: Number(form.tiempo_efectivo_hh || 0),
      tiempo_indisponible_generico: Number(form.tiempo_indisponible_generico || 0),
      tiempo_indisponible_operacional: Number(form.tiempo_indisponible_operacional || 0),
      capacidad_equipo: effectiveCapacityText || 'N.A.',
      capacidad_equipo_valor: equipmentCapacityValue,
      actualizar_capacidad_equipo: updateEquipmentCapacity,
      capacidad_equipo_manual: form.capacidad_equipo_manual || '',
      costo_tonelada_hora: hasEquipmentStopForDowntimeCost ? Number(form.costo_tonelada_hora || 0) : 0,
      costo_indisponibilidad: hasEquipmentStopForDowntimeCost ? downtimeCost : 0,
      periodos_sin_notificacion: gapPeriods.map((gap) => ({
        ...gap,
        horas_indisponibles: getGapUnavailableHours(gap),
      })),
      periodos_ciclo_ot: lifecycleGapPeriods.map((gap) => ({
        ...gap,
        horas_indisponibles: getGapUnavailableHours(gap),
      })),
      horas_indisponibles_notificaciones: reportUnavailableHours,
      horas_indisponibles_periodos_sin_notificacion: gapUnavailableHours,
      horas_indisponibles_ciclo_ot: lifecycleUnavailableHours,
      reportes_actualizados: editableReports.map((item) => ({
        ...item,
        serviceCost: Number(item.serviceCost || 0),
      })),
      costo_servicios_total: serviceSummary.totalServiceCost,
      avisos_generados_detalle: [
        ...derivedNotices.filter((item) => selectedNoticeIds.includes(item.id)),
        ...(selectedCloseObservationPreset?.requiresNotice ? buildMaintenanceNoticesFromReports(alert, [{
          id: `close_observation_${alert.id}`,
          reportCode: `CIERRE-${alert.ot_numero || alert.id}`,
          fechaInicio: form.fecha_fin,
          horaInicio: form.hora_fin,
          fechaFin: form.fecha_fin,
          horaFin: form.hora_fin,
          observaciones: form.observaciones,
          maintenanceSuggestion: {
            presetKey: form.cierre_observation_preset,
            label: selectedCloseObservationPreset.label,
            noticeCategory: selectedCloseObservationPreset.noticeCategory,
            detail: form.cierre_observation_detail,
            text: form.observaciones,
            requiresNotice: true,
          },
          evidencePhotos: getWorkReportEvidencePhotos(editableReports[editableReports.length - 1] || {}),
        }], derivedNotices, 'Revision de cierre') : []),
      ],
      intercambio_realizado: exchangeForm.enabled ? {
        enabled: true,
        sourceId: exchangeForm.sourceId,
        nodeId: exchangeForm.nodeId,
        targetId: exchangeForm.targetId,
        motivo: exchangeForm.motivo,
      } : { enabled: false },
    });
  };

  const toggleReportExpanded = (reportId) => {
    setExpandedReportIds((prev) => ({ ...prev, [reportId]: !prev[reportId] }));
  };

  const returnToLiberated = () => {
    if (!String(form.motivo_devolucion_tipo || '').trim()) {
      window.alert('Selecciona un motivo de devolución antes de regresar la OT a Liberada.');
      return;
    }
    if (!String(form.motivo_devolucion_detalle || '').trim()) {
      window.alert('Detalla la observación que debe corregirse antes de devolver la OT a Liberada.');
      return;
    }
    if (!String(form.responsable_correccion || '').trim()) {
      window.alert('Indica el responsable de corrección antes de devolver la OT.');
      return;
    }
    if (!String(form.fecha_objetivo_reenvio || '').trim()) {
      window.alert('Indica la fecha objetivo de reenvío antes de devolver la OT.');
      return;
    }
    const confirmed = window.confirm('La OT volverá a estado Liberada para que los técnicos corrijan las notificaciones de trabajo. ¿Deseas continuar?');
    const textValidationError = validateTextFields([
      ['Motivo de devolucion', form.motivo_devolucion_tipo],
      ['Detalle de devolucion', form.motivo_devolucion_detalle],
      ['Responsable de correccion', form.responsable_correccion],
    ]);
    if (textValidationError) {
      window.alert(textValidationError);
      return;
    }
    if (!confirmed) return;
    onReturnToLiberated(form);
  };

  const returnToLiberatedPanel = (
    <div
      className="card"
      style={{
        marginTop: isReturnIntent ? 0 : '.9rem',
        border: '1px solid #fca5a5',
        background: '#fff5f5',
      }}
    >
      <div style={{ marginBottom: '.75rem' }}>
        <h4 className="card-title" style={{ marginBottom: '.2rem', color: '#991b1b' }}>Si devuelves la OT a Liberada</h4>
        <p style={{ color: '#991b1b', margin: 0 }}>
          Completa este bloque para que el tecnico sepa exactamente que corregir y cuando debe reenviar la OT a revision.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ color: '#991b1b', fontWeight: 700 }}>Motivo estructurado *</label>
          <select
            className="form-select"
            value={form.motivo_devolucion_tipo}
            onChange={(e) => setForm({ ...form, motivo_devolucion_tipo: e.target.value })}
          >
            <option value="">Selecciona motivo</option>
            {RETURN_REASON_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <ConfigurableSelectField
            label={<div className="form-label" style={{ color: '#991b1b', fontWeight: 700, marginBottom: 0 }}>Responsable de correccion *</div>}
            manageLabel="Responsable de correccion"
            value={form.responsable_correccion}
            options={responsibleOptions}
            onChange={(e) => setForm({ ...form, responsable_correccion: e.target.value })}
            onQuickAdd={async () => {
              const result = await addOptionQuickly('responsables', 'Responsable');
              if (result?.added) {
                setForm((prev) => ({ ...prev, responsable_correccion: result.value }));
              }
            }}
            canManageOptions={canManageConfigurableLists}
            placeholder="Selecciona responsable"
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ color: '#991b1b', fontWeight: 700 }}>Fecha objetivo de reenvio *</label>
          <input
            type="date"
            className="form-input"
            value={form.fecha_objetivo_reenvio}
            onChange={(e) => setForm({ ...form, fecha_objetivo_reenvio: e.target.value })}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
          <label className="form-label" style={{ color: '#991b1b', fontWeight: 700 }}>Detalle visible para correccion *</label>
          <textarea
            className="form-textarea"
            value={form.motivo_devolucion_detalle}
            onChange={(e) => setForm({ ...form, motivo_devolucion_detalle: e.target.value })}
            placeholder="Ej: Corregir fechas de liberacion, completar costo de servicio y definir modo de falla antes de reenviar."
            style={{ borderColor: '#fca5a5', background: '#fff' }}
          />
        </div>
      </div>
    </div>
  );

  if (isReturnIntent) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .5)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="close-ot-modal-shell close-ot-return-shell" style={{ width: 'min(760px, 100%)', maxHeight: '93vh', overflow: 'auto', background: '#fff', borderRadius: '.9rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
          <div className="close-ot-modal-header" style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.85rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '.15rem' }}>Devolver OT a Liberada - {alert.ot_numero || 'OT #?'}</h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: '.92rem' }}>
                Registra solo la correccion requerida para que el tecnico pueda reenviar la OT a revision.
              </p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar ventana</button>
          </div>

          <div className="close-ot-modal-body" style={{ padding: '1rem 1.2rem' }}>
            <div className="close-ot-overview" aria-label="Resumen de devolucion de OT" style={{ marginBottom: '.9rem' }}>
              <div className="close-ot-overview-item">
                <span>Equipo</span>
                <strong>{form.codigo || alert.codigo || 'N.A.'}</strong>
                <small>{form.descripcion || alert.descripcion || 'Sin descripcion'}</small>
              </div>
              <div className="close-ot-overview-item">
                <span>Estado actual</span>
                <strong>{alert.estado_ot || 'Solicitud de cierre'}</strong>
                <small>{editableReports.length} notificacion(es)</small>
              </div>
            </div>
            {returnToLiberatedPanel}
          </div>

          <div className="close-ot-modal-footer" style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '.65rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-danger" onClick={returnToLiberated}>Devolver a Liberada</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .5)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <ImagePreviewModal
        src={previewPhoto?.url}
        alt={previewPhoto?.alt || 'Evidencia fotografica'}
        title="Evidencia fotografica"
        onClose={() => setPreviewPhoto(null)}
      />
      <div className="close-ot-modal-shell" style={{ width: 'min(1180px, 100%)', maxHeight: '93vh', overflow: 'auto', background: '#fff', borderRadius: '.9rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div className="close-ot-modal-header" style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.85rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '.15rem' }}>Cerrar Orden de Trabajo · {alert.ot_numero || 'OT #?'}</h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: '.92rem' }}>
              Revisa ejecucion, continuidad operativa, costos y cierre tecnico antes de confirmar.
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar ventana</button>
        </div>

        <div className="close-ot-modal-body" style={{ padding: '1rem 1.2rem' }}>
          {serviceSummary.hasMissingServiceCost && (
            <div className="alert alert-warning" style={{ marginBottom: '.9rem' }}>
              Esta OT tiene {serviceSummary.missingCostReports.length} notificacion(es) de servicio sin costo registrado.
              Revisalas antes de cerrar o devuelve la OT a Liberada para corregirlas.
            </div>
          )}
          {isReturnIntent && (
            <div
              className="alert alert-error"
              style={{
                marginBottom: '.9rem',
                border: '1px solid #fca5a5',
                background: '#fef2f2',
              }}
            >
              Estas en modo de devolucion. Completa el motivo estructurado, define el responsable de correccion y la fecha objetivo de reenvio antes de devolver la OT a Liberada.
            </div>
          )}

          <div className="close-ot-overview" aria-label="Resumen del cierre de OT">
            <div className="close-ot-overview-item">
              <span>Equipo</span>
              <strong>{form.codigo || alert.codigo || 'N.A.'}</strong>
              <small>{form.descripcion || alert.descripcion || 'Sin descripcion'}</small>
            </div>
            <div className="close-ot-overview-item">
              <span>Notificaciones</span>
              <strong>{editableReports.length}</strong>
              <small>{serviceSummary.serviceReports.length} servicio(s)</small>
            </div>
            <div className="close-ot-overview-item">
              <span>Indisponibilidad</span>
              <strong>{Number(form.tiempo_indisponible_operacional || 0).toFixed(2)} Hh</strong>
              <small>{pendingGapPeriods.length} periodo(s) por revisar</small>
            </div>
            <div className="close-ot-overview-item">
              <span>Costo indisp.</span>
              <strong>S/ {formatCost(downtimeCost)}</strong>
              <small>{hasEquipmentStopForDowntimeCost ? 'Aplica por parada' : 'Sin parada registrada'}</small>
            </div>
          </div>

          <div className="close-ot-flow" aria-label="Secciones del formulario">
            {['Datos', 'Ejecucion', 'Continuidad', 'Recursos', 'Costos', 'Tecnico', 'Intercambio'].map((item, index) => (
              <span key={`close-flow-${item}`}>
                <b>{index + 1}</b>
                {item}
              </span>
            ))}
          </div>

          <div className="card">
            <div className="close-ot-section-title">
              <span>1</span>
              <div>
                <h4>Datos generales de la OT</h4>
                <p>Fechas, responsable y datos principales que alimentaran el historial.</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Código</label><input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Tipo de mantenimiento</label><input className="form-input" value={form.tipo_mantenimiento} onChange={(e) => setForm({ ...form, tipo_mantenimiento: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label className="form-label">Descripción</label><input className="form-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Puesto trabajo resp.</label><input className="form-input" value={form.puesto_trabajo_resp} onChange={(e) => setForm({ ...form, puesto_trabajo_resp: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Fecha inicio</label><input type="date" className="form-input" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Hora inicio</label><input type="time" className="form-input" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Fecha fin</label><input type="date" className="form-input" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Hora fin</label><input type="time" className="form-input" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1', color: '#64748b', fontSize: '.88rem', lineHeight: 1.45 }}>
                Referencia inicial: {closeReferenceRange.source === 'reports'
                  ? 'inicio de la primera notificacion y fin de la ultima notificacion registrada.'
                  : 'rango liberado de la OT porque aun no hay notificaciones validas.'}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="close-ot-section-title">
              <span>2</span>
              <div>
                <h4>Ejecucion y evidencia</h4>
                <p>Actividades, observaciones y notificaciones que sustentan el trabajo realizado.</p>
              </div>
            </div>
            <h4 className="card-title" style={{ marginBottom: '.35rem' }}>Actividades de la OT</h4>
            <p style={{ margin: '0 0 .75rem', color: '#64748b', fontSize: '.9rem' }}>
              Estas son las actividades planificadas que se imprimiran en el formato de OT.
            </p>
            {closeActivityRows.length ? (
              <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '.35rem' }}>
                {closeActivityRows.map((item, index) => (
                  <li key={`close_activity_${index}_${item}`} style={{ color: '#0f172a', fontWeight: 600 }}>{item}</li>
                ))}
              </ol>
            ) : (
              <div style={{ border: '1px dashed #cbd5e1', borderRadius: '.75rem', padding: '.85rem', color: '#64748b' }}>
                Sin actividades registradas para esta OT.
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Observacion de cierre</h4>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '.9rem' }}>
                  Usa este bloque solo si el cierre deja una condicion que debe convertirse en aviso de mantenimiento.
                </p>
              </div>
              {selectedCloseObservationPreset?.requiresNotice && (
                <span style={{ alignSelf: 'flex-start', background: '#fff7ed', color: '#b45309', border: '1px solid #fed7aa', borderRadius: '999px', padding: '.25rem .6rem', fontWeight: 800 }}>
                  Generara aviso
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
              {WORK_OBSERVATION_PRESETS.map((item) => (
                <button
                  key={`close_${item.key}`}
                  type="button"
                  className={form.cierre_observation_preset === item.key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => setForm((prev) => ({ ...prev, cierre_observation_preset: prev.cierre_observation_preset === item.key ? '' : item.key, cierre_observation_detail: prev.cierre_observation_preset === item.key ? '' : prev.cierre_observation_detail, observaciones: prev.cierre_observation_preset === item.key ? '' : prev.observaciones }))}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {form.cierre_observation_preset && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Detalle de observacion</label>
                <textarea
                  className="form-textarea"
                  value={form.cierre_observation_detail}
                  onChange={(e) => setForm((prev) => ({ ...prev, cierre_observation_detail: e.target.value }))}
                  placeholder="Describe la condicion encontrada al cierre."
                />
                <small style={{ color: selectedCloseObservationPreset?.requiresNotice ? '#b45309' : '#64748b', fontWeight: selectedCloseObservationPreset?.requiresNotice ? 700 : 500 }}>
                  {selectedCloseObservationPreset?.requiresNotice
                    ? 'Esta observacion se convertira en aviso al cerrar la OT.'
                    : 'Esta observacion quedara solo como informacion del cierre.'}
                </small>
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', marginBottom: '.8rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Notificaciones de trabajo</h4>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '.9rem' }}>
                  Revisa aquí los subregistros antes de cerrar la OT. Si algo está mal, devuélvela a liberada para que sea corregida.
                </p>
              </div>
              <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{editableReports.length} registro(s)</span>
            </div>
            {serviceSummary.serviceReports.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem', marginBottom: '.85rem' }}>
                <div style={{ background: '#ecfeff', border: '1px solid #99f6e4', borderRadius: '.75rem', padding: '.8rem .9rem' }}>
                  <div style={{ fontSize: '.8rem', color: '#0f766e', textTransform: 'uppercase', fontWeight: 700 }}>Servicios registrados</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#115e59' }}>{serviceSummary.serviceReports.length}</div>
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '.75rem', padding: '.8rem .9rem' }}>
                  <div style={{ fontSize: '.8rem', color: '#166534', textTransform: 'uppercase', fontWeight: 700 }}>Costo total servicios</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#166534' }}>S/ {serviceSummary.totalServiceCost.toFixed(2)}</div>
                </div>
                <div style={{ background: serviceSummary.hasMissingServiceCost ? '#fef2f2' : '#eff6ff', border: `1px solid ${serviceSummary.hasMissingServiceCost ? '#fca5a5' : '#bfdbfe'}`, borderRadius: '.75rem', padding: '.8rem .9rem' }}>
                  <div style={{ fontSize: '.8rem', color: serviceSummary.hasMissingServiceCost ? '#991b1b' : '#1d4ed8', textTransform: 'uppercase', fontWeight: 700 }}>Servicios sin costo</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: serviceSummary.hasMissingServiceCost ? '#991b1b' : '#1d4ed8' }}>{serviceSummary.missingCostReports.length}</div>
                </div>
              </div>
            )}
            {serviceSummary.serviceReports.length > 0 && (
              <div style={{ display: 'grid', gap: '.65rem', marginBottom: '.85rem' }}>
                {serviceSummary.serviceReports.map((report) => (
                  <div key={`service_resume_${report.id}`} style={{ border: '1px solid #e5e7eb', borderRadius: '.75rem', padding: '.8rem .9rem', background: '#ffffff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{report.reportCode || 'Servicio sin codigo'} · {getServiceProviderLabel(report)}</div>
                        <div style={{ color: '#64748b', fontSize: '.9rem', marginTop: '.15rem' }}>
                          {formatDateTimeDisplay(report.fechaInicio || '', report.horaInicio || '', 'N.A.')} · {formatDateTimeDisplay(report.fechaFin || '', report.horaFin || '', 'N.A.')}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, color: getServiceCost(report) > 0 ? '#0f766e' : '#b91c1c' }}>
                        S/ {getServiceCost(report).toFixed(2)}
                      </div>
                    </div>
                    <div style={{ marginTop: '.45rem', color: '#334155', whiteSpace: 'pre-wrap' }}>
                      {report.serviceActivity || report.observaciones || 'Sin detalle de servicio.'}
                    </div>
                    <div style={{ marginTop: '.7rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.65rem', alignItems: 'end' }}>
                      <div>
                        <label className="form-label">Costo del servicio</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-input"
                          value={report.serviceCost ?? ''}
                          onChange={(e) => updateServiceReportCost(report.id, e.target.value)}
                          placeholder="Ej: 1250.00"
                        />
                      </div>
                      <div style={{ color: getServiceCost(report) > 0 ? '#166534' : '#b45309', fontWeight: 600, fontSize: '.92rem' }}>
                        {getServiceCost(report) > 0
                          ? 'Costo completo para cierre.'
                          : 'Completa este costo para habilitar el cierre de la OT.'}
                      </div>
                    </div>
                    {!(getServiceCost(report) > 0) && (
                      <div style={{ marginTop: '.45rem', color: '#991b1b', fontWeight: 700 }}>
                        Falta registrar el costo del servicio. La OT no podra cerrarse hasta completarlo.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '.75rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    {['Detalle', 'Código', 'Inicio', 'Fin', 'Horas', 'Técnicos', 'Materiales extra', 'Observaciones'].map((header) => (
                      <th key={header} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{header}</th>
                    ))}
                  </tr>
                  <TableFilterRow columns={closeReportColumns} rows={editableReports} filters={closeReportFilters.filters} onChange={closeReportFilters.setFilter} />
                </thead>
                <tbody>
                  {visibleCloseReports.map((report, index) => {
                    const isExpanded = !!expandedReportIds[report.id];
                    return (
                      <React.Fragment key={report.id}>
                        <tr>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleReportExpanded(report.id)}>
                              {isExpanded ? 'Ocultar' : 'Ver'} detalle
                            </button>
                          </td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{report.reportCode || `NT${index + 1}-${alert.ot_numero || alert.id}`}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{formatDateTimeDisplay(report.fechaInicio || '', report.horaInicio || '', 'N.A.')}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{formatDateTimeDisplay(report.fechaFin || '', report.horaFin || '', 'N.A.')}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{Number(report.totalHoras || 0).toFixed(2)}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{report.tecnicos?.length || 0}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{report.materialesExtra?.length || 0}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{report.observaciones || 'N.A.'}</td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ background: '#f8fafc' }}>
                            <td colSpan={8} style={{ border: '1px solid #e5e7eb', padding: '.7rem .8rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '.8rem' }}>
                                <div style={{ gridColumn: '1 / -1', border: '1px solid #bfdbfe', borderRadius: '.75rem', padding: '.75rem .85rem', background: '#eff6ff' }}>
                                  <div style={{ fontWeight: 800, color: '#1e3a8a', marginBottom: '.55rem' }}>Editar notificacion antes del cierre</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.65rem' }}>
                                    <div>
                                      <label className="form-label">Fecha inicio</label>
                                      <input type="date" className="form-input" value={report.fechaInicio || ''} onChange={(e) => updateEditableReport(report.id, { fechaInicio: e.target.value })} />
                                    </div>
                                    <div>
                                      <label className="form-label">Hora inicio</label>
                                      <input type="time" className="form-input" value={report.horaInicio || ''} onChange={(e) => updateEditableReport(report.id, { horaInicio: e.target.value })} />
                                    </div>
                                    <div>
                                      <label className="form-label">Fecha fin</label>
                                      <input type="date" className="form-input" value={report.fechaFin || ''} onChange={(e) => updateEditableReport(report.id, { fechaFin: e.target.value })} />
                                    </div>
                                    <div>
                                      <label className="form-label">Hora fin</label>
                                      <input type="time" className="form-input" value={report.horaFin || ''} onChange={(e) => updateEditableReport(report.id, { horaFin: e.target.value })} />
                                    </div>
                                    <div>
                                      <label className="form-label">Estado equipo</label>
                                      <select className="form-select" value={report.estado_equipo || 'Operativo durante mantenimiento'} onChange={(e) => updateEditableReport(report.id, { estado_equipo: e.target.value, parada_alcance: e.target.value === 'Parada de equipo' ? (report.parada_alcance || 'total') : '' })}>
                                        <option>Operativo durante mantenimiento</option>
                                        <option>Parada de equipo</option>
                                      </select>
                                    </div>
                                    {report.estado_equipo === 'Parada de equipo' && (
                                      <>
                                        <div>
                                          <label className="form-label">Alcance parada</label>
                                          <select className="form-select" value={report.parada_alcance || 'total'} onChange={(e) => updateEditableReport(report.id, { parada_alcance: e.target.value })}>
                                            <option value="total">Todo el trabajo</option>
                                            <option value="parcial">Solo un momento</option>
                                          </select>
                                        </div>
                                        {report.parada_alcance === 'parcial' && (
                                          <>
                                            <div>
                                              <label className="form-label">Inicio parada</label>
                                              <input type="time" className="form-input" value={report.parada_hora_inicio || ''} onChange={(e) => updateEditableReport(report.id, { parada_hora_inicio: e.target.value })} />
                                            </div>
                                            <div>
                                              <label className="form-label">Fin parada</label>
                                              <input type="time" className="form-input" value={report.parada_hora_fin || ''} onChange={(e) => updateEditableReport(report.id, { parada_hora_fin: e.target.value })} />
                                            </div>
                                          </>
                                        )}
                                      </>
                                    )}
                                    <div style={{ gridColumn: '1 / -1' }}>
                                      <label className="form-label">Observaciones</label>
                                      <textarea className="form-textarea" value={report.observaciones || ''} onChange={(e) => updateEditableReport(report.id, { observaciones: e.target.value })} />
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, marginBottom: '.35rem', color: '#1f2937' }}>Técnicos</div>
                                  {(report.tecnicos || []).length ? (
                                    <ul style={{ margin: 0, paddingLeft: '1rem', color: '#374151' }}>
                                      {(report.tecnicos || []).map((item) => (
                                        <li key={`${report.id}_${item.tecnicoId || item.tecnico}`}>
                                          {item.tecnico || 'Técnico'}: {Number(item.horas || 0).toFixed(2)} h
                                        </li>
                                      ))}
                                    </ul>
                                  ) : <div style={{ color: '#6b7280' }}>Sin técnicos registrados.</div>}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, marginBottom: '.35rem', color: '#1f2937' }}>Materiales extra</div>
                                  {(report.materialesExtra || []).length ? (
                                    <ul style={{ margin: 0, paddingLeft: '1rem', color: '#374151' }}>
                                      {(report.materialesExtra || []).map((item) => (
                                        <li key={`${report.id}_${item.materialId || item.codigo || item.descripcion}`}>
                                          {item.codigo || item.descripcion || 'Material'} x{item.cantidad || 0}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : <div style={{ color: '#6b7280' }}>Sin materiales extra.</div>}
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <div style={{ fontWeight: 700, marginBottom: '.35rem', color: '#1f2937' }}>Trabajo realizado</div>
                                  <div style={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{report.observaciones || 'Sin observaciones.'}</div>
                                  {report.maintenanceSuggestion?.requiresNotice && (
                                    <div style={{ marginTop: '.45rem', color: '#b45309', fontWeight: 700 }}>
                                      Aviso sugerido: {report.maintenanceSuggestion.noticeCategory || report.maintenanceSuggestion.label}
                                    </div>
                                  )}
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <div style={{ fontWeight: 700, marginBottom: '.35rem', color: '#1f2937' }}>Evidencia fotografica</div>
                                  <div style={{ color: hasRequiredWorkReportEvidence(report) ? '#166534' : '#991b1b', fontWeight: 700, marginBottom: '.5rem' }}>
                                    {hasRequiredWorkReportEvidence(report) ? 'Fotos ANTES y DESPUES completas.' : 'Falta foto ANTES o DESPUES.'}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.55rem' }}>
                                    {['before', 'after'].map((slot) => {
                                      const photo = getWorkReportEvidencePhotos(report)[slot];
                                      const src = getPhotoSource(photo);
                                      const uploadKey = `${report.id}_${slot}`;
                                      return (
                                        <div key={slot} style={{ border: `1px solid ${src ? '#d1d5db' : '#fca5a5'}`, borderRadius: '.55rem', overflow: 'hidden', background: '#fff' }}>
                                          {src ? (
                                            <button
                                              type="button"
                                              onClick={() => setPreviewPhoto({ url: src, alt: slot === 'before' ? 'Foto antes' : 'Foto despues' })}
                                              style={{ display: 'block', width: '100%', border: 0, padding: 0, background: 'transparent', cursor: 'zoom-in' }}
                                            >
                                              <img src={src} alt={slot === 'before' ? 'Antes' : 'Despues'} style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }} />
                                            </button>
                                          ) : (
                                            <div style={{ minHeight: '110px', display: 'grid', placeItems: 'center', color: '#991b1b', fontWeight: 700 }}>
                                              Sin foto {slot === 'before' ? 'ANTES' : 'DESPUES'}
                                            </div>
                                          )}
                                          <label className="btn btn-secondary btn-sm" style={{ width: '100%', borderRadius: 0, cursor: uploadingClosePhotoSlot ? 'not-allowed' : 'pointer', opacity: uploadingClosePhotoSlot ? .65 : 1 }}>
                                            {uploadingClosePhotoSlot === uploadKey ? 'Subiendo...' : (src ? 'Reemplazar' : 'Subir foto')}
                                            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={!!uploadingClosePhotoSlot} onChange={(event) => uploadCloseReportEvidence(report.id, slot, event)} />
                                          </label>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {!visibleCloseReports.length && (
                    <tr>
                      <td colSpan={8} style={{ border: '1px solid #e5e7eb', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                        {editableReports.length ? 'Sin resultados para los filtros aplicados.' : 'No hay notificaciones de trabajo registradas para esta OT.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ border: pendingGapPeriods.length ? '1px solid #fbbf24' : '1px solid #dbe4f0', background: pendingGapPeriods.length ? '#fffbeb' : '#fff' }}>
            <div className="close-ot-section-title">
              <span>3</span>
              <div>
                <h4>Continuidad operativa</h4>
                <p>Clasifica los espacios sin notificacion y el ciclo aviso-OT para calcular indisponibilidad real.</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.8rem', flexWrap: 'wrap', marginBottom: '.8rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Continuidad operativa entre notificaciones</h4>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '.9rem' }}>
                  Clasifica los periodos donde no hubo notificacion de trabajo para calcular la indisponibilidad operacional real del equipo.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ padding: '.25rem .55rem', borderRadius: '999px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800 }}>
                  {gapPeriods.length} periodo(s)
                </span>
                <span style={{ padding: '.25rem .55rem', borderRadius: '999px', background: pendingGapPeriods.length ? '#fef3c7' : '#dcfce7', color: pendingGapPeriods.length ? '#92400e' : '#166534', fontWeight: 800 }}>
                  {pendingGapPeriods.length} pendiente(s)
                </span>
              </div>
            </div>

            {!canClassifyGapPeriods && gapPeriods.length > 0 && (
              <div className="alert alert-warning" style={{ marginBottom: '.85rem' }}>
                Solo Encargado, Planner o Ingeniero pueden confirmar estos periodos.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.65rem', marginBottom: '.85rem' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '.75rem', padding: '.75rem .85rem' }}>
                <div style={{ color: '#64748b', fontWeight: 700, fontSize: '.8rem' }}>Indisp. por notificaciones</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0f766e' }}>{reportUnavailableHours.toFixed(2)} h</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '.75rem', padding: '.75rem .85rem' }}>
                <div style={{ color: '#64748b', fontWeight: 700, fontSize: '.8rem' }}>Indisp. en periodos sin NT</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#b45309' }}>{gapUnavailableHours.toFixed(2)} h</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '.75rem', padding: '.75rem .85rem' }}>
                <div style={{ color: '#64748b', fontWeight: 700, fontSize: '.8rem' }}>Indisp. ciclo aviso-OT</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#7c3aed' }}>{lifecycleUnavailableHours.toFixed(2)} h</div>
              </div>
              <div style={{ background: '#ecfeff', border: '1px solid #99f6e4', borderRadius: '.75rem', padding: '.75rem .85rem' }}>
                <div style={{ color: '#0f766e', fontWeight: 700, fontSize: '.8rem' }}>Indisp. operacional total</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#115e59' }}>{totalOperationalUnavailableHours.toFixed(2)} h</div>
              </div>
            </div>

            <div style={{ marginBottom: '1rem', border: '1px solid #ddd6fe', borderRadius: '.85rem', padding: '.85rem', background: '#fbfaff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <div>
                  <div style={{ fontWeight: 900, color: '#3b0764' }}>Continuidad entre aviso, aceptacion, liberacion y ejecucion</div>
                  <div style={{ color: '#64748b', fontSize: '.9rem' }}>Confirma que paso con el equipo antes de iniciar la ejecucion de la OT.</div>
                </div>
                <span style={{ color: '#7c3aed', fontWeight: 900 }}>{lifecycleGapPeriods.length} tramo(s)</span>
              </div>
              {lifecycleGapPeriods.length ? (
                <div style={{ display: 'grid', gap: '.65rem' }}>
                  {lifecycleGapPeriods.map((gap, index) => {
                    const status = normalizeGapStatus(gap.estado);
                    const unavailable = getGapUnavailableHours(gap);
                    return (
                      <div key={gap.id} style={{ border: `1px solid ${status === 'PENDIENTE' ? '#fbbf24' : '#ddd6fe'}`, borderRadius: '.75rem', padding: '.75rem', background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.65rem', flexWrap: 'wrap', marginBottom: '.65rem' }}>
                          <div>
                            <div style={{ fontWeight: 900, color: '#0f172a' }}>Tramo #{index + 1}: {gap.etapa_inicio} - {gap.etapa_fin}</div>
                            <div style={{ color: '#475569', fontSize: '.9rem' }}>
                              {formatDateTimeDisplay(gap.fecha_inicio, gap.hora_inicio, 'N.A.')} - {formatDateTimeDisplay(gap.fecha_fin, gap.hora_fin, 'N.A.')}
                            </div>
                          </div>
                          <div style={{ color: unavailable > 0 ? '#b45309' : '#166534', fontWeight: 900 }}>
                            {unavailable.toFixed(2)} h indisponible
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '.65rem', alignItems: 'end' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Que ocurrio con el equipo?</label>
                            <select
                              className="form-select"
                              value={status}
                              disabled={!canClassifyGapPeriods}
                              onChange={(e) => updateLifecycleGapPeriod(gap.id, {
                                estado: e.target.value,
                                parada_fecha_inicio: e.target.value === 'PARADA_PARCIAL' ? (gap.parada_fecha_inicio || gap.fecha_inicio) : gap.parada_fecha_inicio,
                                parada_hora_inicio: e.target.value === 'PARADA_PARCIAL' ? (gap.parada_hora_inicio || gap.hora_inicio) : gap.parada_hora_inicio,
                                parada_fecha_fin: e.target.value === 'PARADA_PARCIAL' ? (gap.parada_fecha_fin || gap.fecha_fin) : gap.parada_fecha_fin,
                                parada_hora_fin: e.target.value === 'PARADA_PARCIAL' ? (gap.parada_hora_fin || gap.hora_fin) : gap.parada_hora_fin,
                              })}
                            >
                              <option value="PENDIENTE">Pendiente de confirmar</option>
                              <option value="OPERATIVO">Equipo operativo</option>
                              <option value="PARADA_TOTAL">Equipo parado todo el periodo</option>
                              <option value="PARADA_PARCIAL">Equipo parado parcialmente</option>
                              <option value="FUERA_TURNO">No aplica / fuera de turno</option>
                            </select>
                          </div>
                          {status === 'PARADA_PARCIAL' && (
                            <>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Inicio parada</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr .75fr', gap: '.4rem' }}>
                                  <input type="date" className="form-input" value={gap.parada_fecha_inicio || ''} disabled={!canClassifyGapPeriods} onChange={(e) => updateLifecycleGapPeriod(gap.id, { parada_fecha_inicio: e.target.value })} />
                                  <input type="time" className="form-input" value={gap.parada_hora_inicio || ''} disabled={!canClassifyGapPeriods} onChange={(e) => updateLifecycleGapPeriod(gap.id, { parada_hora_inicio: e.target.value })} />
                                </div>
                              </div>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Fin parada</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr .75fr', gap: '.4rem' }}>
                                  <input type="date" className="form-input" value={gap.parada_fecha_fin || ''} disabled={!canClassifyGapPeriods} onChange={(e) => updateLifecycleGapPeriod(gap.id, { parada_fecha_fin: e.target.value })} />
                                  <input type="time" className="form-input" value={gap.parada_hora_fin || ''} disabled={!canClassifyGapPeriods} onChange={(e) => updateLifecycleGapPeriod(gap.id, { parada_hora_fin: e.target.value })} />
                                </div>
                              </div>
                            </>
                          )}
                          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                            <label className="form-label">Observacion</label>
                            <textarea
                              className="form-textarea"
                              value={gap.observacion || ''}
                              disabled={!canClassifyGapPeriods}
                              onChange={(e) => updateLifecycleGapPeriod(gap.id, { observacion: e.target.value })}
                              placeholder="Ej: Equipo se mantuvo operativo hasta la liberacion / Equipo quedo parado esperando programacion."
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ border: '1px dashed #c4b5fd', borderRadius: '.75rem', padding: '.8rem', color: '#64748b', textAlign: 'center' }}>
                  No hay tramos suficientes entre aviso, aceptacion, liberacion y ejecucion para clasificar.
                </div>
              )}
            </div>

            {gapPeriods.length ? (
              <div style={{ display: 'grid', gap: '.75rem' }}>
                {gapPeriods.map((gap, index) => {
                  const status = normalizeGapStatus(gap.estado);
                  const unavailable = getGapUnavailableHours(gap);
                  return (
                    <div key={gap.id} style={{ border: `1px solid ${status === 'PENDIENTE' ? '#fbbf24' : '#d1d5db'}`, borderRadius: '.8rem', padding: '.85rem', background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.65rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
                        <div>
                          <div style={{ fontWeight: 900, color: '#0f172a' }}>Periodo #{index + 1}</div>
                          <div style={{ color: '#475569', fontSize: '.92rem' }}>
                            {formatDateTimeDisplay(gap.fecha_inicio, gap.hora_inicio, 'N.A.')} - {formatDateTimeDisplay(gap.fecha_fin, gap.hora_fin, 'N.A.')}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 900, color: '#334155' }}>{Number(gap.horas_periodo || 0).toFixed(2)} h</div>
                          <div style={{ color: unavailable > 0 ? '#b45309' : '#166534', fontWeight: 800, fontSize: '.85rem' }}>
                            {unavailable.toFixed(2)} h indisponible
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '.65rem', alignItems: 'end' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Que ocurrio con el equipo?</label>
                          <select
                            className="form-select"
                            value={status}
                            disabled={!canClassifyGapPeriods}
                            onChange={(e) => updateGapPeriod(gap.id, {
                              estado: e.target.value,
                              parada_fecha_inicio: e.target.value === 'PARADA_PARCIAL' ? (gap.parada_fecha_inicio || gap.fecha_inicio) : gap.parada_fecha_inicio,
                              parada_hora_inicio: e.target.value === 'PARADA_PARCIAL' ? (gap.parada_hora_inicio || gap.hora_inicio) : gap.parada_hora_inicio,
                              parada_fecha_fin: e.target.value === 'PARADA_PARCIAL' ? (gap.parada_fecha_fin || gap.fecha_fin) : gap.parada_fecha_fin,
                              parada_hora_fin: e.target.value === 'PARADA_PARCIAL' ? (gap.parada_hora_fin || gap.hora_fin) : gap.parada_hora_fin,
                            })}
                          >
                            <option value="PENDIENTE">Pendiente de confirmar</option>
                            <option value="OPERATIVO">Equipo operativo</option>
                            <option value="PARADA_TOTAL">Equipo parado todo el periodo</option>
                            <option value="PARADA_PARCIAL">Equipo parado parcialmente</option>
                            <option value="FUERA_TURNO">No aplica / fuera de turno</option>
                          </select>
                        </div>
                        {status === 'PARADA_PARCIAL' && (
                          <>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Inicio parada</label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr .75fr', gap: '.4rem' }}>
                                <input type="date" className="form-input" value={gap.parada_fecha_inicio || ''} disabled={!canClassifyGapPeriods} onChange={(e) => updateGapPeriod(gap.id, { parada_fecha_inicio: e.target.value })} />
                                <input type="time" className="form-input" value={gap.parada_hora_inicio || ''} disabled={!canClassifyGapPeriods} onChange={(e) => updateGapPeriod(gap.id, { parada_hora_inicio: e.target.value })} />
                              </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Fin parada</label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr .75fr', gap: '.4rem' }}>
                                <input type="date" className="form-input" value={gap.parada_fecha_fin || ''} disabled={!canClassifyGapPeriods} onChange={(e) => updateGapPeriod(gap.id, { parada_fecha_fin: e.target.value })} />
                                <input type="time" className="form-input" value={gap.parada_hora_fin || ''} disabled={!canClassifyGapPeriods} onChange={(e) => updateGapPeriod(gap.id, { parada_hora_fin: e.target.value })} />
                              </div>
                            </div>
                          </>
                        )}
                        <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                          <label className="form-label">Observacion</label>
                          <textarea
                            className="form-textarea"
                            value={gap.observacion || ''}
                            disabled={!canClassifyGapPeriods}
                            onChange={(e) => updateGapPeriod(gap.id, { observacion: e.target.value })}
                            placeholder="Ej: Equipo quedo operativo y produccion continuo normal / Equipo estuvo detenido esperando repuesto."
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ border: '1px dashed #cbd5e1', borderRadius: '.75rem', padding: '.9rem', color: '#64748b', textAlign: 'center' }}>
                No hay periodos sin notificacion dentro del rango liberado de esta OT.
              </div>
            )}
          </div>

          <div className="close-ot-section-title">
            <span>4</span>
            <div>
              <h4>Recursos usados</h4>
              <p>Personal y materiales que se trasladaran al formato y al historial.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            <div className="card">
              <h4 className="card-title">Personal de mantenimiento</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: '.45rem', marginBottom: '.6rem' }}>
                {closePersonnelColumns.map((column) => (
                  <input
                    key={column.id}
                    className="form-input"
                    value={closePersonnelFilters.filters[column.id] || ''}
                    onChange={(event) => closePersonnelFilters.setFilter(column.id, event.target.value)}
                    placeholder={`Filtrar ${column.label}`}
                  />
                ))}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                  <thead><tr style={{ background: '#f3f4f6' }}><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Código</th><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Nombres</th><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Especialidad</th></tr></thead>
                  <tbody>
                    {visibleClosePersonnel.map((p) => <tr key={p.id}><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{p.codigo}</td><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{p.nombres_apellidos}</td><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{p.especialidad}</td></tr>)}
                    {!visibleClosePersonnel.length && <tr><td colSpan={3} style={{ padding: '.7rem', textAlign: 'center', border: '1px solid #e5e7eb', color: '#6b7280' }}>{personalDetalle.length ? 'Sin resultados para los filtros aplicados.' : 'Sin personal asignado.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h4 className="card-title">Materiales utilizados</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: '.45rem', marginBottom: '.6rem' }}>
                {closeMaterialColumns.map((column) => (
                  <input
                    key={column.id}
                    className="form-input"
                    value={closeMaterialFilters.filters[column.id] || ''}
                    onChange={(event) => closeMaterialFilters.setFilter(column.id, event.target.value)}
                    placeholder={`Filtrar ${column.label}`}
                  />
                ))}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                  <thead><tr style={{ background: '#f3f4f6' }}><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Código</th><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Descripción</th><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Cant.</th></tr></thead>
                  <tbody>
                    {visibleCloseMaterials.map((m) => <tr key={m.id}><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{m.codigo}</td><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{m.descripcion}</td><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{m.cantidad}</td></tr>)}
                    {!visibleCloseMaterials.length && <tr><td colSpan={3} style={{ padding: '.7rem', textAlign: 'center', border: '1px solid #e5e7eb', color: '#6b7280' }}>{materialesDetalle.length ? 'Sin resultados para los filtros aplicados.' : 'Sin materiales registrados.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {derivedNotices.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', marginBottom: '.8rem' }}>
                <div>
                  <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Avisos de mantenimiento sugeridos</h4>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '.9rem' }}>
                    Estos avisos quedaran como propuesta dentro del cierre de la OT. No se publicaran automaticamente en Avisos de Mantenimiento.
                  </p>
                </div>
                <span style={{ fontWeight: 700, color: '#b45309' }}>{derivedNotices.length} aviso(s)</span>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '.75rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      {['Crear', 'Aviso', 'Fecha', 'Categoria', 'Detalle', 'Origen'].map((header) => (
                        <th key={header} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{header}</th>
                      ))}
                    </tr>
                    <TableFilterRow columns={closeNoticeColumns} rows={derivedNotices} filters={closeNoticeFilters.filters} onChange={closeNoticeFilters.setFilter} />
                  </thead>
                  <tbody>
                    {visibleCloseNotices.map((notice) => (
                      <tr key={notice.id}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedNoticeIds.includes(notice.id)}
                            onChange={() => setSelectedNoticeIds((prev) => (
                              prev.includes(notice.id) ? prev.filter((item) => item !== notice.id) : [...prev, notice.id]
                            ))}
                          />
                        </td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{notice.aviso_codigo}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{formatDateDisplay(notice.fecha_aviso || '', 'N.A.')}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem', color: getNoticeStatusColor(notice.status), fontWeight: 700 }}>{notice.categoria}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{summarizeNoticeForDisplay(notice)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{notice.source_report_code || 'N.A.'}</td>
                      </tr>
                    ))}
                    {!visibleCloseNotices.length && (
                      <tr>
                        <td colSpan={6} style={{ border: '1px solid #e5e7eb', padding: '.75rem', textAlign: 'center', color: '#6b7280' }}>
                          Sin resultados para los filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="close-ot-section-title">
              <span>5</span>
              <div>
                <h4>Tiempos y costos</h4>
                <p>Resumen economico y horas calculadas antes del cierre definitivo.</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tiempo efectivo (Hh)</label>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <input className="form-input" value={form.tiempo_efectivo_hh} readOnly />
                  <button type="button" className="btn btn-secondary" onClick={() => setShowTiempoModal(true)}>Ver detalle</button>
                </div>
                <small style={{ color: '#6b7280' }}>
                  Duracion real estimada: suma la HH mas grande de cada notificacion. HH hombre acumuladas: {totalHorasHombreCalculado.toFixed(2)}.
                </small>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Costo total servicios</label>
                <input className="form-input" value={`S/ ${serviceSummary.totalServiceCost.toFixed(2)}`} readOnly />
                <small style={{ color: serviceSummary.hasMissingServiceCost ? '#991b1b' : '#6b7280' }}>
                  {serviceSummary.hasMissingServiceCost
                    ? `Hay ${serviceSummary.missingCostReports.length} servicio(s) sin costo. Completa ese dato antes del cierre.`
                    : 'Suma acumulada de todas las notificaciones de tipo servicio.'}
                </small>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tiempo indisponible genérico (Hh)</label>
                <input className="form-input" value={form.tiempo_indisponible_generico} readOnly />
                <small style={{ color: '#6b7280' }}>
                  Calculado automáticamente como la diferencia entre fecha/hora fin y fecha/hora inicio.
                </small>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tiempo indisponible operacional (Hh)</label>
                <input
                  className="form-input"
                  value={form.tiempo_indisponible_operacional}
                  readOnly
                />
                <small style={{ color: '#6b7280' }}>
                  Se sugiere el mismo valor del tiempo genérico como máximo permitido, pero puedes ajustarlo si la indisponibilidad operacional fue menor.
                </small>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="close-ot-section-title">
              <span>5.1</span>
              <div>
                <h4>Indisponibilidad economica</h4>
                <p>Solo aplica cuando hubo parada de equipo registrada.</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '.8rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Costos por indisponibilidad</h4>
                <p style={{ color: '#64748b', margin: 0, fontSize: '.9rem' }}>
                  Calculado con la capacidad registrada del equipo, el costo manual por tonelada hora y el tiempo indisponible operacional.
                </p>
              </div>
              <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '999px', padding: '.3rem .65rem', fontWeight: 800 }}>
                S/ {formatCost(downtimeCost)}
              </span>
            </div>
            {!hasEquipmentStopForDowntimeCost && (
              <div className="alert alert-info" style={{ marginBottom: '.8rem' }}>
                No se registró parada del equipo. El costo por indisponibilidad queda en S/ 0.00 y no aplica costo por tonelada hora.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Capacidad registrada</label>
                <input
                  className="form-input"
                  value={equipmentCapacityMissing ? form.capacidad_equipo_manual : equipmentCapacityText}
                  readOnly={!equipmentCapacityMissing}
                  onChange={(e) => setForm({ ...form, capacidad_equipo_manual: e.target.value })}
                  placeholder={equipmentCapacityMissing ? 'Ej: 20 ton/h' : ''}
                />
                <small style={{ color: equipmentCapacityMissing ? '#b45309' : '#64748b', fontWeight: equipmentCapacityMissing ? 700 : 500 }}>
                  {equipmentCapacityMissing
                    ? `El inventario no tiene capacidad registrada. Valor numerico usado: ${equipmentCapacityValue || 0}.`
                    : `Valor numerico usado: ${equipmentCapacityValue || 0}. Se toma desde Inventario de equipos.`}
                </small>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Costo por tonelada hora</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  value={form.costo_tonelada_hora}
                  disabled={!hasEquipmentStopForDowntimeCost}
                  onChange={(e) => setForm({ ...form, costo_tonelada_hora: e.target.value })}
                  placeholder="Ej: 125.00"
                />
                <small style={{ color: hasEquipmentStopForDowntimeCost ? '#64748b' : '#b45309', fontWeight: hasEquipmentStopForDowntimeCost ? 500 : 700 }}>
                  {hasEquipmentStopForDowntimeCost ? 'Campo manual. Puedes dejarlo en blanco si no aplica.' : 'Solo se habilita cuando hubo parada del equipo.'}
                </small>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tiempo indisponible usado</label>
                <input className="form-input" value={`${form.tiempo_indisponible_operacional || 0} Hh`} readOnly />
                <small style={{ color: '#64748b' }}>Corresponde al tiempo indisponible operacional registrado.</small>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Costo por indisponibilidad</label>
                <input className="form-input" value={`S/ ${formatCost(downtimeCost)}`} readOnly />
                <small style={{ color: '#64748b' }}>
                  Capacidad x costo tonelada hora x tiempo indisponible.
                </small>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '.9rem' }}>
            <div className="close-ot-section-title">
              <span>6</span>
              <div>
                <h4>Cierre tecnico</h4>
                <p>Componente intervenido, modo de falla, causa y accion ejecutada.</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.8rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '.8rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.25rem' }}>Cierre tecnico de mantenimiento</h4>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  Define primero el componente intervenido y luego selecciona el modo de falla desde el AMEF. Asi el cierre queda mucho mas trazable y ordenado.
                </p>
              </div>
              <div style={{ color: '#2563eb', fontWeight: 700, fontSize: '.9rem', textAlign: 'right' }}>
                {amefComponentOptions.length} componente(s) · {amefOptions.length} modo(s) desde AMEF
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Componente desde AMEF</label>
                <select
                  className="form-select"
                  value={amefComponentFilter || ''}
                  onChange={(e) => handleAmefComponentChange(e.target.value)}
                >
                  <option value="">{amefComponentOptions.length ? 'Todos los componentes AMEF' : 'Sin componentes AMEF para este equipo'}</option>
                  {amefComponentOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre} ({item.count})
                    </option>
                  ))}
                </select>
                <small style={{ color: '#6b7280' }}>
                  Filtra los modos de falla del componente intervenido para cerrar la OT con mejor precision.
                </small>
              </div>

              <div
                style={{
                  padding: '.85rem .95rem',
                  borderRadius: '.9rem',
                  border: '1px solid #dbe4f0',
                  background: selectedAmefOption ? '#f8fbff' : '#f8fafc',
                  display: 'grid',
                  gap: '.2rem',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0f172a' }}>Modo seleccionado</div>
                {selectedAmefOption ? (
                  <>
                    <div style={{ color: '#2563eb', fontWeight: 800 }}>{selectedAmefOption.modo_falla}</div>
                    <div style={{ color: '#64748b', fontSize: '.84rem' }}>{selectedAmefOption.componente}</div>
                    <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', marginTop: '.2rem' }}>
                      <span style={{ padding: '.18rem .45rem', borderRadius: '999px', background: '#eff6ff', color: '#2563eb', fontWeight: 700, fontSize: '.75rem' }}>
                        NPR {selectedAmefOption.npr || 0}
                      </span>
                      <span style={{ padding: '.18rem .45rem', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '.75rem' }}>
                        {selectedAmefOption.estado_accion}
                      </span>
                      <span style={{ padding: '.18rem .45rem', borderRadius: '999px', background: '#fff7ed', color: '#b45309', fontWeight: 700, fontSize: '.75rem' }}>
                        Compromiso {formatDateDisplay(selectedAmefOption.fecha_compromiso || '', 'N.A.')}
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#64748b', fontSize: '.84rem' }}>
                    Usa el selector de modo de falla para elegir AMEF, Ninguna o Manual.
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Modo de falla / fuente *</label>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowFailureModeCatalog(true)}>
                    Abrir catalogo
                  </button>
                </div>
                <select
                  className="form-select"
                  value={form.modo_falla_origen || ''}
                  onChange={(e) => handleFailureModeChange(e.target.value)}
                >
                  <option value="">Selecciona desde AMEF, registra uno manual o marca Ninguna</option>
                  <option value="NINGUNA">Ninguna</option>
                  <option value="MANUAL">Registrar modo manual</option>
                  {amefOptionsByComponent.map((group) => (
                    <optgroup key={group.id} label={group.nombre}>
                      {group.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {`${item.modo_falla || 'Sin modo'} · NPR ${item.npr || 0}`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <small style={{ color: '#6b7280' }}>
                  {amefComponentFilter
                    ? `Mostrando ${filteredAmefOptions.length} modo(s) para el componente filtrado.`
                    : 'Si el AMEF aun no cubre esta falla, puedes crear un modo manual solo para este cierre.'}
                </small>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Componente intervenido</label>
                <input
                  className="form-input"
                  value={form.componente_intervenido}
                  onChange={(e) => setForm({ ...form, componente_intervenido: e.target.value })}
                  placeholder="Ej: Reductor principal / Faja / Sensor"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Modo de falla *</label>
                <input
                  className="form-input"
                  value={form.modo_falla}
                  onChange={(e) => setForm({ ...form, modo_falla: e.target.value })}
                  placeholder="Ej: Fuga de aceite / Desalineacion / Sensor abierto"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Causa raiz</label>
                <textarea
                  className="form-textarea"
                  value={form.causa_raiz}
                  onChange={(e) => setForm({ ...form, causa_raiz: e.target.value })}
                  placeholder="Describe la causa raiz o la causa mas probable identificada."
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Accion correctiva ejecutada</label>
                <textarea
                  className="form-textarea"
                  value={form.accion_correctiva}
                  onChange={(e) => setForm({ ...form, accion_correctiva: e.target.value })}
                  placeholder="Explica que intervencion tecnica se realizo sobre el equipo."
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Recomendacion tecnica</label>
                <textarea
                  className="form-textarea"
                  value={form.recomendacion_tecnica}
                  onChange={(e) => setForm({ ...form, recomendacion_tecnica: e.target.value })}
                  placeholder="Deja la recomendacion preventiva o el siguiente control sugerido."
                />
              </div>
            </div>
          </div>

          <div
            className="card"
            style={{
              marginTop: '.9rem',
              border: exchangeForm.enabled ? '1px solid #bfdbfe' : '1px solid #e5e7eb',
              background: exchangeForm.enabled ? '#f8fbff' : '#fff',
            }}
          >
            <div className="close-ot-section-title">
              <span>7</span>
              <div>
                <h4>Intercambio de subequipo</h4>
                <p>Registra movimientos de sistemas o componentes entre equipos solo si ocurrieron durante la OT.</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '.8rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Intercambio de subequipo</h4>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  Activa este bloque solo si durante la OT se retiro un sistema o componente y se instalo en otro equipo.
                </p>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', fontWeight: 800, color: '#1d4ed8' }}>
                <input
                  type="checkbox"
                  checked={exchangeForm.enabled}
                  onChange={(e) => setExchangeForm((prev) => ({
                    ...prev,
                    enabled: e.target.checked,
                    sourceId: prev.sourceId || initialExchangeSourceId,
                  }))}
                />
                Se realizo intercambio
              </label>
            </div>

            {exchangeForm.enabled && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Equipo origen</label>
                  <input
                    className="form-input"
                    value={exchangeSourceQuery}
                    onChange={(e) => setExchangeSourceQuery(e.target.value)}
                    placeholder="Buscar equipo origen..."
                    style={{ marginBottom: '.4rem' }}
                  />
                  <select
                    className="form-select"
                    value={exchangeForm.sourceId || ''}
                    onChange={(e) => setExchangeForm((prev) => ({
                      ...prev,
                      sourceId: e.target.value,
                      nodeId: '',
                      targetId: (Array.isArray(equiposItems) ? equiposItems : []).find((eq) => String(eq.id) !== String(e.target.value))?.id || '',
                    }))}
                  >
                    {!filteredExchangeSourceOptions.some((eq) => String(eq.id) === String(exchangeForm.sourceId)) && exchangeSourceEquipo && (
                      <option value={exchangeSourceEquipo.id}>{getEquipmentLabel(exchangeSourceEquipo)}</option>
                    )}
                    {filteredExchangeSourceOptions.map((eq) => (
                      <option key={`exchange-source-${eq.id}`} value={eq.id}>{getEquipmentLabel(eq)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Subequipo retirado</label>
                  <select
                    className="form-select"
                    value={exchangeForm.nodeId || ''}
                    onChange={(e) => setExchangeForm((prev) => ({ ...prev, nodeId: e.target.value }))}
                  >
                    <option value="">Selecciona nivel del despiece</option>
                    {exchangeSourceNodes.map((node) => (
                      <option key={`exchange-node-${node.id}`} value={node.id}>
                        {getNodeLabel(node)} {node.tipo_nodo === 'titulo' ? '(sistema)' : '(componente)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Equipo destino</label>
                  <input
                    className="form-input"
                    value={exchangeTargetQuery}
                    onChange={(e) => setExchangeTargetQuery(e.target.value)}
                    placeholder="Buscar equipo destino..."
                    style={{ marginBottom: '.4rem' }}
                  />
                  <select
                    className="form-select"
                    value={exchangeForm.targetId || ''}
                    onChange={(e) => setExchangeForm((prev) => ({ ...prev, targetId: e.target.value }))}
                  >
                    <option value="">Selecciona destino</option>
                    {filteredExchangeTargetOptions.map((eq) => (
                      <option key={`exchange-target-${eq.id}`} value={eq.id}>{getEquipmentLabel(eq)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label className="form-label">Motivo / detalle del intercambio</label>
                  <textarea
                    className="form-textarea"
                    value={exchangeForm.motivo}
                    onChange={(e) => setExchangeForm((prev) => ({ ...prev, motivo: e.target.value }))}
                    placeholder="Ej: Se instalo motor disponible de equipo auxiliar por falla en rodamiento."
                  />
                </div>
              </div>
            )}
          </div>

          {isReturnIntent && (
          <div
            className="card"
            style={{
              marginTop: '.9rem',
              border: '1px solid #fca5a5',
              background: '#fff5f5',
            }}
          >
            <div style={{ marginBottom: '.75rem' }}>
              <h4 className="card-title" style={{ marginBottom: '.2rem', color: '#991b1b' }}>Si devuelves la OT a Liberada</h4>
              <p style={{ color: '#991b1b', margin: 0 }}>
                Completa este bloque para que el tecnico sepa exactamente que corregir y cuando debe reenviar la OT a revision.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ color: '#991b1b', fontWeight: 700 }}>Motivo estructurado *</label>
                <select
                  className="form-select"
                  value={form.motivo_devolucion_tipo}
                  onChange={(e) => setForm({ ...form, motivo_devolucion_tipo: e.target.value })}
                >
                  <option value="">Selecciona motivo</option>
                  {RETURN_REASON_OPTIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <ConfigurableSelectField
                  label={<div className="form-label" style={{ color: '#991b1b', fontWeight: 700, marginBottom: 0 }}>Responsable de correccion *</div>}
                  manageLabel="Responsable de correccion"
                  value={form.responsable_correccion}
                  options={responsibleOptions}
                  onChange={(e) => setForm({ ...form, responsable_correccion: e.target.value })}
                  onQuickAdd={async () => {
                    const result = await addOptionQuickly('responsables', 'Responsable');
                    if (result?.added) {
                      setForm((prev) => ({ ...prev, responsable_correccion: result.value }));
                    }
                  }}
                  canManageOptions={canManageConfigurableLists}
                  placeholder="Selecciona responsable"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ color: '#991b1b', fontWeight: 700 }}>Fecha objetivo de reenvio *</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.fecha_objetivo_reenvio}
                  onChange={(e) => setForm({ ...form, fecha_objetivo_reenvio: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label" style={{ color: '#991b1b', fontWeight: 700 }}>Detalle visible para correccion *</label>
                <textarea
                  className="form-textarea"
                  value={form.motivo_devolucion_detalle}
                  onChange={(e) => setForm({ ...form, motivo_devolucion_detalle: e.target.value })}
                  placeholder="Ej: Corregir fechas de liberacion, completar costo de servicio y definir modo de falla antes de reenviar."
                  style={{ borderColor: '#fca5a5', background: '#fff' }}
                />
              </div>
            </div>
          </div>
          )}
        </div>

        <div className="close-ot-modal-footer" style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '.65rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={submit}>Cerrar OT</button>
        </div>
      </div>

      {showFailureModeCatalog && (
        <FailureModeCatalogModal
          options={filteredAmefOptions}
          onPick={(value) => {
            handleFailureModeChange(value);
            setShowFailureModeCatalog(false);
          }}
          onClose={() => setShowFailureModeCatalog(false)}
        />
      )}

      {showTiempoModal && (
        <ModalTiempoEfectivo
          personalDetalle={personalDetalle}
          tiempoPersonalActual={form.tiempo_personal}
          maxHorasSugeridas={maxHorasSugeridas}
          readOnly
          description="Detalle acumulado por técnico a partir de todas las notificaciones de trabajo registradas para esta OT."
          onClose={() => setShowTiempoModal(false)}
          onSave={() => {}}
        />
      )}
    </div>
  );
}

function ModalOtLiberacion({ alert, rrhhItems, materialesItems, activeAlerts, mode = 'release', onClose, onSubmit }) {
  const [tab, setTab] = useState('registro');
  const [registro, setRegistro] = useState(() => {
    const existingRegistro = alert.registro_ot || {};
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    return {
      fecha_inicio: existingRegistro.fecha_inicio || now.toISOString().slice(0, 10),
      fecha_fin: existingRegistro.fecha_fin || now.toISOString().slice(0, 10),
      hora_inicio: existingRegistro.hora_inicio || hhmm,
      hora_fin: existingRegistro.hora_fin || hhmm,
      turno: existingRegistro.turno || 'Primero',
      observaciones: existingRegistro.observaciones || '',
    };
  });

  const [selectedPersonalId, setSelectedPersonalId] = useState(null);
  const [personalAsignado, setPersonalAsignado] = useState(Array.isArray(alert.personal_detalle) ? alert.personal_detalle : []);

  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [cantidadMaterial, setCantidadMaterial] = useState(1);
  const [materialesAsignados, setMaterialesAsignados] = useState(Array.isArray(alert.materiales_detalle) ? alert.materiales_detalle : []);
  const [releaseActivities, setReleaseActivities] = useState(() => cleanActivityRowsForDisplay(alert.actividad));
  const [newReleaseActivity, setNewReleaseActivity] = useState('');

  const eligibleRrhh = rrhhItems.filter(isInternalOtStaff);

  const isEditMode = mode === 'edit';
  const modalTitle = isEditMode ? 'Editar OT liberada' : 'Liberar Orden de Trabajo';
  const submitLabel = isEditMode ? 'Guardar cambios OT' : 'Liberar OT';

  const eligibleAssignableRrhh = useMemo(
    () => [
      ...eligibleRrhh,
      ...rrhhItems.filter((item) => (
        String(item.tipo_personal || '').toLowerCase() === 'tercero'
        && !eligibleRrhh.some((row) => String(row.id) === String(item.id))
      )),
    ],
    [eligibleRrhh, rrhhItems],
  );

  const selectedMaterial = useMemo(
    () => materialesItems.find((it) => String(it.id) === String(selectedMaterialId)) || null,
    [materialesItems, selectedMaterialId],
  );
  const reservedByOthers = useMemo(
    () => buildReservationMap(activeAlerts || [], alert.id),
    [activeAlerts, alert.id],
  );

  const addPersonal = () => {
    const item = eligibleAssignableRrhh.find((it) => String(it.id) === String(selectedPersonalId));
    if (!item) return;
    if (personalAsignado.some((p) => p.id === item.id)) return;
    setPersonalAsignado((prev) => [...prev, item]);
  };

  const removePersonal = (id) => {
    setPersonalAsignado((prev) => prev.filter((p) => p.id !== id));
  };

  const addMaterial = () => {
    const item = materialesItems.find((it) => String(it.id) === String(selectedMaterialId));
    const cantidad = Number(cantidadMaterial);
    const validationError = validatePositiveFields([['Cantidad de material', cantidadMaterial]]);
    if (!item || validationError) {
      if (validationError) window.alert(validationError);
      return;
    }
    const reservedByOtherOt = reservedByOthers.get(String(item.id)) || 0;
    const stockDisponible = Math.max((Number(item.stock) || 0) - reservedByOtherOt, 0);

    setMaterialesAsignados((prev) => {
      const existing = prev.find((m) => m.id === item.id);
      const cantidadActual = Number(existing?.cantidad) || 0;
      const nuevaCantidad = cantidadActual + cantidad;
      if (nuevaCantidad > stockDisponible) {
        window.alert(`No puedes asignar ${nuevaCantidad} ${item.unidad || 'UND'} de ${item.codigo}. Stock disponible: ${stockDisponible}.`);
        return prev;
      }
      if (existing) {
        return prev.map((m) => (m.id === item.id ? { ...m, cantidad: nuevaCantidad } : m));
      }
      return [...prev, { ...item, cantidad }];
    });
  };

  const removeMaterial = (id) => {
    setMaterialesAsignados((prev) => prev.filter((m) => m.id !== id));
  };

  const addReleaseActivity = () => {
    const value = newReleaseActivity.trim();
    if (!value) return;
    setReleaseActivities((prev) => [...prev, value]);
    setNewReleaseActivity('');
  };

  const updateReleaseActivity = (index, value) => {
    setReleaseActivities((prev) => prev.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const removeReleaseActivity = (index) => {
    setReleaseActivities((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const submit = () => {
    const validationError = firstValidationError(
      validateRequiredFields([
        ['Fecha inicio', registro.fecha_inicio],
        ['Fecha fin', registro.fecha_fin],
        ['Hora inicio', registro.hora_inicio],
        ['Hora fin', registro.hora_fin],
      ]),
      validateTextFields([
        ['Turno', registro.turno],
      ]),
      validatePositiveFields(materialesAsignados.map((item, index) => [`Cantidad material ${index + 1}`, item.cantidad])),
    );
    if (validationError) {
      window.alert(validationError);
      setTab('registro');
      return;
    }
    if (registro.fecha_inicio > registro.fecha_fin) {
      window.alert('La fecha inicio no puede ser mayor que la fecha fin.');
      setTab('registro');
      return;
    }
    if (!personalAsignado.length) {
      window.alert('Debes asignar al menos un personal propio (tecnico, operador o encargado) o tercero en la pestana Personal.');
      setTab('personal');
      return;
    }
    const normalizedActivities = releaseActivities.map((item) => String(item || '').trim()).filter(Boolean);
    if (!normalizedActivities.length) {
      window.alert('Agrega al menos una actividad para liberar la OT.');
      setTab('registro');
      return;
    }
    const activityValidationError = validateTextFields(normalizedActivities.map((item, index) => [`Actividad ${index + 1}`, item]));
    if (activityValidationError) {
      window.alert(activityValidationError);
      setTab('registro');
      return;
    }

    const materialExcedido = materialesAsignados.find((item) => {
      const reservedByOtherOt = reservedByOthers.get(String(item.id)) || 0;
      const stockDisponible = Math.max((Number(item.stock) || 0) - reservedByOtherOt, 0);
      return (Number(item.cantidad) || 0) > stockDisponible;
    });
    if (materialExcedido) {
      window.alert(`El material ${materialExcedido.codigo} supera el stock disponible. Ajusta la cantidad antes de ${isEditMode ? 'guardar' : 'liberar'} la OT.`);
      setTab('materiales');
      return;
    }

    onSubmit({
      registro,
      actividad: formatActivities(normalizedActivities),
      personalAsignado,
      materialesAsignados,
    });
  };

  const tabButton = (tabId, label) => (
    <button
      type="button"
      className={`btn ${tab === tabId ? 'btn-primary' : 'btn-secondary'}`}
      style={{ padding: '.45rem .9rem' }}
      onClick={() => setTab(tabId)}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .5)', zIndex: 1300, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(1080px, 100%)', maxHeight: '92vh', overflow: 'auto', background: '#fff', borderRadius: '.65rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: '.8rem', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{modalTitle}</h3>
            <p style={{ color: '#6b7280', fontSize: '.9rem' }}>{alert.codigo} · {alert.descripcion}</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ padding: '.45rem .85rem' }}>Cerrar</button>
        </div>

        <div style={{ padding: '1rem 1.2rem' }}>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {tabButton('registro', 'Registro')}
            {tabButton('personal', 'Personal')}
            {tabButton('materiales', 'Materiales')}
          </div>

          {tab === 'registro' && (
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.7rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Fecha inicio</label><input type="date" className="form-input" value={registro.fecha_inicio} onChange={(e) => setRegistro({ ...registro, fecha_inicio: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Fecha fin</label><input type="date" className="form-input" value={registro.fecha_fin} onChange={(e) => setRegistro({ ...registro, fecha_fin: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Hora inicio</label><input type="time" className="form-input" value={registro.hora_inicio} onChange={(e) => setRegistro({ ...registro, hora_inicio: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Hora fin</label><input type="time" className="form-input" value={registro.hora_fin} onChange={(e) => setRegistro({ ...registro, hora_fin: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label className="form-label">Actividades del paquete / OT</label>
                  <div style={{ border: '1px solid #dbeafe', background: '#f8fafc', borderRadius: '.75rem', padding: '.85rem', display: 'grid', gap: '.6rem' }}>
                    {releaseActivities.length ? (
                      releaseActivities.map((item, index) => (
                        <div key={`release_activity_${index}`} style={{ display: 'grid', gridTemplateColumns: '2rem minmax(0, 1fr) auto', gap: '.5rem', alignItems: 'center' }}>
                          <div style={{ fontWeight: 800, color: '#2563eb', textAlign: 'center' }}>{index + 1}</div>
                          <input
                            className="form-input"
                            value={item}
                            onChange={(e) => updateReleaseActivity(index, e.target.value)}
                            placeholder="Describe la actividad"
                          />
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeReleaseActivity(index)}>Quitar</button>
                        </div>
                      ))
                    ) : (
                      <span style={{ color: '#64748b' }}>Sin actividades registradas para esta OT.</span>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.5rem', alignItems: 'center' }}>
                      <input
                        className="form-input"
                        value={newReleaseActivity}
                        onChange={(e) => setNewReleaseActivity(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addReleaseActivity();
                          }
                        }}
                        placeholder="Agregar nueva actividad"
                      />
                      <button type="button" className="btn btn-secondary" onClick={addReleaseActivity}>Agregar</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'personal' && (
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.7rem', marginBottom: '.8rem', alignItems: 'end' }}>
                <CatalogSearchSelect
                  label="Buscar personal"
                  items={eligibleAssignableRrhh}
                  value={selectedPersonalId || ''}
                  onChange={setSelectedPersonalId}
                  placeholder="Selecciona personal..."
                  textPlaceholder="Buscar por codigo, nombre, cargo, especialidad o empresa"
                  searchFields={['codigo', 'nombres_apellidos', 'cargo', 'especialidad', 'tipo_personal', 'empresa']}
                  filters={[
                    { id: 'tipo_personal', getValue: (item) => item.tipo_personal || 'Propio', allLabel: 'Todos los tipos' },
                    { id: 'especialidad', getValue: (item) => item.especialidad || 'N.A.', allLabel: 'Todas' },
                    { id: 'empresa', getValue: (item) => item.empresa || 'N.A.', allLabel: 'Todas' },
                  ]}
                  optionLabel={(item) => `${item.codigo || 'S/C'} - ${item.nombres_apellidos || 'Sin nombre'} | ${item.cargo || 'N.A.'} | ${item.especialidad || 'N.A.'}${item.tipo_personal === 'Tercero' ? ` | ${item.empresa || 'Tercero'}` : ''}`}
                />
                <select className="form-select" style={{ display: 'none' }} value={selectedPersonalId || ''} onChange={(e) => setSelectedPersonalId(e.target.value)}>
                  <option value="">Selecciona personal...</option>
                  {eligibleAssignableRrhh.map((item) => (
                    <option key={item.id} value={item.id}>{item.nombres_apellidos} · {item.cargo || 'N.A.'} ({item.especialidad}){item.tipo_personal === 'Tercero' ? ` · ${item.empresa || 'Tercero'}` : ''}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-primary" onClick={addPersonal}>Agregar</button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      {['Código', 'Nombre', 'Especialidad', 'Tipo', 'Empresa', 'Capacidad (Hh/día)', 'Acción'].map((h) => <th key={h} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {personalAsignado.map((item) => (
                      <tr key={item.id}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.nombres_apellidos}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.especialidad}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.tipo_personal || 'Propio'}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.empresa || 'N.A.'}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.capacidad_hh_dia}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removePersonal(item.id)}>Quitar</button></td>
                      </tr>
                    ))}
                    {!personalAsignado.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '.9rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>Sin personal asignado.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'materiales' && (
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px auto', gap: '.7rem', marginBottom: '.8rem', alignItems: 'end' }}>
                <CatalogSearchSelect
                  label="Buscar material"
                  items={materialesItems}
                  value={selectedMaterialId || ''}
                  onChange={setSelectedMaterialId}
                  placeholder="Selecciona material..."
                  textPlaceholder="Buscar por codigo, descripcion, unidad o ubicacion"
                  searchFields={['codigo', 'descripcion', 'unidad', 'ubicacion', 'categoria', 'tipo']}
                  filters={[
                    { id: 'categoria', getValue: (item) => item.categoria || item.tipo || 'N.A.', allLabel: 'Todas' },
                    { id: 'unidad', getValue: (item) => item.unidad || 'UND', allLabel: 'Todas' },
                    { id: 'ubicacion', getValue: (item) => item.ubicacion || 'N.A.', allLabel: 'Todas' },
                  ]}
                  optionLabel={(item) => `${item.codigo || 'S/C'} - ${item.descripcion || 'Sin descripcion'} | Stock: ${Number(item.stock) || 0} ${item.unidad || 'UND'}`}
                />
                <select className="form-select" style={{ display: 'none' }} value={selectedMaterialId || ''} onChange={(e) => setSelectedMaterialId(e.target.value)}>
                  <option value="">Selecciona material...</option>
                  {materialesItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.codigo} · {item.descripcion}</option>
                  ))}
                </select>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Cantidad</label>
                  <input type="number" min="1" className="form-input" value={cantidadMaterial} onChange={(e) => setCantidadMaterial(e.target.value)} />
                </div>
                <button type="button" className="btn btn-primary" onClick={addMaterial}>Agregar</button>
              </div>

              <p style={{ color: '#6b7280', fontSize: '.9rem', marginBottom: '.8rem' }}>
                {selectedMaterial
                  ? `Stock fisico: ${Number(selectedMaterial.stock) || 0} ${selectedMaterial.unidad || 'UND'} | Reservado en otras OT: ${reservedByOthers.get(String(selectedMaterial.id)) || 0} | Disponible para esta OT: ${Math.max((Number(selectedMaterial.stock) || 0) - (reservedByOthers.get(String(selectedMaterial.id)) || 0), 0)}`
                  : 'Selecciona un material para visualizar el stock disponible.'}
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      {['Código', 'Descripción', 'Unidad', 'Cantidad', 'Costo unit.', 'Subtotal', 'Acción'].map((h) => <th key={h} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {materialesAsignados.map((item) => (
                      <tr key={item.id}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.descripcion}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.unidad}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.cantidad}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>S/ {Number(item.costo_unit).toFixed(2)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>S/ {(Number(item.cantidad) * Number(item.costo_unit)).toFixed(2)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removeMaterial(item.id)}>Quitar</button></td>
                      </tr>
                    ))}
                    {!materialesAsignados.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '.9rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>Sin materiales agregados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap' }}>
          <div style={{ color: '#374151', fontWeight: 600 }}>OT actual: <span style={{ color: '#111827' }}>{alert.ot_numero || 'OT #?'}</span></div>
          <button type="button" className="btn btn-primary" onClick={submit}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function PmpGestionOt() {
  const { user } = useAuth();
  const {
    getOptions,
    addOptionQuickly,
    canManage: canManageConfigurableLists,
  } = useConfigurableLists();
  const [alerts, setAlerts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalMode, setCreateModalMode] = useState('create');
  const [createModalAlert, setCreateModalAlert] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseModalMode, setReleaseModalMode] = useState('release');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeModalAction, setCloseModalAction] = useState('close');
  const [showReprogramModal, setShowReprogramModal] = useState(false);
  const [mobileActionMenu, setMobileActionMenu] = useState(null);
  const [mobileVisibleOtCount, setMobileVisibleOtCount] = useState(12);
  const [rrhhItems, setRrhhItems] = useState(RRHH_FALLBACK);
  const [materialesItems, setMaterialesItems] = useState(MATERIALES_FALLBACK);
  const [equiposItems, setEquiposItems] = useState([]);
  const [packageItems, setPackageItems] = useState([]);
  const [deletedAlertIds, setDeletedAlertIds] = useState([]);
  const [workReports, setWorkReports] = useState([]);
  const [pdfSettings, setPdfSettings] = useState(DEFAULT_OT_PDF_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');
  const isReadOnly = isReadOnlyRole(user);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [plans, plansKm, equipos, existing, deletedIds, history, rrhhData, materialesData, packagesData, workReportsData, pdfFormatData] = await Promise.all([
        loadSharedDocument(PLANS_KEY, []),
        loadSharedDocument(KM_PLANS_KEY, []),
        loadSharedDocument(EQUIPOS_KEY, []),
        loadSharedDocument(OT_ALERTS_KEY, []),
        loadSharedDocument(OT_DELETED_KEY, []),
        loadSharedDocument(OT_HISTORY_KEY, []),
        loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
        loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
        loadSharedDocument(PACKAGES_KEY, []),
        loadSharedDocument(OT_WORK_REPORTS_KEY, []),
        loadSharedDocument(PDF_FORMAT_KEY, DEFAULT_OT_PDF_SETTINGS),
      ]);
      if (!active) return;
      const deletedSet = new Set((Array.isArray(deletedIds) ? deletedIds : []).map((item) => String(item)));
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const activeExisting = existing.filter((a) => {
        if (a.status_ot === 'Cerrada' || deletedSet.has(String(a.id))) return false;
        const isPrematureScheduledOt = ['FECHA', 'CALENDARIO_MANUAL'].includes(String(a.origen_programacion || ''))
          && ['Pendiente', 'Creada'].includes(String(a.status_ot || ''))
          && !a.ot_numero
          && a.alerta_desde
          && a.alerta_desde > todayStr;
        return !isPrematureScheduledOt;
      });
      const mapExisting = new Map(activeExisting.map((a) => [a.id, a]));
      const closedHistoryIds = new Set(history.map((item) => item.id));

      const dueByDate = plans
        .flatMap((plan) => {
          const eq = equipos.find((e) => (e.codigo || '') === (plan.codigo || ''));
          const dueDates = getDatePlanOccurrencesInWindow(plan, monthStart, monthEnd, { includeAlertWindow: true });
          return dueDates
            .filter((scheduleInfo) => String(scheduleInfo.alerta_desde || scheduleInfo.fecha || '') <= todayStr)
            .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')))
            .slice(0, 1)
            .map((scheduleInfo, idx) => {
            const fecha = scheduleInfo.fecha;
            const cycleId = scheduleInfo.id;
            const legacyId = `${fecha}_${plan.id}`;
            const old = mapExisting.get(cycleId) || mapExisting.get(legacyId);
            const id = old?.id || cycleId;
            if (closedHistoryIds.has(id) || deletedSet.has(String(id)) || deletedSet.has(String(legacyId)) || closedHistoryIds.has(legacyId)) return null;
            const activityText = scheduleInfo.activities_text || '';
            return {
              id,
              fecha_ejecutar: old?.fecha_ejecutar || fecha,
              fecha_programada: old?.fecha_programada || old?.fecha_ejecutar || fecha,
              fecha_reprogramacion: old?.fecha_reprogramacion || '',
              reprogramado_por: old?.reprogramado_por || '',
              motivo_reprogramacion: old?.motivo_reprogramacion || '',
              reprogramaciones: old?.reprogramaciones || [],
              alerta_desde: old?.alerta_desde || scheduleInfo.alerta_desde,
              dias_anticipacion_alerta: old?.dias_anticipacion_alerta ?? scheduleInfo.dias_anticipacion_alerta,
              codigo: plan.codigo || '',
              descripcion: plan.equipo || '',
              area_trabajo: eq?.area_trabajo || 'N.A.',
              prioridad: plan.prioridad || 'Media',
              actividad: activityText || scheduleInfo.title || 'Mantenimiento preventivo programado',
              responsable: plan.responsable || 'N.A.',
              status_ot: old?.status_ot || (fecha === todayStr ? 'Pendiente' : 'Pendiente'),
              ot_numero: old?.ot_numero || '',
              fecha_ejecucion: old?.fecha_ejecucion || '',
              tipo_mantto: 'Preventivo',
              personal_mantenimiento: old?.personal_mantenimiento || '',
              materiales: old?.materiales || '',
              personal_detalle: old?.personal_detalle || [],
              materiales_detalle: old?.materiales_detalle || [],
              registro_ot: old?.registro_ot || null,
              cierre_ot: old?.cierre_ot || null,
              tipo_pm_programado: scheduleInfo.marker || '',
              paquete_pm_id: scheduleInfo.package_id || '',
              paquete_pm: scheduleInfo.package_nombre || scheduleInfo.package_codigo || scheduleInfo.title || '',
              ciclo_paso_label: scheduleInfo.title || '',
              origen_programacion: 'FECHA',
              orden: idx + 1,
            };
          });
        })
        .filter(Boolean)
        .sort(compareOtAlerts);

      const dueByKm = (Array.isArray(plansKm) ? plansKm : [])
        .filter((plan) => plan.codigo && isKmPlanInAlertWindow(plan))
        .map((plan) => {
          const target = Number(plan.proximo_km) || 0;
          const actual = Number(plan.km_actual) || 0;
          const remaining = Math.max(target - actual, 0);
          const currentCycleEntry = getCurrentPlanCycleEntry(plan);
          const packageLabel = currentCycleEntry?.package_nombre || currentCycleEntry?.package_codigo || plan.paquete_nombre || plan.paquete_codigo || '';
          const nextPmLabel = currentCycleEntry?.tipo_pm || plan.tipo_pm_proximo || '';
          const id = buildKmAlertId(plan);
          if (closedHistoryIds.has(id) || deletedSet.has(String(id))) return null;

          const eq = equipos.find((e) => (e.codigo || '') === (plan.codigo || ''));
          const old = mapExisting.get(id);
          return {
            id,
            fecha_ejecutar: old?.fecha_ejecutar || todayStr,
            fecha_programada: old?.fecha_programada || old?.fecha_ejecutar || todayStr,
            fecha_reprogramacion: old?.fecha_reprogramacion || '',
            reprogramado_por: old?.reprogramado_por || '',
            motivo_reprogramacion: old?.motivo_reprogramacion || '',
            reprogramaciones: old?.reprogramaciones || [],
            codigo: plan.codigo || '',
            descripcion: plan.equipo || eq?.descripcion || '',
            area_trabajo: eq?.area_trabajo || 'N.A.',
            prioridad: plan.prioridad || 'Media',
            actividad: `${plan.actividades || 'Mantenimiento preventivo por kilometraje'}${target ? `\nObjetivo km: ${target.toLocaleString('es-PE')} | Restantes: ${remaining.toLocaleString('es-PE')}` : ''}`,
            responsable: plan.responsable || 'N.A.',
            status_ot: old?.status_ot || 'Pendiente',
            ot_numero: old?.ot_numero || '',
            fecha_ejecucion: old?.fecha_ejecucion || '',
            tipo_mantto: 'Preventivo por Km',
            personal_mantenimiento: old?.personal_mantenimiento || '',
            materiales: old?.materiales || '',
            personal_detalle: old?.personal_detalle || [],
            materiales_detalle: old?.materiales_detalle || [],
            registro_ot: old?.registro_ot || null,
            cierre_ot: old?.cierre_ot || null,
            plan_km_id: plan.id,
            km_actual: actual,
            km_objetivo: target,
            km_restantes: remaining,
            alerta_km: Number(plan.alerta_km) || 0,
            tipo_pm_programado: nextPmLabel,
            paquete_pm: packageLabel,
            origen_programacion: 'KM',
          };
        })
        .filter(Boolean)
        .sort(compareOtAlerts);

      const dueAlerts = [...dueByDate, ...dueByKm]
        .sort(compareOtAlerts)
        .map((row, idx) => ({ ...row, orden: idx + 1 }));

      const dueIds = new Set(dueAlerts.map((item) => item.id));
      const carryOver = activeExisting.filter((item) => {
        if (dueIds.has(item.id)) return false;
        const isUnstartedDatePlanOt = String(item.origen_programacion || '') === 'FECHA'
          && ['Pendiente', 'Creada'].includes(String(item.status_ot || ''))
          && !item.ot_numero;
        return !isUnstartedDatePlanOt;
      });
      const mergedAlerts = [...carryOver, ...dueAlerts]
        .sort(compareOtAlerts)
        .map((row, idx) => ({ ...row, orden: idx + 1 }));

      setAlerts(mergedAlerts);
      setDeletedAlertIds(Array.from(deletedSet));
      setEquiposItems(Array.isArray(equipos) ? equipos : []);
      setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
      setMaterialesItems(normalizeMaterialsCatalog(materialesData));
      setPackageItems(Array.isArray(packagesData) ? packagesData : []);
      setWorkReports(Array.isArray(workReportsData) ? workReportsData : []);
      setPdfSettings(normalizeOtPdfSettings(pdfFormatData));
      setHydrated(true);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || isReadOnly) return;
    saveSharedDocument(OT_ALERTS_KEY, alerts).catch((err) => {
      console.error('Error guardando OT activas:', err);
      setError('No se pudo guardar la gestión de OT en el servidor.');
    });
  }, [alerts, hydrated, isReadOnly]);

  useEffect(() => {
    if (!hydrated || isReadOnly) return;
    saveSharedDocument(OT_DELETED_KEY, deletedAlertIds).catch((err) => {
      console.error('Error guardando OT eliminadas:', err);
      setError('No se pudo guardar el listado de OT eliminadas en el servidor.');
    });
  }, [deletedAlertIds, hydrated, isReadOnly]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => alerts.some((item) => String(item.id) === String(id))));
    if (selectedId && !alerts.some((item) => String(item.id) === String(selectedId))) {
      setSelectedId(null);
    }
  }, [alerts, selectedId]);

  useEffect(() => {
    if (!mobileActionMenu) return undefined;
    const closeMenu = () => setMobileActionMenu(null);
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileActionMenu]);

  const alertTableColumns = useMemo(() => ([
    { id: 'select', filterable: false },
    { id: 'fecha_ejecutar', getValue: (a) => formatDateDisplay(a.fecha_ejecutar || '', 'N.A.') },
    { id: 'codigo', getValue: (a) => a.codigo || '' },
    { id: 'descripcion', getValue: (a) => a.descripcion || '' },
    { id: 'area_trabajo', getValue: (a) => a.area_trabajo || '' },
    { id: 'prioridad', getValue: (a) => a.prioridad || '' },
    { id: 'actividad', getValue: (a) => a.actividad || '' },
    { id: 'responsable', getValue: (a) => a.responsable || '' },
    { id: 'status_ot', getValue: (a) => `${a.status_ot || ''} ${a.cierre_ot?.devuelta_revision ? `Devuelta ${a.cierre_ot.motivo_devolucion_tipo || ''}` : ''}` },
    { id: 'ot_numero', getValue: (a) => a.ot_numero || '' },
    { id: 'fecha_ejecucion', getValue: (a) => formatDateDisplay(a.fecha_ejecucion || '', 'N.A.') },
    { id: 'tipo_mantto', getValue: (a) => a.tipo_mantto || '' },
    { id: 'personal_mantenimiento', getValue: (a) => a.personal_mantenimiento || '' },
    { id: 'materiales', getValue: (a) => a.materiales || '' },
  ]), []);
  const {
    filters: alertFilters,
    setFilter: setAlertFilter,
  } = useTableColumnFilters(alertTableColumns);
  const filteredAlerts = useMemo(
    () => filterRowsByColumns(alerts, alertTableColumns, alertFilters),
    [alerts, alertTableColumns, alertFilters],
  );
  const visibleMobileAlerts = useMemo(
    () => filteredAlerts.slice(0, mobileVisibleOtCount),
    [filteredAlerts, mobileVisibleOtCount],
  );

  const selected = useMemo(
    () => filteredAlerts.find((a) => a.id === selectedId) || alerts.find((a) => a.id === selectedId) || null,
    [filteredAlerts, alerts, selectedId],
  );
  const reportByAlert = useMemo(() => {
    const map = new Map();
    (Array.isArray(workReports) ? workReports : []).forEach((item) => {
      const key = String(item.alertId);
      const rows = map.get(key) || [];
      rows.push(item);
      map.set(key, rows);
    });
    return map;
  }, [workReports]);
  const dropdownOptions = useMemo(() => ({
    responsibles: getOptions('responsables', ['Mecanico', 'Electricista', 'Terceros']),
    areas: getOptions('areas_trabajo', ['Planta', 'Secado']),
    maintenanceTypes: getOptions('tipos_mantenimiento', OT_TYPE_OPTIONS),
    priorities: getOptions('prioridades', PRIORITY_OPTIONS),
    vcOptions: getOptions('variaciones_control', VC_OPTIONS),
  }), [getOptions]);
  const consistencyByAlert = useMemo(() => {
    const map = new Map();
    alerts.forEach((item) => {
      map.set(String(item.id), getAlertConsistencySummary(item, reportByAlert.get(String(item.id)) || []));
    });
    return map;
  }, [alerts, reportByAlert]);
  const selectedConsistency = useMemo(
    () => (selected ? consistencyByAlert.get(String(selected.id)) || { hasInconsistency: false, count: 0, inconsistentReports: [] } : { hasInconsistency: false, count: 0, inconsistentReports: [] }),
    [selected, consistencyByAlert],
  );
  const inconsistentAlertsCount = useMemo(
    () => alerts.filter((item) => consistencyByAlert.get(String(item.id))?.hasInconsistency).length,
    [alerts, consistencyByAlert],
  );
  const otStats = useMemo(() => ({
    pendientes: alerts.filter((item) => item.status_ot === 'Pendiente').length,
    creadas: alerts.filter((item) => item.status_ot === 'Creada').length,
    liberadas: alerts.filter((item) => item.status_ot === 'Liberada').length,
  }), [alerts]);
  const selectedIdsSet = useMemo(() => new Set(selectedIds.map((item) => String(item))), [selectedIds]);
  const allSelected = filteredAlerts.length > 0 && filteredAlerts.every((item) => selectedIdsSet.has(String(item.id)));
  const selectedStatus = String(selected?.status_ot || '').trim();
  const canReleaseSelected = Boolean(selected && ['Pendiente', 'Creada'].includes(selectedStatus));
  const canEditSelected = Boolean(selected && selectedStatus === 'Liberada');
  const canReprogramSelected = Boolean(selected && ['Pendiente', 'Creada', 'Liberada'].includes(selectedStatus));
  const canReviewCloseSelected = Boolean(selected && selectedStatus === 'Solicitud de cierre');

  const toggleRowSelection = (id) => {
    const key = String(id);
    setSelectedIds((prev) => (
      prev.some((item) => String(item) === key)
        ? prev.filter((item) => String(item) !== key)
        : [...prev, id]
    ));
    setSelectedId(id);
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(filteredAlerts.map((item) => item.id));
  };

  const openMobileOtMenu = (event, item) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    if (isReadOnly) return;
    setMobileActionMenu({
      id: item.id,
      x: event.clientX || (event.touches?.[0]?.clientX ?? window.innerWidth / 2),
      y: event.clientY || (event.touches?.[0]?.clientY ?? window.innerHeight / 2),
    });
  };

  const runMobileOtAction = (item, action) => {
    setSelectedId(item.id);
    setMobileActionMenu(null);
    window.setTimeout(() => action(item), 0);
  };

  const openCreateModal = async () => {
    if (isReadOnly) return;
    const [equiposData, packagesData] = await Promise.all([
      loadSharedDocument(EQUIPOS_KEY, []),
      loadSharedDocument(PACKAGES_KEY, []),
    ]);
    setEquiposItems(Array.isArray(equiposData) ? equiposData : []);
    setPackageItems(Array.isArray(packagesData) ? packagesData : []);
    setCreateModalMode('create');
    setCreateModalAlert(null);
    setError('');
    setShowCreateModal(true);
  };

  const confirmCreateOt = (payload) => {
    if (isReadOnly) return;
    const createdAt = createModalAlert?.fecha_creacion || createModalAlert?.created_at || new Date().toISOString();
    const baseRow = {
      id: createModalAlert?.id || buildManualOtId(),
      fecha_ejecutar: payload.fecha,
      fecha_creacion: createdAt,
      created_at: createdAt,
      codigo: payload.codigo,
      descripcion: payload.descripcion,
      area_trabajo: payload.area_trabajo || 'N.A.',
      prioridad: payload.prioridad || 'Media',
      actividad: payload.actividad,
      responsable: payload.responsable || 'N.A.',
      status_ot: createModalAlert?.status_ot || 'Pendiente',
      ot_numero: '',
      fecha_ejecucion: createModalAlert?.fecha_ejecucion || '',
      tipo_mantto: payload.tipo_mantto || 'Correctivo',
      personal_mantenimiento: createModalAlert?.personal_mantenimiento || '',
      materiales: createModalAlert?.materiales || '',
      personal_detalle: createModalAlert?.personal_detalle || [],
      materiales_detalle: createModalAlert?.materiales_detalle || [],
      registro_ot: createModalAlert?.registro_ot || null,
      cierre_ot: createModalAlert?.cierre_ot || null,
      origen_programacion: createModalAlert?.origen_programacion || 'MANUAL',
      plan_km_id: createModalAlert?.plan_km_id,
      km_actual: createModalAlert?.km_actual,
      km_objetivo: createModalAlert?.km_objetivo,
      km_restantes: createModalAlert?.km_restantes,
      alerta_km: createModalAlert?.alerta_km,
      equipo_id: payload.equipo_id || '',
      servicio: payload.servicio || '',
      vc: payload.vc || 'V.C - DIA',
      tiempo_min: Number(payload.tiempo_min) || 0,
      paquete_pm_id: payload.paquete_pm_id || '',
      paquete_pm_nombre: payload.paquete_pm_nombre || '',
    };

    setAlerts((prev) => {
      const nextRows = createModalAlert
        ? prev.map((item) => (item.id === createModalAlert.id ? { ...item, ...baseRow } : item))
        : [baseRow, ...prev];
      return renumberOtRows(nextRows);
    });
    setSelectedId(baseRow.id);
    setCreateModalAlert(null);
    setShowCreateModal(false);
    appendAuditEntry({
      action: createModalAlert ? 'OT_PLAN_EDITADA' : 'OT_CREADA',
      module: 'Gestion de OT',
      entityType: 'OT',
      entityId: baseRow.id,
      title: createModalAlert ? `OT ${baseRow.codigo} actualizada en planificacion` : `OT ${baseRow.codigo} creada`,
      description: `${baseRow.descripcion || 'Sin descripcion'} | Estado: ${baseRow.status_ot} | Tipo: ${baseRow.tipo_mantto}.`,
      severity: createModalAlert ? 'info' : 'success',
      actor: user,
      after: {
        codigo: baseRow.codigo,
        prioridad: baseRow.prioridad,
        responsable: baseRow.responsable,
        tipo_mantto: baseRow.tipo_mantto,
        status_ot: baseRow.status_ot,
      },
    }).catch((err) => console.error('Error auditando OT creada/editada:', err));
  };

  const handleDeleteOt = async (targetAlert = null) => {
    if (isReadOnly) return;
    const idsToDelete = targetAlert
      ? [String(targetAlert.id)]
      : selectedIds.length
      ? selectedIds.map((item) => String(item))
      : (selected ? [String(selected.id)] : []);

    if (!idsToDelete.length) {
      window.alert('Selecciona al menos una OT para eliminar.');
      return;
    }

    const count = idsToDelete.length;
    if (!window.confirm(`¿Eliminar ${count} OT${count > 1 ? 's' : ''} seleccionada${count > 1 ? 's' : ''}? Esta acción quitará también sus registros de trabajo activos.`)) {
      return;
    }

    try {
      const workReports = await loadSharedDocument(OT_WORK_REPORTS_KEY, []);
      const nextReports = (Array.isArray(workReports) ? workReports : [])
        .filter((item) => !idsToDelete.includes(String(item.alertId)));
      await saveSharedDocument(OT_WORK_REPORTS_KEY, nextReports);
    } catch (err) {
      console.error('Error eliminando reportes OT:', err);
      setError('No se pudieron limpiar los registros de trabajo de las OT eliminadas.');
    }

    setDeletedAlertIds((prev) => Array.from(new Set([...prev.map((item) => String(item)), ...idsToDelete])));
    setAlerts((prev) => renumberOtRows(prev.filter((item) => !idsToDelete.includes(String(item.id)))));
    setSelectedIds([]);
    if (selected && idsToDelete.includes(String(selected.id))) {
      setSelectedId(null);
    }
    appendAuditEntry({
      action: 'OT_ELIMINADA',
      module: 'Gestion de OT',
      entityType: 'OT',
      entityId: idsToDelete.join(','),
      title: `${count} OT eliminada${count > 1 ? 's' : ''}`,
      description: `Se eliminaron ${count} OT activas y se limpiaron sus registros de trabajo asociados.`,
      severity: 'warning',
      actor: user,
      meta: { ids: idsToDelete },
    }).catch((err) => console.error('Error auditando OT eliminada:', err));
  };

  const openReleaseModal = async (targetAlert = selected) => {
    if (isReadOnly) return;
    const row = targetAlert || selected;
    if (!row) return;
    setSelectedId(row.id);
    if (row.status_ot === 'Liberada') {
      window.alert('Una OT liberada ya no puede liberarse nuevamente. Usa Editar OT para modificar sus datos.');
      return;
    }
    if (!['Pendiente', 'Creada'].includes(row.status_ot)) {
      window.alert('Solo puedes liberar OTs en estado Pendiente o Creada.');
      return;
    }
    if (isOverdueUnreleasedOt(row)) {
      window.alert('Esta OT ya paso su fecha de ejecucion y no puede liberarse directamente. Primero debes reprogramarla para dejar registrado que paso con el equipo en ese periodo.');
      return;
    }
    const [rrhhData, materialesData] = await Promise.all([
      loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
      loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
    ]);
    setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
    setMaterialesItems(normalizeMaterialsCatalog(materialesData));
    setReleaseModalMode('release');
    setError('');
    setShowReleaseModal(true);
  };

  const openEditReleaseModal = async (targetAlert = selected) => {
    if (isReadOnly) return;
    const row = targetAlert || selected;
    if (!row) return;
    setSelectedId(row.id);
    if (String(row.status_ot || '').trim() !== 'Liberada') {
      window.alert('Solo puedes editar una OT que este en estado Liberada.');
      return;
    }
    const [rrhhData, materialesData, workReportsData] = await Promise.all([
      loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
      loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
      loadSharedDocument(OT_WORK_REPORTS_KEY, []),
    ]);
    setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
    setMaterialesItems(normalizeMaterialsCatalog(materialesData));
    setWorkReports(Array.isArray(workReportsData) ? workReportsData : []);
    setReleaseModalMode('edit');
    setError('');
    setShowReleaseModal(true);
  };

  const openEditOt = async (targetAlert = selected) => {
    if (isReadOnly) return;
    const row = targetAlert || selected;
    if (!row) return;
    setSelectedId(row.id);
    if (String(row.status_ot || '').trim() === 'Liberada') {
      await openEditReleaseModal(row);
      return;
    }
    window.alert('Solo puedes editar OTs en estado Liberada.');
  };

  const openReprogramModal = (targetAlert = selected) => {
    if (isReadOnly) return;
    const row = targetAlert || selected;
    if (!row) return;
    setSelectedId(row.id);
    if (!['Pendiente', 'Creada', 'Liberada'].includes(row.status_ot)) {
      window.alert('Solo puedes reprogramar OTs en estado Pendiente, Creada o Liberada.');
      return;
    }
    setError('');
    setShowReprogramModal(true);
  };

  const confirmReprogramOt = (payload) => {
    if (isReadOnly || !selected) return;
    const actorName = user?.full_name || user?.username || user?.role || 'Sistema';
    const nextAlerts = renumberOtRows(alerts.map((item) => (
      String(item.id) !== String(selected.id)
        ? item
        : applyOtReprogramming(item, payload, actorName)
    )));

    setAlerts(nextAlerts);
    setSelectedId(selected.id);
    setShowReprogramModal(false);
    setError('');

    appendAuditEntry({
      action: 'OT_REPROGRAMADA',
      module: 'Gestion de OT',
      entityType: 'OT',
      entityId: selected.id,
      title: `OT ${selected.ot_numero || selected.codigo || selected.id} reprogramada`,
      description: `${formatDateDisplay(payload.fecha_anterior || '', 'N.A.')} -> ${formatDateDisplay(payload.fecha_nueva || '', 'N.A.')} | ${payload.motivo}`,
      severity: 'warning',
      actor: user,
      before: { fecha_ejecutar: payload.fecha_anterior },
      after: { fecha_ejecutar: payload.fecha_nueva, motivo: payload.motivo },
    }).catch((err) => console.error('Error auditando reprogramacion OT:', err));
  };

  const confirmRelease = async ({ registro, actividad, personalAsignado, materialesAsignados }) => {
    if (isReadOnly) return;
    if (!selected) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const releaseAt = new Date().toISOString();
    const releasedBy = user?.full_name || user?.username || user?.role || 'Sistema';
    let nextNumber = selected.ot_numero || '';
    if (!nextNumber) {
      try {
        const releaseYear = Number(String(registro?.fecha_inicio || todayStr).slice(0, 4)) || new Date().getFullYear();
        nextNumber = await allocateNextOtNumber(releaseYear);
        setError('');
      } catch (err) {
        console.error('Error generando correlativo OT:', err);
        setError('No se pudo generar el numero correlativo de la OT. Revisa Configuraciones > Ordenes de Trabajo.');
        return;
      }
    }
    const personalTexto = personalAsignado.map((p) => `${p.codigo} - ${p.nombres_apellidos}`).join(', ');
    const materialesTexto = materialesAsignados.map((m) => `${m.codigo} x${m.cantidad}`).join(', ');

    setAlerts((prev) => prev.map((a) => (a.id === selected.id ? {
      ...a,
      ot_numero: nextNumber,
      status_ot: 'Liberada',
      fecha_ejecucion: a.fecha_ejecucion || todayStr,
      fecha_liberacion_ot: a.fecha_liberacion_ot || releaseAt,
      liberado_por: a.liberado_por || releasedBy,
      actividad: actividad || a.actividad,
      personal_mantenimiento: personalTexto,
      materiales: materialesTexto,
      personal_detalle: personalAsignado,
      materiales_detalle: materialesAsignados,
      registro_ot: {
        ...registro,
        fecha_liberacion: a.registro_ot?.fecha_liberacion || registro.fecha_liberacion || releaseAt,
        liberado_por: a.registro_ot?.liberado_por || registro.liberado_por || releasedBy,
      },
    } : a)));

    setShowReleaseModal(false);
    appendAuditEntry({
      action: 'OT_LIBERADA',
      module: 'Gestion de OT',
      entityType: 'OT',
      entityId: selected.id,
      title: `OT ${nextNumber} liberada`,
      description: `${selected.codigo || 'Equipo'} - ${selected.descripcion || 'Sin descripcion'} | Personal asignado: ${personalAsignado.length} | Materiales: ${materialesAsignados.length}.`,
      severity: 'success',
      actor: user,
      before: { status_ot: selected.status_ot, ot_numero: selected.ot_numero || '' },
      after: { status_ot: 'Liberada', ot_numero: nextNumber },
    }).catch((err) => console.error('Error auditando OT liberada:', err));
  };

  const handleSaveLiberatedOtChanges = (payload) => {
    if (isReadOnly) return;
    if (!selected) return;

    const nextAlerts = alerts.map((item) => {
      if (String(item.id) !== String(selected.id)) return item;
      return {
        ...item,
        prioridad: payload.prioridad,
        actividad: payload.actividad,
        responsable: payload.responsable,
        fecha_ejecutar: payload.fecha_ejecutar,
        personal_mantenimiento: (payload.personalAsignado || []).map((row) => `${row.codigo} - ${row.nombres_apellidos}`).join(', '),
        materiales: (payload.materialesAsignados || []).map((row) => `${row.codigo} x${row.cantidad}`).join(', '),
        personal_detalle: payload.personalAsignado || item.personal_detalle || [],
        materiales_detalle: payload.materialesAsignados || item.materiales_detalle || [],
        registro_ot: {
          ...(item.registro_ot || {}),
          fecha_inicio: payload.fecha_inicio_prop,
          fecha_fin: payload.fecha_fin_prop,
          hora_inicio: payload.hora_inicio_prop,
          hora_fin: payload.hora_fin_prop,
          turno: item.registro_ot?.turno || '',
          observaciones: payload.observaciones,
        },
      };
    });

    setAlerts(nextAlerts);
    setShowReleaseModal(false);
    setError('');

    const updatedAlert = nextAlerts.find((item) => String(item.id) === String(selected.id));
    const updatedSummary = getAlertConsistencySummary(updatedAlert, reportByAlert.get(String(selected.id)) || []);
    if (updatedSummary.hasInconsistency) {
      window.alert(`La OT fue actualizada, pero todavía mantiene ${updatedSummary.count} inconsistencia(s) de fechas. Revísala antes de cerrar la orden.`);
    } else {
      window.alert('La OT fue actualizada y los registros de trabajo quedaron conformes con el rango liberado.');
    }
    appendAuditEntry({
      action: 'OT_EDITADA',
      module: 'Gestion de OT',
      entityType: 'OT',
      entityId: selected.id,
      title: `OT ${selected.ot_numero || selected.codigo || selected.id} editada`,
      description: updatedSummary.hasInconsistency
        ? `La OT se actualizo, pero mantiene ${updatedSummary.count} inconsistencia(s) por revisar.`
        : 'La OT se actualizo y quedo conforme con su rango liberado.',
      severity: updatedSummary.hasInconsistency ? 'warning' : 'info',
      actor: user,
      before: {
        prioridad: selected.prioridad,
        responsable: selected.responsable,
        fecha_ejecutar: selected.fecha_ejecutar,
      },
      after: {
        prioridad: payload.prioridad,
        responsable: payload.responsable,
        fecha_ejecutar: payload.fecha_ejecutar,
      },
    }).catch((err) => console.error('Error auditando OT editada:', err));
  };

  const openCloseModal = async (action = 'close', targetAlert = selected) => {
    if (isReadOnly) return;
    const row = targetAlert || selected;
    if (!row) return;
    setSelectedId(row.id);
    if (String(row.status_ot || '').trim() !== 'Solicitud de cierre') {
      window.alert('Solo puedes cerrar una OT que esté en estado Solicitud de cierre.');
      return;
    }
    const workReports = await loadSharedDocument(OT_WORK_REPORTS_KEY, []);
    setWorkReports(Array.isArray(workReports) ? workReports : []);
    setCloseModalAction(action);
    setShowCloseModal(true);
    // El formato debe abrir aunque falten datos; las validaciones bloquean solo el cierre final.
    const reportsForOt = (Array.isArray(workReports) ? workReports : []).filter((item) => String(item.alertId) === String(row.id));
    const consistencySummary = getAlertConsistencySummary(row, reportsForOt);
    if (false && consistencySummary.hasInconsistency) {
      window.alert(`No puedes cerrar esta OT porque tiene ${consistencySummary.count} inconsistencia(s) entre los registros de trabajo y el rango liberado. Corrige la liberación y revisa que todo quede conforme antes de cerrar.`);
      return;
    }
    const reportsMissingEvidence = findReportsMissingRequiredEvidence(reportsForOt);
    if (false && reportsMissingEvidence.length) {
      window.alert(`No puedes cerrar esta OT porque ${reportsMissingEvidence.length} notificacion(es) no tienen foto ANTES y DESPUES.`);
      return;
    }
    setShowCloseModal(true);
  };

  const confirmCloseOt = async (cierreData) => {
    if (isReadOnly) return;
    if (!selected) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const [history, workReports, existingNotices, exchangeHistory, latestEquipos] = await Promise.all([
      loadSharedDocument(OT_HISTORY_KEY, []),
      loadSharedDocument(OT_WORK_REPORTS_KEY, []),
      loadSharedDocument(NOTICES_KEY, []),
      loadSharedDocument(EXCHANGE_HISTORY_KEY, []),
      loadSharedDocument(EQUIPOS_KEY, []),
    ]);
    let cierreFinal = { ...cierreData };
    let exchangedEquipos = null;
    let nextExchangeHistory = null;
    if (cierreData?.intercambio_realizado?.enabled) {
      try {
        const actor = user?.full_name || user?.username || user?.role || 'Sistema';
        const exchangeResult = applyEquipmentExchange(Array.isArray(latestEquipos) ? latestEquipos : equiposItems, {
          ...cierreData.intercambio_realizado,
          otNumero: selected.ot_numero || selected.id || '',
          registradoPor: actor,
          registradoEn: 'Cierre de OT',
        });
        exchangedEquipos = exchangeResult.equipos;
        nextExchangeHistory = [
          exchangeResult.record,
          ...(Array.isArray(exchangeHistory) ? exchangeHistory : []),
        ];
        cierreFinal = {
          ...cierreData,
          intercambio_realizado: {
            ...cierreData.intercambio_realizado,
            ...exchangeResult.record,
          },
        };
      } catch (err) {
        console.error('Error preparando intercambio en cierre OT:', err);
        setError(err?.message || 'No se pudo registrar el intercambio indicado en el cierre de OT.');
        return;
      }
    }
    const storedReports = Array.isArray(workReports) ? workReports : [];
    if (cierreData?.actualizar_capacidad_equipo && String(cierreData?.capacidad_equipo || '').trim()) {
      const capacityValue = String(cierreData.capacidad_equipo).trim();
      const baseRows = exchangedEquipos || (Array.isArray(latestEquipos) ? latestEquipos : equiposItems);
      const nextRows = (Array.isArray(baseRows) ? baseRows : []).map((eq) => {
        const sameId = selected.equipo_id && String(eq.id) === String(selected.equipo_id);
        const sameCode = String(eq.codigo || '').trim().toUpperCase() === String(selected.codigo || '').trim().toUpperCase();
        return sameId || sameCode ? { ...eq, capacidad: capacityValue } : eq;
      });
      exchangedEquipos = nextRows;
    }
    const reportsForOt = storedReports.filter((item) => String(item.alertId) === String(selected.id));
    const effectiveReports = (Array.isArray(cierreData?.reportes_actualizados) && cierreData.reportes_actualizados.length
      ? cierreData.reportes_actualizados
      : reportsForOt
    ).map((item) => {
      const normalizedServiceCost = Number(item?.serviceCost ?? item?.costo_servicio ?? 0);
      return {
        ...item,
        serviceCost: Number.isFinite(normalizedServiceCost) ? normalizedServiceCost : 0,
        costo_servicio: Number.isFinite(normalizedServiceCost) ? normalizedServiceCost : 0,
      };
    });
    const updatedReportsById = new Map(effectiveReports.map((item) => [String(item.id), item]));
    const preservedReports = storedReports.map((item) => updatedReportsById.get(String(item.id)) || item);
    const preservedIds = new Set(preservedReports.map((item) => String(item.id)));
    const mergedWorkReports = [
      ...preservedReports,
      ...effectiveReports.filter((item) => !preservedIds.has(String(item.id))),
    ];
    const consistencySummary = getAlertConsistencySummary(selected, effectiveReports);
    const serviceSummary = summarizeServiceReports(effectiveReports);
    if (consistencySummary.hasInconsistency) {
      const message = `No se puede cerrar la OT porque tiene ${consistencySummary.count} inconsistencia(s) de fechas en los registros de trabajo.`;
      window.alert(message);
      setError(message);
      return;
    }
    if (serviceSummary.hasMissingServiceCost) {
      const message = `No se puede cerrar la OT porque tiene ${serviceSummary.missingCostReports.length} notificacion(es) de servicio sin costo registrado.`;
      window.alert(message);
      setError(message);
      return;
    }
    const reportsMissingEvidence = findReportsMissingRequiredEvidence(effectiveReports);
    if (reportsMissingEvidence.length) {
      const message = `No se puede cerrar la OT porque ${reportsMissingEvidence.length} notificacion(es) no tienen foto ANTES y DESPUES.`;
      window.alert(message);
      setError(message);
      return;
    }
    const generatedNotices = Array.isArray(cierreData?.avisos_generados_detalle) && cierreData.avisos_generados_detalle.length
      ? cierreData.avisos_generados_detalle
      : buildMaintenanceNoticesFromReports(selected, effectiveReports, existingNotices, 'Revision de cierre');
    const closedRow = {
      ...selected,
      status_ot: 'Cerrada',
      fecha_ejecucion: selected.fecha_ejecucion || todayStr,
      cierre_ot: cierreFinal,
      fecha_cierre: todayStr,
      fecha_ejecucion_real: cierreFinal?.fecha_fin || todayStr,
      hora_ejecucion_real: cierreFinal?.hora_fin || '',
      reportes_trabajo: effectiveReports,
      avisos_generados: generatedNotices.map((item) => item.aviso_codigo),
      avisos_generados_detalle: generatedNotices,
    };

    if (selected.tipo_mantto === 'Preventivo por Km' && selected.plan_km_id) {
      try {
        const plansKm = await loadSharedDocument(KM_PLANS_KEY, []);
        const nextPlansKm = (Array.isArray(plansKm) ? plansKm : []).map((plan) => {
          if (String(plan.id) !== String(selected.plan_km_id)) return plan;
          return advanceKmPlanCycle(plan, {
            closeDate: cierreData?.fecha_fin || todayStr,
            currentCounter: plan.km_actual,
          });
        });
        await saveSharedDocument(KM_PLANS_KEY, nextPlansKm);
      } catch (err) {
        console.error('Error actualizando ciclo por kilometraje:', err);
        setError('Se cerro la OT, pero no se pudo actualizar el siguiente ciclo por kilometraje.');
      }
    }
    try {
      const saveOperations = [
        saveSharedDocument(OT_WORK_REPORTS_KEY, mergedWorkReports),
        saveSharedDocument(OT_HISTORY_KEY, [closedRow, ...history]),
        saveSharedDocument(NOTICES_KEY, Array.isArray(existingNotices) ? existingNotices : []),
      ];
      if (exchangedEquipos && nextExchangeHistory) {
        saveOperations.push(saveSharedDocument(EQUIPOS_KEY, exchangedEquipos));
        saveOperations.push(saveSharedDocument(EXCHANGE_HISTORY_KEY, nextExchangeHistory));
      }
      await Promise.all(saveOperations);
      setWorkReports(mergedWorkReports);
      if (exchangedEquipos) setEquiposItems(exchangedEquipos);
      setError('');
    } catch (err) {
      console.error('Error guardando historial OT:', err);
      const message = getSharedDocumentErrorMessage(err);
      window.alert(message);
      setError(message);
      return;
    }

    setAlerts((prev) => prev.filter((a) => a.id !== selected.id));
    setSelectedId(null);
    setShowCloseModal(false);
    openCloseReportPdf(closedRow, effectiveReports, materialesItems, pdfSettings);
    appendAuditEntry({
      action: 'OT_CERRADA',
      module: 'Gestion de OT',
      entityType: 'OT',
      entityId: selected.id,
      title: `OT ${selected.ot_numero || selected.codigo || selected.id} cerrada`,
      description: `${selected.codigo || 'Equipo'} - ${selected.descripcion || 'Sin descripcion'} | Modo de falla: ${cierreData?.modo_falla || 'Ninguna'} | Tiempo efectivo: ${cierreData?.tiempo_efectivo_hh || 0} Hh.`,
      severity: 'success',
      actor: user,
      before: { status_ot: selected.status_ot },
      after: { status_ot: 'Cerrada', modo_falla: cierreData?.modo_falla || '' },
      meta: {
        avisos_generados: generatedNotices.length,
        tiempo_indisponible_operacional: cierreData?.tiempo_indisponible_operacional || 0,
      },
    }).catch((err) => console.error('Error auditando cierre OT:', err));
  };

  const returnOtToLiberated = (reviewData) => {
    if (isReadOnly) return;
    if (!selected) return;

    setAlerts((prev) => prev.map((item) => (
      String(item.id) !== String(selected.id)
        ? item
        : {
          ...item,
          status_ot: 'Liberada',
          cierre_ot: {
            ...(item.cierre_ot || {}),
            solicitud_cierre: false,
            devuelta_revision: true,
            devuelta_revision_fecha: new Date().toISOString(),
            devuelta_revision_por: 'Planner/Ingeniero',
            devuelta_revision_observaciones: reviewData?.motivo_devolucion_detalle || reviewData?.observaciones || '',
            motivo_devolucion_tipo: reviewData?.motivo_devolucion_tipo || '',
            motivo_devolucion_detalle: reviewData?.motivo_devolucion_detalle || '',
            responsable_correccion: reviewData?.responsable_correccion || '',
            fecha_objetivo_reenvio: reviewData?.fecha_objetivo_reenvio || '',
          },
        }
    )));

    setError('');
    setShowCloseModal(false);
    window.alert('La OT volvió a estado Liberada. Ahora los técnicos podrán corregir las notificaciones de trabajo y solicitar cierre nuevamente.');
    appendAuditEntry({
      action: 'OT_DEVUELTA_A_LIBERADA',
      module: 'Gestion de OT',
      entityType: 'OT',
      entityId: selected.id,
      title: `OT ${selected.ot_numero || selected.codigo || selected.id} devuelta a Liberada`,
      description: `${reviewData?.motivo_devolucion_tipo || 'Motivo no especificado'} | Responsable: ${reviewData?.responsable_correccion || 'Por definir'} | Reenvio: ${reviewData?.fecha_objetivo_reenvio || 'Pendiente'}.`,
      severity: 'critical',
      actor: user,
      before: { status_ot: 'Solicitud de cierre' },
      after: { status_ot: 'Liberada', motivo_devolucion_tipo: reviewData?.motivo_devolucion_tipo || '' },
    }).catch((err) => console.error('Error auditando devolucion OT:', err));
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Gestión de Órdenes de Trabajo</h1>
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}
      {isReadOnly && (
        <ReadOnlyAccessNotice
          title="Gestión de OT en modo consulta"
          message="Con tu perfil puedes revisar el cronograma, estados y detalle de las órdenes de trabajo, pero no crear, liberar, editar, cerrar ni eliminar órdenes."
        />
      )}
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Alertas de mantenimiento generadas por planes preventivos por fecha y por kilometraje.
      </p>

      {selected && selectedConsistency.hasInconsistency && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          La OT seleccionada tiene {selectedConsistency.count} inconsistencia(s) entre sus registros de trabajo y el rango liberado. Puedes editar la OT para corregir fechas y horas antes del cierre.
        </div>
      )}
      {selected?.cierre_ot?.devuelta_revision && selected.status_ot === 'Liberada' && (
        <div className="alert alert-error" style={{ marginBottom: '1rem', border: '1px solid #fca5a5' }}>
          <strong>OT devuelta a correccion.</strong>{' '}
          {selected.cierre_ot.motivo_devolucion_tipo || 'Motivo pendiente'}.
          {' '}Responsable: <strong>{selected.cierre_ot.responsable_correccion || 'Por definir'}</strong>.
          {' '}Reenvio objetivo: <strong>{formatDateDisplay(selected.cierre_ot.fecha_objetivo_reenvio || '', 'Pendiente')}</strong>.
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">OT Pendientes</div>
          <div className="stat-value" style={{ color: '#b45309' }}>{otStats.pendientes}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT Creadas</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{otStats.creadas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT Liberadas</div>
          <div className="stat-value" style={{ color: '#059669' }}>{otStats.liberadas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT con Inconsistencia</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{inconsistentAlertsCount}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap' }}>
            {!isReadOnly && <button type="button" className="btn btn-primary" onClick={openCreateModal}>Crear una OT</button>}
            {!isReadOnly && <button type="button" className="btn btn-secondary" onClick={openReleaseModal} disabled={!canReleaseSelected}>Liberar OT</button>}
            {!isReadOnly && <button type="button" className="btn btn-secondary" onClick={openEditOt} disabled={!canEditSelected}>Editar OT</button>}
            {!isReadOnly && <button type="button" className="btn btn-secondary" onClick={openReprogramModal} disabled={!canReprogramSelected}>Reprogramar OT</button>}
            {!isReadOnly && <button type="button" className="btn btn-secondary" onClick={() => openCloseModal('return')} disabled={!canReviewCloseSelected}>Devolver a Liberada</button>}
            {!isReadOnly && <button type="button" className="btn btn-danger" onClick={() => openCloseModal('close')} disabled={!canReviewCloseSelected}>Cerrar OT</button>}
            {!isReadOnly && (
              <button type="button" className="btn btn-danger" onClick={handleDeleteOt} disabled={!selected && !selectedIds.length}>
                {selectedIds.length > 1 ? `Eliminar OT (${selectedIds.length})` : 'Eliminar OT'}
              </button>
            )}
          </div>
          <div style={{ fontSize: '.9rem', color: '#6b7280' }}>
            {isReadOnly
              ? 'Puedes seleccionar una OT para revisar su informacion.'
              : (selectedIds.length ? `${selectedIds.length} OT seleccionada${selectedIds.length > 1 ? 's' : ''} para eliminar.` : 'Marca una o varias OT para eliminarlas.')}
          </div>
        </div>
      </div>

      <div className="mobile-card-list" style={{ marginBottom: '.9rem' }}>
        {visibleMobileAlerts.map((a) => {
          const rowConsistency = consistencyByAlert.get(String(a.id)) || { hasInconsistency: false, count: 0 };
          const isSelected = selectedId === a.id;
          const isMarked = selectedIdsSet.has(String(a.id));
          const tone = getOtVisualTone(a, isSelected);
          return (
            <div
              key={`mobile_ot_${a.id}`}
              className={`mobile-ot-card ${isSelected ? 'is-selected' : ''}`}
              onClick={() => setSelectedId(a.id)}
              onContextMenu={(event) => openMobileOtMenu(event, a)}
              style={{ background: tone.background, borderColor: tone.border }}
              title="Toca para seleccionar. Mantén presionado para marcar."
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.2rem' }}>
                    {a.ot_numero || 'OT pendiente'} · {a.codigo}
                  </div>
                  <div style={{ color: '#475569', lineHeight: 1.55 }}>
                    {a.descripcion || 'Sin descripcion'}
                  </div>
                </div>
                {isSelected && <span className="mobile-selected-chip">Seleccionada</span>}
              </div>

              <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
                {isMarked && (
                  <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: '#dcfce7', color: '#166534', fontWeight: 800, fontSize: '.78rem' }}>
                    Marcada
                  </span>
                )}
                <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: tone.chipBackground, color: tone.chipText, fontWeight: 800, fontSize: '.78rem' }}>
                  {a.status_ot}
                </span>
                {tone.key === 'overdue' && (
                  <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: tone.chipBackground, color: tone.chipText, fontWeight: 800, fontSize: '.78rem' }}>
                    {tone.label}
                  </span>
                )}
                {rowConsistency.hasInconsistency && (
                  <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: '#fef2f2', color: '#b91c1c', fontWeight: 700, fontSize: '.78rem' }}>
                    Inconsistencia: {rowConsistency.count}
                  </span>
                )}
                {a.cierre_ot?.devuelta_revision && a.status_ot === 'Liberada' && (
                  <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: '#fef2f2', color: '#b91c1c', fontWeight: 700, fontSize: '.78rem' }}>
                    Devuelta
                  </span>
                )}
              </div>

              <div className="mobile-ot-card-grid">
                <div><strong>Fecha a ejecutar</strong>{formatDateDisplay(a.fecha_ejecutar || '', 'N.A.')}</div>
                {a.fecha_reprogramacion && (
                  <div><strong>Reprogramada</strong>{formatDateDisplay(a.fecha_reprogramacion || '', 'N.A.')}</div>
                )}
                <div><strong>Area</strong>{a.area_trabajo || 'N.A.'}</div>
                <div><strong>Prioridad</strong>{a.prioridad || 'N.A.'}</div>
                <div><strong>Responsable</strong>{a.responsable || 'N.A.'}</div>
                <div><strong>Tipo de mantto</strong>{a.tipo_mantto || 'N.A.'}</div>
                <div><strong>Actividad</strong>{a.actividad || 'N.A.'}</div>
              </div>
            </div>
          );
        })}
        {filteredAlerts.length > visibleMobileAlerts.length && (
          <button type="button" className="btn btn-secondary mobile-load-more" onClick={() => setMobileVisibleOtCount((current) => current + 12)}>
            Ver 12 OT más ({filteredAlerts.length - visibleMobileAlerts.length} restantes)
          </button>
        )}
        {filteredAlerts.length > 12 && visibleMobileAlerts.length >= filteredAlerts.length && (
          <button type="button" className="btn btn-secondary mobile-load-more" onClick={() => setMobileVisibleOtCount(12)}>
            Ver menos
          </button>
        )}
        {mobileActionMenu && (() => {
          const item = filteredAlerts.find((row) => String(row.id) === String(mobileActionMenu.id));
          if (!item) return null;
          const status = String(item.status_ot || '').trim();
          return (
            <div
              className="mobile-card-action-menu"
              style={{
                left: Math.min(mobileActionMenu.x, window.innerWidth - 260),
                top: Math.min(mobileActionMenu.y, window.innerHeight - 260),
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mobile-card-action-head">
                <span>Acciones OT</span>
                <strong>{item.ot_numero || item.codigo || 'OT'}</strong>
              </div>
              <div className="mobile-card-action-list">
                {['Pendiente', 'Creada'].includes(status) && (
                  <button type="button" onClick={() => runMobileOtAction(item, openReleaseModal)}>
                    Liberar OT
                  </button>
                )}
                {status === 'Liberada' && (
                  <button type="button" onClick={() => runMobileOtAction(item, openEditOt)}>
                    Editar OT
                  </button>
                )}
                {['Pendiente', 'Creada', 'Liberada'].includes(status) && (
                  <button type="button" onClick={() => runMobileOtAction(item, openReprogramModal)}>
                    Reprogramar OT
                  </button>
                )}
                {status === 'Solicitud de cierre' && (
                  <>
                    <button type="button" onClick={() => runMobileOtAction(item, (target) => openCloseModal('return', target))}>
                      Devolver a Liberada
                    </button>
                    <button type="button" onClick={() => runMobileOtAction(item, (target) => openCloseModal('close', target))}>
                      Cerrar OT
                    </button>
                  </>
                )}
                <button type="button" onClick={() => runMobileOtAction(item, (target) => toggleRowSelection(target.id))}>
                  {selectedIdsSet.has(String(item.id)) ? 'Quitar marca' : 'Marcar para eliminar'}
                </button>
                <button type="button" className="danger" onClick={() => runMobileOtAction(item, handleDeleteOt)}>
                  Eliminar OT
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="card desktop-table-wrapper" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1760px' }}>
          <thead>
            <tr style={{ background: '#0b5c8c', color: '#fff' }}>
              <th style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', width: '56px', textAlign: 'center' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              </th>
              {['Fecha a ejecutar', 'Código', 'Descripción', 'Área de trabajo', 'Prioridad', 'Actividad de mantenimiento', 'PST TBJO Responsable', 'Status de OT', '# OT', 'Fecha de ejecución', 'Tipo de mantto', 'Personal de mantenimiento', 'Materiales - repuestos - insumos'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', fontSize: '.8rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
            <TableFilterRow columns={alertTableColumns} rows={alerts} filters={alertFilters} onChange={setAlertFilter} dark />
          </thead>
          <tbody>
            {filteredAlerts.map((a) => {
              const rowConsistency = consistencyByAlert.get(String(a.id)) || { hasInconsistency: false, count: 0 };
              const isSelected = selectedId === a.id;
              const tone = getOtVisualTone(a, isSelected);
              return (
              <tr
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                style={{
                  background: tone.background,
                  boxShadow: isSelected ? `inset 4px 0 0 ${tone.border}` : 'none',
                  cursor: 'pointer',
                }}
              >
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIdsSet.has(String(a.id))}
                    onChange={() => toggleRowSelection(a.id)}
                  />
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>
                  <div>{formatDateDisplay(a.fecha_ejecutar || '', 'N.A.')}</div>
                  {a.origen_programacion === 'FECHA' && Number(a.dias_anticipacion_alerta) > 0 && (
                    <div style={{ marginTop: '.2rem', fontSize: '.74rem', color: '#2563eb', fontWeight: 700 }}>
                      Aviso desde {formatDateDisplay(a.alerta_desde || '', 'N.A.')}
                    </div>
                  )}
                  {a.fecha_reprogramacion && (
                    <div style={{ marginTop: '.2rem', fontSize: '.74rem', color: '#b45309', fontWeight: 800 }}>
                      Reprogramada: {a.motivo_reprogramacion || 'Sin motivo registrado'}
                    </div>
                  )}
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.codigo}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.descripcion}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.area_trabajo}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.prioridad}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.actividad}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.responsable}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>
                  <div style={{ color: tone.text, fontWeight: 800 }}>{a.status_ot}</div>
                  {tone.key === 'overdue' && (
                    <div style={{ marginTop: '.2rem', color: tone.text, fontSize: '.78rem', fontWeight: 800 }}>
                      {tone.label}
                    </div>
                  )}
                  {a.cierre_ot?.devuelta_revision && a.status_ot === 'Liberada' && (
                    <div
                      style={{
                        marginTop: '.25rem',
                        display: 'inline-flex',
                        padding: '.15rem .45rem',
                        borderRadius: '999px',
                        background: '#fef2f2',
                        color: '#b91c1c',
                        fontWeight: 700,
                        fontSize: '.75rem',
                      }}
                    >
                      Devuelta: {a.cierre_ot.motivo_devolucion_tipo || 'Corregir'}
                    </div>
                  )}
                  {rowConsistency.hasInconsistency && (
                    <div style={{ color: '#dc2626', fontSize: '.78rem', fontWeight: 700 }}>
                      Inconsistencia: {rowConsistency.count}
                    </div>
                  )}
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.ot_numero}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{formatDateDisplay(a.fecha_ejecucion || '', 'N.A.')}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.tipo_mantto}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.personal_mantenimiento}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.materiales}</td>
              </tr>
            )})}
            {!filteredAlerts.length && (
              <tr>
                <td colSpan={14} style={{ border: '1px solid #d1d5db', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                  No hay OT activas que coincidan con los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <ModalCrearOt
          initialAlert={createModalAlert}
          equipmentItems={equiposItems}
          packageItems={packageItems}
          dropdownOptions={dropdownOptions}
          canManageConfigurableLists={canManageConfigurableLists}
          onQuickAddOption={addOptionQuickly}
          mode={createModalMode}
          onClose={() => {
            setShowCreateModal(false);
            setCreateModalAlert(null);
          }}
          onSubmit={confirmCreateOt}
        />
      )}

      {showReleaseModal && selected && releaseModalMode === 'edit' && (
        <EditLiberatedOtModal
          alert={selected}
          rrhhItems={rrhhItems}
          materialsCatalog={materialesItems}
          reports={reportByAlert.get(String(selected.id)) || []}
          onClose={() => setShowReleaseModal(false)}
          onSave={handleSaveLiberatedOtChanges}
        />
      )}

      {showReleaseModal && selected && releaseModalMode !== 'edit' && (
        <ModalOtLiberacion
          alert={selected}
          rrhhItems={rrhhItems}
          materialesItems={materialesItems}
          activeAlerts={alerts}
          mode={releaseModalMode}
          onClose={() => setShowReleaseModal(false)}
          onSubmit={confirmRelease}
        />
      )}

      {showReprogramModal && selected && (
        <ModalReprogramarOt
          alert={selected}
          onClose={() => setShowReprogramModal(false)}
          onSubmit={confirmReprogramOt}
        />
      )}

      {showCloseModal && selected && (
        <ModalCerrarOT
          alert={selected}
          reports={reportByAlert.get(String(selected.id)) || []}
          equiposItems={equiposItems}
          initialAction={closeModalAction}
          onClose={() => setShowCloseModal(false)}
          onReturnToLiberated={returnOtToLiberated}
          onSubmit={confirmCloseOt}
        />
      )}
    </div>
  );
}

