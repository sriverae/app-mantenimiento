import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import {
  buildPendingOtFromNotice,
  getNoticeDateLabel,
  getNoticeStatusColor,
  getNoticeStatusLabel,
  summarizeNoticeForDisplay,
} from '../utils/maintenanceNotices';
import { formatIsoTimestampDisplay } from '../utils/dateFormat';

const NOTICES_KEY = SHARED_DOCUMENT_KEYS.maintenanceNotices;
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;

const sortNotices = (items) => [...(Array.isArray(items) ? items : [])]
  .sort((a, b) => new Date(b.created_at || b.fecha_aviso || 0) - new Date(a.created_at || a.fecha_aviso || 0));

export default function PmpMaintenanceNotices() {
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [noticesData, alertsData] = await Promise.all([
        loadSharedDocument(NOTICES_KEY, []),
        loadSharedDocument(OT_ALERTS_KEY, []),
      ]);
      if (!active) return;
      const nextItems = sortNotices(noticesData);
      setItems(nextItems);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      setSelectedId(nextItems[0]?.id ?? null);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const persist = async (nextItems, nextAlerts = alerts) => {
    const orderedNotices = sortNotices(nextItems);
    setItems(orderedNotices);
    setAlerts(nextAlerts);
    try {
      await Promise.all([
        saveSharedDocument(NOTICES_KEY, orderedNotices),
        saveSharedDocument(OT_ALERTS_KEY, nextAlerts),
      ]);
      setError('');
    } catch (err) {
      console.error('Error guardando avisos:', err);
      setError('No se pudieron guardar los cambios de avisos de mantenimiento.');
    }
  };

  const filtered = useMemo(() => items.filter((item) => {
    const matchesStatus = statusFilter === 'TODOS' || item.status === statusFilter;
    const haystack = `${item.aviso_codigo} ${item.source_ot_numero} ${item.codigo} ${item.descripcion} ${item.categoria} ${item.detalle} ${item.sugerencia_texto}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.toLowerCase());
    return matchesStatus && matchesQuery;
  }), [items, query, statusFilter]);

  const selected = useMemo(
    () => filtered.find((item) => String(item.id) === String(selectedId)) || items.find((item) => String(item.id) === String(selectedId)) || null,
    [filtered, items, selectedId],
  );

  const stats = useMemo(() => ({
    pendientes: items.filter((item) => item.status === 'Pendiente').length,
    aceptados: items.filter((item) => item.status === 'Aceptado').length,
    rechazados: items.filter((item) => item.status === 'Rechazado').length,
  }), [items]);

  const acceptNotice = async () => {
    if (!selected || selected.status !== 'Pendiente') return;
    const linkedOt = alerts.find((item) => String(item.aviso_id) === String(selected.id));
    if (linkedOt) {
      window.alert('Este aviso ya genero una OT pendiente anteriormente.');
      return;
    }

    const pendingOt = buildPendingOtFromNotice(selected);
    const nextAlerts = [pendingOt, ...alerts];
    const nextItems = items.map((item) => (
      String(item.id) !== String(selected.id)
        ? item
        : {
          ...item,
          status: 'Aceptado',
          accepted_at: new Date().toISOString(),
          accepted_ot_id: pendingOt.id,
          accepted_ot_number: pendingOt.ot_numero || '',
        }
    ));

    await persist(nextItems, nextAlerts);
    setSuccess(`Aviso ${selected.aviso_codigo} aceptado y convertido en OT pendiente.`);
  };

  const rejectNotice = async () => {
    if (!selected || selected.status !== 'Pendiente') return;
    const reason = window.prompt('Motivo del rechazo del aviso:', selected.rejection_reason || '');
    if (reason === null) return;
    const nextItems = items.map((item) => (
      String(item.id) !== String(selected.id)
        ? item
        : {
          ...item,
          status: 'Rechazado',
          rejected_at: new Date().toISOString(),
          rejection_reason: reason.trim(),
        }
    ));
    await persist(nextItems);
    setSuccess(`Aviso ${selected.aviso_codigo} rechazado.`);
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
      <h1 style={{ fontSize: '1.95rem', fontWeight: 700, marginBottom: '.35rem' }}>Avisos de Mantenimiento</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Revisa las sugerencias levantadas por los tecnicos al cerrar una OT y decide si deben convertirse en nuevas ordenes pendientes.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">Avisos pendientes</div>
          <div className="stat-value" style={{ color: '#b45309' }}>{stats.pendientes}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Aceptados</div>
          <div className="stat-value" style={{ color: '#059669' }}>{stats.aceptados}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rechazados</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{stats.rechazados}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(180px, 220px)', gap: '.75rem' }}>
          <div>
            <label className="form-label">Buscar aviso</label>
            <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Codigo, OT origen, equipo o detalle" />
          </div>
          <div>
            <label className="form-label">Estado</label>
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Aceptado">Aceptado</option>
              <option value="Rechazado">Rechazado</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, .8fr)', gap: '1rem' }}>
        <div className="card" style={{ marginBottom: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '1180px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0b5c8c', color: '#fff' }}>
                {['Aviso', 'OT origen', 'Fecha aviso', 'Equipo', 'Categoria', 'Detalle', 'Estado', 'Creado'].map((header) => (
                  <th key={header} style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', textAlign: 'left', fontSize: '.82rem' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  style={{ background: String(selectedId) === String(item.id) ? '#dbeafe' : '#fff', cursor: 'pointer' }}
                >
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem', fontWeight: 700 }}>{item.aviso_codigo}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{item.source_ot_numero || 'N.A.'}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{getNoticeDateLabel(item)}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{item.codigo} - {item.descripcion}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{item.categoria || 'Aviso tecnico'}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{item.detalle || item.sugerencia_texto || 'N.A.'}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem', color: getNoticeStatusColor(item.status), fontWeight: 700 }}>{getNoticeStatusLabel(item.status)}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{formatIsoTimestampDisplay(item.created_at)}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={8} style={{ border: '1px solid #d1d5db', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                    No hay avisos de mantenimiento para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <h3 className="card-title">Detalle del aviso</h3>
          {selected ? (
            <div style={{ display: 'grid', gap: '.8rem' }}>
              <div style={{ padding: '.9rem 1rem', borderRadius: '.9rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.2rem' }}>Aviso</div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{selected.aviso_codigo}</div>
              </div>
              <div style={{ padding: '.9rem 1rem', borderRadius: '.9rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: '.2rem' }}>Resumen</div>
                <div style={{ color: '#0f172a', lineHeight: 1.6 }}>{summarizeNoticeForDisplay(selected)}</div>
              </div>
              <div style={{ fontSize: '.92rem', color: '#374151', lineHeight: 1.7 }}>
                <div><strong>OT origen:</strong> {selected.source_ot_numero || 'N.A.'}</div>
                <div><strong>Equipo:</strong> {selected.codigo || 'N.A.'} - {selected.descripcion || 'N.A.'}</div>
                <div><strong>Area:</strong> {selected.area_trabajo || 'N.A.'}</div>
                <div><strong>Notificacion:</strong> {selected.source_report_code || 'N.A.'}</div>
                <div><strong>Fecha aviso:</strong> {getNoticeDateLabel(selected)}</div>
                <div><strong>Rango reportado:</strong> {selected.rango_notificacion || 'N.A.'}</div>
                <div><strong>Estado:</strong> <span style={{ color: getNoticeStatusColor(selected.status), fontWeight: 700 }}>{getNoticeStatusLabel(selected.status)}</span></div>
                <div><strong>Creado:</strong> {formatIsoTimestampDisplay(selected.created_at)}</div>
                <div><strong>Texto sugerido:</strong> {selected.sugerencia_texto || 'N.A.'}</div>
                <div><strong>Detalle tecnico:</strong> {selected.detalle || 'N.A.'}</div>
                {selected.accepted_at && <div><strong>Aceptado:</strong> {formatIsoTimestampDisplay(selected.accepted_at)}</div>}
                {selected.accepted_ot_id && <div><strong>OT creada:</strong> {selected.accepted_ot_id}</div>}
                {selected.rejected_at && <div><strong>Rechazado:</strong> {formatIsoTimestampDisplay(selected.rejected_at)}</div>}
                {selected.rejection_reason && <div><strong>Motivo rechazo:</strong> {selected.rejection_reason}</div>}
              </div>

              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" disabled={selected.status !== 'Pendiente'} onClick={acceptNotice}>
                  Aceptar aviso
                </button>
                <button type="button" className="btn btn-danger" disabled={selected.status !== 'Pendiente'} onClick={rejectNotice}>
                  Rechazar aviso
                </button>
              </div>
            </div>
          ) : (
            <div style={{ color: '#6b7280' }}>Selecciona un aviso para revisar su detalle.</div>
          )}
        </div>
      </div>
    </div>
  );
}
