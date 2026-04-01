import React, { useMemo, useState } from 'react';

// Nota: este archivo debe permanecer sin marcadores de conflicto de merge.
const OT_ALERTS_KEY = 'pmp_ot_alertas_v1';
const OT_WORK_REPORTS_KEY = 'pmp_ot_work_reports_v1';
const RRHH_KEY = 'pmp_rrhh_tecnicos_v1';
const MATERIALES_KEY = 'pmp_materiales_v1';

const RRHH_FALLBACK = [
  { id: 1, codigo: 'MEC-1', nombres_apellidos: 'Manuel de la Cruz Jimenez', especialidad: 'Mecánico' },
  { id: 2, codigo: 'ELE-1', nombres_apellidos: 'Hernan Alauce Alarcón', especialidad: 'Eléctrico' },
];

const MATERIALES_FALLBACK = [
  { id: 1, codigo: 'PRD0000000', descripcion: 'ABRAZADERA 5"', marca: 'N.A.', proveedor: 'N.A.' },
  { id: 2, codigo: 'PRD0000001', descripcion: 'ACEITE 15W40 CAT X 5 GL', marca: 'N.A.', proveedor: 'N.A.' },
];

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

function EditLiberatedOtModal({ alert, onClose, onSave }) {
  const [form, setForm] = useState({
    prioridad: alert.prioridad || '',
    actividad: alert.actividad || '',
    responsable: alert.responsable || '',
    fecha_ejecutar: alert.fecha_ejecutar || '',
    fecha_inicio_prop: alert.registro_ot?.fecha_inicio || '',
    fecha_fin_prop: alert.registro_ot?.fecha_fin || '',
  });

  const handleSubmit = () => {
    if (!form.fecha_inicio_prop || !form.fecha_fin_prop) {
      window.alert('Debes completar fecha inicio y fin propuesta.');
      return;
    }
    if (form.fecha_inicio_prop > form.fecha_fin_prop) {
      window.alert('La fecha inicio propuesta no puede ser mayor que la fecha fin propuesta.');
      return;
    }
    onSave(form);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: '1rem' }}>
      <div className="card" style={{ width: 'min(760px, 95vw)', maxHeight: '90vh', overflow: 'auto', marginBottom: 0 }}>
        <h3 className="card-title" style={{ marginBottom: '.6rem' }}>Editar OT liberada #{alert.ot_numero || 'N.A.'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '.65rem' }}>
          <div><label className="form-label">Prioridad</label><input className="form-input" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} /></div>
          <div><label className="form-label">Responsable</label><input className="form-input" value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label className="form-label">Actividad</label><input className="form-input" value={form.actividad} onChange={(e) => setForm({ ...form, actividad: e.target.value })} /></div>
          <div><label className="form-label">Fecha a ejecutar</label><input className="form-input" type="date" value={form.fecha_ejecutar} onChange={(e) => setForm({ ...form, fecha_ejecutar: e.target.value })} /></div>
          <div />
          <div><label className="form-label">Inicio propuesto OT</label><input className="form-input" type="date" value={form.fecha_inicio_prop} onChange={(e) => setForm({ ...form, fecha_inicio_prop: e.target.value })} /></div>
          <div><label className="form-label">Fin propuesto OT</label><input className="form-input" type="date" value={form.fecha_fin_prop} onChange={(e) => setForm({ ...form, fecha_fin_prop: e.target.value })} /></div>
        </div>
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
  const [fechaInicio, setFechaInicio] = useState(initialReport?.fechaInicio || alert.registro_ot?.fecha_inicio || '');
  const [horaInicio, setHoraInicio] = useState(initialReport?.horaInicio || alert.registro_ot?.hora_inicio || '');
  const [fechaFin, setFechaFin] = useState(initialReport?.fechaFin || alert.registro_ot?.fecha_fin || '');
  const [horaFin, setHoraFin] = useState(initialReport?.horaFin || alert.registro_ot?.hora_fin || '');
  const [showTechPicker, setShowTechPicker] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);

  const addTechFromRrhh = (item) => {
    setTechRows((prev) => {
      const exists = prev.some((row) => String(row.tecnicoId) === String(item.id));
      if (exists) return prev;
      return [...prev, {
        id: `tech_rrhh_${item.id}_${Date.now()}`,
        tecnicoId: item.id,
        tecnico: `${item.codigo} - ${item.nombres_apellidos}`,
        horas: '',
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
    setTechRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
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
    const proposedStart = alert.registro_ot?.fecha_inicio;
    const proposedEnd = alert.registro_ot?.fecha_fin;
    if (proposedStart && proposedEnd && (fechaInicio < proposedStart || fechaFin > proposedEnd)) {
      window.alert(`Las fechas del registro deben estar dentro del rango propuesto de la OT: ${proposedStart} a ${proposedEnd}.`);
      return;
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
      fechaInicio,
      horaInicio,
      fechaFin,
      horaFin,
      totalHoras: Number(tecnicosValidos.reduce((sum, row) => sum + row.horas, 0).toFixed(2)),
    });
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: '1rem' }}>
        <div className="card" style={{ width: 'min(1160px, 98vw)', maxHeight: '95vh', overflow: 'auto', padding: '1rem 1.1rem', marginBottom: 0 }}>
          <h3 className="card-title" style={{ marginBottom: '.35rem' }}>Registrar Trabajo · OT #{alert.ot_numero || 'N.A.'}</h3>
          <p style={{ color: '#6b7280', marginBottom: '.8rem' }}>Selecciona técnicos y materiales desde sus catálogos para mantener consistencia.</p>

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
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}><input className="form-input" type="number" min="0" step="0.25" value={row.horas} onChange={(e) => updateTech(row.id, 'horas', e.target.value)} /></td>
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
            <h4 style={{ marginBottom: '.5rem' }}>Fecha y hora del trabajo</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: '.6rem' }}>
              <div><label className="form-label">Fecha inicio</label><input className="form-input" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></div>
              <div><label className="form-label">Hora inicio</label><input className="form-input" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></div>
              <div><label className="form-label">Fecha fin</label><input className="form-input" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></div>
              <div><label className="form-label">Hora fin</label><input className="form-input" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></div>
            </div>
          </div>

          <div className="card" style={{ padding: '.9rem', marginBottom: '.8rem', background: '#f8fafc' }}>
            <h4 style={{ marginBottom: '.5rem' }}>Observaciones</h4>
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
          itemLabel={(item) => `${item.codigo} · ${item.nombres_apellidos} · ${item.especialidad || 'N.A.'}`}
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
  const [alerts, setAlerts] = useState(() => readJson(OT_ALERTS_KEY, []));
  const [workReports, setWorkReports] = useState(() => readJson(OT_WORK_REPORTS_KEY, []));
  const [rrhhItems, setRrhhItems] = useState(() => readJson(RRHH_KEY, RRHH_FALLBACK));
  const [materialsCatalog, setMaterialsCatalog] = useState(() => readJson(MATERIALES_KEY, MATERIALES_FALLBACK));
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);
  const [showEditOtModal, setShowEditOtModal] = useState(false);
  const [expandedOtIds, setExpandedOtIds] = useState({});
  const [filterArea, setFilterArea] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterEquipment, setFilterEquipment] = useState('');

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
  const editingReport = useMemo(
    () => workReports.find((item) => item.id === editingReportId) || null,
    [workReports, editingReportId],
  );
  const normalizedRole = String(user?.role || '').toUpperCase();
  const canEditLiberatedOt = ['PLANNER', 'ENCARGADO', 'INGENIERO'].includes(normalizedRole);

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

  const areaOptions = useMemo(
    () => Array.from(new Set(liberatedNotifications.map((it) => (it.area || it.area_equipo || 'N.A.')))),
    [liberatedNotifications],
  );

  const filteredNotifications = useMemo(() => liberatedNotifications.filter((item) => {
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
  }), [liberatedNotifications, reportByAlert, filterArea, filterWorker, filterDate, filterEquipment]);

  const saveWorkReport = (payload) => {
    if (!selectedAlert) return;
    const isEditing = !!editingReportId;
    const existingForOt = workReports.filter((item) => String(item.alertId) === String(selectedAlert.id));
    const nextSequence = isEditing
      ? (workReports.find((item) => item.id === editingReportId)?.sequence || (existingForOt.length || 1))
      : (existingForOt.length + 1);
    const reportCode = `NT${nextSequence}-OT${selectedAlert.ot_numero || selectedAlert.id}`;
    const report = {
      id: editingReportId || `work_report_${Date.now()}`,
      alertId: selectedAlert.id,
      otNumero: selectedAlert.ot_numero,
      sequence: nextSequence,
      reportCode,
      createdAt: isEditing
        ? (workReports.find((item) => item.id === editingReportId)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...payload,
    };

    const nextReports = isEditing
      ? workReports.map((item) => (item.id === editingReportId ? report : item))
      : [...workReports, report];
    setWorkReports(nextReports);
    writeJson(OT_WORK_REPORTS_KEY, nextReports);

    const nextAlerts = alerts.map((item) => (String(item.id) === String(selectedAlert.id)
      ? { ...item, cierre_ot: { ...(item.cierre_ot || {}), trabajo_registrado: true, ultima_actualizacion: report.createdAt } }
      : item));
    setAlerts(nextAlerts);
    writeJson(OT_ALERTS_KEY, nextAlerts);

    setShowRegisterModal(false);
    setEditingReportId(null);
    window.alert('Trabajo registrado correctamente.');
  };

  const handleDeleteReport = (reportId) => {
    if (!window.confirm('¿Eliminar este registro de trabajo?')) return;
    const nextReports = workReports.filter((item) => item.id !== reportId);
    setWorkReports(nextReports);
    writeJson(OT_WORK_REPORTS_KEY, nextReports);
  };

  const handleOpenRegister = () => {
    setRrhhItems(readJson(RRHH_KEY, RRHH_FALLBACK));
    setMaterialsCatalog(readJson(MATERIALES_KEY, MATERIALES_FALLBACK));
    setEditingReportId(null);
    setShowRegisterModal(true);
  };

  const handleEditReport = (alertId, reportId) => {
    setSelectedAlertId(alertId);
    setRrhhItems(readJson(RRHH_KEY, RRHH_FALLBACK));
    setMaterialsCatalog(readJson(MATERIALES_KEY, MATERIALES_FALLBACK));
    setEditingReportId(reportId);
    setShowRegisterModal(true);
  };

  const handleSaveOtChanges = (payload) => {
    if (!selectedAlert) return;
    const nextAlerts = alerts.map((item) => {
      if (String(item.id) !== String(selectedAlert.id)) return item;
      return {
        ...item,
        prioridad: payload.prioridad,
        actividad: payload.actividad,
        responsable: payload.responsable,
        fecha_ejecutar: payload.fecha_ejecutar,
        registro_ot: {
          ...(item.registro_ot || {}),
          fecha_inicio: payload.fecha_inicio_prop,
          fecha_fin: payload.fecha_fin_prop,
        },
      };
    });
    setAlerts(nextAlerts);
    writeJson(OT_ALERTS_KEY, nextAlerts);
    setShowEditOtModal(false);
  };

  const toggleOtExpanded = (alertId) => {
    setExpandedOtIds((prev) => ({ ...prev, [alertId]: !prev[alertId] }));
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Notificaciones de Trabajo</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Selecciona una OT liberada y usa <strong>Registrar Trabajo</strong> para cargar horas por técnico, actividades y validación de materiales.
      </p>

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
          disabled={!selectedAlert}
          onClick={handleOpenRegister}
        >
          Registrar Trabajo
        </button>
        {canEditLiberatedOt && selectedAlert && (
          <button type="button" className="btn btn-secondary" onClick={() => setShowEditOtModal(true)}>
            Editar OT liberada
          </button>
        )}
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
            {filteredNotifications.map((item) => {
              const isSelected = String(item.id) === String(selectedAlertId);
              const reportRows = reportByAlert.get(String(item.id)) || [];
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
                  {isExpanded && reportRows.map((report, idx) => (
                    <tr key={report.id} style={{ background: '#f8fafc' }}>
                      <td />
                      <td colSpan={15} style={{ border: '1px solid #e5e7eb', padding: '.5rem .65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div>
                            <strong>Sub-registro #{idx + 1}</strong>{' '}
                            · Código: <strong>{report.reportCode || `NT${idx + 1}-OT${item.ot_numero || item.id}`}</strong>{' '}
                            · Horas: <strong>{report.totalHoras || 0}</strong>{' '}
                            · Técnicos: {report.tecnicos?.length || 0}{' '}
                            · Materiales extra: {report.materialesExtra?.length || 0}{' '}
                            · Inicio: {report.fechaInicio || 'N.A.'} {report.horaInicio || ''}{' '}
                            · Fin: {report.fechaFin || 'N.A.'} {report.horaFin || ''}
                          </div>
                          <div style={{ display: 'flex', gap: '.4rem' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEditReport(item.id, report.id)}>Editar</button>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteReport(report.id)}>Eliminar</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
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

      {showEditOtModal && selectedAlert && (
        <EditLiberatedOtModal
          alert={selectedAlert}
          onClose={() => setShowEditOtModal(false)}
          onSave={handleSaveOtChanges}
        />
      )}
    </div>
  );
}
