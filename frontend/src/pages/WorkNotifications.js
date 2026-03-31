import React, { useMemo, useState } from 'react';

// Nota: este archivo debe permanecer sin marcadores de conflicto de merge.
const OT_ALERTS_KEY = 'pmp_ot_alertas_v1';
const OT_WORK_REPORTS_KEY = 'pmp_ot_work_reports_v1';

const readJson = (key, fallback = []) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const createEmptyTechRow = () => ({ id: `tech_${Date.now()}_${Math.random()}`, tecnico: '', horas: '', actividades: '' });
const createExtraMaterialRow = () => ({ id: `extra_${Date.now()}_${Math.random()}`, codigo: '', descripcion: '', cantidad: '' });

function RegisterWorkModal({ alert, onClose, onSave }) {
  const initialTechs = (alert.personal_mantenimiento || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, idx) => ({ id: `tech_${idx}_${name}`, tecnico: name, horas: '', actividades: '' }));

  const [techRows, setTechRows] = useState(initialTechs.length ? initialTechs : [createEmptyTechRow()]);
  const [materialsRows, setMaterialsRows] = useState(
    (alert.materiales_detalle || []).map((item, idx) => ({
      id: `mat_${idx}_${item.id || item.codigo || 'x'}`,
      codigo: item.codigo || '',
      descripcion: item.descripcion || '',
      cantidadPlanificada: Number(item.cantidad) || 0,
      cantidadConfirmada: Number(item.cantidad) || 0,
      confirmada: true,
    })),
  );
  const [extraMaterials, setExtraMaterials] = useState([]);
  const [observaciones, setObservaciones] = useState('');

  const updateTech = (id, field, value) => {
    setTechRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const updateMaterial = (id, field, value) => {
    setMaterialsRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const updateExtraMaterial = (id, field, value) => {
    setExtraMaterials((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const handleSubmit = () => {
    const tecnicosValidos = techRows
      .map((row) => ({
        tecnico: row.tecnico.trim(),
        horas: Number(row.horas) || 0,
        actividades: row.actividades.trim(),
      }))
      .filter((row) => row.tecnico && row.horas > 0);

    if (!tecnicosValidos.length) {
      window.alert('Debes registrar al menos un técnico con horas trabajadas.');
      return;
    }

    const materialesConfirmados = materialsRows.map((row) => ({
      codigo: row.codigo,
      descripcion: row.descripcion,
      cantidadPlanificada: row.cantidadPlanificada,
      cantidadConfirmada: Number(row.cantidadConfirmada) || 0,
      confirmada: !!row.confirmada,
    }));

    const materialesExtra = extraMaterials
      .map((row) => ({
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
      totalHoras: Number(tecnicosValidos.reduce((sum, row) => sum + row.horas, 0).toFixed(2)),
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 'min(1120px, 96vw)', maxHeight: '92vh', overflow: 'auto', padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Registrar Trabajo · OT #{alert.ot_numero || 'N.A.'}</h3>

        <section style={{ marginBottom: '1rem' }}>
          <h4 style={{ marginBottom: '.5rem' }}>Horas y actividades por técnico</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Técnico</th>
                <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Horas</th>
                <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Actividades realizadas</th>
              </tr>
            </thead>
            <tbody>
              {techRows.map((row) => (
                <tr key={row.id}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>
                    <input value={row.tecnico} onChange={(e) => updateTech(row.id, 'tecnico', e.target.value)} style={{ width: '100%' }} />
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>
                    <input type="number" min="0" step="0.25" value={row.horas} onChange={(e) => updateTech(row.id, 'horas', e.target.value)} style={{ width: '100%' }} />
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>
                    <input value={row.actividades} onChange={(e) => updateTech(row.id, 'actividades', e.target.value)} style={{ width: '100%' }} placeholder="Ej: ajuste de motor, cambio de sello..." />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-secondary" style={{ marginTop: '.5rem' }} onClick={() => setTechRows((prev) => [...prev, createEmptyTechRow()])}>
            + Agregar técnico
          </button>
        </section>

        <section style={{ marginBottom: '1rem' }}>
          <h4 style={{ marginBottom: '.5rem' }}>Confirmar materiales asignados</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
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
                  <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>
                    <input type="number" min="0" value={row.cantidadConfirmada} onChange={(e) => updateMaterial(row.id, 'cantidadConfirmada', e.target.value)} style={{ width: '100%' }} />
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}>
                    <input type="checkbox" checked={row.confirmada} onChange={(e) => updateMaterial(row.id, 'confirmada', e.target.checked)} />
                  </td>
                </tr>
              ))}
              {!materialsRows.length && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>No hay materiales asignados en la OT.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section style={{ marginBottom: '1rem' }}>
          <h4 style={{ marginBottom: '.5rem' }}>Agregar materiales adicionales</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Código</th>
                <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Descripción</th>
                <th style={{ border: '1px solid #d1d5db', padding: '.45rem' }}>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {extraMaterials.map((row) => (
                <tr key={row.id}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input value={row.codigo} onChange={(e) => updateExtraMaterial(row.id, 'codigo', e.target.value)} style={{ width: '100%' }} /></td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input value={row.descripcion} onChange={(e) => updateExtraMaterial(row.id, 'descripcion', e.target.value)} style={{ width: '100%' }} /></td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input type="number" min="0" value={row.cantidad} onChange={(e) => updateExtraMaterial(row.id, 'cantidad', e.target.value)} style={{ width: '100%' }} /></td>
                </tr>
              ))}
              {!extraMaterials.length && (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#6b7280', border: '1px solid #e5e7eb', padding: '.7rem' }}>Sin materiales adicionales.</td></tr>
              )}
            </tbody>
          </table>
          <button type="button" className="btn btn-secondary" style={{ marginTop: '.5rem' }} onClick={() => setExtraMaterials((prev) => [...prev, createExtraMaterialRow()])}>
            + Agregar material
          </button>
        </section>

        <section style={{ marginBottom: '1rem' }}>
          <h4 style={{ marginBottom: '.5rem' }}>Observaciones</h4>
          <textarea rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} style={{ width: '100%' }} placeholder="Notas finales del trabajo ejecutado" />
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>Guardar registro</button>
        </div>
      </div>
    </div>
  );
}

export default function WorkNotifications() {
  const [alerts, setAlerts] = useState(() => readJson(OT_ALERTS_KEY, []));
  const [workReports, setWorkReports] = useState(() => readJson(OT_WORK_REPORTS_KEY, []));
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const liberatedNotifications = useMemo(
    () => alerts
      .filter((item) => item.status_ot === 'Liberada')
      .sort((a, b) => new Date(b.fecha_ejecutar || 0) - new Date(a.fecha_ejecutar || 0)),
    [alerts],
  );

  const selectedAlert = useMemo(
    () => liberatedNotifications.find((item) => String(item.id) === String(selectedAlertId)) || null,
    [liberatedNotifications, selectedAlertId],
  );

  const reportByAlert = useMemo(() => {
    const map = new Map();
    workReports.forEach((item) => map.set(String(item.alertId), item));
    return map;
  }, [workReports]);

  const saveWorkReport = (payload) => {
    if (!selectedAlert) return;
    const report = {
      id: `work_report_${Date.now()}`,
      alertId: selectedAlert.id,
      otNumero: selectedAlert.ot_numero,
      createdAt: new Date().toISOString(),
      ...payload,
    };

    const nextReports = [...workReports.filter((item) => String(item.alertId) !== String(selectedAlert.id)), report];
    setWorkReports(nextReports);
    writeJson(OT_WORK_REPORTS_KEY, nextReports);

    const nextAlerts = alerts.map((item) => (String(item.id) === String(selectedAlert.id)
      ? { ...item, cierre_ot: { ...(item.cierre_ot || {}), trabajo_registrado: true, ultima_actualizacion: report.createdAt } }
      : item));
    setAlerts(nextAlerts);
    writeJson(OT_ALERTS_KEY, nextAlerts);

    setShowRegisterModal(false);
    window.alert('Trabajo registrado correctamente.');
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Notificaciones de Trabajo</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Selecciona una OT liberada y usa <strong>Registrar Trabajo</strong> para cargar horas por técnico, actividades y validación de materiales.
      </p>

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!selectedAlert}
          onClick={() => setShowRegisterModal(true)}
        >
          Registrar Trabajo
        </button>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1720px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Sel.', 'Registro', 'Estado OT', '# OT', 'Código', 'Descripción', 'Prioridad', 'Actividad', 'Responsable', 'Fecha a ejecutar', 'Fecha inicio', 'Hora inicio', 'Fecha fin', 'Hora fin', 'Personal asignado', 'Materiales asignados'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f4f75', padding: '.55rem .5rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {liberatedNotifications.map((item) => {
              const isSelected = String(item.id) === String(selectedAlertId);
              const hasReport = reportByAlert.has(String(item.id));
              return (
                <tr key={item.id} style={{ background: isSelected ? '#eff6ff' : 'transparent' }} onClick={() => setSelectedAlertId(item.id)}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem', textAlign: 'center' }}>
                    <input type="radio" checked={isSelected} onChange={() => setSelectedAlertId(item.id)} />
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{hasReport ? '✅ Registrado' : 'Pendiente'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.status_ot}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.ot_numero || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.codigo}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.descripcion}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.prioridad || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.actividad || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.responsable || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.fecha_ejecutar || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.fecha_inicio || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.hora_inicio || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.fecha_fin || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.hora_fin || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.personal_mantenimiento || 'N.A.'}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.materiales || 'N.A.'}</td>
                </tr>
              );
            })}
            {!liberatedNotifications.length && (
              <tr>
                <td colSpan={16} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                  No hay notificaciones de trabajo liberadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showRegisterModal && selectedAlert && (
        <RegisterWorkModal
          alert={selectedAlert}
          onClose={() => setShowRegisterModal(false)}
          onSave={saveWorkReport}
        />
      )}
       main
    </div>
  );
}
