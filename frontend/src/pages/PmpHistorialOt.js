import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { formatDateDisplay } from '../utils/dateFormat';
import { isReadOnlyRole } from '../utils/roleAccess';
import { filterRowsByColumns } from '../utils/tableFilters';
import { DEFAULT_OT_PDF_SETTINGS, normalizeOtPdfSettings, openIndustrialOtReportPdf } from '../utils/otPdfReport';
import { DEFAULT_MATERIALS, normalizeMaterialsCatalog } from '../utils/materialsCatalog';
import { downloadSpreadsheetTemplate } from '../utils/importUtils';

const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;
const PDF_FORMAT_KEY = SHARED_DOCUMENT_KEYS.otPdfFormat;
const MATERIALES_KEY = SHARED_DOCUMENT_KEYS.materials;
const HISTORY_COLUMN_PREF_PREFIX = 'pmp_historial_ot_visible_columns_v2';

const openCloseReportPdf = (alert, reports, materialsCatalog, pdfSettings) => {
  openIndustrialOtReportPdf(alert, reports, materialsCatalog, pdfSettings);
};

const firstText = (...values) => {
  const found = values.find((value) => String(value ?? '').trim());
  return String(found ?? 'N.A.').trim() || 'N.A.';
};

const yesNo = (value) => (value ? 'Si' : 'No');

const joinList = (values, empty = 'N.A.') => {
  const items = (Array.isArray(values) ? values : [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return items.length ? items.join(', ') : empty;
};

const noticeCodes = (it) => joinList([
  it.aviso_numero,
  it.aviso_codigo,
  it.notice_code,
  it.aviso_id,
  ...(Array.isArray(it.avisos_generados) ? it.avisos_generados : []),
  ...(Array.isArray(it.avisos_generados_detalle) ? it.avisos_generados_detalle.map((notice) => notice.aviso_codigo) : []),
], 'N.A.');

const noticeCategories = (it) => joinList([
  it.aviso_origen?.categoria,
  ...(Array.isArray(it.avisos_generados_detalle) ? it.avisos_generados_detalle.map((notice) => notice.categoria) : []),
], 'N.A.');

const noticeDetails = (it) => joinList([
  it.aviso_origen?.detalle,
  it.aviso_origen?.sugerencia_texto,
  ...(Array.isArray(it.avisos_generados_detalle) ? it.avisos_generados_detalle.map((notice) => notice.detalle || notice.sugerencia_texto) : []),
], 'N.A.');

const sumReports = (reports, getter) => (Array.isArray(reports) ? reports : [])
  .reduce((sum, item) => {
    const value = Number(getter(item));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

export default function PmpHistorialOt() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isReadOnly = isReadOnlyRole(user);
  const [items, setItems] = useState([]);
  const [pdfSettings, setPdfSettings] = useState(DEFAULT_OT_PDF_SETTINGS);
  const [materialsCatalog, setMaterialsCatalog] = useState(DEFAULT_MATERIALS);
  const equipmentQuery = searchParams.get('equipo') || '';
  const [query, setQuery] = useState(equipmentQuery);
  const [loading, setLoading] = useState(true);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState(null);

  useEffect(() => {
    if (equipmentQuery) setQuery(equipmentQuery);
  }, [equipmentQuery]);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadSharedDocument(OT_HISTORY_KEY, []),
      loadSharedDocument(PDF_FORMAT_KEY, DEFAULT_OT_PDF_SETTINGS),
      loadSharedDocument(MATERIALES_KEY, DEFAULT_MATERIALS),
    ]).then(([data, pdfFormatData, materialsData]) => {
      if (!active) return;
      setItems(Array.isArray(data) ? data : []);
      setPdfSettings(normalizeOtPdfSettings(pdfFormatData));
      setMaterialsCatalog(normalizeMaterialsCatalog(materialsData));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => items.filter((it) => (
    `${it.ot_numero} ${noticeCodes(it)} ${noticeCategories(it)} ${noticeDetails(it)} ${it.codigo} ${it.descripcion} ${it.area_trabajo} ${it.responsable} ${it.personal_mantenimiento}`.toLowerCase().includes(query.toLowerCase())
  )), [items, query]);

  const historyTableColumns = useMemo(() => ([
    { id: 'fecha_cierre', label: 'Fecha cierre', getValue: (it) => formatDateDisplay(it.fecha_cierre || '', 'N.A.') },
    { id: 'fecha_inicio', label: 'Fecha inicio', getValue: (it) => formatDateDisplay(it.cierre_ot?.fecha_inicio || it.registro_ot?.fecha_inicio || '', 'N.A.') },
    { id: 'hora_inicio', label: 'Hora inicio', getValue: (it) => it.cierre_ot?.hora_inicio || it.registro_ot?.hora_inicio || 'N.A.' },
    { id: 'fecha_fin', label: 'Fecha fin', getValue: (it) => formatDateDisplay(it.cierre_ot?.fecha_fin || it.registro_ot?.fecha_fin || it.fecha_ejecucion || '', 'N.A.') },
    { id: 'hora_fin', label: 'Hora fin', getValue: (it) => it.cierre_ot?.hora_fin || it.registro_ot?.hora_fin || 'N.A.' },
    { id: 'codigo', label: 'Codigo', getValue: (it) => it.codigo || 'N.A.' },
    { id: 'descripcion', label: 'Descripcion', getValue: (it) => it.descripcion || 'N.A.' },
    { id: 'area', label: 'Area', getValue: (it) => it.area_trabajo || 'N.A.' },
    { id: 'ot_numero', label: '# OT', getValue: (it) => it.ot_numero || 'N.A.' },
    { id: 'aviso_numero', label: 'N aviso', getValue: noticeCodes },
    { id: 'aviso_categoria', label: 'Categoria aviso', getValue: noticeCategories },
    { id: 'aviso_detalle', label: 'Detalle aviso', getValue: noticeDetails },
    { id: 'fecha_emision_aviso', label: 'Emision aviso', getValue: (it) => formatDateDisplay(firstText(it.fecha_emision_aviso, it.aviso_origen?.fecha_aviso, it.aviso_origen?.created_at, ''), 'N.A.') },
    { id: 'hora_emision_aviso', label: 'Hora aviso', getValue: (it) => firstText(it.hora_emision_aviso, it.aviso_origen?.hora_evidencia) },
    { id: 'fecha_aceptacion_aviso', label: 'Aceptacion aviso', getValue: (it) => formatDateDisplay(firstText(it.fecha_aceptacion_aviso, it.aviso_origen?.accepted_at, ''), 'N.A.') },
    { id: 'aviso_aceptado_por', label: 'Aviso aceptado por', getValue: (it) => firstText(it.aviso_aceptado_por, it.aviso_origen?.accepted_by_name) },
    { id: 'criticidad_aviso', label: 'Criticidad aviso', getValue: (it) => firstText(it.criticidad_aviso, it.aviso_origen?.criticidad_aviso) },
    { id: 'fecha_programada', label: 'Programada', getValue: (it) => formatDateDisplay(it.fecha_programada || it.fecha_ejecutar || '', 'N.A.') },
    { id: 'fecha_reprogramacion', label: 'Reprogramada', getValue: (it) => formatDateDisplay(it.fecha_reprogramacion || '', 'N.A.') },
    { id: 'motivo_reprogramacion', label: 'Motivo reprogram.', getValue: (it) => it.motivo_reprogramacion || 'N.A.' },
    { id: 'fecha_liberacion', label: 'Liberacion OT', getValue: (it) => formatDateDisplay(it.fecha_liberacion_ot || it.registro_ot?.fecha_liberacion || '', 'N.A.') },
    { id: 'liberado_por', label: 'Liberado por', getValue: (it) => firstText(it.liberado_por, it.registro_ot?.liberado_por) },
    { id: 'solicitud_cierre', label: 'Solicitud cierre', getValue: (it) => formatDateDisplay(it.cierre_ot?.solicitud_cierre_fecha || '', 'N.A.') },
    { id: 'solicitud_cierre_por', label: 'Solicitud por', getValue: (it) => firstText(it.cierre_ot?.solicitud_cierre_por) },
    { id: 'cerrado_por', label: 'Cerrado por', getValue: (it) => firstText(it.cierre_ot?.cerrado_por, it.cierre_ot?.aprobado_por, it.cierre_ot?.supervisor_cierre) },
    { id: 'vc', label: 'Var. Ctrl', getValue: (it) => firstText(it.vc, it.origen_programacion, 'Dia') },
    { id: 'tipo_mantto', label: 'Tipo mantto', getValue: (it) => it.cierre_ot?.tipo_mantenimiento || it.tipo_mantto || 'N.A.' },
    { id: 'prioridad', label: 'Prioridad', getValue: (it) => it.prioridad || 'N.A.' },
    { id: 'status_ot', label: 'Status cierre', getValue: (it) => it.status_ot || 'N.A.' },
    { id: 'puesto_resp', label: 'Puesto trabajo resp.', getValue: (it) => it.cierre_ot?.puesto_trabajo_resp || it.responsable || 'N.A.' },
    { id: 'solicitante', label: 'Solicitante', getValue: (it) => firstText(it.solicitante, it.responsable) },
    { id: 'ejecuta', label: 'Ejecuta', getValue: (it) => firstText(it.personal_mantenimiento, it.cierre_ot?.puesto_trabajo_resp) },
    { id: 'personal', label: 'Personal de trabajo', getValue: (it) => it.personal_mantenimiento || 'N.A.' },
    { id: 'materiales', label: 'Materiales', getValue: (it) => it.materiales || 'N.A.' },
    { id: 'reportes', label: 'Notificaciones trabajo', getValue: (it) => String((it.reportes_trabajo || []).length || 0) },
    { id: 'evidencia_fotos', label: 'Evidencias foto', getValue: (it) => {
      const reports = it.reportes_trabajo || [];
      const before = reports.filter((report) => report.beforePhoto || report.foto_antes_url).length;
      const after = reports.filter((report) => report.afterPhoto || report.foto_despues_url).length;
      return `${before} antes / ${after} despues`;
    } },
    { id: 'tiempo_efectivo', label: 'Tiempo efectivo (Hh)', getValue: (it) => it.cierre_ot?.tiempo_efectivo_hh ?? '0' },
    { id: 'indisponible_generico', label: 'T. indisponible generico', getValue: (it) => it.cierre_ot?.tiempo_indisponible_generico ?? '0' },
    { id: 'indisponible_operacional', label: 'T. indisponible operacional', getValue: (it) => it.cierre_ot?.tiempo_indisponible_operacional ?? '0' },
    { id: 'estado_equipo', label: 'Estado equipo', getValue: (it) => it.cierre_ot?.estado_equipo || 'N.A.' },
    { id: 'satisfaccion', label: 'Satisfaccion', getValue: (it) => it.cierre_ot?.satisfaccion || 'N.A.' },
    { id: 'mano_obra', label: 'Mano de obra', getValue: (it) => `S/ ${sumReports(it.reportes_trabajo, (report) => report.laborCost || report.costo_mano_obra || 0).toFixed(2)}` },
    { id: 'costo_materiales', label: 'Costo materiales', getValue: (it) => `S/ ${sumReports(it.reportes_trabajo, (report) => report.materialCost || report.costo_materiales || 0).toFixed(2)}` },
    { id: 'costo_servicios', label: 'Costo servicios', getValue: (it) => `S/ ${sumReports(it.reportes_trabajo, (report) => report.serviceCost || report.costo_servicio || 0).toFixed(2)}` },
    { id: 'componente', label: 'Componente', getValue: (it) => it.cierre_ot?.componente_intervenido || 'N.A.' },
    { id: 'modo_falla', label: 'Modo falla', getValue: (it) => it.cierre_ot?.modo_falla || 'N.A.' },
    { id: 'causa_raiz', label: 'Causa raiz', getValue: (it) => it.cierre_ot?.causa_raiz || 'N.A.' },
    { id: 'accion_correctiva', label: 'Accion correctiva', getValue: (it) => it.cierre_ot?.accion_correctiva || 'N.A.' },
    { id: 'recomendacion', label: 'Recomendacion tecnica', getValue: (it) => it.cierre_ot?.recomendacion_tecnica || 'N.A.' },
    { id: 'requiere_parada', label: 'Requiere parada', getValue: (it) => yesNo(it.requiere_parada || it.aviso_origen?.requires_stop) },
    { id: 'riesgo_seguridad', label: 'Riesgo seguridad', getValue: (it) => yesNo(it.riesgo_seguridad || it.aviso_origen?.has_safety_risk) },
    { id: 'impacto_produccion', label: 'Impacto produccion', getValue: (it) => yesNo(it.impacto_produccion || it.aviso_origen?.has_production_impact) },
    { id: 'observaciones', label: 'Observaciones', getValue: (it) => it.cierre_ot?.observaciones || it.registro_ot?.observaciones || 'N.A.' },
    { id: 'pdf', label: 'PDF', filterable: false },
  ]), []);

  const defaultColumnIds = useMemo(
    () => historyTableColumns.map((column) => column.id),
    [historyTableColumns],
  );

  const essentialColumnIds = useMemo(() => ([
    'fecha_cierre',
    'fecha_inicio',
    'hora_inicio',
    'fecha_fin',
    'hora_fin',
    'codigo',
    'descripcion',
    'area',
    'ot_numero',
    'aviso_numero',
    'tipo_mantto',
    'prioridad',
    'status_ot',
    'puesto_resp',
    'personal',
    'tiempo_efectivo',
    'estado_equipo',
    'modo_falla',
    'causa_raiz',
    'observaciones',
    'pdf',
  ]), []);

  const defaultVisibleColumnIds = useMemo(
    () => defaultColumnIds.filter((id) => essentialColumnIds.includes(id)),
    [defaultColumnIds, essentialColumnIds],
  );

  const columnPreferenceKey = useMemo(() => {
    const userKey = String(user?.id || user?.username || user?.full_name || 'anonimo')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_') || 'anonimo';
    return `${HISTORY_COLUMN_PREF_PREFIX}_${userKey}`;
  }, [user]);

  useEffect(() => {
    const columnIds = new Set(defaultColumnIds);
    let savedIds = [];
    let knownIds = [];
    try {
      const saved = JSON.parse(localStorage.getItem(columnPreferenceKey) || '[]');
      if (Array.isArray(saved)) {
        savedIds = saved.filter((id) => columnIds.has(id));
        knownIds = savedIds;
      } else {
        savedIds = Array.isArray(saved?.visibleIds) ? saved.visibleIds.filter((id) => columnIds.has(id)) : [];
        knownIds = Array.isArray(saved?.knownIds) ? saved.knownIds.filter((id) => columnIds.has(id)) : savedIds;
      }
    } catch (error) {
      savedIds = [];
      knownIds = [];
    }
    const knownSet = new Set(knownIds);
    const newColumnIds = defaultColumnIds.filter((id) => !knownSet.has(id));
    setVisibleColumnIds(savedIds.length ? [...savedIds, ...newColumnIds] : defaultVisibleColumnIds);
  }, [columnPreferenceKey, defaultColumnIds, defaultVisibleColumnIds]);

  useEffect(() => {
    if (!visibleColumnIds) return;
    localStorage.setItem(columnPreferenceKey, JSON.stringify({
      visibleIds: visibleColumnIds,
      knownIds: defaultColumnIds,
    }));
  }, [columnPreferenceKey, defaultColumnIds, visibleColumnIds]);

  const visibleTableColumns = useMemo(() => {
    const ids = new Set(visibleColumnIds || defaultVisibleColumnIds);
    const columns = historyTableColumns.filter((column) => ids.has(column.id));
    return columns.length ? columns : historyTableColumns;
  }, [defaultVisibleColumnIds, historyTableColumns, visibleColumnIds]);

  const {
    filters: historyFilters,
    setFilter: setHistoryFilter,
  } = useTableColumnFilters(visibleTableColumns);

  const visibleRows = useMemo(
    () => filterRowsByColumns(filtered, visibleTableColumns, historyFilters),
    [filtered, visibleTableColumns, historyFilters],
  );

  const hiddenColumnsCount = Math.max(0, historyTableColumns.length - visibleTableColumns.length);

  const toggleColumnVisibility = (columnId) => {
    setVisibleColumnIds((current) => {
      const currentIds = current || defaultColumnIds;
      const isVisible = currentIds.includes(columnId);
      if (isVisible && currentIds.length <= 1) return currentIds;
      return isVisible
        ? currentIds.filter((id) => id !== columnId)
        : defaultColumnIds.filter((id) => id === columnId || currentIds.includes(id));
    });
  };

  const showAllColumns = () => setVisibleColumnIds(defaultColumnIds);

  const showEssentialColumns = () => setVisibleColumnIds(defaultVisibleColumnIds);

  const exportHistory = () => {
    if (!items.length) {
      window.alert('No hay registros de historial OT para exportar.');
      return;
    }

    const exportColumns = visibleTableColumns.filter((column) => column.id !== 'pdf');
    if (!exportColumns.length) {
      window.alert('Activa al menos una columna de datos para exportar.');
      return;
    }
    const headers = exportColumns.map((column) => column.label);
    const rows = items.map((item) => {
      const row = {};
      exportColumns.forEach((column) => {
        row[column.label] = column.getValue?.(item) ?? 'N.A.';
      });
      return row;
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadSpreadsheetTemplate(`historial_ot_${stamp}.xlsx`, headers, rows, 'Historial OT');
  };

  const clearHistory = async () => {
    if (isReadOnly) return;
    if (!window.confirm('Seguro que deseas limpiar el historial de OTs cerradas?')) return;
    await saveSharedDocument(OT_HISTORY_KEY, []);
    setItems([]);
  };

  const reloadHistory = async () => {
    const [historyData, pdfFormatData, materialsData] = await Promise.all([
      loadSharedDocument(OT_HISTORY_KEY, []),
      loadSharedDocument(PDF_FORMAT_KEY, DEFAULT_OT_PDF_SETTINGS),
      loadSharedDocument(MATERIALES_KEY, DEFAULT_MATERIALS),
    ]);
    setItems(Array.isArray(historyData) ? historyData : []);
    setPdfSettings(normalizeOtPdfSettings(pdfFormatData));
    setMaterialsCatalog(normalizeMaterialsCatalog(materialsData));
  };

  const handleRegeneratePdf = (item) => {
    openCloseReportPdf(item, item.reportes_trabajo || [], materialsCatalog, pdfSettings);
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
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Historial de OTs</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Aqui se guardan las ordenes cerradas para revision historica.</p>

      {isReadOnly && (
        <ReadOnlyAccessNotice message="Puedes revisar el historial y regenerar PDFs de cierre, pero este perfil no puede limpiar registros del historial." />
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        {equipmentQuery && (
          <div style={{ marginBottom: '.75rem', display: 'flex', gap: '.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#64748b', fontSize: '.9rem' }}>Filtro recibido desde indicadores:</span>
            <strong style={{ color: '#1d4ed8' }}>{equipmentQuery}</strong>
          </div>
        )}
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="form-input" style={{ maxWidth: '420px' }} placeholder="Buscar por OT, codigo, descripcion, area..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={() => setShowColumnPicker((current) => !current)}>
            Columnas ({visibleTableColumns.length})
          </button>
          <button type="button" className="btn btn-primary" onClick={exportHistory} disabled={!items.length}>Exportar vista</button>
          <button type="button" className="btn btn-secondary" onClick={reloadHistory}>Recargar</button>
          {!isReadOnly && <button type="button" className="btn btn-danger" onClick={clearHistory}>Limpiar historial</button>}
        </div>
        <div style={{ marginTop: '.6rem', color: '#64748b', fontSize: '.88rem' }}>
          {hiddenColumnsCount ? `${hiddenColumnsCount} columna(s) ocultas. La exportacion respetara esta vista.` : 'Todas las columnas estan visibles.'}
        </div>
        {showColumnPicker && (
          <div style={{ marginTop: '.85rem', border: '1px solid #dbe4f0', borderRadius: '.85rem', padding: '.85rem', background: '#f8fafc' }}>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: '.75rem' }}>
              <div>
                <strong>Columnas visibles</strong>
                <p style={{ margin: '.15rem 0 0', color: '#64748b', fontSize: '.86rem' }}>
                  Esta configuracion queda guardada para {user?.full_name || user?.username || 'este usuario'}.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={showEssentialColumns}>Vista esencial</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={showAllColumns}>Mostrar todo</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '.45rem' }}>
              {historyTableColumns.map((column) => {
                const checked = visibleTableColumns.some((visibleColumn) => visibleColumn.id === column.id);
                return (
                  <label
                    key={`toggle-${column.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.45rem',
                      padding: '.48rem .55rem',
                      borderRadius: '.6rem',
                      border: checked ? '1px solid #93c5fd' : '1px solid #e5e7eb',
                      background: checked ? '#eff6ff' : '#fff',
                      color: checked ? '#1d4ed8' : '#475569',
                      fontWeight: checked ? 700 : 600,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumnVisibility(column.id)}
                    />
                    <span>{column.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${Math.max(900, visibleTableColumns.length * 115)}px` }}>
          <thead>
            <tr style={{ background: '#0b5c8c', color: '#fff' }}>
              {visibleTableColumns.map((column) => (
                <th key={column.id} style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', fontSize: '.8rem', textAlign: 'left' }}>{column.label}</th>
              ))}
            </tr>
            <TableFilterRow columns={visibleTableColumns} rows={filtered} filters={historyFilters} onChange={setHistoryFilter} dark />
          </thead>
          <tbody>
            {visibleRows.map((it) => (
              <tr key={it.id}>
                {visibleTableColumns.map((column) => (
                  <td key={`${it.id}-${column.id}`} style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem', verticalAlign: 'top' }}>
                    {column.id === 'pdf' ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRegeneratePdf(it)}>
                        Generar PDF
                      </button>
                    ) : (
                      column.getValue?.(it) ?? 'N.A.'
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!visibleRows.length && (
              <tr>
                <td colSpan={visibleTableColumns.length} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #d1d5db' }}>
                  No hay OTs cerradas que coincidan con los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
