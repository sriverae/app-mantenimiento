import React, { useEffect, useMemo, useState } from 'react';

const PLANS_KEY = 'pmp_fechas_plans_v1';
const EQUIPOS_KEY = 'pmp_equipos_items_v1';
const OT_ALERTS_KEY = 'pmp_ot_alertas_v1';
const OT_HISTORY_KEY = 'pmp_ot_historial_v1';
const RRHH_KEY = 'pmp_rrhh_tecnicos_v1';
const MATERIALES_KEY = 'pmp_materiales_v1';
const RRHH_FALLBACK = [
  { id: 1, codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', especialidad: 'Mecánico', capacidad_hh_dia: '12.00' },
  { id: 2, codigo: 'ELE-1', nombres_apellidos: 'Hernan Alauce Alarcón', especialidad: 'Eléctrico', capacidad_hh_dia: '12.00' },
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

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const getMarkedDays = (plan, year, month) => {
  const intervalDays = FREQ_TO_DAYS[plan.frecuencia] ?? 30;
  const start = new Date(`${plan.fecha_inicio}T00:00:00`);
  if (Number.isNaN(start.getTime())) return new Set();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const marks = new Set();

  const cursor = new Date(start);
  while (cursor < monthStart) cursor.setDate(cursor.getDate() + intervalDays);
  while (cursor <= monthEnd) {
    if (cursor.getMonth() === month && cursor.getFullYear() === year) marks.add(cursor.getDate());
    cursor.setDate(cursor.getDate() + intervalDays);
  }
  return marks;
};

const buildOtNumber = () => `OT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

function ModalTiempoEfectivo({ personalDetalle, tiempoPersonalActual, onClose, onSave }) {
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

  const submit = () => {
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

function ModalOtLiberacion({ alert, rrhhItems, materialesItems, onClose, onSubmit }) {
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

  const addPersonal = () => {
    const item = rrhhItems.find((it) => String(it.id) === String(selectedPersonalId));
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

    setMaterialesAsignados((prev) => {
      const existing = prev.find((m) => m.id === item.id);
      if (existing) {
        return prev.map((m) => (m.id === item.id ? { ...m, cantidad: m.cantidad + cantidad } : m));
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
                  {rrhhItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.codigo} · {item.nombres_apellidos} ({item.especialidad})</option>
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
  const [alerts, setAlerts] = useState(() => readJson(OT_ALERTS_KEY, []));
  const [selectedId, setSelectedId] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [rrhhItems, setRrhhItems] = useState(() => readJson(RRHH_KEY, RRHH_FALLBACK));
  const [materialesItems, setMaterialesItems] = useState(() => readJson(MATERIALES_KEY, MATERIALES_FALLBACK));

  useEffect(() => {
    const plans = readJson(PLANS_KEY, []);
    const equipos = readJson(EQUIPOS_KEY, []);
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth();
    const year = today.getFullYear();
    const todayStr = today.toISOString().split('T')[0];

    const existing = readJson(OT_ALERTS_KEY, []);
    const mapExisting = new Map(existing.map((a) => [a.id, a]));

    const dueToday = plans
      .filter((plan) => getMarkedDays(plan, year, month).has(day))
      .map((plan, idx) => {
        const eq = equipos.find((e) => (e.codigo || '') === (plan.codigo || ''));
        const id = `${todayStr}_${plan.id}`;
        const old = mapExisting.get(id);
        return {
          id,
          fecha_ejecutar: todayStr,
          codigo: plan.codigo || '',
          descripcion: plan.equipo || '',
          area_trabajo: eq?.area_trabajo || 'N.A.',
          prioridad: plan.prioridad || 'Media',
          actividad: plan.actividades || '',
          responsable: plan.responsable || 'N.A.',
          status_ot: old?.status_ot || 'Pendiente',
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

    setAlerts(dueToday);
  }, []);

  useEffect(() => {
    localStorage.setItem(OT_ALERTS_KEY, JSON.stringify(alerts));
  }, [alerts]);

  const selected = useMemo(() => alerts.find((a) => a.id === selectedId) || null, [alerts, selectedId]);

  const createOt = () => {
    if (!selected) return;
    const nextNumber = buildOtNumber();
    setAlerts((prev) => prev.map((a) => (a.id === selected.id ? { ...a, ot_numero: a.ot_numero || nextNumber, status_ot: a.status_ot === 'Pendiente' ? 'Creada' : a.status_ot } : a)));
  };

  const openReleaseModal = () => {
    if (!selected) return;
    setRrhhItems(readJson(RRHH_KEY, RRHH_FALLBACK));
    setMaterialesItems(readJson(MATERIALES_KEY, MATERIALES_FALLBACK));
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
    if (selected.status_ot !== 'Liberada') {
      window.alert('Solo puedes cerrar una OT que esté en estado Liberada.');
      return;
    }
    setShowCloseModal(true);
  };

  const confirmCloseOt = (cierreData) => {
    if (!selected) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const history = readJson(OT_HISTORY_KEY, []);
    const closedRow = {
      ...selected,
      status_ot: 'Cerrada',
      fecha_ejecucion: selected.fecha_ejecucion || todayStr,
      cierre_ot: cierreData,
      fecha_cierre: todayStr,
    };
    localStorage.setItem(OT_HISTORY_KEY, JSON.stringify([closedRow, ...history]));

    setAlerts((prev) => prev.filter((a) => a.id !== selected.id));
    setSelectedId(null);
    setShowCloseModal(false);
  };

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Gestión de Órdenes de Trabajo</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Alertas del día según Cronograma Anual de Mantenimiento Preventivo.
      </p>

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
