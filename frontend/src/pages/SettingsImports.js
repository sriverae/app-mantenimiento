import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { createUser, getUsers, uploadPhotoAttachment } from '../services/api';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import {
  buildPackageDraftFromPdf,
  downloadSpreadsheetTemplate,
  extractActivitiesFromPdfText,
  extractPdfText,
  mapEquipmentRows,
  mapMaintenancePlanRows,
  mapMaterialsRows,
  mapOtHistoryRows,
  mapPackageRows,
  mapRrhhRows,
  mergeByKey,
  parseSpreadsheetFile,
  splitTextList,
} from '../utils/importUtils';
import SettingsNav from '../components/SettingsNav';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { SETTINGS_IMPORT_DESCRIPTIONS, SETTINGS_SECTIONS } from '../utils/settingsSections';
import { filterRowsByColumns } from '../utils/tableFilters';

const VALID_SECTIONS = SETTINGS_SECTIONS.filter((item) => item.importable).map((item) => item.key);
const IMPORTABLE_SECTIONS = VALID_SECTIONS;
const DEFAULT_PASSWORD = 'Manto2026!';

const EMPTY_IMPORT_STATE = {
  mode: 'upsert',
  fileName: '',
  headers: [],
  items: [],
  columns: [],
  userDrafts: [],
  warnings: [],
  error: '',
  success: '',
  parsing: false,
  importing: false,
};

const EMPTY_HISTORY_PDF_STATE = {
  files: [],
  uploading: false,
  error: '',
};

const EMPTY_EQUIPMENT_PHOTO_STATE = {
  files: [],
  uploading: false,
  error: '',
};

const ALLOWED_EQUIPMENT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const SECTION_TITLES = {
  'historial-ot': 'Importacion de Historial de OT',
  cronograma: 'Importacion de Cronograma de mantenimiento',
  equipos: 'Importacion de Equipos',
  paquetes: 'Importacion de Paquetes de mantenimiento',
  materiales: 'Importacion de Materiales',
  personal: 'Importacion de Personal y usuarios',
};

const SECTION_TEMPLATES = {
  'historial-ot': [
    'fecha_inicio',
    'hora_inicio',
    'fecha_fin',
    'hora_fin',
    'ot_numero',
    'codigo',
    'descripcion',
    'area_trabajo',
    'fecha_cierre',
    'vc',
    'contador',
    'tiempo_indisponible_generico',
    'tiempo_indisponible_operacional',
    'tiempo_efectivo_hh',
    'tipo_mantenimiento',
    'puesto_trabajo_responsable',
    'personal_mantenimiento',
    'gastos_personal',
    'nombre_terceros',
    'gastos_terceros',
    'actividad_mantenimiento',
    'materiales',
    'gastos_repuestos',
    'observaciones',
    'evaluacion',
    'estado_equipo',
    'tipo_ot',
    'reprogramacion',
  ],
  cronograma: [
    'codigo',
    'equipo',
    'prioridad',
    'frecuencia',
    'responsable',
    'fecha_inicio',
    'dias_anticipacion_alerta',
    'actividades',
  ],
  equipos: [
    'codigo',
    'descripcion',
    'area_trabajo',
    'criticidad',
    'marca',
    'capacidad',
    'potencia_kw',
    'amperaje',
    'voltaje_trabajo',
    'estado',
  ],
  paquetes: ['codigo', 'vc', 'nombre', 'tiempo_min', 'actividades'],
  materiales: ['codigo', 'descripcion', 'marca', 'proveedor', 'stock', 'unidad', 'costo_unit', 'stock_min'],
  personal: ['codigo', 'nombres_apellidos', 'cargo', 'especialidad', 'tipo_personal', 'empresa', 'identificacion', 'capacidad_hh_dia', 'costo_hora', 'email', 'usuario', 'rol_usuario', 'password'],
};

const TEMPLATE_SAMPLE_ROWS = {
  'historial-ot': [
    {
      ot_numero: 'OT-2026-000125',
      codigo: 'IAISPL1',
      descripcion: 'Pre Limpia Sabreca N 1',
      area_trabajo: 'Secado',
      responsable: 'Mecanico',
      tipo_mantenimiento: 'Preventivo',
      fecha_inicio: '2026-04-01',
      hora_inicio: '07:00',
      fecha_fin: '2026-04-01',
      hora_fin: '10:30',
      fecha_cierre: '2026-04-01',
      vc: 'V.C - DIA',
      contador: '0',
      tiempo_indisponible_generico: '0',
      tiempo_indisponible_operacional: '0',
      puesto_trabajo_responsable: 'Mecanico',
      personal_mantenimiento: 'MEC-1 | ELE-1',
      gastos_personal: '120.00',
      nombre_terceros: 'N.A.',
      gastos_terceros: '0.00',
      actividad_mantenimiento: 'Inspeccion visual general; Limpieza de componentes',
      materiales: 'PRD0000001 x 1',
      gastos_repuestos: '136.67',
      tiempo_efectivo_hh: '7.5',
      observaciones: 'OT historica importada desde Excel.',
      evaluacion: 'Conforme',
      estado_equipo: 'Operativo',
      tipo_ot: 'Preventiva',
      reprogramacion: 'No',
    },
  ],
  cronograma: [
    {
      codigo: 'IAISPL1',
      equipo: 'Pre Limpia Sabreca N 1',
      prioridad: 'Alta',
      frecuencia: 'Mensual',
      responsable: 'Mecanico',
      fecha_inicio: '2026-04-01',
      dias_anticipacion_alerta: '5',
      actividades: 'Inspeccion visual general; Limpieza de componentes; Verificacion de ajuste de pernos',
    },
  ],
  equipos: [
    {
      codigo: 'IAISPL1',
      descripcion: 'Pre Limpia Sabreca N 1',
      area_trabajo: 'Secado',
      criticidad: 'Alta',
      marca: 'Sabreca',
      capacidad: 'N.A.',
      potencia_kw: '2.2',
      amperaje: '11.5 / 5.9 A',
      voltaje_trabajo: '220 / 440 V',
      estado: 'Operativo',
    },
  ],
  paquetes: [
    {
      codigo: 'PK-SEC-001',
      vc: 'V.C - DIA',
      nombre: 'SECADO_ELEVADOR',
      tiempo_min: '60',
      actividades: 'Inspeccion visual general; Limpieza de componentes; Verificacion de ajuste de pernos',
    },
  ],
  materiales: [
    {
      codigo: 'PRD0000001',
      descripcion: 'ACEITE 15W40 CAT X 5 GL',
      marca: 'CAT',
      proveedor: 'Proveedor ejemplo',
      stock: '25',
      unidad: 'GLN',
      costo_unit: '136.67',
      stock_min: '5',
    },
  ],
  personal: [
    {
      codigo: 'MEC-1',
      nombres_apellidos: 'Manuel de la Cruz Jimenez',
      cargo: 'Tecnico',
      especialidad: 'Mecanico',
      tipo_personal: 'Propio',
      empresa: 'N.A.',
      identificacion: '12345678',
      capacidad_hh_dia: '12',
      costo_hora: '6.94',
      email: 'mecanico1@empresa.com',
      usuario: 'mec1',
      rol_usuario: 'TECNICO',
      password: 'Manto2026!',
    },
  ],
};

const PREVIEW_COLUMNS = {
  'historial-ot': ['ot_numero', 'codigo', 'descripcion', 'fecha_inicio', 'hora_inicio', 'fecha_fin', 'hora_fin', 'tiempo_efectivo_hh'],
  cronograma: ['codigo', 'equipo', 'frecuencia', 'fecha_inicio', 'dias_anticipacion_alerta', 'responsable'],
  equipos: ['codigo', 'descripcion', 'area_trabajo', 'criticidad', 'estado'],
  paquetes: ['codigo', 'nombre', 'vc', 'tiempo_min', 'actividades'],
  materiales: ['codigo', 'descripcion', 'stock', 'unidad', 'costo_unit'],
  personal: ['codigo', 'nombres_apellidos', 'especialidad', 'usuario', 'rol_usuario'],
};

const normalizeOtReference = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\.[^.]+$/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

const numericOtReference = (value) => String(value || '').replace(/\D/g, '');

const extractOtReferenceFromPdfName = (fileName) => {
  const baseName = String(fileName || '').replace(/\.[^.]+$/i, '');
  const explicitMatch = baseName.match(/OT[\s._-]*\d{2,4}[\s._-]*\d{3,}/i);
  const numericMatch = baseName.match(/\d{2,4}[\s._-]*\d{3,}/);
  const rawReference = explicitMatch?.[0] || numericMatch?.[0] || baseName;
  return {
    raw: rawReference.trim(),
    key: normalizeOtReference(rawReference),
    numericKey: numericOtReference(rawReference),
  };
};

const describeHistoryPdfFile = (file) => {
  const reference = extractOtReferenceFromPdfName(file?.name || '');
  return {
    file,
    name: file?.name || '',
    size: file?.size || 0,
    contentType: file?.type || 'application/pdf',
    otReference: reference.raw,
    otKey: reference.key,
    numericKey: reference.numericKey,
  };
};

const historyItemOtKey = (item) => normalizeOtReference(item?.ot_numero || item?.numero_ot || item?.ot || '');

const historyItemNumericOtKey = (item) => numericOtReference(item?.ot_numero || item?.numero_ot || item?.ot || '');

const pdfMatchesHistoryItem = (pdf, item) => {
  const itemKey = historyItemOtKey(item);
  const itemNumericKey = historyItemNumericOtKey(item);
  if (!itemKey) return false;
  if (pdf.otKey === itemKey) return true;
  if (pdf.otKey.length >= 8 && (pdf.otKey.includes(itemKey) || itemKey.includes(pdf.otKey))) return true;
  return Boolean(itemNumericKey && pdf.numericKey && pdf.numericKey === itemNumericKey);
};

const findPdfMatchesForHistoryItem = (pdfFiles, item) => (
  (Array.isArray(pdfFiles) ? pdfFiles : []).filter((pdf) => pdfMatchesHistoryItem(pdf, item))
);

const describeEquipmentPhotoFile = (file) => ({
  file,
  name: file?.name || '',
  size: file?.size || 0,
  contentType: file?.type || 'image/jpeg',
  key: normalizeOtReference(file?.name || ''),
});

const equipmentReferenceKeys = (item) => [
  normalizeOtReference(item?.codigo),
  normalizeOtReference(item?.descripcion),
].filter(Boolean);

const photoMatchesEquipmentItem = (photo, item) => {
  const photoKey = photo?.key || '';
  if (!photoKey) return false;
  return equipmentReferenceKeys(item).some((key) => key && (
    photoKey === key || photoKey.includes(key) || key.includes(photoKey)
  ));
};

const findPhotoMatchesForEquipmentItem = (photoFiles, item) => (
  (Array.isArray(photoFiles) ? photoFiles : []).filter((photo) => photoMatchesEquipmentItem(photo, item))
);


function SummaryCard({ label, value, color = '#111827' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

function TemplateChips({ items }) {
  return (
    <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', marginTop: '.65rem' }}>
      {items.map((item) => (
        <span
          key={item}
          style={{
            padding: '.35rem .65rem',
            borderRadius: '999px',
            background: '#f8fafc',
            border: '1px solid #e5e7eb',
            color: '#475569',
            fontSize: '.82rem',
            fontWeight: 600,
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function ModeSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', color: '#374151', fontWeight: 600 }}>
        <input type="radio" checked={value === 'upsert'} onChange={() => onChange('upsert')} />
        Anexar y actualizar coincidencias
      </label>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', color: '#374151', fontWeight: 600 }}>
        <input type="radio" checked={value === 'replace'} onChange={() => onChange('replace')} />
        Reemplazar todo el modulo
      </label>
    </div>
  );
}

function formatPreviewValue(value) {
  if (Array.isArray(value)) {
    if (!value.length) return 'N.A.';
    if (value.length <= 3) return value.join(' | ');
    return `${value.slice(0, 3).join(' | ')} +${value.length - 3}`;
  }
  if (value === null || value === undefined || value === '') return 'N.A.';
  return String(value);
}

function PreviewTable({ rows, columns }) {
  const previewFilterColumns = useMemo(
    () => columns.map((column) => ({
      id: column,
      label: column,
      getValue: (row) => formatPreviewValue(row[column]),
    })),
    [columns],
  );
  const previewFilters = useTableColumnFilters(previewFilterColumns);
  const visibleRows = useMemo(
    () => filterRowsByColumns(rows, previewFilterColumns, previewFilters.filters),
    [rows, previewFilterColumns, previewFilters.filters],
  );

  if (!rows.length) return null;
  return (
    <div className="card" style={{ overflowX: 'auto', marginTop: '1rem' }}>
      <div style={{ fontWeight: 700, color: '#111827', marginBottom: '.75rem' }}>Vista previa de importacion</div>
      <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0b5c8c', color: '#fff' }}>
            {columns.map((column) => (
              <th key={column} style={{ padding: '.55rem .6rem', border: '1px solid #2f6fb2', textAlign: 'left', fontSize: '.82rem' }}>
                {column}
              </th>
            ))}
          </tr>
          <TableFilterRow columns={previewFilterColumns} rows={rows} filters={previewFilters.filters} onChange={previewFilters.setFilter} dark />
        </thead>
        <tbody>
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={{ padding: '.75rem', border: '1px solid #dbe4f0', color: '#64748b', textAlign: 'center' }}>
                No hay filas para los filtros aplicados.
              </td>
            </tr>
          )}
          {visibleRows.map((row, index) => (
            <tr key={`${index}_${row.id || row.codigo || row.ot_numero || 'row'}`} style={{ background: index % 2 === 0 ? '#fff' : '#f8fafc' }}>
              {columns.map((column) => (
                <td key={`${index}_${column}`} style={{ padding: '.5rem .6rem', border: '1px solid #dbe4f0', color: '#111827' }}>
                  {formatPreviewValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpreadsheetPanel({
  title,
  helperText,
  templateHeaders,
  templateRows,
  templateFileName,
  state,
  setState,
  onFileSelected,
  onImport,
  previewColumns,
  previewRows,
  extraContent = null,
  accept = '.xlsx,.xls,.csv',
}) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <h2 className="card-title">{title}</h2>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{helperText}</p>

      {state.error && <div className="alert alert-error">{state.error}</div>}
      {state.success && <div className="alert alert-success">{state.success}</div>}

      <div style={{ display: 'grid', gap: '.85rem' }}>
        <div>
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.45rem' }}>
            <div style={{ fontWeight: 700, color: '#111827' }}>Columnas sugeridas</div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => downloadSpreadsheetTemplate(templateFileName, templateHeaders, templateRows, 'Plantilla')}
            >
              Descargar plantilla
            </button>
          </div>
          <TemplateChips items={templateHeaders} />
          <div style={{ color: '#64748b', fontSize: '.88rem', marginTop: '.5rem' }}>
            Descarga esta plantilla antes de importar para usar los encabezados correctos.
          </div>
        </div>

        <div style={{ display: 'grid', gap: '.65rem' }}>
          <label className="form-label" style={{ marginBottom: 0 }}>Modo de importacion</label>
          <ModeSelector value={state.mode} onChange={(mode) => setState((prev) => ({ ...prev, mode, success: '', error: '' }))} />
        </div>

        <div style={{ display: 'grid', gap: '.65rem' }}>
          <label className="form-label" style={{ marginBottom: 0 }}>Archivo Excel</label>
          <input
            type="file"
            accept={accept}
            className="form-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileSelected(file);
              event.target.value = '';
            }}
          />
          {state.fileName && (
            <div style={{ color: '#475569', fontSize: '.9rem' }}>
              Archivo cargado: <strong>{state.fileName}</strong>
            </div>
          )}
        </div>

        {extraContent}

        {!!state.headers.length && (
          <div style={{ padding: '.85rem 1rem', borderRadius: '.85rem', background: '#f8fafc', border: '1px solid #e5e7eb', color: '#475569' }}>
            <div style={{ fontWeight: 700, color: '#111827', marginBottom: '.35rem' }}>Encabezados detectados</div>
            {state.headers.join(' | ')}
          </div>
        )}

        {!!state.warnings.length && (
          <div style={{ padding: '.85rem 1rem', borderRadius: '.85rem', background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412' }}>
            <div style={{ fontWeight: 700, marginBottom: '.35rem' }}>Observaciones durante la lectura</div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {state.warnings.slice(0, 8).map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
            {state.warnings.length > 8 && (
              <div style={{ marginTop: '.45rem', fontWeight: 700 }}>
                + {state.warnings.length - 8} observacion(es) adicional(es)
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!state.items.length || state.importing || state.parsing}
            onClick={onImport}
          >
            {state.importing ? 'Importando...' : 'Importar al modulo'}
          </button>
          <span style={{ color: '#475569', fontWeight: 600 }}>
            Registros listos: {state.items.length}
          </span>
          {state.parsing && (
            <span style={{ color: '#2563eb', fontWeight: 700 }}>
              Leyendo archivo...
            </span>
          )}
        </div>
      </div>

      <PreviewTable rows={previewRows} columns={previewColumns} />
    </div>
  );
}

export default function SettingsImports() {
  const { section = '' } = useParams();
  const activeSection = IMPORTABLE_SECTIONS.includes(section) ? section : null;

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState({
    otHistory: [],
    maintenancePlans: [],
    equipmentItems: [],
    equipmentColumns: [],
    materials: [],
    rrhh: [],
    packages: [],
  });

  const [historyState, setHistoryState] = useState(EMPTY_IMPORT_STATE);
  const [historyPdfState, setHistoryPdfState] = useState(EMPTY_HISTORY_PDF_STATE);
  const [scheduleState, setScheduleState] = useState(EMPTY_IMPORT_STATE);
  const [equipmentState, setEquipmentState] = useState(EMPTY_IMPORT_STATE);
  const [equipmentPhotoState, setEquipmentPhotoState] = useState(EMPTY_EQUIPMENT_PHOTO_STATE);
  const [materialsState, setMaterialsState] = useState(EMPTY_IMPORT_STATE);
  const [personalState, setPersonalState] = useState(EMPTY_IMPORT_STATE);
  const [packageExcelState, setPackageExcelState] = useState(EMPTY_IMPORT_STATE);

  const [autoCreateUsers, setAutoCreateUsers] = useState(true);
  const [defaultPassword, setDefaultPassword] = useState(DEFAULT_PASSWORD);
  const [defaultUserRole, setDefaultUserRole] = useState('TECNICO');

  const [packagePdfState, setPackagePdfState] = useState({
    drafts: [],
    parsing: false,
    importing: false,
    error: '',
    success: '',
    vc: 'V.C - KM',
  });

  const sectionDescription = SETTINGS_IMPORT_DESCRIPTIONS[activeSection || ''] || '';

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    const [otHistory, maintenancePlans, equipmentItems, equipmentColumns, materials, rrhh, packages] = await Promise.all([
      loadSharedDocument(SHARED_DOCUMENT_KEYS.otHistory, []),
      loadSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePlans, []),
      loadSharedDocument(SHARED_DOCUMENT_KEYS.equipmentItems, []),
      loadSharedDocument(SHARED_DOCUMENT_KEYS.equipmentColumns, []),
      loadSharedDocument(SHARED_DOCUMENT_KEYS.materials, []),
      loadSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, []),
      loadSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePackages, []),
    ]);

    setSnapshot({
      otHistory: Array.isArray(otHistory) ? otHistory : [],
      maintenancePlans: Array.isArray(maintenancePlans) ? maintenancePlans : [],
      equipmentItems: Array.isArray(equipmentItems) ? equipmentItems : [],
      equipmentColumns: Array.isArray(equipmentColumns) ? equipmentColumns : [],
      materials: Array.isArray(materials) ? materials : [],
      rrhh: Array.isArray(rrhh) ? rrhh : [],
      packages: Array.isArray(packages) ? packages : [],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const counts = useMemo(() => ({
    'historial-ot': snapshot.otHistory.length,
    cronograma: snapshot.maintenancePlans.length,
    equipos: snapshot.equipmentItems.length,
    paquetes: snapshot.packages.length,
    materiales: snapshot.materials.length,
    personal: snapshot.rrhh.length,
  }), [snapshot]);

  const parseSpreadsheetIntoState = async (file, setState, mapper) => {
    setState((prev) => ({
      ...prev,
      parsing: true,
      error: '',
      success: '',
      fileName: file.name,
    }));

    try {
      const parsed = await parseSpreadsheetFile(file);
      const mapped = mapper(parsed.rows);
      setState((prev) => ({
        ...prev,
        parsing: false,
        headers: parsed.headers,
        items: mapped.items || [],
        warnings: mapped.warnings || [],
        columns: mapped.columns || prev.columns,
        userDrafts: mapped.userDrafts || [],
        error: mapped.items?.length ? '' : 'No se pudieron interpretar filas validas del archivo.',
      }));
    } catch (error) {
      console.error('Error leyendo archivo Excel:', error);
      setState((prev) => ({
        ...prev,
        parsing: false,
        headers: [],
        items: [],
        warnings: [],
        columns: [],
        userDrafts: [],
        error: 'No se pudo leer el archivo Excel. Revisa que no este danado y que la primera hoja tenga encabezados.',
      }));
    }
  };

  const handleHistoryPdfFiles = (fileList) => {
    const files = Array.from(fileList || []);
    const invalid = files.filter((file) => file.type !== 'application/pdf' && !String(file.name || '').toLowerCase().endsWith('.pdf'));
    const validFiles = files.filter((file) => !invalid.includes(file));
    setHistoryPdfState((prev) => ({
      ...prev,
      files: validFiles.map(describeHistoryPdfFile),
      error: invalid.length ? `${invalid.length} archivo(s) ignorado(s) porque no son PDF.` : '',
    }));
    setHistoryState((prev) => ({ ...prev, success: '', error: '' }));
  };

  const uploadHistoryPdf = async (pdf) => {
    const formData = new FormData();
    formData.append('file', pdf.file);
    formData.append('scope', `historial_ot_${pdf.otKey || Date.now()}`);
    formData.append('category', 'HISTORIAL_OT_PDF');
    formData.append('caption', pdf.name);
    const uploaded = await uploadPhotoAttachment(formData);
    return {
      ...uploaded,
      id: uploaded.filename || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      original_name: uploaded.original_name || pdf.name,
      file_name: uploaded.original_name || pdf.name,
      content_type: pdf.contentType,
      ot_reference: pdf.otReference,
      imported_at: new Date().toISOString(),
    };
  };

  const attachHistoryPdfsToItems = async (items) => {
    const pdfFiles = historyPdfState.files || [];
    if (!pdfFiles.length) return { items, warnings: [] };

    setHistoryPdfState((prev) => ({ ...prev, uploading: true, error: '' }));
    const uploadedByName = new Map();
    const unmatched = pdfFiles.filter((pdf) => !items.some((item) => pdfMatchesHistoryItem(pdf, item)));
    const warnings = unmatched.map((pdf) => `PDF sin coincidencia de OT: ${pdf.name}`);

    try {
      const nextItems = [];
      for (const item of items) {
        const matches = findPdfMatchesForHistoryItem(pdfFiles, item);
        if (!matches.length) {
          nextItems.push(item);
          continue;
        }

        const uploadedMatches = [];
        for (const pdf of matches) {
          if (!uploadedByName.has(pdf.name)) {
            uploadedByName.set(pdf.name, await uploadHistoryPdf(pdf));
          }
          uploadedMatches.push(uploadedByName.get(pdf.name));
        }
        const previousPdfs = Array.isArray(item.ot_pdf_files) ? item.ot_pdf_files : [];
        const mergedPdfs = [...uploadedMatches, ...previousPdfs.filter((previous) => (
          !uploadedMatches.some((current) => current.filename && current.filename === previous.filename)
        ))];
        nextItems.push({
          ...item,
          ot_pdf_file: uploadedMatches[0] || item.ot_pdf_file || null,
          ot_pdf_files: mergedPdfs,
          ot_pdf_file_name: uploadedMatches[0]?.original_name || uploadedMatches[0]?.file_name || item.ot_pdf_file_name || '',
        });
      }
      return { items: nextItems, warnings };
    } finally {
      setHistoryPdfState((prev) => ({ ...prev, uploading: false }));
    }
  };

  const handleEquipmentPhotoFiles = (fileList) => {
    const files = Array.from(fileList || []);
    const invalid = files.filter((file) => !ALLOWED_EQUIPMENT_PHOTO_TYPES.includes(file.type));
    const validFiles = files.filter((file) => !invalid.includes(file));
    setEquipmentPhotoState((prev) => ({
      ...prev,
      files: validFiles.map(describeEquipmentPhotoFile),
      error: invalid.length ? `${invalid.length} archivo(s) ignorado(s). Usa JPG, PNG, WEBP o GIF.` : '',
    }));
    setEquipmentState((prev) => ({ ...prev, success: '', error: '' }));
  };

  const uploadEquipmentPhoto = async (photo) => {
    const formData = new FormData();
    formData.append('file', photo.file);
    formData.append('scope', `equipo_${photo.key || Date.now()}`);
    formData.append('category', 'EQUIPO');
    formData.append('caption', photo.name);
    const uploaded = await uploadPhotoAttachment(formData);
    return {
      ...uploaded,
      id: uploaded.filename || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      original_name: uploaded.original_name || photo.name,
      content_type: photo.contentType,
      imported_at: new Date().toISOString(),
    };
  };

  const attachEquipmentPhotosToItems = async (items) => {
    const photoFiles = equipmentPhotoState.files || [];
    if (!photoFiles.length) return { items, warnings: [] };

    setEquipmentPhotoState((prev) => ({ ...prev, uploading: true, error: '' }));
    const uploadedByName = new Map();
    const unmatched = photoFiles.filter((photo) => !items.some((item) => photoMatchesEquipmentItem(photo, item)));
    const warnings = unmatched.map((photo) => `Foto sin coincidencia de equipo: ${photo.name}`);

    try {
      const nextItems = [];
      for (const item of items) {
        const matches = findPhotoMatchesForEquipmentItem(photoFiles, item);
        if (!matches.length) {
          nextItems.push(item);
          continue;
        }
        const photo = matches[0];
        if (!uploadedByName.has(photo.name)) {
          uploadedByName.set(photo.name, await uploadEquipmentPhoto(photo));
        }
        nextItems.push({
          ...item,
          foto_equipo: uploadedByName.get(photo.name),
        });
      }
      return { items: nextItems, warnings };
    } finally {
      setEquipmentPhotoState((prev) => ({ ...prev, uploading: false }));
    }
  };

  const importHistory = async () => {
    setHistoryState((prev) => ({ ...prev, importing: true, error: '', success: '' }));
    try {
      const { items: itemsWithPdfs, warnings } = await attachHistoryPdfsToItems(historyState.items);
      const merged = mergeByKey(
        snapshot.otHistory,
        itemsWithPdfs,
        (item) => item.ot_numero || `${item.codigo}_${item.fecha_cierre}`,
        historyState.mode,
        (previous, imported) => ({
          ...previous,
          ...imported,
          ot_pdf_file: imported.ot_pdf_file || previous.ot_pdf_file || null,
          ot_pdf_files: imported.ot_pdf_files || previous.ot_pdf_files || [],
          ot_pdf_file_name: imported.ot_pdf_file_name || previous.ot_pdf_file_name || '',
        }),
      );
      await saveSharedDocument(SHARED_DOCUMENT_KEYS.otHistory, merged);
      setHistoryState((prev) => ({
        ...prev,
        importing: false,
        warnings: [...(prev.warnings || []), ...warnings],
        success: `${historyState.items.length} OT historica(s) importada(s) correctamente.${historyPdfState.files.length ? ` ${historyPdfState.files.length - warnings.length} PDF(s) relacionado(s).` : ''}`,
      }));
      await loadSnapshot();
    } catch (error) {
      console.error('Error importando historial OT:', error);
      setHistoryPdfState((prev) => ({ ...prev, uploading: false }));
      setHistoryState((prev) => ({ ...prev, importing: false, error: error?.response?.data?.detail || 'No se pudo guardar el historial de OT importado.' }));
    }
  };

  const importSchedule = async () => {
    setScheduleState((prev) => ({ ...prev, importing: true, error: '', success: '' }));
    try {
      const merged = mergeByKey(
        snapshot.maintenancePlans,
        scheduleState.items,
        (item) => `${item.codigo}_${item.fecha_inicio}_${item.frecuencia}`,
        scheduleState.mode,
      );
      await saveSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePlans, merged);
      setScheduleState((prev) => ({
        ...prev,
        importing: false,
        success: `${scheduleState.items.length} plan(es) del cronograma importado(s).`,
      }));
      await loadSnapshot();
    } catch (error) {
      console.error('Error importando cronograma:', error);
      setScheduleState((prev) => ({ ...prev, importing: false, error: 'No se pudo guardar el cronograma importado.' }));
    }
  };

  const importEquipment = async () => {
    setEquipmentState((prev) => ({ ...prev, importing: true, error: '', success: '' }));
    try {
      const { items: itemsWithPhotos, warnings } = await attachEquipmentPhotosToItems(equipmentState.items);
      const mergedItems = mergeByKey(
        snapshot.equipmentItems,
        itemsWithPhotos,
        (item) => item.codigo || item.descripcion,
        equipmentState.mode,
        (previous, next) => ({
          ...previous,
          ...next,
          id: previous.id || next.id,
          despiece: previous.despiece || next.despiece || [],
          foto_equipo: next.foto_equipo || previous.foto_equipo || null,
        }),
      );
      await Promise.all([
        saveSharedDocument(SHARED_DOCUMENT_KEYS.equipmentItems, mergedItems),
        saveSharedDocument(SHARED_DOCUMENT_KEYS.equipmentColumns, equipmentState.columns || snapshot.equipmentColumns),
      ]);
      setEquipmentState((prev) => ({
        ...prev,
        importing: false,
        warnings: [...(prev.warnings || []), ...warnings],
        success: `${equipmentState.items.length} equipo(s) importado(s).${equipmentPhotoState.files.length ? ` ${equipmentPhotoState.files.length - warnings.length} foto(s) relacionada(s).` : ''} Tambien se actualizaron las columnas del maestro.`,
      }));
      await loadSnapshot();
    } catch (error) {
      console.error('Error importando equipos:', error);
      setEquipmentPhotoState((prev) => ({ ...prev, uploading: false }));
      setEquipmentState((prev) => ({ ...prev, importing: false, error: error?.response?.data?.detail || 'No se pudo guardar la importacion de equipos.' }));
    }
  };

  const importMaterials = async () => {
    setMaterialsState((prev) => ({ ...prev, importing: true, error: '', success: '' }));
    try {
      const merged = mergeByKey(
        snapshot.materials,
        materialsState.items,
        (item) => item.codigo || item.descripcion,
        materialsState.mode,
      );
      await saveSharedDocument(SHARED_DOCUMENT_KEYS.materials, merged);
      setMaterialsState((prev) => ({
        ...prev,
        importing: false,
        success: `${materialsState.items.length} material(es) importado(s).`,
      }));
      await loadSnapshot();
    } catch (error) {
      console.error('Error importando materiales:', error);
      setMaterialsState((prev) => ({ ...prev, importing: false, error: 'No se pudo guardar la importacion de materiales.' }));
    }
  };

  const importPersonnel = async () => {
    setPersonalState((prev) => ({ ...prev, importing: true, error: '', success: '' }));
    try {
      const merged = mergeByKey(
        snapshot.rrhh,
        personalState.items,
        (item) => item.codigo || item.nombres_apellidos,
        personalState.mode,
      );
      await saveSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, merged);

      let userMessage = 'Sin creacion de usuarios.';
      if (autoCreateUsers) {
        const existingUsers = await getUsers();
        const existingUsernames = new Set((Array.isArray(existingUsers) ? existingUsers : []).map((user) => String(user.username || '').toLowerCase()));
        let created = 0;
        let skipped = 0;
        let failed = 0;

        for (const draft of personalState.userDrafts || []) {
          const username = String(draft.username || '').toLowerCase();
          if (!username || existingUsernames.has(username)) {
            skipped += 1;
            continue;
          }
          try {
            await createUser({
              username: draft.username,
              full_name: draft.full_name,
              password: draft.password,
              role: draft.role,
            });
            existingUsernames.add(username);
            created += 1;
          } catch (error) {
            console.error(`Error creando usuario ${draft.username}:`, error);
            failed += 1;
          }
        }

        userMessage = `Usuarios: ${created} creados, ${skipped} omitidos, ${failed} con error.`;
      }

      setPersonalState((prev) => ({
        ...prev,
        importing: false,
        success: `${personalState.items.length} registro(s) de personal importado(s). ${userMessage}`,
      }));
      await loadSnapshot();
    } catch (error) {
      console.error('Error importando personal:', error);
      setPersonalState((prev) => ({ ...prev, importing: false, error: 'No se pudo guardar la importacion de personal o usuarios.' }));
    }
  };

  const importPackageExcel = async () => {
    setPackageExcelState((prev) => ({ ...prev, importing: true, error: '', success: '' }));
    try {
      const merged = mergeByKey(
        snapshot.packages,
        packageExcelState.items,
        (item) => item.codigo || item.nombre,
        packageExcelState.mode,
      );
      await saveSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePackages, merged);
      setPackageExcelState((prev) => ({
        ...prev,
        importing: false,
        success: `${packageExcelState.items.length} paquete(s) importado(s) desde Excel.`,
      }));
      await loadSnapshot();
    } catch (error) {
      console.error('Error importando paquetes Excel:', error);
      setPackageExcelState((prev) => ({ ...prev, importing: false, error: 'No se pudieron guardar los paquetes importados.' }));
    }
  };

  const handlePdfFiles = async (files) => {
    const fileList = Array.from(files || []);
    if (!fileList.length) return;

    setPackagePdfState((prev) => ({
      ...prev,
      parsing: true,
      error: '',
      success: '',
    }));

    try {
      const drafts = [];
      const warnings = [];
      for (let index = 0; index < fileList.length; index += 1) {
        const file = fileList[index];
        try {
          const text = await extractPdfText(file);
          const activities = extractActivitiesFromPdfText(text);
          const draft = buildPackageDraftFromPdf(file.name, activities, text, index, packagePdfState.vc);
          if (!activities.length) {
            warnings.push(`${file.name}: no se detectaron actividades automaticamente. Completa la lista manualmente.`);
          }
          drafts.push(draft);
        } catch (fileError) {
          console.error(`Error leyendo PDF ${file.name}:`, fileError);
          warnings.push(`${file.name}: no se pudo leer automaticamente. Se creo un borrador para completar manualmente.`);
          drafts.push(buildPackageDraftFromPdf(file.name, [], '', index, packagePdfState.vc));
        }
      }

      setPackagePdfState((prev) => ({
        ...prev,
        parsing: false,
        drafts,
        error: warnings.length ? warnings.join(' ') : (drafts.length ? '' : 'No se pudieron extraer actividades desde los PDF seleccionados.'),
      }));
    } catch (error) {
      console.error('Error leyendo PDF:', error);
      setPackagePdfState((prev) => ({
        ...prev,
        parsing: false,
        drafts: [],
        error: 'No se pudo leer uno o mas PDF. Si el documento es escaneado, revisa manualmente la lista antes de importarlo.',
      }));
    }
  };

  const importPdfPackages = async () => {
    setPackagePdfState((prev) => ({ ...prev, importing: true, error: '', success: '' }));
    try {
      const sanitizedDrafts = packagePdfState.drafts
        .map((draft, index) => ({
          ...draft,
          id: draft.id || `pkg_pdf_${index + 1}`,
          codigo: String(draft.codigo || `PK-PDF-${String(index + 1).padStart(3, '0')}`).toUpperCase(),
          nombre: String(draft.nombre || `Paquete PDF ${index + 1}`).trim(),
          vc: draft.vc || packagePdfState.vc,
          tiempo_min: Number(draft.tiempo_min) || 0,
          actividades: splitTextList(draft.actividades),
        }))
        .filter((draft) => draft.codigo && draft.nombre && draft.actividades.length);

      const merged = mergeByKey(
        snapshot.packages,
        sanitizedDrafts,
        (item) => item.codigo || item.nombre,
        'upsert',
      );
      await saveSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePackages, merged);
      setPackagePdfState((prev) => ({
        ...prev,
        importing: false,
        success: `${sanitizedDrafts.length} paquete(s) generado(s) desde PDF.`,
      }));
      await loadSnapshot();
    } catch (error) {
      console.error('Error guardando paquetes PDF:', error);
      setPackagePdfState((prev) => ({ ...prev, importing: false, error: 'No se pudieron guardar los paquetes generados desde PDF.' }));
    }
  };

  const historyPdfSummary = useMemo(() => {
    const files = historyPdfState.files || [];
    const items = historyState.items || [];
    const matchedNames = new Set();
    items.forEach((item) => {
      findPdfMatchesForHistoryItem(files, item).forEach((pdf) => matchedNames.add(pdf.name));
    });
    return {
      total: files.length,
      matched: matchedNames.size,
      unmatched: files.filter((pdf) => !matchedNames.has(pdf.name)),
    };
  }, [historyPdfState.files, historyState.items]);

  const historyPdfExtraContent = activeSection === 'historial-ot' ? (
    <div style={{ border: '1px solid #dbeafe', borderRadius: '.95rem', background: '#f8fbff', padding: '1rem', display: 'grid', gap: '.8rem' }}>
      <div>
        <div style={{ fontWeight: 800, color: '#111827' }}>PDF de OT masivos (opcional)</div>
        <div style={{ color: '#64748b', fontSize: '.9rem', marginTop: '.2rem' }}>
          El nombre del PDF debe contener el numero de OT. Ejemplo: <strong>OT-2026-000125.pdf</strong>.
        </div>
      </div>
      <input
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="form-input"
        onChange={(event) => {
          if (event.target.files?.length) handleHistoryPdfFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {historyPdfState.error && (
        <div style={{ color: '#b45309', fontWeight: 700, fontSize: '.9rem' }}>{historyPdfState.error}</div>
      )}
      {!!historyPdfSummary.total && (
        <div style={{ display: 'grid', gap: '.65rem' }}>
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
            <span style={{ padding: '.35rem .65rem', borderRadius: '999px', background: '#eef2ff', color: '#3730a3', fontWeight: 800 }}>
              {historyPdfSummary.total} PDF(s) cargado(s)
            </span>
            <span style={{ padding: '.35rem .65rem', borderRadius: '999px', background: '#ecfdf5', color: '#047857', fontWeight: 800 }}>
              {historyPdfSummary.matched} relacionado(s)
            </span>
            {!!historyPdfSummary.unmatched.length && (
              <span style={{ padding: '.35rem .65rem', borderRadius: '999px', background: '#fff7ed', color: '#c2410c', fontWeight: 800 }}>
                {historyPdfSummary.unmatched.length} sin OT coincidente
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gap: '.4rem', maxHeight: '150px', overflow: 'auto' }}>
            {historyPdfState.files.map((pdf) => {
              const matched = !historyPdfSummary.unmatched.some((item) => item.name === pdf.name);
              return (
                <div
                  key={`${pdf.name}-${pdf.size}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '.75rem',
                    alignItems: 'center',
                    padding: '.55rem .65rem',
                    borderRadius: '.7rem',
                    border: `1px solid ${matched ? '#bbf7d0' : '#fed7aa'}`,
                    background: matched ? '#f0fdf4' : '#fff7ed',
                  }}
                >
                  <span style={{ color: '#334155', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pdf.name}</span>
                  <span style={{ color: matched ? '#047857' : '#c2410c', fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {matched ? 'Relacionado' : 'Sin coincidencia'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {historyPdfState.uploading && (
        <div style={{ color: '#2563eb', fontWeight: 800 }}>Subiendo PDFs al servidor...</div>
      )}
    </div>
  ) : null;

  const equipmentPhotoSummary = useMemo(() => {
    const files = equipmentPhotoState.files || [];
    const items = equipmentState.items || [];
    const matchedNames = new Set();
    items.forEach((item) => {
      findPhotoMatchesForEquipmentItem(files, item).forEach((photo) => matchedNames.add(photo.name));
    });
    return {
      total: files.length,
      matched: matchedNames.size,
      unmatched: files.filter((photo) => !matchedNames.has(photo.name)),
    };
  }, [equipmentPhotoState.files, equipmentState.items]);

  const equipmentPhotoExtraContent = activeSection === 'equipos' ? (
    <div style={{ display: 'grid', gap: '.85rem' }}>
      {equipmentState.columns?.length ? (
        <div style={{ padding: '.85rem 1rem', borderRadius: '.85rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}>
          Columnas del maestro despues de la lectura: <strong>{equipmentState.columns.length}</strong>
        </div>
      ) : null}
      <div style={{ border: '1px solid #d1fae5', borderRadius: '.95rem', background: '#f8fffb', padding: '1rem', display: 'grid', gap: '.8rem' }}>
        <div>
          <div style={{ fontWeight: 800, color: '#111827' }}>Fotos de equipos masivas (opcional)</div>
          <div style={{ color: '#64748b', fontSize: '.9rem', marginTop: '.2rem' }}>
            El nombre de la foto debe contener el codigo o nombre del equipo. Ejemplo: <strong>IAISPL1.jpg</strong>.
          </div>
        </div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="form-input"
          onChange={(event) => {
            if (event.target.files?.length) handleEquipmentPhotoFiles(event.target.files);
            event.target.value = '';
          }}
        />
        {equipmentPhotoState.error && (
          <div style={{ color: '#b45309', fontWeight: 700, fontSize: '.9rem' }}>{equipmentPhotoState.error}</div>
        )}
        {!!equipmentPhotoSummary.total && (
          <div style={{ display: 'grid', gap: '.65rem' }}>
            <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
              <span style={{ padding: '.35rem .65rem', borderRadius: '999px', background: '#eef2ff', color: '#3730a3', fontWeight: 800 }}>
                {equipmentPhotoSummary.total} foto(s) cargada(s)
              </span>
              <span style={{ padding: '.35rem .65rem', borderRadius: '999px', background: '#ecfdf5', color: '#047857', fontWeight: 800 }}>
                {equipmentPhotoSummary.matched} relacionada(s)
              </span>
              {!!equipmentPhotoSummary.unmatched.length && (
                <span style={{ padding: '.35rem .65rem', borderRadius: '999px', background: '#fff7ed', color: '#c2410c', fontWeight: 800 }}>
                  {equipmentPhotoSummary.unmatched.length} sin equipo coincidente
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gap: '.4rem', maxHeight: '150px', overflow: 'auto' }}>
              {equipmentPhotoState.files.map((photo) => {
                const matched = !equipmentPhotoSummary.unmatched.some((item) => item.name === photo.name);
                return (
                  <div
                    key={`${photo.name}-${photo.size}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '.75rem',
                      alignItems: 'center',
                      padding: '.55rem .65rem',
                      borderRadius: '.7rem',
                      border: `1px solid ${matched ? '#bbf7d0' : '#fed7aa'}`,
                      background: matched ? '#f0fdf4' : '#fff7ed',
                    }}
                  >
                    <span style={{ color: '#334155', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{photo.name}</span>
                    <span style={{ color: matched ? '#047857' : '#c2410c', fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {matched ? 'Relacionada' : 'Sin coincidencia'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {equipmentPhotoState.uploading && (
          <div style={{ color: '#2563eb', fontWeight: 800 }}>Subiendo fotos al servidor...</div>
        )}
      </div>
    </div>
  ) : null;

  if (!activeSection) {
    return <Navigate to="/settings/importaciones/historial-ot" replace />;
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const currentCount = counts[activeSection];

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>{SECTION_TITLES[activeSection]}</h1>
        <p style={{ color: '#6b7280' }}>{sectionDescription}</p>
      </div>

      <SettingsNav activeKey={activeSection} />

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <SummaryCard label="Registros actuales" value={currentCount} color="#2563eb" />
        <SummaryCard label="Historial OT" value={snapshot.otHistory.length} color="#7c3aed" />
        <SummaryCard label="Equipos" value={snapshot.equipmentItems.length} color="#059669" />
        <SummaryCard label="Paquetes PM" value={snapshot.packages.length} color="#c2410c" />
      </div>

      {activeSection === 'historial-ot' && (
        <SpreadsheetPanel
          title="Carga masiva de Historial de OT"
          helperText="Usa un Excel con una fila por OT cerrada. El archivo se importara al Historial de OT y quedara disponible para busqueda y PDF."
          templateHeaders={SECTION_TEMPLATES['historial-ot']}
          templateRows={TEMPLATE_SAMPLE_ROWS['historial-ot']}
          templateFileName="plantilla_historial_ot.xlsx"
          state={historyState}
          setState={setHistoryState}
          onFileSelected={(file) => parseSpreadsheetIntoState(file, setHistoryState, mapOtHistoryRows)}
          onImport={importHistory}
          previewColumns={PREVIEW_COLUMNS['historial-ot']}
          previewRows={historyState.items.slice(0, 12)}
          extraContent={historyPdfExtraContent}
        />
      )}

      {activeSection === 'cronograma' && (
        <SpreadsheetPanel
          title="Carga masiva del Cronograma de mantenimiento"
          helperText="Importa planes preventivos por fecha. Si el codigo del equipo ya existe en Control de equipos, el nombre se completara automaticamente. Tambien puedes definir cuantos dias antes debe aparecer la alerta en Gestion de OT."
          templateHeaders={SECTION_TEMPLATES.cronograma}
          templateRows={TEMPLATE_SAMPLE_ROWS.cronograma}
          templateFileName="plantilla_cronograma_mantenimiento.xlsx"
          state={scheduleState}
          setState={setScheduleState}
          onFileSelected={(file) => parseSpreadsheetIntoState(file, setScheduleState, (rows) => mapMaintenancePlanRows(rows, snapshot.equipmentItems))}
          onImport={importSchedule}
          previewColumns={PREVIEW_COLUMNS.cronograma}
          previewRows={scheduleState.items.slice(0, 12)}
        />
      )}

      {activeSection === 'equipos' && (
        <SpreadsheetPanel
          title="Carga masiva de Equipos"
          helperText="Importa el maestro tecnico de equipos. Si el archivo trae columnas nuevas, tambien se agregaran al Control de equipos."
          templateHeaders={SECTION_TEMPLATES.equipos}
          templateRows={TEMPLATE_SAMPLE_ROWS.equipos}
          templateFileName="plantilla_equipos.xlsx"
          state={equipmentState}
          setState={setEquipmentState}
          onFileSelected={(file) => parseSpreadsheetIntoState(file, setEquipmentState, (rows) => mapEquipmentRows(rows, snapshot.equipmentColumns))}
          onImport={importEquipment}
          previewColumns={PREVIEW_COLUMNS.equipos}
          previewRows={equipmentState.items.slice(0, 12)}
          extraContent={equipmentPhotoExtraContent}
        />
      )}

      {activeSection === 'materiales' && (
        <SpreadsheetPanel
          title="Carga masiva de Materiales"
          helperText="Ideal para listas grandes de repuestos, consumibles y materiales de almacen."
          templateHeaders={SECTION_TEMPLATES.materiales}
          templateRows={TEMPLATE_SAMPLE_ROWS.materiales}
          templateFileName="plantilla_materiales.xlsx"
          state={materialsState}
          setState={setMaterialsState}
          onFileSelected={(file) => parseSpreadsheetIntoState(file, setMaterialsState, mapMaterialsRows)}
          onImport={importMaterials}
          previewColumns={PREVIEW_COLUMNS.materiales}
          previewRows={materialsState.items.slice(0, 12)}
        />
      )}

      {activeSection === 'personal' && (
        <SpreadsheetPanel
          title="Carga masiva de Personal y usuarios"
          helperText="Importa personal de mantenimiento y, si lo necesitas, crea usuarios del sistema automaticamente en el mismo proceso."
          templateHeaders={SECTION_TEMPLATES.personal}
          templateRows={TEMPLATE_SAMPLE_ROWS.personal}
          templateFileName="plantilla_personal_usuarios.xlsx"
          state={personalState}
          setState={setPersonalState}
          onFileSelected={(file) => parseSpreadsheetIntoState(file, setPersonalState, (rows) => mapRrhhRows(rows, { defaultPassword, defaultRole: defaultUserRole }))}
          onImport={importPersonnel}
          previewColumns={PREVIEW_COLUMNS.personal}
          previewRows={personalState.items.slice(0, 12)}
          extraContent={(
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              <div style={{ padding: '.85rem 1rem', borderRadius: '.85rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                <label style={{ display: 'inline-flex', gap: '.45rem', alignItems: 'center', fontWeight: 700, color: '#111827' }}>
                  <input type="checkbox" checked={autoCreateUsers} onChange={(event) => setAutoCreateUsers(event.target.checked)} />
                  Crear usuarios automaticamente
                </label>
                <div style={{ color: '#64748b', marginTop: '.35rem', fontSize: '.9rem' }}>
                  Si el Excel no trae `usuario`, se generara uno desde codigo o nombre.
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Clave por defecto</label>
                <input className="form-input" value={defaultPassword} onChange={(event) => setDefaultPassword(event.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Rol por defecto</label>
                <select className="form-select" value={defaultUserRole} onChange={(event) => setDefaultUserRole(event.target.value)}>
                  <option value="OPERADOR">Operador</option>
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="TECNICO">Tecnico</option>
                  <option value="ENCARGADO">Encargado</option>
                  <option value="PLANNER">Planner</option>
                  <option value="INGENIERO">Ingeniero</option>
                </select>
              </div>
            </div>
          )}
        />
      )}

      {activeSection === 'paquetes' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <SpreadsheetPanel
            title="Importar paquetes PM desde Excel"
            helperText="Usa esta opcion cuando ya tengas paquetes de mantenimiento tabulados en Excel."
            templateHeaders={SECTION_TEMPLATES.paquetes}
            templateRows={TEMPLATE_SAMPLE_ROWS.paquetes}
            templateFileName="plantilla_paquetes_pm.xlsx"
            state={packageExcelState}
            setState={setPackageExcelState}
            onFileSelected={(file) => parseSpreadsheetIntoState(file, setPackageExcelState, mapPackageRows)}
            onImport={importPackageExcel}
            previewColumns={PREVIEW_COLUMNS.paquetes}
            previewRows={packageExcelState.items.slice(0, 12)}
          />

          <div className="card" style={{ marginBottom: 0 }}>
            <h2 className="card-title">Generar paquetes PM desde PDF</h2>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              Puedes subir uno o varios PDF y el sistema intentara leer las actividades automaticamente. Si el PDF es escaneado como imagen, revisa y corrige manualmente antes de importar.
            </p>

            {packagePdfState.error && <div className="alert alert-error">{packagePdfState.error}</div>}
            {packagePdfState.success && <div className="alert alert-success">{packagePdfState.success}</div>}

            <div style={{ display: 'grid', gap: '.85rem' }}>
              <div className="form-group" style={{ marginBottom: 0, maxWidth: '260px' }}>
                <label className="form-label">V.C por defecto</label>
                <select
                  className="form-select"
                  value={packagePdfState.vc}
                  onChange={(event) => setPackagePdfState((prev) => ({ ...prev, vc: event.target.value }))}
                >
                  <option value="V.C - DIA">V.C - DIA</option>
                  <option value="V.C - HRA">V.C - HRA</option>
                  <option value="V.C - KM">V.C - KM</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Archivos PDF</label>
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  className="form-input"
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files?.length) handlePdfFiles(files);
                    event.target.value = '';
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!packagePdfState.drafts.length || packagePdfState.importing || packagePdfState.parsing}
                  onClick={importPdfPackages}
                >
                  {packagePdfState.importing ? 'Importando PDF...' : 'Guardar paquetes desde PDF'}
                </button>
                <span style={{ color: '#475569', fontWeight: 600 }}>
                  Borradores listos: {packagePdfState.drafts.length}
                </span>
              </div>
            </div>

            {packagePdfState.drafts.length > 0 && (
              <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                {packagePdfState.drafts.map((draft, index) => (
                  <div key={draft.id || index} style={{ border: '1px solid #e5e7eb', borderRadius: '.95rem', padding: '1rem', background: '#f8fafc' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem', marginBottom: '.85rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Codigo</label>
                        <input
                          className="form-input"
                          value={draft.codigo}
                          onChange={(event) => {
                            const nextDrafts = [...packagePdfState.drafts];
                            nextDrafts[index] = { ...nextDrafts[index], codigo: event.target.value };
                            setPackagePdfState((prev) => ({ ...prev, drafts: nextDrafts }));
                          }}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Nombre</label>
                        <input
                          className="form-input"
                          value={draft.nombre}
                          onChange={(event) => {
                            const nextDrafts = [...packagePdfState.drafts];
                            nextDrafts[index] = { ...nextDrafts[index], nombre: event.target.value };
                            setPackagePdfState((prev) => ({ ...prev, drafts: nextDrafts }));
                          }}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">V.C</label>
                        <select
                          className="form-select"
                          value={draft.vc}
                          onChange={(event) => {
                            const nextDrafts = [...packagePdfState.drafts];
                            nextDrafts[index] = { ...nextDrafts[index], vc: event.target.value };
                            setPackagePdfState((prev) => ({ ...prev, drafts: nextDrafts }));
                          }}
                        >
                          <option value="V.C - DIA">V.C - DIA</option>
                          <option value="V.C - HRA">V.C - HRA</option>
                          <option value="V.C - KM">V.C - KM</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Tiempo (min.)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={draft.tiempo_min}
                          onChange={(event) => {
                            const nextDrafts = [...packagePdfState.drafts];
                            nextDrafts[index] = { ...nextDrafts[index], tiempo_min: event.target.value };
                            setPackagePdfState((prev) => ({ ...prev, drafts: nextDrafts }));
                          }}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '.75rem' }}>
                      <label className="form-label">Actividades extraidas</label>
                      <textarea
                        className="form-input"
                        rows={8}
                        value={Array.isArray(draft.actividades) ? draft.actividades.join('\n') : String(draft.actividades || '')}
                        onChange={(event) => {
                          const nextDrafts = [...packagePdfState.drafts];
                          nextDrafts[index] = { ...nextDrafts[index], actividades: event.target.value };
                          setPackagePdfState((prev) => ({ ...prev, drafts: nextDrafts }));
                        }}
                      />
                    </div>

                    <div style={{ color: '#64748b', fontSize: '.88rem' }}>
                      Archivo origen: <strong>{draft.fuente_pdf_nombre || 'PDF'}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
