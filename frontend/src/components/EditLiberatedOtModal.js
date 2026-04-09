import React, { useEffect, useMemo, useState } from 'react';
import { getAlertConsistencySummary } from '../utils/otConsistency';
import { formatDateDisplay } from '../utils/dateFormat';

const buildFormFromAlert = (alert) => ({
  prioridad: alert?.prioridad || '',
  actividad: alert?.actividad || '',
  responsable: alert?.responsable || '',
  fecha_ejecutar: alert?.fecha_ejecutar || '',
  fecha_inicio_prop: alert?.registro_ot?.fecha_inicio || '',
  fecha_fin_prop: alert?.registro_ot?.fecha_fin || '',
  hora_inicio_prop: alert?.registro_ot?.hora_inicio || '',
  hora_fin_prop: alert?.registro_ot?.hora_fin || '',
  turno: alert?.registro_ot?.turno || 'Primero',
  observaciones: alert?.registro_ot?.observaciones || '',
});

const FIELD_LABELS = {
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

const parseDateTime = (dateValue, timeValue, fallbackTime) => {
  if (!dateValue) return null;
  const normalizedTime = /^\d{2}:\d{2}$/.test(String(timeValue || '').slice(0, 5))
    ? String(timeValue || '').slice(0, 5)
    : fallbackTime;
  const parsed = new Date(`${dateValue}T${normalizedTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function EditLiberatedOtModal({
  alert,
  rrhhItems = [],
  materialsCatalog = [],
  reports = [],
  onClose,
  onSave,
}) {
  const originalForm = useMemo(() => buildFormFromAlert(alert), [alert]);
  const [tab, setTab] = useState('registro');
  const [form, setForm] = useState(originalForm);
  const [personalAsignado, setPersonalAsignado] = useState(alert?.personal_detalle || []);
  const [materialesAsignados, setMaterialesAsignados] = useState(alert?.materiales_detalle || []);
  const [selectedPersonalId, setSelectedPersonalId] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [cantidadMaterial, setCantidadMaterial] = useState(1);

  useEffect(() => {
    setTab('registro');
    setForm(buildFormFromAlert(alert));
    setPersonalAsignado(alert?.personal_detalle || []);
    setMaterialesAsignados(alert?.materiales_detalle || []);
    setSelectedPersonalId('');
    setSelectedMaterialId('');
    setCantidadMaterial(1);
  }, [alert]);

  const eligibleRrhh = useMemo(
    () => rrhhItems.filter((item) => ['tecnico', 'técnico', 'encargado'].includes(String(item.cargo || 'tecnico').toLowerCase())),
    [rrhhItems],
  );

  const previewAlert = useMemo(() => ({
    ...alert,
    prioridad: form.prioridad,
    actividad: form.actividad,
    responsable: form.responsable,
    fecha_ejecutar: form.fecha_ejecutar,
    registro_ot: {
      ...(alert?.registro_ot || {}),
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
    const formatDate = (dateValue) => dateValue.toISOString().slice(0, 10);
    const formatTime = (dateValue) => dateValue.toTimeString().slice(0, 5);
    const formatDateLabel = (dateValue) => formatDateDisplay(formatDate(dateValue), 'N.A.');

    const currentStart = parseDateTime(form.fecha_inicio_prop, form.hora_inicio_prop, '00:00');
    const currentEnd = parseDateTime(form.fecha_fin_prop, form.hora_fin_prop, '23:59');
    const reportRanges = (reports || [])
      .map((report) => ({
        start: parseDateTime(report.fechaInicio, report.horaInicio, '00:00'),
        end: parseDateTime(report.fechaFin, report.horaFin, '23:59'),
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

  const changedFields = useMemo(() => Object.fromEntries(
    Object.keys(FIELD_LABELS).map((fieldName) => [fieldName, String(form[fieldName] || '') !== String(originalForm[fieldName] || '')]),
  ), [form, originalForm]);

  const changedFieldLabels = useMemo(
    () => Object.entries(changedFields)
      .filter(([, changed]) => changed)
      .map(([fieldName]) => FIELD_LABELS[fieldName]),
    [changedFields],
  );

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
        return prev.map((row) => (String(row.id) === String(item.id)
          ? { ...row, cantidad: (Number(row.cantidad) || 0) + cantidad }
          : row));
      }
      return [...prev, { ...item, cantidad }];
    });
  };

  const removeMaterial = (id) => {
    setMaterialesAsignados((prev) => prev.filter((row) => String(row.id) !== String(id)));
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

  const renderLabel = (fieldName, fallbackLabel) => (
    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '.45rem', flexWrap: 'wrap' }}>
      <span>{fallbackLabel}</span>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', display: 'grid', placeItems: 'center', zIndex: 1400, padding: '1rem' }}>
      <div className="card" style={{ width: 'min(1080px, 96vw)', maxHeight: '92vh', overflow: 'auto', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.8rem', marginBottom: '.8rem' }}>
          <h3 className="card-title" style={{ marginBottom: 0 }}>Editar OT liberada #{alert?.ot_numero || 'N.A.'}</h3>
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
                Campos modificados en esta edición: {changedFieldLabels.join(', ')}.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '.65rem' }}>
              <div>
                {renderLabel('prioridad', 'Prioridad')}
                <input className="form-input" style={getInputStyle('prioridad')} value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} />
              </div>
              <div>
                {renderLabel('responsable', 'Responsable')}
                <input className="form-input" style={getInputStyle('responsable')} value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {renderLabel('actividad', 'Actividad')}
                <textarea className="form-textarea" style={getInputStyle('actividad')} value={form.actividad} onChange={(e) => setForm({ ...form, actividad: e.target.value })} />
              </div>
              <div>
                {renderLabel('fecha_ejecutar', 'Fecha a ejecutar')}
                <input className="form-input" style={getInputStyle('fecha_ejecutar')} type="date" value={form.fecha_ejecutar} onChange={(e) => setForm({ ...form, fecha_ejecutar: e.target.value })} />
              </div>
              <div>
                {renderLabel('turno', 'Turno')}
                <select className="form-select" style={getInputStyle('turno')} value={form.turno} onChange={(e) => setForm({ ...form, turno: e.target.value })}>
                  <option>Primero</option>
                  <option>Segundo</option>
                  <option>Tercero</option>
                </select>
              </div>
              <div>
                {renderLabel('fecha_inicio_prop', 'Inicio propuesto OT')}
                <input className="form-input" style={getInputStyle('fecha_inicio_prop')} type="date" value={form.fecha_inicio_prop} onChange={(e) => setForm({ ...form, fecha_inicio_prop: e.target.value })} />
              </div>
              <div>
                {renderLabel('fecha_fin_prop', 'Fin propuesto OT')}
                <input className="form-input" style={getInputStyle('fecha_fin_prop')} type="date" value={form.fecha_fin_prop} onChange={(e) => setForm({ ...form, fecha_fin_prop: e.target.value })} />
              </div>
              <div>
                {renderLabel('hora_inicio_prop', 'Hora inicio')}
                <input className="form-input" style={getInputStyle('hora_inicio_prop')} type="time" value={form.hora_inicio_prop} onChange={(e) => setForm({ ...form, hora_inicio_prop: e.target.value })} />
              </div>
              <div>
                {renderLabel('hora_fin_prop', 'Hora fin')}
                <input className="form-input" style={getInputStyle('hora_fin_prop')} type="time" value={form.hora_fin_prop} onChange={(e) => setForm({ ...form, hora_fin_prop: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {renderLabel('observaciones', 'Observaciones')}
                <textarea className="form-textarea" style={getInputStyle('observaciones')} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {tab === 'personal' && (
          <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.7rem', marginBottom: '.8rem' }}>
              <select className="form-select" value={selectedPersonalId} onChange={(e) => setSelectedPersonalId(e.target.value)}>
                <option value="">Selecciona técnico...</option>
                {eligibleRrhh.map((item) => (
                  <option key={item.id} value={item.id}>{item.codigo} - {item.nombres_apellidos}{item.tipo_personal === 'Tercero' ? ` · ${item.empresa || 'Tercero'}` : ''}</option>
                ))}
              </select>
              <button type="button" className="btn btn-primary" onClick={addPersonal}>Agregar</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#e5e7eb' }}>
                  {['Código', 'Nombre', 'Especialidad', 'Tipo', 'Empresa', 'Acción'].map((h) => <th key={h} style={{ border: '1px solid #d1d5db', padding: '.45rem', textAlign: 'left' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {personalAsignado.map((item) => (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.nombres_apellidos}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.especialidad || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.tipo_personal || 'Propio'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.empresa || 'N.A.'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removePersonal(item.id)}>Quitar</button></td>
                  </tr>
                ))}
                {!personalAsignado.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>Sin técnicos asignados.</td></tr>}
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
