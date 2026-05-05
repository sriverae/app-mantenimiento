import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { loadSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import {
  getNoticeStatusColor,
  getNoticeStatusLabel,
  isMaintenanceNoticeOwnedByUser,
  summarizeNoticeForDisplay,
} from '../utils/maintenanceNotices';
import { formatIsoTimestampDisplay } from '../utils/dateFormat';
import { canCreateMaintenanceNotices, getUserRole, ROLE_LABELS } from '../utils/roleAccess';
import { isWorkReportOwnedByUser } from '../utils/workReportOwnership';

function StatCard({ label, value, color = '#111827' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

function ActionCard({ title, helper, count, route, color, cta = 'Abrir modulo' }) {
  return (
    <div
      className="dashboard-panel-card"
      style={{
        border: `1px solid ${color}22`,
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '.8rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.8rem' }}>
        <div>
          <div style={{ color: '#0f172a', fontWeight: 700, marginBottom: '.25rem' }}>{title}</div>
          <div style={{ color: '#6b7280', fontSize: '.9rem', lineHeight: 1.55 }}>{helper}</div>
        </div>
        <span
          style={{
            borderRadius: '999px',
            padding: '.3rem .65rem',
            background: `${color}15`,
            color,
            fontWeight: 700,
            fontSize: '.78rem',
            whiteSpace: 'nowrap',
          }}
        >
          {count}
        </span>
      </div>

      <Link
        to={route}
        className="btn btn-secondary"
        style={{ alignSelf: 'flex-start', textDecoration: 'none' }}
      >
        {cta}
      </Link>
    </div>
  );
}

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDateValue = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getMaterialFamily = (material) => (
  material?.familia
  || material?.grupo
  || material?.categoria
  || String(material?.descripcion || material?.codigo || 'Sin familia').trim().split(/\s+/)[0]
  || 'Sin familia'
);

const buildHistoryCostSummary = (historyRows = [], rrhhRows = [], materialRows = []) => {
  const rrhhByCode = new Map((Array.isArray(rrhhRows) ? rrhhRows : []).map((item) => [String(item.codigo || ''), item]));
  const materialsByCode = new Map((Array.isArray(materialRows) ? materialRows : []).map((item) => [String(item.codigo || ''), item]));

  let totalCost = 0;
  let totalServiceCost = 0;
  const costByEquipment = new Map();
  const costByFamily = new Map();

  (Array.isArray(historyRows) ? historyRows : []).forEach((row) => {
    const reports = Array.isArray(row.reportes_trabajo) ? row.reportes_trabajo : [];
    const laborRows = Array.isArray(row.cierre_ot?.tiempo_personal) ? row.cierre_ot.tiempo_personal : [];

    const laborCost = laborRows.reduce((sum, person) => {
      const rrhh = rrhhByCode.get(String(person.codigo || ''));
      const rate = asNumber(person.costo_hora ?? rrhh?.costo_hora);
      return sum + (asNumber(person.horas) * rate);
    }, 0);

    const serviceCost = reports.reduce((sum, report) => sum + asNumber(report.serviceCost ?? report.costo_servicio), 0);
    totalServiceCost += serviceCost;

    let materialCost = 0;
    reports.forEach((report) => {
      (Array.isArray(report.materialesExtra) ? report.materialesExtra : []).forEach((item) => {
        const material = materialsByCode.get(String(item.codigo || item.materialId || ''));
        const quantity = asNumber(item.cantidad);
        const unitCost = asNumber(item.costo_unit ?? material?.costo_unit);
        const rowCost = quantity * unitCost;
        materialCost += rowCost;

        const family = getMaterialFamily(material || item);
        costByFamily.set(family, (costByFamily.get(family) || 0) + rowCost);
      });
    });

    const rowTotal = laborCost + serviceCost + materialCost;
    totalCost += rowTotal;
    const equipmentKey = row.codigo || row.descripcion || 'Sin equipo';
    costByEquipment.set(equipmentKey, (costByEquipment.get(equipmentKey) || 0) + rowTotal);
  });

  return {
    totalCost,
    totalServiceCost,
    serviceWeight: totalCost > 0 ? Math.round((totalServiceCost / totalCost) * 100) : 0,
    topEquipment: Array.from(costByEquipment.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
    topFamilies: Array.from(costByFamily.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
};

function Dashboard({ user }) {
  const [sharedMetrics, setSharedMetrics] = useState({
    equipment: [],
    plans: [],
    plansKm: [],
    alerts: [],
    history: [],
    materials: [],
    rrhh: [],
    attendance: [],
    notices: [],
    workReports: [],
    operationalEvents: [],
  });
  const [loading, setLoading] = useState(true);

  const normalizedRole = getUserRole(user);
  const isOperationalRole = canCreateMaintenanceNotices(user);
  const roleLabel = ROLE_LABELS[normalizedRole] || normalizedRole || 'Usuario';

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const [equipment, plans, plansKm, alerts, history, materials, rrhh, attendance, notices, workReports, operationalEvents] = await Promise.all([
          loadSharedDocument(SHARED_DOCUMENT_KEYS.equipmentItems, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePlans, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePlansKm, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.otAlerts, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.otHistory, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.materials, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.rrhhAttendance, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.maintenanceNotices, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.otWorkReports, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.operationalEvents, []),
        ]);

        setSharedMetrics({
          equipment: Array.isArray(equipment) ? equipment : [],
          plans: Array.isArray(plans) ? plans : [],
          plansKm: Array.isArray(plansKm) ? plansKm : [],
          alerts: Array.isArray(alerts) ? alerts : [],
          history: Array.isArray(history) ? history : [],
          materials: Array.isArray(materials) ? materials : [],
          rrhh: Array.isArray(rrhh) ? rrhh : [],
          attendance: Array.isArray(attendance) ? attendance : [],
          notices: Array.isArray(notices) ? notices : [],
          workReports: Array.isArray(workReports) ? workReports : [],
          operationalEvents: Array.isArray(operationalEvents) ? operationalEvents : [],
        });
      } catch (err) {
        console.error('Error cargando dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const maintenanceKpis = useMemo(() => {
    const activeAlerts = sharedMetrics.alerts.filter((item) => item.status_ot !== 'Cerrada');
    const liberatedAlerts = activeAlerts.filter((item) => item.status_ot === 'Liberada');
    const requestCloseAlerts = activeAlerts.filter((item) => item.status_ot === 'Solicitud de cierre');
    const closedPreventive = sharedMetrics.history.filter((item) => item.tipo_mantto === 'Preventivo');
    const completedCodes = new Set(closedPreventive.map((item) => `${item.codigo || ''}_${item.fecha_ejecutar || ''}`));
    const duePlans = sharedMetrics.plans.filter((plan) => plan.fecha_inicio && plan.codigo);
    const compliantPlans = duePlans.filter((plan) => completedCodes.has(`${plan.codigo}_${plan.fecha_inicio}`)).length;
    const criticalEquipment = sharedMetrics.equipment.filter((item) => String(item.criticidad || '').toLowerCase() === 'alta').length;
    const unavailableEquipment = sharedMetrics.equipment.filter((item) => String(item.estado || '').toLowerCase() !== 'operativo').length;
    const lowStock = sharedMetrics.materials.filter((item) => (Number(item.stock) || 0) <= (Number(item.stock_min) || 0)).length;
    const kmDue = sharedMetrics.plansKm.filter((plan) => {
      const actual = Number(plan.km_actual) || 0;
      const objetivo = Number(plan.proximo_km) || 0;
      return objetivo > 0 && actual >= objetivo;
    }).length;
    const kmUpcoming = sharedMetrics.plansKm.filter((plan) => {
      const actual = Number(plan.km_actual) || 0;
      const objetivo = Number(plan.proximo_km) || 0;
      const alerta = Number(plan.alerta_km) || 0;
      return objetivo > 0 && actual < objetivo && (objetivo - actual) <= alerta;
    }).length;
    const closedCorrective = sharedMetrics.history.filter((item) => String(item.tipo_mantto || '').toLowerCase().includes('correctivo'));
    const downtimeHours = closedCorrective.reduce((sum, item) => sum + asNumber(item.cierre_ot?.tiempo_indisponible_operacional || item.cierre_ot?.tiempo_indisponible_generico), 0);
    const mttr = closedCorrective.length ? downtimeHours / closedCorrective.length : 0;

    const failuresByEquipment = new Map();
    closedCorrective.forEach((item) => {
      const key = item.codigo || item.descripcion || 'Sin equipo';
      if (!failuresByEquipment.has(key)) failuresByEquipment.set(key, []);
      failuresByEquipment.get(key).push(item);
    });

    let mtbfAccumulator = 0;
    let mtbfEvents = 0;
    failuresByEquipment.forEach((rows) => {
      const sorted = rows
        .map((row) => ({ ...row, _date: getDateValue(row.fecha_cierre || row.fecha_ejecucion || row.fecha_ejecutar) }))
        .filter((row) => row._date)
        .sort((a, b) => a._date - b._date);
      for (let index = 1; index < sorted.length; index += 1) {
        const diffMs = sorted[index]._date - sorted[index - 1]._date;
        if (diffMs > 0) {
          mtbfAccumulator += diffMs / (1000 * 60 * 60 * 24);
          mtbfEvents += 1;
        }
      }
    });
    const mtbfDays = mtbfEvents ? mtbfAccumulator / mtbfEvents : 0;
    const repeatFailures = Array.from(failuresByEquipment.values()).filter((rows) => rows.length > 1).length;

    const rollingPeriodDays = 30;
    const observationHours = Math.max(sharedMetrics.equipment.length, 1) * rollingPeriodDays * 24;
    const availability = observationHours > 0
      ? Math.max(0, Math.min(100, ((observationHours - downtimeHours) / observationHours) * 100))
      : 100;

    const costSummary = buildHistoryCostSummary(sharedMetrics.history, sharedMetrics.rrhh, sharedMetrics.materials);

    return {
      backlog: activeAlerts.length,
      liberated: liberatedAlerts.length,
      requestClose: requestCloseAlerts.length,
      compliance: duePlans.length ? Math.round((compliantPlans / duePlans.length) * 100) : 0,
      criticalEquipment,
      unavailableEquipment,
      lowStock,
      closedOt: sharedMetrics.history.length,
      plansByDate: sharedMetrics.plans.length,
      plansByKm: sharedMetrics.plansKm.length,
      kmDue,
      kmUpcoming,
      mttr,
      mtbfDays,
      availability,
      repeatFailures,
      totalCost: costSummary.totalCost,
      totalServiceCost: costSummary.totalServiceCost,
      serviceWeight: costSummary.serviceWeight,
      topEquipment: costSummary.topEquipment,
      topFamilies: costSummary.topFamilies,
    };
  }, [sharedMetrics]);

  const reviewerAgenda = useMemo(() => {
    if (!['PLANNER', 'INGENIERO'].includes(normalizedRole)) return [];

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const yesterdayKey = format(new Date(Date.now() - (24 * 60 * 60 * 1000)), 'yyyy-MM-dd');
    const activeAlerts = sharedMetrics.alerts.filter((item) => item.status_ot !== 'Cerrada');
    const reviewableOt = activeAlerts.filter((item) => ['Pendiente', 'Creada', 'Liberada'].includes(item.status_ot));
    const closeRequests = activeAlerts.filter((item) => item.status_ot === 'Solicitud de cierre');
    const pendingNotices = sharedMetrics.notices.filter((item) => String(item.status || '').toLowerCase() === 'pendiente');
    const todayAgenda = activeAlerts.filter((item) => item.fecha_ejecutar === todayKey);
    const attendanceToday = sharedMetrics.attendance.filter((item) => item.fecha === todayKey);
    const attendancePending = Math.max((sharedMetrics.rrhh || []).length - attendanceToday.length, 0);
    const unavailableToday = attendanceToday.filter((item) => ['Descanso medico', 'Vacaciones', 'Suspension', 'Falta'].includes(item.estado_asistencia)).length;
    const kmReview = sharedMetrics.plansKm.filter((plan) => {
      const actual = Number(plan.km_actual || plan.hra_actual) || 0;
      const objetivo = Number(plan.proximo_km || plan.proximo_hra_km) || 0;
      const alerta = Number(plan.alerta_km || plan.alerta_ot) || 0;
      return objetivo > 0 && actual >= Math.max(objetivo - alerta, 0);
    });
    const yesterdayEventRecord = sharedMetrics.operationalEvents.find((item) => item.fecha_operativa === yesterdayKey);

    return [
      {
        key: 'eventos-operativos',
        title: 'Eventos operativos',
        route: '/control/eventos',
        count: yesterdayEventRecord ? 0 : 1,
        priority: yesterdayEventRecord ? 'Baja' : 'Alta',
        color: yesterdayEventRecord ? '#059669' : '#b45309',
        helper: yesterdayEventRecord
          ? `Dia anterior reportado: ${yesterdayEventRecord.hubo_evento ? (yesterdayEventRecord.tipo_evento || 'Evento registrado') : 'sin eventos'}.`
          : 'Responde si ayer hubo evento climatologico, corte de energia u otro evento externo.',
      },
      {
        key: 'gestion-ot',
        title: 'Gestion de OT',
        route: '/pmp/gestion-ot',
        count: reviewableOt.length,
        priority: reviewableOt.length ? 'Alta' : 'Baja',
        color: reviewableOt.length ? '#b91c1c' : '#2563eb',
        helper: reviewableOt.length
          ? `${reviewableOt.length} orden(es) requieren revision, liberacion o seguimiento.`
          : 'No hay ordenes activas pendientes por revisar.',
      },
      {
        key: 'cierres',
        title: 'Solicitudes de cierre',
        route: '/tasks',
        count: closeRequests.length,
        priority: closeRequests.length ? 'Alta' : 'Media',
        color: closeRequests.length ? '#dc2626' : '#7c3aed',
        helper: closeRequests.length
          ? `${closeRequests.length} OT esperan validacion final del planner.`
          : 'No hay cierres pendientes por revisar hoy.',
      },
      {
        key: 'avisos',
        title: 'Avisos de mantenimiento',
        route: '/pmp/avisos',
        count: pendingNotices.length,
        priority: pendingNotices.length ? 'Alta' : 'Media',
        color: pendingNotices.length ? '#c2410c' : '#0891b2',
        helper: pendingNotices.length
          ? `${pendingNotices.length} aviso(s) tecnicos necesitan aceptar o rechazar.`
          : 'No hay avisos pendientes en este momento.',
      },
      {
        key: 'contadores',
        title: 'Registrar contadores',
        route: '/pmp/km',
        count: kmReview.length,
        priority: kmReview.length ? 'Media' : 'Baja',
        color: kmReview.length ? '#b45309' : '#059669',
        helper: kmReview.length
          ? `${kmReview.length} equipo(s) por Km/Hr ya entraron a su ventana de alerta.`
          : 'No hay planes por Km/Hr dentro de su ventana critica.',
      },
      {
        key: 'asistencia',
        title: 'Asistencia del personal',
        route: '/rrhh/asistencia',
        count: attendancePending,
        priority: attendancePending || unavailableToday ? 'Alta' : 'Baja',
        color: attendancePending || unavailableToday ? '#b91c1c' : '#0f766e',
        helper: attendancePending
          ? `${attendancePending} trabajador(es) aun no tienen asistencia marcada hoy. No disponibles: ${unavailableToday}.`
          : `Asistencia del dia completada. No disponibles registrados: ${unavailableToday}.`,
      },
      {
        key: 'calendario',
        title: 'Calendario del dia',
        route: '/pmp/calendario',
        count: todayAgenda.length,
        priority: todayAgenda.length ? 'Media' : 'Baja',
        color: todayAgenda.length ? '#1d4ed8' : '#475569',
        helper: todayAgenda.length
          ? `${todayAgenda.length} actividad(es) quedaron programadas para hoy.`
          : 'Hoy no hay actividades programadas en el calendario PMP.',
      },
    ];
  }, [normalizedRole, sharedMetrics]);

  const operationalSummary = useMemo(() => {
    if (!isOperationalRole) return null;

    const ownNotices = sharedMetrics.notices
      .filter((item) => isMaintenanceNoticeOwnedByUser(item, user))
      .sort((a, b) => new Date(b.created_at || b.fecha_aviso || 0) - new Date(a.created_at || a.fecha_aviso || 0));
    const ownReports = sharedMetrics.workReports
      .filter((item) => isWorkReportOwnedByUser(item, user))
      .sort((a, b) => new Date(`${b.fechaFin || b.fechaInicio || ''}T${b.horaFin || b.horaInicio || '00:00'}`) - new Date(`${a.fechaFin || a.fechaInicio || ''}T${a.horaFin || a.horaInicio || '00:00'}`));

    const assignedAlerts = sharedMetrics.alerts.filter((item) => {
      const responsible = String(item.responsable || '').toLowerCase();
      const fullName = String(user?.full_name || '').toLowerCase();
      const username = String(user?.username || '').toLowerCase();
      return (fullName && responsible.includes(fullName)) || (username && responsible.includes(username));
    });

    return {
      ownNotices,
      ownReports,
      assignedAlerts,
      pending: ownNotices.filter((item) => item.status === 'Pendiente').length,
      accepted: ownNotices.filter((item) => item.status === 'Aceptado').length,
      rejected: ownNotices.filter((item) => item.status === 'Rechazado').length,
      recentNotices: ownNotices.slice(0, 5),
      actions: [
        {
          key: 'crear-aviso',
          title: 'Avisos de Mantenimiento',
          route: '/pmp/avisos',
          count: ownNotices.length,
          color: '#c2410c',
          cta: 'Registrar o revisar',
          helper: 'Levanta un aviso cuando detectes una condicion insegura, una observacion mecanica o una necesidad de servicio.',
        },
        {
          key: 'mis-registros',
          title: 'Mis Registros',
          route: '/worklogs',
          count: ownReports.length,
          color: '#2563eb',
          cta: 'Abrir mis registros',
          helper: 'Consulta tu historial personal de notificaciones y revisa rapidamente lo que ya documentaste.',
        },
        {
          key: 'consultar-ot',
          title: 'Consulta de OT',
          route: '/pmp/gestion-ot',
          count: sharedMetrics.alerts.filter((item) => item.status_ot !== 'Cerrada').length,
          color: '#7c3aed',
          cta: 'Ver OT activas',
          helper: 'Consulta el estado de las ordenes activas en modo lectura y verifica si alguna ya cambio de etapa.',
        },
        {
          key: 'notificaciones',
          title: 'Notificaciones de Trabajo',
          route: '/tasks',
          count: assignedAlerts.length,
          color: '#059669',
          cta: 'Abrir consulta',
          helper: 'Revisa lo registrado por el equipo. En este perfil solo consultas; los cambios siguen restringidos.',
        },
      ],
    };
  }, [isOperationalRole, sharedMetrics, user]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (isOperationalRole && operationalSummary) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <h1 className="dashboard-title">
              Panel operativo de {roleLabel}
            </h1>
            <p className="dashboard-date">
              {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
            </p>
          </div>
        </div>

        <div
          className="card"
          style={{
            marginBottom: '1.25rem',
            background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
            border: '1px solid #bfdbfe',
          }}
        >
          <h2 className="card-title" style={{ marginBottom: '.45rem' }}>Que puedes hacer en este perfil</h2>
          <p style={{ color: '#1e3a8a', lineHeight: 1.7, marginBottom: '.4rem' }}>
            Tu foco principal es levantar avisos de mantenimiento y consultar tu propio historial. El resto de modulos se mantienen disponibles en modo solo lectura para que puedas revisar informacion sin alterar la operacion.
          </p>
          <p style={{ color: '#475569', marginBottom: 0 }}>
            Recomendacion del turno: detecta la condicion, registra el aviso, revisa si fue aceptado y luego consulta tus registros para confirmar lo documentado.
          </p>
        </div>

        <div className="stats-grid">
          <StatCard label="Mis avisos pendientes" value={operationalSummary.pending} color="#b45309" />
          <StatCard label="Mis avisos aceptados" value={operationalSummary.accepted} color="#059669" />
          <StatCard label="Mis avisos rechazados" value={operationalSummary.rejected} color="#dc2626" />
          <StatCard label="Mis registros" value={operationalSummary.ownReports.length} color="#2563eb" />
        </div>

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <h2 className="card-title" style={{ marginBottom: '.35rem' }}>Accesos rapidos del turno</h2>
              <p style={{ color: '#6b7280', margin: 0 }}>
                Entradas directas a las dos acciones que mas vas a usar y a la consulta del estado operativo.
              </p>
            </div>
            <div style={{ color: '#334155', fontSize: '.9rem', maxWidth: '360px' }}>
              Mantuvimos este tablero ligero para celular: menos ruido arriba, accesos claros y lectura rapida del estado de tus avisos.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {operationalSummary.actions.map((item) => (
              <ActionCard
                key={item.key}
                title={item.title}
                helper={item.helper}
                count={item.count}
                route={item.route}
                color={item.color}
                cta={item.cta}
              />
            ))}
          </div>
        </div>

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2 className="card-title">Historial reciente de avisos</h2>
          {operationalSummary.recentNotices.length ? (
            <div style={{ display: 'grid', gap: '.85rem' }}>
              {operationalSummary.recentNotices.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: '.85rem',
                    padding: '.95rem 1rem',
                    borderRadius: '.95rem',
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', flexWrap: 'wrap', marginBottom: '.35rem' }}>
                      <strong style={{ color: '#0f172a' }}>{item.aviso_codigo}</strong>
                      <span
                        style={{
                          borderRadius: '999px',
                          padding: '.2rem .55rem',
                          background: `${getNoticeStatusColor(item.status)}15`,
                          color: getNoticeStatusColor(item.status),
                          fontWeight: 700,
                          fontSize: '.78rem',
                        }}
                      >
                        {getNoticeStatusLabel(item.status)}
                      </span>
                    </div>
                    <div style={{ color: '#334155', lineHeight: 1.65, marginBottom: '.2rem' }}>
                      {summarizeNoticeForDisplay(item)}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: '.88rem' }}>
                      {item.codigo || 'N.A.'} - {item.descripcion || 'Sin equipo'} | {formatIsoTimestampDisplay(item.created_at)}
                    </div>
                  </div>
                  <div style={{ alignSelf: 'center' }}>
                    <Link to="/pmp/avisos" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                      Ver detalle
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#6b7280', lineHeight: 1.7 }}>
              Aun no tienes avisos registrados. Usa el acceso directo de arriba para levantar el primero cuando detectes una condicion de mantenimiento.
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2 className="card-title">Ruta sugerida del turno</h2>
          <div style={{ display: 'grid', gap: '.75rem' }}>
            {[
              '1. Revisa el equipo o la zona, confirma la condicion y registra el aviso apenas detectes la evidencia.',
              '2. Vuelve a Avisos de Mantenimiento para seguir el estado de aceptacion o rechazo de lo que levantaste.',
              '3. Usa Mis Registros y Consulta de OT para verificar contexto y mantener trazabilidad sin modificar otras pantallas.',
            ].map((item) => (
              <div
                key={item}
                style={{
                  padding: '.9rem 1rem',
                  borderRadius: '.85rem',
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  color: '#334155',
                  lineHeight: 1.65,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-title">
            Bienvenido, {user.full_name}
          </h1>
          <p className="dashboard-date">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
          </p>
        </div>
      </div>

      {['PLANNER', 'INGENIERO'].includes(normalizedRole) && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <h2 className="card-title" style={{ marginBottom: '.35rem' }}>
                {normalizedRole === 'INGENIERO' ? 'Itinerario Diario del Ingeniero' : 'Itinerario Diario del Planner'}
              </h2>
              <p style={{ color: '#6b7280', margin: 0 }}>
                Prioriza estas revisiones cada dia como si estuvieras abriendo la guardia de mantenimiento de la planta.
              </p>
            </div>
            <div style={{ color: '#334155', fontSize: '.9rem', maxWidth: '360px' }}>
              Orden sugerido: revisar OT activas, validar cierres, atender avisos tecnicos, confirmar contadores y cerrar el dia con calendario.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {reviewerAgenda.map((item) => (
              <div
                key={item.key}
                className="dashboard-panel-card"
                style={{
                  border: `1px solid ${item.color}22`,
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.8rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.8rem' }}>
                  <div>
                    <div style={{ color: '#0f172a', fontWeight: 700, marginBottom: '.25rem' }}>{item.title}</div>
                    <div style={{ color: '#6b7280', fontSize: '.9rem' }}>{item.helper}</div>
                  </div>
                  <span
                    style={{
                      borderRadius: '999px',
                      padding: '.3rem .65rem',
                      background: `${item.color}15`,
                      color: item.color,
                      fontWeight: 700,
                      fontSize: '.78rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.priority}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '.45rem' }}>
                  <strong style={{ fontSize: '2rem', lineHeight: 1, color: item.color }}>{item.count}</strong>
                  <span style={{ color: '#64748b', fontSize: '.92rem' }}>pendiente(s)</span>
                </div>

                <Link
                  to={item.route}
                  className="btn btn-secondary"
                  style={{ alignSelf: 'flex-start', textDecoration: 'none' }}
                >
                  Abrir modulo
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {['PLANNER', 'INGENIERO'].includes(normalizedRole) && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <h2 className="card-title" style={{ marginBottom: '.35rem' }}>Panel ejecutivo de ingenieria</h2>
              <p style={{ color: '#6b7280', margin: 0 }}>
                Entradas directas para control, analitica de fallas/costos y trazabilidad ejecutiva.
              </p>
            </div>
            <div style={{ color: '#334155', fontSize: '.9rem', maxWidth: '380px' }}>
              Si tienes poco tiempo, abre primero Centro de control. Desde ahi vas a ver excepciones, bloqueos y actividad reciente sin navegar modulo por modulo.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <ActionCard
              title="Centro de control"
              helper="OT por revisar, solicitudes de cierre, avisos criticos, contadores en ventana y asistencia inconsistente."
              count={maintenanceKpis.backlog + maintenanceKpis.requestClose}
              route="/control/centro"
              color="#1d4ed8"
              cta="Abrir centro"
            />
            <ActionCard
              title="Analitica ejecutiva"
              helper="Pareto de fallas, cobertura AMEF, costos por equipo, area, modo de falla y familia de repuesto."
              count={maintenanceKpis.repeatFailures}
              route="/control/analitica"
              color="#7c3aed"
              cta="Ver analitica"
            />
            <ActionCard
              title="Bitacora ejecutiva"
              helper="Linea de tiempo con aceptaciones, devoluciones, cierres y cambios sensibles para auditoria y seguimiento."
              count={sharedMetrics.history.length}
              route="/control/bitacora"
              color="#475569"
              cta="Abrir bitacora"
            />
          </div>
        </div>
      )}

      {!['PLANNER', 'INGENIERO'].includes(normalizedRole) && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2 className="card-title">Panel principal</h2>
          <p style={{ color: '#6b7280', lineHeight: 1.7, marginBottom: '1rem' }}>
            Los indicadores de mantenimiento y gestion ahora estan en su propia opcion de menu para revisarlos por equipo o como gestion total.
          </p>
          <Link to="/indicadores" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Abrir indicadores
          </Link>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
