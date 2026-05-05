import React, { useEffect, useMemo, useState } from 'react';
import SettingsNav from '../components/SettingsNav';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import {
  DEFAULT_OT_PDF_SETTINGS,
  buildIndustrialOtReportHtml,
  normalizeOtPdfSettings,
  openIndustrialOtReportPdf,
} from '../utils/otPdfReport';
import { validateTextFields } from '../utils/formValidation';

const PDF_FORMAT_KEY = SHARED_DOCUMENT_KEYS.otPdfFormat;
const MAX_LOGO_SIZE_BYTES = 700 * 1024;
const SAMPLE_PHOTO = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22640%22 height=%22380%22 viewBox=%220 0 640 380%22%3E%3Crect width=%22640%22 height=%22380%22 fill=%22%23eef2f7%22/%3E%3Crect x=%2252%22 y=%2258%22 width=%22536%22 height=%22248%22 rx=%2216%22 fill=%22%23cbd5e1%22/%3E%3Ccircle cx=%22156%22 cy=%22135%22 r=%2248%22 fill=%22%2394a3b8%22/%3E%3Cpath d=%22M92 278l142-104 78 72 74-58 162 90z%22 fill=%22%2364748b%22/%3E%3Ctext x=%22320%22 y=%22342%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2228%22 font-weight=%22700%22 fill=%22%23334155%22%3EEVIDENCIA%3C/text%3E%3C/svg%3E';

const SAMPLE_ALERT = {
  id: 'preview',
  ot_numero: 'OT-2026-000123',
  aviso_numero: 'AV-0008',
  codigo: 'CAR-X002',
  descripcion: 'Cargador frontal',
  area_trabajo: 'Planta',
  prioridad: 'Alta',
  responsable: 'Mecanicos',
  tipo_mantto: 'Correctivo',
  vc: 'V.C - HRA',
  fecha_creacion: '2026-04-20',
  fecha_ejecutar: '2026-04-21',
  fecha_ejecucion: '2026-04-21',
  fecha_emision_aviso: '2026-04-20',
  hora_emision_aviso: '07:42',
  fecha_aceptacion_aviso: '2026-04-20T08:15:00',
  fecha_liberacion_ot: '2026-04-20T09:05:00',
  fecha_ejecucion_real: '2026-04-21',
  hora_ejecucion_real: '11:30',
  fecha_cierre: '2026-04-21',
  status_ot: 'Cerrada',
  aviso_origen: {
    aviso_codigo: 'AV-0008',
    codigo: 'CAR-X002',
    descripcion: 'Cargador frontal',
    categoria: 'Observacion mecanica',
    detalle: 'Se detecta fuga visible en zona de conexion y vibracion irregular durante operacion.',
    fecha_aviso: '2026-04-20',
    hora_evidencia: '07:42',
    criticidad_aviso: 'Alta',
    created_by_name: 'Operador Planta',
    problem_photos: [
      { url: SAMPLE_PHOTO, caption: 'Condicion observada en campo.' },
    ],
  },
  actividad: [
    'Comprobar cables, finales de carrera y puntos de seguridad.',
    'Verificar presencia de humedad en circuito electrico.',
    'Lubricar puntos moviles y verificar alineamiento.',
  ].join('\n'),
  personal_mantenimiento: 'MEC-1 - Manuel de la Cruz Jimenez, OPE-1 - Operador Planta',
  personal_detalle: [
    { id: 'mec', codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', especialidad: 'Mecanico', costo_hora: 7.5 },
    { id: 'ope', codigo: 'OPE-1', nombres_apellidos: 'Operador Planta', especialidad: 'Operador', costo_hora: 6.2 },
  ],
  materiales_detalle: [
    { id: 'mat1', codigo: 'FAR-29', descripcion: 'Faro cabina', unidad: 'UND', cantidad: 1 },
    { id: 'mat2', codigo: '0010', descripcion: 'Inyector CAT', unidad: 'KIT', cantidad: 1 },
  ],
  registro_ot: {
    fecha_inicio: '2026-04-21',
    hora_inicio: '08:00',
    fecha_fin: '2026-04-21',
    hora_fin: '11:30',
    observaciones: 'Trabajo ejecutado con observacion menor.',
  },
  cierre_ot: {
    fecha_inicio: '2026-04-21',
    hora_inicio: '08:00',
    fecha_fin: '2026-04-21',
    hora_fin: '11:30',
    estado_equipo: 'Operativo',
    tiempo_efectivo_hh: 6,
    tiempo_indisponible_generico: 3.5,
    tiempo_indisponible_operacional: 3,
    componente_intervenido: 'Sistema electrico',
    modo_falla: 'Falso contacto',
    causa_raiz: 'Humedad en conexion y desgaste de terminal.',
    accion_correctiva: 'Limpieza, ajuste y cambio de terminal.',
    recomendacion_tecnica: 'Programar inspeccion de sellos en proxima parada.',
    observaciones: 'Equipo queda operativo. Revisar reincidencia en 7 dias.',
    cierre_aprobado_por: 'Planner de mantenimiento',
    cierre_aprobado_fecha: '2026-04-21T12:15:00',
  },
};

const SAMPLE_REPORTS = [
  {
    id: 'nt1',
    reportCode: 'NT1-OT-2026-000123',
    reportType: 'TRABAJO',
    fechaInicio: '2026-04-21',
    horaInicio: '08:00',
    fechaFin: '2026-04-21',
    horaFin: '10:00',
    tecnicos: [{ tecnicoId: 'mec', codigo: 'MEC-1', tecnico: 'Manuel de la Cruz Jimenez', horas: 2, costo_hora: 7.5 }],
    materialesExtra: [],
    observaciones: 'Limpieza y ajuste completados.',
    evidencePhotos: {
      before: { url: SAMPLE_PHOTO, caption: 'Antes de la intervencion.' },
      after: { url: SAMPLE_PHOTO, caption: 'Despues de la intervencion.' },
    },
  },
  {
    id: 'nt2',
    reportCode: 'NT2-OT-2026-000123',
    reportType: 'SERVICIO',
    fechaInicio: '2026-04-21',
    horaInicio: '10:00',
    fechaFin: '2026-04-21',
    horaFin: '11:30',
    serviceProviderName: 'Taller Casas',
    serviceCompany: 'Taller Casas',
    serviceActivity: 'Revision de conector y pruebas de continuidad.',
    serviceCost: 180,
    materialesExtra: [],
    observaciones: 'Servicio conforme.',
    evidencePhotos: {
      before: { url: SAMPLE_PHOTO, caption: 'Recepcion del problema.' },
      after: { url: SAMPLE_PHOTO, caption: 'Prueba final conforme.' },
    },
  },
];

const SAMPLE_CATALOG = [
  { id: 'mat1', codigo: 'FAR-29', costo_unit: 45 },
  { id: 'mat2', codigo: '0010', costo_unit: 120 },
];

const numericFields = [
  ['rowActivityCount', 'Filas de actividades', 1, 30],
  ['rowPersonnelCount', 'Filas de personal', 1, 20],
  ['rowMaterialCount', 'Filas de materiales', 1, 40],
];

const typographyFields = [
  ['titleFontSize', 'Tamano titulo principal', 12, 36, 1],
  ['cellFontSize', 'Tamano texto de celdas', 6, 16, 0.5],
  ['labelFontSize', 'Tamano labels', 6, 14, 0.5],
  ['sectionFontSize', 'Tamano titulos de seccion', 6, 16, 0.5],
  ['reportFontSize', 'Tamano tabla de notificaciones', 6, 14, 0.5],
  ['signatureFontSize', 'Tamano firmas', 6, 14, 0.5],
];

const layoutFields = [
  ['cellPaddingVertical', 'Espaciado vertical de celda', 1, 10, 0.5],
  ['cellPaddingHorizontal', 'Espaciado horizontal de celda', 1, 12, 0.5],
  ['borderWidth', 'Grosor borde interno', 0.5, 4, 0.5],
  ['outerBorderWidth', 'Grosor borde exterior', 1, 6, 0.5],
];

const fontFamilyOptions = [
  ['Arial, Helvetica, sans-serif', 'Arial / Helvetica'],
  ['Calibri, Arial, sans-serif', 'Calibri'],
  ['Verdana, Geneva, sans-serif', 'Verdana'],
  ['Tahoma, Geneva, sans-serif', 'Tahoma'],
  ['"Times New Roman", Times, serif', 'Times New Roman'],
  ['Georgia, "Times New Roman", serif', 'Georgia'],
  ['"Courier New", Courier, monospace', 'Courier New'],
];

const colorSections = [
  {
    title: 'Pagina, bordes y logo',
    fields: [
      ['pageBackgroundColor', 'Fondo de pagina'],
      ['sheetBackgroundColor', 'Fondo del formato'],
      ['borderColor', 'Color de bordes'],
      ['bodyTextColor', 'Texto general'],
      ['logoBackgroundColor', 'Fondo celda logo'],
      ['logoBorderColor', 'Borde logo sin imagen'],
    ],
  },
  {
    title: 'Encabezados',
    fields: [
      ['primaryColor', 'Fondo titulo principal'],
      ['titleTextColor', 'Texto titulo principal'],
      ['greenColor', 'Fondo encabezado verde'],
      ['headerTextColor', 'Texto encabezado verde'],
      ['sectionColor', 'Fondo secciones grises'],
      ['sectionTextColor', 'Texto secciones'],
      ['accentColor', 'Fondo encabezados rojos'],
      ['accentTextColor', 'Texto encabezados rojos'],
    ],
  },
  {
    title: 'Celdas y estados',
    fields: [
      ['labelBackgroundColor', 'Fondo labels'],
      ['labelTextColor', 'Texto labels'],
      ['valueBackgroundColor', 'Fondo celdas de valor'],
      ['valueTextColor', 'Texto celdas de valor'],
      ['highlightBackgroundColor', 'Fondo celdas destacadas'],
      ['highlightTextColor', 'Texto celdas destacadas'],
      ['statusBackgroundColor', 'Fondo estado conforme'],
      ['statusTextColor', 'Texto estado conforme'],
      ['observationsBackgroundColor', 'Fondo observaciones'],
      ['technicalNoteBackgroundColor', 'Fondo notas tecnicas'],
      ['signatureLineColor', 'Color linea de firma'],
    ],
  },
];

const isHexColor = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ''));

function NumberSettingField({ field, label, min, max, step = 1, value, onChange }) {
  return (
    <div className="form-group" style={{ marginBottom: '.55rem' }}>
      <label className="form-label">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className="form-input"
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </div>
  );
}

function ColorSettingField({ field, label, value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '54px 1fr', gap: '.55rem', alignItems: 'end', marginBottom: '.55rem' }}>
      <input
        type="color"
        className="form-input"
        style={{ padding: '.2rem', height: '42px' }}
        value={isHexColor(value) ? value : '#000000'}
        onChange={(e) => onChange(field, e.target.value)}
      />
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">{label}</label>
        <input className="form-input" value={value || ''} onChange={(e) => onChange(field, e.target.value)} />
      </div>
    </div>
  );
}

export default function SettingsPdfFormat() {
  const [settings, setSettings] = useState(DEFAULT_OT_PDF_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    loadSharedDocument(PDF_FORMAT_KEY, DEFAULT_OT_PDF_SETTINGS).then((data) => {
      if (!active) return;
      setSettings(normalizeOtPdfSettings(data));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const previewHtml = useMemo(
    () => buildIndustrialOtReportHtml(SAMPLE_ALERT, SAMPLE_REPORTS, SAMPLE_CATALOG, settings),
    [settings],
  );

  const updateSetting = (key, value) => {
    setSettings((prev) => normalizeOtPdfSettings({ ...prev, [key]: value }));
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Selecciona una imagen valida para el logo.');
      return;
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setError('El logo es demasiado pesado. Usa una imagen menor a 700 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      updateSetting('logoDataUrl', result);
      setError('');
      setMessage('Logo cargado. Guarda el formato para aplicarlo a los PDF reales.');
      setTimeout(() => setMessage(''), 4000);
    };
    reader.onerror = () => {
      setError('No se pudo leer el logo seleccionado.');
    };
    reader.readAsDataURL(file);
  };

  const saveSettings = async () => {
    const textError = validateTextFields([
      ['Titulo del documento', settings.documentTitle],
      ['Titulo de empresa', settings.companyTitle],
      ['Subtitulo del documento', settings.documentSubtitle],
      ['Titulo de notificaciones', settings.workReportDocumentTitle],
      ['Subtitulo de notificaciones', settings.workReportSubtitle],
      ['Titulo del aviso', settings.noticeDocumentTitle],
      ['Subtitulo del aviso', settings.noticeSubtitle],
    ]);
    if (textError) {
      setError(textError);
      setMessage('');
      return;
    }
    const numericValidationFields = [
      ...numericFields,
      ...typographyFields,
      ...layoutFields,
      ['workEvidencePhotoHeight', 'Alto foto evidencia OT', 60, 360],
      ['noticePhotoHeight', 'Alto foto aviso', 60, 360],
    ];
    const invalidNumber = numericValidationFields.find(([field,, min, max]) => {
      const value = Number(settings[field]);
      return !Number.isFinite(value) || value < min || value > max;
    });
    if (invalidNumber) {
      setError(`${invalidNumber[1]} debe estar entre ${invalidNumber[2]} y ${invalidNumber[3]}.`);
      setMessage('');
      return;
    }
    const colorFields = [
      ...colorSections.flatMap((section) => section.fields),
      ['workReportHeaderColor', 'Fondo encabezado notificaciones'],
      ['workReportHeaderTextColor', 'Texto encabezado notificaciones'],
      ['noticeHeaderColor', 'Fondo encabezado aviso'],
      ['noticeHeaderTextColor', 'Texto encabezado aviso'],
    ];
    const invalidColor = colorFields.find(([field]) => !isHexColor(settings[field]));
    if (invalidColor) {
      setError(`${invalidColor[1]} debe ser un color hexadecimal valido, por ejemplo #0f3c63.`);
      setMessage('');
      return;
    }
    setSaving(true);
    try {
      const normalized = normalizeOtPdfSettings(settings);
      await saveSharedDocument(PDF_FORMAT_KEY, normalized);
      setSettings(normalized);
      setMessage('Formato PDF guardado correctamente.');
      setError('');
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      console.error('Error guardando formato PDF:', err);
      setError('No se pudo guardar el formato PDF en el servidor.');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setSettings(DEFAULT_OT_PDF_SETTINGS);
    setMessage('Se restauro la configuracion base. Guarda para aplicar.');
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
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Configuraciones</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Personaliza el formato PDF que se genera al cerrar o regenerar una OT.
      </p>

      <SettingsNav activeKey="formato-pdf-ot" />

      {message && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{message}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', alignItems: 'start' }}>
        <div className="card">
          <h2 className="card-title" style={{ marginBottom: '.8rem' }}>Formato de OT cerrada</h2>

          <div style={{ display: 'grid', gap: '.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Titulo del documento</label>
              <input className="form-input" value={settings.documentTitle} onChange={(e) => updateSetting('documentTitle', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Empresa / encabezado</label>
              <input className="form-input" value={settings.companyTitle} onChange={(e) => updateSetting('companyTitle', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Subtitulo</label>
              <input className="form-input" value={settings.documentSubtitle} onChange={(e) => updateSetting('documentSubtitle', e.target.value)} />
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '.8rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '.55rem' }}>Logo de empresa</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '.75rem', alignItems: 'center' }}>
                <div style={{ minHeight: '76px', border: '1px dashed #cbd5e1', borderRadius: '.65rem', display: 'grid', placeItems: 'center', background: '#f8fafc', padding: '.5rem' }}>
                  {settings.logoDataUrl ? (
                    <img src={settings.logoDataUrl} alt="Logo empresa" style={{ maxWidth: '100%', maxHeight: '62px', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: '#64748b', fontWeight: 800, fontSize: '.78rem', textAlign: 'center' }}>Sin logo</span>
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="form-input"
                    onChange={handleLogoUpload}
                  />
                  <p style={{ color: '#6b7280', fontSize: '.82rem', marginTop: '.35rem' }}>
                    Usa PNG, JPG, WEBP o SVG. Maximo recomendado: 700 KB.
                  </p>
                  {settings.logoDataUrl && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => updateSetting('logoDataUrl', '')}
                    >
                      Quitar logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <details open style={{ borderTop: '1px solid #e5e7eb', paddingTop: '.8rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '1rem', fontWeight: 800, marginBottom: '.75rem' }}>Tipografia y tamanos de letra</summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.65rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fuente general</label>
                  <select className="form-select" value={settings.fontFamily} onChange={(e) => updateSetting('fontFamily', e.target.value)}>
                    {fontFamilyOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fuente del titulo</label>
                  <select className="form-select" value={settings.titleFontFamily} onChange={(e) => updateSetting('titleFontFamily', e.target.value)}>
                    {fontFamilyOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.65rem', marginTop: '.65rem' }}>
                {typographyFields.map(([key, label, min, max, step]) => (
                  <NumberSettingField
                    key={key}
                    field={key}
                    label={label}
                    min={min}
                    max={max}
                    step={step}
                    value={settings[key]}
                    onChange={updateSetting}
                  />
                ))}
              </div>
            </details>

            <details open style={{ borderTop: '1px solid #e5e7eb', paddingTop: '.8rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '1rem', fontWeight: 800, marginBottom: '.75rem' }}>Filas, espaciado y bordes</summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.65rem' }}>
              {numericFields.map(([key, label, min, max]) => (
                <NumberSettingField
                  key={key}
                  field={key}
                  label={label}
                  min={min}
                  max={max}
                  value={settings[key]}
                  onChange={updateSetting}
                />
              ))}
              {layoutFields.map(([key, label, min, max, step]) => (
                <NumberSettingField
                  key={key}
                  field={key}
                  label={label}
                  min={min}
                  max={max}
                  step={step}
                  value={settings[key]}
                  onChange={updateSetting}
                />
              ))}
              </div>
            </details>

            <details open style={{ borderTop: '1px solid #e5e7eb', paddingTop: '.8rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '1rem', fontWeight: 800, marginBottom: '.75rem' }}>Colores y fondos de celdas</summary>
              {colorSections.map((section) => (
                <div key={section.title} style={{ marginBottom: '.8rem' }}>
                  <h3 style={{ fontSize: '.92rem', fontWeight: 800, marginBottom: '.55rem', color: '#374151' }}>{section.title}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '.65rem' }}>
                    {section.fields.map(([key, label]) => (
                      <ColorSettingField
                        key={key}
                        field={key}
                        label={label}
                    value={settings[key]}
                        onChange={updateSetting}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </details>

            <label style={{ display: 'flex', alignItems: 'center', gap: '.55rem', fontWeight: 700, color: '#374151' }}>
              <input
                type="checkbox"
                checked={settings.showWorkReports}
                onChange={(e) => updateSetting('showWorkReports', e.target.checked)}
              />
              Mostrar tabla de notificaciones de trabajo
            </label>

            <details open style={{ borderTop: '1px solid #e5e7eb', paddingTop: '.8rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '1rem', fontWeight: 800, marginBottom: '.75rem' }}>Anexos fotograficos, notificaciones y aviso</summary>
              <div style={{ display: 'grid', gap: '.65rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.55rem', fontWeight: 700, color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={settings.showWorkEvidenceAnnex}
                    onChange={(e) => updateSetting('showWorkEvidenceAnnex', e.target.checked)}
                  />
                  Mostrar formato de notificaciones como anexo
                </label>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Titulo formato de notificaciones</label>
                  <input className="form-input" value={settings.workReportDocumentTitle} onChange={(e) => updateSetting('workReportDocumentTitle', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Subtitulo formato de notificaciones</label>
                  <input className="form-input" value={settings.workReportSubtitle} onChange={(e) => updateSetting('workReportSubtitle', e.target.value)} />
                </div>
                <NumberSettingField
                  field="workEvidencePhotoHeight"
                  label="Alto fotos de notificaciones"
                  min={90}
                  max={260}
                  step={5}
                  value={settings.workEvidencePhotoHeight}
                  onChange={updateSetting}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '.65rem' }}>
                  <ColorSettingField
                    field="workReportHeaderColor"
                    label="Fondo encabezado notificaciones"
                    value={settings.workReportHeaderColor}
                    onChange={updateSetting}
                  />
                  <ColorSettingField
                    field="workReportHeaderTextColor"
                    label="Texto encabezado notificaciones"
                    value={settings.workReportHeaderTextColor}
                    onChange={updateSetting}
                  />
                </div>
                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '.2rem', paddingTop: '.75rem' }}>
                  <h3 style={{ fontSize: '.95rem', fontWeight: 800, marginBottom: '.55rem', color: '#374151' }}>Formato de aviso</h3>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.55rem', fontWeight: 700, color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={settings.showNoticeAnnex}
                    onChange={(e) => updateSetting('showNoticeAnnex', e.target.checked)}
                  />
                  Mostrar formato de aviso como anexo
                </label>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Titulo formato de aviso</label>
                  <input className="form-input" value={settings.noticeDocumentTitle} onChange={(e) => updateSetting('noticeDocumentTitle', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Subtitulo formato de aviso</label>
                  <input className="form-input" value={settings.noticeSubtitle} onChange={(e) => updateSetting('noticeSubtitle', e.target.value)} />
                </div>
                <NumberSettingField
                  field="noticePhotoHeight"
                  label="Alto fotos del aviso"
                  min={90}
                  max={260}
                  step={5}
                  value={settings.noticePhotoHeight}
                  onChange={updateSetting}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '.65rem' }}>
                  <ColorSettingField
                    field="noticeHeaderColor"
                    label="Fondo encabezado aviso"
                    value={settings.noticeHeaderColor}
                    onChange={updateSetting}
                  />
                  <ColorSettingField
                    field="noticeHeaderTextColor"
                    label="Texto encabezado aviso"
                    value={settings.noticeHeaderTextColor}
                    onChange={updateSetting}
                  />
                </div>
              </div>
            </details>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '.8rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '.55rem' }}>Firmas</h3>
              {['signature1', 'signature2', 'signature3'].map((key, index) => (
                <div key={key} className="form-group" style={{ marginBottom: '.55rem' }}>
                  <label className="form-label">Firma {index + 1}</label>
                  <input className="form-input" value={settings[key]} onChange={(e) => updateSetting(key, e.target.value)} />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={resetDefaults}>Restaurar base</button>
              <button type="button" className="btn btn-secondary" onClick={() => openIndustrialOtReportPdf(SAMPLE_ALERT, SAMPLE_REPORTS, SAMPLE_CATALOG, settings)}>
                Probar PDF
              </button>
              <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar formato'}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.8rem' }}>
            <div>
              <h2 className="card-title" style={{ marginBottom: '.2rem' }}>Vista previa</h2>
              <p style={{ color: '#6b7280', fontSize: '.9rem' }}>La vista usa datos de ejemplo. Al cerrar una OT se llenara con los datos reales.</p>
            </div>
          </div>
          <div style={{ border: '1px solid #d1d5db', borderRadius: '.75rem', overflow: 'hidden', background: '#fff' }}>
            <iframe
              title="Vista previa formato PDF OT"
              srcDoc={previewHtml}
              style={{ width: '100%', height: '760px', border: 0, background: '#fff' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
