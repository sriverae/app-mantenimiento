import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';

function KpiTile({ label, value, unit = '', color = '#111827', helper = '', tone = '#f8fafc' }) {
  return (
    <div
      className="dashboard-panel-card indicator-kpi-tile"
      style={{
        background: tone,
        border: `1px solid ${color}22`,
        borderLeft: `4px solid ${color}`,
        minHeight: '128px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div className="stat-label indicator-kpi-label" style={{ marginBottom: '.8rem' }}>{label}</div>
      <div>
        <span className="indicator-kpi-value" style={{ color, fontSize: '2.15rem', lineHeight: 1, fontWeight: 800 }}>{value}</span>
        {unit && <span className="indicator-kpi-unit" style={{ color: '#64748b', fontWeight: 700, marginLeft: '.35rem' }}>{unit}</span>}
      </div>
      {helper && <div className="indicator-kpi-helper" style={{ color: '#64748b', fontSize: '.82rem', marginTop: '.65rem', lineHeight: 1.45 }}>{helper}</div>}
    </div>
  );
}

function CompactKpiTile({ label, value, color = '#111827', tone = '#f8fafc' }) {
  return (
    <div
      className="dashboard-panel-card indicator-compact-tile"
      style={{
        background: tone,
        border: `1px solid ${color}22`,
        borderLeft: `4px solid ${color}`,
        minHeight: '92px',
        display: 'grid',
        alignContent: 'space-between',
      }}
    >
      <div className="indicator-compact-label" style={{ color: '#64748b', fontSize: '.86rem' }}>{label}</div>
      <strong className="indicator-compact-value" style={{ color, fontSize: '1.75rem', lineHeight: 1 }}>{value}</strong>
    </div>
  );
}

function ProgressRow({ label, value, color = '#2563eb', helper = '' }) {
  const pct = Math.max(0, Math.min(100, asNumber(value)));
  return (
    <div style={{ display: 'grid', gap: '.45rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'baseline' }}>
        <span style={{ color: '#334155', fontWeight: 700 }}>{label}</span>
        <strong style={{ color }}>{pct.toFixed(1)}%</strong>
      </div>
      <div style={{ height: '.55rem', borderRadius: '999px', background: '#e5e7eb', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '999px', background: color }} />
      </div>
      {helper && <div style={{ color: '#64748b', fontSize: '.84rem' }}>{helper}</div>}
    </div>
  );
}

function StatusBadge({ children, color = '#2563eb' }) {
  return (
    <span style={{ borderRadius: '999px', padding: '.22rem .58rem', background: `${color}15`, color, fontWeight: 800, fontSize: '.78rem', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function HoursPie({ preventiveHours = 0, correctiveHours = 0 }) {
  const preventive = asNumber(preventiveHours);
  const corrective = asNumber(correctiveHours);
  const total = preventive + corrective;
  const preventivePct = total > 0 ? (preventive / total) * 100 : 0;
  const correctivePct = total > 0 ? (corrective / total) * 100 : 0;

  return (
    <div className="hours-pie-layout">
      <div
        className="hours-pie-chart"
        aria-label="Distribucion de horas preventivas y correctivas"
        style={{
          width: '138px',
          aspectRatio: '1 / 1',
          borderRadius: '50%',
          background: total > 0
            ? `conic-gradient(#0891b2 0 ${preventivePct}%, #b45309 ${preventivePct}% 100%)`
            : '#e5e7eb',
          display: 'grid',
          placeItems: 'center',
          boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div
          className="hours-pie-center"
          style={{
            width: '76px',
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            background: '#fff',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            padding: '.5rem',
          }}
        >
          <strong style={{ color: '#0f172a', fontSize: '1rem', lineHeight: 1 }}>{total.toFixed(1)}</strong>
          <span style={{ color: '#64748b', fontSize: '.72rem', fontWeight: 700 }}>horas</span>
        </div>
      </div>

      <div className="hours-pie-legend" style={{ display: 'grid', gap: '.75rem' }}>
        <div style={{ display: 'grid', gap: '.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem' }}>
            <span style={{ color: '#334155', fontWeight: 700 }}>
              <span style={{ display: 'inline-block', width: '.55rem', height: '.55rem', borderRadius: '50%', background: '#0891b2', marginRight: '.35rem' }} />
              Preventivo
            </span>
            <strong style={{ color: '#0891b2' }}>{preventive.toFixed(2)} h</strong>
          </div>
          <div style={{ color: '#64748b', fontSize: '.84rem' }}>{preventivePct.toFixed(1)}% del total invertido</div>
        </div>
        <div style={{ display: 'grid', gap: '.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem' }}>
            <span style={{ color: '#334155', fontWeight: 700 }}>
              <span style={{ display: 'inline-block', width: '.55rem', height: '.55rem', borderRadius: '50%', background: '#b45309', marginRight: '.35rem' }} />
              Correctivo
            </span>
            <strong style={{ color: '#b45309' }}>{corrective.toFixed(2)} h</strong>
          </div>
          <div style={{ color: '#64748b', fontSize: '.84rem' }}>{correctivePct.toFixed(1)}% del total invertido</div>
        </div>
      </div>
    </div>
  );
}

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDateValue = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getMonthKey = (value) => String(value || '').slice(0, 7);

const getDaysInMonth = (monthKey) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return 30;
  return new Date(year, month, 0).getDate();
};

const addMonths = (monthKey, amount) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return '';
  const next = new Date(year, month - 1 + amount, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
};

const buildMonthRange = (fromMonth, toMonth) => {
  const start = String(fromMonth || '').slice(0, 7);
  const end = String(toMonth || start).slice(0, 7);
  if (!start) return [];
  const min = start <= end ? start : end;
  const max = start <= end ? end : start;
  const months = [];
  let cursor = min;
  while (cursor && cursor <= max && months.length < 120) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
};

const formatMonthLabel = (monthKey) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return 'Periodo no definido';
  return new Date(year, month - 1, 1).toLocaleDateString('es-PE', {
    month: 'long',
    year: 'numeric',
  });
};

const formatPeriodLabel = (monthKeys) => {
  if (!monthKeys.length) return 'Periodo no definido';
  if (monthKeys.length === 1) return formatMonthLabel(monthKeys[0]);
  return `${formatMonthLabel(monthKeys[0])} a ${formatMonthLabel(monthKeys[monthKeys.length - 1])}`;
};

const getHistoryPeriodDate = (item) => (
  item?.fecha_cierre
  || item?.cierre_ot?.fecha_fin
  || item?.fecha_ejecucion
  || item?.fecha_ejecutar
  || ''
);

const getAlertPeriodDate = (item) => (
  item?.fecha_ejecutar
  || item?.fecha_programada
  || item?.created_at
  || item?.registro_ot?.fecha_inicio
  || ''
);

const isInPeriod = (value, monthKeys) => monthKeys.includes(getMonthKey(value));

const includesCorrective = (item) => String(item?.tipo_mantto || item?.cierre_ot?.tipo_mantenimiento || '').toLowerCase().includes('correctivo');
const includesPreventive = (item) => String(item?.tipo_mantto || item?.cierre_ot?.tipo_mantenimiento || '').toLowerCase().includes('preventivo');

const getOtEffectiveHours = (item) => {
  const closeHours = asNumber(item?.cierre_ot?.tiempo_efectivo_hh);
  if (closeHours > 0) return closeHours;
  return (Array.isArray(item?.reportes_trabajo) ? item.reportes_trabajo : [])
    .reduce((sum, report) => sum + asNumber(report?.totalHoras), 0);
};

const matchesEquipment = (item, code) => {
  if (!code) return true;
  return String(item?.codigo || '').trim() === String(code).trim();
};

function buildIndicators(data, selectedEquipment, monthKeys) {
  const selectedCode = selectedEquipment?.codigo || '';
  const equipmentCount = selectedEquipment ? 1 : Math.max(data.equipment.length, 1);
  const activeAlerts = data.alerts.filter((item) => (
    item.status_ot !== 'Cerrada'
    && matchesEquipment(item, selectedCode)
    && isInPeriod(getAlertPeriodDate(item), monthKeys)
  ));
  const historyRows = data.history.filter((item) => (
    matchesEquipment(item, selectedCode)
    && isInPeriod(getHistoryPeriodDate(item), monthKeys)
  ));
  const closedCorrective = historyRows.filter(includesCorrective);
  const closedPreventive = historyRows.filter(includesPreventive);
  const duePlans = data.plans.filter((plan) => (
    plan.fecha_inicio
    && plan.codigo
    && matchesEquipment(plan, selectedCode)
    && isInPeriod(plan.fecha_inicio, monthKeys)
  ));
  const completedCodes = new Set(closedPreventive.map((item) => `${item.codigo || ''}_${item.fecha_ejecutar || ''}`));
  const compliantPlans = duePlans.filter((plan) => completedCodes.has(`${plan.codigo}_${plan.fecha_inicio}`)).length;
  const downtimeHours = closedCorrective.reduce(
    (sum, item) => sum + asNumber(item.cierre_ot?.tiempo_indisponible_operacional || item.cierre_ot?.tiempo_indisponible_generico),
    0,
  );
  const preventiveHours = closedPreventive.reduce((sum, item) => sum + getOtEffectiveHours(item), 0);
  const correctiveHours = closedCorrective.reduce((sum, item) => sum + getOtEffectiveHours(item), 0);
  const mttr = closedCorrective.length ? downtimeHours / closedCorrective.length : 0;
  let mtbfAccumulator = 0;
  let mtbfEvents = 0;

  const failuresByEquipment = new Map();
  closedCorrective.forEach((item) => {
    const key = item.codigo || item.descripcion || 'Sin equipo';
    if (!failuresByEquipment.has(key)) failuresByEquipment.set(key, []);
    failuresByEquipment.get(key).push(item);
  });
  failuresByEquipment.forEach((rows) => {
    const sortedFailures = rows
      .map((row) => ({ ...row, _date: getDateValue(row.fecha_cierre || row.fecha_ejecucion || row.fecha_ejecutar) }))
      .filter((row) => row._date)
      .sort((a, b) => a._date - b._date);
    for (let index = 1; index < sortedFailures.length; index += 1) {
      const diffMs = sortedFailures[index]._date - sortedFailures[index - 1]._date;
      if (diffMs > 0) {
        mtbfAccumulator += diffMs / (1000 * 60 * 60 * 24);
        mtbfEvents += 1;
      }
    }
  });
  const mtbfDays = mtbfEvents ? mtbfAccumulator / mtbfEvents : 0;
  const rollingPeriodDays = Math.max(monthKeys.reduce((sum, key) => sum + getDaysInMonth(key), 0), 1);
  const observationHours = equipmentCount * rollingPeriodDays * 24;
  const availability = observationHours > 0
    ? Math.max(0, Math.min(100, ((observationHours - downtimeHours) / observationHours) * 100))
    : 100;
  const failuresPerEquipment = closedCorrective.length / equipmentCount;
  const reliability = Math.max(0, Math.min(100, Math.exp(-failuresPerEquipment / rollingPeriodDays) * 100));
  return {
    created: activeAlerts.filter((item) => item.status_ot === 'Creada').length,
    liberated: activeAlerts.filter((item) => item.status_ot === 'Liberada').length,
    closeRequest: activeAlerts.filter((item) => item.status_ot === 'Solicitud de cierre').length,
    closed: historyRows.length,
    preventiveClosed: closedPreventive.length,
    correctiveClosed: closedCorrective.length,
    preventiveHours,
    correctiveHours,
    pmpCompliance: duePlans.length ? Math.round((compliantPlans / duePlans.length) * 100) : 0,
    mttr,
    mtbfDays,
    availability,
    reliability,
    failureCount: closedCorrective.length,
    downtimeHours,
    duePlans: duePlans.length,
    equipmentCount: selectedEquipment ? 1 : data.equipment.length,
  };
}

export default function Indicators() {
  const [data, setData] = useState({
    equipment: [],
    plans: [],
    alerts: [],
    history: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodFromMonth, setPeriodFromMonth] = useState(currentMonth);
  const [periodToMonth, setPeriodToMonth] = useState(currentMonth);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [equipment, plans, alerts, history] = await Promise.all([
        loadSharedDocument(SHARED_DOCUMENT_KEYS.equipmentItems, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePlans, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.otAlerts, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.otHistory, []),
      ]);
      if (!active) return;
      setData({
        equipment: Array.isArray(equipment) ? equipment : [],
        plans: Array.isArray(plans) ? plans : [],
        alerts: Array.isArray(alerts) ? alerts : [],
        history: Array.isArray(history) ? history : [],
      });
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const selectedEquipment = useMemo(
    () => data.equipment.find((item) => String(item.id || item.codigo) === String(selectedEquipmentId)) || null,
    [data.equipment, selectedEquipmentId],
  );
  const periodMonths = useMemo(() => buildMonthRange(periodFromMonth, periodToMonth), [periodFromMonth, periodToMonth]);
  const periodLabel = useMemo(() => formatPeriodLabel(periodMonths), [periodMonths]);
  const indicators = useMemo(() => buildIndicators(data, selectedEquipment, periodMonths), [data, selectedEquipment, periodMonths]);
  const visibleEquipment = useMemo(() => {
    const query = equipmentSearch.trim().toLowerCase();
    return [...data.equipment]
      .filter((item) => {
        if (!query) return true;
        return [item.codigo, item.descripcion, item.area, item.criticidad, item.estado]
          .some((value) => String(value || '').toLowerCase().includes(query));
      })
      .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || '')));
  }, [data.equipment, equipmentSearch]);
  const suggestedEquipment = useMemo(
    () => visibleEquipment.slice(0, equipmentSearch.trim() ? 25 : 8),
    [equipmentSearch, visibleEquipment],
  );

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="dashboard-hero indicators-hero">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-title">Indicadores</h1>
          <p className="dashboard-date">
            {selectedEquipment ? `${selectedEquipment.codigo} - ${selectedEquipment.descripcion || 'Equipo seleccionado'}` : 'Gestion total de mantenimiento'} - {periodLabel}
          </p>
        </div>
        <div className="indicators-period-controls" style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="indicators-period-field" style={{ display: 'grid', gap: '.25rem', minWidth: '160px' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '.78rem' }}>Desde</label>
            <input
              type="month"
              className="form-input"
              value={periodFromMonth}
              onChange={(e) => setPeriodFromMonth(e.target.value || currentMonth)}
              style={{ padding: '.55rem .7rem' }}
            />
          </div>
          <div className="indicators-period-field" style={{ display: 'grid', gap: '.25rem', minWidth: '160px' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '.78rem' }}>Hasta</label>
            <input
              type="month"
              className="form-input"
              value={periodToMonth}
              onChange={(e) => setPeriodToMonth(e.target.value || periodFromMonth)}
              style={{ padding: '.55rem .7rem' }}
            />
          </div>
          <span className="indicators-view-badge">
            <StatusBadge color={selectedEquipment ? '#2563eb' : '#059669'}>
              {selectedEquipment ? 'Vista por equipo' : 'Vista general'}
            </StatusBadge>
          </span>
        </div>
      </div>

      <div className="indicators-layout">
        <aside className="card indicators-equipment-panel" style={{ padding: '1rem', position: 'sticky', top: '1rem' }}>
          <div className="indicators-equipment-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <h2 className="card-title" style={{ marginBottom: '.15rem', fontSize: '1rem' }}>Seleccionar equipo</h2>
              <div style={{ color: '#64748b', fontSize: '.84rem' }}>{data.equipment.length} equipo(s) registrados</div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setSelectedEquipmentId('')}
              style={{ background: !selectedEquipment ? '#2563eb' : '#6b7280' }}
            >
            Total
            </button>
          </div>

          {selectedEquipment && (
            <div style={{ border: '1px solid #bfdbfe', borderRadius: '.55rem', background: '#eff6ff', padding: '.75rem', marginBottom: '.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'center' }}>
                <strong style={{ color: '#0f172a' }}>{selectedEquipment.codigo || 'Equipo'}</strong>
                <span style={{ color: '#1d4ed8', fontSize: '.78rem', fontWeight: 800 }}>{selectedEquipment.estado || 'N.A.'}</span>
              </div>
              <div style={{ color: '#475569', fontSize: '.86rem', marginTop: '.2rem', lineHeight: 1.35 }}>
                {selectedEquipment.descripcion || 'Sin descripcion'}
              </div>
            </div>
          )}

          <input
            className="form-input indicators-equipment-search"
            type="search"
            value={equipmentSearch}
            onChange={(e) => setEquipmentSearch(e.target.value)}
            placeholder="Buscar equipo..."
            style={{ marginBottom: '.85rem' }}
          />

          <div className="indicators-equipment-list" style={{ display: 'grid', gap: '.45rem' }}>
            <div className="indicators-equipment-meta" style={{ color: '#64748b', fontSize: '.82rem', display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
              <span>{equipmentSearch.trim() ? `${visibleEquipment.length} coincidencia(s)` : 'Sugeridos'}</span>
              <span>{suggestedEquipment.length} mostrado(s)</span>
            </div>
            {suggestedEquipment.map((item) => {
              const key = String(item.id || item.codigo);
              const active = key === String(selectedEquipmentId);
              return (
                <button
                  className="indicators-equipment-option"
                  key={key}
                  type="button"
                  onClick={() => setSelectedEquipmentId(key)}
                  style={{
                    border: active ? '1px solid #2563eb' : '1px solid #e5e7eb',
                    borderRadius: '.5rem',
                    padding: '.7rem .75rem',
                    background: active ? '#eff6ff' : '#fff',
                    color: '#0f172a',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'center' }}>
                    <strong>{item.codigo || 'Equipo'}</strong>
                    <span style={{ color: active ? '#1d4ed8' : '#64748b', fontSize: '.78rem', fontWeight: 700 }}>{item.estado || 'N.A.'}</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: '.18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.descripcion || 'Sin descripcion'}
                  </div>
                </button>
              );
            })}
            {!suggestedEquipment.length && (
              <div style={{ color: '#6b7280', textAlign: 'center', padding: '1rem' }}>No hay equipos para ese filtro.</div>
            )}
            {!equipmentSearch.trim() && data.equipment.length > suggestedEquipment.length && (
              <div style={{ color: '#64748b', fontSize: '.82rem', lineHeight: 1.45, padding: '.35rem .1rem' }}>
                Usa el buscador por codigo, descripcion, area, criticidad o estado para ubicar rapidamente un equipo.
              </div>
            )}
            {equipmentSearch.trim() && visibleEquipment.length > suggestedEquipment.length && (
              <div style={{ color: '#64748b', fontSize: '.82rem', lineHeight: 1.45, padding: '.35rem .1rem' }}>
                Hay mas coincidencias. Escribe un dato mas especifico para afinar la busqueda.
              </div>
            )}
          </div>
        </aside>

        <main style={{ display: 'grid', gap: '1rem' }}>
          <section className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h2 className="card-title" style={{ marginBottom: '.35rem' }}>Confiabilidad del activo</h2>
                <p style={{ color: '#64748b', margin: 0, lineHeight: 1.55 }}>
                  Indicadores calculados con OT correctivas cerradas en el periodo {periodLabel}.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '.55rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {selectedEquipment && (
                  <Link
                    to={`/pmp/historial-ot?equipo=${encodeURIComponent(selectedEquipment.codigo || '')}`}
                    className="btn btn-secondary"
                    style={{ textDecoration: 'none', padding: '.55rem .85rem', fontSize: '.9rem' }}
                  >
                    Ver historial de mantenimientos
                  </Link>
                )}
                <StatusBadge color="#475569">{indicators.equipmentCount || 0} equipo(s)</StatusBadge>
              </div>
            </div>

            <div className="indicator-kpi-grid" style={{ display: 'grid', gap: '.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              <KpiTile label="MTTR" value={indicators.mttr.toFixed(2)} unit="h" color="#0f766e" helper="Menor es mejor" tone="#f0fdfa" />
              <KpiTile label="MTBF" value={indicators.mtbfDays.toFixed(1)} unit="dias" color="#2563eb" helper="Mayor es mejor" tone="#eff6ff" />
              <KpiTile label="Disponibilidad" value={indicators.availability.toFixed(1)} unit="%" color="#059669" helper="Tiempo disponible estimado" tone="#f0fdf4" />
              <KpiTile label="Confiabilidad" value={indicators.reliability.toFixed(1)} unit="%" color="#7c3aed" helper="Basada en fallas correctivas" tone="#f5f3ff" />
            </div>

            <div className="indicator-secondary-grid" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: '1rem' }}>
              <div className="dashboard-panel-card indicator-secondary-tile" style={{ background: '#fff' }}>
                <div style={{ color: '#64748b', fontSize: '.85rem', marginBottom: '.35rem' }}>Numero de fallas</div>
                <strong style={{ fontSize: '1.8rem', color: '#dc2626' }}>{indicators.failureCount}</strong>
                <div style={{ color: '#64748b', fontSize: '.84rem', marginTop: '.4rem' }}>
                  OT correctivas cerradas en el mes seleccionado.
                </div>
              </div>
              <div className="dashboard-panel-card indicator-secondary-tile" style={{ background: '#fff' }}>
                <div style={{ color: '#64748b', fontSize: '.85rem', marginBottom: '.35rem' }}>Horas indisponibles</div>
                <strong style={{ fontSize: '1.8rem', color: '#c2410c' }}>{indicators.downtimeHours.toFixed(2)}</strong>
                <div style={{ color: '#64748b', fontSize: '.84rem', marginTop: '.4rem' }}>
                  Suma de indisponibilidad operacional o generica en correctivos cerrados.
                </div>
              </div>
            </div>
          </section>

          <section className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h2 className="card-title" style={{ marginBottom: '.35rem' }}>Gestion de mantenimiento</h2>
                <p style={{ color: '#64748b', margin: 0, lineHeight: 1.55 }}>
                  Cumplimiento del plan preventivo y flujo de ordenes de trabajo del periodo {periodLabel}.
                </p>
              </div>
              <StatusBadge color="#059669">{indicators.duePlans} planes PMP</StatusBadge>
            </div>

            <div className="maintenance-management-grid">
              <div className="dashboard-panel-card indicator-management-card" style={{ background: '#fff', display: 'grid', gap: '1rem', alignContent: 'start' }}>
                <ProgressRow
                  label="Cumplimiento PMP"
                  value={indicators.pmpCompliance}
                  color={indicators.pmpCompliance >= 90 ? '#059669' : indicators.pmpCompliance >= 70 ? '#d97706' : '#dc2626'}
                  helper="Preventivos cerrados contra planes programados por fecha."
                />
                <div className="indicator-maintenance-counts" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.65rem' }}>
                  <div className="indicator-maintenance-count" style={{ border: '1px solid #e5e7eb', borderRadius: '.5rem', padding: '.7rem' }}>
                    <div style={{ color: '#64748b', fontSize: '.8rem' }}>Preventivos</div>
                    <strong style={{ color: '#0891b2', fontSize: '1.45rem' }}>{indicators.preventiveClosed}</strong>
                  </div>
                  <div className="indicator-maintenance-count" style={{ border: '1px solid #e5e7eb', borderRadius: '.5rem', padding: '.7rem' }}>
                    <div style={{ color: '#64748b', fontSize: '.8rem' }}>Correctivos</div>
                    <strong style={{ color: '#b45309', fontSize: '1.45rem' }}>{indicators.correctiveClosed}</strong>
                  </div>
                </div>
              </div>

              <div className="dashboard-panel-card indicator-management-card" style={{ background: '#fff', display: 'grid', gap: '.85rem', alignContent: 'start' }}>
                <div>
                  <div style={{ color: '#0f172a', fontWeight: 800, marginBottom: '.2rem' }}>Horas por tipo de mantenimiento</div>
                  <div style={{ color: '#64748b', fontSize: '.86rem', lineHeight: 1.45 }}>
                    Horas efectivas invertidas en OT cerradas del alcance seleccionado.
                  </div>
                </div>
                <HoursPie
                  preventiveHours={indicators.preventiveHours}
                  correctiveHours={indicators.correctiveHours}
                />
              </div>
            </div>

            <div className="indicator-ot-flow-grid" style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: '1rem' }}>
              <CompactKpiTile label="OT creadas" value={indicators.created} color="#475569" tone="#f8fafc" />
              <CompactKpiTile label="OT liberadas" value={indicators.liberated} color="#7c3aed" tone="#f5f3ff" />
              <CompactKpiTile label="Solicitudes cierre" value={indicators.closeRequest} color="#dc2626" tone="#fef2f2" />
              <CompactKpiTile label="OT cerradas" value={indicators.closed} color="#0f766e" tone="#f0fdfa" />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
