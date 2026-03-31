import React, { useMemo, useState } from 'react';

const OT_ALERTS_KEY = 'pmp_ot_alertas_v1';
const RRHH_KEY = 'pmp_rrhh_tecnicos_v1';
const WORK_NOTIFS_KEY = 'work_notifications_v1';

const readJson = (key, fallback = []) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

function NotificationModal({ alert, rrhhItems, onClose, onSubmit }) {
  const eligible = rrhhItems.filter((item) => ['técnico', 'tecnico', 'encargado'].includes(String(item.cargo || '').toLowerCase()));

  const [form, setForm] = useState({
    titulo: `OT ${alert.codigo} - ${alert.descripcion}`,
    descripcion: alert.actividad || '',
    fecha_inicio: new Date().toISOString().slice(0, 10),
    fecha_fin: new Date().toISOString().slice(0, 10),
    prioridad: alert.prioridad || 'Media',
  });
  const [selectedId, setSelectedId] = useState('');
  const [horas, setHoras] = useState('1');
  const [personal, setPersonal] = useState([]);

  const addPersonal = () => {
    const item = eligible.find((i) => String(i.id) === String(selectedId));
    const hh = Number(horas);
    if (!item || !hh || hh <= 0) return;
    if (personal.some((p) => p.id === item.id)) return;
    setPersonal((prev) => [...prev, { id: item.id, nombre: item.nombres_apellidos, cargo: item.cargo, horas: hh }]);
    setSelectedId('');
    setHoras('1');
  };

  const removePersonal = (id) => setPersonal((prev) => prev.filter((p) => p.id !== id));

  const submit = () => {
    if (!form.titulo.trim()) return window.alert('Ingresa un título para la notificación.');
    if (!personal.length) return window.alert('Agrega al menos un técnico o encargado con horas.');

    onSubmit({
      ...form,
      personal,
      total_horas: personal.reduce((sum, p) => sum + Number(p.horas), 0),
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(980px, 100%)', maxHeight: '92vh', overflow: 'auto', background: '#fff', borderRadius: '.65rem', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Crear notificación de trabajo</h3>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ padding: '1rem 1.2rem' }}>
          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label className="form-label">Título</label><input className="form-input" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label className="form-label">Descripción</label><textarea className="form-textarea" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Fecha inicio</label><input type="date" className="form-input" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Fecha fin</label><input type="date" className="form-input" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Prioridad</label><select className="form-select" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}><option>Alta</option><option>Media</option><option>Baja</option></select></div>
            </div>
          </div>

          <div className="card">
            <h4 className="card-title">Registro de horas del personal</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px auto', gap: '.6rem', marginBottom: '.7rem' }}>
              <select className="form-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">Seleccionar técnico/encargado...</option>
                {eligible.map((item) => <option key={item.id} value={item.id}>{item.nombres_apellidos} ({item.cargo})</option>)}
              </select>
              <input type="number" min="0.25" step="0.25" className="form-input" value={horas} onChange={(e) => setHoras(e.target.value)} />
              <button type="button" className="btn btn-primary" onClick={addPersonal}>Agregar</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'left' }}>Nombre</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'left' }}>Cargo</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'left' }}>Horas</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'left' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {personal.map((p) => (
                  <tr key={p.id}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{p.nombre}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{p.cargo}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{p.horas}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><button type="button" className="btn btn-danger btn-sm" onClick={() => removePersonal(p.id)}>Quitar</button></td>
                  </tr>
                ))}
                {!personal.length && <tr><td colSpan={4} style={{ border: '1px solid #e5e7eb', padding: '.6rem', textAlign: 'center', color: '#6b7280' }}>Sin personal agregado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '.65rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={submit}>Crear notificación</button>
        </div>
      </div>
    </div>
  );
}

export default function WorkNotifications({ user }) {
  const [alerts, setAlerts] = useState(() => readJson(OT_ALERTS_KEY, []));
  const [rrhh] = useState(() => readJson(RRHH_KEY, []));
  const [selectedId, setSelectedId] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const pendingAlerts = useMemo(() => alerts.filter((item) => item.status_ot === 'Pendiente'), [alerts]);
  const selected = pendingAlerts.find((item) => item.id === selectedId) || null;

  const createNotification = (payload) => {
    if (!selected) return;
    const existing = readJson(WORK_NOTIFS_KEY, []);
    const next = [{
      id: `${selected.id}_${Date.now()}`,
      ot_id: selected.id,
      ot_numero: selected.ot_numero || '',
      ...payload,
      created_at: new Date().toISOString(),
    }, ...existing];
    localStorage.setItem(WORK_NOTIFS_KEY, JSON.stringify(next));

    const updatedAlerts = alerts.map((item) => (
      item.id === selected.id
        ? {
          ...item,
          status_ot: 'Creada',
          notificacion_trabajo: {
            titulo: payload.titulo,
            fecha_inicio: payload.fecha_inicio,
            fecha_fin: payload.fecha_fin,
            personal: payload.personal,
            total_horas: payload.total_horas,
          },
        }
        : item
    ));
    setAlerts(updatedAlerts);
    localStorage.setItem(OT_ALERTS_KEY, JSON.stringify(updatedAlerts));

    setSelectedId(null);
    setShowModal(false);
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Notificaciones de Trabajo</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Solo se muestran alertas pendientes de Gestión de OT. Las cerradas ya no aparecen aquí.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-primary" disabled={!selected} onClick={() => setShowModal(true)}>
          Crear una notificación
        </button>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Estado OT', '# OT', 'Código', 'Descripción', 'Prioridad', 'Actividad', 'Responsable', 'Fecha a ejecutar'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f4f75', padding: '.55rem .5rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pendingAlerts.map((item) => (
              <tr key={item.id} onClick={() => setSelectedId(item.id)} style={{ cursor: 'pointer', background: selectedId === item.id ? '#eff6ff' : '#fff' }}>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.status_ot}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.ot_numero || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.codigo}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.descripcion}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.prioridad}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.actividad}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.responsable}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.fecha_ejecutar}</td>
              </tr>
            ))}
            {!pendingAlerts.length && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                  No hay alertas pendientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && selected && (
        <NotificationModal
          alert={selected}
          rrhhItems={rrhh}
          onClose={() => setShowModal(false)}
          onSubmit={createNotification}
        />
      )}
    </div>
  );
}
