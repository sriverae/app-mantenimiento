import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfigurableSelectField from '../components/ConfigurableSelectField';
import useConfigurableLists from '../hooks/useConfigurableLists';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { isReadOnlyRole } from '../utils/roleAccess';
import { formatDateDisplay } from '../utils/dateFormat';
import { filterRowsByColumns } from '../utils/tableFilters';
import { validateTextFields } from '../utils/formValidation';

const AMEF_KEY = SHARED_DOCUMENT_KEYS.amef;
const EQUIPOS_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const COMPONENT_FUNCTIONS_KEY = SHARED_DOCUMENT_KEYS.amefComponentFunctions;
const ACTION_STATUS = ['Pendiente', 'En proceso', 'Implementada', 'Cerrada'];

const EMPTY_FORM = {
  equipo_id: '',
  equipo_codigo: '',
  equipo_descripcion: '',
  equipo_area: '',
  componente_id: '',
  componente_codigo: '',
  componente_nombre: '',
  componente_nivel: 1,
  funcion: '',
  modo_falla: '',
  efecto_falla: '',
  efectos: [],
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

const createCauseDraft = (value = '') => ({
  id: `cause_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  causa: value,
  severidad: 1,
  ocurrencia: 1,
  deteccion: 1,
  controles_actuales: '',
  deteccion_metodo: '',
  accion_recomendada: '',
  responsable_accion: '',
  fecha_compromiso: '',
  estado_accion: 'Pendiente',
});

const createEffectDraft = () => ({
  id: `eff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  efecto: '',
  causas: [createCauseDraft()],
});

function normalizeCause(cause, item = {}, effectIndex = 0, causeIndex = 0) {
  const source = typeof cause === 'object' && cause !== null ? cause : { causa: String(cause || '') };
  return {
    id: source.id || `cause_${effectIndex + 1}_${causeIndex + 1}`,
    causa: source.causa || source.descripcion || '',
    severidad: clampScale(source.severidad ?? item?.severidad),
    ocurrencia: clampScale(source.ocurrencia ?? item?.ocurrencia),
    deteccion: clampScale(source.deteccion ?? item?.deteccion),
    controles_actuales: source.controles_actuales ?? item?.controles_actuales ?? '',
    deteccion_metodo: source.deteccion_metodo ?? item?.deteccion_metodo ?? '',
    accion_recomendada: source.accion_recomendada ?? item?.accion_recomendada ?? '',
    responsable_accion: source.responsable_accion ?? item?.responsable_accion ?? '',
    fecha_compromiso: source.fecha_compromiso ?? item?.fecha_compromiso ?? '',
    estado_accion: source.estado_accion ?? item?.estado_accion ?? 'Pendiente',
  };
}

function normalizeEffects(item) {
  if (Array.isArray(item?.efectos) && item.efectos.length) {
    return item.efectos.map((effect, index) => ({
      id: effect.id || `eff_${index + 1}`,
      efecto: effect.efecto || effect.descripcion || '',
      causas: Array.isArray(effect.causas) && effect.causas.length
        ? effect.causas.map((cause, causeIndex) => normalizeCause(cause, item, index, causeIndex))
        : [createCauseDraft()],
    }));
  }
  return [{
    id: 'eff_legacy_1',
    efecto: item?.efecto_falla || '',
    causas: item?.causa_falla ? [normalizeCause(item.causa_falla, item)] : [createCauseDraft()],
  }];
}

function flattenEffectsForDisplay(efectos = []) {
  return (Array.isArray(efectos) ? efectos : [])
    .map((effect) => {
      const causas = (Array.isArray(effect.causas) ? effect.causas : []).map((cause) => (typeof cause === 'object' ? cause.causa : cause)).filter((cause) => safeText(cause));
      return `${effect.efecto || 'Sin efecto'}${causas.length ? ` (${causas.join('; ')})` : ''}`;
    })
    .join(' | ');
}

function flattenCauseField(efectos = [], field) {
  return (Array.isArray(efectos) ? efectos : [])
    .flatMap((effect) => (Array.isArray(effect.causas) ? effect.causas : []))
    .map((cause) => (typeof cause === 'object' ? cause[field] : ''))
    .filter((value) => safeText(value))
    .join(' | ');
}

function flattenAmefCauseRows(items = []) {
  return items.flatMap((item) => {
    const efectos = Array.isArray(item.efectos) && item.efectos.length ? item.efectos : normalizeEffects(item);
    return efectos.flatMap((effect, effectIndex) => {
      const causas = Array.isArray(effect.causas) && effect.causas.length ? effect.causas : [createCauseDraft('')];
      return causas.map((cause, causeIndex) => {
        const causeObj = normalizeCause(cause, item, effectIndex, causeIndex);
        return {
          ...item,
          rowId: `${item.id || 'amef'}__${effect.id || effectIndex}__${causeObj.id || causeIndex}`,
          sourceItem: item,
          efecto_falla: effect.efecto || '',
          causa_falla: causeObj.causa || '',
          severidad: causeObj.severidad,
          ocurrencia: causeObj.ocurrencia,
          deteccion: causeObj.deteccion,
          controles_actuales: causeObj.controles_actuales,
          deteccion_metodo: causeObj.deteccion_metodo,
          accion_recomendada: causeObj.accion_recomendada,
          responsable_accion: causeObj.responsable_accion,
          fecha_compromiso: causeObj.fecha_compromiso,
          estado_accion: causeObj.estado_accion,
          npr_causa: buildCauseNpr(causeObj),
        };
      });
    });
  });
}

const RISK_META = {
  Critico: { label: 'Critico', bg: '#fef2f2', border: '#fecaca', color: '#dc2626' },
  Alto: { label: 'Alto', bg: '#fff7ed', border: '#fdba74', color: '#c2410c' },
  Medio: { label: 'Medio', bg: '#eff6ff', border: '#bfdbfe', color: '#2563eb' },
  Bajo: { label: 'Bajo', bg: '#ecfdf5', border: '#86efac', color: '#059669' },
};

function safeText(value) {
  return String(value || '').trim();
}

function clampScale(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(Math.round(parsed), 1), 10);
}

function buildNpr(item) {
  const causeNprs = (Array.isArray(item?.efectos) ? item.efectos : [])
    .flatMap((effect) => (Array.isArray(effect.causas) ? effect.causas : []))
    .map((cause) => (typeof cause === 'object' ? buildCauseNpr(cause) : 0))
    .filter((value) => value > 0);
  if (causeNprs.length) return Math.max(...causeNprs);
  return clampScale(item.severidad) * clampScale(item.ocurrencia) * clampScale(item.deteccion);
}

function getRiskMeta(npr) {
  if (npr >= 200) return RISK_META.Critico;
  if (npr >= 100) return RISK_META.Alto;
  if (npr >= 50) return RISK_META.Medio;
  return RISK_META.Bajo;
}

function buildCauseNpr(cause = {}) {
  return clampScale(cause.severidad) * clampScale(cause.ocurrencia) * clampScale(cause.deteccion);
}

function normalizeEquipos(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: item.id ?? `eq_${index}_${item.codigo || 'sin_codigo'}`,
    codigo: item.codigo || '',
    descripcion: item.descripcion || '',
    area_trabajo: item.area_trabajo || '',
    criticidad: item.criticidad || 'Media',
    despiece: Array.isArray(item.despiece) ? item.despiece : [],
    ...item,
  }));
}

function buildEquipmentTree(equipo) {
  if (!equipo) return [];
  const rootId = `root_${equipo.id}`;
  const nodes = Array.isArray(equipo.despiece) ? equipo.despiece : [];
  const childrenByParent = new Map();

  nodes.forEach((node) => {
    const key = node.parentId || rootId;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(node);
  });

  const flatten = (parentId, level, pathPrefix) => {
    const branch = (childrenByParent.get(parentId) || [])
      .slice()
      .sort((a, b) => String(a.codigo_sub || a.nombre || '').localeCompare(String(b.codigo_sub || b.nombre || '')));

    return branch.flatMap((node) => {
      const path = pathPrefix ? `${pathPrefix} > ${node.nombre}` : node.nombre;
      const line = {
        id: String(node.id),
        parentId: String(node.parentId || rootId),
        codigo: node.codigo_sub || '',
        nombre: node.nombre || '',
        path,
        nivel: level,
        detalle: node.detalle || node.detalles || '',
        caracteristicas: Array.isArray(node.caracteristicas) ? node.caracteristicas : [],
        tipo_nodo: node.tipo_nodo || 'componente',
        raw: node,
      };
      return [line, ...flatten(String(node.id), level + 1, path)];
    });
  };

  const root = {
    id: rootId,
    parentId: '',
    codigo: equipo.codigo || '',
    nombre: equipo.descripcion || equipo.codigo || 'Equipo completo',
    path: equipo.descripcion || equipo.codigo || 'Equipo completo',
    nivel: 1,
    detalle: '',
    caracteristicas: [],
    tipo_nodo: 'equipo',
    raw: null,
    isRoot: true,
  };

  return [root, ...flatten(rootId, 2, root.path)];
}

function collectDescendantIds(treeNodes, nodeId) {
  const ids = new Set([String(nodeId)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of treeNodes) {
      if (ids.has(String(node.parentId || '')) && !ids.has(String(node.id))) {
        ids.add(String(node.id));
        changed = true;
      }
    }
  }
  return ids;
}

function buildTreeLines(treeNodes, parentId = '', expandedNodes = {}) {
  const children = treeNodes
    .filter((node) => String(node.parentId || '') === String(parentId || ''))
    .sort((a, b) => Number(a.nivel) - Number(b.nivel) || String(a.codigo || a.nombre).localeCompare(String(b.codigo || b.nombre)));

  return children.flatMap((node) => {
    const descendants = buildTreeLines(treeNodes, node.id, expandedNodes);
    const expanded = expandedNodes[String(node.id)] !== false;
    return [
      { node, expanded, hasChildren: descendants.length > 0 },
      ...(expanded ? descendants : []),
    ];
  });
}

function normalizeItem(item, equipos) {
  const equipo = equipos.find((entry) => String(entry.id) === String(item?.equipo_id));
  const tree = buildEquipmentTree(equipo);
  const root = tree[0];
  const selectedNode = tree.find((node) => String(node.id) === String(item?.componente_id)) || root;

  return {
    ...item,
    id: item?.id ?? `amef_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    equipo_id: item?.equipo_id || equipo?.id || '',
    equipo_codigo: item?.equipo_codigo || equipo?.codigo || '',
    equipo_descripcion: item?.equipo_descripcion || equipo?.descripcion || '',
    equipo_area: item?.equipo_area || equipo?.area_trabajo || '',
    componente_id: item?.componente_id || selectedNode?.id || '',
    componente_codigo: item?.componente_codigo || selectedNode?.codigo || '',
    componente_nombre: item?.componente_nombre || selectedNode?.path || '',
    componente_nivel: Number(item?.componente_nivel) || selectedNode?.nivel || 1,
    funcion: item?.funcion || '',
    modo_falla: item?.modo_falla || '',
    efecto_falla: item?.efecto_falla || '',
    efectos: normalizeEffects(item),
    severidad: clampScale(item?.severidad),
    causa_falla: item?.causa_falla || '',
    ocurrencia: clampScale(item?.ocurrencia),
    controles_actuales: item?.controles_actuales || '',
    deteccion_metodo: item?.deteccion_metodo || '',
    deteccion: clampScale(item?.deteccion),
    accion_recomendada: item?.accion_recomendada || '',
    responsable_accion: item?.responsable_accion || '',
    fecha_compromiso: item?.fecha_compromiso || '',
    estado_accion: item?.estado_accion || 'Pendiente',
  };
}

function TreeNodeRow({ line, selectedId, onSelect, onToggle }) {
  const { node, expanded, hasChildren } = line;
  const selected = String(selectedId || '') === String(node.id);
  const isComponent = node.tipo_nodo === 'componente';
  const nodeTypeLabel = node.isRoot ? 'Equipo' : isComponent ? 'Componente' : 'Sistema';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '34px 1fr',
        gap: '.45rem',
        marginLeft: `${Math.max(0, node.nivel - 1) * 12}px`,
      }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          style={{
            border: '1px solid #dbe4f0',
            borderRadius: '.7rem',
            background: '#fff',
            fontWeight: 800,
            color: '#334155',
            minHeight: '36px',
          }}
        >
          {expanded ? '−' : '+'}
        </button>
      ) : (
        <div />
      )}

      <button
        type="button"
        onClick={() => onSelect(node)}
        style={{
          border: selected ? '1px solid #2563eb' : '1px solid #dbe4f0',
          borderRadius: '.95rem',
          background: selected ? '#eff6ff' : '#fff',
          padding: '.8rem .9rem',
          textAlign: 'left',
          display: 'grid',
          gap: '.2rem',
        }}
      >
        <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: '#0f172a' }}>{node.nombre}</span>
          <span style={{ fontSize: '.75rem', fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '.15rem .45rem', borderRadius: '999px' }}>
            Nivel {node.nivel}
          </span>
          <span style={{ fontSize: '.75rem', fontWeight: 700, color: isComponent ? '#0f766e' : '#1d4ed8', background: isComponent ? '#f0fdfa' : '#eff6ff', padding: '.15rem .45rem', borderRadius: '999px' }}>
            {nodeTypeLabel}
          </span>
        </div>
        <div style={{ fontSize: '.82rem', color: '#64748b' }}>
          {node.codigo ? `${node.codigo} · ` : ''}{node.path}
        </div>
      </button>
    </div>
  );
}

function ScoreInput({ label, value, onChange, helper, disabled = false }) {
  return (
    <label className="form-label">
      {label}
      <input type="number" min="1" max="10" value={value} onChange={(e) => onChange(clampScale(e.target.value))} className="form-input" disabled={disabled} />
      {helper && <span style={{ display: 'block', marginTop: '.3rem', color: '#64748b', fontSize: '.78rem' }}>{helper}</span>}
    </label>
  );
}

function FailureModeTree({ items = [], selectedId, onSelect }) {
  if (!items.length) {
    return (
      <div style={{ padding: '1rem', borderRadius: '.95rem', border: '1px dashed #cbd5e1', color: '#64748b', textAlign: 'center' }}>
        No hay modos de falla registrados en este alcance.
      </div>
    );
  }

  const byComponent = new Map();
  items.forEach((item) => {
    const key = item.componente_id || item.componente_nombre || 'sin_componente';
    if (!byComponent.has(key)) {
      byComponent.set(key, {
        componentName: item.componente_nombre || 'Componente sin nombre',
        componentCode: item.componente_codigo || '',
        rows: [],
      });
    }
    byComponent.get(key).rows.push(item);
  });

  return (
    <div style={{ display: 'grid', gap: '.85rem' }}>
      {Array.from(byComponent.values()).map((group) => (
        <div key={group.componentName} style={{ border: '1px solid #dbe4f0', borderRadius: '.95rem', background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '.8rem .9rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>{group.componentName}</div>
            <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: '.15rem' }}>{group.componentCode || 'Sin codigo'} · {group.rows.length} modo(s)</div>
          </div>

          <div style={{ display: 'grid', gap: '.75rem', padding: '.85rem' }}>
            {group.rows.map((item) => {
              const npr = buildNpr(item);
              const meta = getRiskMeta(npr);
              const selected = selectedId === item.id;
              return (
                <div key={item.id} style={{ display: 'grid', gap: '.55rem' }}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    style={{
                      textAlign: 'left',
                      border: selected ? '1px solid #2563eb' : '1px solid #bfdbfe',
                      borderRadius: '.8rem',
                      background: selected ? '#eff6ff' : '#f8fbff',
                      padding: '.75rem .85rem',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#0f172a' }}>Modo: {item.modo_falla || 'Sin modo'}</strong>
                      <span style={{ padding: '.18rem .5rem', borderRadius: '999px', background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, fontWeight: 800, fontSize: '.78rem' }}>
                        NPR {npr}
                      </span>
                    </div>
                  </button>

                  <div style={{ display: 'grid', gap: '.45rem', paddingLeft: '1rem', borderLeft: '3px solid #dbeafe', marginLeft: '.75rem' }}>
                    {(Array.isArray(item.efectos) && item.efectos.length ? item.efectos : normalizeEffects(item)).map((effect, effectIndex) => (
                      <div key={effect.id || `${item.id}-effect-${effectIndex}`} style={{ display: 'grid', gap: '.35rem' }}>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '.7rem', padding: '.55rem .65rem', background: '#fff' }}>
                          <div style={{ color: '#475569', fontSize: '.78rem', fontWeight: 800, marginBottom: '.12rem' }}>Efecto {effectIndex + 1}</div>
                          <div style={{ color: '#0f172a', fontWeight: 700 }}>{effect.efecto || 'Sin efecto'}</div>
                        </div>
                        <div style={{ display: 'grid', gap: '.28rem', paddingLeft: '.9rem' }}>
                          {(Array.isArray(effect.causas) && effect.causas.length ? effect.causas : [createCauseDraft('Sin causa')]).map((cause, causeIndex) => {
                            const causeObj = typeof cause === 'object' ? cause : createCauseDraft(String(cause || 'Sin causa'));
                            const npr = buildCauseNpr(causeObj);
                            const meta = getRiskMeta(npr);
                            return (
                              <div key={`${item.id}-${effectIndex}-${causeIndex}`} style={{ border: '1px solid #fee2e2', borderRadius: '.65rem', padding: '.55rem .65rem', background: '#fff7f7', color: '#7f1d1d', fontSize: '.86rem', display: 'grid', gap: '.3rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'center' }}>
                                  <span><strong>Causa {causeIndex + 1}:</strong> {causeObj.causa || 'Sin causa'}</span>
                                  <span style={{ padding: '.12rem .45rem', borderRadius: '999px', background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, fontWeight: 800, fontSize: '.74rem' }}>NPR {npr}</span>
                                </div>
                                {causeObj.accion_recomendada && <div><strong>Accion:</strong> {causeObj.accion_recomendada}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PmpAmef({ matrixOnly = false }) {
  const { user } = useAuth();
  const {
    getOptions,
    addOptionQuickly,
    canManage: canManageConfigurableLists,
  } = useConfigurableLists();
  const isReadOnly = isReadOnlyRole(user);
  const [items, setItems] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [componentFunctions, setComponentFunctions] = useState({});
  const [componentFunctionDraft, setComponentFunctionDraft] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [expandedNodes, setExpandedNodes] = useState({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 980 : false));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setIsMobile(window.innerWidth < 980);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      setLoading(true);
      const [loadedItems, loadedEquipos, loadedFunctions] = await Promise.all([
        loadSharedDocument(AMEF_KEY, []),
        loadSharedDocument(EQUIPOS_KEY, []),
        loadSharedDocument(COMPONENT_FUNCTIONS_KEY, {}),
      ]);
      if (!active) return;
      const nextEquipos = normalizeEquipos(loadedEquipos);
      const nextItems = (Array.isArray(loadedItems) ? loadedItems : []).map((item) => normalizeItem(item, nextEquipos));
      const firstEquipmentId = nextEquipos[0]?.id ? String(nextEquipos[0].id) : '';
      setEquipos(nextEquipos);
      setItems(nextItems);
      setComponentFunctions(loadedFunctions && typeof loadedFunctions === 'object' && !Array.isArray(loadedFunctions) ? loadedFunctions : {});
      setSelectedEquipmentId(firstEquipmentId);
      setSelectedNodeId(firstEquipmentId ? `root_${firstEquipmentId}` : '');
      setSelectedId(nextItems[0]?.id || null);
      setLoading(false);
    };
    hydrate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loading || isReadOnly) return;
    saveSharedDocument(AMEF_KEY, items).catch((err) => {
      console.error('Error guardando matriz AMEF:', err);
      setError('No se pudo guardar la matriz AMEF en el servidor.');
    });
  }, [items, loading, isReadOnly]);

  useEffect(() => {
    if (loading || isReadOnly) return;
    saveSharedDocument(COMPONENT_FUNCTIONS_KEY, componentFunctions).catch((err) => {
      console.error('Error guardando funciones de componentes AMEF:', err);
      setError('No se pudo guardar la funcion del componente en el servidor.');
    });
  }, [componentFunctions, loading, isReadOnly]);

  const equipmentOptions = useMemo(
    () => equipos.map((item) => ({
      id: String(item.id),
      codigo: item.codigo || '',
      descripcion: item.descripcion || '',
      area: item.area_trabajo || '',
    })),
    [equipos],
  );
  const responsibleOptions = useMemo(
    () => getOptions('responsables', ['Mecanico', 'Electricista', 'Mecanicos', 'Ingeniero', 'Planner', 'Terceros']),
    [getOptions],
  );

  const selectedEquipment = useMemo(
    () => equipos.find((item) => String(item.id) === String(selectedEquipmentId)) || null,
    [equipos, selectedEquipmentId],
  );

  const selectedTree = useMemo(() => buildEquipmentTree(selectedEquipment), [selectedEquipment]);

  const selectedTreeLines = useMemo(
    () => buildTreeLines(selectedTree, '', expandedNodes),
    [selectedTree, expandedNodes],
  );

  const selectedNode = useMemo(
    () => selectedTree.find((node) => String(node.id) === String(selectedNodeId)) || selectedTree[0] || null,
    [selectedTree, selectedNodeId],
  );
  const selectedNodeIsComponent = selectedNode?.tipo_nodo === 'componente';
  const selectedComponentKey = selectedEquipmentId && selectedNodeId ? `${selectedEquipmentId}__${selectedNodeId}` : '';
  const selectedComponentFunction = selectedComponentKey
    ? (
      componentFunctions[selectedComponentKey]
      || items.find((item) => String(item.equipo_id) === String(selectedEquipmentId) && String(item.componente_id) === String(selectedNodeId) && safeText(item.funcion))?.funcion
      || ''
    )
    : '';

  useEffect(() => {
    setComponentFunctionDraft(selectedComponentFunction);
  }, [selectedComponentFunction, selectedComponentKey]);

  const scopedComponentIds = useMemo(
    () => (selectedNode ? collectDescendantIds(selectedTree, selectedNode.id) : new Set()),
    [selectedTree, selectedNode],
  );

  useEffect(() => {
    if (!selectedEquipmentId) {
      setSelectedNodeId('');
      return;
    }
    const rootId = `root_${selectedEquipmentId}`;
    const nodeExists = selectedTree.some((node) => String(node.id) === String(selectedNodeId));
    if (!nodeExists) {
      setSelectedNodeId(rootId);
    }
  }, [selectedEquipmentId, selectedTree, selectedNodeId]);

  const filteredItems = useMemo(() => {
    const search = safeText(query).toLowerCase();
    return items.filter((item) => {
      if (equipmentFilter && String(item.equipo_id) !== String(equipmentFilter)) return false;
      if (selectedEquipmentId && String(item.equipo_id) !== String(selectedEquipmentId)) return false;
      if (selectedNode && scopedComponentIds.size && !scopedComponentIds.has(String(item.componente_id))) return false;
      if (!search) return true;
      return [
        item.equipo_codigo,
        item.equipo_descripcion,
        item.equipo_area,
        item.componente_nombre,
        item.modo_falla,
        item.causa_falla,
        flattenEffectsForDisplay(item.efectos),
        item.accion_recomendada,
        item.responsable_accion,
      ].some((value) => String(value || '').toLowerCase().includes(search));
    });
  }, [items, query, equipmentFilter, selectedEquipmentId, selectedNode, scopedComponentIds]);
  const amefTableColumns = useMemo(() => [
    { id: 'equipo', label: 'Equipo', getValue: (item) => `${item.equipo_codigo || ''} ${item.equipo_descripcion || ''}` },
    { id: 'componente_nombre', label: 'Componente' },
    { id: 'modo_falla', label: 'Modo de falla' },
    { id: 'efecto_falla', label: 'Efecto' },
    { id: 'causa_falla', label: 'Causa raiz' },
    { id: 'severidad', label: 'S' },
    { id: 'ocurrencia', label: 'O' },
    { id: 'deteccion', label: 'D' },
    { id: 'npr', label: 'NPR', getValue: (item) => item.npr_causa ?? buildNpr(item) },
    { id: 'estado_accion', label: 'Estado' },
    { id: 'fecha_compromiso', label: 'Compromiso', getValue: (item) => formatDateDisplay(item.fecha_compromiso, 'N.A.') },
  ], []);
  const amefFilters = useTableColumnFilters(amefTableColumns);
  const filteredCauseRows = useMemo(() => flattenAmefCauseRows(filteredItems), [filteredItems]);
  const visibleAmefItems = useMemo(
    () => filterRowsByColumns(filteredCauseRows, amefTableColumns, amefFilters.filters),
    [filteredCauseRows, amefTableColumns, amefFilters.filters],
  );

  const selectedItem = useMemo(
    () => filteredItems.find((item) => item.id === selectedId) || items.find((item) => item.id === selectedId) || null,
    [filteredItems, items, selectedId],
  );

  const selectedNodeSummary = useMemo(() => {
    if (!selectedNode) return null;
    const source = items.filter((item) => String(item.equipo_id) === String(selectedEquipmentId));
    const scopedIds = collectDescendantIds(selectedTree, selectedNode.id);
    const scopedItems = source.filter((item) => scopedIds.has(String(item.componente_id)));
    return {
      total: scopedItems.length,
      critical: scopedItems.filter((item) => buildNpr(item) >= 200).length,
      pending: scopedItems.filter((item) => (Array.isArray(item.efectos) ? item.efectos : []).some((effect) => (
        (Array.isArray(effect.causas) ? effect.causas : []).some((cause) => (typeof cause === 'object' ? cause.estado_accion : item.estado_accion) !== 'Cerrada')
      ))).length,
    };
  }, [items, selectedEquipmentId, selectedTree, selectedNode]);

  const equipmentFailureModes = useMemo(() => {
    const source = items
      .filter((item) => String(item.equipo_id) === String(selectedEquipmentId))
      .filter((item) => safeText(item.modo_falla));
    return source
      .slice()
      .sort((a, b) => String(a.componente_nombre || '').localeCompare(String(b.componente_nombre || ''))
        || String(a.modo_falla || '').localeCompare(String(b.modo_falla || '')));
  }, [items, selectedEquipmentId]);

  const selectedComponentFailureModes = useMemo(
    () => equipmentFailureModes.filter((item) => String(item.componente_id) === String(selectedNodeId)),
    [equipmentFailureModes, selectedNodeId],
  );
  const displayedFailureModes = useMemo(() => {
    const search = safeText(query).toLowerCase();
    const source = selectedNodeIsComponent ? selectedComponentFailureModes : equipmentFailureModes;
    if (!search) return source;
    return source.filter((item) => [
      item.componente_nombre,
      item.modo_falla,
      item.causa_falla,
      flattenEffectsForDisplay(item.efectos),
      item.accion_recomendada,
    ].some((value) => String(value || '').toLowerCase().includes(search)));
  }, [equipmentFailureModes, query, selectedComponentFailureModes, selectedNodeIsComponent]);

  const resetForm = (equipmentId = selectedEquipmentId, nodeId = selectedNodeId) => {
    const equipo = equipos.find((item) => String(item.id) === String(equipmentId));
    const tree = buildEquipmentTree(equipo);
    const node = tree.find((entry) => String(entry.id) === String(nodeId)) || tree[0] || null;
    setEditingId(null);
    setSelectedId(null);
    setForm({
      ...EMPTY_FORM,
      equipo_id: equipo ? String(equipo.id) : '',
      equipo_codigo: equipo?.codigo || '',
      equipo_descripcion: equipo?.descripcion || '',
      equipo_area: equipo?.area_trabajo || '',
      componente_id: node?.id || '',
      componente_codigo: node?.codigo || '',
      componente_nombre: node?.path || '',
      componente_nivel: node?.nivel || 1,
      funcion: componentFunctions[`${equipo?.id || ''}__${node?.id || ''}`] || '',
      efectos: [createEffectDraft()],
    });
  };

  useEffect(() => {
    if (loading || editingId) return;
    resetForm(selectedEquipmentId, selectedNodeId);
  }, [selectedEquipmentId, selectedNodeId, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEditing = (item) => {
    const normalized = normalizeItem(item, equipos);
    setEditingId(normalized.id);
    setSelectedId(normalized.id);
    setSelectedEquipmentId(String(normalized.equipo_id || ''));
    setSelectedNodeId(String(normalized.componente_id || ''));
    setForm(normalized);
  };

  const handleToggleNode = (nodeId) => {
    setExpandedNodes((prev) => ({ ...prev, [String(nodeId)]: prev[String(nodeId)] === false }));
  };

  const handleSelectNode = (node) => {
    setSelectedNodeId(String(node.id));
    if (!editingId) {
      setForm((prev) => ({
        ...prev,
        equipo_id: selectedEquipment ? String(selectedEquipment.id) : '',
        equipo_codigo: selectedEquipment?.codigo || '',
        equipo_descripcion: selectedEquipment?.descripcion || '',
        equipo_area: selectedEquipment?.area_trabajo || '',
        componente_id: String(node.id),
        componente_codigo: node.codigo || '',
        componente_nombre: node.path || '',
        componente_nivel: node.nivel || 1,
        funcion: componentFunctions[`${selectedEquipment?.id || ''}__${node.id}`] || '',
      }));
    }
  };

  const saveComponentFunction = () => {
    if (isReadOnly || !selectedNodeIsComponent || !selectedComponentKey) return;
    const clean = safeText(componentFunctionDraft);
    if (!clean) {
      setError('Escribe la funcion del componente antes de guardarla.');
      return;
    }
    setComponentFunctions((prev) => ({ ...prev, [selectedComponentKey]: clean }));
    setForm((prev) => ({ ...prev, funcion: clean }));
    setError('');
  };

  const updateEffect = (effectId, value) => {
    setForm((prev) => ({
      ...prev,
      efectos: (Array.isArray(prev.efectos) && prev.efectos.length ? prev.efectos : [createEffectDraft()])
        .map((effect) => (effect.id === effectId ? { ...effect, efecto: value } : effect)),
    }));
  };

  const addEffect = () => {
    setForm((prev) => ({
      ...prev,
      efectos: [...(Array.isArray(prev.efectos) ? prev.efectos : []), createEffectDraft()],
    }));
  };

  const removeEffect = (effectId) => {
    setForm((prev) => {
      const next = (Array.isArray(prev.efectos) ? prev.efectos : []).filter((effect) => effect.id !== effectId);
      return { ...prev, efectos: next.length ? next : [createEffectDraft()] };
    });
  };

  const updateCauseField = (effectId, causeIndex, field, value) => {
    setForm((prev) => ({
      ...prev,
      efectos: (Array.isArray(prev.efectos) && prev.efectos.length ? prev.efectos : [createEffectDraft()])
        .map((effect) => {
          if (effect.id !== effectId) return effect;
          const causas = Array.isArray(effect.causas) && effect.causas.length ? [...effect.causas] : [createCauseDraft()];
          const current = typeof causas[causeIndex] === 'object' ? causas[causeIndex] : createCauseDraft(String(causas[causeIndex] || ''));
          causas[causeIndex] = {
            ...current,
            [field]: ['severidad', 'ocurrencia', 'deteccion'].includes(field) ? clampScale(value) : value,
          };
          return { ...effect, causas };
        }),
    }));
  };

  const addCause = (effectId) => {
    setForm((prev) => ({
      ...prev,
      efectos: (Array.isArray(prev.efectos) && prev.efectos.length ? prev.efectos : [createEffectDraft()])
        .map((effect) => (effect.id === effectId ? { ...effect, causas: [...(effect.causas || []), createCauseDraft()] } : effect)),
    }));
  };

  const removeCause = (effectId, causeIndex) => {
    setForm((prev) => ({
      ...prev,
      efectos: (Array.isArray(prev.efectos) && prev.efectos.length ? prev.efectos : [createEffectDraft()])
        .map((effect) => {
          if (effect.id !== effectId) return effect;
          const causas = (effect.causas || []).filter((_, index) => index !== causeIndex);
          return { ...effect, causas: causas.length ? causas : [createCauseDraft()] };
        }),
    }));
  };

  const handleFormEquipmentChange = (value) => {
    setSelectedEquipmentId(String(value || ''));
    setSelectedNodeId(value ? `root_${value}` : '');
    if (editingId) setEditingId(null);
  };

  const saveItem = (event) => {
    event.preventDefault();
    const equipo = equipos.find((item) => String(item.id) === String(form.equipo_id || selectedEquipmentId));
    const tree = buildEquipmentTree(equipo);
    const node = tree.find((entry) => String(entry.id) === String(form.componente_id || selectedNodeId)) || tree[0];

    if (!equipo || !node || node.tipo_nodo !== 'componente') {
      setError('Selecciona un componente del despiece. Los equipos y sistemas no deben tener modos de falla.');
      return;
    }

    const duplicated = items.some((item) => (
      item.id !== editingId
      && String(item.equipo_id) === String(equipo.id)
      && String(item.componente_id) === String(node.id)
      && safeText(item.modo_falla).toLowerCase() === safeText(form.modo_falla).toLowerCase()
    ));
    if (duplicated) {
      setError('Ya existe ese modo de falla para el componente seleccionado. Revisa la lista de modos existentes antes de duplicarlo.');
      return;
    }

    const componentFunction = componentFunctions[`${equipo.id}__${node.id}`] || safeText(componentFunctionDraft);
    if (!componentFunction) {
      setError('Guarda primero la funcion del componente. Esa funcion se registra una sola vez por componente.');
      return;
    }

    const cleanedEffects = (Array.isArray(form.efectos) ? form.efectos : [])
      .map((effect) => ({
        id: effect.id || `eff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        efecto: safeText(effect.efecto),
        causas: (Array.isArray(effect.causas) ? effect.causas : [])
          .map((cause) => {
            const causeObj = typeof cause === 'object' ? cause : createCauseDraft(String(cause || ''));
            return {
              ...causeObj,
              causa: safeText(causeObj.causa),
              severidad: clampScale(causeObj.severidad),
              ocurrencia: clampScale(causeObj.ocurrencia),
              deteccion: clampScale(causeObj.deteccion),
              controles_actuales: safeText(causeObj.controles_actuales),
              deteccion_metodo: safeText(causeObj.deteccion_metodo),
              accion_recomendada: safeText(causeObj.accion_recomendada),
              responsable_accion: safeText(causeObj.responsable_accion),
              fecha_compromiso: safeText(causeObj.fecha_compromiso),
              estado_accion: causeObj.estado_accion || 'Pendiente',
            };
          })
          .filter((cause) => safeText(cause.causa)),
      }))
      .filter((effect) => effect.efecto || effect.causas.length);
    const invalidEffect = cleanedEffects.find((effect) => !effect.efecto || !effect.causas.length);

    if (!safeText(form.modo_falla) || !cleanedEffects.length || invalidEffect) {
      setError('Completa el modo de falla y agrega al menos un efecto con una causa.');
      return;
    }
    const textError = validateTextFields([
      ['Funcion del componente', componentFunction],
      ['Modo de falla', form.modo_falla],
      ...cleanedEffects.flatMap((effect, effectIndex) => [
        [`Efecto ${effectIndex + 1}`, effect.efecto],
        ...effect.causas.flatMap((cause, causeIndex) => [
          [`Causa ${effectIndex + 1}.${causeIndex + 1}`, cause.causa],
          [`Controles actuales ${effectIndex + 1}.${causeIndex + 1}`, cause.controles_actuales],
          [`Metodo de deteccion ${effectIndex + 1}.${causeIndex + 1}`, cause.deteccion_metodo],
          [`Accion recomendada ${effectIndex + 1}.${causeIndex + 1}`, cause.accion_recomendada],
          [`Responsable accion ${effectIndex + 1}.${causeIndex + 1}`, cause.responsable_accion],
        ]),
      ]),
    ]);
    if (textError) {
      setError(textError);
      return;
    }
    const allCauses = cleanedEffects.flatMap((effect) => effect.causas);
    const highestRiskCause = allCauses
      .slice()
      .sort((a, b) => buildCauseNpr(b) - buildCauseNpr(a))[0] || createCauseDraft();
    const payload = normalizeItem({
      ...form,
      id: editingId || undefined,
      equipo_id: String(equipo.id),
      equipo_codigo: equipo.codigo || '',
      equipo_descripcion: equipo.descripcion || '',
      equipo_area: equipo.area_trabajo || '',
      componente_id: String(node.id),
      componente_codigo: node.codigo || '',
      componente_nombre: node.path || '',
      componente_nivel: node.nivel || 1,
      funcion: componentFunction,
      efectos: cleanedEffects,
      efecto_falla: cleanedEffects.map((effect) => effect.efecto).join(' | '),
      causa_falla: cleanedEffects.flatMap((effect) => effect.causas.map((cause) => cause.causa)).join(' | '),
      severidad: highestRiskCause.severidad,
      ocurrencia: highestRiskCause.ocurrencia,
      deteccion: highestRiskCause.deteccion,
      controles_actuales: flattenCauseField(cleanedEffects, 'controles_actuales'),
      deteccion_metodo: flattenCauseField(cleanedEffects, 'deteccion_metodo'),
      accion_recomendada: flattenCauseField(cleanedEffects, 'accion_recomendada'),
      responsable_accion: flattenCauseField(cleanedEffects, 'responsable_accion'),
      fecha_compromiso: cleanedEffects.flatMap((effect) => effect.causas.map((cause) => cause.fecha_compromiso).filter(Boolean)).sort()[0] || '',
      estado_accion: cleanedEffects.flatMap((effect) => effect.causas.map((cause) => cause.estado_accion)).some((status) => status !== 'Cerrada') ? 'Pendiente' : 'Cerrada',
    }, equipos);

    setItems((prev) => (editingId ? prev.map((item) => (item.id === editingId ? payload : item)) : [payload, ...prev]));
    setError('');
    setSelectedId(payload.id);
    setEditingId(payload.id);
    setForm(payload);
  };

  const deleteSelected = () => {
    if (isReadOnly || !selectedItem) return;
    if (!window.confirm(`¿Eliminar el AMEF "${selectedItem.modo_falla}" de ${selectedItem.componente_nombre}?`)) return;
    setItems((prev) => prev.filter((item) => item.id !== selectedItem.id));
    resetForm(selectedEquipmentId, selectedNodeId);
  };

  if (loading) {
    return <div className="page-shell"><div className="page-card">Cargando matriz AMEF...</div></div>;
  }

  if (matrixOnly) {
    return (
      <div className="page-shell">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Matriz AMEF</h1>
            <p className="page-subtitle">Consulta completa de modos de falla, causas, NPR y acciones por equipo y componente.</p>
          </div>
          <Link to="/pmp/amef" className="btn btn-secondary">Volver al registro AMEF</Link>
        </div>

        <div className="page-card" style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr' }}>
            <label className="form-label">
              Equipo
              <select className="form-input" value={selectedEquipmentId} onChange={(e) => handleFormEquipmentChange(e.target.value)}>
                <option value="">Todos</option>
                {equipmentOptions.map((option) => (
                  <option key={`matrix-equipment-${option.id}`} value={option.id}>
                    {option.codigo} | {option.descripcion}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Buscar
              <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modo, causa, componente o accion..." />
            </label>
            <label className="form-label">
              Filtro general por equipo
              <select className="form-input" value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)}>
                <option value="">Todos</option>
                {equipmentOptions.map((option) => (
                  <option key={`matrix-filter-${option.id}`} value={option.id}>
                    {option.codigo} | {option.descripcion}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
            <table className="data-table" style={{ minWidth: '1120px' }}>
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Componente</th>
                  <th>Modo de falla</th>
                  <th>Efecto / causa</th>
                  <th>S</th>
                  <th>O</th>
                  <th>D</th>
                  <th>NPR</th>
                  <th>Estado</th>
                  <th>Compromiso</th>
                </tr>
                <TableFilterRow columns={amefTableColumns} rows={filteredCauseRows} filters={amefFilters.filters} onChange={amefFilters.setFilter} dark />
              </thead>
              <tbody>
                {visibleAmefItems.length === 0 && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '1.25rem', color: '#64748b' }}>No hay registros AMEF para este filtro.</td>
                  </tr>
                )}
                {visibleAmefItems.map((item) => {
                  const npr = item.npr_causa ?? buildNpr(item);
                  const meta = getRiskMeta(npr);
                  return (
                    <tr key={item.rowId || item.id} onClick={() => startEditing(item.sourceItem || item)} style={{ cursor: 'pointer', background: selectedId === item.id ? '#eff6ff' : '#fff' }}>
                      <td>{item.equipo_codigo}<br /><span style={{ color: '#64748b', fontSize: '.82rem' }}>{item.equipo_descripcion}</span></td>
                      <td>{item.componente_nombre}</td>
                      <td>{item.modo_falla}</td>
                      <td>
                        <strong style={{ color: '#334155' }}>Efecto:</strong> {item.efecto_falla || 'N.A.'}
                        <br />
                        <span style={{ color: '#64748b' }}><strong>Causa:</strong> {item.causa_falla || 'N.A.'}</span>
                      </td>
                      <td>{item.severidad}</td>
                      <td>{item.ocurrencia}</td>
                      <td>{item.deteccion}</td>
                      <td><span style={{ padding: '.18rem .5rem', borderRadius: '999px', background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, fontWeight: 700 }}>{npr}</span></td>
                      <td>{item.estado_accion}</td>
                      <td>{formatDateDisplay(item.fecha_compromiso, 'N.A.')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-head">
        <div>
          <h1 className="page-title">AMEF</h1>
          <p className="page-subtitle">Construye el despiece funcional del equipo y registra modos de falla, causa raiz y acciones recomendadas para alimentar el cierre tecnico de las OT.</p>
        </div>
        <Link to="/pmp/amef/matriz" className="btn btn-secondary">Ver matriz completa</Link>
      </div>

      {isReadOnly && (
        <ReadOnlyAccessNotice message="Puedes revisar la matriz AMEF y sus modos de falla, pero este perfil no puede modificarla." />
      )}

      {error && (
        <div style={{ marginBottom: '1rem', padding: '.9rem 1rem', borderRadius: '.9rem', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 390px) 1fr', alignItems: 'start' }}>
        <div className="page-card" style={{ display: 'grid', gap: '1rem' }}>
          <label className="form-label">
            Equipo
            <select className="form-input" value={selectedEquipmentId} onChange={(e) => handleFormEquipmentChange(e.target.value)}>
              <option value="">Selecciona equipo</option>
              {equipmentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.codigo} | {option.descripcion} ({option.area || 'Sin area'})
                </option>
              ))}
            </select>
          </label>

          <div style={{ padding: '.95rem 1rem', borderRadius: '1rem', border: '1px solid #dbe4f0', background: '#f8fafc' }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.25rem' }}>Despiece del equipo</div>
            <div style={{ color: '#64748b', fontSize: '.88rem' }}>
              Selecciona el equipo completo o un componente del árbol para enfocar la matriz y crear modos de falla desde ese nivel.
            </div>
          </div>

          <div style={{ display: 'grid', gap: '.55rem', maxHeight: isMobile ? 'none' : '560px', overflowY: 'auto' }}>
            {!selectedEquipment && (
              <div style={{ padding: '1rem', borderRadius: '.95rem', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                Elige un equipo para ver su despiece.
              </div>
            )}

            {selectedEquipment && selectedTreeLines.map((line) => (
              <TreeNodeRow key={line.node.id} line={line} selectedId={selectedNodeId} onSelect={handleSelectNode} onToggle={handleToggleNode} />
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="page-card" style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gap: '.8rem', gridTemplateColumns: isMobile ? '1fr' : '1.15fr .85fr' }}>
              <div style={{ display: 'grid', gap: '.75rem' }}>
                <div style={{ display: 'grid', gap: '.55rem', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                  <label className="form-label">
                    Buscar en la matriz
                    <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modo, causa, componente o accion..." />
                  </label>
                  <label className="form-label">
                    Filtro general por equipo
                    <select className="form-input" value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)}>
                      <option value="">Todos</option>
                      {equipmentOptions.map((option) => (
                        <option key={`filter-${option.id}`} value={option.id}>
                          {option.codigo} | {option.descripcion}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={{ padding: '.95rem 1rem', borderRadius: '1rem', border: '1px solid #dbe4f0', background: '#f8fbff' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', marginBottom: '.35rem' }}>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{selectedNode?.nombre || 'Equipo completo'}</span>
                    {selectedNode && (
                      <span style={{ fontSize: '.75rem', fontWeight: 700, color: '#475569', background: '#e2e8f0', padding: '.18rem .45rem', borderRadius: '999px' }}>
                        Nivel {selectedNode.nivel}
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '.88rem' }}>{selectedNode?.path || 'Selecciona un nodo del equipo.'}</div>
                  {selectedNodeSummary && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.55rem', marginTop: '.7rem' }}>
                      <span style={{ padding: '.25rem .55rem', borderRadius: '999px', background: '#eff6ff', color: '#2563eb', fontWeight: 700, fontSize: '.78rem' }}>Registros: {selectedNodeSummary.total}</span>
                      <span style={{ padding: '.25rem .55rem', borderRadius: '999px', background: '#fff7ed', color: '#c2410c', fontWeight: 700, fontSize: '.78rem' }}>Pendientes: {selectedNodeSummary.pending}</span>
                      <span style={{ padding: '.25rem .55rem', borderRadius: '999px', background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: '.78rem' }}>Criticos: {selectedNodeSummary.critical}</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #dbe4f0', background: '#fff' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.35rem' }}>Registro seleccionado</div>
                {selectedItem ? (
                  <div style={{ display: 'grid', gap: '.45rem' }}>
                    <div style={{ color: '#2563eb', fontWeight: 800 }}>{selectedItem.modo_falla}</div>
                    <div style={{ fontSize: '.88rem', color: '#475569' }}>{selectedItem.componente_nombre}</div>
                    <div style={{ fontSize: '.82rem', color: '#64748b' }}>Causa: {selectedItem.causa_falla || 'N.A.'}</div>
                    <div style={{ fontSize: '.82rem', color: '#64748b' }}>Accion: {selectedItem.accion_recomendada || 'N.A.'}</div>
                    <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
                      <span style={{ padding: '.22rem .52rem', borderRadius: '999px', background: getRiskMeta(buildNpr(selectedItem)).bg, color: getRiskMeta(buildNpr(selectedItem)).color, fontWeight: 700, fontSize: '.78rem', border: `1px solid ${getRiskMeta(buildNpr(selectedItem)).border}` }}>
                        {getRiskMeta(buildNpr(selectedItem)).label} · NPR {buildNpr(selectedItem)}
                      </span>
                      <span style={{ padding: '.22rem .52rem', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '.78rem' }}>
                        {selectedItem.estado_accion}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#64748b', fontSize: '.88rem' }}>Selecciona un registro AMEF para revisarlo o editarlo.</div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Modos de falla existentes</div>
                  <div style={{ color: '#64748b', fontSize: '.86rem' }}>
                    {selectedNodeIsComponent
                      ? `Componente seleccionado: ${displayedFailureModes.length} modo(s)`
                      : `Equipo seleccionado: ${displayedFailureModes.length} modo(s) registrados`}
                  </div>
                </div>
                <Link to="/pmp/amef/matriz" className="btn btn-secondary">Abrir matriz</Link>
              </div>

              <FailureModeTree items={displayedFailureModes} selectedId={selectedId} onSelect={startEditing} />
            </div>
          </div>

          <form onSubmit={saveItem} className="page-card" style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>{editingId ? 'Editar registro AMEF' : 'Nuevo registro AMEF'}</div>
                <div style={{ color: '#64748b', fontSize: '.88rem' }}>Solo los componentes pueden tener modos de falla.</div>
              </div>
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={() => resetForm(selectedEquipmentId, selectedNodeId)}>Limpiar</button>
                {!isReadOnly && selectedItem && <button type="button" className="btn btn-danger" onClick={deleteSelected}>Eliminar</button>}
                {!isReadOnly && <button type="submit" className="btn btn-primary" disabled={!selectedNodeIsComponent}>{editingId ? 'Guardar cambios' : 'Registrar AMEF'}</button>}
              </div>
            </div>

            {!selectedNodeIsComponent && (
              <div style={{ padding: '.85rem 1rem', borderRadius: '.9rem', border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', fontWeight: 700 }}>
                Selecciona un componente del despiece. Los equipos y sistemas son agrupadores y no deben tener modos de falla.
              </div>
            )}

            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
              <label className="form-label">
                Equipo
                <select className="form-input" value={form.equipo_id} onChange={(e) => handleFormEquipmentChange(e.target.value)} disabled={isReadOnly}>
                  <option value="">Selecciona equipo</option>
                  {equipmentOptions.map((option) => (
                    <option key={`form-${option.id}`} value={option.id}>{option.codigo} | {option.descripcion}</option>
                  ))}
                </select>
              </label>

              <div style={{ padding: '.85rem 1rem', borderRadius: '.95rem', border: '1px solid #dbe4f0', background: '#f8fafc' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.2rem' }}>Componente / nivel</div>
                <div style={{ color: '#475569', fontWeight: 600 }}>{form.componente_nombre || selectedNode?.path || 'Selecciona un nodo del despiece'}</div>
                <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: '.25rem' }}>{form.componente_codigo || selectedNode?.codigo || 'Sin codigo'} · Nivel {form.componente_nivel || selectedNode?.nivel || 1}</div>
              </div>
            </div>

            <div style={{ padding: '.95rem 1rem', borderRadius: '.95rem', border: selectedComponentFunction ? '1px solid #bbf7d0' : '1px solid #fed7aa', background: selectedComponentFunction ? '#f0fdf4' : '#fff7ed', display: 'grid', gap: '.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Funcion del componente</div>
                  <div style={{ color: '#64748b', fontSize: '.86rem' }}>Se registra una sola vez por componente y se reutiliza en todos sus modos de falla.</div>
                </div>
                {selectedComponentFunction && (
                  <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: '#dcfce7', color: '#166534', fontWeight: 800, fontSize: '.78rem' }}>
                    Guardada
                  </span>
                )}
              </div>
              <textarea
                className="form-input"
                rows="3"
                value={componentFunctionDraft}
                onChange={(e) => setComponentFunctionDraft(e.target.value)}
                disabled={isReadOnly || !selectedNodeIsComponent}
                placeholder={selectedNodeIsComponent ? 'Describe la funcion principal de este componente.' : 'Selecciona un componente para registrar su funcion.'}
              />
              {!isReadOnly && (
                <button type="button" className="btn btn-secondary" onClick={saveComponentFunction} disabled={!selectedNodeIsComponent} style={{ justifySelf: 'start' }}>
                  Guardar funcion del componente
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
              <label className="form-label">
                Modo de falla *
                <textarea className="form-input" rows="3" value={form.modo_falla} onChange={(e) => setForm((prev) => ({ ...prev, modo_falla: e.target.value }))} disabled={isReadOnly || !selectedNodeIsComponent} />
              </label>
            </div>

            <div style={{ display: 'grid', gap: '.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Efectos y causas</div>
                  <div style={{ color: '#64748b', fontSize: '.86rem' }}>Un modo de falla puede tener varios efectos, y cada efecto puede tener varias causas.</div>
                </div>
                {!isReadOnly && (
                  <button type="button" className="btn btn-secondary" onClick={addEffect} disabled={!selectedNodeIsComponent}>
                    Agregar efecto
                  </button>
                )}
              </div>

              {(Array.isArray(form.efectos) && form.efectos.length ? form.efectos : [createEffectDraft()]).map((effect, effectIndex) => (
                <div key={effect.id} style={{ border: '1px solid #dbe4f0', borderRadius: '.95rem', background: '#fff', padding: '.9rem', display: 'grid', gap: '.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center' }}>
                    <strong style={{ color: '#0f172a' }}>Efecto {effectIndex + 1}</strong>
                    {!isReadOnly && (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => removeEffect(effect.id)} disabled={!selectedNodeIsComponent}>
                        Quitar efecto
                      </button>
                    )}
                  </div>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Descripcion del efecto *
                    <textarea className="form-input" rows="2" value={effect.efecto || ''} onChange={(e) => updateEffect(effect.id, e.target.value)} disabled={isReadOnly || !selectedNodeIsComponent} />
                  </label>
                  <div style={{ display: 'grid', gap: '.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#334155' }}>Causas de este efecto</span>
                      {!isReadOnly && (
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => addCause(effect.id)} disabled={!selectedNodeIsComponent}>
                          Agregar causa
                        </button>
                      )}
                    </div>
                    {(Array.isArray(effect.causas) && effect.causas.length ? effect.causas : [createCauseDraft()]).map((cause, causeIndex) => {
                      const causeObj = normalizeCause(cause, form, effectIndex, causeIndex);
                      const causeNpr = buildCauseNpr(causeObj);
                      const causeRisk = getRiskMeta(causeNpr);
                      return (
                        <div key={causeObj.id || `${effect.id}-cause-${causeIndex}`} style={{ border: '1px solid #e2e8f0', borderRadius: '.95rem', background: '#f8fafc', padding: '.85rem', display: 'grid', gap: '.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <strong style={{ color: '#0f172a' }}>Causa {causeIndex + 1}</strong>
                            {!isReadOnly && (
                              <button type="button" className="btn btn-sm btn-secondary" onClick={() => removeCause(effect.id, causeIndex)} disabled={!selectedNodeIsComponent}>
                                Quitar causa
                              </button>
                            )}
                          </div>
                          <label className="form-label" style={{ marginBottom: 0 }}>
                            Causa raiz *
                            <textarea className="form-input" rows="2" value={causeObj.causa} onChange={(e) => updateCauseField(effect.id, causeIndex, 'causa', e.target.value)} disabled={isReadOnly || !selectedNodeIsComponent} placeholder={`Causa ${causeIndex + 1}`} />
                          </label>
                          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))' }}>
                            <ScoreInput label="Severidad" value={causeObj.severidad} onChange={(value) => updateCauseField(effect.id, causeIndex, 'severidad', value)} helper="1 bajo impacto - 10 falla grave o insegura" disabled={isReadOnly || !selectedNodeIsComponent} />
                            <ScoreInput label="Ocurrencia" value={causeObj.ocurrencia} onChange={(value) => updateCauseField(effect.id, causeIndex, 'ocurrencia', value)} helper="1 muy rara - 10 muy frecuente" disabled={isReadOnly || !selectedNodeIsComponent} />
                            <ScoreInput label="Deteccion" value={causeObj.deteccion} onChange={(value) => updateCauseField(effect.id, causeIndex, 'deteccion', value)} helper="1 se detecta facil - 10 casi no se detecta" disabled={isReadOnly || !selectedNodeIsComponent} />
                            <div style={{ padding: '.95rem 1rem', borderRadius: '.95rem', border: `1px solid ${causeRisk.border}`, background: causeRisk.bg }}>
                              <div style={{ color: '#64748b', fontSize: '.82rem', marginBottom: '.25rem' }}>NPR de esta causa</div>
                              <div style={{ fontWeight: 800, fontSize: '1.45rem', color: causeRisk.color }}>{causeNpr}</div>
                              <div style={{ fontSize: '.82rem', color: causeRisk.color, fontWeight: 700 }}>{causeRisk.label}</div>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
                            <label className="form-label">
                              Controles actuales *
                              <textarea className="form-input" rows="3" value={causeObj.controles_actuales} onChange={(e) => updateCauseField(effect.id, causeIndex, 'controles_actuales', e.target.value)} disabled={isReadOnly || !selectedNodeIsComponent} />
                            </label>
                            <label className="form-label">
                              Metodo de deteccion *
                              <textarea className="form-input" rows="3" value={causeObj.deteccion_metodo} onChange={(e) => updateCauseField(effect.id, causeIndex, 'deteccion_metodo', e.target.value)} disabled={isReadOnly || !selectedNodeIsComponent} />
                            </label>
                          </div>
                          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
                            <label className="form-label">
                              Accion recomendada *
                              <textarea className="form-input" rows="3" value={causeObj.accion_recomendada} onChange={(e) => updateCauseField(effect.id, causeIndex, 'accion_recomendada', e.target.value)} disabled={isReadOnly || !selectedNodeIsComponent} />
                            </label>
                            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                              <ConfigurableSelectField
                                label="Responsable de accion *"
                                manageLabel="Responsable de accion"
                                value={causeObj.responsable_accion}
                                options={responsibleOptions}
                                onChange={(e) => updateCauseField(effect.id, causeIndex, 'responsable_accion', e.target.value)}
                                onQuickAdd={async () => {
                                  const result = await addOptionQuickly('responsables', 'Responsable');
                                  if (result?.added) updateCauseField(effect.id, causeIndex, 'responsable_accion', result.value);
                                }}
                                canManageOptions={canManageConfigurableLists}
                                placeholder="Selecciona responsable"
                                disabled={isReadOnly || !selectedNodeIsComponent}
                              />
                              <label className="form-label">
                                Fecha compromiso
                                <input type="date" className="form-input" value={causeObj.fecha_compromiso} onChange={(e) => updateCauseField(effect.id, causeIndex, 'fecha_compromiso', e.target.value)} disabled={isReadOnly || !selectedNodeIsComponent} />
                              </label>
                            </div>
                          </div>
                          <label className="form-label">
                            Estado de accion
                            <select className="form-input" value={causeObj.estado_accion} onChange={(e) => updateCauseField(effect.id, causeIndex, 'estado_accion', e.target.value)} disabled={isReadOnly || !selectedNodeIsComponent}>
                              {ACTION_STATUS.map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'none' }}>
              <ScoreInput label="Severidad" value={form.severidad} onChange={(value) => setForm((prev) => ({ ...prev, severidad: value }))} helper="1 bajo impacto · 10 falla grave o insegura" />
              <ScoreInput label="Ocurrencia" value={form.ocurrencia} onChange={(value) => setForm((prev) => ({ ...prev, ocurrencia: value }))} helper="1 muy rara · 10 muy frecuente" />
              <ScoreInput label="Deteccion" value={form.deteccion} onChange={(value) => setForm((prev) => ({ ...prev, deteccion: value }))} helper="1 se detecta facil · 10 casi no se detecta" />
              <div style={{ padding: '.95rem 1rem', borderRadius: '.95rem', border: `1px solid ${getRiskMeta(buildNpr(form)).border}`, background: getRiskMeta(buildNpr(form)).bg }}>
                <div style={{ color: '#64748b', fontSize: '.82rem', marginBottom: '.25rem' }}>NPR calculado</div>
                <div style={{ fontWeight: 800, fontSize: '1.45rem', color: getRiskMeta(buildNpr(form)).color }}>{buildNpr(form)}</div>
                <div style={{ fontSize: '.82rem', color: getRiskMeta(buildNpr(form)).color, fontWeight: 700 }}>{getRiskMeta(buildNpr(form)).label}</div>
              </div>
            </div>

            <div style={{ display: 'none' }}>
              <label className="form-label">
                Controles actuales
                <textarea className="form-input" rows="3" value={form.controles_actuales} onChange={(e) => setForm((prev) => ({ ...prev, controles_actuales: e.target.value }))} disabled={isReadOnly} />
              </label>
              <label className="form-label">
                Metodo de deteccion
                <textarea className="form-input" rows="3" value={form.deteccion_metodo} onChange={(e) => setForm((prev) => ({ ...prev, deteccion_metodo: e.target.value }))} disabled={isReadOnly} />
              </label>
            </div>

            <div style={{ display: 'none' }}>
              <label className="form-label">
                Accion recomendada
                <textarea className="form-input" rows="3" value={form.accion_recomendada} onChange={(e) => setForm((prev) => ({ ...prev, accion_recomendada: e.target.value }))} disabled={isReadOnly} />
              </label>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                <ConfigurableSelectField
                  label="Responsable de accion"
                  manageLabel="Responsable de accion"
                  value={form.responsable_accion}
                  options={responsibleOptions}
                  onChange={(e) => setForm((prev) => ({ ...prev, responsable_accion: e.target.value }))}
                  onQuickAdd={async () => {
                    const result = await addOptionQuickly('responsables', 'Responsable');
                    if (result?.added) {
                      setForm((prev) => ({ ...prev, responsable_accion: result.value }));
                    }
                  }}
                  canManageOptions={canManageConfigurableLists}
                  placeholder="Selecciona responsable"
                  disabled={isReadOnly}
                />
                <label className="form-label">
                  Fecha compromiso
                  <input type="date" className="form-input" value={form.fecha_compromiso} onChange={(e) => setForm((prev) => ({ ...prev, fecha_compromiso: e.target.value }))} disabled={isReadOnly} />
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <label className="form-label" style={{ display: 'none' }}>
                Estado de accion
                <select className="form-input" value={form.estado_accion} onChange={(e) => setForm((prev) => ({ ...prev, estado_accion: e.target.value }))} disabled={isReadOnly}>
                  {ACTION_STATUS.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <div style={{ padding: '.95rem 1rem', borderRadius: '.95rem', border: '1px solid #dbe4f0', background: '#f8fafc' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.25rem' }}>Compatibilidad con cierre de OT</div>
                <div style={{ color: '#64748b', fontSize: '.84rem' }}>
                  El cierre de OT podra tomar automaticamente:
                  <br />• Componente: {form.componente_nombre || 'N.A.'}
                  <br />• Modo de falla: {form.modo_falla || 'N.A.'}
                  <br />• Efectos / causas: {flattenEffectsForDisplay(form.efectos) || 'N.A.'}
                  <br />• Acciones por causa: {flattenCauseField(form.efectos, 'accion_recomendada') || 'N.A.'}
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
