import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { formatDateDisplay, formatDateTimeDisplay } from '../utils/dateFormat';
import { getWorkReportOwnerLabel, isWorkReportOwnedByUser } from '../utils/workReportOwnership';

const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;
const OT_WORK_REPORTS_KEY = SHARED_DOCUMENT_KEYS.otWorkReports;

const getWorkDate = (report) => String(
  report?.fechaInicio
  || report?.fechaFin
  || report?.updatedAt
  || report?.createdAt
  || ''
).slice(0, 10);

const getReportHours = (report) => {
  const directTotal = Number(report?.totalHoras);
  if (Number.isFinite(directTotal) && directTotal > 0) return directTotal;

  const techTotal = (Array.isArray(report?.tecnicos) ? report.tecnicos : [])
    .reduce((sum, item) => sum + (Number(item.horas) || 0), 0);
  return Number(techTotal.toFixed(2));
};

export default function WorkLogs({ user }) {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [workReports, setWorkReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [showCoworkers, setShowCoworkers] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState({});

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const [alertsData, historyData, reportsData] = await Promise.all([
          loadSharedDocument(OT_ALERTS_KEY, []),
          loadSharedDocument(OT_HISTORY_KEY, []),
          loadSharedDocument(OT_WORK_REPORTS_KEY, []),
        ]);
        if (!active) return;
        setAlerts(Array.isArray(alertsData) ? alertsData : []);
        setHistoryRows(Array.isArray(historyData) ? historyData : []);
        setWorkReports(Array.isArray(reportsData) ? reportsData : []);
      } catch (error) {
        console.error('Error cargando registros de trabajo:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => { active = false; };
  }, [user]);

  const periodStart = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  }, [days]);

  const alertsById = useMemo(
    () => new Map(alerts.map((item) => [String(item.id), item])),
    [alerts],
  );
  const historyById = useMemo(
    () => new Map(historyRows.map((item) => [String(item.id), item])),
    [historyRows],
  );
  const historyByOt = useMemo(
    () => new Map(historyRows.map((item) => [String(item.ot_numero || ''), item])),
    [historyRows],
  );

  const normalizedRows = useMemo(() => workReports
    .map((report) => {
      const activeAlert = alertsById.get(String(report.alertId)) || null;
      const closedAlert = historyById.get(String(report.alertId))
        || historyByOt.get(String(report.otNumero || ''))
        || null;
      const linkedOt = activeAlert || closedAlert;
      const workDate = getWorkDate(report);
      const isMine = isWorkReportOwnedByUser(report, user);
      const status = activeAlert?.status_ot || closedAlert?.status_ot || 'Cerrada';
      const ownerLabel = getWorkReportOwnerLabel(report);

      return {
        id: report.id,
        report,
        linkedOt,
        workDate,
        isMine,
        status,
        ownerLabel,
        canOpenOt: isMine && !!activeAlert && activeAlert.status_ot === 'Liberada',
        searchText: `${report.reportCode || ''} ${report.otNumero || ''} ${linkedOt?.codigo || ''} ${linkedOt?.descripcion || ''} ${linkedOt?.actividad || ''} ${ownerLabel} ${report.observaciones || ''}`.toLowerCase(),
      };
    })
    .filter((item) => item.workDate && item.workDate >= periodStart)
    .sort((a, b) => new Date(`${b.workDate}T00:00:00`) - new Date(`${a.workDate}T00:00:00`)), [workReports, alertsById, historyById, historyByOt, user, periodStart]);

  const visibleRows = useMemo(() => normalizedRows.filter((item) => {
    const matchesOwnership = showCoworkers ? !item.isMine : item.isMine;
    const matchesQuery = !query.trim() || item.searchText.includes(query.trim().toLowerCase());
    return matchesOwnership && matchesQuery;
  }), [normalizedRows, showCoworkers, query]);

  const stats = useMemo(() => {
    const totalHours = visibleRows.reduce((sum, item) => sum + getReportHours(item.report), 0);
    const totalOts = new Set(visibleRows.map((item) => item.report.otNumero || item.linkedOt?.id || item.id)).size;
    return {
      totalHours: totalHours.toFixed(2),
      totalReports: visibleRows.length,
      totalOts,
    };
  }, [visibleRows]);

  const groupedRows = useMemo(() => {
    const grouped = {};
    visibleRows.forEach((item) => {
      if (!grouped[item.workDate]) grouped[item.workDate] = [];
      grouped[item.workDate].push(item);
    });
    return grouped;
  }, [visibleRows]);

  const dates = useMemo(
    () => Object.keys(groupedRows).sort((a, b) => b.localeCompare(a)),
    [groupedRows],
  );

  const toggleExpanded = (reportId) => {
    setExpandedIds((prev) => ({ ...prev, [reportId]: !prev[reportId] }));
  };

  const handleOpenOt = (row) => {
    if (!row.canOpenOt || !row.linkedOt?.id) return;
    navigate('/tasks', {
      state: {
        focusAlertId: row.linkedOt.id,
        focusReportId: row.report.id,
      },
    });
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
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>
        Mis Registros de Trabajo
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
        Aqui puedes revisar las notificaciones de trabajo que registraste y, si lo necesitas, consultar en modo solo lectura lo cargado por tus companeros.
      </p>

      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-label">Periodo</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>{days} dias</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT visibles</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>{stats.totalOts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Horas visibles</div>
          <div className="stat-value" style={{ fontSize: '1.5rem', color: '#2563eb' }}>{stats.totalHours}h</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{showCoworkers ? 'Registros de companeros' : 'Mis registros'}</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>{stats.totalReports}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) minmax(240px, 1fr) auto', gap: '1rem', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Mostrar ultimos</label>
            <select className="form-select" value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
              <option value={7}>7 dias</option>
              <option value={15}>15 dias</option>
              <option value={30}>30 dias</option>
              <option value={60}>60 dias</option>
              <option value={90}>90 dias</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Buscar registro</label>
            <input
              className="form-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="OT, codigo, equipo, actividad o autor"
            />
          </div>
          <button
            type="button"
            className={showCoworkers ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={() => setShowCoworkers((prev) => !prev)}
          >
            {showCoworkers ? 'Volver a mis registros' : 'Ver registros de companeros'}
          </button>
        </div>
        <div style={{ marginTop: '.85rem', fontSize: '.9rem', color: '#6b7280' }}>
          {showCoworkers
            ? 'Estas viendo registros hechos por otros tecnicos. Desde aqui solo se revisan en modo lectura.'
            : 'Se muestran tus propios subregistros. Si la OT sigue liberada, puedes entrar a la OT para modificarlos.'}
        </div>
      </div>

      {!visibleRows.length ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            {showCoworkers
              ? 'No hay registros de companeros en este periodo.'
              : 'No tienes notificaciones de trabajo registradas en este periodo.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/tasks')}>
            Ver Notificaciones de Trabajo
          </button>
        </div>
      ) : (
        <div>
          {dates.map((date) => {
            const rows = groupedRows[date] || [];
            const totalHours = rows.reduce((sum, item) => sum + getReportHours(item.report), 0);

            return (
              <div key={date} className="card" style={{ marginBottom: '1.5rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    paddingBottom: '1rem',
                    borderBottom: '2px solid #e5e7eb',
                  }}
                >
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                    {formatDateDisplay(date, 'N.A.')}
                  </h3>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb' }}>
                    {totalHours.toFixed(2)}h
                  </span>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  {rows.map((row) => {
                    const isExpanded = !!expandedIds[row.id];
                    const detailButtonLabel = isExpanded ? 'Ocultar detalle' : 'Ver detalle';

                    return (
                      <div
                        key={row.id}
                        style={{
                          border: '1px solid #e5e7eb',
                          borderRadius: '.75rem',
                          padding: '1rem',
                          background: '#f9fafb',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: '280px', flex: '1 1 460px' }}>
                            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#2563eb' }}>
                                {row.report.reportCode || 'Sin codigo'}
                              </div>
                              <span style={{ padding: '.2rem .55rem', borderRadius: '999px', background: row.isMine ? '#dbeafe' : '#e5e7eb', color: row.isMine ? '#1d4ed8' : '#4b5563', fontSize: '.78rem', fontWeight: 700 }}>
                                {row.isMine ? 'Mio' : 'Companero'}
                              </span>
                              <span style={{ padding: '.2rem .55rem', borderRadius: '999px', background: '#f3f4f6', color: '#374151', fontSize: '.78rem', fontWeight: 700 }}>
                                {row.status}
                              </span>
                            </div>
                            <div style={{ marginTop: '.35rem', color: '#111827', fontWeight: 600 }}>
                              OT {row.report.otNumero || row.linkedOt?.ot_numero || 'N.A.'} · {row.linkedOt?.codigo || 'N.A.'} - {row.linkedOt?.descripcion || 'Sin equipo'}
                            </div>
                            <div style={{ marginTop: '.4rem', display: 'grid', gap: '.22rem', fontSize: '.9rem', color: '#6b7280' }}>
                              <div>Registrado por: <strong>{row.ownerLabel}</strong></div>
                              <div>Inicio: {formatDateTimeDisplay(row.report.fechaInicio || '', row.report.horaInicio || '', 'N.A.')} · Fin: {formatDateTimeDisplay(row.report.fechaFin || '', row.report.horaFin || '', 'N.A.')}</div>
                              <div>Actividad OT: {row.linkedOt?.actividad || 'N.A.'}</div>
                            </div>
                          </div>

                          <div style={{ display: 'grid', justifyItems: 'end', gap: '.45rem', minWidth: '160px' }}>
                            <div style={{ fontWeight: 700, color: '#2563eb', fontSize: '1.1rem' }}>
                              {getReportHours(row.report).toFixed(2)}h
                            </div>
                            <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleExpanded(row.id)}>
                                {detailButtonLabel}
                              </button>
                              {row.canOpenOt && (
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleOpenOt(row)}>
                                  Ver en OT
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: '.9rem', paddingTop: '.85rem', borderTop: '1px solid #e5e7eb', display: 'grid', gap: '.55rem' }}>
                            <div style={{ fontSize: '.9rem', color: '#374151' }}>
                              <strong>Tecnicos:</strong> {(row.report.tecnicos || []).map((item) => `${item.tecnico} (${item.horas} h)`).join(', ') || 'N.A.'}
                            </div>
                            <div style={{ fontSize: '.9rem', color: '#374151' }}>
                              <strong>Observaciones:</strong> {row.report.observaciones || 'N.A.'}
                            </div>
                            <div style={{ fontSize: '.9rem', color: '#374151' }}>
                              <strong>Materiales extra:</strong> {(row.report.materialesExtra || []).map((item) => `${item.codigo || item.descripcion} x${item.cantidad}`).join(', ') || 'N.A.'}
                            </div>
                            <div style={{ fontSize: '.9rem', color: row.canOpenOt ? '#2563eb' : '#6b7280', fontWeight: 600 }}>
                              {row.canOpenOt
                                ? 'Este registro es tuyo y la OT sigue liberada. Puedes entrar a la OT para editarlo.'
                                : row.isMine
                                  ? `Este registro es tuyo, pero la OT ya no permite edicion desde notificaciones porque su estado actual es ${row.status}.`
                                  : 'Este registro pertenece a otro tecnico. Solo se muestra en modo lectura y no redirige a la OT.'}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
