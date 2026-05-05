import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { isReadOnlyRole } from '../utils/roleAccess';
import { filterRowsByColumns } from '../utils/tableFilters';

const EQUIPOS_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const BAJAS_HISTORY_KEY = SHARED_DOCUMENT_KEYS.bajasHistory;

export default function PmpBajas() {
  const { user } = useAuth();
  const isReadOnly = isReadOnlyRole(user);
  const [equipos, setEquipos] = useState([]);
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');
  const [codigo, setCodigo] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadSharedDocument(EQUIPOS_KEY, []).then((data) => {
      if (!active) return;
      setEquipos(Array.isArray(data) ? data : []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const selected = useMemo(() => equipos.find((e) => e.id === selectedId) || null, [equipos, selectedId]);
  const nodes = selected?.despiece || [];
  const uniqueAreas = useMemo(
    () => Array.from(new Set(equipos.map((e) => e.area_trabajo).filter(Boolean))).sort(),
    [equipos],
  );

  const filtered = useMemo(() => equipos.filter((eq) => {
    const matchQ = !q || `${eq.codigo} ${eq.descripcion}`.toLowerCase().includes(q.toLowerCase());
    const matchArea = !area || eq.area_trabajo === area;
    const matchCodigo = !codigo || (eq.codigo || '').toLowerCase().includes(codigo.toLowerCase());
    return matchQ && matchArea && matchCodigo;
  }), [equipos, q, area, codigo]);
  const bajasTableColumns = useMemo(() => ([
    { id: 'codigo', getValue: (eq) => eq.codigo },
    { id: 'descripcion', getValue: (eq) => eq.descripcion },
    { id: 'area', getValue: (eq) => eq.area_trabajo || '—' },
    { id: 'marca', getValue: (eq) => eq.marca || '—' },
    { id: 'estado', getValue: (eq) => eq.estado || '—' },
    { id: 'accion', filterable: false },
  ]), []);
  const { filters: bajasFilters, setFilter: setBajasFilter } = useTableColumnFilters(bajasTableColumns);
  const visibleRows = useMemo(
    () => filterRowsByColumns(filtered, bajasTableColumns, bajasFilters),
    [filtered, bajasTableColumns, bajasFilters],
  );

  const persistEquipos = async (next) => {
    if (isReadOnly) return;
    setEquipos(next);
    await saveSharedDocument(EQUIPOS_KEY, next);
  };

  const saveHistory = async (entry) => {
    if (isReadOnly) return;
    const prev = await loadSharedDocument(BAJAS_HISTORY_KEY, []);
    await saveSharedDocument(BAJAS_HISTORY_KEY, [entry, ...prev]);
  };

  const downTotal = async () => {
    if (isReadOnly) return;
    if (!selected) return;
    if (!window.confirm(`¿Dar de baja TOTAL al equipo ${selected.codigo} incluyendo todos sus subniveles?`)) return;
    const removedLevels = (selected.despiece || []).length;
    const next = equipos.filter((eq) => eq.id !== selected.id);
    await persistEquipos(next);
    await saveHistory({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fecha: new Date().toISOString(),
      tipo: 'TOTAL',
      equipo: selected.codigo,
      descripcion: selected.descripcion,
      subequipo: 'Equipo completo',
      nivelesAfectados: removedLevels + 1,
    });
    setSelectedId(null);
  };

  const getSubtreeIds = (rootId, source) => {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of source) {
        if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
          ids.add(node.id);
          changed = true;
        }
      }
    }
    return ids;
  };

  const downPartial = async () => {
    if (isReadOnly) return;
    if (!selected || !selectedNodeId) return;
    const targetNode = nodes.find((n) => n.id === selectedNodeId);
    if (!targetNode) return;
    if (!window.confirm(`¿Dar de baja PARCIAL al subequipo ${targetNode.nombre} y sus subniveles?`)) return;
    const ids = getSubtreeIds(targetNode.id, nodes);
    const newNodes = nodes.filter((node) => !ids.has(node.id));
    const next = equipos.map((eq) => (eq.id === selected.id ? { ...eq, despiece: newNodes } : eq));
    await persistEquipos(next);
    await saveHistory({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fecha: new Date().toISOString(),
      tipo: 'PARCIAL',
      equipo: selected.codigo,
      descripcion: selected.descripcion,
      subequipo: `${targetNode.codigo_sub || '-'} ${targetNode.nombre}`,
      nivelesAfectados: ids.size,
    });
    setSelectedNodeId('');
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
      {isReadOnly && (
        <ReadOnlyAccessNotice message="Puedes revisar equipos dados de baja y su estructura, pero este perfil no puede ejecutar bajas totales ni parciales." />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Bajas de equipos</h1>
          <p style={{ color: '#6b7280' }}>Dar de baja total o parcial con trazabilidad.</p>
        </div>
        <Link to="/pmp/bajas/historial" className="btn btn-secondary">Ver historial de bajas</Link>
      </div>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '.7rem' }}>
          <input className="form-input" placeholder="Buscar por código o descripción..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="form-select" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas las áreas</option>
            {uniqueAreas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="form-input" placeholder="Filtro por código" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Código', 'Descripción', 'Área', 'Marca', 'Estado', 'Acción'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f4f75', textAlign: 'left', padding: '.55rem .5rem' }}>{h}</th>
              ))}
            </tr>
            <TableFilterRow columns={bajasTableColumns} rows={filtered} filters={bajasFilters} onChange={setBajasFilter} dark />
          </thead>
          <tbody>
            {visibleRows.map((eq) => (
              <tr key={eq.id} style={{ background: selectedId === eq.id ? '#dbeafe' : '#fff' }}>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{eq.codigo}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{eq.descripcion}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{eq.area_trabajo || '—'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{eq.marca || '—'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{eq.estado || '—'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setSelectedId(eq.id)}>Seleccionar</button>
                </td>
              </tr>
            ))}
            {!visibleRows.length && (
              <tr>
                <td colSpan={6} style={{ border: '1px solid #e5e7eb', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                  No hay equipos que coincidan con los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card">
          <h2 style={{ marginBottom: '.75rem', fontSize: '1.2rem' }}>Equipo seleccionado: {selected.codigo} - {selected.descripcion}</h2>
          {!isReadOnly && (
            <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap', marginBottom: '.85rem' }}>
              <button type="button" className="btn btn-danger" onClick={downTotal}>Dar de baja total</button>
            </div>
          )}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '.85rem' }}>
            <h3 style={{ marginBottom: '.6rem', fontSize: '1rem' }}>Dar de baja parcial</h3>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="form-select" style={{ minWidth: '320px', maxWidth: '520px' }} value={selectedNodeId} onChange={(e) => setSelectedNodeId(e.target.value)}>
                <option value="">Selecciona subnivel...</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.codigo_sub || '-'} | {n.nombre}</option>
                ))}
              </select>
              {!isReadOnly && <button type="button" className="btn btn-danger" onClick={downPartial} disabled={!selectedNodeId}>Dar de baja parcial</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
