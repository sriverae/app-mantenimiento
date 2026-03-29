import React, { useMemo, useState } from 'react';

const STORAGE_KEY = 'pmp_materiales_v1';

const INITIAL_DATA = [
  { id: 1, codigo: 'PRD0000000', descripcion: 'ABRAZADERA 5"', marca: 'N.A.', proveedor: 'N.A.', stock: 1000, unidad: 'UND', costo_unit: 4.0, stock_min: 50 },
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

export default function MaterialsManagement() {
  const [items, setItems] = useState(() => readData());
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ codigo: '', descripcion: '', marca: '', proveedor: '', stock: 0, unidad: 'UND', costo_unit: 0, stock_min: 0 });

  const persist = (next) => {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const filtered = useMemo(
    () => items.filter((it) => `${it.codigo} ${it.descripcion}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm({ codigo: '', descripcion: '', marca: '', proveedor: '', stock: 0, unidad: 'UND', costo_unit: 0, stock_min: 0 });
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
    const payload = { ...form, stock: Number(form.stock) || 0, costo_unit: Number(form.costo_unit) || 0, stock_min: Number(form.stock_min) || 0 };
    if (editingId) {
      persist(items.map((i) => (i.id === editingId ? { ...i, ...payload } : i)));
    } else {
      const nextId = items.length ? Math.max(...items.map((i) => i.id)) + 1 : 1;
      const next = [{ ...payload, id: nextId }, ...items];
      persist(next);
      setSelectedId(nextId);
    }
    setShowModal(false);
  };

  const remove = () => {
    const item = items.find((i) => i.id === selectedId);
    if (!item) return;
    if (!window.confirm(`¿Eliminar material ${item.descripcion}?`)) return;
    const next = items.filter((i) => i.id !== selectedId);
    persist(next);
    setSelectedId(next[0]?.id ?? null);
  };

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Gestión de Materiales</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Control de materiales / repuestos / insumos (Agregar, Editar, Eliminar).</p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={openCreate}>Nuevo</button>
          <button type="button" className="btn btn-secondary" onClick={openEdit} disabled={!selectedId}>Editar</button>
          <button type="button" className="btn btn-danger" onClick={remove} disabled={!selectedId}>Eliminar</button>
          <input className="form-input" style={{ maxWidth: '360px' }} placeholder="Buscar por código o descripción..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Código', 'Descripción', 'Marca', 'Proveedor', 'Stock', 'Unidad', 'Costo unit.', 'Costo total', 'Stock mín.'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f4f75', padding: '.55rem .5rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id} onClick={() => setSelectedId(it.id)} style={{ background: selectedId === it.id ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{it.codigo}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{it.descripcion}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{it.marca || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{it.proveedor || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{it.stock}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{it.unidad}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>S/ {Number(it.costo_unit).toFixed(2)}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>S/ {(Number(it.stock) * Number(it.costo_unit)).toFixed(2)}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{it.stock_min}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editingId ? 'Editar material' : 'Nuevo material'} onClose={() => setShowModal(false)}>
          <form onSubmit={save}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.7rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Código *</label><input className="form-input" required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label className="form-label">Descripción *</label><input className="form-input" required value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Marca</label><input className="form-input" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Proveedor</label><input className="form-input" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Stock</label><input type="number" className="form-input" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Unidad</label><input className="form-input" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Costo unitario</label><input type="number" step="0.01" className="form-input" value={form.costo_unit} onChange={(e) => setForm({ ...form, costo_unit: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Stock mínimo</label><input type="number" className="form-input" value={form.stock_min} onChange={(e) => setForm({ ...form, stock_min: e.target.value })} /></div>
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
