import React, { useMemo, useState } from 'react';

const STORAGE_KEY = 'pmp_materiales_v1';

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

export default function MaterialsManagement() {
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
    () => items.filter((it) => `${it.codigo} ${it.descripcion} ${it.marca} ${it.proveedor}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  const totalInventario = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.stock) * Number(it.costo_unit)), 0),
    [items],
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
    if (!window.confirm(`¿Eliminar material ${selectedItem.descripcion}?`)) return;
    const next = items.filter((item) => item.id !== selectedItem.id);
    persist(next);
    setSelectedId(next[0]?.id ?? null);
    handleCancel();
  };

  return (
    <div className="classic-module">
      <div className="classic-header">
        <h1>CONTROL DE MATERIALES - REPUESTOS - INSUMOS</h1>
        <span>{new Date().toLocaleDateString('es-PE')}</span>
      </div>

      <div className="classic-toolbar-grid">
        <div className="classic-card">
          <h3>BUSCAR POR:</h3>
          <div className="classic-inline-fields">
            <label htmlFor="mat-search">Descripción:</label>
            <input id="mat-search" className="form-input" placeholder="Buscar por código, descripción, marca o proveedor" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="classic-inline-fields">
            <label htmlFor="mat-code">Código:</label>
            <input id="mat-code" className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
          </div>
        </div>

        <div className="classic-card classic-total-card">
          <h3>COSTO TOTAL INVENTARIO</h3>
          <p>S/ {totalInventario.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>

        <div className="classic-card classic-actions">
          <ToolbarButton label="NUEVO" className="btn-primary" onClick={handleNew} />
          <ToolbarButton label="EDITAR" className="btn-secondary" onClick={handleEdit} disabled={!selectedItem} />
          <ToolbarButton label="ELIMINAR" className="btn-danger" onClick={handleDelete} disabled={!selectedItem} />
          <ToolbarButton label="CANCELAR" onClick={handleCancel} disabled={!editingId && !form.codigo && !form.descripcion} />
        </div>
      </div>

      <div className="classic-card">
        <h3>INVENTARIO:</h3>
        <div className="classic-table-wrap">
          <table className="classic-table">
            <thead>
              <tr>
                <th>CÓDIGO</th><th>DESCRIPCIÓN</th><th>MARCA</th><th>PROVEEDOR</th><th>STOCK</th><th>UNIDAD</th><th>COSTO UNIT.</th><th>COSTO TOTAL</th><th>STOCK MÍN.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className={selectedId === it.id ? 'selected' : ''} onClick={() => setSelectedId(it.id)}>
                  <td>{it.codigo}</td>
                  <td>{it.descripcion}</td>
                  <td>{it.marca}</td>
                  <td>{it.proveedor}</td>
                  <td>{it.stock}</td>
                  <td>{it.unidad}</td>
                  <td>S/ {Number(it.costo_unit).toFixed(2)}</td>
                  <td>S/ {(Number(it.stock) * Number(it.costo_unit)).toFixed(2)}</td>
                  <td>{it.stock_min}</td>
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
          <div className="form-group wide"><label className="form-label">Descripción *</label><input required className="form-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Marca</label><input className="form-input" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Proveedor</label><input className="form-input" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Stock</label><input type="number" className="form-input" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Unidad</label><input className="form-input" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Costo unitario</label><input type="number" step="0.01" className="form-input" value={form.costo_unit} onChange={(e) => setForm({ ...form, costo_unit: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Stock mínimo</label><input type="number" className="form-input" value={form.stock_min} onChange={(e) => setForm({ ...form, stock_min: e.target.value })} /></div>
          <div className="classic-form-actions">
            <button type="submit" className="btn btn-primary">{editingId ? 'Actualizar' : 'Registrar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
