import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';

const INITIAL_DATA = [
  { id: 1, codigo: 'PRD0000000', descripcion: 'ABRAZADERA 5"', marca: 'N.A.', proveedor: 'N.A.', stock: 1000, unidad: 'UND', costo_unit: 4, stock_min: 50 },
  { id: 2, codigo: 'PRD0000001', descripcion: 'ACEITE 15W40 CAT X 5 GL', marca: 'N.A.', proveedor: 'N.A.', stock: 1000, unidad: 'GLN', costo_unit: 136.67, stock_min: 50 },
];

const EMPTY_FORM = {
  codigo: '',
  descripcion: '',
  marca: '',
  proveedor: '',
  stock: 0,
  unidad: 'UND',
  costo_unit: 0,
  stock_min: 0,
};

export default function MaterialsManagement() {
  const [items, setItems] = useState(INITIAL_DATA);
  const [otAlerts, setOtAlerts] = useState([]);
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
      const [data, alertsData] = await Promise.all([
        loadSharedDocument(SHARED_DOCUMENT_KEYS.materials, INITIAL_DATA),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.otAlerts, []),
      ]);
      if (!active) return;
      const nextItems = Array.isArray(data) && data.length ? data : INITIAL_DATA;
      setItems(nextItems);
      setOtAlerts(Array.isArray(alertsData) ? alertsData : []);
      setSelectedId(nextItems[0]?.id ?? null);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const persist = async (next) => {
    setItems(next);
    try {
      await saveSharedDocument(SHARED_DOCUMENT_KEYS.materials, next);
      setError('');
    } catch (err) {
      console.error('Error guardando materiales:', err);
      setError('No se pudo guardar en el servidor. Revisa la conexion o tus permisos.');
    }
  };

  const filtered = useMemo(
    () => items.filter((it) => `${it.codigo} ${it.descripcion} ${it.marca} ${it.proveedor}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  const totalInventario = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.stock) * Number(it.costo_unit)), 0),
    [items],
  );
  const materialesBajoMinimo = useMemo(
    () => items.filter((it) => (Number(it.stock) || 0) <= (Number(it.stock_min) || 0)).length,
    [items],
  );
  const materialesSinStock = useMemo(
    () => items.filter((it) => (Number(it.stock) || 0) <= 0).length,
    [items],
  );
  const reservedByOt = useMemo(() => {
    const reserved = new Map();
    otAlerts
      .filter((item) => ['Creada', 'Liberada'].includes(item.status_ot))
      .forEach((item) => {
        (item.materiales_detalle || []).forEach((material) => {
          const key = String(material.id ?? material.materialId ?? material.codigo ?? '');
          if (!key) return;
          reserved.set(key, (reserved.get(key) || 0) + (Number(material.cantidad) || 0));
        });
      });
    return reserved;
  }, [otAlerts]);
  const materialesReservados = useMemo(
    () => items.filter((it) => (reservedByOt.get(String(it.id)) || 0) > 0).length,
    [items, reservedByOt],
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.codigo.trim() || !form.descripcion.trim()) return;

    const payload = {
      ...form,
      codigo: form.codigo.trim(),
      descripcion: form.descripcion.trim(),
      marca: form.marca.trim() || 'N.A.',
      proveedor: form.proveedor.trim() || 'N.A.',
      stock: Number(form.stock) || 0,
      unidad: form.unidad.trim() || 'UND',
      costo_unit: Number(form.costo_unit) || 0,
      stock_min: Number(form.stock_min) || 0,
    };

    if (editingId) {
      await persist(items.map((item) => (item.id === editingId ? { ...item, ...payload } : item)));
    } else {
      const nextId = items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
      const next = [{ ...payload, id: nextId }, ...items];
      await persist(next);
      setSelectedId(nextId);
    }

    handleCancel();
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!window.confirm(`¿Eliminar material ${selectedItem.descripcion}?`)) return;
    const next = items.filter((item) => item.id !== selectedItem.id);
    await persist(next);
    setSelectedId(next[0]?.id ?? null);
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
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.3rem' }}>Gestión de Materiales</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Alta, edición y eliminación de materiales/repuestos.</p>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ maxWidth: '460px' }}
            placeholder="Buscar por código, descripción, marca o proveedor"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={handleNew}>Nuevo</button>
          <button type="button" className="btn btn-secondary" onClick={handleEdit} disabled={!selectedItem}>Editar</button>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={!selectedItem}>Eliminar</button>
          <button type="button" className="btn" style={{ background: '#e5e7eb', color: '#374151' }} onClick={handleCancel}>Limpiar</button>
        </div>
        <div style={{ marginTop: '.85rem', color: '#374151', fontWeight: 600 }}>
          Costo total inventario: <span style={{ color: '#111827' }}>S/ {totalInventario.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">Materiales Catalogados</div>
          <div className="stat-value">{items.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Bajo Stock Mínimo</div>
          <div className="stat-value" style={{ color: '#ea580c' }}>{materialesBajoMinimo}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sin Stock</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{materialesSinStock}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reservados en OT</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{materialesReservados}</div>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1320px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              {['Código', 'Descripción', 'Marca', 'Proveedor', 'Stock', 'Unidad', 'Costo unit.', 'Costo total', 'Stock mín.'].map((h) => (
                <th key={h} style={{ border: '1px solid #e5e7eb', padding: '.6rem', textAlign: 'left', color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => {
              const stock = Number(it.stock) || 0;
              const reservado = reservedByOt.get(String(it.id)) || 0;
              const disponible = Math.max(stock - reservado, 0);
              const stockMin = Number(it.stock_min) || 0;
              const isCritical = disponible <= 0;
              const isLow = disponible > 0 && disponible <= stockMin;
              return (
              <tr
                key={it.id}
                onClick={() => setSelectedId(it.id)}
                style={{
                  background: selectedId === it.id ? '#eff6ff' : (isCritical ? '#fef2f2' : (isLow ? '#fff7ed' : '#fff')),
                  cursor: 'pointer',
                }}
              >
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{it.codigo}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{it.descripcion}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{it.marca}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{it.proveedor}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{it.stock}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem', color: reservado > 0 ? '#2563eb' : '#6b7280', fontWeight: reservado > 0 ? 700 : 400 }}>{reservado}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem', fontWeight: (isCritical || isLow) ? 700 : 400, color: isCritical ? '#dc2626' : (isLow ? '#c2410c' : '#111827') }}>{disponible}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{it.unidad}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>S/ {Number(it.costo_unit).toFixed(2)}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>S/ {(stock * Number(it.costo_unit)).toFixed(2)}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{it.stock_min}</td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 className="card-title" style={{ marginBottom: '.8rem' }}>{editingId ? 'Editar material' : 'Registrar material'}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Código *</label><input required className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label className="form-label">Descripción *</label><input required className="form-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Marca</label><input className="form-input" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Proveedor</label><input className="form-input" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Stock</label><input type="number" className="form-input" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Unidad</label><input className="form-input" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Costo unitario</label><input type="number" step="0.01" className="form-input" value={form.costo_unit} onChange={(e) => setForm({ ...form, costo_unit: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Stock mínimo</label><input type="number" className="form-input" value={form.stock_min} onChange={(e) => setForm({ ...form, stock_min: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '.2rem' }}>
            <button type="submit" className="btn btn-primary">{editingId ? 'Actualizar' : 'Registrar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
