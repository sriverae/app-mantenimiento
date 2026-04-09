import { formatDateDisplay, formatDateTimeDisplay } from './dateFormat';

export const WORK_OBSERVATION_PRESETS = [
  {
    key: 'conforme_hoy',
    label: 'Trabajo conforme',
    text: 'El trabajo queda conforme el dia de hoy.',
    requiresNotice: false,
    noticeCategory: 'Conforme',
  },
  {
    key: 'culminado_total',
    label: 'Trabajo culminado',
    text: 'Se culmino en su totalidad el trabajo.',
    requiresNotice: false,
    noticeCategory: 'Conforme',
  },
  {
    key: 'observacion_electrica',
    label: 'Observacion electrica',
    text: 'Se culmino con observacion electrica.',
    requiresNotice: true,
    noticeCategory: 'Observacion electrica',
  },
  {
    key: 'observacion_mecanica',
    label: 'Observacion mecanica',
    text: 'Se culmino con observacion mecanica.',
    requiresNotice: true,
    noticeCategory: 'Observacion mecanica',
  },
  {
    key: 'servicio_terceros',
    label: 'Servicio de terceros',
    text: 'Se requiere un servicio de terceros.',
    requiresNotice: true,
    noticeCategory: 'Servicio de terceros',
  },
];

function safeText(value) {
  return String(value || '').trim();
}

export function getObservationPreset(key) {
  return WORK_OBSERVATION_PRESETS.find((item) => item.key === key) || null;
}

export function buildObservationText(presetKey, detail = '') {
  const preset = getObservationPreset(presetKey);
  const base = preset?.text || '';
  const extra = safeText(detail);
  if (!base) return extra;
  if (!extra) return base;
  return `${base} Detalle: ${extra}.`;
}

export function formatMaintenanceNoticeCode(sourceOtNumber, sequence) {
  const safeSource = safeText(sourceOtNumber) || 'OT';
  return `AV-${safeSource}-${String(Number(sequence) || 1).padStart(3, '0')}`;
}

function inferNextNoticeSequence(sourceOtNumber, existingNotices = []) {
  const safeSource = safeText(sourceOtNumber);
  return (Array.isArray(existingNotices) ? existingNotices : []).reduce((max, item) => {
    if (safeText(item.source_ot_numero) !== safeSource) return max;
    const current = Number(item.sequence) || 0;
    return current > max ? current : max;
  }, 0) + 1;
}

export function buildMaintenanceNoticesFromReports(alert, reports, existingNotices = [], currentUserLabel = 'Sistema') {
  const safeReports = Array.isArray(reports) ? reports : [];
  let nextSequence = inferNextNoticeSequence(alert?.ot_numero, existingNotices);

  return safeReports.reduce((acc, report, index) => {
    const suggestion = report?.maintenanceSuggestion;
    if (!suggestion?.requiresNotice) return acc;

    const sequence = nextSequence;
    nextSequence += 1;

    acc.push({
      id: `notice_${Date.now()}_${index + 1}_${sequence}`,
      sequence,
      aviso_codigo: formatMaintenanceNoticeCode(alert?.ot_numero, sequence),
      status: 'Pendiente',
      source_ot_id: alert?.id,
      source_ot_numero: alert?.ot_numero || '',
      source_report_id: report?.id || '',
      source_report_code: report?.reportCode || '',
      codigo: alert?.codigo || '',
      descripcion: alert?.descripcion || '',
      area_trabajo: alert?.area_trabajo || 'N.A.',
      responsable: alert?.responsable || 'N.A.',
      categoria: suggestion.noticeCategory || suggestion.category || 'Aviso tecnico',
      detalle: safeText(suggestion.detail),
      sugerencia_texto: safeText(suggestion.text || report?.observaciones),
      fecha_aviso: report?.fechaFin || report?.fechaInicio || new Date().toISOString().slice(0, 10),
      rango_notificacion: `${formatDateTimeDisplay(report?.fechaInicio, report?.horaInicio, 'N.A.')} - ${formatDateTimeDisplay(report?.fechaFin, report?.horaFin, 'N.A.')}`,
      created_at: new Date().toISOString(),
      created_by: currentUserLabel,
      accepted_ot_id: '',
      accepted_ot_number: '',
      rejection_reason: '',
    });

    return acc;
  }, []);
}

export function buildPendingOtFromNotice(notice) {
  return {
    id: `notice_ot_${Date.now()}_${notice.id}`,
    fecha_ejecutar: notice.fecha_aviso || new Date().toISOString().slice(0, 10),
    codigo: notice.codigo || '',
    descripcion: notice.descripcion || '',
    area_trabajo: notice.area_trabajo || 'N.A.',
    prioridad: 'Media',
    actividad: notice.detalle
      ? `${notice.categoria}: ${notice.detalle}`
      : `${notice.categoria}: ${notice.sugerencia_texto}`,
    responsable: notice.responsable || 'N.A.',
    status_ot: 'Pendiente',
    ot_numero: '',
    fecha_ejecucion: '',
    tipo_mantto: 'Correctivo',
    personal_mantenimiento: '',
    materiales: '',
    personal_detalle: [],
    materiales_detalle: [],
    registro_ot: null,
    cierre_ot: null,
    origen_programacion: 'AVISO',
    aviso_id: notice.id,
    aviso_codigo: notice.aviso_codigo,
    servicio: notice.detalle || notice.sugerencia_texto || '',
    vc: 'V.C - DIA',
    tiempo_min: 0,
    paquete_pm_id: '',
    paquete_pm_nombre: '',
  };
}

export function summarizeNoticeForDisplay(notice) {
  const detail = safeText(notice?.detalle);
  return detail ? `${notice?.categoria || 'Aviso'}: ${detail}` : `${notice?.categoria || 'Aviso'}: ${notice?.sugerencia_texto || ''}`;
}

export function getNoticeStatusColor(status) {
  if (status === 'Aceptado') return '#059669';
  if (status === 'Rechazado') return '#dc2626';
  return '#b45309';
}

export function getNoticeStatusLabel(status) {
  if (status === 'Aceptado') return 'Aceptado';
  if (status === 'Rechazado') return 'Rechazado';
  return 'Pendiente';
}

export function getNoticeDateLabel(notice) {
  return formatDateDisplay(notice?.fecha_aviso || notice?.created_at || '', 'N.A.');
}
