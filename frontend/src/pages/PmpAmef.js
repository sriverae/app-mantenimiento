import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';

const AMEF_KEY = SHARED_DOCUMENT_KEYS.amef;
const EQUIPOS_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;

const EMPTY_FORM = {
  equipo_id: '',
  equipo_codigo: '',
  equipo_descripcion: '',
  componente_id: '',
  componente_codigo: '',
  componente_nombre: '',
  funcion: '',
  modo_falla: '',
  efecto_falla: '',
  severidad: 1,
  causa_falla: '',
  ocurrencia: 1,
  controles_actuales: '',
  deteccion_metodo: '',
  deteccion: 1,
  accion_recomendada: '',
  responsable_accion: '',
  fecha_compromiso: '',
  estado_accion: 'Pendiente',
};

const ACTION_STATUS = ['Pendiente', 'En proceso', 'Implementada', 'Cerrada'];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildNpr = (item) => (
  (toNumber(item.severidad) || 0)
  * (toNumber(item.ocurrencia) || 0)
  * (toNumber(item.deteccion) || 0)
);

const getRiskMeta = (npr) => {
  if (npr >= 200) return { label: 'Critico', bg: '#fef2f2', color: '#dc2626' };
  if (npr >= 100) return { label: 'Alto', bg: '#fff7ed', color: '#c2410c' };
  if (npr >= 50) return { label: 'Medio', bg: '#eff6ff', color: '#2563eb' };
  return { label: 'Bajo', bg: '#ecfdf5', color: '#059669' };
};

const normalizeEquipos = (items) => (Array.isArray(items) ? items : []).map((item, index) => ({
  id: item.id ?? `eq_${index}_${item.codigo || 'sin_codigo'}`,
  codigo: item.codigo || '',
  descripcion: item.descripcion || '',
  area_trabajo: item.area_trabajo || '',
  despiece: Array.isArray(item.despiece) ? item.despiece : [],
  ...item,
}));

const flattenComponents = (equipo) => {
  const nodes = Array.isArray(equipo?.despiece) ? equipo.despiece : [];
  const byParent = new Map();
  nodes.forEach((node) => {
    const key = node.parentId || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  });

  const walk = (parentId = null, level = 2, parentPath = '') => {
    const key = parentId || '__root__';
    const branch = byParent.get(key) || [];
    return branch.flatMap((node) => {
      const currentPath = parentPath ? `${parentPath} > ${node.nombre}` : node.nombre;
      return [
        {
          id: node.id,
          codigo: node.codigo_sub || '',
          nombre: node.nombre || '',
          nivel: level,
          path: currentPath,
        },
        ...walk(node.id, level + 1, currentPath),
      ];
    });
  };

  return walk();
};

export default function PmpAmef() {
  const [items, setItems] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [loadedItems, loadedEquipos] = await Promise.all([
        loadSharedDocument(AMEF_KEY, []),
        loadSharedDocument(EQUIPOS_KEY, []),
      ]);
      if (!active) return;
      const nextItems = Array.isArray(loadedItems) ? loadedItems : [];
      const nextEquipos = normalizeEquipos(loadedEquipos);
      setItems(nextItems);
      setEquipos(nextEquipos);
      setSelectedId(nextItems[0]?.id ?? null);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const persist = async (next) => {
    setItems(next);
    try {
      await saveSharedDocument(AMEF_KEY, next);
      setError('');
    } catch (err) {
      console.error('Error guardando AMEF:', err);
      setError('No se pudo guardar el AMEF en el servidor.');
    }
  };

  const selectedEquipo = useMemo(
    () => equipos.find((item) => String(item.id) === String(form.equipo_id)) || null,
    [equipos, form.equipo_id],
  );

  const componentOptions = useMemo(
    () => flattenComponents(selectedEquipo),
    [selectedEquipo],
  );

  const filteredItems = useMemo(() => items.filter((item) => {
    const matchesQuery = `${item.equipo_codigo} ${item.equipo_descripcion} ${item.componente_nombre} ${item.modo_falla} ${item.causa_falla}`.toLowerCase().includes(query.toLowerCase());
    const matchesEquipment = !equipmentFilter || String(item.equipo_id) === String(equipmentFilter);
    return matchesQuery && matchesEquipment;
  }), [items, query, equipmentFilter]);

  const selectedItem = useMemo(
    () => items.find((item) => String(item.id) === String(selectedId)) || null,
    [items, selectedId],
  );

  const stats = useMemo(() => {
    const uniqueEquipos = new Set(items.map((item) => item.equipo_codigo).filter(Boolean));
    const criticalNpr = items.filter((item) => buildNpr(item) >= 200).length;
    const pendingActions = items.filter((item) => item.estado_accion !== 'Cerrada' && item.estado_accion !== 'Implementada').length;
    const coverage = equipos.length ? Math.round((uniqueEquipos.size / equipos.length) * 100) : 0;
    return {
      total: items.length,
      coveredEquipment: uniqueEquipos.size,
      criticalNpr,
      pendingActions,
      coverage,
    };
  }, [items, equipos]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleNew = async () => {
    const loadedEquipos = await loadSharedDocument(EQUIPOS_KEY, []);
    setEquipos(normalizeEquipos(loadedEquipos));
    resetForm();
  };

  const handleEdit = () => {
    if (!selectedItem) return;
    setEditingId(selectedItem.id);
    setForm({ ...selectedItem });
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!window.confirm(`Eliminar AMEF para ${selectedItem.equipo_codigo} - ${selectedItem.modo_falla}?`)) return;
    const next = items.filter((item) => String(item.id) !== String(selectedItem.id));
    await persist(next);
    setSelectedId(next[0]?.id ?? null);
    resetForm();
  };

  const handleEquipmentChange = (equipmentId) => {
    const equipo = equipos.find((item) => String(item.id) === String(equipmentId));
    setForm((prev) => ({
      ...prev,
      equipo_id: equipmentId,
      equipo_codigo: equipo?.codigo || '',
      equipo_descripcion: equipo?.descripcion || '',
      componente_id: '',
      componente_codigo: '',
      componente_nombre: '',
    }));
  };

  const handleComponentChange = (componentId) => {
    const component = componentOptions.find((item) => String(item.id) === String(componentId));
    setForm((prev) => ({
      ...prev,
      componente_id: componentId,
      componente_codigo: component?.codigo || '',
      componente_nombre: component?.path || '',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.equipo_id || !form.funcion.trim() || !form.modo_falla.trim() || !form.efecto_falla.trim() || !form.causa_falla.trim()) {
      window.alert('Completa equipo, funcion, modo de falla, efecto y causa.');
      return;
    }

    const payload = {
      ...form,
      funcion: form.funcion.trim(),
      modo_falla: form.modo_falla.trim(),
      efecto_falla: form.efecto_falla.trim(),
      causa_falla: form.causa_falla.trim(),
      controles_actuales: form.controles_actuales.trim(),
      deteccion_metodo: form.deteccion_metodo.trim(),
      accion_recomendada: form.accion_recomendada.trim(),
      responsable_accion: form.responsable_accion.trim(),
      severidad: Math.min(Math.max(toNumber(form.severidad), 1), 10),
      ocurrencia: Math.min(Math.max(toNumber(form.ocurrencia), 1), 10),
      deteccion: Math.min(Math.max(toNumber(form.deteccion), 1), 10),
    };

    if (editingId) {
      const next = items.map((item) => (String(item.id) === String(editingId) ? { ...item, ...payload } : item));
      await persist(next);
      setSelectedId(editingId);
    } else {
      const nextId = items.length ? Math.max(...items.map((item) => Number(item.id) || 0)) + 1 : 1;
      const nextItem = { ...payload, id: nextId };
      const next = [nextItem, ...items];
      await persist(next);
      setSelectedId(nextId);
    }

    resetForm();
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
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>AMEF</h1>
        <p style={{ color: '#6b7280' }}>Analisis de modo y efecto de falla por equipo o componente del despiece.</p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">Registros AMEF</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Equipos cubiertos</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{stats.coveredEquipment}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cobertura</div>
          <div className="stat-value" style={{ color: '#059669' }}>{stats.coverage}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">NPR critico</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{stats.criticalNpr}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Acciones pendientes</div>
          <div className="stat-value" style={{ color: '#c2410c' }}>{stats.pendingActions}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ maxWidth: '420px' }}
            placeholder="Buscar por equipo, componente, modo o causa de falla"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="form-select" style={{ maxWidth: '280px' }} value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)}>
            <option value="">Todos los equipos</option>
            {equipos.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.codigo} - {item.descripcion}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={handleNew}>Nuevo</button>
          <button type="button" className="btn btn-secondary" onClick={handleEdit} disabled={!selectedItem}>Editar</button>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={!selectedItem}>Eliminar</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1760px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Equipo', 'Componente', 'Funcion', 'Modo de falla', 'Efecto', 'Causa', 'S', 'O', 'D', 'NPR', 'Riesgo', 'Accion recomendada', 'Responsable', 'Estado'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f4f75', textAlign: 'left', padding: '.6rem .55rem', fontSize: '.82rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const npr = buildNpr(item);
              const riskMeta = getRiskMeta(npr);
              const isSelected = String(item.id) === String(selectedId);
              return (
                <tr key={item.id} onClick={() => setSelectedId(item.id)} style={{ background: isSelected ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{item.equipo_codigo} - {item.equipo_descripcion}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{item.componente_nombre || 'Equipo completo'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{item.funcion}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{item.modo_falla}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{item.efecto_falla}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{item.causa_falla}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem', textAlign: 'center' }}>{item.severidad}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem', textAlign: 'center' }}>{item.ocurrencia}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem', textAlign: 'center' }}>{item.deteccion}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem', fontWeight: 700 }}>{npr}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>
                    <span style={{ display: 'inline-flex', padding: '.2rem .55rem', borderRadius: '999px', background: riskMeta.bg, color: riskMeta.color, fontWeight: 700, fontSize: '.78rem' }}>
                      {riskMeta.label}
                    </span>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{item.accion_recomendada || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{item.responsable_accion || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.55rem' }}>{item.estado_accion || 'Pendiente'}</td>
                </tr>
              );
            })}
            {!filteredItems.length && (
              <tr>
                <td colSpan={14} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                  No hay registros AMEF para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '.8rem' }}>{editingId ? 'Editar registro AMEF' : 'Registrar AMEF'}</h2>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Equipo *</label>
            <select className="form-select" value={form.equipo_id} onChange={(e) => handleEquipmentChange(e.target.value)} required>
              <option value="">Selecciona equipo...</option>
              {equipos.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.codigo} - {item.descripcion}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Componente</label>
            <select className="form-select" value={form.componente_id} onChange={(e) => handleComponentChange(e.target.value)} disabled={!form.equipo_id}>
              <option value="">Equipo completo</option>
              {componentOptions.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.codigo ? `${item.codigo} | ` : ''}{item.path}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Funcion *</label>
            <input className="form-input" value={form.funcion} onChange={(e) => setForm({ ...form, funcion: e.target.value })} required />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Modo de falla *</label>
            <input className="form-input" value={form.modo_falla} onChange={(e) => setForm({ ...form, modo_falla: e.target.value })} required />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Efecto de falla *</label>
            <input className="form-input" value={form.efecto_falla} onChange={(e) => setForm({ ...form, efecto_falla: e.target.value })} required />
          </div>

          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Causa de falla *</label>
            <textarea className="form-textarea" value={form.causa_falla} onChange={(e) => setForm({ ...form, causa_falla: e.target.value })} required />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Severidad (1-10)</label>
            <input type="number" min="1" max="10" className="form-input" value={form.severidad} onChange={(e) => setForm({ ...form, severidad: e.target.value })} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Ocurrencia (1-10)</label>
            <input type="number" min="1" max="10" className="form-input" value={form.ocurrencia} onChange={(e) => setForm({ ...form, ocurrencia: e.target.value })} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Deteccion (1-10)</label>
            <input type="number" min="1" max="10" className="form-input" value={form.deteccion} onChange={(e) => setForm({ ...form, deteccion: e.target.value })} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">NPR</label>
            <input className="form-input" value={buildNpr(form)} readOnly />
          </div>

          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Controles actuales</label>
            <textarea className="form-textarea" value={form.controles_actuales} onChange={(e) => setForm({ ...form, controles_actuales: e.target.value })} />
          </div>

          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Metodo de deteccion</label>
            <textarea className="form-textarea" value={form.deteccion_metodo} onChange={(e) => setForm({ ...form, deteccion_metodo: e.target.value })} />
          </div>

          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Accion recomendada</label>
            <textarea className="form-textarea" value={form.accion_recomendada} onChange={(e) => setForm({ ...form, accion_recomendada: e.target.value })} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Responsable de accion</label>
            <input className="form-input" value={form.responsable_accion} onChange={(e) => setForm({ ...form, responsable_accion: e.target.value })} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fecha compromiso</label>
            <input type="date" className="form-input" value={form.fecha_compromiso} onChange={(e) => setForm({ ...form, fecha_compromiso: e.target.value })} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Estado accion</label>
            <select className="form-select" value={form.estado_accion} onChange={(e) => setForm({ ...form, estado_accion: e.target.value })}>
              {ACTION_STATUS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '.65rem', marginTop: '.2rem' }}>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Limpiar</button>
            <button type="submit" className="btn btn-primary">{editingId ? 'Actualizar AMEF' : 'Registrar AMEF'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
