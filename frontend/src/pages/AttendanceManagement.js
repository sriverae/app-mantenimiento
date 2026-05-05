import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { formatDateDisplay } from '../utils/dateFormat';
import RrhhSectionNav from '../components/RrhhSectionNav';
import {
  buildPersonAttendanceMetrics,
  getAttendanceStatusColor,
  normalizeAttendancePerson,
  normalizeAttendanceRow,
} from '../utils/attendanceMetrics';
import { isReadOnlyRole } from '../utils/roleAccess';
import { calculateScheduleHours, formatWorkSchedule } from '../utils/workSchedule';
import {
  firstValidationError,
  validateNonNegativeFields,
  validateRequiredFields,
  validateTextFields,
} from '../utils/formValidation';

const ATTENDANCE_KEY = SHARED_DOCUMENT_KEYS.rrhhAttendance;
const RRHH_KEY = SHARED_DOCUMENT_KEYS.rrhh;
const OT_WORK_REPORTS_KEY = SHARED_DOCUMENT_KEYS.otWorkReports;

const ATTENDANCE_STATUS = [
  'Asistencia total',
  'Asistencia parcial',
  'Descanso medico',
  'Vacaciones',
  'Suspension',
  'Falta',
  'Permiso',
];

const EMPTY_FORM = {
  fecha: new Date().toISOString().slice(0, 10),
  personal_id: '',
  estado_asistencia: 'Asistencia total',
  turno: '',
  horas_programadas: '12',
  horas_asistidas: '12',
  observaciones: '',
};

export default function AttendanceManagement() {
  const { user, hasMinRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [attendance, setAttendance] = useState([]);
  const [people, setPeople] = useState([]);
  const [workReports, setWorkReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canManageAttendance = hasMinRole('PLANNER');
  const isReadOnly = isReadOnlyRole(user) || !canManageAttendance;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [attendanceData, rrhhData, reportsData] = await Promise.all([
        loadSharedDocument(ATTENDANCE_KEY, []),
        loadSharedDocument(RRHH_KEY, []),
        loadSharedDocument(OT_WORK_REPORTS_KEY, []),
      ]);
      if (!active) return;
      const nextAttendance = (Array.isArray(attendanceData) ? attendanceData : []).map(normalizeAttendanceRow);
      const nextPeople = (Array.isArray(rrhhData) ? rrhhData : []).map(normalizeAttendancePerson);
      setAttendance(nextAttendance);
      setPeople(nextPeople);
      setWorkReports(Array.isArray(reportsData) ? reportsData : []);
      setSelectedId(nextAttendance[0]?.id ?? null);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const nextDate = searchParams.get('fecha');
    const nextPerson = searchParams.get('personal');

    if (nextDate) {
      setFilterDate(nextDate);
      setForm((prev) => ({ ...prev, fecha: nextDate }));
    }
    if (nextPerson) {
      setSelectedId(nextPerson);
      setForm((prev) => ({ ...prev, personal_id: nextPerson }));
    }
  }, [searchParams]);

  const persist = async (nextItems) => {
    if (!canManageAttendance) return;
    setAttendance(nextItems);
    try {
      await saveSharedDocument(ATTENDANCE_KEY, nextItems);
      setError('');
    } catch (err) {
      console.error('Error guardando asistencia:', err);
      setError('No se pudo guardar la asistencia en el servidor.');
    }
  };

  const filteredPeople = useMemo(
    () => people.filter((item) => `${item.codigo} ${item.nombres_apellidos} ${item.especialidad} ${item.tipo_personal} ${item.empresa}`.toLowerCase().includes(query.toLowerCase())),
    [people, query],
  );

  const personMetricsMap = useMemo(
    () => buildPersonAttendanceMetrics({ people, attendance, workReports }),
    [people, attendance, workReports],
  );

  const attendanceByDate = useMemo(
    () => attendance.filter((item) => item.fecha === filterDate),
    [attendance, filterDate],
  );

  const attendanceByPersonId = useMemo(
    () => new Map(attendanceByDate.map((item) => [String(item.personal_id), item])),
    [attendanceByDate],
  );

  const getProgrammedHours = (person) => {
    const scheduled = calculateScheduleHours(person);
    return scheduled > 0 ? scheduled : Number(person?.disponibilidad_diaria_horas || person?.capacidad_hh_dia || 12);
  };

  const visibleRows = useMemo(() => filteredPeople.map((person) => {
    const row = attendanceByPersonId.get(String(person.id)) || null;
    const metrics = personMetricsMap.get(String(person.id));
    const dailyMetrics = metrics?.daily?.find((item) => item.date === filterDate) || null;
    return { person, attendance: row, dailyMetrics };
  }), [filteredPeople, attendanceByPersonId, personMetricsMap, filterDate]);

  const stats = useMemo(() => {
    const total = people.length;
    const entries = attendanceByDate.length;
    const totalAttendance = attendanceByDate.filter((item) => item.estado_asistencia === 'Asistencia total').length;
    const partial = attendanceByDate.filter((item) => item.estado_asistencia === 'Asistencia parcial').length;
    const unavailable = attendanceByDate.filter((item) => ['Descanso medico', 'Vacaciones', 'Suspension', 'Falta'].includes(item.estado_asistencia)).length;
    const inconsistencies = visibleRows.filter((item) => item.dailyMetrics?.hasInconsistency).length;
    return {
      total,
      entries,
      pending: Math.max(total - entries, 0),
      totalAttendance,
      partial,
      unavailable,
      inconsistencies,
    };
  }, [attendanceByDate, people.length, visibleRows]);

  const selectedAttendance = useMemo(() => {
    if (!selectedId) return null;
    return attendanceByDate.find((item) => (
      String(item.id) === String(selectedId)
      || String(item.personal_id) === String(selectedId)
    )) || attendance.find((item) => String(item.id) === String(selectedId)) || null;
  }, [attendanceByDate, attendance, selectedId]);

  const updateSearchParams = (nextDate, nextPerson) => {
    const params = new URLSearchParams(searchParams);
    if (nextDate) {
      params.set('fecha', nextDate);
    } else {
      params.delete('fecha');
    }
    if (nextPerson) {
      params.set('personal', String(nextPerson));
    } else {
      params.delete('personal');
    }
    setSearchParams(params);
  };

  const beginCreateForPerson = (person) => {
    if (!canManageAttendance) return;
    const programmedHours = getProgrammedHours(person).toFixed(2);
    setSelectedId(String(person.id));
    setEditingId(null);
    setForm({
      fecha: filterDate,
      personal_id: String(person.id),
      estado_asistencia: 'Asistencia total',
      turno: formatWorkSchedule(person),
      horas_programadas: programmedHours,
      horas_asistidas: programmedHours,
      observaciones: '',
    });
    updateSearchParams(filterDate, person.id);
  };

  const beginEdit = (row) => {
    if (!canManageAttendance || !row) return;
    setSelectedId(row.id);
    setEditingId(row.id);
    setForm({
      fecha: row.fecha,
      personal_id: String(row.personal_id),
      estado_asistencia: row.estado_asistencia,
      turno: row.turno || '',
      horas_programadas: String(row.horas_programadas || 0),
      horas_asistidas: String(row.horas_asistidas || 0),
      observaciones: row.observaciones || '',
    });
    updateSearchParams(row.fecha, row.personal_id);
  };

  const resetForm = () => {
    setEditingId(null);
    setSelectedId(null);
    setForm({ ...EMPTY_FORM, fecha: filterDate });
    updateSearchParams(filterDate, null);
  };

  const handleDelete = async () => {
    if (!canManageAttendance || !selectedAttendance) return;
    if (!window.confirm(`Eliminar asistencia de ${selectedAttendance.personal_nombre} para ${formatDateDisplay(selectedAttendance.fecha)}?`)) return;
    const nextItems = attendance.filter((item) => String(item.id) !== String(selectedAttendance.id));
    await persist(nextItems);
    setSelectedId(nextItems[0]?.id ?? null);
    setEditingId(null);
    setForm({ ...EMPTY_FORM, fecha: filterDate });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManageAttendance) return;

    const person = people.find((item) => String(item.id) === String(form.personal_id));
    if (!person) {
      window.alert('Selecciona un trabajador para registrar la asistencia.');
      return;
    }
    const validationError = firstValidationError(
      validateRequiredFields([
        ['Fecha', form.fecha],
        ['Estado de asistencia', form.estado_asistencia],
        ['Horas programadas', form.horas_programadas],
        ['Horas asistidas', form.horas_asistidas],
      ]),
      validateNonNegativeFields([
        ['Horas programadas', form.horas_programadas],
        ['Horas asistidas', form.horas_asistidas],
      ]),
      validateTextFields([
        ['Turno', form.turno],
        ['Observaciones', form.observaciones],
      ]),
    );
    if (validationError) {
      window.alert(validationError);
      return;
    }

    const horasProgramadas = Math.max(0, Number(form.horas_programadas || getProgrammedHours(person) || 0));
    let horasAsistidas = Math.max(0, Number(form.horas_asistidas || 0));

    if (form.estado_asistencia === 'Asistencia total') {
      horasAsistidas = horasProgramadas;
    }
    if (['Descanso medico', 'Vacaciones', 'Suspension', 'Falta'].includes(form.estado_asistencia)) {
      horasAsistidas = 0;
    }
    const payload = normalizeAttendanceRow({
      id: editingId || `${form.fecha}_${person.id}`,
      fecha: form.fecha,
      personal_id: String(person.id),
      personal_codigo: person.codigo,
      personal_nombre: person.nombres_apellidos,
      tipo_personal: person.tipo_personal,
      empresa: person.empresa,
      estado_asistencia: form.estado_asistencia,
      turno: form.turno || formatWorkSchedule(person),
      horas_programadas: horasProgramadas,
      horas_asistidas: horasAsistidas,
      observaciones: String(form.observaciones || '').trim(),
      registrado_por: user?.full_name || user?.username || 'Planner/Ingeniero',
      registrado_at: new Date().toISOString(),
    });

    const duplicate = attendance.find((item) => (
      String(item.personal_id) === String(payload.personal_id)
      && item.fecha === payload.fecha
      && String(item.id) !== String(editingId)
    ));
    if (duplicate) {
      window.alert('Ya existe una asistencia registrada para este trabajador en la fecha seleccionada. Edita la existente.');
      return;
    }

    const nextItems = editingId
      ? attendance.map((item) => (String(item.id) === String(editingId) ? payload : item))
      : [payload, ...attendance];

    await persist(nextItems);
    setSelectedId(payload.id);
    setEditingId(null);
    setForm({ ...EMPTY_FORM, fecha: filterDate });
    updateSearchParams(filterDate, payload.personal_id);
  };

  const selectedFormPerson = useMemo(
    () => people.find((item) => String(item.id) === String(form.personal_id)) || null,
    [people, form.personal_id],
  );
  const selectedFormSchedule = selectedFormPerson ? formatWorkSchedule(selectedFormPerson) : '';

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Asistencia de personal</h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Registra la presencia diaria del personal propio y tercero para que el planner y el ingeniero controlen disponibilidad real, cumplimiento del 85% e inconsistencias de horas.
        </p>
      </div>

      <RrhhSectionNav />

      {isReadOnly && (
        <ReadOnlyAccessNotice message="Puedes revisar asistencia e inconsistencias de horas, pero solo planner o ingeniero pueden registrar, editar o eliminar asistencia." />
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">Personal total</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Asistencia registrada</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{stats.entries}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pendiente por marcar</div>
          <div className="stat-value" style={{ color: '#b45309' }}>{stats.pending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Asistencia total</div>
          <div className="stat-value" style={{ color: '#059669' }}>{stats.totalAttendance}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Parcial</div>
          <div className="stat-value" style={{ color: '#d97706' }}>{stats.partial}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">No disponibles</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{stats.unavailable}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Inconsistencias HH</div>
          <div className="stat-value" style={{ color: '#b91c1c' }}>{stats.inconsistencies}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
          <div>
            <label className="form-label">Fecha de control</label>
            <input
              type="date"
              className="form-input"
              value={filterDate}
              onChange={(e) => {
                setFilterDate(e.target.value);
                setForm((prev) => ({ ...prev, fecha: e.target.value }));
                updateSearchParams(e.target.value, form.personal_id || null);
              }}
            />
          </div>
          <div>
            <label className="form-label">Buscar personal</label>
            <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Codigo, nombre, empresa o especialidad" />
          </div>
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'flex-end' }}>
            <Link to="/rrhh/asistencia/historial" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
              Ver historial de asistencia
            </Link>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.8rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '.85rem' }}>
          <div>
            <h2 className="card-title" style={{ marginBottom: '.25rem' }}>Control diario</h2>
            <p style={{ color: '#6b7280', margin: 0 }}>
              Marca asistencia total, parcial o incidencias del dia. Si las horas reales de notificaciones superan la disponibilidad diaria, el sistema lo marca como inconsistencia para correccion.
            </p>
          </div>
          <div style={{ color: '#334155', fontSize: '.9rem' }}>
            Fecha activa: <strong>{formatDateDisplay(filterDate)}</strong>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '.75rem' }}>
          {visibleRows.map(({ person, attendance: row, dailyMetrics }) => (
            <div
              key={person.id}
              style={{
                border: dailyMetrics?.hasInconsistency ? '1px solid #fca5a5' : '1px solid #e5e7eb',
                borderRadius: '.9rem',
                padding: '.9rem 1rem',
                background: dailyMetrics?.hasInconsistency ? '#fff7f7' : (String(selectedId) === String(row?.id || person.id) ? '#eff6ff' : '#fff'),
              }}
              onClick={() => setSelectedId(row?.id || person.id)}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.8rem', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.2rem' }}>
                    <strong>{person.codigo} - {person.nombres_apellidos}</strong>
                    <span style={{ borderRadius: '999px', padding: '.15rem .5rem', background: '#f1f5f9', color: '#334155', fontSize: '.78rem', fontWeight: 700 }}>
                      {person.tipo_personal}
                    </span>
                    {person.tipo_personal === 'Tercero' && (
                      <span style={{ color: '#64748b', fontSize: '.85rem' }}>{person.empresa}</span>
                    )}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '.9rem' }}>
                    {person.especialidad} - Horario: {formatWorkSchedule(person)}
                  </div>
                  {dailyMetrics && (
                    <div style={{ marginTop: '.45rem', display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                      <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: dailyMetrics.hasInconsistency ? '#fee2e2' : '#eff6ff', color: dailyMetrics.hasInconsistency ? '#b91c1c' : '#2563eb', fontWeight: 700, fontSize: '.78rem' }}>
                        Real: {dailyMetrics.actualHours.toFixed(2)} h
                      </span>
                      <span style={{ color: '#475569', fontSize: '.88rem' }}>
                        Meta 85%: {dailyMetrics.target85Hours.toFixed(2)} h · Utilizacion: {dailyMetrics.utilizationPct.toFixed(2)}%
                      </span>
                      <span style={{ color: dailyMetrics.hasInconsistency ? '#b91c1c' : (dailyMetrics.utilizationStatus === 'Cumple 85%' ? '#166534' : '#b45309'), fontSize: '.84rem', fontWeight: 700 }}>
                        {dailyMetrics.utilizationStatus}
                      </span>
                    </div>
                  )}
                  {row ? (
                    <div style={{ marginTop: '.45rem', display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          borderRadius: '999px',
                          padding: '.2rem .55rem',
                          background: `${getAttendanceStatusColor(row.estado_asistencia)}15`,
                          color: getAttendanceStatusColor(row.estado_asistencia),
                          fontWeight: 700,
                          fontSize: '.78rem',
                        }}
                      >
                        {row.estado_asistencia}
                      </span>
                      <span style={{ color: '#475569', fontSize: '.88rem' }}>
                        Asistidas: {Number(row.horas_asistidas || 0).toFixed(2)} / Programadas: {Number(row.horas_programadas || 0).toFixed(2)} h
                      </span>
                      <span style={{ color: '#64748b', fontSize: '.82rem' }}>
                        Registrado por {row.registrado_por || 'N.A.'}
                      </span>
                    </div>
                  ) : (
                    <div style={{ marginTop: '.45rem', color: '#b45309', fontWeight: 700, fontSize: '.9rem' }}>
                      Sin asistencia marcada para este dia.
                    </div>
                  )}
                  {dailyMetrics?.hasInconsistency && (
                    <div style={{ marginTop: '.5rem', color: '#b91c1c', fontWeight: 700, fontSize: '.88rem' }}>
                      Inconsistencia: {dailyMetrics.overtimeHours > 0 ? `horas trabajadas superan la disponibilidad diaria por ${dailyMetrics.overtimeHours.toFixed(2)} h` : ''}
                      {dailyMetrics.overtimeHours > 0 && dailyMetrics.attendanceMismatchHours > 0 ? ' · ' : ''}
                      {dailyMetrics.attendanceMismatchHours > 0 ? `horas reales superan la asistencia marcada por ${dailyMetrics.attendanceMismatchHours.toFixed(2)} h` : ''}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {canManageAttendance ? (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => beginCreateForPerson(person)}>
                        {row ? 'Reemplazar' : 'Marcar'}
                      </button>
                      {row && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => beginEdit(row)}>
                          Editar
                        </button>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#64748b', fontSize: '.85rem', fontWeight: 700 }}>
                      Solo lectura
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '.8rem' }}>{editingId ? 'Editar asistencia' : 'Registrar asistencia'}</h2>
        {isReadOnly && (
          <div style={{ marginBottom: '.9rem', padding: '.85rem 1rem', borderRadius: '.85rem', border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', lineHeight: 1.65 }}>
            Puedes usar esta vista para revisar las horas reales e inconsistencias, pero el registro y la correccion de asistencia diaria quedan reservados para planner e ingeniero.
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fecha *</label>
            <input type="date" className="form-input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required disabled={isReadOnly} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
            <label className="form-label">Personal *</label>
            <select
              className="form-select"
              value={form.personal_id}
              onChange={(e) => {
                const nextPerson = people.find((item) => String(item.id) === String(e.target.value));
                const programmedHours = nextPerson ? getProgrammedHours(nextPerson).toFixed(2) : form.horas_programadas;
                setForm({
                  ...form,
                  personal_id: e.target.value,
                  turno: nextPerson ? formatWorkSchedule(nextPerson) : '',
                  horas_programadas: programmedHours,
                  horas_asistidas: form.estado_asistencia === 'Asistencia total' ? programmedHours : form.horas_asistidas,
                });
              }}
              required
              disabled={isReadOnly}
            >
              <option value="">Selecciona trabajador...</option>
              {people.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.codigo} - {item.nombres_apellidos} ({item.tipo_personal})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Estado *</label>
            <select
              className="form-select"
              value={form.estado_asistencia}
              onChange={(e) => setForm({
                ...form,
                estado_asistencia: e.target.value,
                horas_asistidas: e.target.value === 'Asistencia total'
                  ? form.horas_programadas
                  : (['Descanso medico', 'Vacaciones', 'Suspension', 'Falta'].includes(e.target.value) ? '0' : form.horas_asistidas),
              })}
              disabled={isReadOnly}
            >
              {ATTENDANCE_STATUS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          {selectedFormSchedule && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Horario RRHH</label>
              <input className="form-input" value={selectedFormSchedule} readOnly />
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Horas programadas</label>
            <input
              type="number"
              min="0"
              step="0.25"
              className="form-input"
              value={form.horas_programadas}
              onChange={(e) => setForm({
                ...form,
                horas_programadas: e.target.value,
                horas_asistidas: form.estado_asistencia === 'Asistencia total' ? e.target.value : form.horas_asistidas,
              })}
              disabled={isReadOnly}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Horas asistidas</label>
            <input type="number" min="0" step="0.25" className="form-input" value={form.horas_asistidas} onChange={(e) => setForm({ ...form, horas_asistidas: e.target.value })} disabled={isReadOnly} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Observaciones</label>
            <textarea className="form-textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Ej: ingreso tarde por traslado, descansa por evaluacion medica, apoyo parcial de contratista, etc." disabled={isReadOnly} />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', gap: '.65rem', flexWrap: 'wrap' }}>
            <div style={{ color: '#6b7280', fontSize: '.9rem', alignSelf: 'center' }}>
              Usa este registro como base para planificar asignaciones reales del dia y detectar cuadrillas incompletas.
            </div>
            <div style={{ display: 'flex', gap: '.6rem' }}>
              {canManageAttendance && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={resetForm}>
                    Limpiar
                  </button>
                  <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Registrar asistencia'}</button>
                </>
              )}
            </div>
          </div>
        </form>

        {selectedAttendance && canManageAttendance && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: '.8rem', flexWrap: 'wrap' }}>
            <div style={{ color: '#475569', fontSize: '.92rem' }}>
              Ultimo registro seleccionado: <strong>{selectedAttendance.personal_nombre}</strong> · {selectedAttendance.estado_asistencia} · {formatDateDisplay(selectedAttendance.fecha)}
            </div>
            <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete}>
              Eliminar registro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
