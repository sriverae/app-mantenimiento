import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import {
  acquireWorkNotificationLock,
  getWorkNotificationLock,
  refreshWorkNotificationLock,
  releaseWorkNotificationLock,
  uploadPhotoAttachment,
} from '../services/api';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { DEFAULT_MATERIALS, normalizeMaterialsCatalog } from '../utils/materialsCatalog';
import { evaluateWorkReportConsistency, getAlertConsistencySummary } from '../utils/otConsistency';
import { formatDateDisplay, formatDateTimeDisplay } from '../utils/dateFormat';
import { getWorkReportOwnerLabel, isWorkReportOwnedByUser } from '../utils/workReportOwnership';
import {
  summarizeServiceReports,
} from '../utils/workReportServices';
import { isReadOnlyRole } from '../utils/roleAccess';
import {
  buildMaintenanceNoticesFromReports,
  buildObservationText,
  getObservationPreset,
  WORK_OBSERVATION_PRESETS,
} from '../utils/maintenanceNotices';
import { advanceKmPlanCycle } from '../utils/kmCounters';
import { appendAuditEntry } from '../utils/auditLog';
import { ModalCerrarOT, ModalReprogramarOt } from './PmpGestionOt';
import ConfigurableSelectField from '../components/ConfigurableSelectField';
import useConfigurableLists from '../hooks/useConfigurableLists';
import { filterRowsByColumns } from '../utils/tableFilters';
import { DEFAULT_OT_PDF_SETTINGS, normalizeOtPdfSettings, openIndustrialOtReportPdf } from '../utils/otPdfReport';
import { applyOtReprogramming } from '../utils/otReprogramming';
import {
  firstValidationError,
  validateNonNegativeFields,
  validatePositiveFields,
  validateRequiredFields,
} from '../utils/formValidation';
import {
  buildUploadedPhotoPayload,
  findReportsMissingRequiredEvidence,
  getBlockedTextMessage,
  getPhotoSource,
  getWorkReportEvidencePhotos,
  hasBlockedMaintenanceTextChars,
  hasRequiredWorkReportEvidence,
  WORK_REPORT_PHOTO_SLOTS,
} from '../utils/workReportEvidence';

// Nota: este archivo debe permanecer sin marcadores de conflicto de merge.
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const OT_WORK_REPORTS_KEY = SHARED_DOCUMENT_KEYS.otWorkReports;
const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;
const NOTICES_KEY = SHARED_DOCUMENT_KEYS.maintenanceNotices;
const RRHH_KEY = SHARED_DOCUMENT_KEYS.rrhh;
const MATERIALES_KEY = SHARED_DOCUMENT_KEYS.materials;
const KM_PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlansKm;
const PDF_FORMAT_KEY = SHARED_DOCUMENT_KEYS.otPdfFormat;

const RRHH_FALLBACK = [
  { id: 1, codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', especialidad: 'Mecánico' },
  { id: 2, codigo: 'ELE-1', nombres_apellidos: 'Hernan Alauce Alarcón', especialidad: 'Eléctrico' },
];

const MATERIALES_FALLBACK = DEFAULT_MATERIALS;

const normalizeIdentityText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const getUserIdentityTokens = (user) => {
  const tokens = new Set();
  [user?.id, user?.username, user?.full_name, user?.email].forEach((value) => {
    const normalized = normalizeIdentityText(value);
    if (normalized) tokens.add(normalized);
  });
  return tokens;
};

const doesStaffRowMatchUser = (row, user) => {
  if (!row || !user) return false;
  const userTokens = getUserIdentityTokens(user);
  if (!userTokens.size) return false;

  const rowTokens = [
    row.id,
    row.codigo,
    row.nombres_apellidos,
    row.email,
    row.username,
    `${row.codigo || ''} ${row.nombres_apellidos || ''}`,
  ]
    .map((value) => normalizeIdentityText(value))
    .filter(Boolean);

  return rowTokens.some((token) => userTokens.has(token));
};

const isAlertAssignedToUser = (alert, user) => {
  if (!alert || !user) return false;

  const detailRows = Array.isArray(alert.personal_detalle) ? alert.personal_detalle : [];
  if (detailRows.some((row) => doesStaffRowMatchUser(row, user))) return true;

  const assignedText = normalizeIdentityText(alert.personal_mantenimiento);
  if (!assignedText) return false;

  return Array.from(getUserIdentityTokens(user)).some((token) => assignedText.includes(token));
};

const getNotificationArea = (item) => item?.area_trabajo || item?.area || item?.area_equipo || 'N.A.';

const buildAssignedPersonnelSummary = (rows = []) => (rows || [])
  .map((row) => {
    const code = String(row.codigo || '').trim();
    const name = String(row.nombres_apellidos || '').trim();
    if (code && name) return `${code} - ${name}`;
    return name || code || 'Sin identificar';
  })
  .join(', ');

const findMatchingRrhhForUser = (rrhhItems = [], user) => {
  const items = Array.isArray(rrhhItems) ? rrhhItems : [];
  return items.find((row) => doesStaffRowMatchUser(row, user)) || null;
};

const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const getMaterialKey = (item) => {
  if (item?.materialId !== null && item?.materialId !== undefined && item?.materialId !== '') {
    return `id:${item.materialId}`;
  }
  const codigo = String(item?.codigo || '').trim().toLowerCase();
  return codigo ? `code:${codigo}` : '';
};

const buildMaterialConsumptionMap = (report) => {
  const consumption = new Map();
  const addRow = (item, quantity) => {
    const key = getMaterialKey(item);
    const nextQuantity = toPositiveNumber(quantity);
    if (!key || !nextQuantity) return;
    const existing = consumption.get(key);
    consumption.set(key, {
      materialId: item.materialId ?? existing?.materialId ?? null,
      codigo: item.codigo || existing?.codigo || '',
      descripcion: item.descripcion || existing?.descripcion || '',
      cantidad: Number(((existing?.cantidad || 0) + nextQuantity).toFixed(2)),
    });
  };

  (report?.materialesConfirmados || []).forEach((item) => {
    if (item.confirmada) addRow(item, item.cantidadConfirmada);
  });
  (report?.materialesExtra || []).forEach((item) => addRow(item, item.cantidad));

  return consumption;
};

const updateCatalogStock = (catalog, consumptionMap, multiplier) => {
  const nextCatalog = catalog.map((item) => ({ ...item }));
  for (const row of consumptionMap.values()) {
    const index = nextCatalog.findIndex((item) => (
      String(item.id) === String(row.materialId)
      || (
        row.codigo
        && String(item.codigo || '').trim().toLowerCase() === String(row.codigo || '').trim().toLowerCase()
      )
    ));

    if (index < 0) {
      if (multiplier < 0) {
        return {
          ok: false,
          message: `El material ${row.codigo || row.descripcion || 'sin código'} ya no existe en el catálogo.`,
        };
      }
      continue;
    }

    const currentStock = Number(nextCatalog[index].stock) || 0;
    const nextStock = Number((currentStock + (multiplier * row.cantidad)).toFixed(2));
    if (nextStock < 0) {
      return {
        ok: false,
        message: `Stock insuficiente para ${nextCatalog[index].codigo || nextCatalog[index].descripcion}. Disponible: ${currentStock}, requerido: ${row.cantidad}.`,
      };
    }
    nextCatalog[index].stock = nextStock;
  }

  return { ok: true, data: nextCatalog };
};

const calculateReportMaterialCost = (report, catalog) => {
  const costByKey = new Map();
  (catalog || []).forEach((item) => {
    costByKey.set(`id:${item.id}`, Number(item.costo_unit) || 0);
    if (item.codigo) costByKey.set(`code:${String(item.codigo).trim().toLowerCase()}`, Number(item.costo_unit) || 0);
  });

  let total = 0;
  buildMaterialConsumptionMap(report).forEach((item) => {
    const key = getMaterialKey(item);
    total += (costByKey.get(key) || 0) * (Number(item.cantidad) || 0);
  });
  return Number(total.toFixed(2));
};

const openCloseReportPdf = (alert, reports, catalog, pdfSettings) => {
  openIndustrialOtReportPdf(alert, reports, catalog, pdfSettings);
};

function PickerModal({ title, placeholder, items, filterFn, itemLabel, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => filterFn(item, q)).slice(0, 30);
  }, [items, query, filterFn]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', display: 'grid', placeItems: 'center', zIndex: 1100, padding: '1rem' }}>
      <div className="card" style={{ width: 'min(760px, 95vw)', maxHeight: '88vh', overflow: 'auto', marginBottom: 0 }}>
        <h3 className="card-title" style={{ marginBottom: '.6rem' }}>{title}</h3>
        <input className="form-input" placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: '.6rem' }} />

        <div style={{ maxHeight: '56vh', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '.5rem' }}>
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item)}
              style={{ width: '100%', textAlign: 'left', padding: '.65rem .75rem', border: 'none', borderBottom: '1px solid #f3f4f6', background: '#fff', cursor: 'pointer' }}
            >
              {itemLabel(item)}
            </button>
          ))}
          {!filtered.length && <div style={{ padding: '.8rem', color: '#6b7280' }}>Sin resultados.</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function EditLiberatedOtModal({
  alert, rrhhItems, materialsCatalog, reports = [], onClose, onSave,
}) {
  const {
    getOptions,
    addOptionQuickly,
    canManage: canManageConfigurableLists,
  } = useConfigurableLists();
  const [tab, setTab] = useState('registro');
  const [form, setForm] = useState({
    prioridad: alert.prioridad || '',
    actividad: alert.actividad || '',
    responsable: alert.responsable || '',
    fecha_ejecutar: alert.fecha_ejecutar || '',
    fecha_inicio_prop: alert.registro_ot?.fecha_inicio || '',
    fecha_fin_prop: alert.registro_ot?.fecha_fin || '',
    hora_inicio_prop: alert.registro_ot?.hora_inicio || '',
    hora_fin_prop: alert.registro_ot?.hora_fin || '',
    observaciones: alert.registro_ot?.observaciones || '',
  });
  const [personalAsignado, setPersonalAsignado] = useState(alert.personal_detalle || []);
  const [materialesAsignados, setMaterialesAsignados] = useState(alert.materiales_detalle || []);
  const [selectedPersonalId, setSelectedPersonalId] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [cantidadMaterial, setCantidadMaterial] = useState(1);

  const eligibleRrhh = useMemo(
    () => rrhhItems.filter((item) => ['tecnico', 'técnico', 'encargado'].includes(String(item.cargo || 'tecnico').toLowerCase())),
    [rrhhItems],
  );

  const priorityOptions = useMemo(
    () => getOptions('prioridades', ['Alta', 'Media', 'Baja', 'Critica']),
    [getOptions],
  );

  const responsibleOptions = useMemo(
    () => getOptions('responsables', ['Mecanico', 'Electricista', 'Mecanicos', 'Ingeniero', 'Planner', 'Terceros']),
    [getOptions],
  );
  const assignedPersonnelColumns = useMemo(() => [
    { id: 'codigo', label: 'Codigo' },
    { id: 'nombres_apellidos', label: 'Nombre' },
    { id: 'especialidad', label: 'Especialidad' },
    { id: 'accion', label: 'Accion', filterable: false },
  ], []);
  const assignedPersonnelFilters = useTableColumnFilters(assignedPersonnelColumns);
  const visiblePersonalAsignado = useMemo(
    () => filterRowsByColumns(personalAsignado, assignedPersonnelColumns, assignedPersonnelFilters.filters),
    [personalAsignado, assignedPersonnelColumns, assignedPersonnelFilters.filters],
  );
  const assignedMaterialColumns = useMemo(() => [
    { id: 'codigo', label: 'Codigo' },
    { id: 'descripcion', label: 'Descripcion' },
    { id: 'unidad', label: 'Unidad', getValue: (item) => item.unidad || 'UND' },
    { id: 'cantidad', label: 'Cantidad' },
    { id: 'accion', label: 'Accion', filterable: false },
  ], []);
  const assignedMaterialFilters = useTableColumnFilters(assignedMaterialColumns);
  const visibleMaterialesAsignados = useMemo(
    () => filterRowsByColumns(materialesAsignados, assignedMaterialColumns, assignedMaterialFilters.filters),
    [materialesAsignados, assignedMaterialColumns, assignedMaterialFilters.filters],
  );

  const previewAlert = useMemo(() => ({
    ...alert,
    registro_ot: {
      ...(alert.registro_ot || {}),
      fecha_inicio: form.fecha_inicio_prop,
      fecha_fin: form.fecha_fin_prop,
      hora_inicio: form.hora_inicio_prop,
      hora_fin: form.hora_fin_prop,
      turno: alert.registro_ot?.turno || '',
      observaciones: form.observaciones,
    },
  }), [alert, form]);
  const consistencySummary = useMemo(
    () => getAlertConsistencySummary(previewAlert, reports),
    [previewAlert, reports],
  );
  const correctionSuggestion = useMemo(() => {
    const parse = (dateValue, timeValue, fallbackTime) => {
      if (!dateValue) return null;
      const normalizedTime = /^\d{2}:\d{2}$/.test(String(timeValue || '').slice(0, 5))
        ? String(timeValue || '').slice(0, 5)
        : fallbackTime;
      const parsed = new Date(`${dateValue}T${normalizedTime}:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const formatDate = (dateValue) => dateValue.toISOString().slice(0, 10);
    const formatTime = (dateValue) => dateValue.toTimeString().slice(0, 5);
    const formatDateLabel = (dateValue) => formatDateDisplay(formatDate(dateValue), 'N.A.');

    const currentStart = parse(form.fecha_inicio_prop, form.hora_inicio_prop, '00:00');
    const currentEnd = parse(form.fecha_fin_prop, form.hora_fin_prop, '23:59');
    const reportRanges = (reports || [])
      .map((report) => ({
        start: parse(report.fechaInicio, report.horaInicio, '00:00'),
        end: parse(report.fechaFin, report.horaFin, '23:59'),
      }))
      .filter((item) => item.start && item.end);

    if (!currentStart || !currentEnd || !reportRanges.length) {
      return { needsStartAdjustment: false, needsEndAdjustment: false };
    }

    const earliestStart = reportRanges.reduce((minValue, item) => (item.start < minValue ? item.start : minValue), reportRanges[0].start);
    const latestEnd = reportRanges.reduce((maxValue, item) => (item.end > maxValue ? item.end : maxValue), reportRanges[0].end);

    return {
      needsStartAdjustment: earliestStart < currentStart,
      needsEndAdjustment: latestEnd > currentEnd,
      suggestedStartDate: formatDate(earliestStart),
      suggestedStartTime: formatTime(earliestStart),
      suggestedEndDate: formatDate(latestEnd),
      suggestedEndTime: formatTime(latestEnd),
      suggestedStartLabel: `${formatDateLabel(earliestStart)} ${formatTime(earliestStart)}`,
      suggestedEndLabel: `${formatDateLabel(latestEnd)} ${formatTime(latestEnd)}`,
    };
  }, [form.fecha_inicio_prop, form.hora_inicio_prop, form.fecha_fin_prop, form.hora_fin_prop, reports]);

  const originalForm = useMemo(() => ({
    prioridad: alert.prioridad || '',
    actividad: alert.actividad || '',
    responsable: alert.responsable || '',
    fecha_ejecutar: alert.fecha_ejecutar || '',
    fecha_inicio_prop: alert.registro_ot?.fecha_inicio || '',
    fecha_fin_prop: alert.registro_ot?.fecha_fin || '',
    hora_inicio_prop: alert.registro_ot?.hora_inicio || '',
    hora_fin_prop: alert.registro_ot?.hora_fin || '',
    observaciones: alert.registro_ot?.observaciones || '',
  }), [alert]);

  const changedFields = useMemo(() => ({
    prioridad: String(form.prioridad || '') !== String(originalForm.prioridad || ''),
    actividad: String(form.actividad || '') !== String(originalForm.actividad || ''),
    responsable: String(form.responsable || '') !== String(originalForm.responsable || ''),
    fecha_ejecutar: String(form.fecha_ejecutar || '') !== String(originalForm.fecha_ejecutar || ''),
    fecha_inicio_prop: String(form.fecha_inicio_prop || '') !== String(originalForm.fecha_inicio_prop || ''),
    fecha_fin_prop: String(form.fecha_fin_prop || '') !== String(originalForm.fecha_fin_prop || ''),
    hora_inicio_prop: String(form.hora_inicio_prop || '') !== String(originalForm.hora_inicio_prop || ''),
    hora_fin_prop: String(form.hora_fin_prop || '') !== String(originalForm.hora_fin_prop || ''),
    observaciones: String(form.observaciones || '') !== String(originalForm.observaciones || ''),
  }), [form, originalForm]);

  const changedFieldLabels = useMemo(() => {
    const labels = {
      prioridad: 'Prioridad',
      actividad: 'Actividad',
      responsable: 'Responsable',
      fecha_ejecutar: 'Fecha a ejecutar',
      fecha_inicio_prop: 'Inicio propuesto OT',
      fecha_fin_prop: 'Fin propuesto OT',
      hora_inicio_prop: 'Hora inicio',
      hora_fin_prop: 'Hora fin',
      observaciones: 'Observaciones',
    };
    return Object.entries(changedFields)
      .filter(([, changed]) => changed)
      .map(([fieldName]) => labels[fieldName]);
  }, [changedFields]);

  const fieldsNeedingAttention = useMemo(() => ({
    fecha_inicio_prop: correctionSuggestion.needsStartAdjustment,
    hora_inicio_prop: correctionSuggestion.needsStartAdjustment,
    fecha_fin_prop: correctionSuggestion.needsEndAdjustment,
    hora_fin_prop: correctionSuggestion.needsEndAdjustment,
  }), [correctionSuggestion]);

  const applyCorrectionSuggestion = () => {
    setForm((prev) => ({
      ...prev,
      fecha_inicio_prop: correctionSuggestion.needsStartAdjustment ? correctionSuggestion.suggestedStartDate : prev.fecha_inicio_prop,
      hora_inicio_prop: correctionSuggestion.needsStartAdjustment ? correctionSuggestion.suggestedStartTime : prev.hora_inicio_prop,
      fecha_fin_prop: correctionSuggestion.needsEndAdjustment ? correctionSuggestion.suggestedEndDate : prev.fecha_fin_prop,
      hora_fin_prop: correctionSuggestion.needsEndAdjustment ? correctionSuggestion.suggestedEndTime : prev.hora_fin_prop,
    }));
  };

  const getInputStyle = (fieldName) => {
    if (fieldsNeedingAttention[fieldName]) {
      return {
        borderColor: '#f97316',
        background: '#fff7ed',
        boxShadow: '0 0 0 1px rgba(249,115,22,.15)',
      };
    }
    if (changedFields[fieldName]) {
      return {
        borderColor: '#2563eb',
        background: '#eff6ff',
        boxShadow: '0 0 0 1px rgba(37,99,235,.12)',
      };
    }
    return {};
  };

  const renderLabel = (fieldName, label) => (
    <div className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', marginBottom: 0 }}>
      <span>{label}</span>
      {fieldsNeedingAttention[fieldName] && (
        <span style={{
          fontSize: '.72rem',
          fontWeight: 700,
          color: '#9a3412',
          background: '#ffedd5',
          border: '1px solid #fdba74',
          borderRadius: '999px',
          padding: '.1rem .45rem',
        }}
        >
          Revisar
        </span>
      )}
      {!fieldsNeedingAttention[fieldName] && changedFields[fieldName] && (
        <span style={{
          fontSize: '.72rem',
          fontWeight: 700,
          color: '#1d4ed8',
          background: '#dbeafe',
          border: '1px solid #93c5fd',
          borderRadius: '999px',
          padding: '.1rem .45rem',
        }}
        >
          Modificado
        </span>
      )}
    </div>
  );

  const handleQuickAdd = async (key, label, fieldName) => {
    const result = await addOptionQuickly(key, label);
    if (result?.added && fieldName) {
      setForm((prev) => ({ ...prev, [fieldName]: result.value }));
    }
  };

  const addPersonal = () => {
    const item = eligibleRrhh.find((it) => String(it.id) === String(selectedPersonalId));
    if (!item || personalAsignado.some((row) => String(row.id) === String(item.id))) return;
    setPersonalAsignado((prev) => [...prev, item]);
  };

  const removePersonal = (id) => {
    setPersonalAsignado((prev) => prev.filter((row) => String(row.id) !== String(id)));
  };

  const addMaterial = () => {
    const item = materialsCatalog.find((it) => String(it.id) === String(selectedMaterialId));
    const cantidad = Number(cantidadMaterial) || 0;
    const validationError = validatePositiveFields([['Cantidad de material', cantidadMaterial]]);
    if (!item || validationError) {
      if (validationError) window.alert(validationError);
      return;
    }
    setMaterialesAsignados((prev) => {
      const existing = prev.find((row) => String(row.id) === String(item.id));
      if (existing) {
        return prev.map((row) => (String(row.id) === String(item.id) ? { ...row, cantidad: (Number(row.cantidad) || 0) + cantidad } : row));
      }
      return [...prev, { ...item, cantidad }];
    });
  };

  const removeMaterial = (id) => {
    setMaterialesAsignados((prev) => prev.filter((row) => String(row.id) !== String(id)));
  };

  const handleSubmit = () => {
    const validationError = firstValidationError(
      validateRequiredFields([
        ['Actividad', form.actividad],
        ['Responsable', form.responsable],
        ['Fecha a ejecutar', form.fecha_ejecutar],
        ['Fecha inicio propuesta', form.fecha_inicio_prop],
        ['Fecha fin propuesta', form.fecha_fin_prop],
      ]),
      validatePositiveFields(materialesAsignados.map((item, index) => [`Cantidad material ${index + 1}`, item.cantidad])),
    );
    if (validationError) {
      window.alert(validationError);
      return;
    }
    if (hasBlockedMaintenanceTextChars(form.actividad) || hasBlockedMaintenanceTextChars(form.responsable) || hasBlockedMaintenanceTextChars(form.observaciones)) {
      window.alert(getBlockedTextMessage('Datos de la OT'));
      return;
    }
    if (form.fecha_inicio_prop > form.fecha_fin_prop) {
      window.alert('La fecha inicio propuesta no puede ser mayor que la fecha fin propuesta.');
      return;
    }
    onSave({
      ...form,
      personalAsignado,
      materialesAsignados,
    });
  };

  const tabButton = (id, label) => (
    <button
      type="button"
      className={`btn ${tab === id ? 'btn-primary' : 'btn-secondary'}`}
      style={{ padding: '.45rem .9rem' }}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: '1rem' }}>
      <div className="card" style={{ width: 'min(1080px, 96vw)', maxHeight: '92vh', overflow: 'auto', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', marginBottom: '.8rem' }}>
          <h3 className="card-title" style={{ marginBottom: 0 }}>Editar OT liberada #{alert.ot_numero || 'N.A.'}</h3>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {tabButton('registro', 'Registro')}
          {tabButton('personal', 'Personal')}
          {tabButton('materiales', 'Materiales')}
        </div>

        {tab === 'registro' && (
          <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
            {reports.length > 0 && consistencySummary.hasInconsistency && (
              <div style={{ marginBottom: '.9rem', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '.75rem', padding: '.85rem .95rem' }}>
                <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: '.35rem' }}>
                  Se detectaron {consistencySummary.count} inconsistencia(s) de fecha en los registros de trabajo.
                </div>
                <div style={{ color: '#7c2d12', fontSize: '.92rem', marginBottom: '.45rem' }}>
                  Uno o más sub-registros quedaron fuera del rango liberado actual de la OT. Debes ajustar las fechas y horas de liberación para que cubran el trabajo realmente ejecutado.
                </div>
                <div style={{ display: 'grid', gap: '.45rem', marginBottom: '.55rem' }}>
                  {consistencySummary.inconsistentReports.map((item, index) => (
                    <div key={item.report.id || `${item.report.reportCode || 'report'}_${index}`} style={{ background: '#fff', border: '1px solid #fed7aa', borderRadius: '.6rem', padding: '.6rem .7rem' }}>
                      <div style={{ fontWeight: 700, color: '#7c2d12', marginBottom: '.2rem' }}>
                        {item.report.reportCode || `Sub-registro #${index + 1}`}
                      </div>
                      <div style={{ color: '#92400e', fontSize: '.9rem' }}>{item.reason}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '.65rem', padding: '.75rem .85rem' }}>
                  <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: '.35rem' }}>Sugerencia para dejar la OT conforme</div>
                  <div style={{ color: '#1e3a8a', fontSize: '.92rem' }}>
                    {correctionSuggestion.needsStartAdjustment
                      ? `Cambia "Inicio propuesto OT" y "Hora inicio" para que no sean mayores a ${correctionSuggestion.suggestedStartLabel}. `
                      : 'El inicio propuesto ya cubre correctamente los registros. '}
                    {correctionSuggestion.needsEndAdjustment
                      ? `Cambia "Fin propuesto OT" y "Hora fin" para que no sean menores a ${correctionSuggestion.suggestedEndLabel}.`
                      : 'El fin propuesto ya cubre correctamente los registros.'}
                  </div>
                  {(correctionSuggestion.needsStartAdjustment || correctionSuggestion.needsEndAdjustment) && (
                    <div style={{ marginTop: '.55rem' }}>
                      <button type="button" className="btn btn-secondary" onClick={applyCorrectionSuggestion}>
                        Aplicar sugerencia
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {reports.length > 0 && !consistencySummary.hasInconsistency && (
              <div style={{ marginBottom: '.9rem', background: '#ecfdf5', border: '1px solid #86efac', color: '#166534', borderRadius: '.75rem', padding: '.8rem .9rem' }}>
                Los registros de trabajo están dentro del rango liberado actual. No se detectan inconsistencias de fecha en esta OT.
              </div>
            )}

            {changedFieldLabels.length > 0 && (
              <div style={{ marginBottom: '.9rem', background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8', borderRadius: '.75rem', padding: '.8rem .9rem' }}>
                Campos modificados en esta ediciÃ³n: {changedFieldLabels.join(', ')}.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '.65rem' }}>
              <div>
                <ConfigurableSelectField
                  label={renderLabel('prioridad', 'Prioridad')}
                  manageLabel="Prioridad"
                  value={form.prioridad}
                  options={priorityOptions}
                  onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
                  onQuickAdd={() => handleQuickAdd('prioridades', 'Prioridad', 'prioridad')}
                  canManageOptions={canManageConfigurableLists}
                  placeholder="Selecciona prioridad"
                  selectStyle={getInputStyle('prioridad')}
                />
              </div>
              <div>
                <ConfigurableSelectField
                  label={renderLabel('responsable', 'Responsable')}
                  manageLabel="Responsable"
                  value={form.responsable}
                  options={responsibleOptions}
                  onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                  onQuickAdd={() => handleQuickAdd('responsables', 'Responsable', 'responsable')}
                  canManageOptions={canManageConfigurableLists}
                  placeholder="Selecciona responsable"
                  selectStyle={getInputStyle('responsable')}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>{renderLabel('actividad', 'Actividad')}<textarea className="form-textarea" style={getInputStyle('actividad')} value={form.actividad} onChange={(e) => setForm({ ...form, actividad: e.target.value })} /></div>
              <div>{renderLabel('fecha_ejecutar', 'Fecha a ejecutar')}<input className="form-input" style={getInputStyle('fecha_ejecutar')} type="date" value={form.fecha_ejecutar} onChange={(e) => setForm({ ...form, fecha_ejecutar: e.target.value })} /></div>
              <div>{renderLabel('fecha_inicio_prop', 'Inicio propuesto OT')}<input className="form-input" style={getInputStyle('fecha_inicio_prop')} type="date" value={form.fecha_inicio_prop} onChange={(e) => setForm({ ...form, fecha_inicio_prop: e.target.value })} /></div>
              <div>{renderLabel('fecha_fin_prop', 'Fin propuesto OT')}<input className="form-input" style={getInputStyle('fecha_fin_prop')} type="date" value={form.fecha_fin_prop} onChange={(e) => setForm({ ...form, fecha_fin_prop: e.target.value })} /></div>
              <div>{renderLabel('hora_inicio_prop', 'Hora inicio')}<input className="form-input" style={getInputStyle('hora_inicio_prop')} type="time" value={form.hora_inicio_prop} onChange={(e) => setForm({ ...form, hora_inicio_prop: e.target.value })} /></div>
              <div>{renderLabel('hora_fin_prop', 'Hora fin')}<input className="form-input" style={getInputStyle('hora_fin_prop')} type="time" value={form.hora_fin_prop} onChange={(e) => setForm({ ...form, hora_fin_prop: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}>{renderLabel('observaciones', 'Observaciones')}<textarea className="form-textarea" style={getInputStyle('observaciones')} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
            </div>
          </div>
        )}

        {tab === 'personal' && (
          <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.7rem', marginBottom: '.8rem' }}>
              <select className="form-select" value={selectedPersonalId} onChange={(e) => setSelectedPersonalId(e.target.value)}>
                <option value="">Selecciona técnico...</option>
                {eligibleRrhh.map((item) => (
                  <option key={item.id} value={item.id}>{item.codigo} - {item.nombres_apellidos}</option>
                ))}
              </select>
              <button type="button" className="btn btn-primary" onClick={addPersonal}>Agregar</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#e5e7eb' }}>
                  {['Código', 'Nombre', 'Especialidad', 'Acción'].map((h) => <th key={h} style={{ border: '1px solid #d1d5db', padding: '.45rem', textAlign: 'left' }}>{h}</th>)}
                </tr>
                <TableFilterRow columns={assignedPersonnelColumns} rows={personalAsignado} filters={assignedPersonnelFilters.filters} onChange={assignedPersonnelFilters.setFilter} />
              </thead>
              <tbody>
                {visiblePersonalAsignado.map((item) => (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.nombres_apellidos}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.especialidad || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removePersonal(item.id)}>Quitar</button></td>
                  </tr>
                ))}
                {!visiblePersonalAsignado.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>{personalAsignado.length ? 'Sin resultados para los filtros aplicados.' : 'Sin técnicos asignados.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'materiales' && (
          <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: '.7rem', marginBottom: '.8rem' }}>
              <select className="form-select" value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)}>
                <option value="">Selecciona material...</option>
                {materialsCatalog.map((item) => (
                  <option key={item.id} value={item.id}>{item.codigo} - {item.descripcion}</option>
                ))}
              </select>
              <input type="number" min="1" className="form-input" value={cantidadMaterial} onChange={(e) => setCantidadMaterial(e.target.value)} />
              <button type="button" className="btn btn-primary" onClick={addMaterial}>Agregar</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#e5e7eb' }}>
                  {['Código', 'Descripción', 'Unidad', 'Cantidad', 'Acción'].map((h) => <th key={h} style={{ border: '1px solid #d1d5db', padding: '.45rem', textAlign: 'left' }}>{h}</th>)}
                </tr>
                <TableFilterRow columns={assignedMaterialColumns} rows={materialesAsignados} filters={assignedMaterialFilters.filters} onChange={assignedMaterialFilters.setFilter} />
              </thead>
              <tbody>
                {visibleMaterialesAsignados.map((item) => (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.descripcion}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.unidad || 'UND'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.cantidad}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removeMaterial(item.id)}>Quitar</button></td>
                  </tr>
                ))}
                {!visibleMaterialesAsignados.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>{materialesAsignados.length ? 'Sin resultados para los filtros aplicados.' : 'Sin materiales asignados.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', marginTop: '.8rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>Guardar cambios OT</button>
        </div>
      </div>
    </div>
  );
}

function RegisterWorkModal({
  alert, rrhhItems, materialsCatalog, initialReport = null, canCreateServiceReport = false, onClose, onSave,
}) {
  const initialTechs = (alert.personal_mantenimiento || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, idx) => ({ id: `tech_${idx}_${name}`, tecnicoId: null, tecnico: name, horas: '', actividades: '' }));

  const [techRows, setTechRows] = useState(
    initialReport?.tecnicos?.length
      ? initialReport.tecnicos.map((row, idx) => ({
        id: `tech_saved_${idx}_${row.tecnicoId || 'x'}`,
        tecnicoId: row.tecnicoId || null,
        tecnico: row.tecnico || '',
        horas: row.horas || '',
        actividades: row.actividades || '',
        codigo: row.codigo || '',
        nombres_apellidos: row.nombres_apellidos || '',
        especialidad: row.especialidad || '',
        costo_hora: row.costo_hora || '',
      }))
      : (initialTechs.length ? initialTechs : []),
  );
  const [materialsRows, setMaterialsRows] = useState(
    (initialReport?.materialesConfirmados || alert.materiales_detalle || []).map((item, idx) => ({
      id: `mat_${idx}_${item.id || item.codigo || 'x'}`,
      materialId: item.materialId || item.id || null,
      codigo: item.codigo || '',
      descripcion: item.descripcion || '',
      cantidadPlanificada: Number(item.cantidadPlanificada ?? item.cantidad) || 0,
      cantidadConfirmada: Number(item.cantidadConfirmada ?? item.cantidad) || 0,
      confirmada: item.confirmada ?? true,
    })),
  );
  const [extraMaterials, setExtraMaterials] = useState(
    (initialReport?.materialesExtra || []).map((row, idx) => ({
      id: `extra_saved_${idx}_${row.materialId || row.codigo || 'x'}`,
      materialId: row.materialId || null,
      codigo: row.codigo || '',
      descripcion: row.descripcion || '',
      cantidad: row.cantidad || '',
    })),
  );
  const [observaciones, setObservaciones] = useState(initialReport?.observaciones || '');
  const [observationPreset, setObservationPreset] = useState(initialReport?.maintenanceSuggestion?.presetKey || '');
  const [observationDetail, setObservationDetail] = useState(initialReport?.maintenanceSuggestion?.detail || '');
  const [fechaInicio, setFechaInicio] = useState(initialReport?.fechaInicio || alert.registro_ot?.fecha_inicio || '');
  const [horaInicio, setHoraInicio] = useState(initialReport?.horaInicio || alert.registro_ot?.hora_inicio || '');
  const [fechaFin, setFechaFin] = useState(initialReport?.fechaFin || alert.registro_ot?.fecha_fin || '');
  const [horaFin, setHoraFin] = useState(initialReport?.horaFin || alert.registro_ot?.hora_fin || '');
  const [showTechPicker, setShowTechPicker] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [reportType, setReportType] = useState(initialReport?.reportType || 'TRABAJO');
  const [serviceProviderId, setServiceProviderId] = useState(initialReport?.serviceProviderId || '');
  const [serviceActivity, setServiceActivity] = useState(initialReport?.serviceActivity || '');
  const [serviceCost, setServiceCost] = useState(initialReport?.serviceCost || '');
  const [serviceAllInclusive, setServiceAllInclusive] = useState(!!initialReport?.serviceAllInclusive);
  const [evidencePhotos, setEvidencePhotos] = useState(() => getWorkReportEvidencePhotos(initialReport || {}));
  const [uploadingEvidenceSlot, setUploadingEvidenceSlot] = useState('');
  const maxHorasSugeridas = useMemo(() => {
    if (!fechaInicio || !horaInicio || !fechaFin || !horaFin) return 0;
    const start = new Date(`${fechaInicio}T${horaInicio}:00`);
    const end = new Date(`${fechaFin}T${horaFin}:00`);
    const diffMs = end - start;
    if (Number.isNaN(diffMs) || diffMs <= 0) return 0;
    return Number((diffMs / (1000 * 60 * 60)).toFixed(2));
  }, [fechaInicio, horaInicio, fechaFin, horaFin]);
  const consistencyCheck = useMemo(
    () => evaluateWorkReportConsistency(alert, {
      fechaInicio,
      horaInicio,
      fechaFin,
      horaFin,
    }),
    [alert, fechaInicio, horaInicio, fechaFin, horaFin],
  );
  const selectedObservationPreset = useMemo(
    () => getObservationPreset(observationPreset),
    [observationPreset],
  );
  const isServiceReport = reportType === 'SERVICIO';
  const eligibleTechItems = useMemo(
    () => rrhhItems.filter((item) => String(item.tipo_personal || '').toLowerCase() !== 'tercero'),
    [rrhhItems],
  );
  const thirdPartyItems = useMemo(
    () => rrhhItems.filter((item) => String(item.tipo_personal || '').toLowerCase() === 'tercero'),
    [rrhhItems],
  );
  const selectedThirdParty = useMemo(
    () => thirdPartyItems.find((item) => String(item.id) === String(serviceProviderId)) || null,
    [thirdPartyItems, serviceProviderId],
  );
  const techTableColumns = useMemo(() => [
    { id: 'tecnico', label: 'Tecnico' },
    { id: 'horas', label: 'Horas' },
    { id: 'actividades', label: 'Actividades realizadas' },
    { id: 'accion', label: 'Accion', filterable: false },
  ], []);
  const techTableFilters = useTableColumnFilters(techTableColumns);
  const visibleTechRows = useMemo(
    () => filterRowsByColumns(techRows, techTableColumns, techTableFilters.filters),
    [techRows, techTableColumns, techTableFilters.filters],
  );
  const materialConfirmColumns = useMemo(() => [
    { id: 'codigo', label: 'Codigo' },
    { id: 'descripcion', label: 'Descripcion' },
    { id: 'cantidadPlanificada', label: 'Planificada' },
    { id: 'cantidadConfirmada', label: 'Confirmada' },
    { id: 'confirmada', label: 'Correcta', getValue: (row) => (row.confirmada ? 'Si' : 'No') },
  ], []);
  const materialConfirmFilters = useTableColumnFilters(materialConfirmColumns);
  const visibleMaterialsRows = useMemo(
    () => filterRowsByColumns(materialsRows, materialConfirmColumns, materialConfirmFilters.filters),
    [materialsRows, materialConfirmColumns, materialConfirmFilters.filters],
  );
  const extraMaterialColumns = useMemo(() => [
    { id: 'codigo', label: 'Codigo' },
    { id: 'descripcion', label: 'Descripcion' },
    { id: 'cantidad', label: 'Cantidad' },
    { id: 'accion', label: 'Accion', filterable: false },
  ], []);
  const extraMaterialFilters = useTableColumnFilters(extraMaterialColumns);
  const visibleExtraMaterials = useMemo(
    () => filterRowsByColumns(extraMaterials, extraMaterialColumns, extraMaterialFilters.filters),
    [extraMaterials, extraMaterialColumns, extraMaterialFilters.filters],
  );

  useEffect(() => {
    if (!observationPreset) return;
    setObservaciones(buildObservationText(observationPreset, observationDetail));
  }, [observationPreset, observationDetail]);

  const addTechFromRrhh = (item) => {
    setTechRows((prev) => {
      const exists = prev.some((row) => String(row.tecnicoId) === String(item.id));
      if (exists) return prev;
      return [...prev, {
        id: `tech_rrhh_${item.id}_${Date.now()}`,
        tecnicoId: item.id,
        tecnico: `${item.codigo} - ${item.nombres_apellidos}`,
        horas: maxHorasSugeridas || '',
        actividades: '',
        codigo: item.codigo || '',
        nombres_apellidos: item.nombres_apellidos || '',
        especialidad: item.especialidad || '',
        costo_hora: item.costo_hora || '',
      }];
    });
    setShowTechPicker(false);
  };

  const findRrhhForTechRow = (row) => {
    const rowId = String(row.tecnicoId || '').trim();
    const rowCode = String(row.codigo || row.tecnico || '').split(/\s+-\s+|\s+·\s+/)[0].trim().toLowerCase();
    return rrhhItems.find((item) => (
      (rowId && String(item.id) === rowId)
      || (rowCode && String(item.codigo || '').trim().toLowerCase() === rowCode)
    )) || null;
  };

  const addMaterialFromCatalog = (item) => {
    setExtraMaterials((prev) => [...prev, {
      id: `extra_mat_${item.id}_${Date.now()}`,
      materialId: item.id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      cantidad: '',
    }]);
    setShowMaterialPicker(false);
  };

  const updateTech = (id, field, value) => {
    setTechRows((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      if (field === 'horas') {
        const num = Number(value);
        if (num < 0) return { ...row, horas: 0 };
        if (maxHorasSugeridas > 0 && num > maxHorasSugeridas) return { ...row, horas: maxHorasSugeridas };
      }
      return { ...row, [field]: value };
    }));
  };

  const removeTech = (id) => {
    setTechRows((prev) => prev.filter((row) => row.id !== id));
  };

  const updateMaterial = (id, field, value) => {
    setMaterialsRows((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      if (field === 'cantidadConfirmada' && Number(value) < 0) return { ...row, [field]: 0 };
      return { ...row, [field]: value };
    }));
  };

  const updateExtraMaterial = (id, field, value) => {
    setExtraMaterials((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      if (field === 'cantidad' && Number(value) < 0) return { ...row, [field]: 0 };
      return { ...row, [field]: value };
    }));
  };

  const removeExtraMaterial = (id) => {
    setExtraMaterials((prev) => prev.filter((row) => row.id !== id));
  };

  const uploadEvidencePhoto = async (slotKey, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Selecciona una imagen valida.');
      return;
    }
    const slot = WORK_REPORT_PHOTO_SLOTS.find((item) => item.key === slotKey);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scope', `work_notification_${alert.id}_${initialReport?.id || Date.now()}_${slotKey}`);
    formData.append('category', slot?.label || slotKey);
    formData.append('caption', file.name);
    setUploadingEvidenceSlot(slotKey);
    try {
      const uploaded = await uploadPhotoAttachment(formData);
      setEvidencePhotos((prev) => ({
        ...prev,
        [slotKey]: buildUploadedPhotoPayload(uploaded, {
          category: slot?.label || slotKey,
          original_name: file.name,
        }),
      }));
    } catch (err) {
      console.error('Error subiendo evidencia de trabajo:', err);
      window.alert(err?.response?.data?.detail || 'No se pudo subir la foto de evidencia.');
    } finally {
      setUploadingEvidenceSlot('');
    }
  };

  const handleSubmit = () => {
    if (!fechaInicio || !horaInicio || !fechaFin || !horaFin) {
      window.alert('Debes registrar fecha y hora de inicio y fin.');
      return;
    }
    const startDateTime = new Date(`${fechaInicio}T${horaInicio}:00`);
    const endDateTime = new Date(`${fechaFin}T${horaFin}:00`);
    if (
      Number.isNaN(startDateTime.getTime())
      || Number.isNaN(endDateTime.getTime())
      || startDateTime >= endDateTime
    ) {
      window.alert('La fecha y hora de inicio deben ser menores a la fecha y hora de fin.');
      return;
    }
    if (consistencyCheck.hasInconsistency) {
      window.alert(`Se detectó una inconsistencia entre el sub-registro y el rango liberado de la OT. ${consistencyCheck.reason}`);
      const confirmInconsistentSave = window.confirm('Si continúas, el registro se guardará con inconsistencia. La OT podrá enviarse a solicitud de cierre, pero no podrá cerrarse hasta corregir la fecha liberada y revisar que todo quede conforme. ¿Deseas registrar de todos modos?');
      if (!confirmInconsistentSave) return;
    }

    if (!getPhotoSource(evidencePhotos.before) || !getPhotoSource(evidencePhotos.after)) {
      window.alert('Debes subir exactamente una foto ANTES y una foto DESPUES para esta notificacion de trabajo.');
      return;
    }
    if (hasBlockedMaintenanceTextChars(observaciones) || hasBlockedMaintenanceTextChars(observationDetail)) {
      window.alert(getBlockedTextMessage('Observaciones'));
      return;
    }
    if (hasBlockedMaintenanceTextChars(serviceActivity)) {
      window.alert(getBlockedTextMessage('Actividades del servicio'));
      return;
    }
    const numericValidationError = firstValidationError(
      validateNonNegativeFields([
        ['Costo del servicio', serviceCost],
        ...techRows.map((row, index) => [`Horas tecnico ${index + 1}`, row.horas]),
        ...materialsRows.map((row, index) => [`Cantidad material planificado ${index + 1}`, row.cantidadConfirmada]),
        ...extraMaterials.map((row, index) => [`Cantidad material extra ${index + 1}`, row.cantidad]),
      ]),
    );
    if (numericValidationError) {
      window.alert(numericValidationError);
      return;
    }
    if (techRows.some((row) => Number(row.horas) < 0 || hasBlockedMaintenanceTextChars(row.tecnico) || hasBlockedMaintenanceTextChars(row.actividades))) {
      window.alert('Revisa tecnicos, horas y actividades: no se permiten horas negativas ni caracteres no permitidos.');
      return;
    }
    if (materialsRows.some((row) => Number(row.cantidadConfirmada) < 0) || extraMaterials.some((row) => Number(row.cantidad) < 0 || hasBlockedMaintenanceTextChars(row.codigo) || hasBlockedMaintenanceTextChars(row.descripcion))) {
      window.alert('Revisa materiales: no se permiten cantidades negativas ni caracteres no permitidos.');
      return;
    }

    const tecnicosValidos = isServiceReport
      ? []
      : techRows
        .map((row) => ({
          tecnicoId: row.tecnicoId,
          tecnico: row.tecnico.trim(),
          horas: Number(row.horas) || 0,
          actividades: row.actividades.trim(),
          codigo: row.codigo || findRrhhForTechRow(row)?.codigo || '',
          nombres_apellidos: row.nombres_apellidos || findRrhhForTechRow(row)?.nombres_apellidos || '',
          especialidad: row.especialidad || findRrhhForTechRow(row)?.especialidad || '',
          costo_hora: Number(row.costo_hora || findRrhhForTechRow(row)?.costo_hora || 0),
        }))
        .filter((row) => row.tecnico && row.horas > 0);

    if (!isServiceReport && !tecnicosValidos.length) {
      window.alert('Debes registrar al menos un técnico con horas trabajadas.');
      return;
    }

    if (isServiceReport && !canCreateServiceReport) {
      window.alert('Solo ENCARGADO, PLANNER o INGENIERO pueden registrar una notificación de tipo servicio.');
      return;
    }

    if (isServiceReport && !selectedThirdParty) {
      window.alert('Debes seleccionar el tercero que realizará el servicio.');
      return;
    }

    if (isServiceReport && !String(serviceActivity || '').trim()) {
      window.alert('Debes detallar las actividades que realizará el tercero.');
      return;
    }

    if (false && isServiceReport && !(Number(serviceCost) > 0)) {
      window.alert('Debes registrar el costo del servicio para poder revisarlo y cerrar la OT después.');
      return;
    }

    const materialesConfirmados = isServiceReport && serviceAllInclusive
      ? []
      : materialsRows.map((row) => ({
        materialId: row.materialId,
        codigo: row.codigo,
        descripcion: row.descripcion,
        cantidadPlanificada: row.cantidadPlanificada,
        cantidadConfirmada: Number(row.cantidadConfirmada) || 0,
        confirmada: !!row.confirmada,
      }));

    const materialesExtra = isServiceReport && serviceAllInclusive
      ? []
      : extraMaterials
        .map((row) => ({
          materialId: row.materialId,
          codigo: row.codigo.trim(),
          descripcion: row.descripcion.trim(),
          cantidad: Number(row.cantidad) || 0,
        }))
        .filter((row) => row.descripcion && row.cantidad > 0);

    onSave({
      reportType,
      tecnicos: tecnicosValidos,
      materialesConfirmados,
      materialesExtra,
      observaciones: observaciones.trim(),
      serviceProviderId: selectedThirdParty?.id || '',
      serviceProviderName: selectedThirdParty?.nombres_apellidos || '',
      serviceCompany: selectedThirdParty?.empresa || '',
      serviceActivity: isServiceReport ? String(serviceActivity || '').trim() : '',
      serviceCost: isServiceReport ? Math.max(0, Number(serviceCost) || 0) : 0,
      serviceAllInclusive: isServiceReport ? serviceAllInclusive : false,
      maintenanceSuggestion: observationPreset ? {
        presetKey: observationPreset,
        label: selectedObservationPreset?.label || '',
        noticeCategory: selectedObservationPreset?.noticeCategory || '',
        detail: observationDetail.trim(),
        text: observaciones.trim() || buildObservationText(observationPreset, observationDetail),
        requiresNotice: !!selectedObservationPreset?.requiresNotice,
      } : null,
      evidencePhotos,
      evidence_photos: evidencePhotos,
      fechaInicio,
      horaInicio,
      fechaFin,
      horaFin,
      totalHoras: Number(tecnicosValidos.reduce((sum, row) => sum + row.horas, 0).toFixed(2)),
      dateConsistencySnapshot: {
        hasInconsistency: consistencyCheck.hasInconsistency,
        reason: consistencyCheck.reason,
        otRangeLabel: consistencyCheck.otRangeLabel,
        overrideAccepted: consistencyCheck.hasInconsistency,
        checkedAt: new Date().toISOString(),
      },
    });
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: '1rem' }}>
        <div className="card" style={{ width: 'min(1160px, 98vw)', maxHeight: '95vh', overflow: 'auto', padding: '1rem 1.1rem', marginBottom: 0 }}>
          <h3 className="card-title" style={{ marginBottom: '.35rem' }}>
            {initialReport ? 'Editar registro de trabajo' : 'Registrar Trabajo'} · OT #{alert.ot_numero || 'N.A.'}
          </h3>
          <p style={{ color: '#6b7280', marginBottom: '.8rem' }}>
            {canCreateServiceReport
              ? 'Puedes registrar trabajo interno o un servicio de terceros, manteniendo todo vinculado a esta OT.'
              : 'Selecciona técnicos y materiales desde sus catálogos para mantener consistencia.'}
          </p>

          {canCreateServiceReport && (
            <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
              <h4 style={{ marginBottom: '.55rem' }}>Tipo de notificación</h4>
              <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={reportType === 'TRABAJO' ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setReportType('TRABAJO')}
                >
                  Trabajo interno
                </button>
                <button
                  type="button"
                  className={reportType === 'SERVICIO' ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setReportType('SERVICIO')}
                >
                  Servicio de terceros
                </button>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
            <h4 style={{ marginBottom: '.5rem' }}>Fecha y hora del trabajo</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.6rem' }}>
              <div><label className="form-label">Fecha inicio</label><input className="form-input" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></div>
              <div><label className="form-label">Hora inicio</label><input className="form-input" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></div>
              <div><label className="form-label">Fecha fin</label><input className="form-input" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></div>
              <div><label className="form-label">Hora fin</label><input className="form-input" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></div>
            </div>
            {!isServiceReport && (
              <p style={{ marginTop: '.5rem', color: '#374151', fontSize: '.92rem' }}>
                Máximo sugerido de horas por técnico según rango ingresado: <strong>{maxHorasSugeridas || 0} h</strong>.
              </p>
            )}
            {consistencyCheck.hasInconsistency ? (
              <div style={{ marginTop: '.65rem', background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '.65rem', padding: '.75rem .85rem', fontSize: '.92rem' }}>
                <strong>Inconsistencia detectada.</strong> {consistencyCheck.reason}
                <div style={{ marginTop: '.25rem' }}>
                  Rango liberado OT: <strong>{consistencyCheck.otRangeLabel || 'No definido'}</strong>.
                </div>
              </div>
            ) : null}
          </div>

          {isServiceReport ? (
            <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
              <h4 style={{ marginBottom: '.55rem' }}>Servicio de terceros</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tercero que realizará el servicio</label>
                  <select className="form-select" value={serviceProviderId} onChange={(e) => setServiceProviderId(e.target.value)}>
                    <option value="">Selecciona tercero...</option>
                    {thirdPartyItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.codigo} · {item.nombres_apellidos}{item.empresa && item.empresa !== 'N.A.' ? ` · ${item.empresa}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Costo del servicio</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-input"
                    value={serviceCost}
                    onChange={(e) => setServiceCost(e.target.value)}
                    placeholder="Ej: 1250.00"
                  />
                  <div style={{ marginTop: '.35rem', color: Number(serviceCost) > 0 ? '#166534' : '#b45309', fontSize: '.88rem', fontWeight: 600 }}>
                    {Number(serviceCost) > 0
                      ? 'Costo de servicio registrado. La OT ya puede revisarse sin este pendiente.'
                      : 'Puedes guardar la notificacion sin costo, pero la OT no podra cerrarse hasta completarlo.'}
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', fontWeight: 600, color: '#1f2937' }}>
                    <input
                      type="checkbox"
                      checked={serviceAllInclusive}
                      onChange={(e) => setServiceAllInclusive(e.target.checked)}
                    />
                    Todo costo
                  </label>
                  <div style={{ marginTop: '.35rem', color: '#6b7280', fontSize: '.9rem' }}>
                    Si marcas esta casilla, el servicio ya incluye materiales y no se descontará stock en esta notificación.
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label className="form-label">Actividades que realizará el tercero</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    value={serviceActivity}
                    onChange={(e) => setServiceActivity(e.target.value)}
                    placeholder="Describe el alcance del servicio tercerizado"
                  />
                </div>
              </div>
              {!thirdPartyItems.length && (
                <div style={{ marginTop: '.75rem', color: '#b45309', fontWeight: 600 }}>
                  No hay terceros registrados en Gestión de RRHH. Regístralos ahí para poder seleccionar el servicio.
                </div>
              )}
            </div>
          ) : (
            <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.6rem' }}>
                <h4>Horas y actividades por técnico</h4>
                <button type="button" className="btn btn-secondary" onClick={() => setShowTechPicker(true)}>+ Agregar técnico</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                  <thead>
                    <tr style={{ background: '#e5e7eb' }}>
                      <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Técnico</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Horas</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Actividades realizadas</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Acción</th>
                    </tr>
                    <TableFilterRow columns={techTableColumns} rows={techRows} filters={techTableFilters.filters} onChange={techTableFilters.setFilter} />
                  </thead>
                  <tbody>
                    {visibleTechRows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" value={row.tecnico} onChange={(e) => updateTech(row.id, 'tecnico', e.target.value)} /></td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" type="number" min="0" max={maxHorasSugeridas || undefined} step="0.25" value={row.horas} placeholder={maxHorasSugeridas ? `Máx ${maxHorasSugeridas}` : ''} onChange={(e) => updateTech(row.id, 'horas', e.target.value)} /></td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" value={row.actividades} onChange={(e) => updateTech(row.id, 'actividades', e.target.value)} /></td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removeTech(row.id)}>Quitar</button></td>
                      </tr>
                    ))}
                    {!visibleTechRows.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>{techRows.length ? 'Sin resultados para los filtros aplicados.' : 'No hay técnicos agregados.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(!isServiceReport || !serviceAllInclusive) && (
          <>
          <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
            <h4 style={{ marginBottom: '.55rem' }}>Confirmar materiales asignados</h4>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
              <thead>
                <tr style={{ background: '#e5e7eb' }}>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Código</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Descripción</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Planificada</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Confirmada</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>¿Correcta?</th>
                </tr>
                <TableFilterRow columns={materialConfirmColumns} rows={materialsRows} filters={materialConfirmFilters.filters} onChange={materialConfirmFilters.setFilter} />
              </thead>
              <tbody>
                {visibleMaterialsRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{row.codigo || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{row.descripcion || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{row.cantidadPlanificada}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', maxWidth: '130px' }}><input className="form-input" type="number" min="0" value={row.cantidadConfirmada} onChange={(e) => updateMaterial(row.id, 'cantidadConfirmada', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}><input type="checkbox" checked={row.confirmada} onChange={(e) => updateMaterial(row.id, 'confirmada', e.target.checked)} /></td>
                  </tr>
                ))}
                {!visibleMaterialsRows.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>{materialsRows.length ? 'Sin resultados para los filtros aplicados.' : 'No hay materiales asignados en la OT.'}</td></tr>}
              </tbody>
            </table>
            </div>
          </div>

          <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.6rem' }}>
              <h4>Agregar materiales adicionales</h4>
              <button type="button" className="btn btn-secondary" onClick={() => setShowMaterialPicker(true)}>+ Agregar material</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
              <thead>
                <tr style={{ background: '#e5e7eb' }}>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Código</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Descripción</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Cantidad</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Acción</th>
                </tr>
                <TableFilterRow columns={extraMaterialColumns} rows={extraMaterials} filters={extraMaterialFilters.filters} onChange={extraMaterialFilters.setFilter} />
              </thead>
              <tbody>
                {visibleExtraMaterials.map((row) => (
                  <tr key={row.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" value={row.codigo} onChange={(e) => updateExtraMaterial(row.id, 'codigo', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" value={row.descripcion} onChange={(e) => updateExtraMaterial(row.id, 'descripcion', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', maxWidth: '130px' }}><input className="form-input" type="number" min="0" value={row.cantidad} onChange={(e) => updateExtraMaterial(row.id, 'cantidad', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removeExtraMaterial(row.id)}>Quitar</button></td>
                  </tr>
                ))}
                {!visibleExtraMaterials.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>{extraMaterials.length ? 'Sin resultados para los filtros aplicados.' : 'Sin materiales adicionales.'}</td></tr>}
              </tbody>
            </table>
            </div>
          </div>
          </>
          )}

          <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
            <h4 style={{ marginBottom: '.55rem' }}>Evidencia fotografica obligatoria</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '.75rem' }}>
              {WORK_REPORT_PHOTO_SLOTS.map((slot) => {
                const photo = evidencePhotos[slot.key];
                const src = getPhotoSource(photo);
                return (
                  <div key={slot.key} style={{ border: `1px solid ${src ? '#86efac' : '#fca5a5'}`, borderRadius: '.75rem', overflow: 'hidden', background: '#fff' }}>
                    <div style={{ padding: '.65rem .75rem', background: src ? '#ecfdf5' : '#fef2f2', color: src ? '#166534' : '#991b1b', fontWeight: 800, display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'center' }}>
                      <span>{slot.title} *</span>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: uploadingEvidenceSlot ? 'not-allowed' : 'pointer', opacity: uploadingEvidenceSlot ? .65 : 1 }}>
                        {uploadingEvidenceSlot === slot.key ? 'Subiendo...' : (src ? 'Reemplazar' : 'Subir')}
                        <input type="file" accept="image/*" style={{ display: 'none' }} disabled={!!uploadingEvidenceSlot} onChange={(event) => uploadEvidencePhoto(slot.key, event)} />
                      </label>
                    </div>
                    {src ? (
                      <>
                        <img src={src} alt={slot.title} style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }} />
                        <div style={{ padding: '.5rem .65rem', color: '#475569', fontSize: '.86rem' }}>
                          {photo.original_name || photo.caption || 'Evidencia cargada'}
                        </div>
                      </>
                    ) : (
                      <div style={{ height: '180px', display: 'grid', placeItems: 'center', color: '#991b1b', fontWeight: 700, padding: '1rem', textAlign: 'center' }}>
                        Falta cargar esta foto para guardar la notificacion.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
            <h4 style={{ marginBottom: '.5rem' }}>Observaciones</h4>
            <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
              {WORK_OBSERVATION_PRESETS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={observationPreset === item.key ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ padding: '.38rem .75rem' }}
                  onClick={() => setObservationPreset((prev) => (prev === item.key ? '' : item.key))}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {observationPreset && (
              <div style={{ marginBottom: '.65rem' }}>
                <label className="form-label">Detalle complementario</label>
                <input
                  className="form-input"
                  value={observationDetail}
                  onChange={(e) => setObservationDetail(e.target.value)}
                  placeholder="Detalla la observacion o el servicio requerido"
                />
                <div style={{ marginTop: '.35rem', color: selectedObservationPreset?.requiresNotice ? '#b45309' : '#64748b', fontSize: '.88rem' }}>
                  {selectedObservationPreset?.requiresNotice
                    ? 'Esta observacion generara un aviso de mantenimiento cuando la OT sea cerrada y revisada.'
                    : 'Esta observacion quedara como constancia del trabajo realizado.'}
                </div>
              </div>
            )}
            <textarea className="form-textarea" rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Notas finales del trabajo ejecutado" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit}>Guardar registro</button>
          </div>
        </div>
      </div>

      {!isServiceReport && showTechPicker && (
        <PickerModal
          title="Seleccionar técnico (RRHH)"
          placeholder="Buscar por código, nombre o especialidad"
          items={eligibleTechItems}
          filterFn={(item, q) => !q || `${item.codigo} ${item.nombres_apellidos} ${item.especialidad}`.toLowerCase().includes(q)}
          itemLabel={(item) => `${item.codigo} · ${item.nombres_apellidos} · ${item.especialidad || 'N.A.'}`}
          onPick={addTechFromRrhh}
          onClose={() => setShowTechPicker(false)}
        />
      )}

      {(!isServiceReport || !serviceAllInclusive) && showMaterialPicker && (
        <PickerModal
          title="Seleccionar material (Gestión de Materiales)"
          placeholder="Buscar por código, descripción, marca o proveedor"
          items={materialsCatalog}
          filterFn={(item, q) => !q || `${item.codigo} ${item.descripcion} ${item.marca} ${item.proveedor}`.toLowerCase().includes(q)}
          itemLabel={(item) => `${item.codigo} · ${item.descripcion}`}
          onPick={addMaterialFromCatalog}
          onClose={() => setShowMaterialPicker(false)}
        />
      )}
    </>
  );
}

export default function WorkNotifications({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [workReports, setWorkReports] = useState([]);
  const [rrhhItems, setRrhhItems] = useState(RRHH_FALLBACK);
  const [materialsCatalog, setMaterialsCatalog] = useState(MATERIALES_FALLBACK);
  const [pdfSettings, setPdfSettings] = useState(DEFAULT_OT_PDF_SETTINGS);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);
  const [showEditOtModal, setShowEditOtModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReprogramModal, setShowReprogramModal] = useState(false);
  const [closeModalIntent, setCloseModalIntent] = useState('close');
  const [alertPresence, setAlertPresence] = useState([]);
  const [selectedAlertLock, setSelectedAlertLock] = useState(null);
  const [expandedOtIds, setExpandedOtIds] = useState({});
  const [mobileActionMenu, setMobileActionMenu] = useState(null);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(12);
  const [filterArea, setFilterArea] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterEquipment, setFilterEquipment] = useState('');
  const [showCoworkerOtView, setShowCoworkerOtView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const presenceWsRef = useRef(null);
  const editingPresenceRef = useRef(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [alertsData, reportsData, rrhhData, materialsData, pdfFormatData] = await Promise.all([
        loadSharedDocument(OT_ALERTS_KEY, []),
        loadSharedDocument(OT_WORK_REPORTS_KEY, []),
        loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
        loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
        loadSharedDocument(PDF_FORMAT_KEY, DEFAULT_OT_PDF_SETTINGS),
      ]);
      if (!active) return;
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      setWorkReports(Array.isArray(reportsData) ? reportsData : []);
      setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
      setMaterialsCatalog(normalizeMaterialsCatalog(materialsData));
      setPdfSettings(normalizeOtPdfSettings(pdfFormatData));
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const focusAlertId = location.state?.focusAlertId;
    if (loading || !focusAlertId) return;

    const targetAlert = alerts.find((item) => String(item.id) === String(focusAlertId));
    if (targetAlert) {
      setSelectedAlertId(targetAlert.id);
      setExpandedOtIds((prev) => ({ ...prev, [targetAlert.id]: true }));
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [loading, location.state, location.pathname, alerts, navigate]);

  const persistAlerts = async (nextAlerts) => {
    setAlerts(nextAlerts);
    try {
      await saveSharedDocument(OT_ALERTS_KEY, nextAlerts);
      setError('');
    } catch (err) {
      console.error('Error guardando alertas OT:', err);
      setError('No se pudieron guardar las notificaciones de trabajo en el servidor.');
    }
  };

  const persistWorkReports = async (nextReports) => {
    setWorkReports(nextReports);
    try {
      await saveSharedDocument(OT_WORK_REPORTS_KEY, nextReports);
      setError('');
    } catch (err) {
      console.error('Error guardando reportes OT:', err);
      setError('No se pudieron guardar los reportes de trabajo en el servidor.');
    }
  };

  const liberatedNotifications = useMemo(
    () => alerts
      .filter((item) => item.status_ot === 'Liberada')
      .sort((a, b) => new Date(b.fecha_ejecutar || 0) - new Date(a.fecha_ejecutar || 0)),
    [alerts],
  );

  const editingReport = useMemo(
    () => workReports.find((item) => item.id === editingReportId) || null,
    [workReports, editingReportId],
  );
  const normalizedRole = String(user?.role || '').toUpperCase();
  const isReadOnly = isReadOnlyRole(user);
  const isTechnician = normalizedRole === 'TECNICO';
  const canCreateServiceReports = ['PLANNER', 'ENCARGADO', 'INGENIERO'].includes(normalizedRole);
  const canEditLiberatedOt = ['PLANNER', 'ENCARGADO', 'INGENIERO'].includes(normalizedRole);
  const canReprogramOt = ['PLANNER', 'ENCARGADO', 'INGENIERO'].includes(normalizedRole);
  const canRequestClose = ['PLANNER', 'ENCARGADO', 'INGENIERO'].includes(normalizedRole);
  const canApproveClose = ['PLANNER', 'INGENIERO'].includes(normalizedRole);

  const reportByAlert = useMemo(() => {
    const map = new Map();
    workReports.forEach((item) => {
      const key = String(item.alertId);
      const existing = map.get(key) || [];
      existing.push(item);
      map.set(key, existing);
    });
    map.forEach((rows, key) => {
      map.set(key, rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    });
    return map;
  }, [workReports]);
  const consistencyByAlert = useMemo(() => {
    const map = new Map();
    alerts.forEach((item) => {
      map.set(String(item.id), getAlertConsistencySummary(item, reportByAlert.get(String(item.id)) || []));
    });
    return map;
  }, [alerts, reportByAlert]);

  const requestCloseNotifications = useMemo(
    () => alerts
      .filter((item) => item.status_ot === 'Solicitud de cierre')
      .sort((a, b) => new Date(b.cierre_ot?.solicitud_cierre_fecha || 0) - new Date(a.cierre_ot?.solicitud_cierre_fecha || 0)),
    [alerts],
  );

  const technicianAssignedNotifications = useMemo(
    () => liberatedNotifications.filter((item) => isAlertAssignedToUser(item, user)),
    [liberatedNotifications, user],
  );

  const technicianCoworkerNotifications = useMemo(
    () => liberatedNotifications.filter((item) => !isAlertAssignedToUser(item, user)),
    [liberatedNotifications, user],
  );

  const visibleNotifications = useMemo(() => {
    if (canApproveClose) return [...requestCloseNotifications, ...liberatedNotifications];
    if (isReadOnly) return [...requestCloseNotifications, ...liberatedNotifications];
    if (isTechnician) {
      return showCoworkerOtView ? technicianCoworkerNotifications : technicianAssignedNotifications;
    }
    return liberatedNotifications;
  }, [canApproveClose, requestCloseNotifications, liberatedNotifications, isReadOnly, isTechnician, showCoworkerOtView, technicianCoworkerNotifications, technicianAssignedNotifications]);

  const selectedAlert = useMemo(
    () => visibleNotifications.find((item) => String(item.id) === String(selectedAlertId)) || null,
    [visibleNotifications, selectedAlertId],
  );
  const selectedAlertAssignedToMe = useMemo(
    () => (selectedAlert ? isAlertAssignedToUser(selectedAlert, user) : false),
    [selectedAlert, user],
  );
  const selectedAlertConsistency = useMemo(
    () => (selectedAlert ? consistencyByAlert.get(String(selectedAlert.id)) || { hasInconsistency: false, count: 0, inconsistentReports: [] } : { hasInconsistency: false, count: 0, inconsistentReports: [] }),
    [selectedAlert, consistencyByAlert],
  );
  const selectedAlertServiceSummary = useMemo(
    () => summarizeServiceReports(selectedAlert ? reportByAlert.get(String(selectedAlert.id)) || [] : []),
    [selectedAlert, reportByAlert],
  );
  const isEditingSelectedAlert = showRegisterModal || showEditOtModal || showCloseModal || showReprogramModal;
  editingPresenceRef.current = isEditingSelectedAlert;
  const selectedAlertLockOwnedByMe = !!selectedAlertLock?.owned_by_current_user;
  const selectedAlertLockHeldByOthers = !!selectedAlertLock?.locked && !selectedAlertLock?.owned_by_current_user;
  const otherUsersInSelectedAlert = useMemo(
    () => alertPresence.filter((item) => String(item.id) !== String(user?.id ?? '')),
    [alertPresence, user],
  );
  const otherEditorsInSelectedAlert = useMemo(
    () => otherUsersInSelectedAlert.filter((item) => item.editing),
    [otherUsersInSelectedAlert],
  );
  const selectedAlertLockedByOthers = !!selectedAlert && (selectedAlertLockHeldByOthers || otherEditorsInSelectedAlert.length > 0);
  const otherEditorsLabel = useMemo(
    () => otherEditorsInSelectedAlert.map((item) => item.name).join(', '),
    [otherEditorsInSelectedAlert],
  );
  const activeLockHolderLabel = selectedAlertLock?.holder_name || otherEditorsLabel;

  const areaOptions = useMemo(
    () => Array.from(new Set(visibleNotifications.map((it) => getNotificationArea(it)))),
    [visibleNotifications],
  );
  const inconsistentAlertsCount = useMemo(
    () => Array.from(consistencyByAlert.values()).filter((item) => item.hasInconsistency).length,
    [consistencyByAlert],
  );
  const totalMaterialCost = useMemo(
    () => workReports.reduce((sum, report) => sum + calculateReportMaterialCost(report, materialsCatalog), 0),
    [workReports, materialsCatalog],
  );
  const totalServiceCost = useMemo(
    () => summarizeServiceReports(workReports).totalServiceCost,
    [workReports],
  );
  const canAssignSelectedToMe = !isReadOnly && isTechnician && showCoworkerOtView && selectedAlert?.status_ot === 'Liberada' && !selectedAlertAssignedToMe;

  useEffect(() => {
    if (!selectedAlert?.id) {
      setAlertPresence([]);
      if (presenceWsRef.current) {
        presenceWsRef.current.close();
        presenceWsRef.current = null;
      }
      return undefined;
    }

    const token = localStorage.getItem('access_token') || '';
    const wsBase = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${(process.env.REACT_APP_API_URL || 'localhost:8000').replace(/^https?:\/\//, '')}`;
    const ws = new WebSocket(`${wsBase}/ws/work-notifications/${encodeURIComponent(selectedAlert.id)}?token=${token}`);
    presenceWsRef.current = ws;

    const sendPresenceState = (editing) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'presence_state', editing: !!editing }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'work_notification_presence') {
          setAlertPresence(Array.isArray(data.participants) ? data.participants : []);
        }
      } catch (_) {}
    };

    ws.onopen = () => {
      sendPresenceState(editingPresenceRef.current);
    };

    const heartbeat = setInterval(() => {
      sendPresenceState(editingPresenceRef.current);
    }, 20000);

    return () => {
      clearInterval(heartbeat);
      if (ws.readyState === WebSocket.OPEN) {
        sendPresenceState(false);
      }
      ws.close();
      if (presenceWsRef.current === ws) {
        presenceWsRef.current = null;
      }
    };
  }, [selectedAlert?.id]);

  useEffect(() => {
    const ws = presenceWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'presence_state', editing: !!isEditingSelectedAlert }));
  }, [isEditingSelectedAlert, selectedAlert?.id]);

  useEffect(() => {
    if (!selectedAlert?.id) {
      setSelectedAlertLock(null);
      return undefined;
    }

    let active = true;
    const syncLock = async () => {
      try {
        const lock = await getWorkNotificationLock(selectedAlert.id);
        if (active) setSelectedAlertLock(lock);
      } catch (_) {
        if (active) setSelectedAlertLock(null);
      }
    };

    syncLock();
    const interval = setInterval(syncLock, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedAlert?.id]);

  useEffect(() => {
    if (!selectedAlert?.id || !isEditingSelectedAlert || !selectedAlertLockOwnedByMe) return undefined;
    const interval = setInterval(async () => {
      try {
        const lock = await refreshWorkNotificationLock(selectedAlert.id);
        setSelectedAlertLock(lock);
      } catch (err) {
        console.error('Error refrescando bloqueo de notificacion OT:', err);
        setSelectedAlertLock(null);
        setError('Se perdió el bloqueo de edición de esta OT. Revisa si otro usuario tomó el control.');
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedAlert?.id, isEditingSelectedAlert, selectedAlertLockOwnedByMe]);

  useEffect(() => () => {
    if (!selectedAlert?.id) return;
    releaseWorkNotificationLock(selectedAlert.id).catch((err) => {
      console.error('Error liberando bloqueo al desmontar Notificaciones de Trabajo:', err);
    });
  }, [selectedAlert?.id]);

  useEffect(() => {
    if (!visibleNotifications.length) {
      if (selectedAlertId !== null) setSelectedAlertId(null);
      return;
    }
    if (!selectedAlert) {
      setSelectedAlertId(visibleNotifications[0]?.id || null);
    }
  }, [visibleNotifications, selectedAlert, selectedAlertId]);

  useEffect(() => {
    setMobileVisibleCount(12);
  }, [filterArea, filterWorker, filterDate, filterEquipment, showCoworkerOtView]);

  useEffect(() => {
    if (!mobileActionMenu) return undefined;
    const closeMenu = () => setMobileActionMenu(null);
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('touchstart', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('touchstart', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileActionMenu]);

  const filteredNotifications = useMemo(() => visibleNotifications.filter((item) => {
    const reports = reportByAlert.get(String(item.id)) || [];
    const areaValue = getNotificationArea(item).toLowerCase();
    const workerValue = `${item.responsable || ''} ${item.personal_mantenimiento || ''}`.toLowerCase();
    const equipmentValue = `${item.codigo || ''} ${item.descripcion || ''} ${item.equipo || ''}`.toLowerCase();
    const dateMatches = !filterDate
      || item.fecha_ejecutar === filterDate
      || reports.some((r) => r.fechaInicio === filterDate || r.fechaFin === filterDate);

    return (!filterArea || areaValue === filterArea.toLowerCase())
      && (!filterWorker || workerValue.includes(filterWorker.toLowerCase()))
      && (!filterEquipment || equipmentValue.includes(filterEquipment.toLowerCase()))
      && dateMatches;
  }), [visibleNotifications, reportByAlert, filterArea, filterWorker, filterDate, filterEquipment]);

  const notificationTableColumns = useMemo(() => ([
    { id: 'sel', filterable: false },
    { id: 'registro', getValue: (item) => (reportByAlert.get(String(item.id)) || []).length ? `${(reportByAlert.get(String(item.id)) || []).length} registros` : 'Pendiente' },
    { id: 'estado_ot', getValue: (item) => `${item.status_ot || ''} ${item.cierre_ot?.devuelta_revision ? `Devuelta ${item.cierre_ot.motivo_devolucion_tipo || ''}` : ''} ${consistencyByAlert.get(String(item.id))?.hasInconsistency ? 'Inconsistencia' : ''}` },
    { id: 'ot_numero', getValue: (item) => item.ot_numero || 'N.A.' },
    { id: 'codigo', getValue: (item) => item.codigo || '' },
    { id: 'descripcion', getValue: (item) => item.descripcion || '' },
    { id: 'prioridad', getValue: (item) => item.prioridad || 'N.A.' },
    { id: 'actividad', getValue: (item) => item.actividad || 'N.A.' },
    { id: 'responsable', getValue: (item) => item.responsable || 'N.A.' },
    { id: 'fecha_ejecutar', getValue: (item) => formatDateDisplay(item.fecha_ejecutar || '', 'N.A.') },
    { id: 'fecha_inicio', getValue: (item) => formatDateDisplay(item.registro_ot?.fecha_inicio || '', 'N.A.') },
    { id: 'hora_inicio', getValue: (item) => item.registro_ot?.hora_inicio || 'N.A.' },
    { id: 'fecha_fin', getValue: (item) => formatDateDisplay(item.registro_ot?.fecha_fin || '', 'N.A.') },
    { id: 'hora_fin', getValue: (item) => item.registro_ot?.hora_fin || 'N.A.' },
    { id: 'personal', getValue: (item) => item.personal_mantenimiento || 'N.A.' },
    { id: 'materiales', getValue: (item) => item.materiales || 'N.A.' },
  ]), [consistencyByAlert, reportByAlert]);
  const {
    filters: notificationFilters,
    setFilter: setNotificationFilter,
  } = useTableColumnFilters(notificationTableColumns);
  const notificationTableRows = useMemo(
    () => filterRowsByColumns(filteredNotifications, notificationTableColumns, notificationFilters),
    [filteredNotifications, notificationTableColumns, notificationFilters],
  );
  const visibleMobileNotifications = useMemo(
    () => notificationTableRows.slice(0, mobileVisibleCount),
    [notificationTableRows, mobileVisibleCount],
  );

  const acquireSelectedAlertLock = async (actionLabel = 'editar esta OT') => {
    if (!selectedAlert?.id) return false;
    try {
      const lock = await acquireWorkNotificationLock(selectedAlert.id);
      setSelectedAlertLock(lock);
      return true;
    } catch (err) {
      const message = err?.response?.data?.detail || `No se pudo obtener el bloqueo para ${actionLabel}.`;
      setError(message);
      window.alert(message);
      return false;
    }
  };

  const releaseSelectedAlertLock = async (alertId = selectedAlert?.id) => {
    if (!alertId) return;
    try {
      const lock = await releaseWorkNotificationLock(alertId);
      setSelectedAlertLock(lock);
    } catch (err) {
      console.error('Error liberando bloqueo de notificacion OT:', err);
    }
  };

  const blockIfSelectedAlertLocked = (actionLabel = 'modificar esta OT') => {
    if (!selectedAlertLockedByOthers) return false;
    window.alert(`${activeLockHolderLabel || 'Otro usuario'} está editando esta notificación en este momento. Espera a que termine antes de ${actionLabel}.`);
    return true;
  };

  const saveWorkReport = async (payload) => {
    if (isReadOnly) return;
    if (!selectedAlert) return;
    if (blockIfSelectedAlertLocked('guardar cambios')) return;
    if (isTechnician && !selectedAlertAssignedToMe) {
      window.alert('Solo puedes registrar trabajo en OTs asignadas a ti. Si la OT pertenece a un companero, primero debes asignartela.');
      return;
    }
    if (selectedAlert.status_ot === 'Solicitud de cierre') {
      window.alert('La OT está en Solicitud de cierre. Ya no se pueden modificar las notificaciones de trabajo.');
      setShowRegisterModal(false);
      setEditingReportId(null);
      return;
    }
    if (payload.reportType === 'SERVICIO' && !canCreateServiceReports) {
      window.alert('Solo ENCARGADO, PLANNER o INGENIERO pueden registrar una notificación de tipo servicio.');
      return;
    }
    const isEditing = !!editingReportId;
    const currentReport = isEditing ? workReports.find((item) => item.id === editingReportId) || null : null;
    const existingForOt = workReports.filter((item) => String(item.alertId) === String(selectedAlert.id));
    const nextSequence = isEditing
      ? (currentReport?.sequence || (existingForOt.length || 1))
      : (existingForOt.length + 1);
    const reportCode = `NT${nextSequence}-${selectedAlert.ot_numero || selectedAlert.id}`;
    const report = {
      id: editingReportId || `work_report_${Date.now()}`,
      alertId: selectedAlert.id,
      otNumero: selectedAlert.ot_numero,
      sequence: nextSequence,
      reportCode,
      createdByUserId: isEditing
        ? (currentReport?.createdByUserId ?? currentReport?.created_by_user_id ?? user?.id ?? '')
        : (user?.id ?? ''),
      createdByUsername: isEditing
        ? (currentReport?.createdByUsername ?? currentReport?.created_by_username ?? user?.username ?? '')
        : (user?.username ?? ''),
      createdByName: isEditing
        ? (currentReport?.createdByName ?? currentReport?.created_by_name ?? user?.full_name ?? user?.username ?? '')
        : (user?.full_name ?? user?.username ?? ''),
      createdAt: isEditing
        ? (currentReport?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...payload,
    };

    const catalogLoaded = await loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK);
    const baseCatalog = normalizeMaterialsCatalog(catalogLoaded);
    const restoredCatalog = isEditing
      ? updateCatalogStock(baseCatalog, buildMaterialConsumptionMap(currentReport), 1)
      : { ok: true, data: baseCatalog.map((item) => ({ ...item })) };
    if (!restoredCatalog.ok) {
      window.alert(restoredCatalog.message);
      return;
    }

    const discountedCatalog = updateCatalogStock(restoredCatalog.data, buildMaterialConsumptionMap(report), -1);
    if (!discountedCatalog.ok) {
      window.alert(discountedCatalog.message);
      return;
    }

    const nextReports = isEditing
      ? workReports.map((item) => (item.id === editingReportId ? report : item))
      : [...workReports, report];
    await saveSharedDocument(MATERIALES_KEY, discountedCatalog.data);
    setMaterialsCatalog(discountedCatalog.data);
    await persistWorkReports(nextReports);

    const nextAlerts = alerts.map((item) => (String(item.id) === String(selectedAlert.id)
      ? { ...item, cierre_ot: { ...(item.cierre_ot || {}), trabajo_registrado: true, ultima_actualizacion: report.updatedAt } }
      : item));
    await persistAlerts(nextAlerts);

    setShowRegisterModal(false);
    setEditingReportId(null);
    await releaseSelectedAlertLock(selectedAlert.id);
    window.alert('Trabajo registrado correctamente.');
  };

  const handleAssignToMe = async () => {
    if (isReadOnly) return;
    if (!selectedAlert || !canAssignSelectedToMe) return;

    const rrhhMatch = findMatchingRrhhForUser(rrhhItems, user);
    const nextAssignee = rrhhMatch || {
      id: `self_${user?.id || user?.username || Date.now()}`,
      codigo: user?.username || user?.email || `USR-${user?.id || 'SELF'}`,
      nombres_apellidos: user?.full_name || user?.username || 'Tecnico',
      especialidad: user?.specialty || 'Tecnico',
      cargo: 'Tecnico',
      tipo_personal: 'Propio',
      empresa: '',
    };

    const nextAlerts = alerts.map((item) => {
      if (String(item.id) !== String(selectedAlert.id)) return item;

      const existingRows = Array.isArray(item.personal_detalle) ? item.personal_detalle : [];
      if (existingRows.some((row) => doesStaffRowMatchUser(row, user))) {
        return item;
      }

      const nextRows = [...existingRows, nextAssignee];
      return {
        ...item,
        personal_detalle: nextRows,
        personal_mantenimiento: buildAssignedPersonnelSummary(nextRows),
      };
    });

    await persistAlerts(nextAlerts);
    setShowCoworkerOtView(false);
    setSelectedAlertId(selectedAlert.id);
    window.alert('La OT ya quedo asignada a ti. Ahora la veras dentro de tus OTs y podras registrar tu trabajo.');
    appendAuditEntry({
      action: 'OT_ASIGNADA_A_TECNICO',
      module: 'Notificaciones de Trabajo',
      entityType: 'OT',
      entityId: selectedAlert.id,
      title: `OT ${selectedAlert.ot_numero || selectedAlert.codigo || selectedAlert.id} asignada`,
      description: `${user?.full_name || user?.username || 'Tecnico'} se asigno la OT para registrar trabajo.`,
      severity: 'info',
      actor: user,
      after: { status_ot: selectedAlert.status_ot, asignado_a: user?.full_name || user?.username || '' },
    }).catch((err) => console.error('Error auditando asignacion OT:', err));
  };

const handleDeleteReport = async (reportId) => {
    if (isReadOnly) return;
    if (blockIfSelectedAlertLocked('eliminar este registro')) return;
    const deletedReport = workReports.find((item) => item.id === reportId);
    if (!deletedReport) return;
    if (normalizedRole === 'TECNICO' && !isWorkReportOwnedByUser(deletedReport, user)) {
      window.alert('Solo puedes eliminar notificaciones de trabajo que hayas registrado tú.');
      return;
    }
    const relatedAlert = alerts.find((item) => String(item.id) === String(deletedReport.alertId));
    if (relatedAlert?.status_ot === 'Solicitud de cierre') {
      window.alert('La OT está en Solicitud de cierre. Ya no se pueden editar ni eliminar sus notificaciones de trabajo.');
      return;
    }
    if (!window.confirm('¿Eliminar este registro de trabajo?')) return;
    const catalogLoaded = await loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK);
    const baseCatalog = normalizeMaterialsCatalog(catalogLoaded);
    const restoredCatalog = updateCatalogStock(baseCatalog, buildMaterialConsumptionMap(deletedReport), 1);
    if (!restoredCatalog.ok) {
      window.alert(restoredCatalog.message);
      return;
    }

    const nextReports = workReports.filter((item) => item.id !== reportId);
    await saveSharedDocument(MATERIALES_KEY, restoredCatalog.data);
    setMaterialsCatalog(restoredCatalog.data);
    await persistWorkReports(nextReports);

    const reportsForAlert = nextReports
      .filter((item) => String(item.alertId) === String(deletedReport.alertId))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    const nextAlerts = alerts.map((item) => {
      if (String(item.id) !== String(deletedReport.alertId)) return item;
      return {
        ...item,
        cierre_ot: {
          ...(item.cierre_ot || {}),
          trabajo_registrado: reportsForAlert.length > 0,
          ultima_actualizacion: reportsForAlert[0]?.updatedAt || reportsForAlert[0]?.createdAt || '',
        },
      };
    });
    await persistAlerts(nextAlerts);
  };

  const handleOpenRegister = async () => {
    if (isReadOnly) return;
    if (!selectedAlert || selectedAlert.status_ot !== 'Liberada') {
      window.alert('Solo puedes registrar trabajo en una OT que esté Liberada.');
      return;
    }
    if (blockIfSelectedAlertLocked('registrar trabajo')) return;
    if (isTechnician && !selectedAlertAssignedToMe) {
      window.alert('Esta OT esta asignada a otro companero. Puedes verla, pero solo podras registrar trabajo cuando te la asignes.');
      return;
    }
    if (!(await acquireSelectedAlertLock('registrar trabajo'))) return;
    const [rrhhData, materialsData] = await Promise.all([
      loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
      loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
    ]);
    setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
    setMaterialsCatalog(normalizeMaterialsCatalog(materialsData));
    setEditingReportId(null);
    setShowRegisterModal(true);
  };

  const handleEditReport = async (alertId, reportId) => {
    if (isReadOnly) return;
    const targetAlert = alerts.find((item) => String(item.id) === String(alertId));
    const targetReport = workReports.find((item) => String(item.id) === String(reportId));
    if (normalizedRole === 'TECNICO' && !isWorkReportOwnedByUser(targetReport, user)) {
      window.alert('Solo puedes editar notificaciones de trabajo que hayas registrado tú.');
      return;
    }
    if (targetAlert?.status_ot === 'Solicitud de cierre') {
      window.alert('La OT está en Solicitud de cierre. Ya no se pueden editar sus notificaciones de trabajo.');
      return;
    }
    setSelectedAlertId(alertId);
    const [rrhhData, materialsData] = await Promise.all([
      loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
      loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
    ]);
    setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
    setMaterialsCatalog(normalizeMaterialsCatalog(materialsData));
    if (!(await acquireSelectedAlertLock('editar esta notificación'))) return;
    setEditingReportId(reportId);
    setShowRegisterModal(true);
  };

  const handleSaveOtChanges = async (payload) => {
    if (isReadOnly) return;
    if (!selectedAlert) return;
    if (blockIfSelectedAlertLocked('guardar la OT')) return;
    if (!['Liberada', 'Solicitud de cierre'].includes(selectedAlert.status_ot)) {
      window.alert('Solo puedes editar la OT mientras esté en estado Liberada o Solicitud de cierre.');
      return;
    }
    const nextAlerts = alerts.map((item) => {
      if (String(item.id) !== String(selectedAlert.id)) return item;
      return {
        ...item,
        prioridad: payload.prioridad,
        actividad: payload.actividad,
        responsable: payload.responsable,
        fecha_ejecutar: payload.fecha_ejecutar,
        personal_mantenimiento: (payload.personalAsignado || []).map((row) => `${row.codigo} - ${row.nombres_apellidos}`).join(', '),
        materiales: (payload.materialesAsignados || []).map((row) => `${row.codigo} x${row.cantidad}`).join(', '),
        personal_detalle: payload.personalAsignado || item.personal_detalle || [],
        materiales_detalle: payload.materialesAsignados || item.materiales_detalle || [],
        registro_ot: {
          ...(item.registro_ot || {}),
          fecha_inicio: payload.fecha_inicio_prop,
          fecha_fin: payload.fecha_fin_prop,
          hora_inicio: payload.hora_inicio_prop,
          hora_fin: payload.hora_fin_prop,
          turno: item.registro_ot?.turno || '',
          observaciones: payload.observaciones,
        },
      };
    });
    await persistAlerts(nextAlerts);
    setShowEditOtModal(false);
    await releaseSelectedAlertLock(selectedAlert.id);

    const updatedAlert = nextAlerts.find((item) => String(item.id) === String(selectedAlert.id));
    const updatedSummary = getAlertConsistencySummary(updatedAlert, reportByAlert.get(String(selectedAlert.id)) || []);
    if (updatedSummary.hasInconsistency) {
      window.alert(`La OT fue actualizada, pero aún mantiene ${updatedSummary.count} inconsistencia(s) de fechas. Revísala antes de cerrar la orden.`);
    } else {
      window.alert('La OT fue actualizada y los registros de trabajo quedaron conformes con el rango liberado.');
    }
  };

  const handleOpenEditOt = async () => {
    if (isReadOnly) return;
    if (!selectedAlert) return;
    if (blockIfSelectedAlertLocked('editar esta OT')) return;
    if (!(await acquireSelectedAlertLock('editar esta OT'))) return;
    setShowEditOtModal(true);
  };

  const handleOpenReprogramModal = async () => {
    if (isReadOnly) return;
    if (!selectedAlert) return;
    if (!canReprogramOt) return;
    if (blockIfSelectedAlertLocked('reprogramar esta OT')) return;
    if (selectedAlert.status_ot !== 'Liberada') {
      window.alert('Desde Notificaciones de Trabajo solo puedes reprogramar OTs liberadas. Si esta en Solicitud de cierre, primero devuelvela a Liberada.');
      return;
    }
    if (!(await acquireSelectedAlertLock('reprogramar esta OT'))) return;
    setShowReprogramModal(true);
  };

  const confirmReprogramOt = async (payload) => {
    if (isReadOnly || !selectedAlert || !canReprogramOt) return;
    if (blockIfSelectedAlertLocked('confirmar la reprogramacion')) return;
    const actorName = user?.full_name || user?.username || normalizedRole || 'Sistema';
    const nextAlerts = alerts.map((item) => (
      String(item.id) !== String(selectedAlert.id)
        ? item
        : applyOtReprogramming(item, payload, actorName)
    ));

    await persistAlerts(nextAlerts);
    setSelectedAlertId(selectedAlert.id);
    setShowReprogramModal(false);
    await releaseSelectedAlertLock(selectedAlert.id);

    appendAuditEntry({
      action: 'OT_REPROGRAMADA',
      module: 'Notificaciones de Trabajo',
      entityType: 'OT',
      entityId: selectedAlert.id,
      title: `OT ${selectedAlert.ot_numero || selectedAlert.codigo || selectedAlert.id} reprogramada`,
      description: `${formatDateDisplay(payload.fecha_anterior || '', 'N.A.')} -> ${formatDateDisplay(payload.fecha_nueva || '', 'N.A.')} | ${payload.motivo}`,
      severity: 'warning',
      actor: user,
      before: { fecha_ejecutar: payload.fecha_anterior },
      after: { fecha_ejecutar: payload.fecha_nueva, motivo: payload.motivo },
    }).catch((err) => console.error('Error auditando reprogramacion OT desde notificaciones:', err));
  };

  const handleRequestClose = async () => {
    if (isReadOnly) return;
    if (!selectedAlert) return;
    if (blockIfSelectedAlertLocked('solicitar cierre')) return;
    const reportsForAlert = reportByAlert.get(String(selectedAlert.id)) || [];
    const serviceSummary = summarizeServiceReports(reportsForAlert);
    if (!reportsForAlert.length) {
      window.alert('Debes tener al menos un registro de trabajo antes de solicitar cierre.');
      return;
    }
    const reportsMissingEvidence = findReportsMissingRequiredEvidence(reportsForAlert);
    if (reportsMissingEvidence.length) {
      window.alert(`Hay ${reportsMissingEvidence.length} notificacion(es) de trabajo sin foto ANTES y DESPUES. Completa esas evidencias antes de solicitar cierre.`);
      return;
    }
    if (serviceSummary.hasMissingServiceCost) {
      const confirmServiceRequest = window.confirm(`Hay ${serviceSummary.missingCostReports.length} notificación(es) de servicio sin costo registrado. Puedes enviar la OT a solicitud de cierre, pero no podrá cerrarse hasta completar ese costo. ¿Deseas continuar?`);
      if (!confirmServiceRequest) return;
    }
    if (selectedAlertConsistency.hasInconsistency) {
      const confirmRequest = window.confirm(`La OT tiene ${selectedAlertConsistency.count} inconsistencia(s) de fechas en sus registros. Puedes enviarla a solicitud de cierre, pero no podrá cerrarse hasta corregir la liberación y revisar que quede conforme. ¿Deseas continuar?`);
      if (!confirmRequest) return;
    }
    const nextAlerts = alerts.map((item) => {
      if (String(item.id) !== String(selectedAlert.id)) return item;
      return {
        ...item,
        status_ot: 'Solicitud de cierre',
        cierre_ot: {
          ...(item.cierre_ot || {}),
          solicitud_cierre: true,
          solicitud_cierre_fecha: new Date().toISOString(),
          solicitud_cierre_por: user?.full_name || user?.username || 'Encargado',
        },
      };
    });
    await persistAlerts(nextAlerts);
    setSelectedAlertId(null);
    await releaseSelectedAlertLock(selectedAlert.id);
    appendAuditEntry({
      action: 'OT_SOLICITA_CIERRE',
      module: 'Notificaciones de Trabajo',
      entityType: 'OT',
      entityId: selectedAlert.id,
      title: `OT ${selectedAlert.ot_numero || selectedAlert.codigo || selectedAlert.id} enviada a solicitud de cierre`,
      description: serviceSummary.hasMissingServiceCost
        ? 'La OT se envio a solicitud de cierre con servicios aun sin costo final.'
        : 'La OT quedo lista para revision de cierre.',
      severity: serviceSummary.hasMissingServiceCost || selectedAlertConsistency.hasInconsistency ? 'warning' : 'info',
      actor: user,
      before: { status_ot: selectedAlert.status_ot },
      after: { status_ot: 'Solicitud de cierre' },
    }).catch((err) => console.error('Error auditando solicitud de cierre:', err));
  };

  const runMobileOtAction = (item, action) => {
    setSelectedAlertId(item.id);
    setMobileActionMenu(null);
    window.setTimeout(action, 0);
  };

  const openMobileOtMenu = (event, item) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedAlertId(item.id);
    if (isReadOnly) return;
    setMobileActionMenu({
      id: item.id,
      x: event.clientX || (event.touches?.[0]?.clientX ?? window.innerWidth / 2),
      y: event.clientY || (event.touches?.[0]?.clientY ?? window.innerHeight / 2),
    });
  };

  const handleApproveClose = async () => {
    if (isReadOnly) return;
    if (!selectedAlert) return;
    const reportsForAlert = reportByAlert.get(String(selectedAlert.id)) || [];
    const consistencySummary = getAlertConsistencySummary(selectedAlert, reportsForAlert);
    const serviceSummary = summarizeServiceReports(reportsForAlert);
    if (consistencySummary.hasInconsistency) {
      window.alert(`No puedes cerrar esta OT porque mantiene ${consistencySummary.count} inconsistencia(s) entre los registros de trabajo y el rango liberado. Edita la OT liberada, revisa las fechas y vuelve a intentar.`);
      return;
    }
    if (serviceSummary.hasMissingServiceCost) {
      window.alert(`No puedes cerrar esta OT porque hay ${serviceSummary.missingCostReports.length} notificación(es) de servicio sin costo registrado. Revisa la notificación, completa el costo del servicio y vuelve a intentar.`);
      return;
    }
    const [history, existingNotices] = await Promise.all([
      loadSharedDocument(OT_HISTORY_KEY, []),
      loadSharedDocument(NOTICES_KEY, []),
    ]);
    const generatedNotices = buildMaintenanceNoticesFromReports(
      selectedAlert,
      reportsForAlert,
      existingNotices,
      user?.full_name || user?.username || normalizedRole,
    );
    if (generatedNotices.length > 0) {
      const confirmed = window.confirm(`Se generaran ${generatedNotices.length} aviso(s) de mantenimiento a partir de las observaciones tecnicas registradas. ¿Deseas continuar con el cierre?`);
      if (!confirmed) return;
    }
    const closedRow = {
      ...selectedAlert,
      status_ot: 'Cerrada',
      fecha_cierre: new Date().toISOString().slice(0, 10),
      fecha_ejecucion_real: selectedAlert.registro_ot?.fecha_fin || selectedAlert.fecha_ejecucion || new Date().toISOString().slice(0, 10),
      hora_ejecucion_real: selectedAlert.registro_ot?.hora_fin || '',
      cierre_ot: {
        ...(selectedAlert.cierre_ot || {}),
        cierre_aprobado_por: user?.full_name || user?.username || normalizedRole,
        cierre_aprobado_fecha: new Date().toISOString(),
      },
      reportes_trabajo: reportsForAlert,
      avisos_generados: generatedNotices.map((item) => item.aviso_codigo),
    };
    await Promise.all([
      saveSharedDocument(OT_HISTORY_KEY, [closedRow, ...history]),
      saveSharedDocument(NOTICES_KEY, [...generatedNotices, ...(Array.isArray(existingNotices) ? existingNotices : [])]),
    ]);
    const nextAlerts = alerts.filter((item) => String(item.id) !== String(selectedAlert.id));
    await persistAlerts(nextAlerts);
    openCloseReportPdf(closedRow, reportsForAlert, materialsCatalog, pdfSettings);
    setSelectedAlertId(null);
  };
  void handleApproveClose;

  const handleReturnToLiberated = async () => {
    await openCloseModal('return');
  };

  const openCloseModal = async (intent = 'close') => {
    if (isReadOnly) return;
    if (!selectedAlert) return;
    if (blockIfSelectedAlertLocked(intent === 'return' ? 'devolver la OT' : 'cerrar la OT')) return;
    if (selectedAlert.status_ot !== 'Solicitud de cierre') {
      window.alert('Solo puedes cerrar una OT que este en estado Solicitud de cierre.');
      return;
    }
    const reportsForAlert = reportByAlert.get(String(selectedAlert.id)) || [];
    const consistencySummary = getAlertConsistencySummary(selectedAlert, reportsForAlert);
    if (consistencySummary.hasInconsistency) {
      window.alert(`No puedes cerrar esta OT porque mantiene ${consistencySummary.count} inconsistencia(s) entre los registros de trabajo y el rango liberado. Edita la OT liberada, revisa las fechas y vuelve a intentar.`);
      return;
    }
    const reportsMissingEvidence = findReportsMissingRequiredEvidence(reportsForAlert);
    if (reportsMissingEvidence.length) {
      window.alert(`No puedes cerrar esta OT porque ${reportsMissingEvidence.length} notificacion(es) no tienen foto ANTES y DESPUES.`);
      return;
    }
    if (!(await acquireSelectedAlertLock(intent === 'return' ? 'devolver la OT' : 'cerrar la OT'))) return;
    setCloseModalIntent(intent);
    setShowCloseModal(true);
  };

  const confirmCloseOt = async (cierreData) => {
    if (isReadOnly) return;
    if (!selectedAlert) return;
    if (blockIfSelectedAlertLocked('confirmar el cierre')) return;
    const reportsForAlert = reportByAlert.get(String(selectedAlert.id)) || [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const [history, existingNotices, storedReports] = await Promise.all([
      loadSharedDocument(OT_HISTORY_KEY, []),
      loadSharedDocument(NOTICES_KEY, []),
      loadSharedDocument(OT_WORK_REPORTS_KEY, []),
    ]);

    const effectiveReports = (Array.isArray(cierreData?.reportes_actualizados) && cierreData.reportes_actualizados.length
      ? cierreData.reportes_actualizados
      : reportsForAlert
    ).map((item) => {
      const normalizedServiceCost = Number(item?.serviceCost ?? item?.costo_servicio ?? 0);
      return {
        ...item,
        serviceCost: Number.isFinite(normalizedServiceCost) ? normalizedServiceCost : 0,
        costo_servicio: Number.isFinite(normalizedServiceCost) ? normalizedServiceCost : 0,
      };
    });

    const storedWorkReports = Array.isArray(storedReports) ? storedReports : [];
    const updatedReportsById = new Map(effectiveReports.map((item) => [String(item.id), item]));
    const preservedReports = storedWorkReports.map((item) => updatedReportsById.get(String(item.id)) || item);
    const preservedIds = new Set(preservedReports.map((item) => String(item.id)));
    const mergedWorkReports = [
      ...preservedReports,
      ...effectiveReports.filter((item) => !preservedIds.has(String(item.id))),
    ];

    const serviceSummary = summarizeServiceReports(effectiveReports);
    const reportsMissingEvidence = findReportsMissingRequiredEvidence(effectiveReports);
    if (reportsMissingEvidence.length) {
      setError(`No se puede cerrar la OT porque ${reportsMissingEvidence.length} notificacion(es) no tienen foto ANTES y DESPUES.`);
      return;
    }
    if (serviceSummary.hasMissingServiceCost) {
      setError(`No se puede cerrar la OT porque tiene ${serviceSummary.missingCostReports.length} notificacion(es) de servicio sin costo registrado.`);
      return;
    }

    const generatedNotices = Array.isArray(cierreData?.avisos_generados_detalle) && cierreData.avisos_generados_detalle.length
      ? cierreData.avisos_generados_detalle
      : buildMaintenanceNoticesFromReports(
        selectedAlert,
        effectiveReports,
        existingNotices,
        user?.full_name || user?.username || normalizedRole,
      );

    const closedRow = {
      ...selectedAlert,
      status_ot: 'Cerrada',
      fecha_ejecucion: selectedAlert.fecha_ejecucion || todayStr,
      cierre_ot: cierreData,
      fecha_cierre: todayStr,
      fecha_ejecucion_real: cierreData?.fecha_fin || todayStr,
      hora_ejecucion_real: cierreData?.hora_fin || '',
      reportes_trabajo: effectiveReports,
      avisos_generados: generatedNotices.map((item) => item.aviso_codigo),
      avisos_generados_detalle: generatedNotices,
    };

    if (selectedAlert.tipo_mantto === 'Preventivo por Km' && selectedAlert.plan_km_id) {
      try {
        const plansKm = await loadSharedDocument(KM_PLANS_KEY, []);
        const nextPlansKm = (Array.isArray(plansKm) ? plansKm : []).map((plan) => {
          if (String(plan.id) !== String(selectedAlert.plan_km_id)) return plan;
          return advanceKmPlanCycle(plan, {
            closeDate: cierreData?.fecha_fin || todayStr,
            currentCounter: plan.km_actual,
          });
        });
        await saveSharedDocument(KM_PLANS_KEY, nextPlansKm);
      } catch (err) {
        console.error('Error actualizando ciclo por kilometraje:', err);
        setError('Se cerro la OT, pero no se pudo actualizar el siguiente ciclo por kilometraje.');
      }
    }

    try {
      await Promise.all([
        saveSharedDocument(OT_WORK_REPORTS_KEY, mergedWorkReports),
        saveSharedDocument(OT_HISTORY_KEY, [closedRow, ...history]),
        saveSharedDocument(NOTICES_KEY, [...generatedNotices, ...(Array.isArray(existingNotices) ? existingNotices : [])]),
      ]);
      setWorkReports(mergedWorkReports);
      setError('');
    } catch (err) {
      console.error('Error guardando historial OT:', err);
      setError('No se pudo guardar el historial de OT, los avisos de mantenimiento o el costo del servicio en el servidor.');
      return;
    }

    const nextAlerts = alerts.filter((item) => String(item.id) !== String(selectedAlert.id));
    await persistAlerts(nextAlerts);
    setCloseModalIntent('close');
    setShowCloseModal(false);
    openCloseReportPdf(closedRow, effectiveReports, materialsCatalog, pdfSettings);
    setSelectedAlertId(null);
    await releaseSelectedAlertLock(selectedAlert.id);
    appendAuditEntry({
      action: 'OT_CERRADA',
      module: 'Notificaciones de Trabajo',
      entityType: 'OT',
      entityId: selectedAlert.id,
      title: `OT ${selectedAlert.ot_numero || selectedAlert.codigo || selectedAlert.id} cerrada desde revision`,
      description: `${selectedAlert.codigo || 'Equipo'} - ${selectedAlert.descripcion || 'Sin descripcion'} | Modo de falla: ${cierreData?.modo_falla || 'Ninguna'}.`,
      severity: 'success',
      actor: user,
      before: { status_ot: selectedAlert.status_ot },
      after: { status_ot: 'Cerrada', modo_falla: cierreData?.modo_falla || '' },
      meta: { avisos_generados: generatedNotices.length },
    }).catch((err) => console.error('Error auditando cierre OT desde notificaciones:', err));
  };

  const returnToLiberatedFromCloseModal = async (reviewData) => {
    if (isReadOnly) return;
    if (!selectedAlert || selectedAlert.status_ot !== 'Solicitud de cierre') return;
    if (blockIfSelectedAlertLocked('devolver la OT a Liberada')) return;
    const confirmed = window.confirm('La OT volvera a estado Liberada para que los tecnicos corrijan las notificaciones de trabajo. Deseas continuar?');
    if (!confirmed) return;

    const nextAlerts = alerts.map((item) => {
      if (String(item.id) !== String(selectedAlert.id)) return item;
      return {
        ...item,
        status_ot: 'Liberada',
          cierre_ot: {
            ...(item.cierre_ot || {}),
            solicitud_cierre: false,
            devuelta_revision: true,
            devuelta_revision_fecha: new Date().toISOString(),
            devuelta_revision_por: user?.full_name || user?.username || normalizedRole,
            devuelta_revision_observaciones: reviewData?.motivo_devolucion_detalle || reviewData?.observaciones || '',
            motivo_devolucion_tipo: reviewData?.motivo_devolucion_tipo || '',
            motivo_devolucion_detalle: reviewData?.motivo_devolucion_detalle || '',
            responsable_correccion: reviewData?.responsable_correccion || '',
            fecha_objetivo_reenvio: reviewData?.fecha_objetivo_reenvio || '',
          },
        };
    });

    await persistAlerts(nextAlerts);
    setCloseModalIntent('close');
    setShowCloseModal(false);
    await releaseSelectedAlertLock(selectedAlert.id);
    window.alert('La OT volvio a estado Liberada. Ahora puede corregirse en notificaciones y volver a solicitar cierre.');
    appendAuditEntry({
      action: 'OT_DEVUELTA_A_LIBERADA',
      module: 'Notificaciones de Trabajo',
      entityType: 'OT',
      entityId: selectedAlert.id,
      title: `OT ${selectedAlert.ot_numero || selectedAlert.codigo || selectedAlert.id} devuelta a Liberada`,
      description: `${reviewData?.motivo_devolucion_tipo || 'Motivo no especificado'} | Responsable: ${reviewData?.responsable_correccion || 'Por definir'}.`,
      severity: 'critical',
      actor: user,
      before: { status_ot: 'Solicitud de cierre' },
      after: { status_ot: 'Liberada', motivo_devolucion_tipo: reviewData?.motivo_devolucion_tipo || '' },
    }).catch((err) => console.error('Error auditando devolucion a liberada:', err));
  };

  const toggleOtExpanded = (alertId) => {
    setExpandedOtIds((prev) => ({ ...prev, [alertId]: !prev[alertId] }));
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
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Notificaciones de Trabajo</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Selecciona una OT liberada y usa <strong>Registrar Trabajo</strong> para cargar horas por técnico, actividades y validación de materiales.
      </p>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}
      {isReadOnly && (
        <ReadOnlyAccessNotice
          title="Notificaciones en modo consulta"
          message="Con tu perfil puedes revisar OT liberadas, solicitudes de cierre y registros de trabajo, pero no registrar, editar ni cerrar órdenes desde esta ventana."
        />
      )}

      {canApproveClose && requestCloseNotifications.length > 0 && (
        <div className="alert alert-warning">
          Hay {requestCloseNotifications.length} solicitud(es) de cierre pendientes de revisión para PLANNER/INGENIERO.
        </div>
      )}

      {isTechnician && (
        <div className="alert alert-info">
          {showCoworkerOtView
            ? 'Estas revisando OTs asignadas a tus companeros. Aqui solo tienes lectura. Si una OT la vas a atender tu, primero asignatela.'
            : 'Estas viendo solo las OTs asignadas a ti. Desde esta vista si puedes registrar tu trabajo en las ordenes que te correspondan.'}
        </div>
      )}

      {selectedAlert && selectedAlertConsistency.hasInconsistency && (
        <div className="alert alert-warning">
          La OT seleccionada tiene {selectedAlertConsistency.count} inconsistencia(s) de fecha en sus registros de trabajo. Puede solicitar cierre, pero no podrá cerrarse hasta corregir la liberación y revisar que todo quede conforme.
        </div>
      )}

      {selectedAlert && selectedAlertServiceSummary.hasMissingServiceCost && (
        <div className="alert alert-warning">
          La OT seleccionada tiene {selectedAlertServiceSummary.missingCostReports.length} notificación(es) de servicio sin costo registrado. Puede solicitar cierre, pero no podrá cerrarse hasta completar ese costo.
        </div>
      )}

      {selectedAlert?.cierre_ot?.devuelta_revision && selectedAlert.status_ot === 'Liberada' && (
        <div className="alert alert-error" style={{ border: '1px solid #fca5a5' }}>
          <strong>OT devuelta a correccion.</strong>{' '}
          {selectedAlert.cierre_ot.motivo_devolucion_tipo || 'Motivo pendiente'}.
          {' '}Responsable: <strong>{selectedAlert.cierre_ot.responsable_correccion || 'Por definir'}</strong>.
          {' '}Reenvio objetivo: <strong>{formatDateDisplay(selectedAlert.cierre_ot.fecha_objetivo_reenvio || '', 'Pendiente')}</strong>.
        </div>
      )}
      {selectedAlertLockedByOthers && (
        <div className="alert alert-info" style={{ border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8' }}>
          <strong>Edicion protegida.</strong>{' '}
          {activeLockHolderLabel || 'Otro usuario'} {selectedAlertLockHeldByOthers || otherEditorsInSelectedAlert.length === 1 ? 'está editando' : 'están editando'} esta notificación ahora mismo.
          {' '}Mientras tanto puedes revisarla, pero no modificarla para evitar sobreescrituras.
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: '.8rem' }}>
        <div className="stat-card">
          <div className="stat-label">{isTechnician ? 'Mis OT asignadas' : 'OT Liberadas'}</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{isTechnician ? technicianAssignedNotifications.length : liberatedNotifications.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{isTechnician ? 'OT de companeros' : 'Solicitudes de Cierre'}</div>
          <div className="stat-value" style={{ color: isTechnician ? '#b45309' : '#dc2626' }}>{isTechnician ? technicianCoworkerNotifications.length : requestCloseNotifications.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Registros de Trabajo</div>
          <div className="stat-value" style={{ color: '#059669' }}>{workReports.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Costo Materiales</div>
          <div className="stat-value" style={{ color: '#7c3aed' }}>S/ {totalMaterialCost.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Costo Servicios</div>
          <div className="stat-value" style={{ color: '#0f766e' }}>S/ {totalServiceCost.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT con Inconsistencia</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{inconsistentAlertsCount}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '.8rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.65rem' }}>
          <div>
            <label className="form-label">Área</label>
            <select className="form-select" value={filterArea} onChange={(e) => setFilterArea(e.target.value)}>
              <option value="">Todas</option>
              {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Trabajador</label>
            <input className="form-input" value={filterWorker} onChange={(e) => setFilterWorker(e.target.value)} placeholder="Nombre o responsable" />
          </div>
          <div>
            <label className="form-label">Fecha</label>
            <input className="form-input" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Equipo</label>
            <input className="form-input" value={filterEquipment} onChange={(e) => setFilterEquipment(e.target.value)} placeholder="Código, equipo o descripción" />
          </div>
        </div>
      </div>

      <div className="mobile-context-hidden-actions" style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem', flexWrap: 'wrap' }}>
        {isTechnician && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setShowCoworkerOtView((prev) => !prev);
              setSelectedAlertId(null);
            }}
          >
            {showCoworkerOtView ? 'Volver a mis OT' : 'Ver OT de companeros'}
          </button>
        )}
        {canAssignSelectedToMe && (
          <button type="button" className="btn btn-primary" onClick={handleAssignToMe}>
            Asignarme OT
          </button>
        )}
        {!isReadOnly && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedAlert || selectedAlert.status_ot !== 'Liberada' || (isTechnician && !selectedAlertAssignedToMe) || selectedAlertLockedByOthers}
            onClick={handleOpenRegister}
          >
            Registrar Trabajo
          </button>
        )}
        {!isReadOnly && canEditLiberatedOt && ['Liberada', 'Solicitud de cierre'].includes(selectedAlert?.status_ot || '') && (
          <button type="button" className="btn btn-secondary" disabled={selectedAlertLockedByOthers} onClick={handleOpenEditOt}>
            Editar OT
          </button>
        )}
        {!isReadOnly && canReprogramOt && selectedAlert?.status_ot === 'Liberada' && (
          <button type="button" className="btn btn-secondary" disabled={selectedAlertLockedByOthers} onClick={handleOpenReprogramModal}>
            Reprogramar OT
          </button>
        )}
        {!isReadOnly && canRequestClose && selectedAlert?.status_ot === 'Liberada' && (
          <button type="button" className="btn btn-danger" disabled={selectedAlertLockedByOthers} onClick={handleRequestClose}>
            Solicitar cierre
          </button>
        )}
        {!isReadOnly && canApproveClose && selectedAlert?.status_ot === 'Solicitud de cierre' && (
          <button type="button" className="btn btn-secondary" disabled={selectedAlertLockedByOthers} onClick={handleReturnToLiberated}>
            Devolver a Liberada
          </button>
        )}
        {!isReadOnly && canApproveClose && selectedAlert?.status_ot === 'Solicitud de cierre' && (
          <button type="button" className="btn btn-primary" disabled={selectedAlertLockedByOthers} onClick={() => openCloseModal('close')}>
            Cerrar OT
          </button>
        )}
      </div>

      <div className="mobile-card-list" style={{ marginBottom: '.85rem' }}>
        {visibleMobileNotifications.map((item) => {
          const isSelected = String(item.id) === String(selectedAlertId);
          const reportRows = reportByAlert.get(String(item.id)) || [];
          const alertConsistency = consistencyByAlert.get(String(item.id)) || { hasInconsistency: false, count: 0 };
          const hasReport = reportRows.length > 0;
          const isExpanded = !!expandedOtIds[item.id];
          return (
            <div
              key={`mobile_${item.id}`}
              className={`mobile-ot-card ${isSelected ? 'is-selected' : ''}`}
              onClick={() => setSelectedAlertId(item.id)}
              onContextMenu={(event) => openMobileOtMenu(event, item)}
              title="Toca para seleccionar. Mantén presionado para ver acciones."
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.2rem' }}>
                    {item.ot_numero || 'OT pendiente'} · {item.codigo}
                  </div>
                  <div style={{ color: '#475569', lineHeight: 1.55 }}>
                    {item.descripcion || 'Sin descripcion'}
                  </div>
                </div>
                {isSelected && <span className="mobile-selected-chip">Seleccionada</span>}
              </div>

              <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
                <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '.78rem' }}>
                  {item.status_ot}
                </span>
                {alertConsistency.hasInconsistency && (
                  <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: '#fef2f2', color: '#b91c1c', fontWeight: 700, fontSize: '.78rem' }}>
                    Inconsistencia: {alertConsistency.count}
                  </span>
                )}
                {item.cierre_ot?.devuelta_revision && item.status_ot === 'Liberada' && (
                  <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: '#fef2f2', color: '#b91c1c', fontWeight: 700, fontSize: '.78rem' }}>
                    Devuelta
                  </span>
                )}
              </div>

              <div className="mobile-ot-card-grid">
                <div><strong>Responsable</strong>{item.responsable || 'N.A.'}</div>
                <div><strong>Fecha a ejecutar</strong>{formatDateDisplay(item.fecha_ejecutar || '', 'N.A.')}</div>
                {item.fecha_reprogramacion && (
                  <div><strong>Reprogramada</strong>{item.motivo_reprogramacion || 'Sin motivo registrado'}</div>
                )}
                <div><strong>Prioridad</strong>{item.prioridad || 'N.A.'}</div>
                <div><strong>Actividad</strong>{item.actividad || 'N.A.'}</div>
              </div>

              {hasReport && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ color: '#64748b', fontSize: '.88rem' }}>
                    {reportRows.length} registro(s) de trabajo asociados.
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleOtExpanded(item.id);
                    }}
                  >
                    {isExpanded ? 'Ocultar registros' : 'Ver registros'}
                  </button>
                </div>
              )}

              {isExpanded && reportRows.map((report, idx) => (
                <div key={`mobile_report_${report.id}`} style={{ borderTop: '1px solid #e5e7eb', paddingTop: '.7rem', color: '#475569', lineHeight: 1.6 }}>
                  <strong style={{ color: '#0f172a' }}>Sub-registro #{idx + 1}</strong><br />
                  {report.reportCode || `NT${idx + 1}-${item.ot_numero || item.id}`} · {formatDateTimeDisplay(report.fechaInicio || '', report.horaInicio || '', 'N.A.')} a {formatDateTimeDisplay(report.fechaFin || '', report.horaFin || '', 'N.A.')}
                </div>
              ))}
            </div>
          );
        })}
        {notificationTableRows.length > visibleMobileNotifications.length && (
          <button
            type="button"
            className="btn btn-secondary mobile-load-more"
            onClick={() => setMobileVisibleCount((current) => current + 12)}
          >
            Ver 12 OT más ({notificationTableRows.length - visibleMobileNotifications.length} restantes)
          </button>
        )}
        {notificationTableRows.length > 12 && visibleMobileNotifications.length >= notificationTableRows.length && (
          <button
            type="button"
            className="btn btn-secondary mobile-load-more"
            onClick={() => setMobileVisibleCount(12)}
          >
            Ver menos
          </button>
        )}
        {mobileActionMenu && (() => {
          const item = notificationTableRows.find((row) => String(row.id) === String(mobileActionMenu.id));
          if (!item) return null;
          const assignedToMe = isAlertAssignedToUser(item, user);
          const actionDisabled = selectedAlertLockedByOthers && String(selectedAlert?.id) === String(item.id);
          return (
            <div
              className="mobile-card-action-menu"
              style={{
                left: Math.min(mobileActionMenu.x, window.innerWidth - 260),
                top: Math.min(mobileActionMenu.y, window.innerHeight - 260),
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mobile-card-action-head">
                <span>Acciones OT</span>
                <strong>{item.ot_numero || item.codigo || 'OT'}</strong>
              </div>
              <div className="mobile-card-action-list">
                {isTechnician && showCoworkerOtView && item.status_ot === 'Liberada' && !assignedToMe && (
                  <button type="button" onClick={() => runMobileOtAction(item, handleAssignToMe)}>
                    Asignarme OT
                  </button>
                )}
                {item.status_ot === 'Liberada' && (!isTechnician || assignedToMe) && (
                  <button type="button" disabled={actionDisabled} onClick={() => runMobileOtAction(item, handleOpenRegister)}>
                    Registrar trabajo
                  </button>
                )}
                {canEditLiberatedOt && ['Liberada', 'Solicitud de cierre'].includes(item.status_ot || '') && (
                  <button type="button" disabled={actionDisabled} onClick={() => runMobileOtAction(item, handleOpenEditOt)}>
                    Editar OT
                  </button>
                )}
                {canReprogramOt && item.status_ot === 'Liberada' && (
                  <button type="button" disabled={actionDisabled} onClick={() => runMobileOtAction(item, handleOpenReprogramModal)}>
                    Reprogramar OT
                  </button>
                )}
                {canRequestClose && item.status_ot === 'Liberada' && (
                  <button type="button" className="danger" disabled={actionDisabled} onClick={() => runMobileOtAction(item, handleRequestClose)}>
                    Solicitar cierre
                  </button>
                )}
                {canApproveClose && item.status_ot === 'Solicitud de cierre' && (
                  <>
                    <button type="button" disabled={actionDisabled} onClick={() => runMobileOtAction(item, handleReturnToLiberated)}>
                      Devolver a liberada
                    </button>
                    <button type="button" disabled={actionDisabled} onClick={() => runMobileOtAction(item, () => openCloseModal('close'))}>
                      Cerrar OT
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <div className="card desktop-table-wrapper" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1820px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Sel.', 'Registro', 'Estado OT', '# OT', 'Código', 'Descripción', 'Prioridad', 'Actividad', 'Responsable', 'Fecha a ejecutar', 'Fecha inicio', 'Hora inicio', 'Fecha fin', 'Hora fin', 'Personal asignado', 'Materiales asignados'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f4f75', padding: '.55rem .5rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
            <TableFilterRow columns={notificationTableColumns} rows={filteredNotifications} filters={notificationFilters} onChange={setNotificationFilter} dark />
          </thead>
          <tbody>
            {notificationTableRows.map((item) => {
              const isSelected = String(item.id) === String(selectedAlertId);
              const reportRows = reportByAlert.get(String(item.id)) || [];
              const alertConsistency = consistencyByAlert.get(String(item.id)) || { hasInconsistency: false, count: 0, inconsistentReports: [] };
              const hasReport = reportRows.length > 0;
              const isExpanded = !!expandedOtIds[item.id];
              return (
                <React.Fragment key={item.id}>
                  <tr style={{ background: isSelected ? '#eff6ff' : 'transparent' }} onClick={() => setSelectedAlertId(item.id)}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem', textAlign: 'center' }}>
                      <input type="radio" checked={isSelected} onChange={() => setSelectedAlertId(item.id)} />
                    </td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>
                      {hasReport ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOtExpanded(item.id);
                          }}
                        >
                          {isExpanded ? 'Ocultar' : 'Ver'} registros ({reportRows.length})
                        </button>
                      ) : 'Pendiente'}
                    </td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>
                      <div>{item.status_ot}</div>
                      {item.cierre_ot?.devuelta_revision && item.status_ot === 'Liberada' && (
                        <div
                          style={{
                            marginTop: '.2rem',
                            display: 'inline-flex',
                            padding: '.15rem .45rem',
                            borderRadius: '999px',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            fontWeight: 700,
                            fontSize: '.75rem',
                          }}
                        >
                          Devuelta: {item.cierre_ot.motivo_devolucion_tipo || 'Corregir'}
                        </div>
                      )}
                      {alertConsistency.hasInconsistency && (
                        <div style={{ marginTop: '.2rem', color: '#b91c1c', fontWeight: 700, fontSize: '.78rem' }}>
                          Inconsistencia: {alertConsistency.count}
                        </div>
                      )}
                    </td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.ot_numero || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.codigo}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.descripcion}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.prioridad || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.actividad || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.responsable || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>
                      <div>{formatDateDisplay(item.fecha_ejecutar || '', 'N.A.')}</div>
                      {item.fecha_reprogramacion && (
                        <div style={{ marginTop: '.2rem', color: '#b45309', fontWeight: 800, fontSize: '.78rem' }}>
                          Reprogramada: {item.motivo_reprogramacion || 'Sin motivo registrado'}
                        </div>
                      )}
                    </td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{formatDateDisplay(item.registro_ot?.fecha_inicio || '', 'N.A.')}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.hora_inicio || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{formatDateDisplay(item.registro_ot?.fecha_fin || '', 'N.A.')}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.hora_fin || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.personal_mantenimiento || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.materiales || 'N.A.'}</td>
                  </tr>
                  {isExpanded && reportRows.map((report, idx) => {
                    const reportConsistency = evaluateWorkReportConsistency(item, report);
                    const reportLocked = item.status_ot === 'Solicitud de cierre';
                    const canModifyReport = !isReadOnly && (normalizedRole !== 'TECNICO' || isWorkReportOwnedByUser(report, user));
                    return (
                    <tr key={report.id} style={{ background: '#f8fafc' }}>
                      <td />
                      <td colSpan={15} style={{ border: '1px solid #e5e7eb', padding: '.5rem .65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div>
                            <strong>Sub-registro #{idx + 1}</strong>{' '}
                            · Código: <strong>{report.reportCode || `NT${idx + 1}-${item.ot_numero || item.id}`}</strong>{' '}
                            · Horas: <strong>{report.totalHoras || 0}</strong>{' '}
                            · Técnicos: {report.tecnicos?.length || 0}{' '}
                            · Materiales extra: {report.materialesExtra?.length || 0}{' '}
                            · Registrado por: <strong>{getWorkReportOwnerLabel(report)}</strong>{' '}
                            · Inicio: {formatDateTimeDisplay(report.fechaInicio || '', report.horaInicio || '', 'N.A.')}{' '}
                            · Fin: {formatDateTimeDisplay(report.fechaFin || '', report.horaFin || '', 'N.A.')}
                            {report.maintenanceSuggestion?.requiresNotice && (
                              <div style={{ marginTop: '.3rem', color: '#b45309', fontSize: '.85rem', fontWeight: 700 }}>
                                Aviso sugerido: {report.maintenanceSuggestion.noticeCategory || report.maintenanceSuggestion.label}
                              </div>
                            )}
                            <div style={{ marginTop: '.3rem', color: hasRequiredWorkReportEvidence(report) ? '#166534' : '#991b1b', fontSize: '.85rem', fontWeight: 700 }}>
                              Evidencia fotografica: {hasRequiredWorkReportEvidence(report) ? 'ANTES y DESPUES completas' : 'pendiente antes/despues'}
                            </div>
                            {reportConsistency.hasInconsistency && (
                              <div style={{ marginTop: '.35rem', color: '#991b1b', fontSize: '.85rem' }}>
                                Inconsistencia de fechas. {reportConsistency.reason}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '.4rem' }}>
                            {!reportLocked && canModifyReport && (
                              <>
                                <button type="button" className="btn btn-secondary btn-sm" disabled={selectedAlertLockedByOthers} onClick={() => handleEditReport(item.id, report.id)}>Editar</button>
                                <button type="button" className="btn btn-danger btn-sm" disabled={selectedAlertLockedByOthers} onClick={() => handleDeleteReport(report.id)}>Eliminar</button>
                              </>
                            )}
                            {!reportLocked && !canModifyReport && (
                              <span style={{ color: '#6b7280', fontSize: '.82rem', fontWeight: 600 }}>
                                Solo el autor puede modificar
                              </span>
                            )}
                            {reportLocked && (
                              <span style={{ color: '#6b7280', fontSize: '.82rem', fontWeight: 600 }}>
                                Bloqueado por solicitud de cierre
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );})}
                </React.Fragment>
              );
            })}
            {!notificationTableRows.length && (
              <tr>
                <td colSpan={16} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                  No hay notificaciones que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showRegisterModal && selectedAlert && (
        <RegisterWorkModal
          alert={selectedAlert}
          rrhhItems={rrhhItems}
          materialsCatalog={materialsCatalog}
          initialReport={editingReport}
          canCreateServiceReport={canCreateServiceReports}
          onClose={async () => {
            setShowRegisterModal(false);
            setEditingReportId(null);
            await releaseSelectedAlertLock(selectedAlert.id);
          }}
          onSave={saveWorkReport}
        />
      )}

      {showEditOtModal && ['Liberada', 'Solicitud de cierre'].includes(selectedAlert?.status_ot || '') && (
        <EditLiberatedOtModal
          alert={selectedAlert}
          rrhhItems={rrhhItems}
          materialsCatalog={materialsCatalog}
          reports={reportByAlert.get(String(selectedAlert.id)) || []}
          onClose={async () => {
            setShowEditOtModal(false);
            await releaseSelectedAlertLock(selectedAlert.id);
          }}
          onSave={handleSaveOtChanges}
        />
      )}

      {showReprogramModal && selectedAlert && (
        <ModalReprogramarOt
          alert={selectedAlert}
          onClose={async () => {
            setShowReprogramModal(false);
            await releaseSelectedAlertLock(selectedAlert.id);
          }}
          onSubmit={confirmReprogramOt}
        />
      )}

      {showCloseModal && selectedAlert && (
        <ModalCerrarOT
          alert={selectedAlert}
          reports={reportByAlert.get(String(selectedAlert.id)) || []}
          initialAction={closeModalIntent}
          onClose={async () => {
            setCloseModalIntent('close');
            setShowCloseModal(false);
            await releaseSelectedAlertLock(selectedAlert.id);
          }}
          onReturnToLiberated={returnToLiberatedFromCloseModal}
          onSubmit={confirmCloseOt}
        />
      )}
    </div>
  );
}

