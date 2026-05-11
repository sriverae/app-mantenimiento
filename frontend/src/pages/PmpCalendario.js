import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { useAuth } from '../context/AuthContext';
import { getDatePlanOccurrencesInWindow } from '../utils/datePlanCycle';
import { applyOtReprogramming } from '../utils/otReprogramming';
import { ModalCrearOt } from './PmpGestionOt';

const PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlans;
const KM_PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlansKm;
const PACKAGES_KEY = SHARED_DOCUMENT_KEYS.maintenancePackages;
const EQUIPOS_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const WEEKDAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

const STATUS_META = {
  Pendiente: { bg: '#fff7ed', color: '#c2410c' },
  Creada: { bg: '#eff6ff', color: '#2563eb' },
  Liberada: { bg: '#ecfdf5', color: '#059669' },
  'Solicitud de cierre': { bg: '#fef2f2', color: '#dc2626' },
};

const PRIORITY_ORDER = { Alta: 0, Media: 1, Baja: 2 };

const getTodayDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isKmPlanInAlertWindow = (plan) => {
  const actual = Number(plan.km_actual) || 0;
  const target = Number(plan.proximo_km) || 0;
  const alertKm = Number(plan.alerta_km) || 0;
  return target > 0 && actual >= Math.max(target - alertKm, 0);
};

const buildKmAlertId = (plan) => `km_${plan.id}_${Number(plan.proximo_km) || 0}`;

const addDaysToDateKey = (dateKey, days) => {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  parsed.setDate(parsed.getDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
};

const buildManualCalendarOtId = () => `calendar_manual_${Date.now()}`;

const buildCalendarCells = (year, month) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1);
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  const cells = [];

  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({
      day,
      date,
      iso: date.toISOString().slice(0, 10),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const compareMaintenanceItems = (a, b) => {
  if (a.fecha !== b.fecha) return new Date(a.fecha) - new Date(b.fecha);
  const priorityA = PRIORITY_ORDER[a.prioridad] ?? 99;
  const priorityB = PRIORITY_ORDER[b.prioridad] ?? 99;
  if (priorityA !== priorityB) return priorityA - priorityB;
  return String(a.codigo || '').localeCompare(String(b.codigo || ''));
};

const isItemInOtNoticeWindow = (item, todayKey = getTodayDateKey()) => {
  const start = String(item?.alerta_desde || item?.fecha || '').slice(0, 10);
  const end = String(item?.fecha || item?.fecha_programada || '').slice(0, 10);
  if (!start || !end) return true;
  return start <= todayKey && todayKey <= end;
};

export default function PmpCalendario() {
  const { hasMinRole, user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [plansKm, setPlansKm] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [packages, setPackages] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  const [scheduleAction, setScheduleAction] = useState(null);
  const [newScheduleDate, setNewScheduleDate] = useState('');
  const [scheduleReason, setScheduleReason] = useState('');
  const [showManualOtModal, setShowManualOtModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const canManageSchedule = hasMinRole('ENCARGADO');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [loadedPlans, loadedPlansKm, loadedEquipos, loadedPackages, loadedAlerts, loadedHistory] = await Promise.all([
        loadSharedDocument(PLANS_KEY, []),
        loadSharedDocument(KM_PLANS_KEY, []),
        loadSharedDocument(EQUIPOS_KEY, []),
        loadSharedDocument(PACKAGES_KEY, []),
        loadSharedDocument(OT_ALERTS_KEY, []),
        loadSharedDocument(OT_HISTORY_KEY, []),
      ]);
      if (!active) return;
      setPlans(Array.isArray(loadedPlans) ? loadedPlans : []);
      setPlansKm(Array.isArray(loadedPlansKm) ? loadedPlansKm : []);
      setEquipos(Array.isArray(loadedEquipos) ? loadedEquipos : []);
      setPackages(Array.isArray(loadedPackages) ? loadedPackages : []);
      setAlerts(Array.isArray(loadedAlerts) ? loadedAlerts : []);
      setHistory(Array.isArray(loadedHistory) ? loadedHistory : []);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setSelectedDate(null);
  }, [calendarMonth, calendarYear]);

  const maintenanceItems = useMemo(() => {
    const monthStart = new Date(calendarYear, calendarMonth, 1);
    const monthEnd = new Date(calendarYear, calendarMonth + 1, 0);
    const todayStr = new Date().toISOString().slice(0, 10);
    const activeAlerts = (Array.isArray(alerts) ? alerts : []).filter((item) => item.status_ot !== 'Cerrada');
    const mapExisting = new Map(activeAlerts.map((item) => [String(item.id), item]));
    const closedIds = new Set((Array.isArray(history) ? history : []).map((item) => String(item.id)));

    const dateItems = (Array.isArray(plans) ? plans : [])
      .flatMap((plan) => {
        const eq = (Array.isArray(equipos) ? equipos : []).find((item) => (item.codigo || '') === (plan.codigo || ''));
        return getDatePlanOccurrencesInWindow(plan, monthStart, monthEnd).map((occurrence) => {
          const legacyId = `${occurrence.fecha}_${plan.id}`;
          const existingAlert = mapExisting.get(String(occurrence.id)) || mapExisting.get(String(legacyId));
          const id = existingAlert?.id || occurrence.id;
          if (closedIds.has(id) || closedIds.has(legacyId)) return null;
          return {
            id,
            fecha: occurrence.fecha,
            codigo: plan.codigo || '',
            equipo: plan.equipo || eq?.descripcion || '',
            area_trabajo: eq?.area_trabajo || existingAlert?.area_trabajo || 'N.A.',
            prioridad: plan.prioridad || 'Media',
            responsable: plan.responsable || 'N.A.',
            actividad: occurrence.activities_text || occurrence.title || 'Mantenimiento preventivo programado',
            tipo_mantto: existingAlert?.tipo_mantto || 'Preventivo',
            status_ot: existingAlert?.status_ot || 'Pendiente',
            ot_numero: existingAlert?.ot_numero || '',
            fecha_programada: existingAlert?.fecha_programada || occurrence.fecha,
            alerta_desde: occurrence.alerta_desde,
            dias_anticipacion_alerta: occurrence.dias_anticipacion_alerta,
            tipo_pm_programado: occurrence.marker || '',
            paquete_pm_id: occurrence.package_id || '',
            paquete_pm: occurrence.package_nombre || occurrence.package_codigo || occurrence.title || '',
            ciclo_paso_label: occurrence.title || '',
            origen_programacion: 'FECHA',
          };
        });
      })
      .filter(Boolean);

    const kmItems = (Array.isArray(plansKm) ? plansKm : [])
      .map((plan) => {
        const id = buildKmAlertId(plan);
        if (closedIds.has(id)) return null;

        const existingAlert = mapExisting.get(String(id));
        if (!existingAlert && !isKmPlanInAlertWindow(plan)) return null;

        const fecha = existingAlert?.fecha_ejecutar || todayStr;
        const [year, month] = fecha.split('-').map(Number);
        if (year !== calendarYear || month !== calendarMonth + 1) return null;

        const eq = (Array.isArray(equipos) ? equipos : []).find((item) => (item.codigo || '') === (plan.codigo || ''));
        const target = Number(plan.proximo_km) || 0;
        const actual = Number(plan.km_actual) || 0;
        const remaining = Math.max(target - actual, 0);

        return {
          id,
          fecha,
          codigo: plan.codigo || '',
          equipo: plan.equipo || eq?.descripcion || '',
          area_trabajo: eq?.area_trabajo || existingAlert?.area_trabajo || 'N.A.',
          prioridad: plan.prioridad || 'Media',
          responsable: plan.responsable || 'N.A.',
          actividad: `${plan.actividades || 'Mantenimiento preventivo por kilometraje'}${target ? `\nObjetivo km: ${target.toLocaleString('es-PE')} | Restantes: ${remaining.toLocaleString('es-PE')}` : ''}`,
          tipo_mantto: existingAlert?.tipo_mantto || 'Preventivo por Km',
          status_ot: existingAlert?.status_ot || 'Pendiente',
          ot_numero: existingAlert?.ot_numero || '',
          fecha_programada: existingAlert?.fecha_programada || fecha,
          alerta_desde: existingAlert?.alerta_desde || fecha,
          dias_anticipacion_alerta: existingAlert?.dias_anticipacion_alerta || 0,
          origen_programacion: 'KM',
        };
      })
      .filter(Boolean);

    const manualCalendarItems = activeAlerts
      .filter((item) => item.origen_programacion === 'CALENDARIO_MANUAL')
      .map((item) => {
        const fecha = item.fecha_ejecutar || item.fecha_programada || '';
        const [year, month] = fecha.split('-').map(Number);
        if (year !== calendarYear || month !== calendarMonth + 1) return null;
        if (closedIds.has(String(item.id))) return null;
        return {
          id: item.id,
          fecha,
          codigo: item.codigo || '',
          equipo: item.descripcion || '',
          area_trabajo: item.area_trabajo || 'N.A.',
          prioridad: item.prioridad || 'Media',
          responsable: item.responsable || 'N.A.',
          actividad: item.actividad || 'OT agendada desde calendario',
          tipo_mantto: item.tipo_mantto || 'Correctivo',
          status_ot: item.status_ot || 'Pendiente',
          ot_numero: item.ot_numero || '',
          fecha_programada: item.fecha_programada || fecha,
          alerta_desde: item.alerta_desde || fecha,
          dias_anticipacion_alerta: item.dias_anticipacion_alerta || 0,
          origen_programacion: item.origen_programacion || 'CALENDARIO_MANUAL',
          origen_creacion: item.origen_creacion || 'CALENDARIO',
        };
      })
      .filter(Boolean);

    return [...dateItems, ...kmItems, ...manualCalendarItems].sort(compareMaintenanceItems);
  }, [plans, plansKm, equipos, alerts, history, calendarMonth, calendarYear]);

  const countByDate = useMemo(() => {
    const countMap = new Map();
    maintenanceItems.forEach((item) => {
      countMap.set(item.fecha, (countMap.get(item.fecha) || 0) + 1);
    });
    return countMap;
  }, [maintenanceItems]);

  const selectedItems = useMemo(() => {
    if (!selectedDate) return [];
    return maintenanceItems.filter((item) => item.fecha === selectedDate);
  }, [maintenanceItems, selectedDate]);

  const buildAlertFromCalendarItem = (item, fecha, reason = '') => ({
    id: item.id,
    fecha_ejecutar: fecha,
    fecha_programada: item.fecha_programada || item.fecha,
    fecha_reprogramacion: reason ? new Date().toISOString() : '',
    reprogramado_por: reason ? (user?.full_name || user?.username || user?.role || 'Sistema') : '',
    motivo_reprogramacion: reason,
    reprogramaciones: reason ? [{
      fecha_anterior: item.fecha,
      fecha_nueva: fecha,
      motivo: reason,
      reprogramado_at: new Date().toISOString(),
      reprogramado_por: user?.full_name || user?.username || user?.role || 'Sistema',
    }] : [],
    alerta_desde: item.alerta_desde || fecha,
    dias_anticipacion_alerta: item.dias_anticipacion_alerta || 0,
    codigo: item.codigo || '',
    descripcion: item.equipo || '',
    area_trabajo: item.area_trabajo || 'N.A.',
    prioridad: item.prioridad || 'Media',
    actividad: item.actividad || 'Mantenimiento preventivo programado',
    responsable: item.responsable || 'N.A.',
    status_ot: 'Pendiente',
    ot_numero: '',
    fecha_ejecucion: '',
    tipo_mantto: item.tipo_mantto || 'Preventivo',
    personal_mantenimiento: '',
    materiales: '',
    personal_detalle: [],
    materiales_detalle: [],
    registro_ot: null,
    cierre_ot: null,
    tipo_pm_programado: item.tipo_pm_programado || '',
    paquete_pm_id: item.paquete_pm_id || '',
    paquete_pm: item.paquete_pm || '',
    ciclo_paso_label: item.ciclo_paso_label || '',
    origen_programacion: item.origen_programacion || 'CALENDARIO',
  });

  const persistScheduleChange = async ({ item, fecha, reason }) => {
    if (!canManageSchedule || !item || !fecha) return;
    if (!isItemInOtNoticeWindow(item)) {
      window.alert(`Esta OT solo se puede adelantar o crear dentro de su ventana de aviso: desde ${item.alerta_desde || item.fecha} hasta ${item.fecha}.`);
      return;
    }
    const actorName = user?.full_name || user?.username || user?.role || 'Sistema';
    const nextAlerts = (() => {
      const found = (Array.isArray(alerts) ? alerts : []).some((row) => String(row.id) === String(item.id));
      if (!found) return [buildAlertFromCalendarItem(item, fecha, reason), ...(Array.isArray(alerts) ? alerts : [])];
      return alerts.map((row) => {
        if (String(row.id) !== String(item.id)) return row;
        if (reason) return applyOtReprogramming(row, { fecha_anterior: row.fecha_ejecutar || item.fecha, fecha_nueva: fecha, motivo: reason }, actorName);
        return { ...row, fecha_ejecutar: fecha, fecha_programada: row.fecha_programada || row.fecha_ejecutar || item.fecha };
      });
    })();
    await saveSharedDocument(OT_ALERTS_KEY, nextAlerts);
    setAlerts(nextAlerts);
    setSelectedDate(fecha);
    setScheduleAction(null);
    setNewScheduleDate('');
    setScheduleReason('');
    window.alert(reason ? 'Mantenimiento reprogramado y enviado a Gestion de OT.' : 'Mantenimiento adelantado a hoy y enviado a Gestion de OT.');
  };

  const openManualOtModal = () => {
    if (!selectedDate || !canManageSchedule) return;
    setShowManualOtModal(true);
  };

  const saveManualCalendarOt = async (payload) => {
    if (!selectedDate || !canManageSchedule) return;
    const leadDays = Math.max(0, Math.trunc(Number(payload.dias_anticipacion_alerta) || 0));
    const alertFrom = addDaysToDateKey(selectedDate, -leadDays);
    const createdAt = new Date().toISOString();
    const createdBy = user?.full_name || user?.username || user?.role || 'Sistema';
    const nextRow = {
      id: buildManualCalendarOtId(),
      fecha_ejecutar: selectedDate,
      fecha_programada: selectedDate,
      fecha_creacion: createdAt,
      created_at: createdAt,
      creado_por: createdBy,
      alerta_desde: alertFrom,
      dias_anticipacion_alerta: leadDays,
      codigo: payload.codigo,
      descripcion: payload.descripcion,
      area_trabajo: payload.area_trabajo || 'N.A.',
      prioridad: payload.prioridad || 'Media',
      actividad: payload.actividad,
      responsable: payload.responsable || 'N.A.',
      status_ot: 'Pendiente',
      ot_numero: '',
      fecha_ejecucion: '',
      tipo_mantto: payload.tipo_mantto || 'Correctivo',
      personal_mantenimiento: '',
      materiales: '',
      personal_detalle: [],
      materiales_detalle: [],
      registro_ot: null,
      cierre_ot: null,
      equipo_id: payload.equipo_id || '',
      servicio: payload.servicio || '',
      vc: payload.vc || 'V.C - DIA',
      tiempo_min: Number(payload.tiempo_min) || 0,
      paquete_pm_id: payload.paquete_pm_id || '',
      paquete_pm_nombre: payload.paquete_pm_nombre || '',
      origen_programacion: 'CALENDARIO_MANUAL',
      origen_creacion: 'CALENDARIO',
    };
    const nextAlerts = [nextRow, ...(Array.isArray(alerts) ? alerts : [])];
    await saveSharedDocument(OT_ALERTS_KEY, nextAlerts);
    setAlerts(nextAlerts);
    setShowManualOtModal(false);
    window.alert(`OT agendada para ${selectedDate}. Avisara desde ${alertFrom}.`);
  };

  const calendarCells = useMemo(
    () => buildCalendarCells(calendarYear, calendarMonth),
    [calendarYear, calendarMonth],
  );

  const monthTotal = maintenanceItems.length;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Calendario PMP</h1>
        <p style={{ color: '#6b7280' }}>Calendario mensual de mantenimientos pendientes por fecha y por kilometraje.</p>
      </div>

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">Manttos del mes</div>
          <div className="stat-value">{monthTotal}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Dias con mantto</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{countByDate.size}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Dia seleccionado</div>
          <div className="stat-value" style={{ color: '#059669' }}>{selectedDate ? (countByDate.get(selectedDate) || 0) : 0}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Calendario de mantenimientos</h2>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (calendarMonth === 0) {
                  setCalendarMonth(11);
                  setCalendarYear((prev) => prev - 1);
                } else {
                  setCalendarMonth((prev) => prev - 1);
                }
              }}
            >
              Mes anterior
            </button>
            <select className="form-select" style={{ minWidth: '145px' }} value={calendarMonth} onChange={(e) => setCalendarMonth(Number(e.target.value))}>
              {MONTHS.map((monthName, index) => (
                <option key={monthName} value={index}>{monthName}</option>
              ))}
            </select>
            <input type="number" className="form-input" style={{ width: '95px' }} min={2000} max={2100} value={calendarYear} onChange={(e) => setCalendarYear(Number(e.target.value) || new Date().getFullYear())} />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (calendarMonth === 11) {
                  setCalendarMonth(0);
                  setCalendarYear((prev) => prev + 1);
                } else {
                  setCalendarMonth((prev) => prev + 1);
                }
              }}
            >
              Mes siguiente
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="pmp-calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: '.65rem' }}>
          {WEEKDAYS.map((label) => (
            <div key={label} className="pmp-calendar-weekday" style={{ padding: '.6rem .7rem', borderRadius: '.65rem', background: '#1f3b5b', color: '#fff', fontWeight: 700, textAlign: 'center' }}>
              {label}
            </div>
          ))}

          {calendarCells.map((cell, index) => {
            if (!cell) {
              return (
                <div
                  key={`blank-${index}`}
                  className="pmp-calendar-empty"
                  style={{ minHeight: '115px', border: '1px dashed #e5e7eb', borderRadius: '.8rem', background: '#f8fafc' }}
                />
              );
            }

            const count = countByDate.get(cell.iso) || 0;
            const isSelected = selectedDate === cell.iso;
            const isToday = cell.iso === new Date().toISOString().slice(0, 10);

            return (
              <button
                key={cell.iso}
                className="pmp-calendar-day"
                type="button"
                onClick={() => setSelectedDate(cell.iso)}
                style={{
                  minHeight: '115px',
                  border: isSelected ? '2px solid #2563eb' : '1px solid #dbe3f0',
                  borderRadius: '.8rem',
                  background: isSelected ? '#eff6ff' : '#fff',
                  padding: '.75rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isToday ? '0 0 0 1px rgba(37,99,235,.2)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem' }}>
                  <strong style={{ fontSize: '1rem', color: '#111827' }}>{cell.day}</strong>
                  {isToday && (
                    <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb' }}>Hoy</span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '.8rem', color: '#6b7280', marginBottom: '.35rem' }}>Pendientes</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '34px', padding: '.25rem .55rem', borderRadius: '999px', background: count > 0 ? '#dbeafe' : '#f3f4f6', color: count > 0 ? '#1d4ed8' : '#6b7280', fontWeight: 700 }}>
                    {count}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.8rem' }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            {selectedDate ? `Mantenimientos pendientes para ${selectedDate}` : 'Selecciona un dia del calendario'}
          </h2>
          {selectedDate && canManageSchedule && (
            <button type="button" className="btn btn-primary" onClick={openManualOtModal}>
              Crear OT
            </button>
          )}
        </div>

        {!selectedDate ? (
          <p style={{ color: '#6b7280', marginBottom: 0 }}>
            Haz clic en un dia para ver el detalle de los mantenimientos pendientes.
          </p>
        ) : selectedItems.length === 0 ? (
          <p style={{ color: '#6b7280', marginBottom: 0 }}>
            No hay mantenimientos pendientes para esta fecha.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '.75rem' }}>
            {selectedItems.map((item) => {
              const statusMeta = STATUS_META[item.status_ot] || { bg: '#f3f4f6', color: '#374151' };
              const isInNoticeWindow = isItemInOtNoticeWindow(item);
              return (
                <div key={item.id} style={{ border: '1px solid #e5e7eb', borderRadius: '.8rem', padding: '.9rem 1rem', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                        {item.codigo} - {item.equipo}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '.9rem', marginTop: '.15rem' }}>
                        {item.tipo_mantto} | Responsable: {item.responsable} | Area: {item.area_trabajo}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', padding: '.2rem .55rem', borderRadius: '999px', background: '#fef3c7', color: '#b45309', fontWeight: 700, fontSize: '.78rem' }}>
                        {item.prioridad}
                      </span>
                      <span style={{ display: 'inline-flex', padding: '.2rem .55rem', borderRadius: '999px', background: statusMeta.bg, color: statusMeta.color, fontWeight: 700, fontSize: '.78rem' }}>
                        {item.status_ot}
                      </span>
                    </div>
                  </div>

                  <div style={{ color: '#374151', whiteSpace: 'pre-line', marginBottom: '.45rem' }}>
                    {item.actividad || 'Sin actividades registradas.'}
                  </div>

                  <div style={{ color: '#6b7280', fontSize: '.88rem' }}>
                    OT: {item.ot_numero || 'Sin generar'} | Fecha: {item.fecha}
                  </div>
                  {Number(item.dias_anticipacion_alerta) > 0 && (
                    <div style={{ color: isInNoticeWindow ? '#2563eb' : '#6b7280', fontSize: '.84rem', fontWeight: 700, marginTop: '.3rem' }}>
                      Aviso OT: {item.dias_anticipacion_alerta} dia(s) antes | Disponible desde {item.alerta_desde || item.fecha}
                    </div>
                  )}
                  {canManageSchedule && item.status_ot === 'Pendiente' && (
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!isInNoticeWindow}
                        onClick={() => {
                          setScheduleAction({ type: 'move', item });
                          setNewScheduleDate(item.fecha);
                          setScheduleReason('');
                        }}
                      >
                        Mover fecha
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!isInNoticeWindow}
                        onClick={() => persistScheduleChange({
                          item,
                          fecha: new Date().toISOString().slice(0, 10),
                          reason: `Adelanto de mantenimiento desde calendario. Fecha original: ${item.fecha}`,
                        })}
                      >
                        Adelantar a hoy
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showManualOtModal && (
        <ModalCrearOt
          initialAlert={{
            fecha_ejecutar: selectedDate,
            fecha_programada: selectedDate,
            status_ot: 'Pendiente',
            tipo_mantto: 'Correctivo',
            dias_anticipacion_alerta: 0,
          }}
          equipmentItems={equipos}
          packageItems={packages}
          title="Crear OT agendada"
          subtitle={`Fecha programada: ${selectedDate}. Define los dias de aviso para que aparezca en Gestion de OT cuando corresponda.`}
          submitLabel="Guardar OT agendada"
          showLeadDays
          lockDate
          onClose={() => setShowManualOtModal(false)}
          onSubmit={saveManualCalendarOt}
        />
      )}
      {scheduleAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: '1rem' }}>
          <div className="card" style={{ width: 'min(520px, 96vw)', marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start', marginBottom: '.9rem' }}>
              <div>
                <h3 className="card-title" style={{ marginBottom: '.2rem' }}>Mover mantenimiento</h3>
                <p style={{ margin: 0, color: '#64748b' }}>
                  {scheduleAction.item.codigo} - {scheduleAction.item.equipo}
                </p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setScheduleAction(null)}>Cerrar</button>
            </div>
            <div className="form-group">
              <label className="form-label">Nueva fecha *</label>
              <input type="date" className="form-input" value={newScheduleDate} onChange={(event) => setNewScheduleDate(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Motivo *</label>
              <textarea className="form-textarea" rows={4} value={scheduleReason} onChange={(event) => setScheduleReason(event.target.value)} placeholder="Ej: se adelanta por parada programada, disponibilidad de equipo, prioridad operativa..." />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.55rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setScheduleAction(null)}>Cancelar</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!newScheduleDate) {
                    window.alert('Selecciona la nueva fecha.');
                    return;
                  }
                  if (!scheduleReason.trim()) {
                    window.alert('Indica el motivo del cambio de fecha.');
                    return;
                  }
                  persistScheduleChange({ item: scheduleAction.item, fecha: newScheduleDate, reason: scheduleReason.trim() });
                }}
              >
                Guardar cambio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
