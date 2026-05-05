import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { loadSharedDocument, saveSharedDocument } from '../services/sharedDocuments';
import { isReadOnlyRole } from '../utils/roleAccess';
import { filterRowsByColumns } from '../utils/tableFilters';
import {
  firstValidationError,
  validateRequiredFields,
  validateTextFields,
} from '../utils/formValidation';
import { deletePhotoAttachment, uploadPhotoAttachment } from '../services/api';

const BASE_COLUMNS = [
  { key: 'codigo', label: 'Código' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'area_trabajo', label: 'Área de trabajo' },
  { key: 'criticidad', label: 'Criticidad' },
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
    criticidad: 'Alta',
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
    criticidad: 'Media',
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
  exchangeHistory: 'pmp_equipos_exchange_history_v1',
};

const ALLOWED_DESPIECE_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isImageAttachment(file = {}) {
  return String(file.content_type || file.type || '').startsWith('image/')
    || /\.(jpg|jpeg|png|webp|gif)$/i.test(String(file.original_name || file.filename || ''));
}

function buildDespiecePrintHtml(equipo, nodes = []) {
  const childrenByParent = new Map();
  nodes.forEach((node) => {
    const key = node.parentId || '__root__';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(node);
  });

  const renderBranch = (parentId = null, level = 1) => {
    const key = parentId || '__root__';
    const children = (childrenByParent.get(key) || [])
      .slice()
      .sort((a, b) => String(a.codigo_sub || a.nombre || '').localeCompare(String(b.codigo_sub || b.nombre || '')));
    if (!children.length) return '';
    return `<ul>${children.map((node) => {
      const isTitle = node.tipo_nodo === 'titulo';
      const features = Array.isArray(node.caracteristicas) && node.caracteristicas.length
        ? `<div class="features">${node.caracteristicas.map((item) => `<span>${escapeHtml(item.descripcion)}: <strong>${escapeHtml(item.valor)}</strong></span>`).join('')}</div>`
        : '';
      const attachmentCount = Array.isArray(node.adjuntos) ? node.adjuntos.length : 0;
      return `
        <li>
          <div class="node ${isTitle ? 'title' : 'component'}">
            <div class="meta">Nivel ${level} · ${isTitle ? 'Titulo / sistema' : 'Componente'}${attachmentCount ? ` · ${attachmentCount} anexo(s)` : ''}</div>
            <div class="name">${escapeHtml(node.nombre)}</div>
            <div class="code">Codigo: ${escapeHtml(node.codigo_sub || 'N.A.')}</div>
            ${node.detalle ? `<div class="detail">${escapeHtml(node.detalle)}</div>` : ''}
            ${features}
          </div>
          ${renderBranch(node.id, level + 1)}
        </li>
      `;
    }).join('')}</ul>`;
  };

  const attachments = nodes.flatMap((node) => (Array.isArray(node.adjuntos) ? node.adjuntos : []).map((file) => ({ node, file })));
  const imageAttachments = attachments.filter(({ file }) => isImageAttachment(file));
  const pdfAttachments = attachments.filter(({ file }) => !isImageAttachment(file));

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Despiece - ${escapeHtml(equipo.descripcion || equipo.codigo || 'Equipo')}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
        h1 { font-size: 22px; margin: 0 0 6px; }
        h2 { font-size: 18px; margin: 28px 0 12px; page-break-after: avoid; }
        .subtitle { color: #475569; margin-bottom: 18px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 18px; }
        .summary div { border: 1px solid #dbe4f0; border-radius: 8px; padding: 8px; }
        .label { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700; }
        .value { font-weight: 800; margin-top: 3px; }
        ul { list-style: none; margin: 0; padding-left: 20px; border-left: 1px solid #e5e7eb; }
        li { margin: 8px 0; page-break-inside: avoid; }
        .node { border: 1px solid #dbe4f0; border-radius: 8px; padding: 9px 10px; background: #fff; }
        .node.title { background: #eff6ff; border-color: #bfdbfe; }
        .node.component { background: #f8fafc; }
        .meta { color: #2563eb; font-size: 11px; font-weight: 800; margin-bottom: 3px; }
        .name { font-size: 14px; font-weight: 900; }
        .code, .detail { color: #475569; font-size: 12px; margin-top: 2px; }
        .features { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
        .features span { border: 1px solid #e2e8f0; border-radius: 999px; padding: 2px 7px; font-size: 11px; color: #334155; background: #fff; }
        .annex-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .annex { border: 1px solid #dbe4f0; border-radius: 10px; padding: 10px; page-break-inside: avoid; }
        .annex img { width: 100%; max-height: 280px; object-fit: contain; display: block; border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 8px; }
        .pdf-list { display: grid; gap: 8px; }
        .pdf-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
        a { color: #2563eb; }
        @media print {
          body { margin: 16mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none; }
          .page-break { page-break-before: always; }
        }
      </style>
    </head>
    <body>
      <button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 12px;border:0;border-radius:8px;background:#2563eb;color:white;font-weight:700;cursor:pointer;">Imprimir</button>
      <h1>Despiece de maquina</h1>
      <div class="subtitle">${escapeHtml(equipo.codigo || 'N.A.')} · ${escapeHtml(equipo.descripcion || 'Sin descripcion')}</div>
      <div class="summary">
        <div><div class="label">Area</div><div class="value">${escapeHtml(equipo.area_trabajo || 'N.A.')}</div></div>
        <div><div class="label">Criticidad</div><div class="value">${escapeHtml(equipo.criticidad || 'N.A.')}</div></div>
        <div><div class="label">Estado</div><div class="value">${escapeHtml(equipo.estado || 'N.A.')}</div></div>
        <div><div class="label">Niveles</div><div class="value">${nodes.length}</div></div>
      </div>
      <h2>Estructura del despiece</h2>
      ${nodes.length ? renderBranch(null, 1) : '<p>No hay niveles registrados.</p>'}
      <div class="page-break"></div>
      <h2>Anexos fotograficos</h2>
      ${imageAttachments.length ? `<div class="annex-grid">${imageAttachments.map(({ node, file }, index) => `
        <div class="annex">
          <div class="meta">Anexo ${index + 1} · ${escapeHtml(node.codigo_sub || 'N.A.')}</div>
          <div class="name">${escapeHtml(node.nombre)}</div>
          <div class="detail">${escapeHtml(file.original_name || file.caption || file.filename || 'Foto')}</div>
          <img src="${escapeHtml(file.url)}" alt="${escapeHtml(file.original_name || 'Foto de componente')}" />
        </div>
      `).join('')}</div>` : '<p>No hay fotos registradas en los componentes.</p>'}
      ${pdfAttachments.length ? `
        <h2>Documentos PDF</h2>
        <div class="pdf-list">${pdfAttachments.map(({ node, file }, index) => `
          <div class="pdf-item">
            <strong>PDF ${index + 1}: ${escapeHtml(node.nombre)}</strong><br />
            ${escapeHtml(file.original_name || file.caption || file.filename || 'Documento PDF')}<br />
            <a href="${escapeHtml(file.url)}" target="_blank" rel="noreferrer">Abrir documento</a>
          </div>
        `).join('')}</div>
      ` : ''}
      <script>setTimeout(() => window.print(), 450);</script>
    </body>
  </html>`;
}

function Modal({ title, onClose, children, maxWidth = '860px' }) {
  return (
    <div className="app-modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div className="app-modal-shell" style={{ width: '100%', maxWidth, maxHeight: 'calc(100vh - 2rem)', background: '#fff', borderRadius: '1rem', boxShadow: '0 22px 64px rgba(0,0,0,.28)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="app-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', padding: '1rem 1.2rem', flex: '0 0 auto' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '1.6rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>
        <div className="app-modal-body" style={{ padding: '1.1rem 1.2rem 1.3rem', overflowY: 'auto', flex: '1 1 auto' }}>{children}</div>
      </div>
    </div>
  );
}

export default function PmpEquipos() {
  const { user } = useAuth();
  const isReadOnly = isReadOnlyRole(user);
  const [columns, setColumns] = useState(BASE_COLUMNS);
  const [equipos, setEquipos] = useState(INITIAL_EQUIPOS);
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
  const [despieceContextMenu, setDespieceContextMenu] = useState(null);
  const [nodeEditorOpen, setNodeEditorOpen] = useState(false);
  const [formMode, setFormMode] = useState('add'); // add | edit
  const [newNodeType, setNewNodeType] = useState('componente');
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeDetails, setNewNodeDetails] = useState('');
  const [newFeatureDesc, setNewFeatureDesc] = useState('');
  const [newFeatureValue, setNewFeatureValue] = useState('');
  const [draftFeatures, setDraftFeatures] = useState([]);
  const [draftAttachments, setDraftAttachments] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showNoteField, setShowNoteField] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [exchangeHistory, setExchangeHistory] = useState([]);
  const [exchangeSourceId, setExchangeSourceId] = useState(INITIAL_EQUIPOS[0]?.id ?? null);
  const [exchangeNodeId, setExchangeNodeId] = useState('');
  const [exchangeTargetId, setExchangeTargetId] = useState(INITIAL_EQUIPOS[1]?.id ?? null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [loadedColumns, loadedEquipos, loadedExchangeHistory] = await Promise.all([
        loadSharedDocument(STORAGE_KEYS.columns, BASE_COLUMNS),
        loadSharedDocument(STORAGE_KEYS.equipos, INITIAL_EQUIPOS),
        loadSharedDocument(STORAGE_KEYS.exchangeHistory, []),
      ]);
      if (!active) return;
      const nextColumns = Array.isArray(loadedColumns) && loadedColumns.length ? loadedColumns : BASE_COLUMNS;
      const nextEquipos = (Array.isArray(loadedEquipos) && loadedEquipos.length ? loadedEquipos : INITIAL_EQUIPOS)
        .map((equipo) => ({ criticidad: 'Media', estado: 'Operativo', ...equipo }));
      const nextHistory = Array.isArray(loadedExchangeHistory) ? loadedExchangeHistory : [];
      setColumns(nextColumns);
      setEquipos(nextEquipos);
      setExchangeHistory(nextHistory);
      setSelectedId(nextEquipos[0]?.id ?? null);
      setExchangeSourceId(nextEquipos[0]?.id ?? null);
      setExchangeTargetId(nextEquipos[1]?.id ?? null);
      setHydrated(true);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || isReadOnly) return;
    saveSharedDocument(STORAGE_KEYS.columns, columns).catch((err) => {
      console.error('Error guardando columnas de equipos:', err);
      setError('No se pudo guardar control de equipos en el servidor.');
    });
  }, [columns, hydrated, isReadOnly]);

  useEffect(() => {
    if (!hydrated || isReadOnly) return;
    saveSharedDocument(STORAGE_KEYS.equipos, equipos).catch((err) => {
      console.error('Error guardando equipos:', err);
      setError('No se pudo guardar control de equipos en el servidor.');
    });
  }, [equipos, hydrated, isReadOnly]);

  useEffect(() => {
    if (!hydrated || isReadOnly) return;
    saveSharedDocument(STORAGE_KEYS.exchangeHistory, exchangeHistory).catch((err) => {
      console.error('Error guardando historial de intercambios:', err);
      setError('No se pudo guardar el historial de intercambios en el servidor.');
    });
  }, [exchangeHistory, hydrated, isReadOnly]);

  useEffect(() => {
    if (!columns.some((col) => col.key === columnToRemove)) {
      setColumnToRemove(columns[0]?.key || '');
    }
  }, [columns, columnToRemove]);

  useEffect(() => {
    if (!despieceContextMenu) return undefined;
    const closeMenu = () => setDespieceContextMenu(null);
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [despieceContextMenu]);

  const selectedEquipo = useMemo(() => equipos.find((e) => e.id === selectedId) || null, [equipos, selectedId]);
  const despieceTarget = useMemo(() => equipos.find((e) => e.id === despieceTargetId) || null, [equipos, despieceTargetId]);
  const despieceNodes = despieceTarget?.despiece || [];
  const selectedNode = despieceNodes.find((n) => n.id === selectedNodeId) || null;
  const exchangeSourceEquipo = equipos.find((e) => e.id === Number(exchangeSourceId)) || null;
  const exchangeSourceNodes = exchangeSourceEquipo?.despiece || [];
  const totalEquipos = equipos.length;
  const equiposCriticos = useMemo(() => equipos.filter((equipo) => String(equipo.criticidad || '').toLowerCase() === 'alta').length, [equipos]);
  const equiposInoperativos = useMemo(() => equipos.filter((equipo) => String(equipo.estado || '').toLowerCase() !== 'operativo').length, [equipos]);
  const equipmentTableColumns = useMemo(
    () => [
      ...columns.map((col) => ({
        id: col.key,
        getValue: (equipo) => equipo[col.key] || '—',
      })),
      { id: 'despiece', filterable: false },
    ],
    [columns],
  );
  const {
    filters: equipmentFilters,
    setFilter: setEquipmentFilter,
  } = useTableColumnFilters(equipmentTableColumns);
  const visibleEquipos = useMemo(
    () => filterRowsByColumns(equipos, equipmentTableColumns, equipmentFilters),
    [equipos, equipmentTableColumns, equipmentFilters],
  );

  const openNewEquipo = () => {
    if (isReadOnly) return;
    const defaultForm = {};
    columns.forEach((col) => { defaultForm[col.key] = ''; });
    setForm(defaultForm);
    setEditingId(null);
    setShowEquipoModal(true);
  };

  const openEditEquipo = () => {
    if (isReadOnly) return;
    if (!selectedEquipo) return;
    const editForm = {};
    columns.forEach((col) => { editForm[col.key] = selectedEquipo[col.key] || ''; });
    setForm(editForm);
    setEditingId(selectedEquipo.id);
    setShowEquipoModal(true);
  };

  const saveEquipo = (e) => {
    e.preventDefault();
    const validationError = firstValidationError(
      validateRequiredFields([
        ['Codigo', form.codigo],
        ['Descripcion', form.descripcion],
      ]),
      validateTextFields(columns.map((col) => [col.label, form[col.key]])),
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    const cleanForm = columns.reduce((acc, col) => {
      acc[col.key] = String(form[col.key] ?? '').trim();
      return acc;
    }, {});
    if (editingId) {
      setEquipos((prev) => prev.map((eq) => (eq.id === editingId ? { ...eq, ...cleanForm } : eq)));
      setSelectedId(editingId);
    } else {
      const nextId = equipos.length ? Math.max(...equipos.map((eq) => eq.id)) + 1 : 1;
      const newRow = { id: nextId, ...cleanForm };
      setEquipos((prev) => [newRow, ...prev]);
      setSelectedId(nextId);
    }
    setError('');
    setShowEquipoModal(false);
  };

  const addColumn = (e) => {
    e.preventDefault();
    const cleanName = newColumnName.trim();
    const validationError = firstValidationError(
      validateRequiredFields([['Nombre de columna', cleanName]]),
      validateTextFields([['Nombre de columna', cleanName]]),
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    const key = cleanName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!key || columns.some((col) => col.key === key)) {
      setError('Ya existe una columna con ese nombre o el nombre no genera una clave valida.');
      return;
    }

    const newCol = { key, label: cleanName };
    setColumns((prev) => [...prev, newCol]);
    setEquipos((prev) => prev.map((item) => ({ ...item, [key]: '' })));
    setNewColumnName('');
    setColumnToRemove(key);
    setError('');
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
    if (isReadOnly) return;
    if (!selectedEquipo) return;
    if (!window.confirm(`¿Eliminar equipo ${selectedEquipo.codigo || selectedEquipo.descripcion || selectedEquipo.id}?`)) return;
    const filtered = equipos.filter((eq) => eq.id !== selectedEquipo.id);
    setEquipos(filtered);
    setSelectedId(filtered[0]?.id ?? null);
  };

  const openDespiece = (equipo) => {
    if (isReadOnly) return;
    setDespieceTargetId(equipo.id);
    setSelectedNodeId(null); // null = raíz (Nivel 1 / equipo)
    setDespieceContextMenu(null);
    setNodeEditorOpen(false);
    setFormMode('add');
    setNewNodeType('titulo');
    setNewNodeName('');
    setNewNodeDetails('');
    setDraftFeatures([]);
    setDraftAttachments([]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
    setShowNoteField(false);
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
    if (isReadOnly) return;
    const descripcion = newFeatureDesc.trim();
    const valor = newFeatureValue.trim();
    if (!descripcion || !valor) return;
    const validationError = validateTextFields([
      ['Descripcion de caracteristica', descripcion],
      ['Valor de caracteristica', valor],
    ]);
    if (validationError) {
      setError(validationError);
      return;
    }
    setDraftFeatures((prev) => [...prev, { descripcion, valor }]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
    setError('');
  };

  const removeDraftFeature = (index) => {
    setDraftFeatures((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadDespieceAttachment = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isReadOnly) return;
    if (!ALLOWED_DESPIECE_ATTACHMENT_TYPES.includes(file.type)) {
      window.alert('Selecciona una foto JPG/PNG/WEBP/GIF o un documento PDF.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scope', `despiece_${despieceTarget?.codigo || 'equipo'}_${Date.now()}`);
    formData.append('category', file.type === 'application/pdf' ? 'PDF' : 'COMPONENTE');
    formData.append('caption', file.name);
    setUploadingAttachment(true);
    try {
      const uploaded = await uploadPhotoAttachment(formData);
      setDraftAttachments((prev) => [
        ...prev,
        {
          ...uploaded,
          id: uploaded.filename || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          original_name: uploaded.original_name || file.name,
          content_type: file.type,
        },
      ]);
      setError('');
    } catch (err) {
      console.error('Error subiendo adjunto de despiece:', err);
      window.alert(err?.response?.data?.detail || 'No se pudo subir el adjunto del componente.');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const removeDraftAttachment = async (attachment) => {
    const filename = attachment?.filename;
    setDraftAttachments((prev) => prev.filter((item) => String(item.filename || item.id) !== String(filename || attachment?.id)));
    if (filename) {
      deletePhotoAttachment(filename).catch((err) => console.error('No se pudo eliminar el adjunto del servidor:', err));
    }
  };

  const printDespiece = () => {
    if (!despieceTarget) return;
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      window.alert('No se pudo abrir la ventana de impresion. Revisa el bloqueo de ventanas emergentes.');
      return;
    }
    printWindow.document.write(buildDespiecePrintHtml(despieceTarget, despieceNodes));
    printWindow.document.close();
    printWindow.focus();
  };

  const addDespieceNode = (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    const validationError = firstValidationError(
      validateRequiredFields([['Nombre del componente', newNodeName]]),
      validateTextFields([
        ['Nombre del componente', newNodeName],
        ['Nota general', newNodeDetails],
        ...draftFeatures.flatMap((feature, index) => [
          [`Caracteristica ${index + 1}`, feature.descripcion],
          [`Valor caracteristica ${index + 1}`, feature.valor],
        ]),
      ]),
    );
    if (!despieceTarget || validationError) {
      if (validationError) setError(validationError);
      return;
    }
    const parentForNewNode = newNodeType === 'titulo' && selectedNode && selectedNode.tipo_nodo !== 'titulo'
      ? (selectedNode.parentId || null)
      : selectedNodeId;
    const node = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      parentId: parentForNewNode,
      codigo_sub: getNextChildCode(parentForNewNode),
      tipo_nodo: newNodeType,
      nombre: newNodeName.trim(),
      detalle: newNodeDetails.trim(),
      caracteristicas: draftFeatures,
      adjuntos: draftAttachments,
    };
    setEquipos((prev) => prev.map((eq) => (
      eq.id === despieceTarget.id
        ? { ...eq, despiece: [...(eq.despiece || []), node] }
        : eq
    )));
    setSelectedNodeId(node.id);
    setFormMode('add');
    setNewNodeType('componente');
    setNewNodeName('');
    setNewNodeDetails('');
    setDraftFeatures([]);
    setDraftAttachments([]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
    setShowNoteField(false);
    setNodeEditorOpen(false);
    setError('');
  };

  const loadSelectedNodeForEdit = () => {
    if (isReadOnly) return;
    if (!selectedNode) return;
    setFormMode('edit');
    setNewNodeType(selectedNode.tipo_nodo || 'componente');
    setNewNodeName(selectedNode.nombre || '');
    setNewNodeDetails(selectedNode.detalle || '');
    setDraftFeatures(Array.isArray(selectedNode.caracteristicas) ? selectedNode.caracteristicas : []);
    setDraftAttachments(Array.isArray(selectedNode.adjuntos) ? selectedNode.adjuntos : []);
    setShowNoteField(Boolean(selectedNode.detalle));
  };

  const updateSelectedNode = (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    const validationError = firstValidationError(
      validateRequiredFields([['Nombre del componente', newNodeName]]),
      validateTextFields([
        ['Nombre del componente', newNodeName],
        ['Nota general', newNodeDetails],
        ...draftFeatures.flatMap((feature, index) => [
          [`Caracteristica ${index + 1}`, feature.descripcion],
          [`Valor caracteristica ${index + 1}`, feature.valor],
        ]),
      ]),
    );
    if (!despieceTarget || !selectedNode || validationError) {
      if (validationError) setError(validationError);
      return;
    }
    setEquipos((prev) => prev.map((eq) => {
      if (eq.id !== despieceTarget.id) return eq;
      return {
        ...eq,
        despiece: (eq.despiece || []).map((node) => (
          node.id === selectedNode.id
            ? { ...node, tipo_nodo: newNodeType, nombre: newNodeName.trim(), detalle: newNodeDetails.trim(), caracteristicas: draftFeatures, adjuntos: draftAttachments }
            : node
        )),
      };
    }));
    setFormMode('add');
    setNewNodeType('componente');
    setNewNodeName('');
    setNewNodeDetails('');
    setDraftFeatures([]);
    setDraftAttachments([]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
    setShowNoteField(false);
    setNodeEditorOpen(false);
    setError('');
  };

  const deleteSelectedNode = () => {
    if (isReadOnly) return;
    if (!despieceTarget || !selectedNode) return;
    if (!window.confirm(`¿Eliminar nivel ${selectedNode.nombre} y sus subniveles?`)) return;
    const toDelete = new Set([selectedNode.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of despieceNodes) {
        if (node.parentId && toDelete.has(node.parentId) && !toDelete.has(node.id)) {
          toDelete.add(node.id);
          changed = true;
        }
      }
    }
    setEquipos((prev) => prev.map((eq) => (
      eq.id === despieceTarget.id
        ? { ...eq, despiece: (eq.despiece || []).filter((node) => !toDelete.has(node.id)) }
        : eq
    )));
    setSelectedNodeId(null);
    setFormMode('add');
    setNewNodeType('componente');
    setNewNodeName('');
    setNewNodeDetails('');
    setDraftFeatures([]);
    setDraftAttachments([]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
    setShowNoteField(false);
  };

  const resetDespieceForm = () => {
    setFormMode('add');
    setNewNodeType('titulo');
    setNewNodeName('');
    setNewNodeDetails('');
    setDraftFeatures([]);
    setDraftAttachments([]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
    setShowNoteField(false);
    setError('');
  };

  const openNodeContextMenu = (event, nodeId = null) => {
    event.preventDefault();
    setSelectedNodeId(nodeId);
    setDespieceContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId,
    });
  };

  const openAddNodeEditor = (nodeId, type) => {
    setSelectedNodeId(nodeId);
    setFormMode('add');
    setNewNodeType(type);
    setNewNodeName('');
    setNewNodeDetails('');
    setDraftFeatures([]);
    setDraftAttachments([]);
    setNewFeatureDesc('');
    setNewFeatureValue('');
    setShowNoteField(false);
    setDespieceContextMenu(null);
    setNodeEditorOpen(true);
    setError('');
  };

  const openEditNodeEditor = (nodeId) => {
    const node = despieceNodes.find((item) => item.id === nodeId);
    if (!node) return;
    setSelectedNodeId(node.id);
    setFormMode('edit');
    setNewNodeType(node.tipo_nodo || 'componente');
    setNewNodeName(node.nombre || '');
    setNewNodeDetails(node.detalle || '');
    setDraftFeatures(Array.isArray(node.caracteristicas) ? node.caracteristicas : []);
    setDraftAttachments(Array.isArray(node.adjuntos) ? node.adjuntos : []);
    setNewFeatureDesc('');
    setNewFeatureValue('');
    setShowNoteField(Boolean(node.detalle));
    setDespieceContextMenu(null);
    setNodeEditorOpen(true);
    setError('');
  };

  const closeNodeEditor = () => {
    setNodeEditorOpen(false);
    resetDespieceForm();
  };

  const openExchangeModal = () => {
    if (isReadOnly) return;
    const source = selectedEquipo?.id || equipos[0]?.id || null;
    const target = equipos.find((e) => e.id !== source)?.id || null;
    setExchangeSourceId(source);
    setExchangeTargetId(target);
    setExchangeNodeId('');
    setShowExchangeModal(true);
  };

  const getSubtreeIds = (rootId, nodes) => {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of nodes) {
        if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
          ids.add(node.id);
          changed = true;
        }
      }
    }
    return ids;
  };

  const migrateSubtree = () => {
    if (isReadOnly) return;
    const sourceId = Number(exchangeSourceId);
    const targetId = Number(exchangeTargetId);
    if (!sourceId || !targetId || !exchangeNodeId || sourceId === targetId) return;

    const sourceEq = equipos.find((e) => e.id === sourceId);
    const targetEq = equipos.find((e) => e.id === targetId);
    if (!sourceEq || !targetEq) return;
    const sourceNodes = sourceEq.despiece || [];
    const nodeToMove = sourceNodes.find((n) => n.id === exchangeNodeId);
    if (!nodeToMove) return;

    if (!window.confirm(`¿Confirmas el intercambio del subequipo "${nodeToMove.nombre}" desde ${sourceEq.codigo} hacia ${targetEq.codigo}?`)) return;

    const subtreeIds = getSubtreeIds(nodeToMove.id, sourceNodes);
    const subtreeNodes = sourceNodes.filter((node) => subtreeIds.has(node.id));
    const childrenByParent = {};
    subtreeNodes.forEach((node) => {
      const key = node.parentId || '__root__';
      if (!childrenByParent[key]) childrenByParent[key] = [];
      childrenByParent[key].push(node);
    });

    const cloneBranch = (oldNode, newParentId) => {
      const newId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const cloned = { ...oldNode, id: newId, parentId: newParentId, codigo_sub: oldNode.codigo_sub };
      const children = (childrenByParent[oldNode.id] || []);
      let all = [cloned];
      children.forEach((child) => {
        all = all.concat(cloneBranch(child, newId));
      });
      return all;
    };

    const clonedNodes = cloneBranch(nodeToMove, null);

    setEquipos((prev) => prev.map((eq) => {
      if (eq.id === sourceId) {
        return { ...eq, despiece: (eq.despiece || []).filter((node) => !subtreeIds.has(node.id)) };
      }
      if (eq.id === targetId) {
        return { ...eq, despiece: [...(eq.despiece || []), ...clonedNodes] };
      }
      return eq;
    }));

    setExchangeHistory((prev) => [{
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fecha: new Date().toISOString(),
      sourceEquipo: sourceEq.codigo,
      targetEquipo: targetEq.codigo,
      nodeName: nodeToMove.nombre,
      oldCode: nodeToMove.codigo_sub || 'N/A',
      newCode: nodeToMove.codigo_sub || 'N/A',
      levelsMigrated: clonedNodes.length,
    }, ...prev]);
    setShowExchangeModal(false);
  };

  const renderTree = (parentId = null, level = 1) => {
    const nodes = despieceNodes.filter((n) => n.parentId === parentId);
    if (!nodes.length) return null;
    return (
      <ul style={{ listStyle: 'none', margin: 0, paddingLeft: level === 2 ? '.35rem' : '.85rem', borderLeft: level > 1 ? '1px solid #e2e8f0' : 'none' }}>
        {nodes.map((node) => (
          <li key={node.id} style={{ marginBottom: '.35rem' }}>
            {(() => {
              const isTitle = node.tipo_nodo === 'titulo';
              return (
            <button
              type="button"
              onContextMenu={(event) => openNodeContextMenu(event, node.id)}
              onClick={() => {
                setSelectedNodeId(node.id);
                setDespieceContextMenu(null);
                setError('');
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                border: selectedNodeId === node.id ? '1px solid #2563eb' : (isTitle ? '1px solid #bfdbfe' : '1px solid #d1d5db'),
                borderRadius: '.75rem',
                padding: isTitle ? '.72rem .75rem' : '.58rem .65rem',
                background: selectedNodeId === node.id ? '#dbeafe' : (isTitle ? '#eff6ff' : '#fff'),
                cursor: 'pointer',
                boxShadow: selectedNodeId === node.id ? '0 8px 18px rgba(37,99,235,.12)' : 'none',
              }}
            >
              <div style={{ fontSize: '.76rem', color: isTitle ? '#1d4ed8' : '#6b7280', marginBottom: '.2rem', fontWeight: isTitle ? 800 : 500 }}>
                Nivel {level} · {isTitle ? 'Titulo / sistema' : 'Componente'}
              </div>
              <div style={{ fontWeight: 800, color: isTitle ? '#0f172a' : '#111827' }}>{node.nombre}</div>
              {node.codigo_sub && <div style={{ fontSize: '.75rem', color: '#1d4ed8', fontWeight: 700 }}>Código: {node.codigo_sub}</div>}
              {node.detalle && <div style={{ fontSize: '.8rem', color: '#6b7280' }}>{node.detalle}</div>}
              {Array.isArray(node.adjuntos) && node.adjuntos.length > 0 && (
                <div style={{ marginTop: '.35rem', display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                  {node.adjuntos.map((file, index) => (
                    <span key={`${node.id}-att-${file.filename || index}`} style={{ fontSize: '.72rem', color: '#0f766e', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '999px', padding: '.12rem .45rem', fontWeight: 700 }}>
                      {isImageAttachment(file) ? 'Foto' : 'PDF'} {index + 1}
                    </span>
                  ))}
                </div>
              )}
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
              );
            })()}
            {renderTree(node.id, level + 1)}
          </li>
        ))}
      </ul>
    );
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
      <div style={{ marginBottom: '1.2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Control de equipos</h1>
        <p style={{ color: '#6b7280' }}>Gestión de inventario PMP con columnas dinámicas para nuevos campos.</p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {isReadOnly && (
        <ReadOnlyAccessNotice message="Puedes revisar el maestro de equipos, su despiece e historial, pero este perfil no puede modificar control de equipos." />
      )}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">Equipos registrados</div>
          <div className="stat-value">{totalEquipos}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Criticidad alta</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{equiposCriticos}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">No operativos</div>
          <div className="stat-value" style={{ color: '#b45309' }}>{equiposInoperativos}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="action-toolbar">
          {!isReadOnly && <button type="button" className="btn btn-primary" onClick={openNewEquipo}>Nuevo equipo</button>}
          {!isReadOnly && <button type="button" className="btn btn-secondary" onClick={openEditEquipo} disabled={!selectedEquipo}>Editar equipo</button>}
          {!isReadOnly && <button type="button" className="btn btn-secondary" onClick={() => setShowColModal(true)}>Agregar columna</button>}
          {!isReadOnly && <button type="button" className="btn btn-secondary" onClick={() => setShowRemoveColModal(true)} disabled={columns.length <= 1}>Eliminar columna</button>}
          {!isReadOnly && <button type="button" className="btn btn-secondary" onClick={openExchangeModal} disabled={equipos.length <= 1}>Intercambios</button>}
          <Link className="btn btn-secondary" to="/pmp/intercambios/historial">Historial intercambios</Link>
          {!isReadOnly && <Link className="btn btn-danger" to="/pmp/bajas">Dar de baja</Link>}
          {!isReadOnly && <button type="button" className="btn btn-danger" onClick={deleteSelected} disabled={!selectedEquipo}>Eliminar</button>}
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
            <TableFilterRow columns={equipmentTableColumns} rows={equipos} filters={equipmentFilters} onChange={setEquipmentFilter} dark />
          </thead>
          <tbody>
            {visibleEquipos.map((equipo) => (
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
            {!visibleEquipos.length && (
              <tr>
                <td colSpan={columns.length + 1} style={{ border: '1px solid #e5e7eb', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                  No hay equipos que coincidan con los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showEquipoModal && (
        <Modal title={editingId ? 'Editar equipo' : 'Nuevo equipo'} onClose={() => setShowEquipoModal(false)}>
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
        <Modal title="Agregar nueva columna" maxWidth="520px" onClose={() => setShowColModal(false)}>
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
        <Modal title="Eliminar columna" maxWidth="520px" onClose={() => setShowRemoveColModal(false)}>
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
        <Modal title={`Despiece de maquina - ${despieceTarget.descripcion || despieceTarget.codigo}`} maxWidth="1160px" onClose={() => setShowDespieceModal(false)}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', padding: '.9rem 1rem', border: '1px solid #dbe4f0', borderRadius: '.9rem', background: '#f8fafc' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: '.78rem', fontWeight: 800, textTransform: 'uppercase' }}>Equipo</div>
                <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.05rem' }}>{despieceTarget.codigo || 'N.A.'} | {despieceTarget.descripcion || 'Sin descripción'}</div>
                <div style={{ color: '#64748b', fontSize: '.86rem', marginTop: '.15rem' }}>{despieceTarget.area_trabajo || 'Sin área'} · {despieceTarget.estado || 'Sin estado'}</div>
              </div>
              <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ padding: '.35rem .65rem', borderRadius: '999px', background: '#eef2ff', color: '#3730a3', fontWeight: 800, fontSize: '.82rem' }}>{despieceNodes.length} nivel(es)</span>
                <span style={{ padding: '.35rem .65rem', borderRadius: '999px', background: '#ecfdf5', color: '#047857', fontWeight: 800, fontSize: '.82rem' }}>
                  {despieceNodes.reduce((count, node) => count + (Array.isArray(node.adjuntos) ? node.adjuntos.length : 0), 0)} adjunto(s)
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={printDespiece}>Imprimir despiece</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', alignItems: 'start' }}>
            <div style={{ border: '1px solid #dbe4f0', borderRadius: '.9rem', background: '#fff', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.65rem', alignItems: 'center', padding: '.85rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#fbfdff' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Estructura del despiece</div>
                  <div style={{ color: '#64748b', fontSize: '.84rem' }}>Selecciona un sistema o componente para trabajar.</div>
                </div>
              </div>
              <div style={{ padding: '1rem', maxHeight: '62vh', overflowY: 'auto' }}>
              <div
                onContextMenu={(event) => openNodeContextMenu(event, null)}
                style={{ marginBottom: '.8rem', padding: '.75rem .8rem', borderRadius: '.75rem', background: selectedNodeId === null ? '#e0f2fe' : '#f8fafc', border: selectedNodeId === null ? '1px solid #7dd3fc' : '1px solid #dbe4f0', cursor: 'pointer' }}
                onClick={() => {
                  setSelectedNodeId(null);
                  resetDespieceForm();
                }}
              >
                <div style={{ fontSize: '.76rem', color: '#0369a1', fontWeight: 800 }}>Equipo base</div>
                <div style={{ fontWeight: 900, color: '#0f172a' }}>{despieceTarget.descripcion || despieceTarget.codigo}</div>
                <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: '.15rem' }}>Desde aqui se crean sistemas principales.</div>
              </div>
              {despieceNodes.length ? renderTree(null, 1) : (
                <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Aún no hay subniveles creados para este equipo.</p>
              )}
              </div>
            </div>

            {nodeEditorOpen && <div className="despiece-editor-backdrop" onClick={closeNodeEditor} />}
            <form className="despiece-node-editor" onSubmit={formMode === 'edit' ? updateSelectedNode : addDespieceNode} style={{ display: nodeEditorOpen ? 'block' : 'none', border: '1px solid #dbe4f0', borderRadius: '.9rem', background: '#fff', overflow: 'hidden', padding: '.95rem' }}>
              <div style={{ marginBottom: '.9rem', padding: '.85rem .9rem', borderRadius: '.75rem', border: selectedNode ? '1px solid #bfdbfe' : '1px solid #d1fae5', background: selectedNode ? '#eff6ff' : '#f0fdf4' }}>
                <div style={{ fontSize: '.78rem', color: selectedNode ? '#1d4ed8' : '#166534', fontWeight: 800, marginBottom: '.2rem' }}>
                  {selectedNode ? 'Nivel seleccionado' : 'Sin nivel seleccionado'}
                </div>
                <div style={{ color: '#0f172a', fontWeight: 900, fontSize: '1rem' }}>
                  {selectedNode ? selectedNode.nombre : 'Crearas un Nivel 1 desde el equipo base'}
                </div>
                <div style={{ color: '#64748b', fontSize: '.84rem', marginTop: '.2rem', lineHeight: 1.4 }}>
                  {selectedNode
                    ? 'Puedes agregar un hijo debajo de este nivel o cargarlo para editarlo.'
                    : 'Selecciona un nivel del arbol para modificarlo o crea un sistema principal desde aqui.'}
                </div>
              </div>

              <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '.75rem' }}>
                {formMode === 'edit' ? 'Editando nivel seleccionado' : `Crear ${selectedNodeId ? 'nivel hijo' : 'nivel principal'}`}
              </h4>
              <p style={{ fontSize: '.8rem', color: '#6b7280', marginBottom: '.55rem' }}>
                Código del nuevo subequipo: <strong>{formMode === 'add' ? getNextChildCode(selectedNodeId) : (selectedNode?.codigo_sub || 'N/A')}</strong>
              </p>
              <div className="form-group" style={{ marginBottom: '.7rem' }}>
                <label className="form-label">Tipo de nivel</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.5rem' }}>
                  {[
                    { value: 'titulo', label: 'Titulo / sistema', helper: 'Ej: Sistema electrico' },
                    { value: 'componente', label: 'Componente', helper: 'Ej: Motor principal 1' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setNewNodeType(option.value)}
                      style={{
                        border: newNodeType === option.value ? '1px solid #2563eb' : '1px solid #d1d5db',
                        background: newNodeType === option.value ? '#eff6ff' : '#fff',
                        color: newNodeType === option.value ? '#1d4ed8' : '#374151',
                        borderRadius: '.45rem',
                        padding: '.6rem .65rem',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>{option.label}</div>
                      <div style={{ fontSize: '.76rem', color: '#64748b', marginTop: '.15rem' }}>{option.helper}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '.7rem' }}>
                <label className="form-label">{newNodeType === 'titulo' ? 'Nombre del titulo / sistema *' : 'Nombre del componente *'}</label>
                <input
                  className="form-input"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  placeholder={newNodeType === 'titulo' ? 'Ej: Sistema electrico, Sistema mecanico' : 'Ej: Motor principal 1, Cableado de fuerza'}
                  required
                />
              </div>
              {!showNoteField ? (
                <button type="button" className="btn btn-secondary" style={{ marginBottom: '.7rem' }} onClick={() => setShowNoteField(true)}>
                  Agregar nota (opcional)
                </button>
              ) : (
                <div className="form-group" style={{ marginBottom: '.7rem' }}>
                  <label className="form-label">Nota general (opcional)</label>
                  <textarea className="form-textarea" value={newNodeDetails} onChange={(e) => setNewNodeDetails(e.target.value)} placeholder="Ej: 15 kW, 1750 rpm, marca ABB..." />
                </div>
              )}
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
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '.65rem', background: '#f8fafc', padding: '.75rem', marginBottom: '.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.65rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.55rem' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>Adjuntos del componente</div>
                    <div style={{ color: '#6b7280', fontSize: '.82rem' }}>Puedes agregar fotos o PDF. Las fotos saldran en anexos al imprimir.</div>
                  </div>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: uploadingAttachment ? 'not-allowed' : 'pointer', opacity: uploadingAttachment ? .65 : 1 }}>
                    {uploadingAttachment ? 'Subiendo...' : 'Agregar adjunto'}
                    <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={uploadingAttachment} onChange={uploadDespieceAttachment} />
                  </label>
                </div>
                {draftAttachments.length ? (
                  <div style={{ display: 'grid', gap: '.5rem' }}>
                    {draftAttachments.map((file, index) => (
                      <div key={file.filename || file.id || index} style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: '.55rem', alignItems: 'center', border: '1px solid #dbe4f0', background: '#fff', borderRadius: '.6rem', padding: '.45rem' }}>
                        {isImageAttachment(file) ? (
                          <img src={file.url} alt={file.original_name || 'Foto'} style={{ width: '46px', height: '46px', borderRadius: '.45rem', objectFit: 'cover', border: '1px solid #e5e7eb' }} />
                        ) : (
                          <div style={{ width: '46px', height: '46px', borderRadius: '.45rem', display: 'grid', placeItems: 'center', background: '#fee2e2', color: '#b91c1c', fontWeight: 900, fontSize: '.78rem' }}>PDF</div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.original_name || file.caption || file.filename || 'Adjunto'}</div>
                          <a href={file.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: '.8rem' }}>Abrir archivo</a>
                        </div>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeDraftAttachment(file)}>
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#64748b', fontSize: '.86rem' }}>Sin adjuntos para este nivel.</div>
                )}
              </div>
              <p style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.9rem' }}>
                Los sistemas creados desde el equipo base son Nivel 1. Si seleccionas un componente y creas un titulo/sistema, se agregara como hermano dentro del sistema actual; solo sera hijo cuando selecciones otro titulo/sistema.
              </p>
              <div style={{ display: 'none', gap: '.55rem', marginBottom: '.9rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={loadSelectedNodeForEdit} disabled={!selectedNodeId || formMode === 'edit'}>
                  Cargar nivel para editar
                </button>
                {formMode === 'edit' && (
                  <button type="button" className="btn btn-secondary" onClick={resetDespieceForm}>
                    Cancelar edicion
                  </button>
                )}
                <button type="button" className="btn btn-danger" onClick={deleteSelectedNode} disabled={!selectedNodeId}>
                  Eliminar nivel seleccionado
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem' }}>
                <button type="button" className="btn btn-secondary" onClick={closeNodeEditor}>Cancelar</button>
                <button type="submit" className="btn btn-primary">
                  {formMode === 'edit' ? 'Guardar cambios nivel' : 'Agregar nivel'}
                </button>
              </div>
            </form>
            {despieceContextMenu && (() => {
              const menuNode = despieceNodes.find((node) => node.id === despieceContextMenu.nodeId) || null;
              const isBase = !menuNode;
              const isTitle = menuNode?.tipo_nodo === 'titulo';
              const menuTitle = isBase ? 'Equipo base' : menuNode.nombre;
              return (
                <div
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    position: 'fixed',
                    left: Math.min(despieceContextMenu.x, window.innerWidth - 260),
                    top: Math.min(despieceContextMenu.y, window.innerHeight - 260),
                    width: '240px',
                    background: '#fff',
                    border: '1px solid #dbe4f0',
                    borderRadius: '.85rem',
                    boxShadow: '0 18px 48px rgba(15,23,42,.22)',
                    zIndex: 1300,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '.7rem .85rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase' }}>Acciones</div>
                    <div style={{ fontWeight: 900, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{menuTitle}</div>
                  </div>
                  <div style={{ padding: '.35rem' }}>
                    {isBase && (
                      <button type="button" onClick={() => openAddNodeEditor(null, 'titulo')} style={{ width: '100%', border: 0, background: 'transparent', padding: '.65rem .7rem', textAlign: 'left', cursor: 'pointer', borderRadius: '.6rem', fontWeight: 800, color: '#1d4ed8' }}>
                        Agregar sistema principal
                      </button>
                    )}
                    {!isBase && isTitle && (
                      <>
                        <button type="button" onClick={() => openAddNodeEditor(menuNode.id, 'titulo')} style={{ width: '100%', border: 0, background: 'transparent', padding: '.65rem .7rem', textAlign: 'left', cursor: 'pointer', borderRadius: '.6rem', fontWeight: 800, color: '#1d4ed8' }}>
                          Agregar sistema dentro
                        </button>
                        <button type="button" onClick={() => openAddNodeEditor(menuNode.id, 'componente')} style={{ width: '100%', border: 0, background: 'transparent', padding: '.65rem .7rem', textAlign: 'left', cursor: 'pointer', borderRadius: '.6rem', fontWeight: 800, color: '#0f766e' }}>
                          Agregar componente
                        </button>
                      </>
                    )}
                    {!isBase && !isTitle && (
                      <button type="button" onClick={() => openAddNodeEditor(menuNode.id, 'componente')} style={{ width: '100%', border: 0, background: 'transparent', padding: '.65rem .7rem', textAlign: 'left', cursor: 'pointer', borderRadius: '.6rem', fontWeight: 800, color: '#0f766e' }}>
                        Agregar componente hijo
                      </button>
                    )}
                    {!isBase && (
                      <>
                        <button type="button" onClick={() => openEditNodeEditor(menuNode.id)} style={{ width: '100%', border: 0, background: 'transparent', padding: '.65rem .7rem', textAlign: 'left', cursor: 'pointer', borderRadius: '.6rem', fontWeight: 800, color: '#334155' }}>
                          Editar seleccionado
                        </button>
                        <button type="button" onClick={() => { setDespieceContextMenu(null); deleteSelectedNode(); }} style={{ width: '100%', border: 0, background: 'transparent', padding: '.65rem .7rem', textAlign: 'left', cursor: 'pointer', borderRadius: '.6rem', fontWeight: 800, color: '#dc2626' }}>
                          Eliminar seleccionado
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
          </div>
        </Modal>
      )}

      {showExchangeModal && (
        <Modal title="Intercambio de subequipos" maxWidth="760px" onClose={() => setShowExchangeModal(false)}>
          <div style={{ display: 'grid', gap: '.8rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Equipo origen</label>
              <select className="form-select" value={exchangeSourceId || ''} onChange={(e) => { setExchangeSourceId(Number(e.target.value)); setExchangeNodeId(''); }}>
                {equipos.map((eq) => <option key={`source-${eq.id}`} value={eq.id}>{eq.codigo} - {eq.descripcion}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Subequipo a intercambiar</label>
              <select className="form-select" value={exchangeNodeId} onChange={(e) => setExchangeNodeId(e.target.value)}>
                <option value="">Selecciona un subequipo...</option>
                {exchangeSourceNodes.map((node) => (
                  <option key={`node-${node.id}`} value={node.id}>{node.codigo_sub || '-'} | {node.nombre}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Equipo destino</label>
              <select className="form-select" value={exchangeTargetId || ''} onChange={(e) => setExchangeTargetId(Number(e.target.value))}>
                {equipos.filter((eq) => eq.id !== Number(exchangeSourceId)).map((eq) => (
                  <option key={`target-${eq.id}`} value={eq.id}>{eq.codigo} - {eq.descripcion}</option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: '.84rem', color: '#6b7280' }}>
              Se migrará el subequipo seleccionado con todos sus niveles hijos manteniendo su codificación original para trazabilidad de origen.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowExchangeModal(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={migrateSubtree} disabled={!exchangeNodeId || !exchangeTargetId}>
                Confirmar intercambio
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
