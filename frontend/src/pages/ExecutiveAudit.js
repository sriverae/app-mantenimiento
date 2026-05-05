import React, { useEffect, useMemo, useState } from 'react';
import ControlNav from '../components/ControlNav';
import { loadSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { buildAuditOverview } from '../utils/maintenanceExecutive';
import { formatAuditActor, getAuditSeverityStyle } from '../utils/auditLog';

function StatCard({ label, value, color = '#111827' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

export default function ExecutiveAudit() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const auditData = await loadSharedDocument(SHARED_DOCUMENT_KEYS.executiveAudit, []);
      if (!active) return;
      setItems(Array.isArray(auditData) ? auditData : []);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const overview = useMemo(() => buildAuditOverview(items), [items]);
  const moduleOptions = useMemo(() => [...new Set(items.map((item) => item.module).filter(Boolean))], [items]);
  const actionOptions = useMemo(() => [...new Set(items.map((item) => item.action).filter(Boolean))], [items]);
  const severityOptions = useMemo(() => [...new Set(items.map((item) => item.severity).filter(Boolean))], [items]);

  const filteredItems = useMemo(() => items.filter((item) => {
    const matchesModule = !moduleFilter || item.module === moduleFilter;
    const matchesAction = !actionFilter || item.action === actionFilter;
    const matchesSeverity = !severityFilter || item.severity === severityFilter;
    const matchesDate = !dateFilter || String(item.created_at || '').slice(0, 10) === dateFilter;
    const haystack = `${item.title} ${item.description} ${item.entity_type} ${item.entity_id} ${item.actor_name} ${item.module} ${item.action}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.toLowerCase());
    return matchesModule && matchesAction && matchesSeverity && matchesDate && matchesQuery;
  }), [items, moduleFilter, actionFilter, severityFilter, dateFilter, query]);

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
        <h1 style={{ fontSize: '1.95rem', fontWeight: 700, marginBottom: '.35rem' }}>Bitacora ejecutiva</h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Trazabilidad de avisos, liberaciones, devoluciones, cierres y cambios sensibles. Sirve para seguimiento, auditoria interna y reconstruccion rapida de decisiones.
        </p>
      </div>

      <ControlNav activeKey="bitacora" />

      <div className="stats-grid">
        <StatCard label="Eventos registrados" value={overview.total} color="#1d4ed8" />
        <StatCard label="Modulos con actividad" value={overview.byModule.length} color="#475569" />
        <StatCard label="Acciones distintas" value={overview.byAction.length} color="#0f766e" />
        <StatCard label="Severidades" value={overview.bySeverity.length} color="#b45309" />
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div>
            <label className="form-label">Fecha</label>
            <input type="date" className="form-input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Modulo</label>
            <select className="form-select" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
              <option value="">Todos</option>
              {moduleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Accion</label>
            <select className="form-select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">Todas</option>
              {actionOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Severidad</label>
            <select className="form-select" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="">Todas</option>
              {severityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Buscar</label>
            <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="OT, aviso, actor, descripcion, equipo..." />
          </div>
        </div>
      </div>

      <div className="executive-grid-two" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h3 className="card-title">Actividad por modulo</h3>
          <div className="executive-ranked-list">
            {overview.byModule.map((item) => (
              <div key={item.label} className="executive-ranked-row">
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="card-title">Actividad por accion</h3>
          <div className="executive-ranked-list">
            {overview.byAction.slice(0, 10).map((item) => (
              <div key={item.label} className="executive-ranked-row">
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2 className="card-title">Linea de tiempo</h2>
        <div className="executive-timeline-list">
          {filteredItems.length ? filteredItems.map((item) => {
            const tone = getAuditSeverityStyle(item.severity);
            return (
              <div key={item.id} className="audit-row-card">
                <div className="audit-row-marker" style={{ background: tone.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.2rem' }}>
                    <div style={{ display: 'flex', gap: '.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#0f172a' }}>{item.title}</strong>
                      <span style={{ borderRadius: '999px', padding: '.18rem .5rem', background: tone.background, color: tone.color, fontWeight: 800, fontSize: '.76rem' }}>
                        {tone.label}
                      </span>
                    </div>
                    <span style={{ color: '#64748b', fontSize: '.86rem' }}>
                      {new Date(item.created_at).toLocaleString('es-PE')}
                    </span>
                  </div>
                  <div style={{ color: '#475569', lineHeight: 1.65 }}>{item.description || 'Sin detalle.'}</div>
                  <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', color: '#64748b', fontSize: '.84rem', marginTop: '.3rem' }}>
                    <span><strong>Modulo:</strong> {item.module}</span>
                    <span><strong>Accion:</strong> {item.action}</span>
                    <span><strong>Actor:</strong> {formatAuditActor(item)}</span>
                    {!!item.entity_id && <span><strong>ID:</strong> {item.entity_id}</span>}
                  </div>
                  {Array.isArray(item.changes) && item.changes.length > 0 && (
                    <div className="audit-changes-grid">
                      {item.changes.slice(0, 6).map((change) => (
                        <div key={`${item.id}_${change.field}`} className="audit-change-chip">
                          <strong>{change.field}</strong>
                          <span>{String(change.before || 'N.A.')} → {String(change.after || 'N.A.')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }) : (
            <div style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>
              No hay registros de bitacora para ese filtro.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

