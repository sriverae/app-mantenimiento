import React, { useEffect, useMemo, useState } from 'react';

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

const STORAGE_KEYS = {
  columns: 'pmp_equipos_columns_v1',
  equipos: 'pmp_equipos_items_v1',
};

function getStoredJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

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
  const [columns, setColumns] = useState(() => getStoredJSON(STORAGE_KEYS.columns, BASE_COLUMNS));
  const [equipos, setEquipos] = useState(() => getStoredJSON(STORAGE_KEYS.equipos, INITIAL_EQUIPOS));
  const [selectedId, setSelectedId] = useState(INITIAL_EQUIPOS[0]?.id ?? null);
  const [showEquipoModal, setShowEquipoModal] = useState(false);
  const [showColModal, setShowColModal] = useState(false);
  const [showRemoveColModal, setShowRemoveColModal] = useState(false);
  const [showDespieceModal, setShowDespieceModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [columnToRemove, setColumnToRemove] = useState(BASE_COLUMNS[0].key);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [despieceTargetId, setDespieceTargetId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [formMode, setFormMode] = useState('add'); // add | edit
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeDetails, setNewNodeDetails] = useState('');
  const [newFeatureDesc, setNewFeatureDesc] = useState('');
  const [newFeatureValue, setNewFeatureValue] = useState('');
  const [draftFeatures, setDraftFeatures] = useState([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.columns, JSON.stringify(columns));
  }, [columns]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.equipos, JSON.stringify(equipos));
  }, [equipos]);

  useEffect(() => {
    if (!columns.some((col) => col.key === columnToRemove)) {
      setColumnToRemove(columns[0]?.key || '');
    }
  }, [columns, columnToRemove]);

  const selectedEquipo = useMemo(() => equipos.find((e) => e.id === selectedId) || null, [equipos, selectedId]);
  const despieceTarget = useMemo(() => equipos.find((e) => e.id === despieceTargetId) || null, [equipos, despieceTargetId]);
  const despieceNodes = despieceTarget?.despiece || [];
  const selectedNode = despieceNodes.find((n) => n.id === selectedNodeId) || null;

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

  const openDespiece = (equipo) => {
    setDespieceTargetId(equipo.id);
    setSelectedNodeId(null); // null = raíz (Nivel 1 / equipo)
    setFormMode('add');
    setNewNodeName('');
    setNewNodeDetails('');
    setDraftFeatures([]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
    setShowDespieceModal(true);
  };

  const getNodeById = (nodeId) => despieceNodes.find((n) => n.id === nodeId) || null;

  const getNextChildCode = (parentId) => {
    if (!despieceTarget) return '';
    const parentCode = parentId ? (getNodeById(parentId)?.codigo_sub || despieceTarget.codigo || 'EQ') : (despieceTarget.codigo || 'EQ');
    const siblings = despieceNodes.filter((n) => n.parentId === parentId).length;
    return `${parentCode}-${siblings + 1}`;
  };

  const addDraftFeature = () => {
    const descripcion = newFeatureDesc.trim();
    const valor = newFeatureValue.trim();
    if (!descripcion || !valor) return;
    setDraftFeatures((prev) => [...prev, { descripcion, valor }]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
  };

  const removeDraftFeature = (index) => {
    setDraftFeatures((prev) => prev.filter((_, i) => i !== index));
  };

  const addDespieceNode = (e) => {
    e.preventDefault();
    if (!despieceTarget || !newNodeName.trim()) return;
    const node = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      parentId: selectedNodeId,
      codigo_sub: getNextChildCode(selectedNodeId),
      nombre: newNodeName.trim(),
      detalle: newNodeDetails.trim(),
      caracteristicas: draftFeatures,
    };
    setEquipos((prev) => prev.map((eq) => (
      eq.id === despieceTarget.id
        ? { ...eq, despiece: [...(eq.despiece || []), node] }
        : eq
    )));
    setSelectedNodeId(node.id);
    setFormMode('add');
    setNewNodeName('');
    setNewNodeDetails('');
    setDraftFeatures([]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
  };

  const loadSelectedNodeForEdit = () => {
    if (!selectedNode) return;
    setFormMode('edit');
    setNewNodeName(selectedNode.nombre || '');
    setNewNodeDetails(selectedNode.detalle || '');
    setDraftFeatures(Array.isArray(selectedNode.caracteristicas) ? selectedNode.caracteristicas : []);
  };

  const updateSelectedNode = (e) => {
    e.preventDefault();
    if (!despieceTarget || !selectedNode || !newNodeName.trim()) return;
    setEquipos((prev) => prev.map((eq) => {
      if (eq.id !== despieceTarget.id) return eq;
      return {
        ...eq,
        despiece: (eq.despiece || []).map((node) => (
          node.id === selectedNode.id
            ? { ...node, nombre: newNodeName.trim(), detalle: newNodeDetails.trim(), caracteristicas: draftFeatures }
            : node
        )),
      };
    }));
    setFormMode('add');
    setNewNodeName('');
    setNewNodeDetails('');
    setDraftFeatures([]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
  };

  const deleteSelectedNode = () => {
    if (!despieceTarget || !selectedNode) return;
    if (!window.confirm(`¿Eliminar nivel ${selectedNode.nombre} y sus subniveles?`)) return;
    const toDelete = new Set([selectedNode.id]);
    let changed = true;
    while (changed) {
      changed = false;
      despieceNodes.forEach((node) => {
        if (node.parentId && toDelete.has(node.parentId) && !toDelete.has(node.id)) {
          toDelete.add(node.id);
          changed = true;
        }
      });
    }
    setEquipos((prev) => prev.map((eq) => (
      eq.id === despieceTarget.id
        ? { ...eq, despiece: (eq.despiece || []).filter((node) => !toDelete.has(node.id)) }
        : eq
    )));
    setSelectedNodeId(null);
    setFormMode('add');
    setNewNodeName('');
    setNewNodeDetails('');
    setDraftFeatures([]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
  };

  const renderTree = (parentId = null, level = 2) => {
    const nodes = despieceNodes.filter((n) => n.parentId === parentId);
    if (!nodes.length) return null;
    return (
      <ul style={{ listStyle: 'none', margin: 0, paddingLeft: level === 2 ? '.35rem' : '1rem' }}>
        {nodes.map((node) => (
          <li key={node.id} style={{ marginBottom: '.35rem' }}>
            <button
              type="button"
              onClick={() => setSelectedNodeId(node.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                border: '1px solid #d1d5db',
                borderRadius: '.45rem',
                padding: '.48rem .55rem',
                background: selectedNodeId === node.id ? '#dbeafe' : '#fff',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '.76rem', color: '#6b7280', marginBottom: '.2rem' }}>Nivel {level}</div>
              <div style={{ fontWeight: 700 }}>{node.nombre}</div>
              {node.codigo_sub && <div style={{ fontSize: '.75rem', color: '#1d4ed8', fontWeight: 700 }}>Código: {node.codigo_sub}</div>}
              {node.detalle && <div style={{ fontSize: '.8rem', color: '#6b7280' }}>{node.detalle}</div>}
              {Array.isArray(node.caracteristicas) && node.caracteristicas.length > 0 && (
                <div style={{ marginTop: '.3rem', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
                  {node.caracteristicas.map((item, index) => (
                    <span key={`${node.id}-feat-${index}`} style={{ fontSize: '.75rem', color: '#4b5563' }}>
                      • {item.descripcion}: {item.valor}
                    </span>
                  ))}
                </div>
              )}
            </button>
            {renderTree(node.id, level + 1)}
          </li>
        ))}
      </ul>
    );
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
              <th style={{ border: '1px solid #2f4f75', textAlign: 'left', padding: '.65rem .55rem', fontSize: '.82rem', whiteSpace: 'nowrap' }}>
                Despiece
              </th>
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
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem', whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); openDespiece(equipo); }}>
                    Despiece
                  </button>
                </td>
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

      {showDespieceModal && despieceTarget && (
        <Modal title={`Despiece de máquina - ${despieceTarget.descripcion || despieceTarget.codigo}`} maxWidth="980px">
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '1rem' }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '.7rem', padding: '.8rem' }}>
              <div style={{ marginBottom: '.7rem', padding: '.55rem .65rem', borderRadius: '.5rem', background: selectedNodeId === null ? '#dbeafe' : '#f9fafb', border: '1px solid #d1d5db', cursor: 'pointer' }} onClick={() => setSelectedNodeId(null)}>
                <div style={{ fontSize: '.78rem', color: '#6b7280' }}>Nivel 1</div>
                <div style={{ fontWeight: 700 }}>{despieceTarget.descripcion || despieceTarget.codigo}</div>
              </div>
              {despieceNodes.length ? renderTree(null, 2) : (
                <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Aún no hay subniveles creados para este equipo.</p>
              )}
            </div>

            <form onSubmit={formMode === 'edit' ? updateSelectedNode : addDespieceNode} style={{ border: '1px solid #e5e7eb', borderRadius: '.7rem', padding: '.85rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '.75rem' }}>
                {formMode === 'edit' ? 'Editar nivel seleccionado' : `Agregar nivel ${selectedNodeId ? 'hijo' : 'desde Nivel 1'}`}
              </h4>
              <p style={{ fontSize: '.8rem', color: '#6b7280', marginBottom: '.55rem' }}>
                Código del nuevo subequipo: <strong>{formMode === 'add' ? getNextChildCode(selectedNodeId) : (selectedNode?.codigo_sub || 'N/A')}</strong>
              </p>
              <div className="form-group" style={{ marginBottom: '.7rem' }}>
                <label className="form-label">Nombre del componente *</label>
                <input className="form-input" value={newNodeName} onChange={(e) => setNewNodeName(e.target.value)} placeholder="Ej: Motor principal, Rodaje, Faja" required />
              </div>
              <div className="form-group" style={{ marginBottom: '.7rem' }}>
                <label className="form-label">Nota general (opcional)</label>
                <textarea className="form-textarea" value={newNodeDetails} onChange={(e) => setNewNodeDetails(e.target.value)} placeholder="Ej: 15 kW, 1750 rpm, marca ABB..." />
              </div>
              <div className="form-group" style={{ marginBottom: '.6rem' }}>
                <label className="form-label">Agregar característica</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '.45rem' }}>
                  <input className="form-input" value={newFeatureDesc} onChange={(e) => setNewFeatureDesc(e.target.value)} placeholder="Descripción (ej: Potencia)" />
                  <input className="form-input" value={newFeatureValue} onChange={(e) => setNewFeatureValue(e.target.value)} placeholder="Valor (ej: 15 kW)" />
                  <button type="button" className="btn btn-secondary" onClick={addDraftFeature}>Agregar</button>
                </div>
              </div>
              {draftFeatures.length > 0 && (
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '.55rem', padding: '.55rem', marginBottom: '.75rem' }}>
                  {draftFeatures.map((item, index) => (
                    <div key={`draft-feature-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.84rem', padding: '.2rem 0' }}>
                      <span>{item.descripcion}: <strong>{item.valor}</strong></span>
                      <button type="button" onClick={() => removeDraftFeature(index)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>Quitar</button>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.9rem' }}>
                Selecciona un nivel en el árbol y luego usa “Agregar nivel” para crear el subnivel (por ejemplo motor → rodajes).
              </p>
              <div style={{ display: 'flex', gap: '.55rem', marginBottom: '.9rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={loadSelectedNodeForEdit} disabled={!selectedNodeId}>Modificar nivel seleccionado</button>
                <button type="button" className="btn btn-danger" onClick={deleteSelectedNode} disabled={!selectedNodeId}>Eliminar nivel seleccionado</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDespieceModal(false)}>Cerrar</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setFormMode('add'); setNewNodeName(''); setNewNodeDetails(''); setDraftFeatures([]); setNewFeatureDesc(''); setNewFeatureValue(''); }}>
                  Nuevo subnivel
                </button>
                <button type="submit" className="btn btn-primary">
                  {formMode === 'edit' ? 'Guardar cambios nivel' : 'Agregar nivel'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
