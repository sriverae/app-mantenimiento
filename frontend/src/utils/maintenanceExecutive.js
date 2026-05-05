import { buildPersonAttendanceMetrics } from './attendanceMetrics';
import { formatDateDisplay } from './dateFormat';
import { getAlertConsistencySummary } from './otConsistency';
import { summarizeServiceReports } from './workReportServices';

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const safeText = (value) => String(value || '').trim();

const normalizeHistoryRows = (history = []) => (Array.isArray(history) ? history : []);

const getMaterialFamily = (material) => (
  material?.familia
  || material?.grupo
  || material?.categoria
  || String(material?.descripcion || material?.codigo || 'Sin familia').trim().split(/\s+/)[0]
  || 'Sin familia'
);

export function buildHistoryCostBreakdown(historyRows = [], rrhhRows = [], materialRows = []) {
  const rrhhByCode = new Map((Array.isArray(rrhhRows) ? rrhhRows : []).map((item) => [String(item.codigo || ''), item]));
  const materialsByCode = new Map((Array.isArray(materialRows) ? materialRows : []).map((item) => [String(item.codigo || ''), item]));

  const byEquipment = new Map();
  const byArea = new Map();
  const byFailureMode = new Map();
  const byFamily = new Map();

  const detailedRows = normalizeHistoryRows(historyRows).map((row) => {
    const reports = Array.isArray(row.reportes_trabajo) ? row.reportes_trabajo : [];
    const laborRows = Array.isArray(row.cierre_ot?.tiempo_personal) ? row.cierre_ot.tiempo_personal : [];

    const laborCost = laborRows.reduce((sum, person) => {
      const rrhh = rrhhByCode.get(String(person.codigo || ''));
      const rate = asNumber(person.costo_hora ?? rrhh?.costo_hora);
      return sum + (asNumber(person.horas) * rate);
    }, 0);

    const serviceCost = reports.reduce((sum, report) => sum + asNumber(report.serviceCost ?? report.costo_servicio), 0);

    let materialCost = 0;
    reports.forEach((report) => {
      (Array.isArray(report.materialesExtra) ? report.materialesExtra : []).forEach((item) => {
        const material = materialsByCode.get(String(item.codigo || item.materialId || ''));
        const rowCost = asNumber(item.cantidad) * asNumber(item.costo_unit ?? material?.costo_unit);
        materialCost += rowCost;
        const family = getMaterialFamily(material || item);
        byFamily.set(family, (byFamily.get(family) || 0) + rowCost);
      });
    });

    const totalCost = laborCost + serviceCost + materialCost;
    const equipmentKey = safeText(row.codigo || row.descripcion) || 'Sin equipo';
    const areaKey = safeText(row.area_trabajo) || 'Sin area';
    const failureModeKey = safeText(row.cierre_ot?.modo_falla) || 'Sin modo de falla';

    byEquipment.set(equipmentKey, (byEquipment.get(equipmentKey) || 0) + totalCost);
    byArea.set(areaKey, (byArea.get(areaKey) || 0) + totalCost);
    byFailureMode.set(failureModeKey, (byFailureMode.get(failureModeKey) || 0) + totalCost);

    return {
      id: row.id || `${equipmentKey}_${row.fecha_cierre || row.fecha_ejecucion || ''}`,
      codigo: row.codigo || '',
      descripcion: row.descripcion || '',
      area_trabajo: row.area_trabajo || 'N.A.',
      tipo_mantto: row.tipo_mantto || 'N.A.',
      modo_falla: row.cierre_ot?.modo_falla || 'N.A.',
      componente: row.cierre_ot?.componente_intervenido || 'N.A.',
      fecha_cierre: row.fecha_cierre || row.fecha_ejecucion || row.fecha_ejecutar || '',
      laborCost,
      serviceCost,
      materialCost,
      totalCost,
    };
  });

  const totalCost = detailedRows.reduce((sum, row) => sum + row.totalCost, 0);
  const totalServiceCost = detailedRows.reduce((sum, row) => sum + row.serviceCost, 0);

  return {
    totalCost,
    totalServiceCost,
    serviceWeight: totalCost > 0 ? Math.round((totalServiceCost / totalCost) * 100) : 0,
    detailedRows: detailedRows.sort((a, b) => b.totalCost - a.totalCost),
    byEquipment: Array.from(byEquipment.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    byArea: Array.from(byArea.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    byFailureMode: Array.from(byFailureMode.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    byFamily: Array.from(byFamily.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
  };
}

export function buildFailureAnalytics(historyRows = [], amefRows = []) {
  const byMode = new Map();
  const byCause = new Map();
  const byComponent = new Map();
  const byEquipment = new Map();
  const amefModes = new Set(
    (Array.isArray(amefRows) ? amefRows : [])
      .map((item) => safeText(item.modo_falla).toLowerCase())
      .filter(Boolean),
  );

  const correctiveRows = normalizeHistoryRows(historyRows).filter((row) => safeText(row.tipo_mantto).toLowerCase().includes('correctivo'));
  const manualModes = [];

  correctiveRows.forEach((row) => {
    const mode = safeText(row.cierre_ot?.modo_falla) || 'Sin modo de falla';
    const cause = safeText(row.cierre_ot?.causa_raiz) || 'Sin causa raiz';
    const component = safeText(row.cierre_ot?.componente_intervenido) || 'Sin componente';
    const equipment = safeText(row.codigo || row.descripcion) || 'Sin equipo';

    byMode.set(mode, (byMode.get(mode) || 0) + 1);
    byCause.set(cause, (byCause.get(cause) || 0) + 1);
    byComponent.set(component, (byComponent.get(component) || 0) + 1);
    byEquipment.set(equipment, (byEquipment.get(equipment) || 0) + 1);

    if (mode !== 'Sin modo de falla' && !amefModes.has(mode.toLowerCase())) {
      manualModes.push({
        mode,
        equipment,
        date: row.fecha_cierre || row.fecha_ejecucion || row.fecha_ejecutar || '',
        cause,
      });
    }
  });

  return {
    totalCorrective: correctiveRows.length,
    repeatEquipment: Array.from(byEquipment.entries()).filter(([, count]) => count > 1).length,
    topModes: Array.from(byMode.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    topCauses: Array.from(byCause.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    topComponents: Array.from(byComponent.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    repeatedByEquipment: Array.from(byEquipment.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    amefCoveragePct: correctiveRows.length
      ? Math.round(((correctiveRows.length - manualModes.length) / correctiveRows.length) * 100)
      : 0,
    manualModes,
  };
}

export function buildControlCenterData({
  alerts = [],
  notices = [],
  plansKm = [],
  attendance = [],
  rrhh = [],
  workReports = [],
  equipment = [],
  auditLog = [],
} = {}) {
  const activeAlerts = (Array.isArray(alerts) ? alerts : []).filter((item) => item.status_ot !== 'Cerrada');
  const reportsByAlert = new Map();
  (Array.isArray(workReports) ? workReports : []).forEach((report) => {
    const key = String(report.alertId || '');
    if (!reportsByAlert.has(key)) reportsByAlert.set(key, []);
    reportsByAlert.get(key).push(report);
  });

  const returnedAlerts = activeAlerts.filter((item) => item?.cierre_ot?.devuelta_revision && item.status_ot === 'Liberada');
  const closeRequests = activeAlerts.filter((item) => item.status_ot === 'Solicitud de cierre');
  const inconsistentAlerts = activeAlerts.filter((item) => getAlertConsistencySummary(item, reportsByAlert.get(String(item.id)) || []).hasInconsistency);
  const serviceBlockedAlerts = activeAlerts.filter((item) => summarizeServiceReports(reportsByAlert.get(String(item.id)) || []).hasMissingServiceCost);
  const pendingNotices = (Array.isArray(notices) ? notices : []).filter((item) => safeText(item.status).toLowerCase() === 'pendiente');
  const criticalNotices = pendingNotices.filter((item) => ['alta', 'critica'].includes(safeText(item.criticidad_aviso).toLowerCase()));
  const kmWindows = (Array.isArray(plansKm) ? plansKm : []).filter((plan) => {
    const current = asNumber(plan.km_actual ?? plan.hra_actual);
    const target = asNumber(plan.proximo_km ?? plan.proximo_hra_km);
    const alert = asNumber(plan.alerta_km ?? plan.alerta_ot);
    return target > 0 && current >= Math.max(target - alert, 0);
  });

  const attendanceMetrics = buildPersonAttendanceMetrics({
    people: rrhh,
    attendance,
    workReports,
  });

  let attendanceInconsistencies = 0;
  let underTargetToday = 0;
  let overtimeToday = 0;
  attendanceMetrics.forEach((entry) => {
    const latestDay = entry.daily[0];
    if (!latestDay) return;
    if (latestDay.hasInconsistency) attendanceInconsistencies += 1;
    if (latestDay.utilizationStatus === 'Bajo 85%') underTargetToday += 1;
    if (latestDay.utilizationStatus === 'Horas extra') overtimeToday += 1;
  });

  const unavailableEquipment = (Array.isArray(equipment) ? equipment : []).filter((item) => safeText(item.estado).toLowerCase() && safeText(item.estado).toLowerCase() !== 'operativo');

  const latestAudit = (Array.isArray(auditLog) ? auditLog : []).slice(0, 8);

  const actionCards = [
    {
      key: 'ot-review',
      title: 'OT por revisar',
      route: '/pmp/gestion-ot',
      count: activeAlerts.filter((item) => ['Pendiente', 'Creada', 'Liberada'].includes(item.status_ot)).length,
      color: '#1d4ed8',
      helper: 'Ordenes activas que necesitan seguimiento, liberacion o control diario.',
    },
    {
      key: 'close-review',
      title: 'Solicitudes de cierre',
      route: '/tasks',
      count: closeRequests.length,
      color: closeRequests.length ? '#dc2626' : '#7c3aed',
      helper: 'Cierres pendientes de validar antes de completar la OT.',
    },
    {
      key: 'critical-notices',
      title: 'Avisos criticos',
      route: '/pmp/avisos',
      count: criticalNotices.length,
      color: criticalNotices.length ? '#b91c1c' : '#c2410c',
      helper: 'Avisos pendientes cuya criticidad sugiere impacto fuerte en produccion o seguridad.',
    },
    {
      key: 'attendance',
      title: 'Asistencia e inconsistencias',
      route: '/rrhh/asistencia/historial',
      count: attendanceInconsistencies,
      color: attendanceInconsistencies ? '#b91c1c' : '#0f766e',
      helper: `Horas extra: ${overtimeToday}. Bajo 85%: ${underTargetToday}.`,
    },
    {
      key: 'costs',
      title: 'Costos y fallas',
      route: '/control/analitica',
      count: serviceBlockedAlerts.length,
      color: serviceBlockedAlerts.length ? '#b45309' : '#2563eb',
      helper: 'Servicios sin costo y lectura consolidada de impacto economico y tecnico.',
    },
    {
      key: 'audit',
      title: 'Bitacora ejecutiva',
      route: '/control/bitacora',
      count: latestAudit.length,
      color: '#475569',
      helper: 'Seguimiento de aceptaciones, devoluciones, cierres y ajustes sensibles del sistema.',
    },
  ];

  const exceptionRows = [
    ...criticalNotices.map((item) => ({
      key: `notice_${item.id}`,
      severity: 'critical',
      title: item.aviso_codigo || 'Aviso critico',
      detail: `${item.codigo || 'N.A.'} - ${item.descripcion || 'Sin equipo'} | ${item.categoria || 'Aviso'} | ${item.resumen_criticidad || item.detalle || ''}`,
      route: '/pmp/avisos',
      actionLabel: 'Revisar aviso',
    })),
    ...closeRequests.map((item) => ({
      key: `close_${item.id}`,
      severity: 'warning',
      title: item.ot_numero || 'OT en solicitud de cierre',
      detail: `${item.codigo || 'N.A.'} - ${item.descripcion || 'Sin descripcion'} | Responsable: ${item.responsable || 'N.A.'}`,
      route: '/tasks',
      actionLabel: 'Validar cierre',
    })),
    ...returnedAlerts.map((item) => ({
      key: `returned_${item.id}`,
      severity: 'critical',
      title: item.ot_numero || 'OT devuelta',
      detail: `${item.codigo || 'N.A.'} - ${item.descripcion || 'Sin descripcion'} | Motivo: ${item.cierre_ot?.motivo_devolucion_tipo || 'Corregir'}`,
      route: '/pmp/gestion-ot',
      actionLabel: 'Ver devolucion',
    })),
    ...serviceBlockedAlerts.map((item) => ({
      key: `service_${item.id}`,
      severity: 'warning',
      title: item.ot_numero || 'Servicio sin costo',
      detail: `${item.codigo || 'N.A.'} - ${item.descripcion || 'Sin descripcion'} | Completa el costo antes del cierre.`,
      route: '/tasks',
      actionLabel: 'Completar costo',
    })),
    ...inconsistentAlerts.map((item) => ({
      key: `inconsistency_${item.id}`,
      severity: 'warning',
      title: item.ot_numero || 'OT con inconsistencia',
      detail: `${item.codigo || 'N.A.'} - ${item.descripcion || 'Sin descripcion'} | Hay desfase entre registros y ventana liberada.`,
      route: '/pmp/gestion-ot',
      actionLabel: 'Corregir OT',
    })),
    ...kmWindows.map((plan) => ({
      key: `km_${plan.id}`,
      severity: 'info',
      title: `${plan.codigo || 'Equipo'} entra a ventana Km/Hr`,
      detail: `${plan.equipo || plan.descripcion || 'N.A.'} | Objetivo: ${plan.proximo_km || plan.proximo_hra_km || 'N.A.'} | Actual: ${plan.km_actual || plan.hra_actual || 'N.A.'}`,
      route: '/pmp/km',
      actionLabel: 'Registrar contador',
    })),
    ...unavailableEquipment.slice(0, 6).map((item) => ({
      key: `equipment_${item.id || item.codigo}`,
      severity: 'critical',
      title: `${item.codigo || 'Equipo'} no operativo`,
      detail: `${item.descripcion || 'Sin descripcion'} | Estado: ${item.estado || 'N.A.'}`,
      route: '/pmp/equipos',
      actionLabel: 'Ver equipo',
    })),
  ].slice(0, 18);

  return {
    hero: {
      activeOt: activeAlerts.length,
      closeRequests: closeRequests.length,
      pendingNotices: pendingNotices.length,
      attendanceInconsistencies,
      criticalExceptions: exceptionRows.filter((item) => item.severity === 'critical').length,
    },
    actionCards,
    exceptionRows,
    latestAudit,
  };
}

export function buildAuditOverview(auditRows = []) {
  const byModule = new Map();
  const byAction = new Map();
  const bySeverity = new Map();

  (Array.isArray(auditRows) ? auditRows : []).forEach((item) => {
    const module = safeText(item.module) || 'General';
    const action = safeText(item.action) || 'ACCION';
    const severity = safeText(item.severity) || 'info';
    byModule.set(module, (byModule.get(module) || 0) + 1);
    byAction.set(action, (byAction.get(action) || 0) + 1);
    bySeverity.set(severity, (bySeverity.get(severity) || 0) + 1);
  });

  return {
    total: (Array.isArray(auditRows) ? auditRows : []).length,
    byModule: Array.from(byModule.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    byAction: Array.from(byAction.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    bySeverity: Array.from(bySeverity.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
  };
}

export function formatExecutiveDate(value, fallback = 'N.A.') {
  return value ? formatDateDisplay(value, fallback) : fallback;
}
