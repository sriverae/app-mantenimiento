import React, { useEffect, useMemo, useState } from 'react';

const INITIAL_PLANS = [
  { id: 1, codigo: 'IAISPL1', equipo: 'Pre Limpia Sabreca N 1', prioridad: 'Alta', frecuencia: 'Mensual', responsable: 'Mecánico', fecha_inicio: '2026-04-01', actividades: 'Inspección de fajas, limpieza y verificación de sensores.' },
  { id: 2, codigo: 'IAISPL2', equipo: 'Pre Limpia Superbrix N 2', prioridad: 'Media', frecuencia: 'Bimestral', responsable: 'Electricista', fecha_inicio: '2026-04-10', actividades: 'Ajuste de conexiones y revisión de consumo eléctrico.' },
];

const EMPTY_FORM = {
  codigo: '',
  equipo: '',
  prioridad: 'Media',
  frecuencia: 'Mensual',
  responsable: '',
  fecha_inicio: new Date().toISOString().split('T')[0],
  actividades: '',
};

const PLAN_STORAGE_KEY = 'pmp_fechas_plans_v1';
const EQUIPOS_STORAGE_KEY = 'pmp_equipos_items_v1';

function getStoredPlans() {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return INITIAL_PLANS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_PLANS;
  } catch {
    return INITIAL_PLANS;
  }
}

function getStoredEquipos() {
  try {
    const raw = localStorage.getItem(EQUIPOS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const FREQ_TO_DAYS = {
  Semanal: 7,
  Mensual: 30,
  Bimestral: 60,
  Trimestral: 90,
  Semestral: 180,
  Anual: 365,
};

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function getMarkedDays(plan, year, month) {
  const intervalDays = FREQ_TO_DAYS[plan.frecuencia] ?? 30;
  const start = new Date(`${plan.fecha_inicio}T00:00:00`);
  if (Number.isNaN(start.getTime())) return new Set();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const marks = new Set();

  const cursor = new Date(start);
  while (cursor < monthStart) {
    cursor.setDate(cursor.getDate() + intervalDays);
  }
  while (cursor <= monthEnd) {
    if (cursor.getMonth() === month && cursor.getFullYear() === year) {
      marks.add(cursor.getDate());
    }
    cursor.setDate(cursor.getDate() + intervalDays);
  }
  return marks;
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '760px', background: '#fff', borderRadius: '.9rem', boxShadow: '0 24px 64px rgba(0,0,0,.26)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '1.7rem', lineHeight: 1, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>
        <div style={{ padding: '1.25rem' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function PmpFechas() {
  const [plans, setPlans] = useState(() => getStoredPlans());
  const [selectedId, setSelectedId] = useState(INITIAL_PLANS[0]?.id ?? null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [equipos] = useState(() => getStoredEquipos());
  const [equipmentAreaFilter, setEquipmentAreaFilter] = useState('');
  const [equipmentCodeFilter, setEquipmentCodeFilter] = useState('');
  const [equipmentTextFilter, setEquipmentTextFilter] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  useEffect(() => {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plans));
  }, [plans]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedId) || null,
    [plans, selectedId],
  );

  const uniqueAreas = useMemo(
    () => Array.from(new Set(equipos.map((e) => e.area_trabajo).filter(Boolean))).sort(),
    [equipos],
  );

  const filteredEquipos = useMemo(() => equipos.filter((eq) => {
    const areaOk = !equipmentAreaFilter || eq.area_trabajo === equipmentAreaFilter;
    const codeOk = !equipmentCodeFilter || (eq.codigo || '').toLowerCase().includes(equipmentCodeFilter.toLowerCase());
    const textOk = !equipmentTextFilter || `${eq.codigo} ${eq.descripcion}`.toLowerCase().includes(equipmentTextFilter.toLowerCase());
    return areaOk && codeOk && textOk;
  }), [equipos, equipmentAreaFilter, equipmentCodeFilter, equipmentTextFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, fecha_inicio: new Date().toISOString().split('T')[0] });
    setEquipmentAreaFilter('');
    setEquipmentCodeFilter('');
    setEquipmentTextFilter('');
    setSelectedEquipmentIds([]);
    setShowModal(true);
  };

  const openEdit = () => {
    if (!selectedPlan) return;
    setEditingId(selectedPlan.id);
    setForm({ ...selectedPlan });
    const matchEquipo = equipos.find((eq) => eq.codigo === selectedPlan.codigo);
    setSelectedEquipmentIds(matchEquipo ? [String(matchEquipo.id)] : []);
    setEquipmentAreaFilter('');
    setEquipmentCodeFilter('');
    setEquipmentTextFilter('');
    setShowModal(true);
  };

  const onDelete = () => {
    if (!selectedPlan) return;
    if (!window.confirm(`¿Eliminar el plan ${selectedPlan.codigo}?`)) return;
    const filtered = plans.filter((p) => p.id !== selectedPlan.id);
    setPlans(filtered);
    setSelectedId(filtered[0]?.id ?? null);
  };

  const onSave = (e) => {
    e.preventDefault();
    if (editingId) {
      const selectedEq = equipos.find((eq) => String(eq.id) === selectedEquipmentIds[0]);
      const payload = selectedEq
        ? { ...form, codigo: selectedEq.codigo || '', equipo: selectedEq.descripcion || '', id: editingId }
        : { ...form, id: editingId };
      setPlans((prev) => prev.map((p) => (p.id === editingId ? payload : p)));
      setSelectedId(editingId);
    } else {
      const selectedEquipos = equipos.filter((eq) => selectedEquipmentIds.includes(String(eq.id)));
      if (selectedEquipos.length === 0) return;
      const nextId = plans.length ? Math.max(...plans.map((p) => p.id)) + 1 : 1;
      const newPlans = selectedEquipos.map((eq, index) => ({
        ...form,
        id: nextId + index,
        codigo: eq.codigo || '',
        equipo: eq.descripcion || '',
      }));
      setPlans((prev) => [...newPlans, ...prev]);
      setSelectedId(nextId);
    }
    setShowModal(false);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Plan de mantenimiento preventivo</h1>
        <p style={{ color: '#6b7280' }}>Cronograma anual por fechas para equipos de planta.</p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="button" onClick={openCreate}>Agregar</button>
          <button className="btn btn-secondary" type="button" onClick={openEdit} disabled={!selectedPlan}>Editar</button>
          <button className="btn btn-danger" type="button" onClick={onDelete} disabled={!selectedPlan}>Eliminar</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Cronograma anual de mantenimiento preventivo</h2>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
            <select className="form-select" style={{ minWidth: '145px' }} value={calendarMonth} onChange={(e) => setCalendarMonth(Number(e.target.value))}>
              {MONTHS.map((monthName, index) => (
                <option key={monthName} value={index}>{monthName}</option>
              ))}
            </select>
            <input type="number" className="form-input" style={{ width: '95px' }} min={2000} max={2100} value={calendarYear} onChange={(e) => setCalendarYear(Number(e.target.value) || new Date().getFullYear())} />
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1620px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Código', 'Equipo', 'Prioridad', 'Frecuencia', 'Responsable', 'Fecha inicio', 'Actividades'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '.7rem .65rem', border: '1px solid #2f4f75', fontSize: '.85rem' }}>{h}</th>
              ))}
              <th colSpan={31} style={{ textAlign: 'center', padding: '.7rem .5rem', border: '1px solid #2f4f75', fontSize: '.85rem', background: '#21486e' }}>
                Cronograma ({MONTHS[calendarMonth]} {calendarYear})
              </th>
            </tr>
            <tr style={{ background: '#244a71', color: '#fff' }}>
              <th colSpan={7} style={{ border: '1px solid #2f4f75', padding: '.35rem' }} />
              {Array.from({ length: 31 }, (_, i) => (
                <th key={`day-header-${i + 1}`} style={{ width: '28px', textAlign: 'center', border: '1px solid #2f4f75', fontSize: '.72rem', padding: '.35rem 0' }}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const selected = plan.id === selectedId;
              const marks = getMarkedDays(plan, calendarYear, calendarMonth);
              return (
                <tr key={plan.id} onClick={() => setSelectedId(plan.id)} style={{ background: selected ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb', fontWeight: 700 }}>{plan.codigo}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.equipo}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.prioridad}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.frecuencia}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.responsable}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.fecha_inicio}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.actividades}</td>
                  {Array.from({ length: 31 }, (_, i) => {
                    const day = i + 1;
                    const inMonth = day <= new Date(calendarYear, calendarMonth + 1, 0).getDate();
                    return (
                      <td key={`${plan.id}-day-${day}`} style={{ width: '28px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: 700, color: '#dc2626', background: inMonth ? 'transparent' : '#f9fafb' }}>
                        {inMonth && marks.has(day) ? 'X' : ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editingId ? 'Editar plan de mantenimiento' : 'Agregar plan de mantenimiento'}>
          <form onSubmit={onSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.8rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Código *</label>
                <input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Responsable *</label>
                <input className="form-input" value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Prioridad</label>
                <select className="form-select" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
                  <option>Alta</option>
                  <option>Media</option>
                  <option>Baja</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Frecuencia</label>
                <select className="form-select" value={form.frecuencia} onChange={(e) => setForm({ ...form, frecuencia: e.target.value })}>
                  <option>Semanal</option>
                  <option>Mensual</option>
                  <option>Bimestral</option>
                  <option>Trimestral</option>
                  <option>Semestral</option>
                  <option>Anual</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha inicio *</label>
                <input type="date" className="form-input" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Buscar equipo desde Control de equipos</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '.55rem' }}>
                  <select className="form-select" value={equipmentAreaFilter} onChange={(e) => setEquipmentAreaFilter(e.target.value)}>
                    <option value="">Área (todas)</option>
                    {uniqueAreas.map((area) => <option key={area} value={area}>{area}</option>)}
                  </select>
                  <input className="form-input" placeholder="Filtro por código" value={equipmentCodeFilter} onChange={(e) => setEquipmentCodeFilter(e.target.value)} />
                  <input className="form-input" placeholder="Buscar por nombre/código..." value={equipmentTextFilter} onChange={(e) => setEquipmentTextFilter(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Equipo *</label>
                <select
                  className="form-select"
                  multiple
                  size={Math.min(8, Math.max(4, filteredEquipos.length || 4))}
                  required
                  value={selectedEquipmentIds}
                  onChange={(e) => {
                    const selectedOptions = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                    setSelectedEquipmentIds(selectedOptions);
                    if (selectedOptions.length > 0) {
                      const eq = equipos.find((item) => String(item.id) === selectedOptions[0]);
                      if (eq) {
                        setForm((prev) => ({ ...prev, codigo: eq.codigo || '', equipo: eq.descripcion || '' }));
                      }
                    }
                  }}
                >
                  {filteredEquipos.map((eq) => (
                    <option key={eq.id} value={String(eq.id)}>
                      {eq.codigo} | {eq.descripcion} {eq.area_trabajo ? `(${eq.area_trabajo})` : ''}
                    </option>
                  ))}
                </select>
                <p style={{ color: '#6b7280', fontSize: '.8rem', marginTop: '.35rem' }}>
                  Selección múltiple habilitada: puedes crear el mismo plan para varios equipos en una sola operación.
                </p>
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Actividades a realizar *</label>
                <textarea className="form-textarea" value={form.actividades} onChange={(e) => setForm({ ...form, actividades: e.target.value })} required />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem', marginTop: '1.2rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Guardar plan'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
