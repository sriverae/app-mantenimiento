import React, { useEffect, useMemo, useState } from 'react';

const PLANS_KEY = 'pmp_fechas_plans_v1';
const EQUIPOS_KEY = 'pmp_equipos_items_v1';
const OT_ALERTS_KEY = 'pmp_ot_alertas_v1';

const FREQ_TO_DAYS = {
  Semanal: 7,
  Mensual: 30,
  Bimestral: 60,
  Trimestral: 90,
  Semestral: 180,
  Anual: 365,
};

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const getMarkedDays = (plan, year, month) => {
  const intervalDays = FREQ_TO_DAYS[plan.frecuencia] ?? 30;
  const start = new Date(`${plan.fecha_inicio}T00:00:00`);
  if (Number.isNaN(start.getTime())) return new Set();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const marks = new Set();

  const cursor = new Date(start);
  while (cursor < monthStart) cursor.setDate(cursor.getDate() + intervalDays);
  while (cursor <= monthEnd) {
    if (cursor.getMonth() === month && cursor.getFullYear() === year) marks.add(cursor.getDate());
    cursor.setDate(cursor.getDate() + intervalDays);
  }
  return marks;
};

export default function PmpGestionOt() {
  const [alerts, setAlerts] = useState(() => readJson(OT_ALERTS_KEY, []));
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const plans = readJson(PLANS_KEY, []);
    const equipos = readJson(EQUIPOS_KEY, []);
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth();
    const year = today.getFullYear();
    const todayStr = today.toISOString().split('T')[0];

    const existing = readJson(OT_ALERTS_KEY, []);
    const mapExisting = new Map(existing.map((a) => [a.id, a]));

    const dueToday = plans
      .filter((plan) => getMarkedDays(plan, year, month).has(day))
      .map((plan, idx) => {
        const eq = equipos.find((e) => (e.codigo || '') === (plan.codigo || ''));
        const id = `${todayStr}_${plan.id}`;
        const old = mapExisting.get(id);
        return {
          id,
          fecha_ejecutar: todayStr,
          codigo: plan.codigo || '',
          descripcion: plan.equipo || '',
          area_trabajo: eq?.area_trabajo || 'N.A.',
          prioridad: plan.prioridad || 'Media',
          actividad: plan.actividades || '',
          responsable: plan.responsable || 'N.A.',
          status_ot: old?.status_ot || 'Pendiente',
          ot_numero: old?.ot_numero || '',
          fecha_ejecucion: old?.fecha_ejecucion || '',
          tipo_mantto: 'Preventivo',
          personal_mantenimiento: old?.personal_mantenimiento || '',
          materiales: old?.materiales || '',
          orden: idx + 1,
        };
      });

    setAlerts(dueToday);
  }, []);

  useEffect(() => {
    localStorage.setItem(OT_ALERTS_KEY, JSON.stringify(alerts));
  }, [alerts]);

  const selected = useMemo(() => alerts.find((a) => a.id === selectedId) || null, [alerts, selectedId]);

  const createOt = () => {
    if (!selected) return;
    const nextNumber = `OT-${String(Date.now()).slice(-6)}`;
    setAlerts((prev) => prev.map((a) => (a.id === selected.id ? { ...a, ot_numero: a.ot_numero || nextNumber, status_ot: a.status_ot === 'Pendiente' ? 'Creada' : a.status_ot } : a)));
  };

  const releaseOt = () => {
    if (!selected) return;
    setAlerts((prev) => prev.map((a) => (a.id === selected.id ? { ...a, status_ot: 'Liberada' } : a)));
  };

  const closeOt = () => {
    if (!selected) return;
    const todayStr = new Date().toISOString().split('T')[0];
    setAlerts((prev) => prev.map((a) => (a.id === selected.id ? { ...a, status_ot: 'Cerrada', fecha_ejecucion: a.fecha_ejecucion || todayStr } : a)));
  };

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Gestión de Órdenes de Trabajo</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Alertas del día según Cronograma Anual de Mantenimiento Preventivo.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={createOt} disabled={!selected}>Crear una OT</button>
          <button type="button" className="btn btn-secondary" onClick={releaseOt} disabled={!selected}>Liberar OT</button>
          <button type="button" className="btn btn-danger" onClick={closeOt} disabled={!selected}>Cerrar OT</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1700px' }}>
          <thead>
            <tr style={{ background: '#0b5c8c', color: '#fff' }}>
              {['Fecha a ejecutar', 'Código', 'Descripción', 'Área de trabajo', 'Prioridad', 'Actividad de mantenimiento', 'PST TBJO Responsable', 'Status de OT', '# OT', 'Fecha de ejecución', 'Tipo de mantto', 'Personal de mantenimiento', 'Materiales - repuestos - insumos'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', fontSize: '.8rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} onClick={() => setSelectedId(a.id)} style={{ background: selectedId === a.id ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.fecha_ejecutar}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.codigo}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.descripcion}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.area_trabajo}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.prioridad}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.actividad}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.responsable}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.status_ot}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.ot_numero}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.fecha_ejecucion}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.tipo_mantto}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.personal_mantenimiento}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.materiales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
