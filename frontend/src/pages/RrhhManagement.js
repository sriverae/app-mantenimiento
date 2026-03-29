import React, { useMemo, useState } from 'react';

const STORAGE_KEY = 'pmp_rrhh_tecnicos_v1';

const INITIAL_DATA = [
  { id: 1, codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', especialidad: 'Mecánico', identificacion: 'N.A.', edad: 'N.A.', domicilio: 'Primero', capacidad_hh_dia: '12.00', costo_hora: '6.94', email: 'N.A.' },
  { id: 2, codigo: 'ELE-1', nombres_apellidos: 'Hernan Alauce Alarcón', especialidad: 'Eléctrico', identificacion: 'N.A.', edad: 'N.A.', domicilio: 'Primero', capacidad_hh_dia: '12.00', costo_hora: '6.11', email: 'N.A.' },
];

const EMPTY_FORM = {
  codigo: '',
  nombres_apellidos: '',
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

function ToolbarButton({ label, className, ...props }) {
  return <button type="button" className={`classic-action-btn ${className || ''}`.trim()} {...props}>{label}</button>;
}

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
    <div className="classic-module">
      <div className="classic-header">
        <h1>CTRL DE RECURSOS HUMANOS</h1>
        <span>{new Date().toLocaleDateString('es-PE')}</span>
      </div>

      <div className="classic-toolbar-grid">
        <div className="classic-card">
          <h3>BUSCAR POR:</h3>
          <div className="classic-inline-fields">
            <label htmlFor="rrhh-search">Nombres y apellidos:</label>
            <input id="rrhh-search" className="form-input" placeholder="Buscar por código, nombre o especialidad" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="classic-inline-fields">
            <label htmlFor="rrhh-code">Código:</label>
            <input id="rrhh-code" className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
          </div>
        </div>

        <div className="classic-card classic-actions">
          <ToolbarButton label="NUEVO" className="btn-primary" onClick={handleNew} />
          <ToolbarButton label="EDITAR" className="btn-secondary" onClick={handleEdit} disabled={!selectedItem} />
          <ToolbarButton label="ELIMINAR" className="btn-danger" onClick={handleDelete} disabled={!selectedItem} />
          <ToolbarButton label="CANCELAR" onClick={handleCancel} disabled={!editingId && !form.codigo && !form.nombres_apellidos} />
        </div>
      </div>

      <div className="classic-card">
        <h3>INVENTARIO:</h3>
        <div className="classic-table-wrap">
          <table className="classic-table">
            <thead>
              <tr>
                <th>CÓDIGO</th><th>NOMBRES Y APELLIDOS</th><th>ESPECIALIDAD</th><th>IDENTIFICACIÓN</th><th>EDAD</th><th>DOMICILIO</th><th>CAPACIDAD (Hh/día)</th><th>COSTO/Hra</th><th>E-MAIL</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className={selectedId === it.id ? 'selected' : ''} onClick={() => setSelectedId(it.id)}>
                  <td>{it.codigo}</td>
                  <td>{it.nombres_apellidos}</td>
                  <td>{it.especialidad}</td>
                  <td>{it.identificacion}</td>
                  <td>{it.edad}</td>
                  <td>{it.domicilio}</td>
                  <td>{it.capacidad_hh_dia}</td>
                  <td>S/ {Number(it.costo_hora || 0).toFixed(2)}</td>
                  <td>{it.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="classic-card">
        <h3>RESULTADOS:</h3>
        <form onSubmit={handleSubmit} className="classic-form-grid">
          <div className="form-group"><label className="form-label">Código *</label><input required className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
          <div className="form-group wide"><label className="form-label">Nombres y apellidos *</label><input required className="form-input" value={form.nombres_apellidos} onChange={(e) => setForm({ ...form, nombres_apellidos: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Especialidad</label><input className="form-input" value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Identificación</label><input className="form-input" value={form.identificacion} onChange={(e) => setForm({ ...form, identificacion: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Edad</label><input className="form-input" value={form.edad} onChange={(e) => setForm({ ...form, edad: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Domicilio</label><input className="form-input" value={form.domicilio} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Capacidad (Hh/día)</label><input className="form-input" value={form.capacidad_hh_dia} onChange={(e) => setForm({ ...form, capacidad_hh_dia: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Costo/Hra</label><input className="form-input" value={form.costo_hora} onChange={(e) => setForm({ ...form, costo_hora: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="classic-form-actions">
            <button type="submit" className="btn btn-primary">{editingId ? 'Actualizar' : 'Registrar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
