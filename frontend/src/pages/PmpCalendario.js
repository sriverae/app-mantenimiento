import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';

const PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlans;
const KM_PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlansKm;
const EQUIPOS_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const WEEKDAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

const FREQ_TO_DAYS = {
  Semanal: 7,
  Mensual: 30,
  Bimestral: 60,
  Trimestral: 90,
  Semestral: 180,
  Anual: 365,
};

const STATUS_META = {
  Pendiente: { bg: '#fff7ed', color: '#c2410c' },
  Creada: { bg: '#eff6ff', color: '#2563eb' },
  Liberada: { bg: '#ecfdf5', color: '#059669' },
  'Solicitud de cierre': { bg: '#fef2f2', color: '#dc2626' },
};

const PRIORITY_ORDER = { Alta: 0, Media: 1, Baja: 2 };

const getDueDatesInWindow = (plan, windowStart, windowEnd) => {
  const intervalDays = FREQ_TO_DAYS[plan.frecuencia] ?? 30;
  const start = new Date(`${plan.fecha_inicio}T00:00:00`);
  if (Number.isNaN(start.getTime())) return [];

  const from = new Date(windowStart);
  const to = new Date(windowEnd);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const cursor = new Date(start);
  while (cursor < from) cursor.setDate(cursor.getDate() + intervalDays);

  const result = [];
  while (cursor <= to) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + intervalDays);
  }
  return result;
};

const isKmPlanInAlertWindow = (plan) => {
  const actual = Number(plan.km_actual) || 0;
  const target = Number(plan.proximo_km) || 0;
  const alertKm = Number(plan.alerta_km) || 0;
  return target > 0 && actual >= Math.max(target - alertKm, 0);
};

const buildKmAlertId = (plan) => `km_${plan.id}_${Number(plan.proximo_km) || 0}`;

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

export default function PmpCalendario() {
  const [plans, setPlans] = useState([]);
  const [plansKm, setPlansKm] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [loadedPlans, loadedPlansKm, loadedEquipos, loadedAlerts, loadedHistory] = await Promise.all([
        loadSharedDocument(PLANS_KEY, []),
        loadSharedDocument(KM_PLANS_KEY, []),
        loadSharedDocument(EQUIPOS_KEY, []),
        loadSharedDocument(OT_ALERTS_KEY, []),
        loadSharedDocument(OT_HISTORY_KEY, []),
      ]);
      if (!active) return;
      setPlans(Array.isArray(loadedPlans) ? loadedPlans : []);
      setPlansKm(Array.isArray(loadedPlansKm) ? loadedPlansKm : []);
      setEquipos(Array.isArray(loadedEquipos) ? loadedEquipos : []);
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
        return getDueDatesInWindow(plan, monthStart, monthEnd).map((fecha) => {
          const id = `${fecha}_${plan.id}`;
          if (closedIds.has(id)) return null;
          const existingAlert = mapExisting.get(String(id));
          return {
            id,
            fecha,
            codigo: plan.codigo || '',
            equipo: plan.equipo || eq?.descripcion || '',
            area_trabajo: eq?.area_trabajo || existingAlert?.area_trabajo || 'N.A.',
            prioridad: plan.prioridad || 'Media',
            responsable: plan.responsable || 'N.A.',
            actividad: plan.actividades || '',
            tipo_mantto: existingAlert?.tipo_mantto || 'Preventivo',
            status_ot: existingAlert?.status_ot || 'Pendiente',
            ot_numero: existingAlert?.ot_numero || '',
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
        };
      })
      .filter(Boolean);

    return [...dateItems, ...kmItems].sort(compareMaintenanceItems);
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: '.65rem' }}>
          {WEEKDAYS.map((label) => (
            <div key={label} style={{ padding: '.6rem .7rem', borderRadius: '.65rem', background: '#1f3b5b', color: '#fff', fontWeight: 700, textAlign: 'center' }}>
              {label}
            </div>
          ))}

          {calendarCells.map((cell, index) => {
            if (!cell) {
              return (
                <div
                  key={`blank-${index}`}
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
        <h2 className="card-title" style={{ marginBottom: '.8rem' }}>
          {selectedDate ? `Mantenimientos pendientes para ${selectedDate}` : 'Selecciona un dia del calendario'}
        </h2>

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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
