import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';

const INITIAL_PLANS_KM = [
  {
    id: 1,
    codigo: 'CAM-001',
    equipo: 'Camion Tolva 01',
    prioridad: 'Alta',
    responsable: 'Mecanico',
    km_actual: 11850,
    km_ultimo_mantenimiento: 10000,
    intervalo_km: 5000,
    alerta_km: 500,
    proximo_km: 15000,
    actividades: 'Cambio de aceite\nRevision de filtros\nInspeccion general de frenos',
    paquete_id: '',
  },
];

const EMPTY_FORM = {
  codigo: '',
  equipo: '',
  prioridad: 'Media',
  responsable: '',
  km_actual: '',
  km_ultimo_mantenimiento: '',
  intervalo_km: '',
  alerta_km: '500',
  proximo_km: '',
  actividades: '',
  paquete_id: '',
};

const KM_STORAGE_KEY = SHARED_DOCUMENT_KEYS.maintenancePlansKm;
const EQUIPOS_STORAGE_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const PACKAGES_STORAGE_KEY = SHARED_DOCUMENT_KEYS.maintenancePackages;
const PACKAGES_FALLBACK = [
  {
    id: 1,
    codigo: 'PK-KM-001',
    vc: 'V.C - KM',
    nombre: 'SERVICIO_CADA_5000_KM',
    tiempo_min: 120,
    actividades: ['Cambio de aceite', 'Revision de filtros', 'Inspeccion visual general'],
  },
];

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '860px', background: '#fff', borderRadius: '.9rem', boxShadow: '0 24px 64px rgba(0,0,0,.26)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '1.7rem', lineHeight: 1, cursor: 'pointer', color: '#6b7280' }}>x</button>
        </div>
        <div style={{ padding: '1.25rem' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function normalizeEquiposList(items) {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((eq, index) => ({
      id: eq.id ?? `eq_${index}_${eq.codigo || 'sin_codigo'}`,
      codigo: eq.codigo || '',
      descripcion: eq.descripcion || eq.equipo || '',
      area_trabajo: eq.area_trabajo || '',
      ...eq,
    }));
}

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildPlanPayload = (form, selectedEquipo) => {
  const kmActual = toNumber(form.km_actual);
  const kmUltimo = toNumber(form.km_ultimo_mantenimiento);
  const intervalo = toNumber(form.intervalo_km);
  const alerta = toNumber(form.alerta_km);
  const proximo = intervalo > 0 ? kmUltimo + intervalo : toNumber(form.proximo_km);

  return {
    ...form,
    codigo: selectedEquipo?.codigo || form.codigo,
    equipo: selectedEquipo?.descripcion || form.equipo,
    km_actual: kmActual,
    km_ultimo_mantenimiento: kmUltimo,
    intervalo_km: intervalo,
    alerta_km: alerta,
    proximo_km: proximo,
  };
};

const getKmStatus = (plan) => {
  const actual = toNumber(plan.km_actual);
  const proximo = toNumber(plan.proximo_km);
  const alerta = toNumber(plan.alerta_km);
  if (!proximo) return { label: 'Sin objetivo', color: '#6b7280', bg: '#f3f4f6' };
  if (actual >= proximo) return { label: 'Vencido', color: '#dc2626', bg: '#fef2f2' };
  if ((proximo - actual) <= alerta) return { label: 'Proximo', color: '#c2410c', bg: '#fff7ed' };
  return { label: 'En control', color: '#059669', bg: '#ecfdf5' };
};

export default function PmpKm() {
  const [plans, setPlans] = useState(INITIAL_PLANS_KM);
  const [selectedId, setSelectedId] = useState(INITIAL_PLANS_KM[0]?.id ?? null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [equipos, setEquipos] = useState([]);
  const [packages, setPackages] = useState(PACKAGES_FALLBACK);
  const [manualActivityInput, setManualActivityInput] = useState('');
  const [manualActivities, setManualActivities] = useState([]);
  const [query, setQuery] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [loadedPlans, loadedEquipos, loadedPackages] = await Promise.all([
        loadSharedDocument(KM_STORAGE_KEY, INITIAL_PLANS_KM),
        loadSharedDocument(EQUIPOS_STORAGE_KEY, []),
        loadSharedDocument(PACKAGES_STORAGE_KEY, PACKAGES_FALLBACK),
      ]);
      if (!active) return;
      const nextPlans = Array.isArray(loadedPlans) && loadedPlans.length ? loadedPlans : INITIAL_PLANS_KM;
      setPlans(nextPlans);
      setSelectedId(nextPlans[0]?.id ?? null);
      setEquipos(normalizeEquiposList(loadedEquipos));
      setPackages(Array.isArray(loadedPackages) && loadedPackages.length ? loadedPackages : PACKAGES_FALLBACK);
      setHydrated(true);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSharedDocument(KM_STORAGE_KEY, plans)
      .then(() => setError(''))
      .catch((err) => {
        console.error('Error guardando planes por kilometraje:', err);
        setError('No se pudieron guardar los planes por kilometraje en el servidor.');
      });
  }, [plans, hydrated]);

  const selectedPlan = useMemo(() => plans.find((item) => item.id === selectedId) || null, [plans, selectedId]);
  const filteredPlans = useMemo(() => plans.filter((item) => (`${item.codigo} ${item.equipo} ${item.responsable}`).toLowerCase().includes(query.toLowerCase())), [plans, query]);
  const filteredEquipos = useMemo(() => normalizeEquiposList(equipos).filter((eq) => (`${eq.codigo} ${eq.descripcion} ${eq.area_trabajo}`).toLowerCase().includes(equipmentFilter.toLowerCase())), [equipos, equipmentFilter]);
  const kmDue = useMemo(() => plans.filter((plan) => toNumber(plan.km_actual) >= toNumber(plan.proximo_km)).length, [plans]);
  const kmUpcoming = useMemo(() => plans.filter((plan) => {
    const actual = toNumber(plan.km_actual);
    const proximo = toNumber(plan.proximo_km);
    return actual < proximo && (proximo - actual) <= toNumber(plan.alerta_km);
  }).length, [plans]);

  const openCreate = async () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setManualActivities([]);
    setManualActivityInput('');
    setEquipmentFilter('');
    setSelectedEquipmentId('');
    setEquipos(normalizeEquiposList(await loadSharedDocument(EQUIPOS_STORAGE_KEY, [])));
    setPackages(await loadSharedDocument(PACKAGES_STORAGE_KEY, PACKAGES_FALLBACK));
    setShowModal(true);
  };

  const openEdit = async () => {
    if (!selectedPlan) return;
    const freshEquipos = normalizeEquiposList(await loadSharedDocument(EQUIPOS_STORAGE_KEY, []));
    setEquipos(freshEquipos);
    setPackages(await loadSharedDocument(PACKAGES_STORAGE_KEY, PACKAGES_FALLBACK));
    setEditingId(selectedPlan.id);
    setForm({ ...selectedPlan });
    setManualActivities((selectedPlan.actividades || '').split('\n').map((item) => item.trim()).filter(Boolean));
    const matchEquipo = freshEquipos.find((eq) => (eq.codigo || '') === (selectedPlan.codigo || ''));
    setSelectedEquipmentId(matchEquipo ? String(matchEquipo.id) : '');
    setEquipmentFilter('');
    setManualActivityInput('');
    setShowModal(true);
  };

  const deletePlan = () => {
    if (!selectedPlan) return;
    if (!window.confirm(`Eliminar plan por km ${selectedPlan.codigo}?`)) return;
    const next = plans.filter((item) => item.id !== selectedPlan.id);
    setPlans(next);
    setSelectedId(next[0]?.id ?? null);
  };

  const addManualActivity = () => {
    const value = manualActivityInput.trim();
    if (!value) return;
    setManualActivities((prev) => [...prev, value]);
    setManualActivityInput('');
  };

  const removeManualActivity = (index) => {
    setManualActivities((prev) => prev.filter((_, idx) => idx !== index));
  };

  const applyPackage = (packageId) => {
    const selectedPackage = packages.find((item) => String(item.id) === String(packageId));
    if (!selectedPackage) return;
    setForm((prev) => ({ ...prev, paquete_id: String(selectedPackage.id) }));
    setManualActivities(selectedPackage.actividades || []);
  };

  const savePlan = (e) => {
    e.preventDefault();
    if (!selectedEquipmentId) {
      window.alert('Debes seleccionar un equipo.');
      return;
    }
    if (!manualActivities.length) {
      window.alert('Agrega al menos una actividad.');
      return;
    }

    const selectedEquipo = equipos.find((item) => String(item.id) === String(selectedEquipmentId));
    const payload = buildPlanPayload({ ...form, actividades: manualActivities.join('\n') }, selectedEquipo);
    if (!payload.intervalo_km || payload.intervalo_km <= 0) {
      window.alert('El intervalo por km debe ser mayor a cero.');
      return;
    }

    if (editingId) {
      setPlans((prev) => prev.map((item) => (item.id === editingId ? { ...payload, id: editingId } : item)));
      setSelectedId(editingId);
    } else {
      const nextId = plans.length ? Math.max(...plans.map((item) => item.id)) + 1 : 1;
      setPlans((prev) => [{ ...payload, id: nextId }, ...prev]);
      setSelectedId(nextId);
    }
    setShowModal(false);
  };

  const updateCurrentKm = () => {
    if (!selectedPlan) return;
    const nextValue = window.prompt(`Registrar kilometraje actual para ${selectedPlan.codigo}`, String(selectedPlan.km_actual || 0));
    if (nextValue === null) return;
    const kmActual = toNumber(nextValue);
    setPlans((prev) => prev.map((item) => (item.id === selectedPlan.id ? { ...item, km_actual: kmActual } : item)));
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
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Plan de mantenimiento preventivo - Km</h1>
        <p style={{ color: '#6b7280' }}>Control de mantenimientos preventivos por kilometraje acumulado del equipo movil.</p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">Planes por km</div>
          <div className="stat-value">{plans.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vencidos</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{kmDue}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Proximos</div>
          <div className="stat-value" style={{ color: '#c2410c' }}>{kmUpcoming}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ maxWidth: '380px' }}
            placeholder="Buscar por codigo, equipo o responsable"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-primary" type="button" onClick={openCreate}>Agregar</button>
          <button className="btn btn-secondary" type="button" onClick={openEdit} disabled={!selectedPlan}>Editar</button>
          <button className="btn btn-secondary" type="button" onClick={updateCurrentKm} disabled={!selectedPlan}>Actualizar km</button>
          <button className="btn btn-danger" type="button" onClick={deletePlan} disabled={!selectedPlan}>Eliminar</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1480px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Codigo', 'Equipo', 'Prioridad', 'Responsable', 'Km actual', 'Km ultimo mantto', 'Intervalo km', 'Alerta km', 'Proximo mantto', 'Km restantes', 'Estado', 'Actividades'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '.7rem .65rem', border: '1px solid #2f4f75', fontSize: '.85rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredPlans.map((plan) => {
              const selected = plan.id === selectedId;
              const status = getKmStatus(plan);
              const remaining = Math.max(toNumber(plan.proximo_km) - toNumber(plan.km_actual), 0);
              return (
                <tr key={plan.id} onClick={() => setSelectedId(plan.id)} style={{ background: selected ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb', fontWeight: 700 }}>{plan.codigo}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.equipo}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.prioridad}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.responsable}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{toNumber(plan.km_actual).toLocaleString('es-PE')}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{toNumber(plan.km_ultimo_mantenimiento).toLocaleString('es-PE')}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{toNumber(plan.intervalo_km).toLocaleString('es-PE')}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{toNumber(plan.alerta_km).toLocaleString('es-PE')}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{toNumber(plan.proximo_km).toLocaleString('es-PE')}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb', color: remaining === 0 ? '#dc2626' : '#111827', fontWeight: remaining === 0 ? 700 : 400 }}>{remaining.toLocaleString('es-PE')}</td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>
                    <span style={{ display: 'inline-flex', padding: '.2rem .55rem', borderRadius: '999px', background: status.bg, color: status.color, fontWeight: 700, fontSize: '.8rem' }}>
                      {status.label}
                    </span>
                  </td>
                  <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb', whiteSpace: 'pre-line' }}>{plan.actividades}</td>
                </tr>
              );
            })}
            {!filteredPlans.length && (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                  No hay planes por kilometraje registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editingId ? 'Editar plan por kilometraje' : 'Agregar plan por kilometraje'} onClose={() => setShowModal(false)}>
          <form onSubmit={savePlan}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.8rem' }}>
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
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Buscar equipo desde Control de equipos</label>
                <input className="form-input" placeholder="Buscar por codigo, nombre o area" value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Equipo *</label>
                <select className="form-select" value={selectedEquipmentId} onChange={(e) => setSelectedEquipmentId(e.target.value)} required>
                  <option value="">Selecciona equipo...</option>
                  {filteredEquipos.map((eq) => (
                    <option key={eq.id} value={String(eq.id)}>
                      {eq.codigo} | {eq.descripcion} {eq.area_trabajo ? `(${eq.area_trabajo})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Km actual *</label>
                <input type="number" className="form-input" value={form.km_actual} onChange={(e) => setForm({ ...form, km_actual: e.target.value })} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Km ultimo mantenimiento *</label>
                <input type="number" className="form-input" value={form.km_ultimo_mantenimiento} onChange={(e) => setForm({ ...form, km_ultimo_mantenimiento: e.target.value })} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Intervalo km *</label>
                <input type="number" className="form-input" value={form.intervalo_km} onChange={(e) => setForm({ ...form, intervalo_km: e.target.value })} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Alerta anticipada km</label>
                <input type="number" className="form-input" value={form.alerta_km} onChange={(e) => setForm({ ...form, alerta_km: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Paquete de mantenimiento (opcional)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.55rem' }}>
                  <select className="form-select" value={form.paquete_id || ''} onChange={(e) => setForm({ ...form, paquete_id: e.target.value })}>
                    <option value="">-- Seleccionar paquete --</option>
                    {packages.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.codigo} | {item.nombre} ({item.vc})
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-secondary" onClick={() => applyPackage(form.paquete_id)} disabled={!form.paquete_id}>
                    Aplicar paquete
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Actividades *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.55rem' }}>
                  <input
                    className="form-input"
                    placeholder="Escribe una actividad y agregala"
                    value={manualActivityInput}
                    onChange={(e) => setManualActivityInput(e.target.value)}
                  />
                  <button type="button" className="btn btn-primary" onClick={addManualActivity}>Agregar actividad</button>
                </div>
                <div className="card" style={{ marginTop: '.6rem', marginBottom: 0, padding: '.6rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', width: '80px' }}>Item</th>
                        <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'left' }}>Actividad</th>
                        <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', width: '100px' }}>Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualActivities.map((activity, idx) => (
                        <tr key={`${activity}-${idx}`}>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{activity}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeManualActivity(idx)}>Quitar</button>
                          </td>
                        </tr>
                      ))}
                      {!manualActivities.length && (
                        <tr>
                          <td colSpan={3} style={{ border: '1px solid #e5e7eb', padding: '.6rem', textAlign: 'center', color: '#6b7280' }}>
                            Sin actividades agregadas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
