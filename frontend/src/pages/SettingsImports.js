import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { createUser, getUsers } from '../services/api';
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
import { SETTINGS_IMPORT_DESCRIPTIONS, SETTINGS_SECTIONS } from '../utils/settingsSections';

const VALID_SECTIONS = SETTINGS_SECTIONS.map((item) => item.key);
const IMPORTABLE_SECTIONS = VALID_SECTIONS.filter((key) => key !== 'ordenes-trabajo');
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
    'ot_numero',
    'codigo',
    'descripcion',
    'area_trabajo',
    'responsable',
    'tipo_mantenimiento',
    'fecha_inicio',
    'hora_inicio',
    'fecha_fin',
    'hora_fin',
    'fecha_cierre',
    'personal_mantenimiento',
    'materiales',
    'tiempo_efectivo_hh',
    'estado_equipo',
    'satisfaccion',
    'observaciones',
  ],
  cronograma: [
    'codigo',
    'equipo',
    'prioridad',
    'frecuencia',
    'responsable',
    'fecha_inicio',
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
      personal_mantenimiento: 'MEC-1 | ELE-1',
      materiales: 'PRD0000001 x 1',
      tiempo_efectivo_hh: '7.5',
      estado_equipo: 'Operativo',
      satisfaccion: 'Conforme',
      observaciones: 'OT historica importada desde Excel.',
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
  'historial-ot': ['ot_numero', 'codigo', 'descripcion', 'fecha_cierre', 'tiempo_efectivo_hh'],
  cronograma: ['codigo', 'equipo', 'frecuencia', 'fecha_inicio', 'responsable'],
  equipos: ['codigo', 'descripcion', 'area_trabajo', 'criticidad', 'estado'],
  paquetes: ['codigo', 'nombre', 'vc', 'tiempo_min', 'actividades'],
  materiales: ['codigo', 'descripcion', 'stock', 'unidad', 'costo_unit'],
  personal: ['codigo', 'nombres_apellidos', 'especialidad', 'usuario', 'rol_usuario'],
};

function SettingsNav({ activeKey }) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        {SETTINGS_SECTIONS.map((section) => (
          <Link
            key={section.key}
            to={section.path}
            className="btn"
            style={{
              background: activeKey === section.key ? '#eff6ff' : '#f3f4f6',
              color: activeKey === section.key ? '#1d4ed8' : '#374151',
              border: '1px solid',
              borderColor: activeKey === section.key ? '#bfdbfe' : '#e5e7eb',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {section.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

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
        </thead>
        <tbody>
          {rows.map((row, index) => (
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
  const [scheduleState, setScheduleState] = useState(EMPTY_IMPORT_STATE);
  const [equipmentState, setEquipmentState] = useState(EMPTY_IMPORT_STATE);
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

  const importHistory = async () => {
    setHistoryState((prev) => ({ ...prev, importing: true, error: '', success: '' }));
    try {
      const merged = mergeByKey(
        snapshot.otHistory,
        historyState.items,
        (item) => item.ot_numero || `${item.codigo}_${item.fecha_cierre}`,
        historyState.mode,
      );
      await saveSharedDocument(SHARED_DOCUMENT_KEYS.otHistory, merged);
      setHistoryState((prev) => ({
        ...prev,
        importing: false,
        success: `${historyState.items.length} OT historica(s) importada(s) correctamente.`,
      }));
      await loadSnapshot();
    } catch (error) {
      console.error('Error importando historial OT:', error);
      setHistoryState((prev) => ({ ...prev, importing: false, error: 'No se pudo guardar el historial de OT importado.' }));
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
      const mergedItems = mergeByKey(
        snapshot.equipmentItems,
        equipmentState.items,
        (item) => item.codigo || item.descripcion,
        equipmentState.mode,
        (previous, next) => ({
          ...previous,
          ...next,
          id: previous.id || next.id,
          despiece: previous.despiece || next.despiece || [],
        }),
      );
      await Promise.all([
        saveSharedDocument(SHARED_DOCUMENT_KEYS.equipmentItems, mergedItems),
        saveSharedDocument(SHARED_DOCUMENT_KEYS.equipmentColumns, equipmentState.columns || snapshot.equipmentColumns),
      ]);
      setEquipmentState((prev) => ({
        ...prev,
        importing: false,
        success: `${equipmentState.items.length} equipo(s) importado(s). Tambien se actualizaron las columnas del maestro.`,
      }));
      await loadSnapshot();
    } catch (error) {
      console.error('Error importando equipos:', error);
      setEquipmentState((prev) => ({ ...prev, importing: false, error: 'No se pudo guardar la importacion de equipos.' }));
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
      for (let index = 0; index < fileList.length; index += 1) {
        const file = fileList[index];
        const text = await extractPdfText(file);
        const activities = extractActivitiesFromPdfText(text);
        drafts.push(buildPackageDraftFromPdf(file.name, activities, text, index, packagePdfState.vc));
      }

      setPackagePdfState((prev) => ({
        ...prev,
        parsing: false,
        drafts,
        error: drafts.length ? '' : 'No se pudieron extraer actividades desde los PDF seleccionados.',
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
        />
      )}

      {activeSection === 'cronograma' && (
        <SpreadsheetPanel
          title="Carga masiva del Cronograma de mantenimiento"
          helperText="Importa planes preventivos por fecha. Si el codigo del equipo ya existe en Control de equipos, el nombre se completara automaticamente."
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
          extraContent={equipmentState.columns?.length ? (
            <div style={{ padding: '.85rem 1rem', borderRadius: '.85rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}>
              Columnas del maestro despues de la lectura: <strong>{equipmentState.columns.length}</strong>
            </div>
          ) : null}
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
