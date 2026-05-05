import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ControlNav from '../components/ControlNav';
import { loadSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { buildControlCenterData } from '../utils/maintenanceExecutive';
import { getAuditSeverityStyle } from '../utils/auditLog';

function StatCard({ label, value, color = '#111827' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

function ActionCard({ title, helper, count, route, color, cta = 'Abrir' }) {
  return (
    <div className="dashboard-panel-card executive-action-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.8rem', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#0f172a', fontWeight: 800, marginBottom: '.3rem' }}>{title}</div>
          <div style={{ color: '#64748b', lineHeight: 1.6, fontSize: '.92rem' }}>{helper}</div>
        </div>
        <span
          style={{
            borderRadius: '999px',
            padding: '.28rem .62rem',
            fontWeight: 800,
            fontSize: '.78rem',
            background: `${color}16`,
            color,
            whiteSpace: 'nowrap',
          }}
        >
          {count}
        </span>
      </div>
      <Link to={route} className="btn btn-secondary" style={{ alignSelf: 'flex-start', textDecoration: 'none' }}>
        {cta}
      </Link>
    </div>
  );
}

export default function ControlCenter() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    alerts: [],
    notices: [],
    plansKm: [],
    attendance: [],
    rrhh: [],
    workReports: [],
    equipment: [],
    auditLog: [],
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [
        alerts,
        notices,
        plansKm,
        attendance,
        rrhh,
        workReports,
        equipment,
        auditLog,
      ] = await Promise.all([
        loadSharedDocument(SHARED_DOCUMENT_KEYS.otAlerts, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.maintenanceNotices, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePlansKm, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.rrhhAttendance, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.otWorkReports, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.equipmentItems, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.executiveAudit, []),
      ]);
      if (!active) return;
      setData({
        alerts: Array.isArray(alerts) ? alerts : [],
        notices: Array.isArray(notices) ? notices : [],
        plansKm: Array.isArray(plansKm) ? plansKm : [],
        attendance: Array.isArray(attendance) ? attendance : [],
        rrhh: Array.isArray(rrhh) ? rrhh : [],
        workReports: Array.isArray(workReports) ? workReports : [],
        equipment: Array.isArray(equipment) ? equipment : [],
        auditLog: Array.isArray(auditLog) ? auditLog : [],
      });
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const control = useMemo(() => buildControlCenterData(data), [data]);

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
        <h1 style={{ fontSize: '1.95rem', fontWeight: 700, marginBottom: '.35rem' }}>Centro de control</h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Vista de excepciones para planner e ingeniero: revisa bloqueos, aprobaciones pendientes y accesos directos al punto exacto que requiere atencion.
        </p>
      </div>

      <ControlNav activeKey="centro" />

      <div className="card executive-hero-card">
        <div>
          <div style={{ color: '#1d4ed8', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', fontSize: '.78rem', marginBottom: '.35rem' }}>
            Control operativo diario
          </div>
          <h2 className="card-title" style={{ marginBottom: '.35rem' }}>La idea es que aqui veas primero la excepcion y luego el modulo</h2>
          <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: 0 }}>
            Este tablero junta OT activas, solicitudes de cierre, avisos criticos, contadores en ventana y desviaciones de asistencia para evitar que el seguimiento dependa de abrir varias pantallas al azar. El itinerario te dice que revisar hoy; este centro te muestra donde esta la excepcion y te manda al modulo correcto.
          </p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginTop: '1rem' }}>
        <StatCard label="OT activas" value={control.hero.activeOt} color="#1d4ed8" />
        <StatCard label="Solicitudes de cierre" value={control.hero.closeRequests} color="#dc2626" />
        <StatCard label="Avisos pendientes" value={control.hero.pendingNotices} color="#c2410c" />
        <StatCard label="Asistencia inconsistente" value={control.hero.attendanceInconsistencies} color="#b91c1c" />
        <StatCard label="Excepciones criticas" value={control.hero.criticalExceptions} color="#991b1b" />
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <h2 className="card-title" style={{ marginBottom: '.35rem' }}>Acciones inmediatas</h2>
            <p style={{ color: '#6b7280', margin: 0 }}>
              Lo mas importante arriba, con acceso directo al modulo donde se resuelve.
            </p>
          </div>
        </div>

        <div className="executive-actions-grid">
          {control.actionCards.map((item) => (
            <ActionCard
              key={item.key}
              title={item.title}
              helper={item.helper}
              count={item.count}
              route={item.route}
              color={item.color}
            />
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <h2 className="card-title" style={{ marginBottom: '.35rem' }}>Cola de excepciones</h2>
            <p style={{ color: '#6b7280', margin: 0 }}>
              Prioriza primero lo critico, luego bloqueos de cierre y por ultimo ventanas de contador o seguimiento preventivo.
            </p>
          </div>
          <Link to="/control/bitacora" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Ver bitacora completa
          </Link>
        </div>

        <div className="executive-exception-list">
          {control.exceptionRows.length ? control.exceptionRows.map((item) => {
            const tone = getAuditSeverityStyle(item.severity);
            return (
              <div key={item.key} className="executive-exception-card" style={{ borderColor: `${tone.color}40` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: '.55rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.28rem' }}>
                      <strong style={{ color: '#0f172a' }}>{item.title}</strong>
                      <span style={{ borderRadius: '999px', padding: '.2rem .55rem', background: tone.background, color: tone.color, fontWeight: 800, fontSize: '.76rem' }}>
                        {tone.label}
                      </span>
                    </div>
                    <div style={{ color: '#475569', lineHeight: 1.65 }}>{item.detail}</div>
                  </div>
                  <Link to={item.route} className="btn btn-primary" style={{ textDecoration: 'none' }}>
                    {item.actionLabel}
                  </Link>
                </div>
              </div>
            );
          }) : (
            <div style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>
              No hay excepciones prioritarias en este momento.
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2 className="card-title">Actividad ejecutiva reciente</h2>
        <div className="executive-timeline-list">
          {control.latestAudit.length ? control.latestAudit.map((entry) => {
            const tone = getAuditSeverityStyle(entry.severity);
            return (
              <div key={entry.id} className="audit-row-card">
                <div className="audit-row-marker" style={{ background: tone.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.2rem' }}>
                    <strong style={{ color: '#0f172a' }}>{entry.title}</strong>
                    <span style={{ color: '#64748b', fontSize: '.86rem' }}>
                      {new Date(entry.created_at).toLocaleString('es-PE')}
                    </span>
                  </div>
                  <div style={{ color: '#475569', lineHeight: 1.6 }}>{entry.description || 'Sin detalle adicional.'}</div>
                  <div style={{ color: '#64748b', fontSize: '.84rem', marginTop: '.25rem' }}>
                    {entry.module} · {entry.action}
                  </div>
                </div>
              </div>
            );
          }) : (
            <div style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>
              Aun no hay actividad registrada en la bitacora ejecutiva.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
