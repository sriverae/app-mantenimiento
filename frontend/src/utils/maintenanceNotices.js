import { formatDateDisplay, formatDateTimeDisplay } from './dateFormat';
import {
  getNoticeProblemPhotos,
  getWorkReportEvidencePhotos,
} from './workReportEvidence';

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

export const NOTICE_DETECTION_OPTIONS = [
  'Visual',
  'Olfativa',
  'Al tacto',
  'Ruido o vibracion',
  'Parada de proceso',
  'Atoro de equipo',
];

function safeText(value) {
  return String(value || '').trim();
}

function normalizeOwnerText(value) {
  return safeText(value).toLowerCase();
}

export function calculateNoticeAssessment({
  canContinueWorking = true,
  detectionMethod = '',
  hasProductionImpact = false,
  hasSafetyRisk = false,
  requiresStop = false,
} = {}) {
  let score = 0;

  if (!canContinueWorking) score += 3;
  if (hasProductionImpact) score += 2;
  if (hasSafetyRisk) score += 3;
  if (requiresStop) score += 3;

  const normalizedDetection = safeText(detectionMethod).toLowerCase();
  if (normalizedDetection.includes('parada')) score += 3;
  else if (normalizedDetection.includes('atoro')) score += 3;
  else if (normalizedDetection.includes('ruido') || normalizedDetection.includes('vibracion')) score += 2;
  else if (normalizedDetection) score += 1;

  let criticality = 'Baja';
  if (score >= 10) criticality = 'Critica';
  else if (score >= 7) criticality = 'Alta';
  else if (score >= 4) criticality = 'Media';

  let suggestedType = 'Correctivo';
  if (requiresStop || !canContinueWorking) suggestedType = 'Correctivo urgente';
  else if (hasProductionImpact) suggestedType = 'Correctivo';
  else if (normalizedDetection.includes('visual')) suggestedType = 'Inspeccion';

  return {
    score,
    criticality,
    priority: criticality === 'Critica' ? 'Critica' : criticality === 'Alta' ? 'Alta' : criticality === 'Media' ? 'Media' : 'Baja',
    suggestedType,
    summary: [
      !canContinueWorking ? 'No puede seguir trabajando con la averia.' : 'Aun puede seguir trabajando con la averia.',
      hasProductionImpact ? 'Existe impacto en produccion.' : 'No se reporta impacto directo en produccion.',
      hasSafetyRisk ? 'Existe riesgo de seguridad.' : 'No se reporta riesgo de seguridad inmediato.',
      requiresStop ? 'Requiere parada o intervencion pronta.' : 'No requiere parada inmediata.',
      normalizedDetection ? `Deteccion: ${detectionMethod}.` : '',
    ].filter(Boolean).join(' '),
  };
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
    const evidencePhotos = getWorkReportEvidencePhotos(report);
    const problemPhotos = [evidencePhotos.after, evidencePhotos.before].filter(Boolean);

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
      hora_evidencia: safeText(report?.horaFin || report?.horaInicio),
      rango_notificacion: `${formatDateTimeDisplay(report?.fechaInicio, report?.horaInicio, 'N.A.')} - ${formatDateTimeDisplay(report?.fechaFin, report?.horaFin, 'N.A.')}`,
      created_at: new Date().toISOString(),
      created_by: currentUserLabel,
      created_by_user_id: '',
      created_by_username: '',
      created_by_name: currentUserLabel,
      accepted_ot_id: '',
      accepted_ot_number: '',
      accepted_by_name: '',
      accepted_by_role: '',
      rejected_by_name: '',
      rejected_by_role: '',
      rejection_reason: '',
      can_continue_working: true,
      detection_method: '',
      has_production_impact: false,
      has_safety_risk: false,
      requires_stop: false,
      criticidad_aviso: suggestion.noticeCategory === 'Servicio de terceros' ? 'Alta' : 'Media',
      prioridad_sugerida: suggestion.noticeCategory === 'Servicio de terceros' ? 'Alta' : 'Media',
      tipo_mantto_sugerido: suggestion.noticeCategory === 'Servicio de terceros' ? 'Correctivo urgente' : 'Correctivo',
      photos: problemPhotos,
      problem_photos: problemPhotos,
    });

    return acc;
  }, []);
}

export function buildPendingOtFromNotice(notice) {
  const priority = safeText(notice.prioridad_sugerida) || safeText(notice.criticidad_aviso) || 'Media';
  const type = safeText(notice.tipo_mantto_sugerido) || 'Correctivo';
  return {
    id: `notice_ot_${Date.now()}_${notice.id}`,
    fecha_ejecutar: notice.fecha_aviso || new Date().toISOString().slice(0, 10),
    codigo: notice.codigo || '',
    descripcion: notice.descripcion || '',
    area_trabajo: notice.area_trabajo || 'N.A.',
    prioridad: priority,
    actividad: notice.detalle
      ? `${notice.categoria}: ${notice.detalle}`
      : `${notice.categoria}: ${notice.sugerencia_texto}`,
    responsable: notice.responsable || 'N.A.',
    status_ot: 'Pendiente',
    ot_numero: '',
    fecha_ejecucion: '',
    tipo_mantto: type,
    personal_mantenimiento: '',
    materiales: '',
    personal_detalle: [],
    materiales_detalle: [],
    registro_ot: null,
    cierre_ot: null,
    origen_programacion: 'AVISO',
    aviso_id: notice.id,
    aviso_codigo: notice.aviso_codigo,
    fecha_emision_aviso: notice.fecha_aviso || notice.created_at || '',
    hora_emision_aviso: notice.hora_evidencia || '',
    aviso_creado_at: notice.created_at || '',
    fecha_aceptacion_aviso: notice.accepted_at || '',
    aviso_aceptado_por: notice.accepted_by_name || '',
    servicio: notice.detalle || notice.sugerencia_texto || '',
    vc: 'V.C - DIA',
    tiempo_min: 0,
    paquete_pm_id: '',
    paquete_pm_nombre: '',
    criticidad_aviso: notice.criticidad_aviso || '',
    prioridad_sugerida: priority,
    tipo_mantto_sugerido: type,
    requiere_parada: Boolean(notice.requires_stop),
    riesgo_seguridad: Boolean(notice.has_safety_risk),
    impacto_produccion: Boolean(notice.has_production_impact),
    aviso_origen: {
      ...notice,
      photos: getNoticeProblemPhotos(notice),
      problem_photos: getNoticeProblemPhotos(notice),
    },
  };
}

export function isMaintenanceNoticeOwnedByUser(notice, user) {
  if (!notice || !user) return false;

  const noticeUserId = safeText(notice.created_by_user_id);
  const userId = safeText(user.id);
  if (noticeUserId && userId && noticeUserId === userId) return true;

  const noticeUsername = normalizeOwnerText(notice.created_by_username);
  const username = normalizeOwnerText(user.username);
  if (noticeUsername && username && noticeUsername === username) return true;

  const noticeName = normalizeOwnerText(notice.created_by_name);
  const fullName = normalizeOwnerText(user.full_name);
  if (noticeName && fullName && noticeName === fullName) return true;

  return false;
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
