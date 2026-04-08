import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';

const PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlans;
const KM_PLANS_KEY = SHARED_DOCUMENT_KEYS.maintenancePlansKm;
const EQUIPOS_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;
const OT_WORK_REPORTS_KEY = SHARED_DOCUMENT_KEYS.otWorkReports;
const RRHH_KEY = SHARED_DOCUMENT_KEYS.rrhh;
const MATERIALES_KEY = SHARED_DOCUMENT_KEYS.materials;
const RRHH_FALLBACK = [
  { id: 1, codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', cargo: 'Técnico', especialidad: 'Mecánico', capacidad_hh_dia: '12.00' },
  { id: 2, codigo: 'ELE-1', nombres_apellidos: 'Hernan Alauce Alarcón', cargo: 'Encargado', especialidad: 'Eléctrico', capacidad_hh_dia: '12.00' },
];
const MATERIALES_FALLBACK = [
  { id: 1, codigo: 'PRD0000000', descripcion: 'ABRAZADERA 5"', unidad: 'UND', costo_unit: 4 },
  { id: 2, codigo: 'PRD0000001', descripcion: 'ACEITE 15W40 CAT X 5 GL', unidad: 'GLN', costo_unit: 136.67 },
];

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

const buildOtNumber = () => `OT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

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
      <td>${escapeHtml(`${report.fechaInicio || ''} ${report.horaInicio || ''}`.trim())}</td>
      <td>${escapeHtml(`${report.fechaFin || ''} ${report.horaFin || ''}`.trim())}</td>
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
          <div><div class="label">Fecha a ejecutar</div><div class="value">${escapeHtml(alert.fecha_ejecutar || '')}</div></div>
          <div><div class="label">Inicio OT</div><div class="value">${escapeHtml(`${alert.registro_ot?.fecha_inicio || ''} ${alert.registro_ot?.hora_inicio || ''}`.trim())}</div></div>
          <div><div class="label">Fin OT</div><div class="value">${escapeHtml(`${alert.cierre_ot?.fecha_fin || alert.registro_ot?.fecha_fin || ''} ${alert.cierre_ot?.hora_fin || alert.registro_ot?.hora_fin || ''}`.trim())}</div></div>
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

function ModalTiempoEfectivo({ personalDetalle, tiempoPersonalActual, maxHorasSugeridas, onClose, onSave }) {
  const [rows, setRows] = useState(() => {
    const mapActual = new Map((tiempoPersonalActual || []).map((item) => [item.id, item.horas]));
    return (personalDetalle || []).map((item) => ({
      id: item.id,
      nombre: item.nombres_apellidos,
      especialidad: item.especialidad,
      horas: mapActual.get(item.id) ?? 0,
    }));
  });

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
                  <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>Especialidad</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>Horas trabajadas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{row.nombre}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{row.especialidad}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.5rem', width: '180px' }}>
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        max={maxHorasSugeridas}
                        className="form-input"
                        value={row.horas}
                        onChange={(e) => updateHoras(row.id, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={3} style={{ border: '1px solid #e5e7eb', padding: '.8rem', textAlign: 'center', color: '#6b7280' }}>
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
          <div style={{ marginTop: '.35rem', fontSize: '.9rem', color: '#6b7280' }}>
            Sugerencia: máximo por técnico = {Number(maxHorasSugeridas || 0).toFixed(2)} Hh (según hora inicio/fin).
          </div>
        </div>
        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '.65rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={submit}>Guardar tiempo</button>
        </div>
      </div>
    </div>
  );
}

function ModalCerrarOT({ alert, onClose, onSubmit }) {
  const [showTiempoModal, setShowTiempoModal] = useState(false);
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

  const personalDetalle = alert.personal_detalle || [];
  const materialesDetalle = alert.materiales_detalle || [];
  const maxHorasSugeridas = useMemo(() => {
    if (!form.fecha_inicio || !form.fecha_fin || !form.hora_inicio || !form.hora_fin) return 0;
    const inicio = new Date(`${form.fecha_inicio}T${form.hora_inicio}:00`);
    const fin = new Date(`${form.fecha_fin}T${form.hora_fin}:00`);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return 0;
    const diff = (fin.getTime() - inicio.getTime()) / (1000 * 60 * 60);
    return diff > 0 ? Number(diff.toFixed(2)) : 0;
  }, [form.fecha_inicio, form.fecha_fin, form.hora_inicio, form.hora_fin]);

  const submit = () => {
    if (maxHorasSugeridas <= 0) {
      window.alert('La fecha/hora fin debe ser mayor a la fecha/hora inicio para poder cerrar la OT.');
      return;
    }
    if (!form.tiempo_efectivo_hh || Number(form.tiempo_efectivo_hh) <= 0) {
      window.alert('Debes registrar el tiempo efectivo para cerrar la OT.');
      return;
    }
    onSubmit(form);
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

          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tiempo efectivo (Hh)</label>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <input className="form-input" value={form.tiempo_efectivo_hh} readOnly />
                  <button type="button" className="btn btn-secondary" onClick={() => setShowTiempoModal(true)}>Tiempo efectivo</button>
                </div>
                <small style={{ color: '#6b7280' }}>Máximo sugerido por técnico: {maxHorasSugeridas.toFixed(2)} Hh.</small>
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
          <button type="button" className="btn btn-primary" onClick={submit}>Cerrar OT</button>
        </div>
      </div>

      {showTiempoModal && (
        <ModalTiempoEfectivo
          personalDetalle={personalDetalle}
          tiempoPersonalActual={form.tiempo_personal}
          maxHorasSugeridas={maxHorasSugeridas}
          onClose={() => setShowTiempoModal(false)}
          onSave={({ tiempoPersonal, totalHoras }) => {
            setForm((prev) => ({
              ...prev,
              tiempo_personal: tiempoPersonal,
              tiempo_efectivo_hh: totalHoras,
            }));
            setShowTiempoModal(false);
          }}
        />
      )}
    </div>
  );
}

function ModalOtLiberacion({ alert, rrhhItems, materialesItems, activeAlerts, onClose, onSubmit }) {
  const [tab, setTab] = useState('registro');
  const [registro, setRegistro] = useState(() => {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    return {
      fecha_inicio: now.toISOString().slice(0, 10),
      fecha_fin: now.toISOString().slice(0, 10),
      hora_inicio: hhmm,
      hora_fin: hhmm,
      turno: 'Primero',
      observaciones: '',
    };
  });

  const [selectedPersonalId, setSelectedPersonalId] = useState(null);
  const [personalAsignado, setPersonalAsignado] = useState([]);

  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [cantidadMaterial, setCantidadMaterial] = useState(1);
  const [materialesAsignados, setMaterialesAsignados] = useState([]);

  const eligibleRrhh = rrhhItems.filter((item) => ['técnico', 'tecnico', 'encargado'].includes(String(item.cargo || '').toLowerCase()));

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
      window.alert(`El material ${materialExcedido.codigo} supera el stock disponible. Ajusta la cantidad antes de liberar la OT.`);
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
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Liberar Orden de Trabajo</h3>
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
                    <option key={item.id} value={item.id}>{item.nombres_apellidos} · {item.cargo || 'N.A.'} ({item.especialidad})</option>
                  ))}
                </select>
                <button type="button" className="btn btn-primary" onClick={addPersonal}>Agregar</button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      {['Código', 'Nombre', 'Especialidad', 'Capacidad (Hh/día)', 'Acción'].map((h) => <th key={h} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {personalAsignado.map((item) => (
                      <tr key={item.id}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.nombres_apellidos}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.especialidad}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.capacidad_hh_dia}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removePersonal(item.id)}>Quitar</button></td>
                      </tr>
                    ))}
                    {!personalAsignado.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '.9rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>Sin técnicos asignados.</td></tr>}
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
          <button type="button" className="btn btn-primary" onClick={submit}>Liberar OT</button>
        </div>
      </div>
    </div>
  );
}

export default function PmpGestionOt() {
  const [alerts, setAlerts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [rrhhItems, setRrhhItems] = useState(RRHH_FALLBACK);
  const [materialesItems, setMaterialesItems] = useState(MATERIALES_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [plans, plansKm, equipos, existing, history, rrhhData, materialesData] = await Promise.all([
        loadSharedDocument(PLANS_KEY, []),
        loadSharedDocument(KM_PLANS_KEY, []),
        loadSharedDocument(EQUIPOS_KEY, []),
        loadSharedDocument(OT_ALERTS_KEY, []),
        loadSharedDocument(OT_HISTORY_KEY, []),
        loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
        loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
      ]);
      if (!active) return;
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const activeExisting = existing.filter((a) => a.status_ot !== 'Cerrada');
      const mapExisting = new Map(activeExisting.map((a) => [a.id, a]));
      const closedHistoryIds = new Set(history.map((item) => item.id));

      const dueByDate = plans
        .flatMap((plan) => {
          const eq = equipos.find((e) => (e.codigo || '') === (plan.codigo || ''));
          const dueDates = getDueDatesInWindow(plan, monthStart, monthEnd);
          return dueDates.map((fecha, idx) => {
            const id = `${fecha}_${plan.id}`;
            if (closedHistoryIds.has(id)) return null;

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
          if (closedHistoryIds.has(id)) return null;

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
      setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
      setMaterialesItems(Array.isArray(materialesData) && materialesData.length ? materialesData : MATERIALES_FALLBACK);
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

  const selected = useMemo(() => alerts.find((a) => a.id === selectedId) || null, [alerts, selectedId]);
  const otStats = useMemo(() => ({
    pendientes: alerts.filter((item) => item.status_ot === 'Pendiente').length,
    creadas: alerts.filter((item) => item.status_ot === 'Creada').length,
    liberadas: alerts.filter((item) => item.status_ot === 'Liberada').length,
  }), [alerts]);

  const createOt = () => {
    if (!selected) return;
    const nextNumber = buildOtNumber();
    setAlerts((prev) => prev.map((a) => (a.id === selected.id ? { ...a, ot_numero: a.ot_numero || nextNumber, status_ot: a.status_ot === 'Pendiente' ? 'Creada' : a.status_ot } : a)));
  };

  const openReleaseModal = async () => {
    if (!selected) return;
    const [rrhhData, materialesData] = await Promise.all([
      loadSharedDocument(RRHH_KEY, RRHH_FALLBACK),
      loadSharedDocument(MATERIALES_KEY, MATERIALES_FALLBACK),
    ]);
    setRrhhItems(Array.isArray(rrhhData) && rrhhData.length ? rrhhData : RRHH_FALLBACK);
    setMaterialesItems(Array.isArray(materialesData) && materialesData.length ? materialesData : MATERIALES_FALLBACK);
    setShowReleaseModal(true);
  };

  const confirmRelease = ({ registro, personalAsignado, materialesAsignados }) => {
    if (!selected) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const nextNumber = selected.ot_numero || buildOtNumber();
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

  const openCloseModal = () => {
    if (!selected) return;
    if (selected.status_ot !== 'Solicitud de cierre') {
      window.alert('Solo puedes cerrar una OT que esté en estado Solicitud de cierre.');
      return;
    }
    setShowCloseModal(true);
  };

  const confirmCloseOt = async (cierreData) => {
    if (!selected) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const history = await loadSharedDocument(OT_HISTORY_KEY, []);
    const workReports = await loadSharedDocument(OT_WORK_REPORTS_KEY, []);
    const reportsForOt = (Array.isArray(workReports) ? workReports : []).filter((item) => String(item.alertId) === String(selected.id));
    const closedRow = {
      ...selected,
      status_ot: 'Cerrada',
      fecha_ejecucion: selected.fecha_ejecucion || todayStr,
      cierre_ot: cierreData,
      fecha_cierre: todayStr,
      reportes_trabajo: reportsForOt,
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
      await saveSharedDocument(OT_HISTORY_KEY, [closedRow, ...history]);
      setError('');
    } catch (err) {
      console.error('Error guardando historial OT:', err);
      setError('No se pudo guardar el historial de OT en el servidor.');
    }

    setAlerts((prev) => prev.filter((a) => a.id !== selected.id));
    setSelectedId(null);
    setShowCloseModal(false);
    openCloseReportPdf(closedRow, reportsForOt);
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
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={createOt} disabled={!selected}>Crear una OT</button>
          <button type="button" className="btn btn-secondary" onClick={openReleaseModal} disabled={!selected}>Liberar OT</button>
          <button type="button" className="btn btn-danger" onClick={openCloseModal} disabled={!selected}>Cerrar OT</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1700px' }}>
          <thead>
            <tr style={{ background: '#0b5c8c', color: '#fff' }}>
              {['Fecha a ejecutar', 'Código', 'Descripción', 'Área de trabajo', 'Prioridad', 'Actividad de mantenimiento', 'PST TBJO Responsable', 'Status de OT', '# OT', 'Fecha de ejecución', 'Tipo de mantto', 'Personal de mantenimiento', 'Materiales - repuestos - insumos'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', fontSize: '.8rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} onClick={() => setSelectedId(a.id)} style={{ background: selectedId === a.id ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.fecha_ejecutar}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.codigo}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.descripcion}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.area_trabajo}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.prioridad}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.actividad}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.responsable}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.status_ot}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.ot_numero}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.fecha_ejecucion}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.tipo_mantto}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.personal_mantenimiento}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{a.materiales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showReleaseModal && selected && (
        <ModalOtLiberacion
          alert={selected}
          rrhhItems={rrhhItems}
          materialesItems={materialesItems}
          activeAlerts={alerts}
          onClose={() => setShowReleaseModal(false)}
          onSubmit={confirmRelease}
        />
      )}

      {showCloseModal && selected && (
        <ModalCerrarOT
          alert={selected}
          onClose={() => setShowCloseModal(false)}
          onSubmit={confirmCloseOt}
        />
      )}
    </div>
  );
}
