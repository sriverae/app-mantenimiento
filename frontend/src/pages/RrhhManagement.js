import React, { useMemo, useState } from 'react';

const STORAGE_KEY = 'pmp_rrhh_tecnicos_v1';

const INITIAL_DATA = [
  { id: 1, codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', especialidad: 'Mecánico', identificacion: 'N.A.', edad: 'N.A.', domicilio: 'Primero', capacidad_hh_dia: '12.00', costo_hora: 'S/ 6.94', email: 'N.A.' },
];

const readData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : INITIAL_DATA;
    return Array.isArray(parsed) ? parsed : INITIAL_DATA;
  } catch {
    return INITIAL_DATA;
  }
};

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '1rem', width: '100%', maxWidth: '860px', boxShadow: '0 20px 60px rgba(0,0,0,.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', padding: '1rem 1.2rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '1.7rem', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '1.1rem 1.2rem' }}>{children}</div>
      </div>
    </div>
  );
}

export default function RrhhManagement() {
  const [items, setItems] = useState(() => readData());
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    codigo: '', nombres_apellidos: '', especialidad: 'Mecánico', identificacion: '', edad: '', domicilio: '', capacidad_hh_dia: '', costo_hora: '', email: '',
  });

  const persist = (next) => {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const filtered = useMemo(
    () => items.filter((it) => `${it.codigo} ${it.nombres_apellidos}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm({ codigo: '', nombres_apellidos: '', especialidad: 'Mecánico', identificacion: '', edad: '', domicilio: '', capacidad_hh_dia: '', costo_hora: '', email: '' });
    setShowModal(true);
  };

  const openEdit = () => {
    const item = items.find((i) => i.id === selectedId);
    if (!item) return;
    setEditingId(item.id);
    setForm({ ...item });
    setShowModal(true);
  };

  const save = (e) => {
    e.preventDefault();
    if (editingId) {
      const next = items.map((i) => (i.id === editingId ? { ...i, ...form } : i));
      persist(next);
    } else {
      const nextId = items.length ? Math.max(...items.map((i) => i.id)) + 1 : 1;
      const next = [{ ...form, id: nextId }, ...items];
      persist(next);
      setSelectedId(nextId);
    }
    setShowModal(false);
  };

  const remove = () => {
    const item = items.find((i) => i.id === selectedId);
    if (!item) return;
    if (!window.confirm(`¿Eliminar técnico ${item.nombres_apellidos}?`)) return;
    const next = items.filter((i) => i.id !== selectedId);
    persist(next);
    setSelectedId(next[0]?.id ?? null);
  };

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Gestión de RRHH</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Control de técnicos de mantenimiento (Agregar, Editar, Eliminar).</p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={openCreate}>Nuevo</button>
          <button type="button" className="btn btn-secondary" onClick={openEdit} disabled={!selectedId}>Editar</button>
          <button type="button" className="btn btn-danger" onClick={remove} disabled={!selectedId}>Eliminar</button>
          <input className="form-input" style={{ maxWidth: '360px' }} placeholder="Buscar por código o nombre..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1300px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Código', 'Nombres y apellidos', 'Especialidad', 'Identificación', 'Edad', 'Domicilio', 'Capacidad (Hh/día)', 'Costo/Hra', 'E-mail'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f4f75', padding: '.55rem .5rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id} onClick={() => setSelectedId(it.id)} style={{ background: selectedId === it.id ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
                {[it.codigo, it.nombres_apellidos, it.especialidad, it.identificacion, it.edad, it.domicilio, it.capacidad_hh_dia, it.costo_hora, it.email].map((v, idx) => (
                  <td key={`${it.id}-${idx}`} style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{v || 'N.A.'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editingId ? 'Editar técnico' : 'Nuevo técnico'} onClose={() => setShowModal(false)}>
          <form onSubmit={save}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.7rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Código *</label><input className="form-input" required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label className="form-label">Nombres y apellidos *</label><input className="form-input" required value={form.nombres_apellidos} onChange={(e) => setForm({ ...form, nombres_apellidos: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Especialidad</label><input className="form-input" value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Identificación</label><input className="form-input" value={form.identificacion} onChange={(e) => setForm({ ...form, identificacion: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Edad</label><input className="form-input" value={form.edad} onChange={(e) => setForm({ ...form, edad: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Domicilio</label><input className="form-input" value={form.domicilio} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Capacidad (Hh/día)</label><input className="form-input" value={form.capacidad_hh_dia} onChange={(e) => setForm({ ...form, capacidad_hh_dia: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Costo/Hra</label><input className="form-input" value={form.costo_hora} onChange={(e) => setForm({ ...form, costo_hora: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">E-mail</label><input className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Guardar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
