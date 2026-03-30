import React, { useMemo, useState } from 'react';

const STORAGE_KEY = 'pmp_rrhh_tecnicos_v1';

const INITIAL_DATA = [
  { id: 1, codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', cargo: 'Técnico', especialidad: 'Mecánico', identificacion: 'N.A.', edad: 'N.A.', domicilio: 'Primero', capacidad_hh_dia: '12.00', costo_hora: '6.94', email: 'N.A.' },
  { id: 2, codigo: 'ELE-1', nombres_apellidos: 'Hernan Alauce Alarcón', cargo: 'Encargado', especialidad: 'Eléctrico', identificacion: 'N.A.', edad: 'N.A.', domicilio: 'Primero', capacidad_hh_dia: '12.00', costo_hora: '6.11', email: 'N.A.' },
];

const EMPTY_FORM = {
  codigo: '',
  nombres_apellidos: '',
  cargo: 'Técnico',
  especialidad: 'Mecánico',
  identificacion: '',
  edad: '',
  domicilio: '',
  capacidad_hh_dia: '',
  costo_hora: '',
  email: '',
};

const readData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : INITIAL_DATA;
    return Array.isArray(parsed) ? parsed : INITIAL_DATA;
  } catch {
    return INITIAL_DATA;
  }
};

export default function RrhhManagement() {
  const [items, setItems] = useState(() => readData());
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const persist = (next) => {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const filtered = useMemo(
    () => items.filter((it) => `${it.codigo} ${it.nombres_apellidos} ${it.especialidad}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  const selectedItem = items.find((item) => item.id === selectedId) || null;

  const handleNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleEdit = () => {
    if (!selectedItem) return;
    setEditingId(selectedItem.id);
    setForm({ ...selectedItem });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      codigo: form.codigo.trim(),
      nombres_apellidos: form.nombres_apellidos.trim(),
      cargo: form.cargo || 'Técnico',
      especialidad: form.especialidad.trim() || 'Mecánico',
      identificacion: form.identificacion.trim() || 'N.A.',
      edad: form.edad.trim() || 'N.A.',
      domicilio: form.domicilio.trim() || 'N.A.',
      capacidad_hh_dia: form.capacidad_hh_dia.trim() || '0.00',
      costo_hora: form.costo_hora.trim() || '0.00',
      email: form.email.trim() || 'N.A.',
    };

    if (!payload.codigo || !payload.nombres_apellidos) return;

    if (editingId) {
      persist(items.map((item) => (item.id === editingId ? { ...item, ...payload } : item)));
    } else {
      const nextId = items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
      const next = [{ ...payload, id: nextId }, ...items];
      persist(next);
      setSelectedId(nextId);
    }

    handleCancel();
  };

  const handleDelete = () => {
    if (!selectedItem) return;
    if (!window.confirm(`¿Eliminar técnico ${selectedItem.nombres_apellidos}?`)) return;
    const next = items.filter((item) => item.id !== selectedItem.id);
    persist(next);
    setSelectedId(next[0]?.id ?? null);
    handleCancel();
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.3rem' }}>Gestión de RRHH</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Alta, edición y eliminación de técnicos de mantenimiento.</p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ maxWidth: '420px' }}
            placeholder="Buscar por código, nombre o especialidad"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={handleNew}>Nuevo</button>
          <button type="button" className="btn btn-secondary" onClick={handleEdit} disabled={!selectedItem}>Editar</button>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={!selectedItem}>Eliminar</button>
          <button type="button" className="btn" style={{ background: '#e5e7eb', color: '#374151' }} onClick={handleCancel}>Limpiar</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              {['Código', 'Nombres y apellidos', 'Cargo', 'Especialidad', 'Identificación', 'Edad', 'Domicilio', 'Capacidad (Hh/día)', 'Costo/Hra', 'E-mail'].map((h) => (
                <th key={h} style={{ border: '1px solid #e5e7eb', padding: '.6rem', textAlign: 'left', color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id} onClick={() => setSelectedId(it.id)} style={{ background: selectedId === it.id ? '#eff6ff' : '#fff', cursor: 'pointer' }}>
                {[it.codigo, it.nombres_apellidos, it.cargo || 'Técnico', it.especialidad, it.identificacion, it.edad, it.domicilio, it.capacidad_hh_dia, `S/ ${Number(it.costo_hora || 0).toFixed(2)}`, it.email].map((value, idx) => (
                  <td key={`${it.id}-${idx}`} style={{ border: '1px solid #e5e7eb', padding: '.55rem', color: '#111827' }}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 className="card-title" style={{ marginBottom: '.8rem' }}>{editingId ? 'Editar técnico' : 'Registrar técnico'}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Código *</label><input required className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label className="form-label">Nombres y apellidos *</label><input required className="form-input" value={form.nombres_apellidos} onChange={(e) => setForm({ ...form, nombres_apellidos: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Cargo</label><select className="form-select" value={form.cargo || 'Técnico'} onChange={(e) => setForm({ ...form, cargo: e.target.value })}><option>Técnico</option><option>Encargado</option><option>Otro</option></select></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Especialidad</label><input className="form-input" value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Identificación</label><input className="form-input" value={form.identificacion} onChange={(e) => setForm({ ...form, identificacion: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Edad</label><input className="form-input" value={form.edad} onChange={(e) => setForm({ ...form, edad: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Domicilio</label><input className="form-input" value={form.domicilio} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Capacidad (Hh/día)</label><input className="form-input" value={form.capacidad_hh_dia} onChange={(e) => setForm({ ...form, capacidad_hh_dia: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Costo/Hra</label><input className="form-input" value={form.costo_hora} onChange={(e) => setForm({ ...form, costo_hora: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">E-mail</label><input className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '.2rem' }}>
            <button type="submit" className="btn btn-primary">{editingId ? 'Actualizar' : 'Registrar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
