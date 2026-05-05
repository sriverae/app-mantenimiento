import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { formatDateDisplay } from '../utils/dateFormat';
import RrhhSectionNav from '../components/RrhhSectionNav';
import {
  buildPersonAttendanceMetrics,
  getAttendanceStatusColor,
  normalizeAttendancePerson,
  normalizeAttendanceRow,
} from '../utils/attendanceMetrics';

const ATTENDANCE_KEY = SHARED_DOCUMENT_KEYS.rrhhAttendance;
const RRHH_KEY = SHARED_DOCUMENT_KEYS.rrhh;
const OT_WORK_REPORTS_KEY = SHARED_DOCUMENT_KEYS.otWorkReports;

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function AttendanceHistory() {
  const [attendance, setAttendance] = useState([]);
  const [people, setPeople] = useState([]);
  const [workReports, setWorkReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const [personFilter, setPersonFilter] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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
      setAttendance((Array.isArray(attendanceData) ? attendanceData : []).map(normalizeAttendanceRow));
      setPeople((Array.isArray(rrhhData) ? rrhhData : []).map(normalizeAttendancePerson));
      setWorkReports(Array.isArray(reportsData) ? reportsData : []);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const metricsMap = useMemo(
    () => buildPersonAttendanceMetrics({ people, attendance, workReports }),
    [people, attendance, workReports],
  );

  const peopleOptions = useMemo(
    () => [...people].sort((a, b) => String(a.nombres_apellidos || '').localeCompare(String(b.nombres_apellidos || ''))),
    [people],
  );

  const ownPeople = useMemo(
    () => peopleOptions.filter((item) => String(item.tipo_personal || '').toLowerCase() !== 'tercero'),
    [peopleOptions],
  );

  const attendanceByPersonDate = useMemo(() => {
    const map = new Map();
    attendance.forEach((item) => {
      if (!item.fecha || !item.personal_id) return;
      map.set(`${item.fecha}__${String(item.personal_id)}`, item);
    });
    return map;
  }, [attendance]);

  const visibleOwnPeople = useMemo(() => {
    const query = personSearch.trim().toLowerCase();
    return ownPeople.filter((person) => {
      if (personFilter && String(person.id) !== String(personFilter)) return false;
      if (!query) return true;
      return [
        person.codigo,
        person.nombres_apellidos,
        person.especialidad,
        person.turno_principal,
        person.empresa,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [ownPeople, personFilter, personSearch]);

  const attendanceTableRows = useMemo(() => {
    const baseDates = [];
    if (dateFilter) {
      baseDates.push(dateFilter);
    } else if (monthFilter) {
      const [year, month] = monthFilter.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const todayKey = new Date().toISOString().slice(0, 10);
      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = `${monthFilter}-${String(day).padStart(2, '0')}`;
        if (monthFilter === todayKey.slice(0, 7) && date > todayKey) break;
        baseDates.push(date);
      }
    } else {
      const dates = new Set(attendance.filter((item) => item.fecha).map((item) => item.fecha));
      baseDates.push(...Array.from(dates).sort());
    }

    const rows = [];
    visibleOwnPeople.forEach((person) => {
      baseDates.forEach((date) => {
        const attendanceRow = attendanceByPersonDate.get(`${date}__${String(person.id)}`) || null;
        const status = attendanceRow?.estado_asistencia || 'Sin registro';
        if (statusFilter && status !== statusFilter) return;
        rows.push({
          person,
          date,
          status,
          shift: attendanceRow?.turno || person.turno_principal || 'N.A.',
          scheduledHours: attendanceRow?.horas_programadas ?? person.capacidad_hh_dia ?? 0,
          attendedHours: attendanceRow?.horas_asistidas ?? 0,
          observations: attendanceRow?.observaciones || '',
          registeredBy: attendanceRow?.registrado_por || '',
        });
      });
    });

    return rows.sort((a, b) => {
      if (a.date !== b.date) return String(b.date).localeCompare(String(a.date));
      return String(a.person.nombres_apellidos || '').localeCompare(String(b.person.nombres_apellidos || ''));
    });
  }, [attendance, attendanceByPersonDate, dateFilter, monthFilter, statusFilter, visibleOwnPeople]);

  const attendanceStatusOptions = useMemo(() => {
    const statuses = new Set(['Sin registro']);
    attendance.forEach((item) => {
      if (String(item.tipo_personal || '').toLowerCase() !== 'tercero') {
        statuses.add(item.estado_asistencia || 'Sin registro');
      }
    });
    return Array.from(statuses).sort();
  }, [attendance]);

  const historyRows = useMemo(() => {
    const rows = [];

    metricsMap.forEach((entry) => {
      const person = entry.person;
      if (String(person.tipo_personal || '').toLowerCase() === 'tercero') return;
      if (personFilter && String(person.id) !== String(personFilter)) return;
      if (personSearch.trim()) {
        const query = personSearch.trim().toLowerCase();
        const matches = [
          person.codigo,
          person.nombres_apellidos,
          person.especialidad,
          person.turno_principal,
          person.empresa,
        ].some((value) => String(value || '').toLowerCase().includes(query));
        if (!matches) return;
      }

      if (dateFilter) {
        const daily = entry.daily.find((item) => item.date === dateFilter);
        if (!daily) return;
        if (monthFilter && !String(daily.date || '').startsWith(monthFilter)) return;

        rows.push({
          mode: 'daily',
          person,
          reviewDate: daily.date,
          label: formatDateDisplay(daily.date),
          status: daily.utilizationStatus,
          hasInconsistency: daily.hasInconsistency,
          actualHours: daily.actualHours,
          capacityHours: daily.capacityHours,
          target85Hours: daily.target85Hours,
          utilizationPct: daily.utilizationPct,
          overtimeHours: daily.overtimeHours,
          inconsistentDays: daily.hasInconsistency ? 1 : 0,
          workedDays: daily.actualHours > 0 ? 1 : 0,
          attendanceStatus: daily.attendance?.estado_asistencia || 'Sin asistencia',
        });
        return;
      }

      entry.monthly.forEach((month) => {
        if (monthFilter && month.monthKey !== monthFilter) return;
        const monthDailyRows = entry.daily.filter((item) => String(item.date || '').startsWith(month.monthKey));
        const reviewDay = monthDailyRows.find((item) => item.hasInconsistency) || monthDailyRows[0] || null;

        rows.push({
          mode: 'monthly',
          person,
          reviewDate: reviewDay?.date || `${month.monthKey}-01`,
          label: month.monthKey,
          status: month.status,
          hasInconsistency: month.inconsistentDays > 0,
          actualHours: month.actualHours,
          capacityHours: month.capacityHours,
          target85Hours: month.target85Hours,
          utilizationPct: month.utilizationPct,
          overtimeHours: month.overtimeHours,
          inconsistentDays: month.inconsistentDays,
          workedDays: month.workedDays,
        });
      });
    });

    return rows.sort((a, b) => {
      if (a.mode !== b.mode) return a.mode === 'daily' ? -1 : 1;
      if (a.reviewDate !== b.reviewDate) return String(b.reviewDate || '').localeCompare(String(a.reviewDate || ''));
      return String(a.person.nombres_apellidos || '').localeCompare(String(b.person.nombres_apellidos || ''));
    });
  }, [metricsMap, monthFilter, dateFilter, personFilter, personSearch]);

  const stats = useMemo(() => ({
    total: historyRows.length,
    compliant: historyRows.filter((item) => item.status === 'Cumple 85%').length,
    low: historyRows.filter((item) => item.status === 'Bajo 85%').length,
    overtime: historyRows.filter((item) => item.status === 'Horas extra').length,
    inconsistent: historyRows.filter((item) => item.hasInconsistency).length,
  }), [historyRows]);

  const clearFilters = () => {
    setDateFilter('');
    setMonthFilter(new Date().toISOString().slice(0, 7));
    setPersonFilter('');
    setPersonSearch('');
    setStatusFilter('');
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
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Historial de asistencia</h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Filtra por fecha, mes o trabajador para revisar el rendimiento real de horas, detectar horas extra y abrir rapidamente el dia que necesita correccion.
        </p>
      </div>

      <RrhhSectionNav />

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card"><div className="stat-label">Registros visibles</div><div className="stat-value">{stats.total}</div></div>
        <div className="stat-card"><div className="stat-label">Cumplen 85%</div><div className="stat-value" style={{ color: '#059669' }}>{stats.compliant}</div></div>
        <div className="stat-card"><div className="stat-label">Bajo 85%</div><div className="stat-value" style={{ color: '#d97706' }}>{stats.low}</div></div>
        <div className="stat-card"><div className="stat-label">Horas extra</div><div className="stat-value" style={{ color: '#b91c1c' }}>{stats.overtime}</div></div>
        <div className="stat-card"><div className="stat-label">Con inconsistencia</div><div className="stat-value" style={{ color: '#dc2626' }}>{stats.inconsistent}</div></div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label className="form-label">Fecha exacta</label>
            <input type="date" className="form-input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Mes</label>
            <input type="month" className="form-input" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Trabajador</label>
            <select className="form-select" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
              <option value="">Todos los trabajadores propios</option>
              {ownPeople.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.codigo} - {item.nombres_apellidos}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Buscador de personal propio</label>
            <input
              type="search"
              className="form-input"
              value={personSearch}
              onChange={(e) => setPersonSearch(e.target.value)}
              placeholder="Codigo, nombre, especialidad..."
            />
          </div>
          <div>
            <label className="form-label">Estado</label>
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos los estados</option>
              {attendanceStatusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
        </div>
        <div style={{ marginTop: '.75rem', color: '#64748b', fontSize: '.88rem', lineHeight: 1.6 }}>
          Si eliges una fecha exacta, la vista cambia a desempeno diario. Si la dejas vacia, veras el resumen mensual del trabajador o de toda la cuadrilla.
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h2 className="card-title" style={{ marginBottom: '.35rem' }}>Base de asistencia de personal propio</h2>
            <p style={{ color: '#6b7280', margin: 0 }}>
              {attendanceTableRows.length} fila(s) visibles segun los filtros activos.
            </p>
          </div>
        </div>

        <div className="executive-table-wrapper">
          <table className="executive-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Codigo</th>
                <th>Personal</th>
                <th>Especialidad</th>
                <th>Turno</th>
                <th>Estado</th>
                <th>Horas prog.</th>
                <th>Horas asist.</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {attendanceTableRows.map((row) => {
                const color = row.status === 'Sin registro' ? '#64748b' : getAttendanceStatusColor(row.status);
                return (
                  <tr key={`${row.person.id}_${row.date}`}>
                    <td>{formatDateDisplay(row.date)}</td>
                    <td>{row.person.codigo || 'N.A.'}</td>
                    <td>{row.person.nombres_apellidos || 'Sin nombre'}</td>
                    <td>{row.person.especialidad || 'N.A.'}</td>
                    <td>{row.shift}</td>
                    <td>
                      <span style={{ borderRadius: '999px', padding: '.18rem .5rem', background: `${color}15`, color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {row.status}
                      </span>
                    </td>
                    <td>{asNumber(row.scheduledHours).toFixed(2)}</td>
                    <td>{asNumber(row.attendedHours).toFixed(2)}</td>
                    <td>{row.observations || 'N.A.'}</td>
                  </tr>
                );
              })}
              {!attendanceTableRows.length && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', color: '#6b7280' }}>No hay asistencia para ese filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: '.8rem' }}>
        {historyRows.length === 0 && (
          <div style={{ color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
            No hay historial para ese filtro.
          </div>
        )}

        {historyRows.map((row) => (
          <div
            key={`${row.person.id}_${row.mode}_${row.label}`}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '.95rem',
              padding: '1rem',
              background: row.hasInconsistency ? '#fff7f7' : '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.person.codigo} - {row.person.nombres_apellidos}</div>
                <div style={{ color: '#64748b', fontSize: '.9rem', marginTop: '.2rem' }}>
                  {row.person.tipo_personal} · {row.person.especialidad} · {row.mode === 'daily' ? row.label : row.label}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span
                  style={{
                    borderRadius: '999px',
                    padding: '.2rem .55rem',
                    background: row.status === 'Cumple 85%' ? '#dcfce7' : row.status === 'Horas extra' ? '#fee2e2' : '#fff7ed',
                    color: row.status === 'Cumple 85%' ? '#166534' : row.status === 'Horas extra' ? '#b91c1c' : '#b45309',
                    fontWeight: 700,
                    fontSize: '.8rem',
                  }}
                >
                  {row.status}
                </span>
                {row.hasInconsistency && (
                  <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: '#fee2e2', color: '#b91c1c', fontWeight: 700, fontSize: '.8rem' }}>
                    {row.inconsistentDays} inconsistencia(s)
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '.55rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: '.85rem' }}>
              <div><strong>Horas reales:</strong> {row.actualHours.toFixed(2)} h</div>
              <div><strong>{row.mode === 'daily' ? 'Capacidad del dia' : 'Capacidad del mes'}:</strong> {row.capacityHours.toFixed(2)} h</div>
              <div><strong>Meta 85%:</strong> {row.target85Hours.toFixed(2)} h</div>
              <div><strong>Utilizacion:</strong> {row.utilizationPct.toFixed(2)}%</div>
              <div><strong>Horas extra:</strong> {row.overtimeHours.toFixed(2)} h</div>
              <div><strong>{row.mode === 'daily' ? 'Estado de asistencia' : 'Dias con trabajo'}:</strong> {row.mode === 'daily' ? row.attendanceStatus : row.workedDays}</div>
            </div>

            <div style={{ marginTop: '.85rem', display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ color: '#6b7280', fontSize: '.88rem' }}>
                {row.hasInconsistency
                  ? 'Hay una desviacion visible en horas o asistencia. Conviene abrir el control diario para corregirla rapido.'
                  : 'Sin desviacion critica detectada para este filtro.'}
              </div>
              <Link
                to={`/rrhh/asistencia?fecha=${row.reviewDate}&personal=${row.person.id}`}
                className="btn btn-secondary"
                style={{ textDecoration: 'none' }}
              >
                Abrir dia a revisar
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
