import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { DEFAULT_MATERIALS, normalizeMaterialsCatalog } from '../utils/materialsCatalog';
import { getAlertConsistencySummary } from '../utils/otConsistency';
import EditLiberatedOtModal from '../components/EditLiberatedOtModal';
import { formatDateDisplay, formatDateTimeDisplay } from '../utils/dateFormat';
import {
  formatOtNumber,
  getOtSequenceConfigForYear,
  inferMaxOtSequenceForYear,
  upsertOtSequenceConfig,
} from '../utils/otSequence';
import {
  buildMaintenanceNoticesFromReports,
  getNoticeStatusColor,
  summarizeNoticeForDisplay,
} from '../utils/maintenanceNotices';

const PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlans;
const KM_PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlansKm;
const PACKAGES_KEY = SHARED_DOCUMENT_KEYS.maintenancePackages;
const EQUIPOS_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const OT_DELETED_KEY = SHARED_DOCUMENT_KEYS.otDeleted;
const OT_SEQUENCE_KEY = SHARED_DOCUMENT_KEYS.otSequenceSettings;
const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;
const OT_WORK_REPORTS_KEY = SHARED_DOCUMENT_KEYS.otWorkReports;
const NOTICES_KEY = SHARED_DOCUMENT_KEYS.maintenanceNotices;
const RRHH_KEY = SHARED_DOCUMENT_KEYS.rrhh;
const MATERIALES_KEY = SHARED_DOCUMENT_KEYS.materials;
const RRHH_FALLBACK = [
  { id: 1, codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', cargo: 'Técnico', especialidad: 'Mecánico', capacidad_hh_dia: '12.00' },
  { id: 2, codigo: 'ELE-1', nombres_apellidos: 'Hernan Alauce Alarcón', cargo: 'Encargado', especialidad: 'Eléctrico', capacidad_hh_dia: '12.00' },
];
const MATERIALES_FALLBACK = DEFAULT_MATERIALS;

const FREQ_TO_DAYS = {
  Semanal: 7,
  Mensual: 30,
  Bimestral: 60,
  Trimestral: 90,
  Semestral: 180,
  Anual: 365,
};

const getDueDatesInWindow = (plan, windowStart, windowEnd) => {
  const intervalDays = FREQ_TO_DAYS[plan.frecuencia] ?? 30;
  const start = new Date(`${plan.fecha_inicio}T00:00:00`);
  if (Number.isNaN(start.getTime())) return [];

  const from = new Date(windowStart);
  const to = new Date(windowEnd);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const cursor = new Date(start);
  while (cursor < from) cursor.setDate(cursor.getDate() + intervalDays);

  const result = [];
  while (cursor <= to) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + intervalDays);
  }
  return result;
};

const isKmPlanInAlertWindow = (plan) => {
  const actual = Number(plan.km_actual) || 0;
  const target = Number(plan.proximo_km) || 0;
  const alertKm = Number(plan.alerta_km) || 0;
  return target > 0 && actual >= Math.max(target - alertKm, 0);
};

const buildKmAlertId = (plan) => `km_${plan.id}_${Number(plan.proximo_km) || 0}`;

const compareOtAlerts = (a, b) => {
  const aIsDate = /^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha_ejecutar || ''));
  const bIsDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha_ejecutar || ''));

  if (aIsDate && bIsDate) {
    return new Date(a.fecha_ejecutar) - new Date(b.fecha_ejecutar);
  }
  if (!aIsDate && !bIsDate) {
    return (Number(a.km_restantes) || 0) - (Number(b.km_restantes) || 0);
  }
  return aIsDate ? -1 : 1;
};

const buildManualOtId = () => `manual_${Date.now()}`;
const renumberOtRows = (rows) => [...rows].sort(compareOtAlerts).map((row, index) => ({ ...row, orden: index + 1 }));

const PRIORITY_OPTIONS = ['Baja', 'Media', 'Alta', 'Critica'];
const VC_OPTIONS = ['V.C - DIA', 'V.C - HRA', 'V.C - KM'];
const OT_TYPE_OPTIONS = ['Preventivo', 'Correctivo', 'Predictivo', 'Inspeccion', 'Lubricacion', 'Mejora'];

const splitActivities = (value) => String(value || '')
  .split(/\r?\n+/)
  .map((item) => item.trim())
  .filter(Boolean);

const formatActivities = (items) => (Array.isArray(items) ? items : [])
  .map((item) => String(item || '').trim())
  .filter(Boolean)
  .join('\n');

const normalizePackageActivities = (pkg) => (Array.isArray(pkg?.actividades) ? pkg.actividades : [])
  .map((item) => String(item || '').trim())
  .filter(Boolean);

const getVcFromAlert = (alert) => {
  if (!alert) return 'V.C - DIA';
  if (alert.origen_programacion === 'KM' || String(alert.tipo_mantto || '').toLowerCase().includes('km')) return 'V.C - KM';
  return 'V.C - DIA';
};

const buildCreateFormFromAlert = (alert) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  return {
    equipo_id: alert?.equipo_id || '',
    codigo: alert?.codigo || '',
    descripcion: alert?.descripcion || '',
    area_trabajo: alert?.area_trabajo || '',
    prioridad: alert?.prioridad || 'Media',
    vc: alert?.vc || getVcFromAlert(alert),
    responsable: alert?.responsable || '',
    tipo_mantto: alert?.tipo_mantto || (alert ? 'Preventivo' : 'Correctivo'),
    tiempo_min: alert?.tiempo_min || '',
    fecha: alert?.fecha_ejecutar || todayStr,
    servicio: alert?.servicio || '',
    paquete_pm_id: alert?.paquete_pm_id || '',
    actividades: splitActivities(alert?.actividad),
  };
};

const allocateNextOtNumber = async (year) => {
  const safeYear = Number(year) || new Date().getFullYear();
  const [sequenceSettings, activeAlerts, historyRows] = await Promise.all([
    loadSharedDocument(OT_SEQUENCE_KEY, []),
    loadSharedDocument(OT_ALERTS_KEY, []),
    loadSharedDocument(OT_HISTORY_KEY, []),
  ]);
  const detectedMax = inferMaxOtSequenceForYear([...(Array.isArray(activeAlerts) ? activeAlerts : []), ...(Array.isArray(historyRows) ? historyRows : [])], safeYear);
  const currentConfig = getOtSequenceConfigForYear(sequenceSettings, safeYear, detectedMax);
  const nextSequence = currentConfig.next_number;
  const nextSettings = upsertOtSequenceConfig(sequenceSettings, {
    year: safeYear,
    start_number: currentConfig.start_number,
    last_number: nextSequence,
  });
  await saveSharedDocument(OT_SEQUENCE_KEY, nextSettings);
  return formatOtNumber(safeYear, nextSequence);
};

const buildReservationMap = (alerts, excludeAlertId = null) => {
  const reserved = new Map();
  alerts
    .filter((item) => item.id !== excludeAlertId && ['Creada', 'Liberada'].includes(item.status_ot))
    .forEach((item) => {
      (item.materiales_detalle || []).forEach((material) => {
        const key = String(material.id ?? material.materialId ?? material.codigo ?? '');
        if (!key) return;
        reserved.set(key, (reserved.get(key) || 0) + (Number(material.cantidad) || 0));
      });
    });
  return reserved;
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildCloseReportHtml = (alert, reports) => {
  const reportRows = (reports || []).map((report, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(report.reportCode || '')}</td>
      <td>${escapeHtml(formatDateTimeDisplay(report.fechaInicio, report.horaInicio, 'N.A.'))}</td>
      <td>${escapeHtml(formatDateTimeDisplay(report.fechaFin, report.horaFin, 'N.A.'))}</td>
      <td>${escapeHtml((report.tecnicos || []).map((item) => `${item.tecnico} (${item.horas} h)`).join(', '))}</td>
      <td>${escapeHtml((report.materialesExtra || []).map((item) => `${item.codigo || item.descripcion} x${item.cantidad}`).join(', '))}</td>
      <td>${escapeHtml(report.observaciones || '')}</td>
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
          <div><div class="label">Fin OT</div><div class="value">${escapeHtml(formatDateTimeDisplay(alert.cierre_ot?.fecha_fin || alert.registro_ot?.fecha_fin || '', alert.cierre_ot?.hora_fin || alert.registro_ot?.hora_fin || '', 'N.A.'))}</div></div>
        </div>

        <div class="section">
          <h2>Personal y materiales</h2>
          <div><strong>Personal:</strong> ${escapeHtml(alert.personal_mantenimiento || 'N.A.')}</div>
          <div><strong>Materiales:</strong> ${escapeHtml(alert.materiales || 'N.A.')}</div>
          <div><strong>Observaciones cierre:</strong> ${escapeHtml(alert.cierre_ot?.observaciones || '')}</div>
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
                <th>Observaciones</th>
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

const openCloseReportPdf = (alert, reports) => {
  const printWindow = window.open('', '_blank', 'width=1024,height=768');
  if (!printWindow) {
    window.alert('No se pudo abrir la ventana para generar el PDF.');
    return;
  }
  printWindow.document.write(buildCloseReportHtml(alert, reports));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 300);
};

const aggregateTimeByTechnician = (personalDetalle = [], reports = []) => {
  const staffById = new Map((personalDetalle || []).map((item) => [String(item.id), item]));
  const staffByName = new Map((personalDetalle || []).map((item) => [String(item.nombres_apellidos || '').trim().toLowerCase(), item]));
  const aggregated = new Map();

  (reports || []).forEach((report) => {
    (report.tecnicos || []).forEach((row) => {
      const tecnicoId = row.tecnicoId !== null && row.tecnicoId !== undefined && row.tecnicoId !== '' ? String(row.tecnicoId) : '';
      const tecnicoNombre = String(row.tecnico || '').trim();
      const tecnicoKey = tecnicoId || tecnicoNombre.toLowerCase();
      if (!tecnicoKey) return;

      const matchedStaff = (tecnicoId && staffById.get(tecnicoId)) || staffByName.get(tecnicoNombre.toLowerCase()) || null;
      const existing = aggregated.get(tecnicoKey);
      aggregated.set(tecnicoKey, {
        id: matchedStaff?.id ?? existing?.id ?? tecnicoKey,
        codigo: matchedStaff?.codigo ?? existing?.codigo ?? 'N.A.',
        nombre: matchedStaff?.nombres_apellidos ?? existing?.nombre ?? tecnicoNombre ?? 'Tecnico',
        especialidad: matchedStaff?.especialidad ?? existing?.especialidad ?? 'N.A.',
        horas: Number(((existing?.horas || 0) + (Number(row.horas) || 0)).toFixed(2)),
      });
    });
  });

  return Array.from(aggregated.values()).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
};

function ModalTiempoEfectivo({ personalDetalle, tiempoPersonalActual, maxHorasSugeridas, onClose, onSave, readOnly = false, description = '' }) {
  const [rows, setRows] = useState(() => {
    const mapActual = new Map((tiempoPersonalActual || []).map((item) => [String(item.id), item.horas]));
    return (personalDetalle || []).map((item) => ({
      id: item.id,
      codigo: item.codigo,
      nombre: item.nombres_apellidos,
      especialidad: item.especialidad,
      horas: mapActual.get(String(item.id)) ?? 0,
    }));
  });

  useEffect(() => {
    const nextRows = (tiempoPersonalActual || []).length
      ? (tiempoPersonalActual || []).map((item) => ({
        id: item.id,
        codigo: item.codigo || 'N.A.',
        nombre: item.nombre || item.nombres_apellidos || 'Tecnico',
        especialidad: item.especialidad || 'N.A.',
        horas: item.horas || 0,
      }))
      : (personalDetalle || []).map((item) => ({
        id: item.id,
        codigo: item.codigo,
        nombre: item.nombres_apellidos,
        especialidad: item.especialidad,
        horas: 0,
      }));
    setRows(nextRows);
  }, [personalDetalle, tiempoPersonalActual]);

  const totalHoras = rows.reduce((sum, item) => sum + (Number(item.horas) || 0), 0);

  const updateHoras = (id, value) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, horas: value } : row)));
  };

  const submit = () => {
    const payload = rows.map((item) => ({ ...item, horas: Number(item.horas) || 0 }));
    const excedido = payload.find((item) => item.horas > maxHorasSugeridas);
    if (excedido) {
      window.alert(`El técnico ${excedido.nombre} excede el máximo sugerido (${maxHorasSugeridas.toFixed(2)} Hh).`);
      return;
    }
    onSave({
      tiempoPersonal: payload,
      totalHoras: Number(payload.reduce((sum, item) => sum + item.horas, 0).toFixed(2)),
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .5)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(520px, 100%)', background: '#fff', borderRadius: '.65rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Tiempo efectivo por técnico</h3>
          <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Selecciona el técnico por nombre y registra sus horas trabajadas.</p>
        </div>
        <div style={{ padding: '1rem 1.2rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>Técnico</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>CÃ³digo</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>Especialidad</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>Horas trabajadas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{row.nombre}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{row.codigo || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{row.especialidad}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem', width: '180px' }}>
                      {readOnly ? (
                        <div style={{ fontWeight: 600, color: '#111827' }}>{Number(row.horas || 0).toFixed(2)}</div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          max={maxHorasSugeridas}
                          className="form-input"
                          value={row.horas}
                          onChange={(e) => updateHoras(row.id, e.target.value)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={4} style={{ border: '1px solid #e5e7eb', padding: '.8rem', textAlign: 'center', color: '#6b7280' }}>
                      No hay técnicos asignados en esta OT.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '.8rem', fontWeight: 600, color: '#1f2937' }}>
            Tiempo efectivo - personal (Hh): {Number(totalHoras).toFixed(2)}
          </div>
          {description && (
            <div style={{ marginTop: '.45rem', fontSize: '.9rem', color: '#374151' }}>
              {description}
            </div>
          )}
          <div style={{ marginTop: '.35rem', fontSize: '.9rem', color: '#6b7280' }}>
            Sugerencia: máximo por técnico = {Number(maxHorasSugeridas || 0).toFixed(2)} Hh (según hora inicio/fin).
          </div>
        </div>
        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '.65rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
          {!readOnly && <button type="button" className="btn btn-primary" onClick={submit}>Guardar tiempo</button>}
        </div>
      </div>
    </div>
  );
}

function ModalCrearOt({ initialAlert, equipmentItems, packageItems, mode = 'create', onClose, onSubmit }) {
  const [form, setForm] = useState(() => buildCreateFormFromAlert(initialAlert));
  const [descriptionFilter, setDescriptionFilter] = useState(initialAlert?.descripcion || '');
  const [codeFilter, setCodeFilter] = useState(initialAlert?.codigo || '');
  const [packageFilter, setPackageFilter] = useState('');
  const [activityInput, setActivityInput] = useState('');
  const [activities, setActivities] = useState(() => buildCreateFormFromAlert(initialAlert).actividades);
  const isEditMode = mode === 'edit';
  const modalTitle = isEditMode ? 'Editar OT pendiente' : 'OT no programada / Crear OT';
  const submitLabel = isEditMode ? 'Guardar cambios OT' : 'Registrar OT';
  const otStatusLabel = initialAlert?.status_ot || 'Pendiente';

  useEffect(() => {
    const next = buildCreateFormFromAlert(initialAlert);
    setForm(next);
    setDescriptionFilter(initialAlert?.descripcion || '');
    setCodeFilter(initialAlert?.codigo || '');
    setPackageFilter('');
    setActivityInput('');
    setActivities(next.actividades);
  }, [initialAlert]);

  const selectedPackage = useMemo(
    () => (packageItems || []).find((item) => String(item.id) === String(form.paquete_pm_id)) || null,
    [packageItems, form.paquete_pm_id],
  );

  const filteredPackages = useMemo(() => {
    const query = packageFilter.trim().toLowerCase();
    if (!query) return packageItems || [];
    return (packageItems || []).filter((item) => `${item.codigo || ''} ${item.nombre || ''}`.toLowerCase().includes(query));
  }, [packageItems, packageFilter]);

  const filteredEquipments = useMemo(() => (equipmentItems || []).filter((item) => {
    const matchesDesc = !descriptionFilter.trim() || String(item.descripcion || '').toLowerCase().includes(descriptionFilter.trim().toLowerCase());
    const matchesCode = !codeFilter.trim() || String(item.codigo || '').toLowerCase().includes(codeFilter.trim().toLowerCase());
    return matchesDesc && matchesCode;
  }), [equipmentItems, descriptionFilter, codeFilter]);

  const selectedEquipment = useMemo(
    () => (equipmentItems || []).find((item) => String(item.id) === String(form.equipo_id))
      || (equipmentItems || []).find((item) => String(item.codigo || '').toUpperCase() === String(form.codigo || '').toUpperCase())
      || null,
    [equipmentItems, form.equipo_id, form.codigo],
  );

  const selectEquipment = (equipment) => {
    setForm((prev) => ({
      ...prev,
      equipo_id: equipment.id,
      codigo: equipment.codigo || '',
      descripcion: equipment.descripcion || '',
      area_trabajo: equipment.area_trabajo || '',
      prioridad: prev.prioridad || equipment.criticidad || 'Media',
    }));
    setDescriptionFilter(equipment.descripcion || '');
    setCodeFilter(equipment.codigo || '');
  };

  const addActivity = () => {
    const text = activityInput.trim();
    if (!text) return;
    setActivities((prev) => [...prev, text]);
    setActivityInput('');
  };

  const removeActivity = (index) => {
    setActivities((prev) => prev.filter((_, idx) => idx !== index));
  };

  const applyPackage = () => {
    if (!selectedPackage) {
      window.alert('Selecciona un paquete PM antes de aplicarlo.');
      return;
    }
    const nextActivities = normalizePackageActivities(selectedPackage);
    setActivities(nextActivities);
    setForm((prev) => ({
      ...prev,
      vc: selectedPackage.vc || prev.vc,
      tiempo_min: selectedPackage.tiempo_min || prev.tiempo_min,
      servicio: prev.servicio || selectedPackage.nombre || '',
    }));
  };

  const submit = () => {
    if (!form.codigo.trim() || !form.descripcion.trim()) {
      window.alert('Selecciona un equipo o completa codigo y descripcion.');
      return;
    }
    if (!form.fecha) {
      window.alert('Debes indicar la fecha de la OT.');
      return;
    }
    if (!activities.length) {
      window.alert('Agrega al menos una actividad de mantenimiento.');
      return;
    }

    onSubmit({
      ...form,
      codigo: form.codigo.trim().toUpperCase(),
      descripcion: form.descripcion.trim(),
      area_trabajo: form.area_trabajo.trim() || 'N.A.',
      responsable: form.responsable.trim() || 'N.A.',
      tipo_mantto: form.tipo_mantto || 'Correctivo',
      tiempo_min: Number(form.tiempo_min) || 0,
      servicio: form.servicio.trim(),
      actividad: formatActivities(activities),
      paquete_pm_nombre: selectedPackage?.nombre || '',
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .5)', zIndex: 1350, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(1260px, 100%)', maxHeight: '94vh', overflow: 'auto', background: '#f8fafc', borderRadius: '.85rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', background: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '.2rem' }}>{modalTitle}</h3>
            <p style={{ color: '#6b7280', fontSize: '.92rem', margin: 0 }}>
              {isEditMode && initialAlert
                ? `Edita la OT ${initialAlert.codigo} - ${initialAlert.descripcion} con el mismo formato con el que fue creada.`
                : initialAlert
                  ? `Creacion de OT para ${initialAlert.codigo} - ${initialAlert.descripcion}.`
                  : 'Selecciona un equipo desde inventario y registra la OT.'}
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ padding: '1rem 1.2rem 1.2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem', marginBottom: '1rem' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '.9rem', padding: '.9rem 1rem' }}>
              <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.25rem' }}>Equipo seleccionado</div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedEquipment ? `${selectedEquipment.codigo} - ${selectedEquipment.descripcion}` : 'Sin equipo seleccionado'}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '.9rem', padding: '.9rem 1rem' }}>
              <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.25rem' }}>Estado inicial</div>
              <div style={{ fontWeight: 700, color: '#b45309' }}>{otStatusLabel}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '.9rem', padding: '.9rem 1rem' }}>
              <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.25rem' }}>Actividades cargadas</div>
              <div style={{ fontWeight: 700, color: '#2563eb' }}>{activities.length}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '.9rem', padding: '.9rem 1rem' }}>
              <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.25rem' }}>Paquete PM</div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedPackage?.nombre || 'No aplicado'}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.05rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', marginBottom: '.9rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Busqueda de equipo</h4>
                <p style={{ color: '#6b7280', fontSize: '.9rem', margin: 0 }}>Filtra por descripcion o codigo y selecciona un equipo desde el inventario.</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.6fr) minmax(180px, .8fr)', gap: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Buscar por descripcion</label>
                <input className="form-input" value={descriptionFilter} onChange={(e) => setDescriptionFilter(e.target.value)} placeholder="Ej: Pre limpia, montacargas, ventilador..." />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Codigo</label>
                <input className="form-input" value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} placeholder="Ej: IAISPL1" />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(340px, .95fr)', gap: '1rem', alignItems: 'start' }}>
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', marginBottom: '.8rem' }}>
                <h4 className="card-title" style={{ marginBottom: 0 }}>Inventario de equipos</h4>
                <span style={{ fontSize: '.85rem', color: '#6b7280' }}>{filteredEquipments.length} resultados</span>
              </div>
              <div style={{ maxHeight: '360px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '.8rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px', background: '#fff' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: '#eff6ff' }}>
                      {['Codigo', 'Descripcion', 'Area de trabajo', 'Marca', 'Capacidad', 'Potencia (kW)', 'Amperaje', 'Voltaje', 'Estado'].map((h) => (
                        <th key={h} style={{ borderBottom: '1px solid #dbeafe', padding: '.55rem .5rem', textAlign: 'left', fontSize: '.82rem', color: '#1e3a8a' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEquipments.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => selectEquipment(item)}
                        style={{ cursor: 'pointer', background: String(form.equipo_id) === String(item.id) ? '#dbeafe' : '#fff' }}
                      >
                        <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem', fontWeight: 700 }}>{item.codigo}</td>
                        <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem' }}>{item.descripcion}</td>
                        <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem' }}>{item.area_trabajo || 'N.A.'}</td>
                        <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem' }}>{item.marca || 'N.A.'}</td>
                        <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem' }}>{item.capacidad || 'N.A.'}</td>
                        <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem' }}>{item.potencia_kw || 'N.A.'}</td>
                        <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem' }}>{item.amperaje || 'N.A.'}</td>
                        <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem' }}>{item.voltaje_trabajo || 'N.A.'}</td>
                        <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem' }}>{item.estado || 'N.A.'}</td>
                      </tr>
                    ))}
                    {!filteredEquipments.length && (
                      <tr>
                        <td colSpan={9} style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                          No hay equipos que coincidan con la busqueda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div className="card" style={{ marginBottom: 0 }}>
                <h4 className="card-title" style={{ marginBottom: '.85rem' }}>Datos de la OT</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.8rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Codigo</label>
                    <input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Prioridad</label>
                    <select className="form-select" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
                      {PRIORITY_OPTIONS.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label className="form-label">Descripcion</label>
                    <input className="form-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">V.C</label>
                    <select className="form-select" value={form.vc} onChange={(e) => setForm({ ...form, vc: e.target.value })}>
                      {VC_OPTIONS.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Responsable</label>
                    <input className="form-input" value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Tipo de mantto</label>
                    <select className="form-select" value={form.tipo_mantto} onChange={(e) => setForm({ ...form, tipo_mantto: e.target.value })}>
                      {OT_TYPE_OPTIONS.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Tiempo (min.)</label>
                    <input type="number" min="0" className="form-input" value={form.tiempo_min} onChange={(e) => setForm({ ...form, tiempo_min: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Fecha</label>
                    <input type="date" className="form-input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Area de trabajo</label>
                    <input className="form-input" value={form.area_trabajo} onChange={(e) => setForm({ ...form, area_trabajo: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 0 }}>
                <h4 className="card-title" style={{ marginBottom: '.85rem' }}>Paquete PM</h4>
                <div className="form-group" style={{ marginBottom: '.65rem' }}>
                  <label className="form-label">Filtrar paquete</label>
                  <input className="form-input" value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)} placeholder="Filtrar paquete por nombre o codigo..." />
                </div>
                <div className="form-group" style={{ marginBottom: '.65rem' }}>
                  <label className="form-label">Seleccion</label>
                  <select className="form-select" value={form.paquete_pm_id || ''} onChange={(e) => setForm({ ...form, paquete_pm_id: e.target.value })}>
                    <option value="">-- Seleccionar paquete --</option>
                    {filteredPackages.map((item) => (
                      <option key={item.id} value={item.id}>{item.codigo} - {item.nombre}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '.88rem', color: '#6b7280' }}>
                    {selectedPackage
                      ? `${selectedPackage.vc || 'V.C'} · ${selectedPackage.tiempo_min || 0} min · ${normalizePackageActivities(selectedPackage).length} actividades`
                      : 'Puedes aplicar un paquete para cargar actividades y tiempos.'}
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={applyPackage}>Aplicar paquete</button>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', marginBottom: '.85rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Actividades de mantenimiento</h4>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '.9rem' }}>Agrega tareas manuales o aplica un paquete PM para cargar varias de una vez.</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) auto', gap: '.6rem', marginBottom: '.8rem' }}>
              <input className="form-input" value={activityInput} onChange={(e) => setActivityInput(e.target.value)} placeholder="Escribe una actividad y agregala" />
              <button type="button" className="btn btn-primary" onClick={addActivity}>Agregar</button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '.8rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#eff6ff' }}>
                    <th style={{ borderBottom: '1px solid #dbeafe', padding: '.5rem', width: '80px', color: '#1e3a8a' }}>Item</th>
                    <th style={{ borderBottom: '1px solid #dbeafe', padding: '.5rem', textAlign: 'left', color: '#1e3a8a' }}>Descripcion de las actividades</th>
                    <th style={{ borderBottom: '1px solid #dbeafe', padding: '.5rem', width: '100px', color: '#1e3a8a' }}>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((item, index) => (
                    <tr key={`${item}-${index}`}>
                      <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem', textAlign: 'center', fontWeight: 700 }}>{index + 1}</td>
                      <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem' }}>{item}</td>
                      <td style={{ borderTop: '1px solid #e5e7eb', padding: '.55rem .5rem', textAlign: 'center' }}>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeActivity(index)}>Quitar</button>
                      </td>
                    </tr>
                  ))}
                  {!activities.length && (
                    <tr>
                      <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                        Sin actividades registradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="form-group" style={{ marginBottom: 0, marginTop: '1rem' }}>
              <label className="form-label">Servicio / observacion general</label>
              <input className="form-input" value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value })} placeholder="Ej: Cambio de aceite, inspeccion mecanica, limpieza profunda..." />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 0, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: '.2rem' }}>
                  {isEditMode ? `La OT se mantendra en estado ${otStatusLabel}` : 'La OT se registrara en estado Pendiente'}
                </div>
                <div style={{ fontSize: '.9rem', color: '#475569' }}>
                  {isEditMode
                    ? 'Puedes ajustar los datos de planificacion antes de liberarla. El numero de OT seguira vacio hasta la liberacion.'
                    : 'El numero de OT se asignara recien cuando uses la opcion Liberar OT.'}
                </div>
              </div>
              <button type="button" className="btn btn-primary" onClick={submit}>{submitLabel}</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '.65rem', background: '#fff' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={submit}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ModalCerrarOT({ alert, reports = [], onClose, onSubmit, onReturnToLiberated }) {
  const [showTiempoModal, setShowTiempoModal] = useState(false);
  const [expandedReportIds, setExpandedReportIds] = useState({});
  const [form, setForm] = useState(() => {
    const registro = alert.registro_ot || {};
    return {
      codigo: alert.codigo || '',
      descripcion: alert.descripcion || '',
      fecha_inicio: registro.fecha_inicio || new Date().toISOString().slice(0, 10),
      fecha_fin: registro.fecha_fin || new Date().toISOString().slice(0, 10),
      hora_inicio: registro.hora_inicio || '08:00',
      hora_fin: registro.hora_fin || '09:00',
      observaciones: registro.observaciones || '',
      tipo_mantenimiento: alert.tipo_mantto || 'Preventivo',
      puesto_trabajo_resp: alert.responsable || 'N.A.',
      tiempo_efectivo_hh: alert.cierre_ot?.tiempo_efectivo_hh ?? 0,
      tiempo_personal: alert.cierre_ot?.tiempo_personal || [],
      satisfaccion: alert.cierre_ot?.satisfaccion || 'Satisfecho',
      estado_equipo: alert.cierre_ot?.estado_equipo || 'Operativo',
      informe: alert.cierre_ot?.informe || '',
    };
  });

  const personalDetalle = useMemo(() => alert.personal_detalle || [], [alert.personal_detalle]);
  const materialesDetalle = useMemo(() => alert.materiales_detalle || [], [alert.materiales_detalle]);
  const tiempoPersonalCalculado = useMemo(
    () => aggregateTimeByTechnician(personalDetalle, reports),
    [personalDetalle, reports],
  );
  const tiempoTotalCalculado = useMemo(
    () => Number(tiempoPersonalCalculado.reduce((sum, item) => sum + (Number(item.horas) || 0), 0).toFixed(2)),
    [tiempoPersonalCalculado],
  );
  const derivedNotices = useMemo(
    () => buildMaintenanceNoticesFromReports(alert, reports, [], 'Revision de cierre'),
    [alert, reports],
  );
  const [selectedNoticeIds, setSelectedNoticeIds] = useState(() => derivedNotices.map((item) => item.id));
  const maxHorasSugeridas = useMemo(() => {
    if (!form.fecha_inicio || !form.fecha_fin || !form.hora_inicio || !form.hora_fin) return 0;
    const inicio = new Date(`${form.fecha_inicio}T${form.hora_inicio}:00`);
    const fin = new Date(`${form.fecha_fin}T${form.hora_fin}:00`);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return 0;
    const diff = (fin.getTime() - inicio.getTime()) / (1000 * 60 * 60);
    return diff > 0 ? Number(diff.toFixed(2)) : 0;
  }, [form.fecha_inicio, form.fecha_fin, form.hora_inicio, form.hora_fin]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      tiempo_personal: tiempoPersonalCalculado,
      tiempo_efectivo_hh: tiempoTotalCalculado,
    }));
  }, [tiempoPersonalCalculado, tiempoTotalCalculado]);

  useEffect(() => {
    setSelectedNoticeIds(derivedNotices.map((item) => item.id));
  }, [derivedNotices]);

  const submit = () => {
    if (maxHorasSugeridas <= 0) {
      window.alert('La fecha/hora fin debe ser mayor a la fecha/hora inicio para poder cerrar la OT.');
      return;
    }
    if (!form.tiempo_efectivo_hh || Number(form.tiempo_efectivo_hh) <= 0) {
      window.alert('No hay horas acumuladas en las notificaciones de trabajo para cerrar la OT.');
      return;
    }
    onSubmit({
      ...form,
      avisos_generados_detalle: derivedNotices.filter((item) => selectedNoticeIds.includes(item.id)),
    });
  };

  const toggleReportExpanded = (reportId) => {
    setExpandedReportIds((prev) => ({ ...prev, [reportId]: !prev[reportId] }));
  };

  const returnToLiberated = () => {
    const confirmed = window.confirm('La OT volverá a estado Liberada para que los técnicos corrijan las notificaciones de trabajo. ¿Deseas continuar?');
    if (!confirmed) return;
    onReturnToLiberated(form);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .5)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(1180px, 100%)', maxHeight: '93vh', overflow: 'auto', background: '#fff', borderRadius: '.65rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Cerrar Orden de Trabajo · {alert.ot_numero || 'OT #?'}</h3>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar ventana</button>
        </div>

        <div style={{ padding: '1rem 1.2rem' }}>
          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Código</label><input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Tipo de mantenimiento</label><input className="form-input" value={form.tipo_mantenimiento} onChange={(e) => setForm({ ...form, tipo_mantenimiento: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label className="form-label">Descripción</label><input className="form-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Puesto trabajo resp.</label><input className="form-input" value={form.puesto_trabajo_resp} onChange={(e) => setForm({ ...form, puesto_trabajo_resp: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Fecha inicio</label><input type="date" className="form-input" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Hora inicio</label><input type="time" className="form-input" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Fecha fin</label><input type="date" className="form-input" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Hora fin</label><input type="time" className="form-input" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label className="form-label">Observaciones</label><textarea className="form-textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', marginBottom: '.8rem' }}>
              <div>
                <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Notificaciones de trabajo</h4>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '.9rem' }}>
                  Revisa aquí los subregistros antes de cerrar la OT. Si algo está mal, devuélvela a liberada para que sea corregida.
                </p>
              </div>
              <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{reports.length} registro(s)</span>
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '.75rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    {['Detalle', 'Código', 'Inicio', 'Fin', 'Horas', 'Técnicos', 'Materiales extra', 'Observaciones'].map((header) => (
                      <th key={header} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report, index) => {
                    const isExpanded = !!expandedReportIds[report.id];
                    return (
                      <React.Fragment key={report.id}>
                        <tr>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleReportExpanded(report.id)}>
                              {isExpanded ? 'Ocultar' : 'Ver'} detalle
                            </button>
                          </td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{report.reportCode || `NT${index + 1}-${alert.ot_numero || alert.id}`}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{formatDateTimeDisplay(report.fechaInicio || '', report.horaInicio || '', 'N.A.')}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{formatDateTimeDisplay(report.fechaFin || '', report.horaFin || '', 'N.A.')}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{Number(report.totalHoras || 0).toFixed(2)}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{report.tecnicos?.length || 0}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{report.materialesExtra?.length || 0}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{report.observaciones || 'N.A.'}</td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ background: '#f8fafc' }}>
                            <td colSpan={8} style={{ border: '1px solid #e5e7eb', padding: '.7rem .8rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '.8rem' }}>
                                <div>
                                  <div style={{ fontWeight: 700, marginBottom: '.35rem', color: '#1f2937' }}>Técnicos</div>
                                  {(report.tecnicos || []).length ? (
                                    <ul style={{ margin: 0, paddingLeft: '1rem', color: '#374151' }}>
                                      {(report.tecnicos || []).map((item) => (
                                        <li key={`${report.id}_${item.tecnicoId || item.tecnico}`}>
                                          {item.tecnico || 'Técnico'}: {Number(item.horas || 0).toFixed(2)} h
                                        </li>
                                      ))}
                                    </ul>
                                  ) : <div style={{ color: '#6b7280' }}>Sin técnicos registrados.</div>}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, marginBottom: '.35rem', color: '#1f2937' }}>Materiales extra</div>
                                  {(report.materialesExtra || []).length ? (
                                    <ul style={{ margin: 0, paddingLeft: '1rem', color: '#374151' }}>
                                      {(report.materialesExtra || []).map((item) => (
                                        <li key={`${report.id}_${item.materialId || item.codigo || item.descripcion}`}>
                                          {item.codigo || item.descripcion || 'Material'} x{item.cantidad || 0}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : <div style={{ color: '#6b7280' }}>Sin materiales extra.</div>}
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <div style={{ fontWeight: 700, marginBottom: '.35rem', color: '#1f2937' }}>Trabajo realizado</div>
                                  <div style={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{report.observaciones || 'Sin observaciones.'}</div>
                                  {report.maintenanceSuggestion?.requiresNotice && (
                                    <div style={{ marginTop: '.45rem', color: '#b45309', fontWeight: 700 }}>
                                      Aviso sugerido: {report.maintenanceSuggestion.noticeCategory || report.maintenanceSuggestion.label}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {!reports.length && (
                    <tr>
                      <td colSpan={8} style={{ border: '1px solid #e5e7eb', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                        No hay notificaciones de trabajo registradas para esta OT.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            <div className="card">
              <h4 className="card-title">Personal de mantenimiento</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                  <thead><tr style={{ background: '#f3f4f6' }}><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Código</th><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Nombres</th><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Especialidad</th></tr></thead>
                  <tbody>
                    {personalDetalle.map((p) => <tr key={p.id}><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{p.codigo}</td><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{p.nombres_apellidos}</td><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{p.especialidad}</td></tr>)}
                    {!personalDetalle.length && <tr><td colSpan={3} style={{ padding: '.7rem', textAlign: 'center', border: '1px solid #e5e7eb', color: '#6b7280' }}>Sin personal asignado.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h4 className="card-title">Materiales utilizados</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                  <thead><tr style={{ background: '#f3f4f6' }}><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Código</th><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Descripción</th><th style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>Cant.</th></tr></thead>
                  <tbody>
                    {materialesDetalle.map((m) => <tr key={m.id}><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{m.codigo}</td><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{m.descripcion}</td><td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{m.cantidad}</td></tr>)}
                    {!materialesDetalle.length && <tr><td colSpan={3} style={{ padding: '.7rem', textAlign: 'center', border: '1px solid #e5e7eb', color: '#6b7280' }}>Sin materiales registrados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {derivedNotices.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', marginBottom: '.8rem' }}>
                <div>
                  <h4 className="card-title" style={{ marginBottom: '.2rem' }}>Avisos de mantenimiento sugeridos</h4>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '.9rem' }}>
                    Estos avisos se crearán al cerrar la OT y luego podrán aceptarse o rechazarse desde PMP &gt; Avisos de Mantenimiento.
                  </p>
                </div>
                <span style={{ fontWeight: 700, color: '#b45309' }}>{derivedNotices.length} aviso(s)</span>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '.75rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      {['Crear', 'Aviso', 'Fecha', 'Categoria', 'Detalle', 'Origen'].map((header) => (
                        <th key={header} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {derivedNotices.map((notice) => (
                      <tr key={notice.id}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedNoticeIds.includes(notice.id)}
                            onChange={() => setSelectedNoticeIds((prev) => (
                              prev.includes(notice.id) ? prev.filter((item) => item !== notice.id) : [...prev, notice.id]
                            ))}
                          />
                        </td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{notice.aviso_codigo}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{formatDateDisplay(notice.fecha_aviso || '', 'N.A.')}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem', color: getNoticeStatusColor(notice.status), fontWeight: 700 }}>{notice.categoria}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{summarizeNoticeForDisplay(notice)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{notice.source_report_code || 'N.A.'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tiempo efectivo (Hh)</label>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <input className="form-input" value={form.tiempo_efectivo_hh} readOnly />
                  <button type="button" className="btn btn-secondary" onClick={() => setShowTiempoModal(true)}>Ver detalle</button>
                </div>
                <small style={{ color: '#6b7280' }}>Calculado automáticamente desde {reports.length} notificación(es) de trabajo. Máximo sugerido por técnico: {maxHorasSugeridas.toFixed(2)} Hh.</small>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado del equipo</label>
                <select className="form-select" value={form.estado_equipo} onChange={(e) => setForm({ ...form, estado_equipo: e.target.value })}>
                  <option>Operativo</option>
                  <option>Operativo durante mantenimiento</option>
                  <option>Parada de equipo</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">¿Qué tan satisfecho quedó con el servicio?</label>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {['Parada de equipo', 'Insatisfecho', 'Neutral', 'Satisfecho', 'Operativa durante mantto'].map((item) => (
                    <label key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
                      <input type="radio" name="satisfaccion" checked={form.satisfaccion === item} onChange={() => setForm({ ...form, satisfaccion: item })} />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Cargar informe (texto / ruta)</label>
                <input className="form-input" value={form.informe} onChange={(e) => setForm({ ...form, informe: e.target.value })} placeholder="Ej: Informe-OT-2026-03.pdf" />
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '.65rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-secondary" onClick={returnToLiberated}>Devolver a Liberada</button>
          <button type="button" className="btn btn-primary" onClick={submit}>Cerrar OT</button>
        </div>
      </div>

      {showTiempoModal && (
        <ModalTiempoEfectivo
          personalDetalle={personalDetalle}
          tiempoPersonalActual={form.tiempo_personal}
          maxHorasSugeridas={maxHorasSugeridas}
          readOnly
          description="Detalle acumulado por técnico a partir de todas las notificaciones de trabajo registradas para esta OT."
          onClose={() => setShowTiempoModal(false)}
          onSave={() => {}}
        />
      )}
    </div>
  );
}

function ModalOtLiberacion({ alert, rrhhItems, materialesItems, activeAlerts, mode = 'release', onClose, onSubmit }) {
  const [tab, setTab] = useState('registro');
  const [registro, setRegistro] = useState(() => {
    const existingRegistro = alert.registro_ot || {};
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    return {
      fecha_inicio: existingRegistro.fecha_inicio || now.toISOString().slice(0, 10),
      fecha_fin: existingRegistro.fecha_fin || now.toISOString().slice(0, 10),
      hora_inicio: existingRegistro.hora_inicio || hhmm,
      hora_fin: existingRegistro.hora_fin || hhmm,
      turno: existingRegistro.turno || 'Primero',
      observaciones: existingRegistro.observaciones || '',
    };
  });

  const [selectedPersonalId, setSelectedPersonalId] = useState(null);
  const [personalAsignado, setPersonalAsignado] = useState(Array.isArray(alert.personal_detalle) ? alert.personal_detalle : []);

  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [cantidadMaterial, setCantidadMaterial] = useState(1);
  const [materialesAsignados, setMaterialesAsignados] = useState(Array.isArray(alert.materiales_detalle) ? alert.materiales_detalle : []);

  const eligibleRrhh = rrhhItems.filter((item) => ['técnico', 'tecnico', 'encargado'].includes(String(item.cargo || '').toLowerCase()));

  const isEditMode = mode === 'edit';
  const modalTitle = isEditMode ? 'Editar OT liberada' : 'Liberar Orden de Trabajo';
  const submitLabel = isEditMode ? 'Guardar cambios OT' : 'Liberar OT';

  const selectedMaterial = useMemo(
    () => materialesItems.find((it) => String(it.id) === String(selectedMaterialId)) || null,
    [materialesItems, selectedMaterialId],
  );
  const reservedByOthers = useMemo(
    () => buildReservationMap(activeAlerts || [], alert.id),
    [activeAlerts, alert.id],
  );

  const addPersonal = () => {
    const item = eligibleRrhh.find((it) => String(it.id) === String(selectedPersonalId));
    if (!item) return;
    if (personalAsignado.some((p) => p.id === item.id)) return;
    setPersonalAsignado((prev) => [...prev, item]);
  };

  const removePersonal = (id) => {
    setPersonalAsignado((prev) => prev.filter((p) => p.id !== id));
  };

  const addMaterial = () => {
    const item = materialesItems.find((it) => String(it.id) === String(selectedMaterialId));
    const cantidad = Number(cantidadMaterial);
    if (!item || !cantidad || cantidad <= 0) return;
    const reservedByOtherOt = reservedByOthers.get(String(item.id)) || 0;
    const stockDisponible = Math.max((Number(item.stock) || 0) - reservedByOtherOt, 0);

    setMaterialesAsignados((prev) => {
      const existing = prev.find((m) => m.id === item.id);
      const cantidadActual = Number(existing?.cantidad) || 0;
      const nuevaCantidad = cantidadActual + cantidad;
      if (nuevaCantidad > stockDisponible) {
        window.alert(`No puedes asignar ${nuevaCantidad} ${item.unidad || 'UND'} de ${item.codigo}. Stock disponible: ${stockDisponible}.`);
        return prev;
      }
      if (existing) {
        return prev.map((m) => (m.id === item.id ? { ...m, cantidad: nuevaCantidad } : m));
      }
      return [...prev, { ...item, cantidad }];
    });
  };

  const removeMaterial = (id) => {
    setMaterialesAsignados((prev) => prev.filter((m) => m.id !== id));
  };

  const submit = () => {
    if (!personalAsignado.length) {
      window.alert('Debes asignar al menos un técnico en la pestaña Personal.');
      setTab('personal');
      return;
    }

    const materialExcedido = materialesAsignados.find((item) => {
      const reservedByOtherOt = reservedByOthers.get(String(item.id)) || 0;
      const stockDisponible = Math.max((Number(item.stock) || 0) - reservedByOtherOt, 0);
      return (Number(item.cantidad) || 0) > stockDisponible;
    });
    if (materialExcedido) {
      window.alert(`El material ${materialExcedido.codigo} supera el stock disponible. Ajusta la cantidad antes de ${isEditMode ? 'guardar' : 'liberar'} la OT.`);
      setTab('materiales');
      return;
    }

    onSubmit({
      registro,
      personalAsignado,
      materialesAsignados,
    });
  };

  const tabButton = (tabId, label) => (
    <button
      type="button"
      className={`btn ${tab === tabId ? 'btn-primary' : 'btn-secondary'}`}
      style={{ padding: '.45rem .9rem' }}
      onClick={() => setTab(tabId)}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .5)', zIndex: 1300, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(1080px, 100%)', maxHeight: '92vh', overflow: 'auto', background: '#fff', borderRadius: '.65rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: '.8rem', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{modalTitle}</h3>
            <p style={{ color: '#6b7280', fontSize: '.9rem' }}>{alert.codigo} · {alert.descripcion}</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ padding: '.45rem .85rem' }}>Cerrar</button>
        </div>

        <div style={{ padding: '1rem 1.2rem' }}>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {tabButton('registro', 'Registro')}
            {tabButton('personal', 'Personal')}
            {tabButton('materiales', 'Materiales')}
          </div>

          {tab === 'registro' && (
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.7rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Fecha inicio</label><input type="date" className="form-input" value={registro.fecha_inicio} onChange={(e) => setRegistro({ ...registro, fecha_inicio: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Fecha fin</label><input type="date" className="form-input" value={registro.fecha_fin} onChange={(e) => setRegistro({ ...registro, fecha_fin: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Hora inicio</label><input type="time" className="form-input" value={registro.hora_inicio} onChange={(e) => setRegistro({ ...registro, hora_inicio: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Hora fin</label><input type="time" className="form-input" value={registro.hora_fin} onChange={(e) => setRegistro({ ...registro, hora_fin: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Turno</label><select className="form-select" value={registro.turno} onChange={(e) => setRegistro({ ...registro, turno: e.target.value })}><option>Primero</option><option>Segundo</option><option>Tercero</option></select></div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label className="form-label">Observaciones</label><textarea className="form-textarea" value={registro.observaciones} onChange={(e) => setRegistro({ ...registro, observaciones: e.target.value })} /></div>
              </div>
            </div>
          )}

          {tab === 'personal' && (
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.7rem', marginBottom: '.8rem' }}>
                <select className="form-select" value={selectedPersonalId || ''} onChange={(e) => setSelectedPersonalId(e.target.value)}>
                  <option value="">Selecciona técnico...</option>
                  {eligibleRrhh.map((item) => (
                    <option key={item.id} value={item.id}>{item.nombres_apellidos} · {item.cargo || 'N.A.'} ({item.especialidad}){item.tipo_personal === 'Tercero' ? ` · ${item.empresa || 'Tercero'}` : ''}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-primary" onClick={addPersonal}>Agregar</button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      {['Código', 'Nombre', 'Especialidad', 'Tipo', 'Empresa', 'Capacidad (Hh/día)', 'Acción'].map((h) => <th key={h} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {personalAsignado.map((item) => (
                      <tr key={item.id}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.nombres_apellidos}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.especialidad}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.tipo_personal || 'Propio'}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.empresa || 'N.A.'}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.capacidad_hh_dia}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removePersonal(item.id)}>Quitar</button></td>
                      </tr>
                    ))}
                    {!personalAsignado.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '.9rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>Sin técnicos asignados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'materiales' && (
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: '.7rem', marginBottom: '.8rem' }}>
                <select className="form-select" value={selectedMaterialId || ''} onChange={(e) => setSelectedMaterialId(e.target.value)}>
                  <option value="">Selecciona material...</option>
                  {materialesItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.codigo} · {item.descripcion}</option>
                  ))}
                </select>
                <input type="number" min="1" className="form-input" value={cantidadMaterial} onChange={(e) => setCantidadMaterial(e.target.value)} />
                <button type="button" className="btn btn-primary" onClick={addMaterial}>Agregar</button>
              </div>

              <p style={{ color: '#6b7280', fontSize: '.9rem', marginBottom: '.8rem' }}>
                {selectedMaterial
                  ? `Stock fisico: ${Number(selectedMaterial.stock) || 0} ${selectedMaterial.unidad || 'UND'} | Reservado en otras OT: ${reservedByOthers.get(String(selectedMaterial.id)) || 0} | Disponible para esta OT: ${Math.max((Number(selectedMaterial.stock) || 0) - (reservedByOthers.get(String(selectedMaterial.id)) || 0), 0)}`
                  : 'Selecciona un material para visualizar el stock disponible.'}
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      {['Código', 'Descripción', 'Unidad', 'Cantidad', 'Costo unit.', 'Subtotal', 'Acción'].map((h) => <th key={h} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {materialesAsignados.map((item) => (
                      <tr key={item.id}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.descripcion}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.unidad}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.cantidad}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>S/ {Number(item.costo_unit).toFixed(2)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>S/ {(Number(item.cantidad) * Number(item.costo_unit)).toFixed(2)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removeMaterial(item.id)}>Quitar</button></td>
                      </tr>
                    ))}
                    {!materialesAsignados.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '.9rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>Sin materiales agregados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap' }}>
          <div style={{ color: '#374151', fontWeight: 600 }}>OT actual: <span style={{ color: '#111827' }}>{alert.ot_numero || 'OT #?'}</span></div>
          <button type="button" className="btn btn-primary" onClick={submit}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function PmpGestionOt() {
  const [alerts, setAlerts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalMode, setCreateModalMode] = useState('create');
  const [createModalAlert, setCreateModalAlert] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseModalMode, setReleaseModalMode] = useState('release');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [rrhhItems, setRrhhItems] = useState(RRHH_FALLBACK);
  const [materialesItems, setMaterialesItems] = useState(MATERIALES_FALLBACK);
  const [equiposItems, setEquiposItems] = useState([]);
  const [packageItems, setPackageItems] = useState([]);
  const [deletedAlertIds, setDeletedAlertIds] = useState([]);
  const [workReports, setWorkReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [plans, plansKm, equipos, existing, deletedIds, history, rrhhData, materialesData, packagesData, workReportsData] = await Promise.all([
        loadSharedDocument(PLANS_KEY, []),
        loadSharedDocument(KM_PLANS_KEY, []),
        loadSharedDocument(EQUIPOS_KEY, []),
        loadSharedDocument(OT_ALERTS_KEY, []),
        loadSharedDocument(OT_DELETED_KEY, []),
        loadSharedDocument(OT_HISTORY_KEY, []),
        loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
        loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
        loadSharedDocument(PACKAGES_KEY, []),
        loadSharedDocument(OT_WORK_REPORTS_KEY, []),
      ]);
      if (!active) return;
      const deletedSet = new Set((Array.isArray(deletedIds) ? deletedIds : []).map((item) => String(item)));
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const activeExisting = existing.filter((a) => a.status_ot !== 'Cerrada' && !deletedSet.has(String(a.id)));
      const mapExisting = new Map(activeExisting.map((a) => [a.id, a]));
      const closedHistoryIds = new Set(history.map((item) => item.id));

      const dueByDate = plans
        .flatMap((plan) => {
          const eq = equipos.find((e) => (e.codigo || '') === (plan.codigo || ''));
          const dueDates = getDueDatesInWindow(plan, monthStart, monthEnd);
          return dueDates.map((fecha, idx) => {
            const id = `${fecha}_${plan.id}`;
            if (closedHistoryIds.has(id) || deletedSet.has(String(id))) return null;

            const old = mapExisting.get(id);
            return {
              id,
              fecha_ejecutar: fecha,
              codigo: plan.codigo || '',
              descripcion: plan.equipo || '',
              area_trabajo: eq?.area_trabajo || 'N.A.',
              prioridad: plan.prioridad || 'Media',
              actividad: plan.actividades || '',
              responsable: plan.responsable || 'N.A.',
              status_ot: old?.status_ot || (fecha === todayStr ? 'Pendiente' : 'Pendiente'),
              ot_numero: old?.ot_numero || '',
              fecha_ejecucion: old?.fecha_ejecucion || '',
              tipo_mantto: 'Preventivo',
              personal_mantenimiento: old?.personal_mantenimiento || '',
              materiales: old?.materiales || '',
              personal_detalle: old?.personal_detalle || [],
              materiales_detalle: old?.materiales_detalle || [],
              registro_ot: old?.registro_ot || null,
              cierre_ot: old?.cierre_ot || null,
              orden: idx + 1,
            };
          });
        })
        .filter(Boolean)
        .sort(compareOtAlerts);

      const dueByKm = (Array.isArray(plansKm) ? plansKm : [])
        .filter((plan) => plan.codigo && isKmPlanInAlertWindow(plan))
        .map((plan) => {
          const target = Number(plan.proximo_km) || 0;
          const actual = Number(plan.km_actual) || 0;
          const remaining = Math.max(target - actual, 0);
          const id = buildKmAlertId(plan);
          if (closedHistoryIds.has(id) || deletedSet.has(String(id))) return null;

          const eq = equipos.find((e) => (e.codigo || '') === (plan.codigo || ''));
          const old = mapExisting.get(id);
          return {
            id,
            fecha_ejecutar: old?.fecha_ejecutar || todayStr,
            codigo: plan.codigo || '',
            descripcion: plan.equipo || eq?.descripcion || '',
            area_trabajo: eq?.area_trabajo || 'N.A.',
            prioridad: plan.prioridad || 'Media',
            actividad: `${plan.actividades || 'Mantenimiento preventivo por kilometraje'}${target ? `\nObjetivo km: ${target.toLocaleString('es-PE')} | Restantes: ${remaining.toLocaleString('es-PE')}` : ''}`,
            responsable: plan.responsable || 'N.A.',
            status_ot: old?.status_ot || 'Pendiente',
            ot_numero: old?.ot_numero || '',
            fecha_ejecucion: old?.fecha_ejecucion || '',
            tipo_mantto: 'Preventivo por Km',
            personal_mantenimiento: old?.personal_mantenimiento || '',
            materiales: old?.materiales || '',
            personal_detalle: old?.personal_detalle || [],
            materiales_detalle: old?.materiales_detalle || [],
            registro_ot: old?.registro_ot || null,
            cierre_ot: old?.cierre_ot || null,
            plan_km_id: plan.id,
            km_actual: actual,
            km_objetivo: target,
            km_restantes: remaining,
            alerta_km: Number(plan.alerta_km) || 0,
            origen_programacion: 'KM',
          };
        })
        .filter(Boolean)
        .sort(compareOtAlerts);

      const dueAlerts = [...dueByDate, ...dueByKm]
        .sort(compareOtAlerts)
        .map((row, idx) => ({ ...row, orden: idx + 1 }));

      const dueIds = new Set(dueAlerts.map((item) => item.id));
      const carryOver = activeExisting.filter((item) => !dueIds.has(item.id));
      const mergedAlerts = [...carryOver, ...dueAlerts]
        .sort(compareOtAlerts)
        .map((row, idx) => ({ ...row, orden: idx + 1 }));

      setAlerts(mergedAlerts);
      setDeletedAlertIds(Array.from(deletedSet));
      setEquiposItems(Array.isArray(equipos) ? equipos : []);
      setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
      setMaterialesItems(normalizeMaterialsCatalog(materialesData));
      setPackageItems(Array.isArray(packagesData) ? packagesData : []);
      setWorkReports(Array.isArray(workReportsData) ? workReportsData : []);
      setHydrated(true);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSharedDocument(OT_ALERTS_KEY, alerts).catch((err) => {
      console.error('Error guardando OT activas:', err);
      setError('No se pudo guardar la gestión de OT en el servidor.');
    });
  }, [alerts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveSharedDocument(OT_DELETED_KEY, deletedAlertIds).catch((err) => {
      console.error('Error guardando OT eliminadas:', err);
      setError('No se pudo guardar el listado de OT eliminadas en el servidor.');
    });
  }, [deletedAlertIds, hydrated]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => alerts.some((item) => String(item.id) === String(id))));
    if (selectedId && !alerts.some((item) => String(item.id) === String(selectedId))) {
      setSelectedId(null);
    }
  }, [alerts, selectedId]);

  const selected = useMemo(() => alerts.find((a) => a.id === selectedId) || null, [alerts, selectedId]);
  const reportByAlert = useMemo(() => {
    const map = new Map();
    (Array.isArray(workReports) ? workReports : []).forEach((item) => {
      const key = String(item.alertId);
      const rows = map.get(key) || [];
      rows.push(item);
      map.set(key, rows);
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
  const selectedConsistency = useMemo(
    () => (selected ? consistencyByAlert.get(String(selected.id)) || { hasInconsistency: false, count: 0, inconsistentReports: [] } : { hasInconsistency: false, count: 0, inconsistentReports: [] }),
    [selected, consistencyByAlert],
  );
  const inconsistentAlertsCount = useMemo(
    () => alerts.filter((item) => consistencyByAlert.get(String(item.id))?.hasInconsistency).length,
    [alerts, consistencyByAlert],
  );
  const otStats = useMemo(() => ({
    pendientes: alerts.filter((item) => item.status_ot === 'Pendiente').length,
    creadas: alerts.filter((item) => item.status_ot === 'Creada').length,
    liberadas: alerts.filter((item) => item.status_ot === 'Liberada').length,
  }), [alerts]);
  const selectedIdsSet = useMemo(() => new Set(selectedIds.map((item) => String(item))), [selectedIds]);
  const allSelected = alerts.length > 0 && selectedIds.length === alerts.length;
  const canReleaseSelected = Boolean(selected && ['Pendiente', 'Creada'].includes(selected.status_ot));
  const canEditSelected = Boolean(selected && ['Pendiente', 'Creada', 'Liberada', 'Solicitud de cierre'].includes(selected.status_ot));

  const toggleRowSelection = (id) => {
    const key = String(id);
    setSelectedIds((prev) => (
      prev.some((item) => String(item) === key)
        ? prev.filter((item) => String(item) !== key)
        : [...prev, id]
    ));
    setSelectedId(id);
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(alerts.map((item) => item.id));
  };

  const openCreateModal = async () => {
    const [equiposData, packagesData] = await Promise.all([
      loadSharedDocument(EQUIPOS_KEY, []),
      loadSharedDocument(PACKAGES_KEY, []),
    ]);
    setEquiposItems(Array.isArray(equiposData) ? equiposData : []);
    setPackageItems(Array.isArray(packagesData) ? packagesData : []);
    setCreateModalMode('create');
    setCreateModalAlert(null);
    setError('');
    setShowCreateModal(true);
  };

  const confirmCreateOt = (payload) => {
    const baseRow = {
      id: createModalAlert?.id || buildManualOtId(),
      fecha_ejecutar: payload.fecha,
      codigo: payload.codigo,
      descripcion: payload.descripcion,
      area_trabajo: payload.area_trabajo || 'N.A.',
      prioridad: payload.prioridad || 'Media',
      actividad: payload.actividad,
      responsable: payload.responsable || 'N.A.',
      status_ot: createModalAlert?.status_ot || 'Pendiente',
      ot_numero: '',
      fecha_ejecucion: createModalAlert?.fecha_ejecucion || '',
      tipo_mantto: payload.tipo_mantto || 'Correctivo',
      personal_mantenimiento: createModalAlert?.personal_mantenimiento || '',
      materiales: createModalAlert?.materiales || '',
      personal_detalle: createModalAlert?.personal_detalle || [],
      materiales_detalle: createModalAlert?.materiales_detalle || [],
      registro_ot: createModalAlert?.registro_ot || null,
      cierre_ot: createModalAlert?.cierre_ot || null,
      origen_programacion: createModalAlert?.origen_programacion || 'MANUAL',
      plan_km_id: createModalAlert?.plan_km_id,
      km_actual: createModalAlert?.km_actual,
      km_objetivo: createModalAlert?.km_objetivo,
      km_restantes: createModalAlert?.km_restantes,
      alerta_km: createModalAlert?.alerta_km,
      equipo_id: payload.equipo_id || '',
      servicio: payload.servicio || '',
      vc: payload.vc || 'V.C - DIA',
      tiempo_min: Number(payload.tiempo_min) || 0,
      paquete_pm_id: payload.paquete_pm_id || '',
      paquete_pm_nombre: payload.paquete_pm_nombre || '',
    };

    setAlerts((prev) => {
      const nextRows = createModalAlert
        ? prev.map((item) => (item.id === createModalAlert.id ? { ...item, ...baseRow } : item))
        : [baseRow, ...prev];
      return renumberOtRows(nextRows);
    });
    setSelectedId(baseRow.id);
    setCreateModalAlert(null);
    setShowCreateModal(false);
  };

  const handleDeleteOt = async () => {
    const idsToDelete = selectedIds.length
      ? selectedIds.map((item) => String(item))
      : (selected ? [String(selected.id)] : []);

    if (!idsToDelete.length) {
      window.alert('Selecciona al menos una OT para eliminar.');
      return;
    }

    const count = idsToDelete.length;
    if (!window.confirm(`¿Eliminar ${count} OT${count > 1 ? 's' : ''} seleccionada${count > 1 ? 's' : ''}? Esta acción quitará también sus registros de trabajo activos.`)) {
      return;
    }

    try {
      const workReports = await loadSharedDocument(OT_WORK_REPORTS_KEY, []);
      const nextReports = (Array.isArray(workReports) ? workReports : [])
        .filter((item) => !idsToDelete.includes(String(item.alertId)));
      await saveSharedDocument(OT_WORK_REPORTS_KEY, nextReports);
    } catch (err) {
      console.error('Error eliminando reportes OT:', err);
      setError('No se pudieron limpiar los registros de trabajo de las OT eliminadas.');
    }

    setDeletedAlertIds((prev) => Array.from(new Set([...prev.map((item) => String(item)), ...idsToDelete])));
    setAlerts((prev) => renumberOtRows(prev.filter((item) => !idsToDelete.includes(String(item.id)))));
    setSelectedIds([]);
    if (selected && idsToDelete.includes(String(selected.id))) {
      setSelectedId(null);
    }
  };

  const openReleaseModal = async () => {
    if (!selected) return;
    if (selected.status_ot === 'Liberada') {
      window.alert('Una OT liberada ya no puede liberarse nuevamente. Usa Editar OT para modificar sus datos.');
      return;
    }
    if (!['Pendiente', 'Creada'].includes(selected.status_ot)) {
      window.alert('Solo puedes liberar OTs en estado Pendiente o Creada.');
      return;
    }
    const [rrhhData, materialesData] = await Promise.all([
      loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
      loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
    ]);
    setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
    setMaterialesItems(normalizeMaterialsCatalog(materialesData));
    setReleaseModalMode('release');
    setError('');
    setShowReleaseModal(true);
  };

  const openEditCreateModal = async () => {
    if (!selected) return;
    if (!['Pendiente', 'Creada'].includes(selected.status_ot)) {
      window.alert('Solo puedes editar con este formulario una OT en estado Pendiente o Creada.');
      return;
    }
    const [equiposData, packagesData] = await Promise.all([
      loadSharedDocument(EQUIPOS_KEY, []),
      loadSharedDocument(PACKAGES_KEY, []),
    ]);
    setEquiposItems(Array.isArray(equiposData) ? equiposData : []);
    setPackageItems(Array.isArray(packagesData) ? packagesData : []);
    setCreateModalMode('edit');
    setCreateModalAlert(selected);
    setError('');
    setShowCreateModal(true);
  };

  const openEditReleaseModal = async () => {
    if (!selected) return;
    if (!['Liberada', 'Solicitud de cierre'].includes(selected.status_ot)) {
      window.alert('Solo puedes editar una OT que ya este liberada o en solicitud de cierre.');
      return;
    }
    const [rrhhData, materialesData, workReportsData] = await Promise.all([
      loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
      loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
      loadSharedDocument(OT_WORK_REPORTS_KEY, []),
    ]);
    setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
    setMaterialesItems(normalizeMaterialsCatalog(materialesData));
    setWorkReports(Array.isArray(workReportsData) ? workReportsData : []);
    setReleaseModalMode('edit');
    setError('');
    setShowReleaseModal(true);
  };

  const openEditOt = async () => {
    if (!selected) return;
    if (['Liberada', 'Solicitud de cierre'].includes(selected.status_ot)) {
      await openEditReleaseModal();
      return;
    }
    if (['Pendiente', 'Creada'].includes(selected.status_ot)) {
      await openEditCreateModal();
      return;
    }
    window.alert('Solo puedes editar OTs en estado Pendiente, Creada, Liberada o Solicitud de cierre.');
  };

  const confirmRelease = async ({ registro, personalAsignado, materialesAsignados }) => {
    if (!selected) return;

    const todayStr = new Date().toISOString().split('T')[0];
    let nextNumber = selected.ot_numero || '';
    if (!nextNumber) {
      try {
        const releaseYear = Number(String(registro?.fecha_inicio || todayStr).slice(0, 4)) || new Date().getFullYear();
        nextNumber = await allocateNextOtNumber(releaseYear);
        setError('');
      } catch (err) {
        console.error('Error generando correlativo OT:', err);
        setError('No se pudo generar el numero correlativo de la OT. Revisa Configuraciones > Ordenes de Trabajo.');
        return;
      }
    }
    const personalTexto = personalAsignado.map((p) => `${p.codigo} - ${p.nombres_apellidos}`).join(', ');
    const materialesTexto = materialesAsignados.map((m) => `${m.codigo} x${m.cantidad}`).join(', ');

    setAlerts((prev) => prev.map((a) => (a.id === selected.id ? {
      ...a,
      ot_numero: nextNumber,
      status_ot: 'Liberada',
      fecha_ejecucion: a.fecha_ejecucion || todayStr,
      personal_mantenimiento: personalTexto,
      materiales: materialesTexto,
      personal_detalle: personalAsignado,
      materiales_detalle: materialesAsignados,
      registro_ot: registro,
    } : a)));

    setShowReleaseModal(false);
  };

  const handleSaveLiberatedOtChanges = (payload) => {
    if (!selected) return;

    const nextAlerts = alerts.map((item) => {
      if (String(item.id) !== String(selected.id)) return item;
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

    setAlerts(nextAlerts);
    setShowReleaseModal(false);
    setError('');

    const updatedAlert = nextAlerts.find((item) => String(item.id) === String(selected.id));
    const updatedSummary = getAlertConsistencySummary(updatedAlert, reportByAlert.get(String(selected.id)) || []);
    if (updatedSummary.hasInconsistency) {
      window.alert(`La OT fue actualizada, pero todavía mantiene ${updatedSummary.count} inconsistencia(s) de fechas. Revísala antes de cerrar la orden.`);
    } else {
      window.alert('La OT fue actualizada y los registros de trabajo quedaron conformes con el rango liberado.');
    }
  };

  const openCloseModal = async () => {
    if (!selected) return;
    if (selected.status_ot !== 'Solicitud de cierre') {
      window.alert('Solo puedes cerrar una OT que esté en estado Solicitud de cierre.');
      return;
    }
    const workReports = await loadSharedDocument(OT_WORK_REPORTS_KEY, []);
    setWorkReports(Array.isArray(workReports) ? workReports : []);
    const reportsForOt = (Array.isArray(workReports) ? workReports : []).filter((item) => String(item.alertId) === String(selected.id));
    const consistencySummary = getAlertConsistencySummary(selected, reportsForOt);
    if (consistencySummary.hasInconsistency) {
      window.alert(`No puedes cerrar esta OT porque tiene ${consistencySummary.count} inconsistencia(s) entre los registros de trabajo y el rango liberado. Corrige la liberación y revisa que todo quede conforme antes de cerrar.`);
      return;
    }
    setShowCloseModal(true);
  };

  const confirmCloseOt = async (cierreData) => {
    if (!selected) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const [history, workReports, existingNotices] = await Promise.all([
      loadSharedDocument(OT_HISTORY_KEY, []),
      loadSharedDocument(OT_WORK_REPORTS_KEY, []),
      loadSharedDocument(NOTICES_KEY, []),
    ]);
    const reportsForOt = (Array.isArray(workReports) ? workReports : []).filter((item) => String(item.alertId) === String(selected.id));
    const consistencySummary = getAlertConsistencySummary(selected, reportsForOt);
    if (consistencySummary.hasInconsistency) {
      setError(`No se puede cerrar la OT porque tiene ${consistencySummary.count} inconsistencia(s) de fechas en los registros de trabajo.`);
      setShowCloseModal(false);
      return;
    }
    const generatedNotices = Array.isArray(cierreData?.avisos_generados_detalle) && cierreData.avisos_generados_detalle.length
      ? cierreData.avisos_generados_detalle
      : buildMaintenanceNoticesFromReports(selected, reportsForOt, existingNotices, 'Revision de cierre');
    const closedRow = {
      ...selected,
      status_ot: 'Cerrada',
      fecha_ejecucion: selected.fecha_ejecucion || todayStr,
      cierre_ot: cierreData,
      fecha_cierre: todayStr,
      reportes_trabajo: reportsForOt,
      avisos_generados: generatedNotices.map((item) => item.aviso_codigo),
    };

    if (selected.tipo_mantto === 'Preventivo por Km' && selected.plan_km_id) {
      try {
        const plansKm = await loadSharedDocument(KM_PLANS_KEY, []);
        const nextPlansKm = (Array.isArray(plansKm) ? plansKm : []).map((plan) => {
          if (String(plan.id) !== String(selected.plan_km_id)) return plan;
          const intervalo = Number(plan.intervalo_km) || 0;
          const kmBase = Math.max(Number(plan.km_actual) || 0, Number(plan.proximo_km) || 0);
          return {
            ...plan,
            km_ultimo_mantenimiento: kmBase,
            proximo_km: intervalo > 0 ? kmBase + intervalo : Number(plan.proximo_km) || 0,
          };
        });
        await saveSharedDocument(KM_PLANS_KEY, nextPlansKm);
      } catch (err) {
        console.error('Error actualizando ciclo por kilometraje:', err);
        setError('Se cerro la OT, pero no se pudo actualizar el siguiente ciclo por kilometraje.');
      }
    }
    try {
      await Promise.all([
        saveSharedDocument(OT_HISTORY_KEY, [closedRow, ...history]),
        saveSharedDocument(NOTICES_KEY, [...generatedNotices, ...(Array.isArray(existingNotices) ? existingNotices : [])]),
      ]);
      setError('');
    } catch (err) {
      console.error('Error guardando historial OT:', err);
      setError('No se pudo guardar el historial de OT o los avisos de mantenimiento en el servidor.');
      return;
    }

    setAlerts((prev) => prev.filter((a) => a.id !== selected.id));
    setSelectedId(null);
    setShowCloseModal(false);
    openCloseReportPdf(closedRow, reportsForOt);
  };

  const returnOtToLiberated = (reviewData) => {
    if (!selected) return;

    setAlerts((prev) => prev.map((item) => (
      String(item.id) !== String(selected.id)
        ? item
        : {
          ...item,
          status_ot: 'Liberada',
          cierre_ot: {
            ...(item.cierre_ot || {}),
            solicitud_cierre: false,
            devuelta_revision: true,
            devuelta_revision_fecha: new Date().toISOString(),
            devuelta_revision_por: 'Planner/Ingeniero',
            devuelta_revision_observaciones: reviewData?.observaciones || '',
          },
        }
    )));

    setError('');
    setShowCloseModal(false);
    window.alert('La OT volvió a estado Liberada. Ahora los técnicos podrán corregir las notificaciones de trabajo y solicitar cierre nuevamente.');
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
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Gestión de Órdenes de Trabajo</h1>
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Alertas de mantenimiento generadas por planes preventivos por fecha y por kilometraje.
      </p>

      {selected && selectedConsistency.hasInconsistency && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          La OT seleccionada tiene {selectedConsistency.count} inconsistencia(s) entre sus registros de trabajo y el rango liberado. Puedes editar la OT para corregir fechas y horas antes del cierre.
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">OT Pendientes</div>
          <div className="stat-value" style={{ color: '#b45309' }}>{otStats.pendientes}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT Creadas</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{otStats.creadas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT Liberadas</div>
          <div className="stat-value" style={{ color: '#059669' }}>{otStats.liberadas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT con Inconsistencia</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{inconsistentAlertsCount}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={openCreateModal}>Crear una OT</button>
          <button type="button" className="btn btn-secondary" onClick={openReleaseModal} disabled={!canReleaseSelected}>Liberar OT</button>
          <button type="button" className="btn btn-secondary" onClick={openEditOt} disabled={!canEditSelected}>Editar OT</button>
          <button type="button" className="btn btn-danger" onClick={openCloseModal} disabled={!selected}>Cerrar OT</button>
            <button type="button" className="btn btn-danger" onClick={handleDeleteOt} disabled={!selected && !selectedIds.length}>
              {selectedIds.length > 1 ? `Eliminar OT (${selectedIds.length})` : 'Eliminar OT'}
            </button>
          </div>
          <div style={{ fontSize: '.9rem', color: '#6b7280' }}>
            {selectedIds.length ? `${selectedIds.length} OT seleccionada${selectedIds.length > 1 ? 's' : ''} para eliminar.` : 'Marca una o varias OT para eliminarlas.'}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1760px' }}>
          <thead>
            <tr style={{ background: '#0b5c8c', color: '#fff' }}>
              <th style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', width: '56px', textAlign: 'center' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              </th>
              {['Fecha a ejecutar', 'Código', 'Descripción', 'Área de trabajo', 'Prioridad', 'Actividad de mantenimiento', 'PST TBJO Responsable', 'Status de OT', '# OT', 'Fecha de ejecución', 'Tipo de mantto', 'Personal de mantenimiento', 'Materiales - repuestos - insumos'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', fontSize: '.8rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => {
              const rowConsistency = consistencyByAlert.get(String(a.id)) || { hasInconsistency: false, count: 0 };
              return (
              <tr key={a.id} onClick={() => setSelectedId(a.id)} style={{ background: selectedId === a.id ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIdsSet.has(String(a.id))}
                    onChange={() => toggleRowSelection(a.id)}
                  />
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{formatDateDisplay(a.fecha_ejecutar || '', 'N.A.')}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.codigo}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.descripcion}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.area_trabajo}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.prioridad}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.actividad}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.responsable}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>
                  <div>{a.status_ot}</div>
                  {rowConsistency.hasInconsistency && (
                    <div style={{ color: '#dc2626', fontSize: '.78rem', fontWeight: 700 }}>
                      Inconsistencia: {rowConsistency.count}
                    </div>
                  )}
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.ot_numero}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{formatDateDisplay(a.fecha_ejecucion || '', 'N.A.')}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.tipo_mantto}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.personal_mantenimiento}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.materiales}</td>
              </tr>
            )})}
            {!alerts.length && (
              <tr>
                <td colSpan={14} style={{ border: '1px solid #d1d5db', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                  No hay OT activas en este momento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <ModalCrearOt
          initialAlert={createModalAlert}
          equipmentItems={equiposItems}
          packageItems={packageItems}
          mode={createModalMode}
          onClose={() => {
            setShowCreateModal(false);
            setCreateModalAlert(null);
          }}
          onSubmit={confirmCreateOt}
        />
      )}

      {showReleaseModal && selected && releaseModalMode === 'edit' && (
        <EditLiberatedOtModal
          alert={selected}
          rrhhItems={rrhhItems}
          materialsCatalog={materialesItems}
          reports={reportByAlert.get(String(selected.id)) || []}
          onClose={() => setShowReleaseModal(false)}
          onSave={handleSaveLiberatedOtChanges}
        />
      )}

      {showReleaseModal && selected && releaseModalMode !== 'edit' && (
        <ModalOtLiberacion
          alert={selected}
          rrhhItems={rrhhItems}
          materialesItems={materialesItems}
          activeAlerts={alerts}
          mode={releaseModalMode}
          onClose={() => setShowReleaseModal(false)}
          onSubmit={confirmRelease}
        />
      )}

      {showCloseModal && selected && (
        <ModalCerrarOT
          alert={selected}
          reports={reportByAlert.get(String(selected.id)) || []}
          onClose={() => setShowCloseModal(false)}
          onReturnToLiberated={returnOtToLiberated}
          onSubmit={confirmCloseOt}
        />
      )}
    </div>
  );
}
