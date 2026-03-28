import React, { useMemo, useState } from 'react';

const BASE_COLUMNS = [
  { key: 'codigo', label: 'Código' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'area_trabajo', label: 'Área de trabajo' },
  { key: 'marca', label: 'Marca' },
  { key: 'capacidad', label: 'Capacidad' },
  { key: 'potencia_kw', label: 'Potencia (kW)' },
  { key: 'amperaje', label: 'Amperaje' },
  { key: 'voltaje_trabajo', label: 'Voltaje de trabajo' },
  { key: 'estado', label: 'Estado' },
];

const INITIAL_EQUIPOS = [
  {
    id: 1,
    codigo: 'IAISPL1',
    descripcion: 'Pre Limpia Sabreca N 1',
    area_trabajo: 'Secado',
    marca: 'N.A.',
    capacidad: 'N.A.',
    potencia_kw: 'N.A.',
    amperaje: 'N.A.',
    voltaje_trabajo: 'N.A.',
    estado: 'Operativo',
  },
  {
    id: 2,
    codigo: 'IAISPL2',
    descripcion: 'Pre Limpia Superbrix N 2',
    area_trabajo: 'Secado',
    marca: 'Superbrix',
    capacidad: 'N.A.',
    potencia_kw: '2.2',
    amperaje: '11.5 / 5.9 A',
    voltaje_trabajo: '220 / 440 V',
    estado: 'Operativo',
  },
];

function Modal({ title, onClose, children, maxWidth = '860px' }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth, background: '#fff', borderRadius: '1rem', boxShadow: '0 22px 64px rgba(0,0,0,.28)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', padding: '1rem 1.2rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '1.6rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>
        <div style={{ padding: '1.1rem 1.2rem 1.3rem' }}>{children}</div>
      </div>
    </div>
  );
}

export default function PmpEquipos() {
  const [columns, setColumns] = useState(BASE_COLUMNS);
  const [equipos, setEquipos] = useState(INITIAL_EQUIPOS);
  const [selectedId, setSelectedId] = useState(INITIAL_EQUIPOS[0]?.id ?? null);
  const [showEquipoModal, setShowEquipoModal] = useState(false);
  const [showColModal, setShowColModal] = useState(false);
  const [showRemoveColModal, setShowRemoveColModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [columnToRemove, setColumnToRemove] = useState(BASE_COLUMNS[0].key);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);

  const selectedEquipo = useMemo(() => equipos.find((e) => e.id === selectedId) || null, [equipos, selectedId]);

  const openNewEquipo = () => {
    const defaultForm = {};
    columns.forEach((col) => { defaultForm[col.key] = ''; });
    setForm(defaultForm);
    setEditingId(null);
    setShowEquipoModal(true);
  };

  const openEditEquipo = () => {
    if (!selectedEquipo) return;
    const editForm = {};
    columns.forEach((col) => { editForm[col.key] = selectedEquipo[col.key] || ''; });
    setForm(editForm);
    setEditingId(selectedEquipo.id);
    setShowEquipoModal(true);
  };

  const saveEquipo = (e) => {
    e.preventDefault();
    if (editingId) {
      setEquipos((prev) => prev.map((eq) => (eq.id === editingId ? { ...eq, ...form } : eq)));
      setSelectedId(editingId);
    } else {
      const nextId = equipos.length ? Math.max(...equipos.map((eq) => eq.id)) + 1 : 1;
      const newRow = { id: nextId, ...form };
      setEquipos((prev) => [newRow, ...prev]);
      setSelectedId(nextId);
    }
    setShowEquipoModal(false);
  };

  const addColumn = (e) => {
    e.preventDefault();
    const cleanName = newColumnName.trim();
    if (!cleanName) return;

    const key = cleanName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!key || columns.some((col) => col.key === key)) return;

    const newCol = { key, label: cleanName };
    setColumns((prev) => [...prev, newCol]);
    setEquipos((prev) => prev.map((item) => ({ ...item, [key]: '' })));
    setNewColumnName('');
    setColumnToRemove(key);
    setShowColModal(false);
  };

  const removeColumn = (e) => {
    e.preventDefault();
    if (!columnToRemove) return;
    if (columns.length <= 1) return;
    setColumns((prev) => prev.filter((col) => col.key !== columnToRemove));
    setEquipos((prev) => prev.map((item) => {
      const next = { ...item };
      delete next[columnToRemove];
      return next;
    }));
    const remaining = columns.filter((col) => col.key !== columnToRemove);
    setColumnToRemove(remaining[0]?.key || '');
    setShowRemoveColModal(false);
  };

  const deleteSelected = () => {
    if (!selectedEquipo) return;
    if (!window.confirm(`¿Eliminar equipo ${selectedEquipo.codigo || selectedEquipo.descripcion || selectedEquipo.id}?`)) return;
    const filtered = equipos.filter((eq) => eq.id !== selectedEquipo.id);
    setEquipos(filtered);
    setSelectedId(filtered[0]?.id ?? null);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Control de equipos</h1>
        <p style={{ color: '#6b7280' }}>Gestión de inventario PMP con columnas dinámicas para nuevos campos.</p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={openNewEquipo}>Nuevo equipo</button>
          <button type="button" className="btn btn-secondary" onClick={openEditEquipo} disabled={!selectedEquipo}>Editar equipo</button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowColModal(true)}>Agregar columna</button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowRemoveColModal(true)} disabled={columns.length <= 1}>Eliminar columna</button>
          <button type="button" className="btn btn-danger" onClick={deleteSelected} disabled={!selectedEquipo}>Eliminar</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem', fontWeight: 700 }}>Inventario</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1280px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {columns.map((col) => (
                <th key={col.key} style={{ border: '1px solid #2f4f75', textAlign: 'left', padding: '.65rem .55rem', fontSize: '.82rem', whiteSpace: 'nowrap' }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipos.map((equipo) => (
              <tr key={equipo.id} onClick={() => setSelectedId(equipo.id)} style={{ background: selectedId === equipo.id ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
                {columns.map((col) => (
                  <td key={`${equipo.id}-${col.key}`} style={{ border: '1px solid #e5e7eb', padding: '.58rem .55rem', whiteSpace: 'nowrap' }}>
                    {equipo[col.key] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showEquipoModal && (
        <Modal title={editingId ? 'Editar equipo' : 'Nuevo equipo'}>
          <form onSubmit={saveEquipo}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              {columns.map((col) => (
                <div key={`form-${col.key}`} className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{col.label}</label>
                  <input className="form-input" value={form[col.key] || ''} onChange={(e) => setForm((prev) => ({ ...prev, [col.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowEquipoModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Guardar equipo'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showColModal && (
        <Modal title="Agregar nueva columna" maxWidth="520px">
          <form onSubmit={addColumn}>
            <div className="form-group" style={{ marginBottom: '.7rem' }}>
              <label className="form-label">Nombre de columna</label>
              <input className="form-input" value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} placeholder="Ej: Horómetro, Ubicación exacta, N° Serie" required />
            </div>
            <p style={{ color: '#6b7280', fontSize: '.85rem', marginBottom: '1rem' }}>
              La nueva columna se agregará a la tabla y también aparecerá automáticamente en el formulario de nuevo equipo.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowColModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Agregar columna</button>
            </div>
          </form>
        </Modal>
      )}

      {showRemoveColModal && (
        <Modal title="Eliminar columna" maxWidth="520px">
          <form onSubmit={removeColumn}>
            <div className="form-group" style={{ marginBottom: '.8rem' }}>
              <label className="form-label">Selecciona la columna a eliminar</label>
              <select className="form-select" value={columnToRemove} onChange={(e) => setColumnToRemove(e.target.value)}>
                {columns.map((col) => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
              </select>
            </div>
            <p style={{ color: '#b45309', fontSize: '.85rem', marginBottom: '1rem' }}>
              ⚠️ Se eliminará esta columna de la tabla y de los próximos ingresos de equipos.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowRemoveColModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-danger">Eliminar columna</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
