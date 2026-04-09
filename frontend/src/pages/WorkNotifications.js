import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { DEFAULT_MATERIALS, normalizeMaterialsCatalog } from '../utils/materialsCatalog';
import { evaluateWorkReportConsistency, getAlertConsistencySummary } from '../utils/otConsistency';
import { formatDateDisplay, formatDateTimeDisplay } from '../utils/dateFormat';
import { getWorkReportOwnerLabel, isWorkReportOwnedByUser } from '../utils/workReportOwnership';
import {
  buildMaintenanceNoticesFromReports,
  buildObservationText,
  getObservationPreset,
  WORK_OBSERVATION_PRESETS,
} from '../utils/maintenanceNotices';

// Nota: este archivo debe permanecer sin marcadores de conflicto de merge.
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const OT_WORK_REPORTS_KEY = SHARED_DOCUMENT_KEYS.otWorkReports;
const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;
const NOTICES_KEY = SHARED_DOCUMENT_KEYS.maintenanceNotices;
const RRHH_KEY = SHARED_DOCUMENT_KEYS.rrhh;
const MATERIALES_KEY = SHARED_DOCUMENT_KEYS.materials;

const RRHH_FALLBACK = [
  { id: 1, codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', especialidad: 'Mecánico' },
  { id: 2, codigo: 'ELE-1', nombres_apellidos: 'Hernan Alauce Alarcón', especialidad: 'Eléctrico' },
];

const MATERIALES_FALLBACK = DEFAULT_MATERIALS;

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

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildCloseReportHtml = (alert, reports, catalog) => {
  const reportRows = (reports || []).map((report, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(report.reportCode || '')}</td>
      <td>${escapeHtml(formatDateTimeDisplay(report.fechaInicio, report.horaInicio, 'N.A.'))}</td>
      <td>${escapeHtml(formatDateTimeDisplay(report.fechaFin, report.horaFin, 'N.A.'))}</td>
      <td>${escapeHtml((report.tecnicos || []).map((item) => `${item.tecnico} (${item.horas} h)`).join(', '))}</td>
      <td>${escapeHtml((report.materialesExtra || []).map((item) => `${item.codigo || item.descripcion} x${item.cantidad}`).join(', '))}</td>
      <td>S/ ${calculateReportMaterialCost(report, catalog).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>OT ${escapeHtml(alert.ot_numero || '')}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          h1, h2 { margin: 0 0 12px; }
          .section { margin-top: 24px; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 10px 20px; }
          .label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
          .value { font-size: 14px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; }
          th { background: #eff6ff; }
        </style>
      </head>
      <body>
        <h1>Orden de Trabajo ${escapeHtml(alert.ot_numero || 'N.A.')}</h1>
        <div class="grid section">
          <div><div class="label">Equipo</div><div class="value">${escapeHtml(alert.codigo || '')} - ${escapeHtml(alert.descripcion || '')}</div></div>
          <div><div class="label">Estado final</div><div class="value">${escapeHtml(alert.status_ot || '')}</div></div>
          <div><div class="label">Responsable</div><div class="value">${escapeHtml(alert.responsable || '')}</div></div>
          <div><div class="label">Fecha a ejecutar</div><div class="value">${escapeHtml(formatDateDisplay(alert.fecha_ejecutar || '', 'N.A.'))}</div></div>
          <div><div class="label">Inicio OT</div><div class="value">${escapeHtml(formatDateTimeDisplay(alert.cierre_ot?.fecha_inicio || alert.registro_ot?.fecha_inicio || '', alert.cierre_ot?.hora_inicio || alert.registro_ot?.hora_inicio || '', 'N.A.'))}</div></div>
          <div><div class="label">Fin OT</div><div class="value">${escapeHtml(formatDateTimeDisplay(alert.registro_ot?.fecha_fin || '', alert.registro_ot?.hora_fin || '', 'N.A.'))}</div></div>
        </div>

        <div class="section">
          <h2>Personal y materiales liberados</h2>
          <div><strong>Personal:</strong> ${escapeHtml(alert.personal_mantenimiento || 'N.A.')}</div>
          <div><strong>Materiales:</strong> ${escapeHtml(alert.materiales || 'N.A.')}</div>
        </div>

        <div class="section">
          <h2>Registros de trabajo</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Codigo</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Tecnicos</th>
                <th>Materiales extra</th>
                <th>Costo materiales</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows || '<tr><td colspan="7">Sin registros.</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `;
};

const openCloseReportPdf = (alert, reports, catalog) => {
  const printWindow = window.open('', '_blank', 'width=1024,height=768');
  if (!printWindow) {
    window.alert('No se pudo abrir la ventana para generar el PDF.');
    return;
  }
  printWindow.document.write(buildCloseReportHtml(alert, reports, catalog));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 300);
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
    turno: alert.registro_ot?.turno || 'Primero',
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

  const previewAlert = useMemo(() => ({
    ...alert,
    registro_ot: {
      ...(alert.registro_ot || {}),
      fecha_inicio: form.fecha_inicio_prop,
      fecha_fin: form.fecha_fin_prop,
      hora_inicio: form.hora_inicio_prop,
      hora_fin: form.hora_fin_prop,
      turno: form.turno,
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
    turno: alert.registro_ot?.turno || 'Primero',
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
    turno: String(form.turno || '') !== String(originalForm.turno || ''),
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
      turno: 'Turno',
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
    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
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
    </label>
  );

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
    if (!item || cantidad <= 0) return;
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
    if (!form.fecha_inicio_prop || !form.fecha_fin_prop) {
      window.alert('Debes completar fecha inicio y fin propuesta.');
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
              <div>{renderLabel('prioridad', 'Prioridad')}<input className="form-input" style={getInputStyle('prioridad')} value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} /></div>
              <div>{renderLabel('responsable', 'Responsable')}<input className="form-input" style={getInputStyle('responsable')} value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}>{renderLabel('actividad', 'Actividad')}<textarea className="form-textarea" style={getInputStyle('actividad')} value={form.actividad} onChange={(e) => setForm({ ...form, actividad: e.target.value })} /></div>
              <div>{renderLabel('fecha_ejecutar', 'Fecha a ejecutar')}<input className="form-input" style={getInputStyle('fecha_ejecutar')} type="date" value={form.fecha_ejecutar} onChange={(e) => setForm({ ...form, fecha_ejecutar: e.target.value })} /></div>
              <div>{renderLabel('turno', 'Turno')}<select className="form-select" style={getInputStyle('turno')} value={form.turno} onChange={(e) => setForm({ ...form, turno: e.target.value })}><option>Primero</option><option>Segundo</option><option>Tercero</option></select></div>
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
              </thead>
              <tbody>
                {personalAsignado.map((item) => (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.nombres_apellidos}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.especialidad || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removePersonal(item.id)}>Quitar</button></td>
                  </tr>
                ))}
                {!personalAsignado.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>Sin técnicos asignados.</td></tr>}
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
              </thead>
              <tbody>
                {materialesAsignados.map((item) => (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.descripcion}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.unidad || 'UND'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.cantidad}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removeMaterial(item.id)}>Quitar</button></td>
                  </tr>
                ))}
                {!materialesAsignados.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>Sin materiales asignados.</td></tr>}
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
  alert, rrhhItems, materialsCatalog, initialReport = null, onClose, onSave,
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
      }];
    });
    setShowTechPicker(false);
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
        if (maxHorasSugeridas > 0 && num > maxHorasSugeridas) return { ...row, horas: maxHorasSugeridas };
      }
      return { ...row, [field]: value };
    }));
  };

  const removeTech = (id) => {
    setTechRows((prev) => prev.filter((row) => row.id !== id));
  };

  const updateMaterial = (id, field, value) => {
    setMaterialsRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const updateExtraMaterial = (id, field, value) => {
    setExtraMaterials((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeExtraMaterial = (id) => {
    setExtraMaterials((prev) => prev.filter((row) => row.id !== id));
  };

  const handleSubmit = () => {
    const tecnicosValidos = techRows
      .map((row) => ({
        tecnicoId: row.tecnicoId,
        tecnico: row.tecnico.trim(),
        horas: Number(row.horas) || 0,
        actividades: row.actividades.trim(),
      }))
      .filter((row) => row.tecnico && row.horas > 0);

    if (!tecnicosValidos.length) {
      window.alert('Debes registrar al menos un técnico con horas trabajadas.');
      return;
    }
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

    const materialesConfirmados = materialsRows.map((row) => ({
      materialId: row.materialId,
      codigo: row.codigo,
      descripcion: row.descripcion,
      cantidadPlanificada: row.cantidadPlanificada,
      cantidadConfirmada: Number(row.cantidadConfirmada) || 0,
      confirmada: !!row.confirmada,
    }));

    const materialesExtra = extraMaterials
      .map((row) => ({
        materialId: row.materialId,
        codigo: row.codigo.trim(),
        descripcion: row.descripcion.trim(),
        cantidad: Number(row.cantidad) || 0,
      }))
      .filter((row) => row.descripcion && row.cantidad > 0);

    onSave({
      tecnicos: tecnicosValidos,
      materialesConfirmados,
      materialesExtra,
      observaciones: observaciones.trim(),
      maintenanceSuggestion: observationPreset ? {
        presetKey: observationPreset,
        label: selectedObservationPreset?.label || '',
        noticeCategory: selectedObservationPreset?.noticeCategory || '',
        detail: observationDetail.trim(),
        text: observaciones.trim() || buildObservationText(observationPreset, observationDetail),
        requiresNotice: !!selectedObservationPreset?.requiresNotice,
      } : null,
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
          <h3 className="card-title" style={{ marginBottom: '.35rem' }}>Registrar Trabajo · OT #{alert.ot_numero || 'N.A.'}</h3>
          <p style={{ color: '#6b7280', marginBottom: '.8rem' }}>Selecciona técnicos y materiales desde sus catálogos para mantener consistencia.</p>

          <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
            <h4 style={{ marginBottom: '.5rem' }}>Fecha y hora del trabajo</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: '.6rem' }}>
              <div><label className="form-label">Fecha inicio</label><input className="form-input" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></div>
              <div><label className="form-label">Hora inicio</label><input className="form-input" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></div>
              <div><label className="form-label">Fecha fin</label><input className="form-input" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></div>
              <div><label className="form-label">Hora fin</label><input className="form-input" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></div>
            </div>
            <p style={{ marginTop: '.5rem', color: '#374151', fontSize: '.92rem' }}>
              Máximo sugerido de horas por técnico según rango ingresado: <strong>{maxHorasSugeridas || 0} h</strong>.
            </p>
            {consistencyCheck.hasInconsistency ? (
              <div style={{ marginTop: '.65rem', background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '.65rem', padding: '.75rem .85rem', fontSize: '.92rem' }}>
                <strong>Inconsistencia detectada.</strong> {consistencyCheck.reason}
                <div style={{ marginTop: '.25rem' }}>
                  Rango liberado OT: <strong>{consistencyCheck.otRangeLabel || 'No definido'}</strong>.
                </div>
              </div>
            ) : null}
          </div>

          <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.6rem' }}>
              <h4>Horas y actividades por técnico</h4>
              <button type="button" className="btn btn-secondary" onClick={() => setShowTechPicker(true)}>+ Agregar técnico</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#e5e7eb' }}>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Técnico</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Horas</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Actividades realizadas</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {techRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" value={row.tecnico} onChange={(e) => updateTech(row.id, 'tecnico', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" type="number" min="0" max={maxHorasSugeridas || undefined} step="0.25" value={row.horas} placeholder={maxHorasSugeridas ? `Máx ${maxHorasSugeridas}` : ''} onChange={(e) => updateTech(row.id, 'horas', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" value={row.actividades} onChange={(e) => updateTech(row.id, 'actividades', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removeTech(row.id)}>Quitar</button></td>
                  </tr>
                ))}
                {!techRows.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>No hay técnicos agregados.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
            <h4 style={{ marginBottom: '.55rem' }}>Confirmar materiales asignados</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#e5e7eb' }}>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Código</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Descripción</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Planificada</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Confirmada</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>¿Correcta?</th>
                </tr>
              </thead>
              <tbody>
                {materialsRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{row.codigo || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{row.descripcion || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{row.cantidadPlanificada}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', maxWidth: '130px' }}><input className="form-input" type="number" min="0" value={row.cantidadConfirmada} onChange={(e) => updateMaterial(row.id, 'cantidadConfirmada', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}><input type="checkbox" checked={row.confirmada} onChange={(e) => updateMaterial(row.id, 'confirmada', e.target.checked)} /></td>
                  </tr>
                ))}
                {!materialsRows.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>No hay materiales asignados en la OT.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.6rem' }}>
              <h4>Agregar materiales adicionales</h4>
              <button type="button" className="btn btn-secondary" onClick={() => setShowMaterialPicker(true)}>+ Agregar material</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#e5e7eb' }}>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Código</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Descripción</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Cantidad</th>
                  <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {extraMaterials.map((row) => (
                  <tr key={row.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" value={row.codigo} onChange={(e) => updateExtraMaterial(row.id, 'codigo', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" value={row.descripcion} onChange={(e) => updateExtraMaterial(row.id, 'descripcion', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', maxWidth: '130px' }}><input className="form-input" type="number" min="0" value={row.cantidad} onChange={(e) => updateExtraMaterial(row.id, 'cantidad', e.target.value)} /></td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removeExtraMaterial(row.id)}>Quitar</button></td>
                  </tr>
                ))}
                {!extraMaterials.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>Sin materiales adicionales.</td></tr>}
              </tbody>
            </table>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit}>Guardar registro</button>
          </div>
        </div>
      </div>

      {showTechPicker && (
        <PickerModal
          title="Seleccionar técnico (RRHH)"
          placeholder="Buscar por código, nombre o especialidad"
          items={rrhhItems}
          filterFn={(item, q) => !q || `${item.codigo} ${item.nombres_apellidos} ${item.especialidad}`.toLowerCase().includes(q)}
          itemLabel={(item) => `${item.codigo} · ${item.nombres_apellidos} · ${item.especialidad || 'N.A.'}${item.tipo_personal === 'Tercero' ? ` · ${item.empresa || 'Tercero'}` : ''}`}
          onPick={addTechFromRrhh}
          onClose={() => setShowTechPicker(false)}
        />
      )}

      {showMaterialPicker && (
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
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);
  const [showEditOtModal, setShowEditOtModal] = useState(false);
  const [expandedOtIds, setExpandedOtIds] = useState({});
  const [filterArea, setFilterArea] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterEquipment, setFilterEquipment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [alertsData, reportsData, rrhhData, materialsData] = await Promise.all([
        loadSharedDocument(OT_ALERTS_KEY, []),
        loadSharedDocument(OT_WORK_REPORTS_KEY, []),
        loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
        loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
      ]);
      if (!active) return;
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      setWorkReports(Array.isArray(reportsData) ? reportsData : []);
      setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
      setMaterialsCatalog(normalizeMaterialsCatalog(materialsData));
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
  const canEditLiberatedOt = ['PLANNER', 'ENCARGADO', 'INGENIERO'].includes(normalizedRole);
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

  const visibleNotifications = useMemo(() => {
    if (canApproveClose) return [...requestCloseNotifications, ...liberatedNotifications];
    return liberatedNotifications;
  }, [canApproveClose, requestCloseNotifications, liberatedNotifications]);

  const selectedAlert = useMemo(
    () => visibleNotifications.find((item) => String(item.id) === String(selectedAlertId)) || null,
    [visibleNotifications, selectedAlertId],
  );
  const selectedAlertConsistency = useMemo(
    () => (selectedAlert ? consistencyByAlert.get(String(selectedAlert.id)) || { hasInconsistency: false, count: 0, inconsistentReports: [] } : { hasInconsistency: false, count: 0, inconsistentReports: [] }),
    [selectedAlert, consistencyByAlert],
  );

  const areaOptions = useMemo(
    () => Array.from(new Set(visibleNotifications.map((it) => (it.area || it.area_equipo || 'N.A.')))),
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

  const filteredNotifications = useMemo(() => visibleNotifications.filter((item) => {
    const reports = reportByAlert.get(String(item.id)) || [];
    const areaValue = (item.area || item.area_equipo || 'N.A.').toLowerCase();
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

  const saveWorkReport = async (payload) => {
    if (!selectedAlert) return;
    if (selectedAlert.status_ot === 'Solicitud de cierre') {
      window.alert('La OT está en Solicitud de cierre. Ya no se pueden modificar las notificaciones de trabajo.');
      setShowRegisterModal(false);
      setEditingReportId(null);
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
    window.alert('Trabajo registrado correctamente.');
  };

const handleDeleteReport = async (reportId) => {
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
    if (!selectedAlert || selectedAlert.status_ot !== 'Liberada') {
      window.alert('Solo puedes registrar trabajo en una OT que esté Liberada.');
      return;
    }
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
    setEditingReportId(reportId);
    setShowRegisterModal(true);
  };

  const handleSaveOtChanges = async (payload) => {
    if (!selectedAlert) return;
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
          turno: payload.turno,
          observaciones: payload.observaciones,
        },
      };
    });
    await persistAlerts(nextAlerts);
    setShowEditOtModal(false);

    const updatedAlert = nextAlerts.find((item) => String(item.id) === String(selectedAlert.id));
    const updatedSummary = getAlertConsistencySummary(updatedAlert, reportByAlert.get(String(selectedAlert.id)) || []);
    if (updatedSummary.hasInconsistency) {
      window.alert(`La OT fue actualizada, pero aún mantiene ${updatedSummary.count} inconsistencia(s) de fechas. Revísala antes de cerrar la orden.`);
    } else {
      window.alert('La OT fue actualizada y los registros de trabajo quedaron conformes con el rango liberado.');
    }
  };

  const handleRequestClose = async () => {
    if (!selectedAlert) return;
    const reportsForAlert = reportByAlert.get(String(selectedAlert.id)) || [];
    if (!reportsForAlert.length) {
      window.alert('Debes tener al menos un registro de trabajo antes de solicitar cierre.');
      return;
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
  };

  const handleApproveClose = async () => {
    if (!selectedAlert) return;
    const reportsForAlert = reportByAlert.get(String(selectedAlert.id)) || [];
    const consistencySummary = getAlertConsistencySummary(selectedAlert, reportsForAlert);
    if (consistencySummary.hasInconsistency) {
      window.alert(`No puedes cerrar esta OT porque mantiene ${consistencySummary.count} inconsistencia(s) entre los registros de trabajo y el rango liberado. Edita la OT liberada, revisa las fechas y vuelve a intentar.`);
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
    openCloseReportPdf(closedRow, reportsForAlert, materialsCatalog);
    setSelectedAlertId(null);
  };

  const handleReturnToLiberated = async () => {
    if (!selectedAlert || selectedAlert.status_ot !== 'Solicitud de cierre') return;
    const confirmed = window.confirm('La OT volverá a estado Liberada para que los técnicos corrijan las notificaciones de trabajo. ¿Deseas continuar?');
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
        },
      };
    });

    await persistAlerts(nextAlerts);
    window.alert('La OT volvió a estado Liberada. Ahora puede corregirse en notificaciones y volver a solicitar cierre.');
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

      {canApproveClose && requestCloseNotifications.length > 0 && (
        <div className="alert alert-warning">
          Hay {requestCloseNotifications.length} solicitud(es) de cierre pendientes de revisión para PLANNER/INGENIERO.
        </div>
      )}

      {selectedAlert && selectedAlertConsistency.hasInconsistency && (
        <div className="alert alert-warning">
          La OT seleccionada tiene {selectedAlertConsistency.count} inconsistencia(s) de fecha en sus registros de trabajo. Puede solicitar cierre, pero no podrá cerrarse hasta corregir la liberación y revisar que todo quede conforme.
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: '.8rem' }}>
        <div className="stat-card">
          <div className="stat-label">OT Liberadas</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{liberatedNotifications.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Solicitudes de Cierre</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{requestCloseNotifications.length}</div>
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
          <div className="stat-label">OT con Inconsistencia</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{inconsistentAlertsCount}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '.8rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: '.65rem' }}>
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

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!selectedAlert || selectedAlert.status_ot !== 'Liberada'}
          onClick={handleOpenRegister}
        >
          Registrar Trabajo
        </button>
        {canEditLiberatedOt && ['Liberada', 'Solicitud de cierre'].includes(selectedAlert?.status_ot || '') && (
          <button type="button" className="btn btn-secondary" onClick={() => setShowEditOtModal(true)}>
            Editar OT
          </button>
        )}
        {canRequestClose && selectedAlert?.status_ot === 'Liberada' && (
          <button type="button" className="btn btn-danger" onClick={handleRequestClose}>
            Solicitar cierre
          </button>
        )}
        {canApproveClose && selectedAlert?.status_ot === 'Solicitud de cierre' && (
          <button type="button" className="btn btn-secondary" onClick={handleReturnToLiberated}>
            Devolver a Liberada
          </button>
        )}
        {canApproveClose && selectedAlert?.status_ot === 'Solicitud de cierre' && (
          <button type="button" className="btn btn-primary" onClick={handleApproveClose} disabled={selectedAlertConsistency.hasInconsistency}>
            Cerrar OT y generar PDF
          </button>
        )}
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1820px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Sel.', 'Registro', 'Estado OT', '# OT', 'Código', 'Descripción', 'Prioridad', 'Actividad', 'Responsable', 'Fecha a ejecutar', 'Fecha inicio', 'Hora inicio', 'Fecha fin', 'Hora fin', 'Personal asignado', 'Materiales asignados'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f4f75', padding: '.55rem .5rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredNotifications.map((item) => {
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
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{formatDateDisplay(item.fecha_ejecutar || '', 'N.A.')}</td>
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
                    const canModifyReport = normalizedRole !== 'TECNICO' || isWorkReportOwnedByUser(report, user);
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
                            {reportConsistency.hasInconsistency && (
                              <div style={{ marginTop: '.35rem', color: '#991b1b', fontSize: '.85rem' }}>
                                Inconsistencia de fechas. {reportConsistency.reason}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '.4rem' }}>
                            {!reportLocked && canModifyReport && (
                              <>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEditReport(item.id, report.id)}>Editar</button>
                                <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteReport(report.id)}>Eliminar</button>
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
            {!filteredNotifications.length && (
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
          onClose={() => {
            setShowRegisterModal(false);
            setEditingReportId(null);
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
          onClose={() => setShowEditOtModal(false)}
          onSave={handleSaveOtChanges}
        />
      )}
    </div>
  );
}
