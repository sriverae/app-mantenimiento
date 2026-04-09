import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';

const INITIAL_DATA = [
  {
    id: 1,
    codigo: 'MEC-1',
    nombres_apellidos: 'Manuel de la Cruz Jimenez',
    cargo: 'Tecnico',
    especialidad: 'Mecanico',
    tipo_personal: 'Propio',
    empresa: 'N.A.',
    identificacion: 'N.A.',
    edad: 'N.A.',
    domicilio: 'Primero',
    capacidad_hh_dia: '12.00',
    costo_hora: '6.94',
    email: 'N.A.',
  },
  {
    id: 2,
    codigo: 'ELE-1',
    nombres_apellidos: 'Hernan Alauce Alarcon',
    cargo: 'Encargado',
    especialidad: 'Electrico',
    tipo_personal: 'Propio',
    empresa: 'N.A.',
    identificacion: 'N.A.',
    edad: 'N.A.',
    domicilio: 'Primero',
    capacidad_hh_dia: '12.00',
    costo_hora: '6.11',
    email: 'N.A.',
  },
];

const EMPTY_FORM = {
  codigo: '',
  nombres_apellidos: '',
  cargo: 'Tecnico',
  especialidad: 'Mecanico',
  tipo_personal: 'Propio',
  empresa: '',
  identificacion: '',
  edad: '',
  domicilio: '',
  capacidad_hh_dia: '',
  costo_hora: '',
  email: '',
};

const normalizeRrhhItem = (item, index) => ({
  id: item?.id ?? index + 1,
  codigo: item?.codigo || '',
  nombres_apellidos: item?.nombres_apellidos || '',
  cargo: item?.cargo || 'Tecnico',
  especialidad: item?.especialidad || 'Mecanico',
  tipo_personal: item?.tipo_personal || 'Propio',
  empresa: item?.empresa || 'N.A.',
  identificacion: item?.identificacion || 'N.A.',
  edad: item?.edad || 'N.A.',
  domicilio: item?.domicilio || 'N.A.',
  capacidad_hh_dia: item?.capacidad_hh_dia || '0.00',
  costo_hora: item?.costo_hora || '0.00',
  email: item?.email || 'N.A.',
});

export default function RrhhManagement() {
  const [items, setItems] = useState(INITIAL_DATA);
  const [selectedId, setSelectedId] = useState(INITIAL_DATA[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const data = await loadSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, INITIAL_DATA);
      if (!active) return;
      const nextItems = (Array.isArray(data) && data.length ? data : INITIAL_DATA).map(normalizeRrhhItem);
      setItems(nextItems);
      setSelectedId(nextItems[0]?.id ?? null);
      setLoading(false);
    };

    load();
    return () => { active = false; };
  }, []);

  const persist = async (nextItems) => {
    setItems(nextItems);
    try {
      await saveSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, nextItems);
      setError('');
    } catch (err) {
      console.error('Error guardando RRHH:', err);
      setError('No se pudo guardar en el servidor. Revisa la conexion o tus permisos.');
    }
  };

  const filtered = useMemo(
    () => items.filter((item) => `${item.codigo} ${item.nombres_apellidos} ${item.especialidad} ${item.tipo_personal || ''} ${item.empresa || ''}`.toLowerCase().includes(query.toLowerCase())),
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
    setForm({
      ...EMPTY_FORM,
      ...selectedItem,
      empresa: selectedItem.tipo_personal === 'Tercero' ? selectedItem.empresa : '',
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = normalizeRrhhItem({
      ...form,
      codigo: form.codigo.trim(),
      nombres_apellidos: form.nombres_apellidos.trim(),
      cargo: form.cargo || 'Tecnico',
      especialidad: form.especialidad.trim() || 'Mecanico',
      tipo_personal: form.tipo_personal || 'Propio',
      empresa: form.tipo_personal === 'Tercero' ? (form.empresa.trim() || 'N.A.') : 'N.A.',
      identificacion: form.identificacion.trim() || 'N.A.',
      edad: form.edad.trim() || 'N.A.',
      domicilio: form.domicilio.trim() || 'N.A.',
      capacidad_hh_dia: form.capacidad_hh_dia.trim() || '0.00',
      costo_hora: form.costo_hora.trim() || '0.00',
      email: form.email.trim() || 'N.A.',
    });

    if (!payload.codigo || !payload.nombres_apellidos) return;

    if (editingId) {
      await persist(items.map((item) => (item.id === editingId ? { ...item, ...payload, id: editingId } : item)));
    } else {
      const nextId = items.length ? Math.max(...items.map((item) => Number(item.id) || 0)) + 1 : 1;
      const nextItems = [{ ...payload, id: nextId }, ...items];
      await persist(nextItems);
      setSelectedId(nextId);
    }

    handleCancel();
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!window.confirm(`Eliminar personal ${selectedItem.nombres_apellidos}?`)) return;
    const nextItems = items.filter((item) => item.id !== selectedItem.id);
    await persist(nextItems);
    setSelectedId(nextItems[0]?.id ?? null);
    handleCancel();
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
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.3rem' }}>Gestion de RRHH</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Alta, edicion y eliminacion de personal de mantenimiento propio y tercero.
      </p>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ maxWidth: '520px' }}
            placeholder="Buscar por codigo, nombre, especialidad, tipo o empresa"
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
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1460px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              {['Codigo', 'Nombres y apellidos', 'Cargo', 'Especialidad', 'Tipo personal', 'Empresa / Contrata', 'Identificacion', 'Edad', 'Domicilio', 'Capacidad (Hh/dia)', 'Costo/Hra', 'E-mail'].map((header) => (
                <th key={header} style={{ border: '1px solid #e5e7eb', padding: '.6rem', textAlign: 'left', color: '#374151' }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} onClick={() => setSelectedId(item.id)} style={{ background: selectedId === item.id ? '#eff6ff' : '#fff', cursor: 'pointer' }}>
                {[
                  item.codigo,
                  item.nombres_apellidos,
                  item.cargo || 'Tecnico',
                  item.especialidad || 'N.A.',
                  item.tipo_personal || 'Propio',
                  item.empresa || 'N.A.',
                  item.identificacion || 'N.A.',
                  item.edad || 'N.A.',
                  item.domicilio || 'N.A.',
                  item.capacidad_hh_dia || '0.00',
                  `S/ ${Number(item.costo_hora || 0).toFixed(2)}`,
                  item.email || 'N.A.',
                ].map((value, index) => (
                  <td key={`${item.id}-${index}`} style={{ border: '1px solid #e5e7eb', padding: '.55rem', color: '#111827' }}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 className="card-title" style={{ marginBottom: '.8rem' }}>{editingId ? 'Editar personal' : 'Registrar personal'}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Codigo *</label>
            <input required className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Nombres y apellidos *</label>
            <input required className="form-input" value={form.nombres_apellidos} onChange={(e) => setForm({ ...form, nombres_apellidos: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cargo</label>
            <select className="form-select" value={form.cargo || 'Tecnico'} onChange={(e) => setForm({ ...form, cargo: e.target.value })}>
              <option>Tecnico</option>
              <option>Encargado</option>
              <option>Otro</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Especialidad</label>
            <input className="form-input" value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Tipo de personal</label>
            <select className="form-select" value={form.tipo_personal || 'Propio'} onChange={(e) => setForm({ ...form, tipo_personal: e.target.value, empresa: e.target.value === 'Tercero' ? form.empresa : '' })}>
              <option>Propio</option>
              <option>Tercero</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Empresa / Contrata</label>
            <input
              className="form-input"
              value={form.empresa}
              onChange={(e) => setForm({ ...form, empresa: e.target.value })}
              placeholder={form.tipo_personal === 'Tercero' ? 'Nombre de la empresa tercera' : 'No aplica'}
              disabled={form.tipo_personal !== 'Tercero'}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Identificacion</label>
            <input className="form-input" value={form.identificacion} onChange={(e) => setForm({ ...form, identificacion: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Edad</label>
            <input className="form-input" value={form.edad} onChange={(e) => setForm({ ...form, edad: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Domicilio</label>
            <input className="form-input" value={form.domicilio} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Capacidad (Hh/dia)</label>
            <input className="form-input" value={form.capacidad_hh_dia} onChange={(e) => setForm({ ...form, capacidad_hh_dia: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Costo/Hra</label>
            <input className="form-input" value={form.costo_hora} onChange={(e) => setForm({ ...form, costo_hora: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">E-mail</label>
            <input className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '.2rem' }}>
            <button type="submit" className="btn btn-primary">{editingId ? 'Actualizar' : 'Registrar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
