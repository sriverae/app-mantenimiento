import React, { useMemo, useState } from 'react';

const PACKAGES_KEY = 'pmp_paquetes_mantenimiento_v1';

const INITIAL_PACKAGES = [
  {
    id: 1,
    codigo: 'PK-001',
    vc: 'V.C - DÍA',
    nombre: 'SECADO_ELEVADOR',
    tiempo_min: 60,
    actividades: ['Inspección visual general', 'Limpieza de componentes', 'Verificación de ajuste de pernos'],
  },
];

const readPackages = () => {
  try {
    const raw = localStorage.getItem(PACKAGES_KEY);
    const parsed = raw ? JSON.parse(raw) : INITIAL_PACKAGES;
    return Array.isArray(parsed) ? parsed : INITIAL_PACKAGES;
  } catch {
    return INITIAL_PACKAGES;
  }
};

const EMPTY_FORM = {
  codigo: '',
  vc: 'V.C - DÍA',
  nombre: '',
  tiempo_min: '',
};

export default function PmpPaquetesMantenimiento() {
  const [items, setItems] = useState(() => readPackages());
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [activityInput, setActivityInput] = useState('');
  const [activities, setActivities] = useState([]);
  const [filterVc, setFilterVc] = useState('TODOS');

  const persist = (next) => {
    setItems(next);
    localStorage.setItem(PACKAGES_KEY, JSON.stringify(next));
  };

  const filtered = useMemo(() => {
    if (filterVc === 'TODOS') return items;
    return items.filter((item) => item.vc === filterVc);
  }, [items, filterVc]);

  const selected = items.find((item) => item.id === selectedId) || null;

  const handleNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setActivities([]);
    setActivityInput('');
  };

  const handleEdit = () => {
    if (!selected) return;
    setEditingId(selected.id);
    setForm({
      codigo: selected.codigo,
      vc: selected.vc,
      nombre: selected.nombre,
      tiempo_min: selected.tiempo_min,
    });
    setActivities(selected.actividades || []);
    setActivityInput('');
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!window.confirm(`¿Eliminar paquete ${selected.nombre}?`)) return;
    const next = items.filter((item) => item.id !== selected.id);
    persist(next);
    setSelectedId(next[0]?.id ?? null);
    handleNew();
  };

  const addActivity = () => {
    const text = activityInput.trim();
    if (!text) return;
    setActivities((prev) => [...prev, text]);
    setActivityInput('');
  };

  const removeActivity = (index) => {
    setActivities((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = () => {
    if (!form.codigo || !form.nombre || !activities.length) {
      window.alert('Completa código, nombre y agrega al menos una actividad.');
      return;
    }

    const payload = {
      codigo: form.codigo.trim().toUpperCase(),
      vc: form.vc,
      nombre: form.nombre.trim(),
      tiempo_min: Number(form.tiempo_min) || 0,
      actividades,
    };

    if (editingId) {
      const next = items.map((item) => (item.id === editingId ? { ...item, ...payload } : item));
      persist(next);
      setSelectedId(editingId);
    } else {
      const nextId = items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
      const next = [{ id: nextId, ...payload }, ...items];
      persist(next);
      setSelectedId(nextId);
    }

    handleNew();
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Control de paquetes de mantenimiento</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Crea, modifica o elimina paquetes PM (conjunto de actividades).</p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}><input type="radio" name="vc" checked={filterVc === 'TODOS'} onChange={() => setFilterVc('TODOS')} />TODOS</label>
          <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}><input type="radio" name="vc" checked={filterVc === 'V.C - DÍA'} onChange={() => setFilterVc('V.C - DÍA')} />V.C - DÍA</label>
          <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}><input type="radio" name="vc" checked={filterVc === 'V.C - HRA'} onChange={() => setFilterVc('V.C - HRA')} />V.C - HRA</label>
          <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}><input type="radio" name="vc" checked={filterVc === 'V.C - KM'} onChange={() => setFilterVc('V.C - KM')} />V.C - KM</label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1rem' }}>
        <div className="card" style={{ overflowX: 'auto' }}>
          <h3 className="card-title">Paquetes PM</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                {['Código', 'V.C', 'Nombre del paquete PM', 'Tiempo (min.)', 'Actividades'].map((h) => <th key={h} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} onClick={() => setSelectedId(item.id)} style={{ cursor: 'pointer', background: selectedId === item.id ? '#eff6ff' : '#fff' }}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.vc}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.nombre}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.tiempo_min}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.actividades?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 className="card-title">Resultados</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '.7rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Código *</label><input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">V.C</label><select className="form-select" value={form.vc} onChange={(e) => setForm({ ...form, vc: e.target.value })}><option>V.C - DÍA</option><option>V.C - HRA</option><option>V.C - KM</option></select></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Nombre *</label><input className="form-input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Tiempo (min.)</label><input type="number" className="form-input" value={form.tiempo_min} onChange={(e) => setForm({ ...form, tiempo_min: e.target.value })} /></div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label className="form-label">Actividad</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.6rem' }}>
              <input className="form-input" value={activityInput} onChange={(e) => setActivityInput(e.target.value)} placeholder="Escribe una actividad" />
              <button type="button" className="btn btn-primary" onClick={addActivity}>Agregar</button>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem', marginBottom: 0, padding: '.8rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', width: '90px' }}>Ítem</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'left' }}>Descripción de las actividades</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', width: '90px' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity, idx) => (
                  <tr key={`${activity}-${idx}`}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{activity}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removeActivity(idx)}>Quitar</button></td>
                  </tr>
                ))}
                {!activities.length && <tr><td colSpan={3} style={{ border: '1px solid #e5e7eb', padding: '.6rem', textAlign: 'center', color: '#6b7280' }}>Sin actividades agregadas.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={handleNew}>Nuevo</button>
            <button type="button" className="btn btn-secondary" onClick={handleEdit} disabled={!selected}>Editar</button>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={!selected}>Eliminar</button>
            <button type="button" className="btn btn-success" onClick={handleSave}>{editingId ? 'Actualizar' : 'Registrar'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
