import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ConfigurableSelectField from '../components/ConfigurableSelectField';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import TableFilterRow from '../components/TableFilterRow';
import { useAuth } from '../context/AuthContext';
import useConfigurableLists from '../hooks/useConfigurableLists';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { formatDateDisplay, formatIsoTimestampDisplay } from '../utils/dateFormat';
import {
  applyLatestCounterEntriesToPlans,
  buildPmLabel,
  createCounterEntry,
  getCurrentPlanCycleEntry,
  getKmDerivedFields,
  getLatestCounterEntry,
  getPlanCounterEntries,
  getPlanPackageCycle,
  getTodayInputDate,
  normalizeDateInput,
  normalizeKmPlan,
  normalizePmLabel,
  normalizeVcLabel,
  sortCounterEntries,
  toSafeNumber,
} from '../utils/kmCounters';
import { isReadOnlyRole } from '../utils/roleAccess';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { filterRowsByColumns } from '../utils/tableFilters';
import {
  firstValidationError,
  validateNonNegativeFields,
  validatePositiveFields,
  validateRequiredFields,
  validateTextFields,
} from '../utils/formValidation';

const KM_STORAGE_KEY = SHARED_DOCUMENT_KEYS.maintenancePlansKm;
const COUNTERS_HISTORY_KEY = SHARED_DOCUMENT_KEYS.maintenanceCountersHistory;
const EQUIPOS_STORAGE_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const PACKAGES_STORAGE_KEY = SHARED_DOCUMENT_KEYS.maintenancePackages;
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;

const PACKAGES_FALLBACK = [
  {
    id: 1,
    codigo: 'PK-KM-001',
    vc: 'V.C - KM',
    nombre: 'SERVICIO_CADA_5000_KM',
    tiempo_min: 120,
    actividades: ['Cambio de aceite', 'Revision de filtros', 'Inspeccion visual general'],
  },
];

const INITIAL_PLANS_KM = [
  normalizeKmPlan({
    id: 1,
    codigo: 'CAM-001',
    equipo: 'Camion Tolva 01',
    area_trabajo: 'Planta',
    marca: 'N.A.',
    modelo: 'N.A.',
    prioridad: 'Alta',
    responsable: 'Mecanico',
    vc: 'Km',
    km_actual: 11850,
    km_ultimo_mantenimiento: 10000,
    intervalo_km: 5000,
    alerta_km: 500,
    proximo_km: 15000,
    km_por_dia: 250,
    fecha_ultimo_servicio: '2026-03-01',
    fecha_toma: getTodayInputDate(),
    tipo_pm_ultimo: 'PM0',
    actividades: 'Cambio de aceite\nRevision de filtros\nInspeccion general de frenos',
    paquete_id: '',
  }),
];

const EMPTY_FORM = {
  responsable: '',
  prioridad: 'Media',
  vc: 'Km',
  area_trabajo: '',
  marca: '',
  modelo: '',
  has_previous_maintenance: false,
  km_actual: '',
  km_ultimo_mantenimiento: '',
  intervalo_km: '',
  alerta_km: '500',
  km_por_dia: '',
  fecha_ultimo_servicio: '',
  fecha_toma: getTodayInputDate(),
  tipo_pm_ultimo: '',
  paquete_id: '',
};

const STATUS_META = {
  Pendiente: { label: 'Pendiente', color: '#c2410c', bg: '#fff7ed' },
  Creada: { label: 'Creada', color: '#2563eb', bg: '#eff6ff' },
  Liberada: { label: 'Liberada', color: '#059669', bg: '#ecfdf5' },
  'Solicitud de cierre': { label: 'Solicitud de cierre', color: '#dc2626', bg: '#fef2f2' },
  Cerrada: { label: 'Cerrada', color: '#475569', bg: '#e2e8f0' },
};

function Modal({ title, onClose, children, maxWidth = '1100px' }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth, maxHeight: '92vh', overflow: 'auto', background: '#fff', borderRadius: '1rem', boxShadow: '0 24px 64px rgba(15, 23, 42, .26)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.15rem', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cerrar</button>
        </div>
        <div style={{ padding: '1rem 1.15rem 1.15rem' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, helper, color = '#111827' }) {
  return (
    <div className="stat-card" style={{ marginBottom: 0 }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {helper ? <div style={{ color: '#64748b', marginTop: '.35rem', fontSize: '.86rem' }}>{helper}</div> : null}
    </div>
  );
}

function KmPlanDetailContent({
  selectedPlan,
  selectedPlanDerived,
  selectedStatus,
  selectedPlanCounters,
  selectedLatestCounter,
  canOpenSettingsCounters,
  isMobile,
}) {
  const packageCycle = Array.isArray(selectedPlan.package_cycle) ? selectedPlan.package_cycle : [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 1.15fr) minmax(320px, .85fr)', gap: '1rem' }}>
      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.9rem' }}>
          <div>
            <h2 className="card-title" style={{ marginBottom: '.2rem' }}>{selectedPlan.codigo} - {selectedPlan.equipo}</h2>
            <div style={{ color: '#64748b' }}>
              {selectedPlan.area_trabajo} | {selectedPlan.marca || 'N.A.'} | {selectedPlan.modelo || 'N.A.'}
            </div>
          </div>
          {selectedStatus ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '.35rem .75rem', borderRadius: '999px', background: selectedStatus.bg, color: selectedStatus.color, fontWeight: 700, height: 'fit-content' }}>
              {selectedStatus.label}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
          <div style={{ padding: '.9rem', borderRadius: '.9rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Contador actual</div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{formatCounterValue(selectedPlanDerived.currentCounter)}</div>
          </div>
          <div style={{ padding: '.9rem', borderRadius: '.9rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Proximo servicio</div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{formatCounterValue(selectedPlanDerived.nextCounter)}</div>
          </div>
          <div style={{ padding: '.9rem', borderRadius: '.9rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Faltantes</div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: selectedPlanDerived.remainingCounter === 0 ? '#dc2626' : '#111827' }}>{formatCounterValue(selectedPlanDerived.remainingCounter)}</div>
          </div>
          <div style={{ padding: '.9rem', borderRadius: '.9rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Fecha programada</div>
            <div style={{ fontWeight: 800, fontSize: '1.02rem' }}>{formatDateDisplay(selectedPlanDerived.programmedDate)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '.9rem' }}>
          <div style={{ padding: '1rem', borderRadius: '.95rem', border: '1px solid #e5e7eb', background: '#fff' }}>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.55rem' }}>Ultimo servicio ejecutado</div>
            <div style={{ display: 'grid', gap: '.35rem', color: '#475569' }}>
              <div>Tipo PM: <strong>{selectedPlan.tipo_pm_ultimo}</strong></div>
              <div>Hra/Km: <strong>{formatCounterValue(selectedPlan.km_ultimo_mantenimiento)}</strong></div>
              <div>Fecha: <strong>{formatDateDisplay(selectedPlan.fecha_ultimo_servicio)}</strong></div>
            </div>
          </div>
          <div style={{ padding: '1rem', borderRadius: '.95rem', border: '1px solid #e5e7eb', background: '#fff' }}>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.55rem' }}>Proximo servicio a ejecutar</div>
            <div style={{ display: 'grid', gap: '.35rem', color: '#475569' }}>
              <div>Tipo PM: <strong>{selectedPlan.tipo_pm_proximo}</strong></div>
              <div>Paquete PM: <strong>{selectedPlan.paquete_nombre || selectedPlan.paquete_codigo || 'No definido'}</strong></div>
              <div>Hra/Km objetivo: <strong>{formatCounterValue(selectedPlan.proximo_km)}</strong></div>
              <div>Dias faltantes: <strong>{formatDaysValue(selectedPlanDerived.daysRemaining)}</strong></div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '.95rem', border: '1px solid #e5e7eb', background: '#fff' }}>
          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.55rem' }}>Actividades del paquete / plan</div>
          <div style={{ whiteSpace: 'pre-line', color: '#334155', lineHeight: 1.7 }}>
            {selectedPlan.actividades || 'Sin actividades registradas.'}
          </div>
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '.95rem', border: '1px solid #e5e7eb', background: '#fff' }}>
          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.65rem' }}>Secuencia ciclica de paquetes</div>
          {isMobile ? (
            <div style={{ display: 'grid', gap: '.7rem' }}>
              {packageCycle.map((entry, index) => {
                const isCurrent = index === Number(selectedPlan.current_cycle_index || 0);
                return (
                  <div
                    key={`${entry.package_id || entry.package_codigo || entry.tipo_pm}-${index}`}
                    style={{
                      padding: '.85rem .9rem',
                      borderRadius: '.9rem',
                      border: isCurrent ? '2px solid #2563eb' : '1px solid #e5e7eb',
                      background: isCurrent ? '#eff6ff' : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.4rem' }}>
                      <strong>{entry.tipo_pm}</strong>
                      {isCurrent ? <span style={{ color: '#2563eb', fontWeight: 700, fontSize: '.82rem' }}>Paso actual</span> : null}
                    </div>
                    <div style={{ color: '#334155', lineHeight: 1.6 }}>
                      <div>Frecuencia: <strong>{formatCounterValue(entry.frecuencia)}</strong> {entry.vc}</div>
                      <div>Paquete: <strong>{entry.package_nombre || entry.package_codigo || 'Sin nombre'}</strong></div>
                    </div>
                  </div>
                );
              })}
              {!packageCycle.length && <div style={{ color: '#6b7280' }}>Sin secuencia de paquetes configurada.</div>}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', width: '80px' }}>Item</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', width: '120px' }}>Frecuencia</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', width: '120px' }}>Var. Ctrl</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>Paquete PM</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '.5rem', width: '120px' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {packageCycle.map((entry, index) => {
                    const isCurrent = index === Number(selectedPlan.current_cycle_index || 0);
                    return (
                      <tr key={`${entry.package_id || entry.package_codigo || entry.tipo_pm}-${index}`} style={{ background: isCurrent ? '#eff6ff' : '#fff' }}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'center', fontWeight: 700 }}>{entry.tipo_pm}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{formatCounterValue(entry.frecuencia)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{entry.vc}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{entry.package_nombre || entry.package_codigo || 'Sin nombre'}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '.5rem', fontWeight: 700, color: isCurrent ? '#2563eb' : '#64748b' }}>
                          {isCurrent ? 'Actual' : 'En espera'}
                        </td>
                      </tr>
                    );
                  })}
                  {!packageCycle.length && (
                    <tr>
                      <td colSpan={5} style={{ border: '1px solid #e5e7eb', padding: '.75rem', textAlign: 'center', color: '#6b7280' }}>
                        Sin secuencia de paquetes configurada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.9rem' }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Ultimos contadores registrados</h2>
          {canOpenSettingsCounters ? (
            <Link to="/settings/contadores" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
              Ver historial completo
            </Link>
          ) : (
            <span style={{ color: '#64748b', fontWeight: 700 }}>Revision completa desde Configuraciones</span>
          )}
        </div>

        {selectedLatestCounter ? (
          <div style={{ padding: '.9rem 1rem', borderRadius: '.9rem', background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: '.9rem' }}>
            <div style={{ color: '#1d4ed8', fontSize: '.82rem', marginBottom: '.25rem' }}>Ultima toma registrada</div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatCounterValue(selectedLatestCounter.valor_contador)} | {formatDateDisplay(selectedLatestCounter.fecha_toma)}</div>
            <div style={{ color: '#475569', fontSize: '.88rem', marginTop: '.35rem' }}>
              Registrado: {formatIsoTimestampDisplay(selectedLatestCounter.registrado_en)} | Origen: {selectedLatestCounter.origen || 'ACTUALIZACION'}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: '.75rem' }}>
          {selectedPlanCounters.slice(0, 5).map((entry, index) => (
            <div key={entry.id} style={{ padding: '.85rem .95rem', borderRadius: '.9rem', border: '1px solid #e5e7eb', background: index === 0 ? '#f8fafc' : '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.35rem' }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{formatCounterValue(entry.valor_contador)}</div>
                <div style={{ color: '#64748b', fontSize: '.88rem' }}>{formatDateDisplay(entry.fecha_toma)}</div>
              </div>
              <div style={{ color: '#475569', fontSize: '.88rem', lineHeight: 1.5 }}>
                Origen: {entry.origen || 'ACTUALIZACION'} <br />
                Registrado: {formatIsoTimestampDisplay(entry.registrado_en)}
                {entry.corregido_en ? (
                  <>
                    <br />
                    Corregido: {formatIsoTimestampDisplay(entry.corregido_en)}{entry.corregido_por ? ` por ${entry.corregido_por}` : ''}
                  </>
                ) : null}
              </div>
            </div>
          ))}

          {!selectedPlanCounters.length && (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: '1rem 0' }}>
              Aun no hay historial de contadores para este plan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function normalizeEquiposList(items) {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((eq, index) => ({
      id: eq.id ?? `eq_${index}_${eq.codigo || 'sin_codigo'}`,
      codigo: eq.codigo || '',
      descripcion: eq.descripcion || eq.equipo || '',
      area_trabajo: eq.area_trabajo || eq.area || 'N.A.',
      marca: eq.marca || 'N.A.',
      modelo: eq.modelo || eq.modelo_equipo || eq.modelo_maquina || 'N.A.',
      ...eq,
    }));
}

function normalizePackagesList(items) {
  return (Array.isArray(items) ? items : PACKAGES_FALLBACK).map((item, index) => ({
    id: item.id ?? `pkg_${index + 1}`,
    codigo: item.codigo || `PK-KM-${String(index + 1).padStart(3, '0')}`,
    nombre: item.nombre || `Paquete ${index + 1}`,
    vc: item.vc || 'V.C - KM',
    actividades: normalizeActivitiesList(item.actividades),
    ...item,
  }));
}

function getPackageVcCategory(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text.includes('DIA') || text.includes('DÍA')) return 'V.C - DIA';
  if (text.includes('HRA') || text.includes('HORA')) return 'V.C - HRA';
  if (text.includes('KM')) return 'V.C - KM';
  return 'SIN CLASIFICAR';
}

function normalizeActivitiesList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatCounterValue(value) {
  const parsed = toSafeNumber(value);
  return parsed.toLocaleString('es-PE', { maximumFractionDigits: 2 });
}

function formatDaysValue(value) {
  if (value === null || value === undefined) return 'N.A.';
  return `${Number(value).toLocaleString('es-PE')} dia(s)`;
}

function buildKmAlertId(plan) {
  return `km_${plan.id}_${Number(plan.proximo_km) || 0}`;
}

function getEquipmentLabel(equipment) {
  return `${equipment.codigo || 'Sin codigo'} | ${equipment.descripcion || 'Equipo sin descripcion'}${equipment.area_trabajo ? ` (${equipment.area_trabajo})` : ''}`;
}

function reindexPackageCycleEntries(entries = []) {
  return (Array.isArray(entries) ? entries : []).map((entry, index) => ({
    ...entry,
    item: index + 1,
    tipo_pm: buildPmLabel(index + 1),
  }));
}

function buildPlanPayload(form, selectedEquipo, packageCycleEntries, editingPlan = null) {
  const normalizedCycle = reindexPackageCycleEntries(getPlanPackageCycle({
    ...(editingPlan || {}),
    package_cycle: packageCycleEntries,
    vc: form.vc || editingPlan?.vc || 'Km',
  }));
  const hasPreviousMaintenance = Boolean(form.has_previous_maintenance);
  const requestedLastPm = hasPreviousMaintenance
    ? normalizePmLabel(form.tipo_pm_ultimo, '')
    : 'PM0';
  const lastExecutedIndex = normalizedCycle.findIndex((entry) => entry.tipo_pm === requestedLastPm);
  const currentCycleIndex = normalizedCycle.length
    ? hasPreviousMaintenance
      ? (lastExecutedIndex >= 0 ? (lastExecutedIndex + 1) % normalizedCycle.length : 0)
      : 0
    : 0;
  const currentCycleEntry = normalizedCycle[currentCycleIndex] || normalizedCycle[0] || null;
  const intervalCounter = toSafeNumber(currentCycleEntry?.frecuencia);
  const lastCounter = hasPreviousMaintenance ? toSafeNumber(form.km_ultimo_mantenimiento) : 0;
  const lastPm = hasPreviousMaintenance
    ? normalizePmLabel(form.tipo_pm_ultimo, editingPlan?.tipo_pm_ultimo || '')
    : 'PM0';
  const currentCounter = editingPlan ? toSafeNumber(editingPlan.km_actual) : toSafeNumber(form.km_actual);
  const takeDate = editingPlan
    ? normalizeDateInput(editingPlan.fecha_toma || form.fecha_toma || getTodayInputDate())
    : normalizeDateInput(form.fecha_toma || getTodayInputDate());

  return normalizeKmPlan({
    ...editingPlan,
    ...form,
    codigo: selectedEquipo?.codigo || editingPlan?.codigo || '',
    equipo: selectedEquipo?.descripcion || editingPlan?.equipo || '',
    area_trabajo: form.area_trabajo || selectedEquipo?.area_trabajo || editingPlan?.area_trabajo || 'N.A.',
    marca: form.marca || selectedEquipo?.marca || editingPlan?.marca || 'N.A.',
    modelo: form.modelo || selectedEquipo?.modelo || editingPlan?.modelo || 'N.A.',
    vc: normalizeVcLabel(form.vc || editingPlan?.vc || 'Km'),
    prioridad: form.prioridad || editingPlan?.prioridad || 'Media',
    responsable: String(form.responsable || editingPlan?.responsable || '').trim(),
    frecuencia_valor: intervalCounter,
    intervalo_km: intervalCounter,
    km_actual: currentCounter,
    km_ultimo_mantenimiento: lastCounter,
    alerta_km: toSafeNumber(form.alerta_km),
    proximo_km: intervalCounter > 0 ? lastCounter + intervalCounter : toSafeNumber(form.proximo_km),
    km_por_dia: toSafeNumber(form.km_por_dia),
    fecha_ultimo_servicio: hasPreviousMaintenance ? normalizeDateInput(form.fecha_ultimo_servicio) : '',
    fecha_toma: takeDate,
    tipo_pm_ultimo: lastPm,
    tipo_pm_proximo: currentCycleEntry?.tipo_pm || buildPmLabel(1),
    actividades: currentCycleEntry?.actividades?.join('\n') || '',
    paquete_id: currentCycleEntry?.package_id || '',
    paquete_codigo: currentCycleEntry?.package_codigo || '',
    paquete_nombre: currentCycleEntry?.package_nombre || '',
    package_cycle: normalizedCycle,
    current_cycle_index: currentCycleIndex,
  });
}

function seedCounterHistory(plans, historyEntries) {
  const sortedEntries = sortCounterEntries(historyEntries);
  const nextEntries = [...sortedEntries];
  let changed = false;

  const nextPlans = (Array.isArray(plans) ? plans : []).map((plan) => {
    const existingEntries = getPlanCounterEntries(nextEntries, plan.id);
    if (existingEntries.length) return plan;

    const seedEntry = createCounterEntry(plan, {
      value: plan.km_actual,
      fechaToma: plan.fecha_toma,
      source: 'PLAN_INICIAL',
    });
    nextEntries.unshift(seedEntry);
    changed = true;

    return {
      ...plan,
      counter_initial_id: plan.counter_initial_id || seedEntry.id,
      ultimo_contador_id: seedEntry.id,
    };
  });

  return {
    changed,
    nextPlans,
    nextEntries: sortCounterEntries(nextEntries),
  };
}

export default function PmpKm() {
  const { hasMinRole, user } = useAuth();
  const {
    getOptions,
    addOptionQuickly,
    canManage: canManageConfigurableLists,
  } = useConfigurableLists();
  const [plans, setPlans] = useState(INITIAL_PLANS_KM);
  const [counterHistory, setCounterHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(INITIAL_PLANS_KM[0]?.id ?? null);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [counterForm, setCounterForm] = useState({ valor_contador: '', fecha_toma: getTodayInputDate() });
  const [equipos, setEquipos] = useState([]);
  const [packages, setPackages] = useState(PACKAGES_FALLBACK);
  const [otAlerts, setOtAlerts] = useState([]);
  const [packageSearch, setPackageSearch] = useState('');
  const [packageVcFilter, setPackageVcFilter] = useState('AUTO');
  const [packageCycleItems, setPackageCycleItems] = useState([]);
  const [query, setQuery] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const isReadOnly = isReadOnlyRole(user);

  const responsibleOptions = getOptions('responsables', ['Mecanico', 'Electricista']);
  const priorityOptions = getOptions('prioridades', ['Alta', 'Media', 'Baja']);
  const areaOptions = getOptions('areas_trabajo', ['Planta', 'Secado']);
  const vcOptions = Array.from(
    new Set(
      getOptions('variaciones_control', ['V.C - HRA', 'V.C - KM'])
        .map((item) => (item === 'V.C - KM' ? 'Km' : item === 'V.C - HRA' ? 'Hra' : item))
        .filter((item) => item === 'Km' || item === 'Hra'),
    ),
  );

  const quickAddToForm = async (key, label, field) => {
    const result = await addOptionQuickly(key, label);
    if (result?.added && result.value) {
      const nextValue = key === 'variaciones_control'
        ? (result.value === 'V.C - KM' ? 'Km' : result.value === 'V.C - HRA' ? 'Hra' : result.value)
        : result.value;
      setForm((prev) => ({ ...prev, [field]: nextValue }));
    }
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!selectedEquipmentId) return;
    const equipment = equipos.find((item) => String(item.id) === String(selectedEquipmentId));
    if (!equipment) return;

    setForm((prev) => ({
      ...prev,
      area_trabajo: equipment.area_trabajo || prev.area_trabajo,
      marca: equipment.marca || prev.marca,
      modelo: equipment.modelo || prev.modelo,
    }));
  }, [selectedEquipmentId, equipos]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [loadedPlans, loadedHistory, loadedEquipos, loadedPackages, loadedOtAlerts] = await Promise.all([
        loadSharedDocument(KM_STORAGE_KEY, INITIAL_PLANS_KM),
        loadSharedDocument(COUNTERS_HISTORY_KEY, []),
        loadSharedDocument(EQUIPOS_STORAGE_KEY, []),
        loadSharedDocument(PACKAGES_STORAGE_KEY, PACKAGES_FALLBACK),
        loadSharedDocument(OT_ALERTS_KEY, []),
      ]);
      if (!active) return;

      const normalizedPlans = (Array.isArray(loadedPlans) && loadedPlans.length ? loadedPlans : INITIAL_PLANS_KM)
        .map((plan) => normalizeKmPlan(plan));
      const normalizedHistory = sortCounterEntries(Array.isArray(loadedHistory) ? loadedHistory : []);
      const syncedPlans = applyLatestCounterEntriesToPlans(normalizedPlans, normalizedHistory);
      const seeded = seedCounterHistory(syncedPlans, normalizedHistory);

      setPlans(seeded.nextPlans);
      setCounterHistory(seeded.nextEntries);
      setSelectedId(seeded.nextPlans[0]?.id ?? null);
      setEquipos(normalizeEquiposList(loadedEquipos));
      setPackages(normalizePackagesList(loadedPackages));
      setOtAlerts(Array.isArray(loadedOtAlerts) ? loadedOtAlerts : []);
      setHydrated(true);
      setLoading(false);

      if (seeded.changed && !isReadOnly) {
        try {
          await Promise.all([
            saveSharedDocument(KM_STORAGE_KEY, seeded.nextPlans),
            saveSharedDocument(COUNTERS_HISTORY_KEY, seeded.nextEntries),
          ]);
        } catch (seedError) {
          console.error('Error guardando historial inicial de contadores:', seedError);
          if (active) {
            setError('Se cargo el plan por km, pero no se pudo inicializar el historial de contadores.');
          }
        }
      }
    };
    load();
    return () => { active = false; };
  }, [isReadOnly]);

  useEffect(() => {
    if (!hydrated || isReadOnly) return;
    saveSharedDocument(KM_STORAGE_KEY, plans)
      .then(() => setError(''))
      .catch((err) => {
        console.error('Error guardando planes por kilometraje:', err);
        setError('No se pudieron guardar los planes por kilometraje en el servidor.');
      });
  }, [plans, hydrated, isReadOnly]);

  useEffect(() => {
    if (!hydrated || isReadOnly) return;
    saveSharedDocument(COUNTERS_HISTORY_KEY, counterHistory)
      .then(() => setError(''))
      .catch((err) => {
        console.error('Error guardando historial de contadores:', err);
        setError('No se pudo guardar el historial de contadores en el servidor.');
      });
  }, [counterHistory, hydrated, isReadOnly]);

  useEffect(() => {
    if (!selectedId && plans.length) {
      setSelectedId(plans[0].id);
      return;
    }
    if (selectedId && !plans.some((item) => item.id === selectedId)) {
      setSelectedId(plans[0]?.id ?? null);
    }
  }, [plans, selectedId]);

  const selectedPlan = useMemo(
    () => plans.find((item) => item.id === selectedId) || null,
    [plans, selectedId],
  );

  const activeAlertsByCycle = useMemo(() => {
    const map = new Map();
    (Array.isArray(otAlerts) ? otAlerts : [])
      .filter((item) => item.status_ot !== 'Cerrada')
      .forEach((item) => {
        map.set(String(item.id), item);
      });
    return map;
  }, [otAlerts]);

  const planRows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return plans
      .map((plan) => {
        const derived = getKmDerivedFields(plan);
        const currentCycleEntry = getCurrentPlanCycleEntry(plan);
        const activeAlert = activeAlertsByCycle.get(buildKmAlertId(plan));
        const statusMeta = activeAlert?.status_ot
          ? (STATUS_META[activeAlert.status_ot] || { label: activeAlert.status_ot, color: '#374151', bg: '#f3f4f6' })
          : derived.status;
        return {
          ...plan,
          ...derived,
          currentCycleEntry,
          displayStatus: statusMeta,
          otStatus: activeAlert?.status_ot || '',
        };
      })
      .filter((plan) => (`${plan.codigo} ${plan.equipo} ${plan.area_trabajo} ${plan.marca} ${plan.modelo} ${plan.responsable}`)
        .toLowerCase()
      .includes(text));
  }, [plans, query, activeAlertsByCycle]);

  const kmTableColumns = useMemo(() => ([
    { id: 'codigo', getValue: (plan) => plan.codigo },
    { id: 'equipo', getValue: (plan) => plan.equipo },
    { id: 'area_trabajo', getValue: (plan) => plan.area_trabajo },
    { id: 'marca', getValue: (plan) => plan.marca || 'N.A.' },
    { id: 'modelo', getValue: (plan) => plan.modelo || 'N.A.' },
    { id: 'vc', getValue: (plan) => plan.vc },
    { id: 'frecuencia', getValue: (plan) => formatCounterValue(plan.intervalo_km) },
    { id: 'per_day', getValue: (plan) => plan.perDay > 0 ? formatCounterValue(plan.perDay) : 'N.A.' },
    { id: 'tipo_pm_ultimo', getValue: (plan) => plan.tipo_pm_ultimo },
    { id: 'km_ultimo_mantenimiento', getValue: (plan) => formatCounterValue(plan.km_ultimo_mantenimiento) },
    { id: 'fecha_ultimo_servicio', getValue: (plan) => formatDateDisplay(plan.fecha_ultimo_servicio) },
    { id: 'actual', getValue: (plan) => formatCounterValue(plan.currentCounter) },
    { id: 'fecha_toma', getValue: (plan) => formatDateDisplay(plan.fecha_toma) },
    { id: 'tipo_pm_proximo', getValue: (plan) => plan.tipo_pm_proximo },
    { id: 'next_counter', getValue: (plan) => formatCounterValue(plan.nextCounter) },
    { id: 'remaining', getValue: (plan) => formatCounterValue(plan.remainingCounter) },
    { id: 'days_remaining', getValue: (plan) => plan.daysRemaining === null ? 'N.A.' : Number(plan.daysRemaining).toLocaleString('es-PE') },
    { id: 'programmed_date', getValue: (plan) => formatDateDisplay(plan.programmedDate) },
    { id: 'fecha_toma_2', getValue: (plan) => formatDateDisplay(plan.fecha_toma) },
    { id: 'status', getValue: (plan) => plan.displayStatus.label },
  ]), []);
  const {
    filters: kmFilters,
    setFilter: setKmFilter,
  } = useTableColumnFilters(kmTableColumns);
  const visiblePlanRows = useMemo(
    () => filterRowsByColumns(planRows, kmTableColumns, kmFilters),
    [planRows, kmTableColumns, kmFilters],
  );

  const filteredEquipos = useMemo(() => {
    const text = equipmentFilter.trim().toLowerCase();
    return normalizeEquiposList(equipos).filter((eq) => (`${eq.codigo} ${eq.descripcion} ${eq.area_trabajo} ${eq.marca} ${eq.modelo}`)
      .toLowerCase()
      .includes(text));
  }, [equipos, equipmentFilter]);

  const packageCatalog = useMemo(
    () => normalizePackagesList(packages).map((item) => ({
      ...item,
      vc_categoria: getPackageVcCategory(item.vc),
    })),
    [packages],
  );

  const filteredPackages = useMemo(() => {
    const text = packageSearch.trim().toLowerCase();
    const targetVc = packageVcFilter === 'AUTO'
      ? (form.vc === 'Hra' ? 'V.C - HRA' : 'V.C - KM')
      : packageVcFilter;

    return packageCatalog
      .filter((item) => targetVc === 'TODOS' ? true : item.vc_categoria === targetVc)
      .filter((item) => (`${item.codigo} ${item.nombre}`).toLowerCase().includes(text));
  }, [packageCatalog, packageSearch, packageVcFilter, form.vc]);

  const selectedDraftPackage = useMemo(
    () => filteredPackages.find((item) => String(item.id) === String(form.paquete_id))
      || packageCatalog.find((item) => String(item.id) === String(form.paquete_id))
      || null,
    [filteredPackages, packageCatalog, form.paquete_id],
  );

  const packageCycleOptions = useMemo(
    () => reindexPackageCycleEntries(packageCycleItems),
    [packageCycleItems],
  );

  const selectedLastExecutedIndex = useMemo(
    () => packageCycleOptions.findIndex((entry) => entry.tipo_pm === normalizePmLabel(form.tipo_pm_ultimo, '')),
    [packageCycleOptions, form.tipo_pm_ultimo],
  );

  const suggestedNextCycleEntry = useMemo(() => {
    if (!packageCycleOptions.length) return null;
    if (!form.has_previous_maintenance) return packageCycleOptions[0];
    if (selectedLastExecutedIndex < 0) return null;
    return packageCycleOptions[(selectedLastExecutedIndex + 1) % packageCycleOptions.length];
  }, [packageCycleOptions, form.has_previous_maintenance, selectedLastExecutedIndex]);

  useEffect(() => {
    if (!form.has_previous_maintenance) {
      if (form.tipo_pm_ultimo || form.km_ultimo_mantenimiento || form.fecha_ultimo_servicio) {
        setForm((prev) => ({
          ...prev,
          tipo_pm_ultimo: '',
          km_ultimo_mantenimiento: '',
          fecha_ultimo_servicio: '',
        }));
      }
      return;
    }

    if (!packageCycleOptions.length) return;
    const exists = packageCycleOptions.some((entry) => entry.tipo_pm === normalizePmLabel(form.tipo_pm_ultimo, ''));
    if (!exists && form.has_previous_maintenance) {
      setForm((prev) => ({
        ...prev,
        tipo_pm_ultimo: packageCycleOptions[0].tipo_pm,
      }));
    }
  }, [form.has_previous_maintenance, form.tipo_pm_ultimo, form.km_ultimo_mantenimiento, form.fecha_ultimo_servicio, packageCycleOptions]);

  const selectedPlanCounters = useMemo(
    () => (selectedPlan ? getPlanCounterEntries(counterHistory, selectedPlan.id) : []),
    [counterHistory, selectedPlan],
  );

  const kmDue = useMemo(
    () => planRows.filter((plan) => plan.displayStatus.label === 'Vencido').length,
    [planRows],
  );

  const kmUpcoming = useMemo(
    () => planRows.filter((plan) => plan.displayStatus.label === 'Proximo' || plan.displayStatus.label === 'Pendiente' || plan.displayStatus.label === 'Creada').length,
    [planRows],
  );

  const counterUpdates = useMemo(() => counterHistory.length, [counterHistory]);

  const openCreate = async () => {
    if (isReadOnly) return;
    const [freshEquipos, freshPackages] = await Promise.all([
      loadSharedDocument(EQUIPOS_STORAGE_KEY, []),
      loadSharedDocument(PACKAGES_STORAGE_KEY, PACKAGES_FALLBACK),
    ]);
    setEquipos(normalizeEquiposList(freshEquipos));
    setPackages(normalizePackagesList(freshPackages));
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      fecha_toma: getTodayInputDate(),
    });
    setPackageVcFilter('AUTO');
    setPackageCycleItems([]);
    setPackageSearch('');
    setEquipmentFilter('');
    setSelectedEquipmentId('');
    setShowModal(true);
  };

  const openEdit = async () => {
    if (isReadOnly) return;
    if (!selectedPlan) return;
    const [freshEquipos, freshPackages] = await Promise.all([
      loadSharedDocument(EQUIPOS_STORAGE_KEY, []),
      loadSharedDocument(PACKAGES_STORAGE_KEY, PACKAGES_FALLBACK),
    ]);
    const normalizedEquipos = normalizeEquiposList(freshEquipos);
    const existingMatch = normalizedEquipos.find((eq) => String(eq.codigo || '') === String(selectedPlan.codigo || ''));
    const modalEquipos = existingMatch
      ? normalizedEquipos
      : [{ id: `legacy_${selectedPlan.id}`, codigo: selectedPlan.codigo, descripcion: selectedPlan.equipo, area_trabajo: selectedPlan.area_trabajo, marca: selectedPlan.marca, modelo: selectedPlan.modelo }, ...normalizedEquipos];

    setEquipos(modalEquipos);
    setPackages(normalizePackagesList(freshPackages));
    setEditingId(selectedPlan.id);
    setSelectedEquipmentId(String((existingMatch || modalEquipos[0])?.id || ''));
    setForm({
      responsable: selectedPlan.responsable || '',
      prioridad: selectedPlan.prioridad || 'Media',
      vc: normalizeVcLabel(selectedPlan.vc),
      area_trabajo: selectedPlan.area_trabajo || '',
      marca: selectedPlan.marca || '',
      modelo: selectedPlan.modelo || '',
      has_previous_maintenance: Boolean(
        (Number(selectedPlan.km_ultimo_mantenimiento) || 0) > 0
        || normalizeDateInput(selectedPlan.fecha_ultimo_servicio)
        || (selectedPlan.tipo_pm_ultimo && selectedPlan.tipo_pm_ultimo !== 'PM0'),
      ),
      km_actual: String(selectedPlan.km_actual || ''),
      km_ultimo_mantenimiento: String(selectedPlan.km_ultimo_mantenimiento || ''),
      intervalo_km: '',
      alerta_km: String(selectedPlan.alerta_km || ''),
      km_por_dia: String(selectedPlan.km_por_dia || ''),
      fecha_ultimo_servicio: normalizeDateInput(selectedPlan.fecha_ultimo_servicio),
      fecha_toma: normalizeDateInput(selectedPlan.fecha_toma),
      tipo_pm_ultimo: selectedPlan.tipo_pm_ultimo === 'PM0' ? '' : normalizePmLabel(selectedPlan.tipo_pm_ultimo, ''),
      paquete_id: '',
    });
    setPackageCycleItems(reindexPackageCycleEntries(getPlanPackageCycle(selectedPlan)));
    setPackageVcFilter('AUTO');
    setPackageSearch('');
    setEquipmentFilter('');
    setShowModal(true);
  };

  const openCounterUpdate = () => {
    if (isReadOnly) return;
    if (!selectedPlan) return;
    setCounterForm({
      valor_contador: String(selectedPlan.km_actual || ''),
      fecha_toma: normalizeDateInput(selectedPlan.fecha_toma || getTodayInputDate()),
    });
    setShowCounterModal(true);
  };

  const openDetail = (planId = selectedId) => {
    if (!planId) return;
    setSelectedId(planId);
    setShowDetailModal(true);
  };

  const deletePlan = () => {
    if (isReadOnly) return;
    if (!selectedPlan) return;
    if (!window.confirm(`Eliminar plan por km ${selectedPlan.codigo}?`)) return;

    setPlans((prev) => prev.filter((item) => item.id !== selectedPlan.id));
    setCounterHistory((prev) => prev.filter((entry) => String(entry.plan_id) !== String(selectedPlan.id)));
  };

  const addPackageToCycle = () => {
    if (isReadOnly) return;
    if (!selectedDraftPackage) {
      window.alert('Selecciona un paquete PM para agregarlo al ciclo.');
      return;
    }

    const expectedCategory = form.vc === 'Hra' ? 'V.C - HRA' : 'V.C - KM';
    if (selectedDraftPackage.vc_categoria !== expectedCategory) {
      window.alert(`Este plan es por ${form.vc}. Solo puedes agregar paquetes clasificados como ${expectedCategory}. Puedes ver otras clasificaciones desde el filtro, pero no mezclarlas en este plan.`);
      return;
    }

    const frequencyValue = toSafeNumber(form.intervalo_km);
    if (!frequencyValue || frequencyValue <= 0) {
      window.alert('La frecuencia del paquete debe ser mayor a cero.');
      return;
    }
    const validationError = validateTextFields([
      ['Paquete PM', selectedDraftPackage.nombre || selectedDraftPackage.package_nombre || selectedDraftPackage.label || ''],
      ...normalizeActivitiesList(selectedDraftPackage.actividades).map((activity, index) => [`Actividad paquete ${index + 1}`, activity]),
    ]);
    if (validationError) {
      window.alert(validationError);
      return;
    }

    const nextEntry = {
      item: packageCycleItems.length + 1,
      tipo_pm: buildPmLabel(packageCycleItems.length + 1),
      frecuencia: frequencyValue,
      vc: normalizeVcLabel(selectedDraftPackage.vc || form.vc),
      package_id: String(selectedDraftPackage.id),
      package_codigo: selectedDraftPackage.codigo || '',
      package_nombre: selectedDraftPackage.nombre || '',
      actividades: normalizeActivitiesList(selectedDraftPackage.actividades),
    };

    setPackageCycleItems((prev) => [...prev, nextEntry]);
    setForm((prev) => ({
      ...prev,
      paquete_id: '',
      intervalo_km: '',
    }));
  };

  const removePackageFromCycle = (index) => {
    if (isReadOnly) return;
    setPackageCycleItems((prev) => reindexPackageCycleEntries(prev.filter((_, idx) => idx !== index)));
  };

  const savePlan = (event) => {
    if (isReadOnly) return;
    event.preventDefault();
    if (!selectedEquipmentId) {
      window.alert('Debes seleccionar un equipo desde Control de equipos.');
      return;
    }
    if (!String(form.responsable || '').trim()) {
      window.alert('Debes registrar un responsable.');
      return;
    }
    if (!packageCycleItems.length) {
      window.alert('Debes agregar al menos un paquete PM al ciclo del plan.');
      return;
    }
    const validationError = firstValidationError(
      validateRequiredFields([
        ['Responsable', form.responsable],
        ['Contador actual', form.km_actual],
        ['Fecha de toma', form.fecha_toma],
      ]),
      validateTextFields([
        ['Responsable', form.responsable],
        ['Area de trabajo', form.area_trabajo],
        ['Marca', form.marca],
        ['Modelo', form.modelo],
        ...packageCycleItems.flatMap((item, index) => [
          [`Paquete ${index + 1}`, item.package_nombre || item.package_codigo || item.tipo_pm || ''],
          ...((item.actividades || []).map((activity, activityIndex) => [`Actividad ${index + 1}.${activityIndex + 1}`, activity])),
        ]),
      ]),
      validateNonNegativeFields([
        ['Contador actual', form.km_actual],
        ['Contador ultimo mantenimiento', form.km_ultimo_mantenimiento],
        ['Alerta contador', form.alerta_km],
        ['Promedio por dia', form.km_por_dia],
      ]),
      validatePositiveFields(packageCycleItems.map((item, index) => [`Frecuencia paquete ${index + 1}`, item.frecuencia])),
    );
    if (validationError) {
      window.alert(validationError);
      return;
    }
    if (form.has_previous_maintenance) {
      if (!form.tipo_pm_ultimo) {
        window.alert('Selecciona cual fue el ultimo paquete de mantenimiento ejecutado.');
        return;
      }
      if (!String(form.km_ultimo_mantenimiento || '').trim()) {
        window.alert(`Debes registrar el ${form.vc === 'Hra' ? 'horometro' : 'kilometraje'} del ultimo mantenimiento.`);
        return;
      }
      if (!String(form.fecha_ultimo_servicio || '').trim()) {
        window.alert('Debes registrar la fecha del ultimo mantenimiento.');
        return;
      }
    }

    const selectedEquipo = equipos.find((item) => String(item.id) === String(selectedEquipmentId));
    const payload = buildPlanPayload(form, selectedEquipo, packageCycleItems, editingId ? selectedPlan : null);

    if (!payload.intervalo_km || payload.intervalo_km <= 0) {
      window.alert('El primer paquete del ciclo debe tener una frecuencia mayor a cero.');
      return;
    }

    if (!editingId && payload.km_actual < 0) {
      window.alert('El contador actual no puede ser negativo.');
      return;
    }

    if (editingId) {
      const existingEntries = getPlanCounterEntries(counterHistory, editingId);
      let seedEntry = null;
      if (!existingEntries.length) {
        seedEntry = createCounterEntry({ ...payload, id: editingId }, {
          value: payload.km_actual,
          fechaToma: payload.fecha_toma,
          source: 'PLAN_INICIAL',
        });
      }

      const nextPlan = {
        ...payload,
        id: editingId,
        counter_initial_id: payload.counter_initial_id || seedEntry?.id || selectedPlan?.counter_initial_id || '',
        ultimo_contador_id: payload.ultimo_contador_id || seedEntry?.id || selectedPlan?.ultimo_contador_id || '',
      };

      setPlans((prev) => prev.map((item) => (item.id === editingId ? nextPlan : item)));
      if (seedEntry) {
        setCounterHistory((prev) => sortCounterEntries([seedEntry, ...prev]));
      }
      setSelectedId(editingId);
    } else {
      const nextId = plans.length ? Math.max(...plans.map((item) => Number(item.id) || 0)) + 1 : 1;
      const initialEntry = createCounterEntry({ ...payload, id: nextId }, {
        value: payload.km_actual,
        fechaToma: payload.fecha_toma,
        source: 'ALTA_PLAN',
      });
      const nextPlan = {
        ...payload,
        id: nextId,
        counter_initial_id: initialEntry.id,
        ultimo_contador_id: initialEntry.id,
      };
      setPlans((prev) => [nextPlan, ...prev]);
      setCounterHistory((prev) => sortCounterEntries([initialEntry, ...prev]));
      setSelectedId(nextId);
    }

    setShowModal(false);
  };

  const saveCounterUpdate = () => {
    if (isReadOnly) return;
    if (!selectedPlan) return;
    const validationError = firstValidationError(
      validateRequiredFields([
        ['Contador', counterForm.valor_contador],
        ['Fecha de toma', counterForm.fecha_toma],
      ]),
      validateNonNegativeFields([['Contador', counterForm.valor_contador]]),
    );
    if (validationError) {
      window.alert(validationError);
      return;
    }
    const nextValue = toSafeNumber(counterForm.valor_contador);
    const takeDate = normalizeDateInput(counterForm.fecha_toma || getTodayInputDate());
    const nextEntry = createCounterEntry(selectedPlan, {
      value: nextValue,
      fechaToma: takeDate,
      source: 'ACTUALIZACION',
    });

    setCounterHistory((prev) => sortCounterEntries([nextEntry, ...prev]));
    setPlans((prev) => prev.map((item) => (
      item.id === selectedPlan.id
        ? {
            ...item,
            km_actual: nextValue,
            fecha_toma: takeDate,
            counter_initial_id: item.counter_initial_id || nextEntry.id,
            ultimo_contador_id: nextEntry.id,
          }
        : item
    )));
    setShowCounterModal(false);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const selectedPlanDerived = selectedPlan ? getKmDerivedFields(selectedPlan) : null;
  const selectedLatestCounter = selectedPlan ? getLatestCounterEntry(counterHistory, selectedPlan.id) : null;
  const canOpenSettingsCounters = hasMinRole('INGENIERO');
  const selectedStatus = selectedPlan
    ? activeAlertsByCycle.get(buildKmAlertId(selectedPlan))
      ? (STATUS_META[activeAlertsByCycle.get(buildKmAlertId(selectedPlan)).status_ot] || selectedPlanDerived?.status)
      : selectedPlanDerived?.status
    : null;

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: isMobile ? '1.65rem' : '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Plan de mantenimiento preventivo - Km</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
          Control de mantenimientos preventivos por kilometraje u horometro acumulado. Cada actualizacion del contador se registra en historial y puede corregirse desde{' '}
          {canOpenSettingsCounters ? (
            <Link to="/settings/contadores" style={{ color: '#2563eb', fontWeight: 700 }}>Configuraciones &gt; Contadores</Link>
          ) : (
            <strong>Configuraciones &gt; Contadores</strong>
          )}.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {isReadOnly && (
        <ReadOnlyAccessNotice
          title="Consulta de planes por Km/Hr"
          message="Con tu perfil puedes revisar planes, ciclos, contadores e historial, pero no crear, editar, actualizar ni eliminar registros."
        />
      )}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <SummaryCard label="Planes por km" value={plans.length} color="#1d4ed8" />
        <SummaryCard label="Vencidos" value={kmDue} color="#dc2626" />
        <SummaryCard label="Proximos" value={kmUpcoming} color="#c2410c" />
        <SummaryCard label="Contadores registrados" value={counterUpdates} color="#059669" helper="Cada actualizacion queda en historial." />
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 1.2fr) auto', gap: '.85rem', alignItems: 'center' }}>
          <input
            className="form-input"
            placeholder="Buscar por codigo, descripcion, area, marca, modelo o responsable"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            {!isReadOnly && <button className="btn btn-primary" type="button" onClick={openCreate}>Agregar</button>}
            <button className="btn btn-secondary" type="button" onClick={() => openDetail()} disabled={!selectedPlan}>Ver</button>
            {!isReadOnly && <button className="btn btn-secondary" type="button" onClick={openEdit} disabled={!selectedPlan}>Editar</button>}
            {!isReadOnly && <button className="btn btn-secondary" type="button" onClick={openCounterUpdate} disabled={!selectedPlan}>Actualizar contador</button>}
            {!isReadOnly && <button className="btn btn-danger" type="button" onClick={deletePlan} disabled={!selectedPlan}>Eliminar</button>}
          </div>
        </div>
      </div>

      {isMobile ? (
        <div style={{ display: 'grid', gap: '.85rem', marginBottom: '1rem' }}>
          {visiblePlanRows.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedId(plan.id)}
              style={{
                textAlign: 'left',
                border: plan.id === selectedId ? '2px solid #2563eb' : '1px solid #dbe4f0',
                background: plan.id === selectedId ? '#eff6ff' : '#fff',
                borderRadius: '1rem',
                padding: '1rem',
                display: 'grid',
                gap: '.8rem',
                boxShadow: '0 8px 24px rgba(15, 23, 42, .06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#111827' }}>{plan.codigo}</div>
                  <div style={{ color: '#334155', marginTop: '.15rem', fontWeight: 600 }}>{plan.equipo}</div>
                  <div style={{ color: '#64748b', fontSize: '.88rem', marginTop: '.2rem' }}>
                    {plan.area_trabajo} | {plan.marca} | {plan.modelo || 'N.A.'}
                  </div>
                </div>
                <span style={{ display: 'inline-flex', padding: '.3rem .65rem', borderRadius: '999px', background: plan.displayStatus.bg, color: plan.displayStatus.color, fontWeight: 700, fontSize: '.78rem' }}>
                  {plan.displayStatus.label}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.65rem' }}>
                <div style={{ padding: '.75rem', background: '#f8fafc', borderRadius: '.8rem', border: '1px solid #e5e7eb' }}>
                  <div style={{ color: '#64748b', fontSize: '.8rem' }}>Actual</div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatCounterValue(plan.currentCounter)}</div>
                </div>
                <div style={{ padding: '.75rem', background: '#f8fafc', borderRadius: '.8rem', border: '1px solid #e5e7eb' }}>
                  <div style={{ color: '#64748b', fontSize: '.8rem' }}>Proximo</div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatCounterValue(plan.nextCounter)}</div>
                </div>
                <div style={{ padding: '.75rem', background: '#f8fafc', borderRadius: '.8rem', border: '1px solid #e5e7eb' }}>
                  <div style={{ color: '#64748b', fontSize: '.8rem' }}>Faltantes</div>
                  <div style={{ fontWeight: 800, color: plan.remainingCounter === 0 ? '#dc2626' : '#0f172a' }}>{formatCounterValue(plan.remainingCounter)}</div>
                </div>
                <div style={{ padding: '.75rem', background: '#f8fafc', borderRadius: '.8rem', border: '1px solid #e5e7eb' }}>
                  <div style={{ color: '#64748b', fontSize: '.8rem' }}>Dias</div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{plan.daysRemaining === null ? 'N.A.' : plan.daysRemaining}</div>
                </div>
              </div>

              <div style={{ color: '#475569', fontSize: '.88rem', lineHeight: 1.5 }}>
                Ultimo servicio: {plan.tipo_pm_ultimo} | {formatDateDisplay(plan.fecha_ultimo_servicio)} <br />
                Toma actual: {formatDateDisplay(plan.fecha_toma)} | Frecuencia: {formatCounterValue(plan.intervalo_km)} {plan.vc}<br />
                Proximo paquete: {plan.paquete_nombre || plan.currentCycleEntry?.package_nombre || plan.tipo_pm_proximo}
              </div>
            </button>
          ))}

          {!visiblePlanRows.length && (
            <div className="card" style={{ marginBottom: 0, color: '#6b7280', textAlign: 'center' }}>
              No hay planes por kilometraje que coincidan con los filtros aplicados.
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '2100px' }}>
            <thead>
              <tr style={{ background: '#0f3c63', color: '#fff' }}>
                <th colSpan={8} style={{ padding: '.55rem .6rem', border: '1px solid #265277', textAlign: 'center' }}>Datos generales del equipo</th>
                <th colSpan={3} style={{ padding: '.55rem .6rem', border: '1px solid #265277', textAlign: 'center' }}>Ultimo servicio ejecutado</th>
                <th colSpan={2} style={{ padding: '.55rem .6rem', border: '1px solid #265277', textAlign: 'center' }}>Datos actuales Hr/Km</th>
                <th colSpan={7} style={{ padding: '.55rem .6rem', border: '1px solid #265277', textAlign: 'center' }}>Proximo servicio a ejecutar</th>
              </tr>
              <tr style={{ background: '#153f68', color: '#fff' }}>
                {[
                  'Codigo',
                  'Descripcion',
                  'Area de trabajo',
                  'Marca',
                  'Modelo',
                  'V.C',
                  'Frecuencia',
                  'Hrs / Kms x Dia',
                  'Tipo de PM',
                  'Hra/Km',
                  'Fecha',
                  'Hra/Km',
                  'Fecha',
                  'Tipo PM',
                  'Hra/Km',
                  'Hr/Km faltantes',
                  'Dias faltantes',
                  'Fecha programada',
                  'Fecha de toma',
                  'Status',
                ].map((header) => (
                  <th key={header} style={{ padding: '.55rem .6rem', border: '1px solid #2c5579', textAlign: 'left', fontSize: '.82rem' }}>
                    {header}
                  </th>
                ))}
              </tr>
              <TableFilterRow columns={kmTableColumns} rows={planRows} filters={kmFilters} onChange={setKmFilter} dark />
            </thead>
            <tbody>
              {visiblePlanRows.map((plan) => (
                <tr
                  key={plan.id}
                  onClick={() => setSelectedId(plan.id)}
                  style={{ background: plan.id === selectedId ? '#dbeafe' : '#fff', cursor: 'pointer' }}
                >
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0', fontWeight: 700 }}>{plan.codigo}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{plan.equipo}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{plan.area_trabajo}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{plan.marca || 'N.A.'}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{plan.modelo || 'N.A.'}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{plan.vc}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{formatCounterValue(plan.intervalo_km)}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{plan.perDay > 0 ? formatCounterValue(plan.perDay) : 'N.A.'}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{plan.tipo_pm_ultimo}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{formatCounterValue(plan.km_ultimo_mantenimiento)}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{formatDateDisplay(plan.fecha_ultimo_servicio)}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{formatCounterValue(plan.currentCounter)}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{formatDateDisplay(plan.fecha_toma)}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{plan.tipo_pm_proximo}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{formatCounterValue(plan.nextCounter)}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0', fontWeight: 700, color: plan.remainingCounter === 0 ? '#dc2626' : '#111827' }}>{formatCounterValue(plan.remainingCounter)}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{plan.daysRemaining === null ? 'N.A.' : Number(plan.daysRemaining).toLocaleString('es-PE')}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{formatDateDisplay(plan.programmedDate)}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{formatDateDisplay(plan.fecha_toma)}</td>
                  <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>
                    <span style={{ display: 'inline-flex', padding: '.2rem .55rem', borderRadius: '999px', background: plan.displayStatus.bg, color: plan.displayStatus.color, fontWeight: 700, fontSize: '.78rem' }}>
                      {plan.displayStatus.label}
                    </span>
                  </td>
                </tr>
              ))}
              {!visiblePlanRows.length && (
                <tr>
                  <td colSpan={20} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                    No hay planes por kilometraje que coincidan con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showDetailModal && selectedPlan && selectedPlanDerived && (
        <Modal title={`Detalle del plan por km - ${selectedPlan.codigo}`} onClose={() => setShowDetailModal(false)}>
          <KmPlanDetailContent
            selectedPlan={selectedPlan}
            selectedPlanDerived={selectedPlanDerived}
            selectedStatus={selectedStatus}
            selectedPlanCounters={selectedPlanCounters}
            selectedLatestCounter={selectedLatestCounter}
            canOpenSettingsCounters={canOpenSettingsCounters}
            isMobile={isMobile}
          />
        </Modal>
      )}

      {showModal && (
        <Modal title={editingId ? 'Editar plan por kilometraje' : 'Agregar plan por kilometraje'} onClose={() => setShowModal(false)}>
          <form onSubmit={savePlan}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e5e7eb', background: '#f8fafc' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.75rem' }}>Equipo y programacion base</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem' }}>
                  <ConfigurableSelectField
                    label="Responsable *"
                    value={form.responsable}
                    options={responsibleOptions}
                    onChange={(event) => setForm({ ...form, responsable: event.target.value })}
                    onQuickAdd={() => quickAddToForm('responsables', 'responsable', 'responsable')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona responsable"
                    required
                    disabled={isReadOnly}
                  />
                  <ConfigurableSelectField
                    label="Prioridad"
                    value={form.prioridad}
                    options={priorityOptions}
                    onChange={(event) => setForm({ ...form, prioridad: event.target.value })}
                    onQuickAdd={() => quickAddToForm('prioridades', 'prioridad', 'prioridad')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona prioridad"
                    disabled={isReadOnly}
                  />
                  <ConfigurableSelectField
                    label="V.C"
                    value={form.vc}
                    options={vcOptions}
                    onChange={(event) => setForm({ ...form, vc: event.target.value })}
                    onQuickAdd={() => quickAddToForm('variaciones_control', 'V.C', 'vc')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona V.C"
                    disabled={isReadOnly}
                  />
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Hrs / Kms x dia</label>
                    <input type="number" min="0" className="form-input" value={form.km_por_dia} onChange={(event) => setForm({ ...form, km_por_dia: event.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Alerta anticipada ({form.vc})</label>
                    <input type="number" min="0" className="form-input" value={form.alerta_km} onChange={(event) => setForm({ ...form, alerta_km: event.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label className="form-label">Buscar equipo desde Control de equipos</label>
                    <input className="form-input" placeholder="Buscar por codigo, descripcion, area, marca o modelo" value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label className="form-label">Equipo *</label>
                    <select className="form-select" value={selectedEquipmentId} onChange={(event) => setSelectedEquipmentId(event.target.value)} required>
                      <option value="">Selecciona equipo...</option>
                      {filteredEquipos.map((equipment) => (
                        <option key={equipment.id} value={String(equipment.id)}>
                          {getEquipmentLabel(equipment)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e5e7eb', background: '#fff' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.75rem' }}>Datos generales del equipo en este plan</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem' }}>
                  <ConfigurableSelectField
                    label="Area de trabajo"
                    value={form.area_trabajo}
                    options={areaOptions}
                    onChange={(event) => setForm({ ...form, area_trabajo: event.target.value })}
                    onQuickAdd={() => quickAddToForm('areas_trabajo', 'area de trabajo', 'area_trabajo')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona area"
                    disabled={isReadOnly}
                  />
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Marca</label>
                    <input className="form-input" value={form.marca} onChange={(event) => setForm({ ...form, marca: event.target.value })} placeholder="Se completa desde el equipo" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Modelo</label>
                    <input className="form-input" value={form.modelo} onChange={(event) => setForm({ ...form, modelo: event.target.value })} placeholder="Opcional" />
                  </div>
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e5e7eb', background: '#fff' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.75rem' }}>Datos actuales Hr / Km</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Hra / Km actual {editingId ? '' : '*'}</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={editingId ? selectedPlan?.km_actual ?? '' : form.km_actual}
                      onChange={(event) => !editingId && setForm({ ...form, km_actual: event.target.value })}
                      readOnly={!!editingId}
                      required={!editingId}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Fecha de toma</label>
                    <input
                      type="date"
                      className="form-input"
                      value={editingId ? normalizeDateInput(selectedPlan?.fecha_toma) : form.fecha_toma}
                      onChange={(event) => !editingId && setForm({ ...form, fecha_toma: event.target.value })}
                      readOnly={!!editingId}
                    />
                  </div>
                </div>
                {editingId && (
                  <div style={{ marginTop: '.75rem', padding: '.85rem 1rem', borderRadius: '.85rem', background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', fontSize: '.92rem' }}>
                    El contador actual y su fecha de toma se corrigen desde <strong>Actualizar contador</strong> o desde <strong>Configuraciones &gt; Contadores</strong>, para conservar el historial correctamente.
                  </div>
                )}
              </div>

              <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e5e7eb', background: '#fff' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.3rem' }}>Secuencia ciclica de paquetes PM</div>
                <div style={{ color: '#64748b', marginBottom: '.85rem', lineHeight: 1.6 }}>
                  Agrega los paquetes en el orden en que deben ejecutarse. Cuando el plan termine el ultimo paquete, el siguiente ciclo volvera automaticamente al primero.
                </div>

                <div style={{ display: 'grid', gap: '.85rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem' }}>
                    <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                      <label className="form-label">Clasificacion del paquete PM</label>
                      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                        {[
                          { value: 'AUTO', label: `Sugeridos ${form.vc === 'Hra' ? 'V.C - HRA' : 'V.C - KM'}` },
                          { value: 'TODOS', label: 'Todos' },
                          { value: 'V.C - DIA', label: 'V.C - DIA' },
                          { value: 'V.C - HRA', label: 'V.C - HRA' },
                          { value: 'V.C - KM', label: 'V.C - KM' },
                        ].map((option) => {
                          const active = packageVcFilter === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setPackageVcFilter(option.value)}
                              style={{
                                padding: '.5rem .8rem',
                                borderRadius: '999px',
                                border: active ? '1px solid #2563eb' : '1px solid #dbe4f0',
                                background: active ? '#eff6ff' : '#fff',
                                color: active ? '#1d4ed8' : '#475569',
                                fontWeight: 700,
                                fontSize: '.84rem',
                              }}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Filtrar paquetes PM</label>
                      <input
                        className="form-input"
                        placeholder={`Buscar paquetes ${packageVcFilter === 'AUTO' ? (form.vc === 'Hra' ? 'V.C - HRA' : 'V.C - KM') : packageVcFilter}...`}
                        value={packageSearch}
                        onChange={(event) => setPackageSearch(event.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Paquete PM</label>
                      <select className="form-select" value={form.paquete_id || ''} onChange={(event) => setForm({ ...form, paquete_id: event.target.value })}>
                        <option value="">-- Seleccionar paquete --</option>
                        {filteredPackages.map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            {item.codigo} | {item.vc_categoria} | {item.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Frecuencia del paquete ({form.vc}) *</label>
                      <input
                        type="number"
                        min="1"
                        className="form-input"
                        value={form.intervalo_km}
                        onChange={(event) => setForm({ ...form, intervalo_km: event.target.value })}
                        placeholder={`Ejemplo: ${form.vc === 'Hra' ? '250' : '5000'}`}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, alignSelf: 'end' }}>
                      <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={addPackageToCycle}>
                        Agregar paquete al ciclo
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: '.95rem 1rem', borderRadius: '.95rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.45rem' }}>Vista previa del paquete seleccionado</div>
                    {selectedDraftPackage ? (
                      <div style={{ display: 'grid', gap: '.35rem', color: '#475569' }}>
                        <div>
                          <strong>{selectedDraftPackage.codigo}</strong> | {selectedDraftPackage.vc_categoria} | {selectedDraftPackage.nombre}
                        </div>
                        <div style={{ whiteSpace: 'pre-line', lineHeight: 1.65 }}>
                          {normalizeActivitiesList(selectedDraftPackage.actividades).join('\n') || 'Este paquete no tiene actividades registradas.'}
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#6b7280' }}>
                        Selecciona un paquete para revisar sus actividades antes de agregarlo al ciclo.
                      </div>
                    )}
                  </div>

                  {isMobile ? (
                    <div style={{ display: 'grid', gap: '.7rem' }}>
                      {packageCycleItems.map((entry, index) => (
                        <div key={`${entry.package_id || entry.package_codigo || entry.tipo_pm}-${index}`} style={{ border: '1px solid #e5e7eb', borderRadius: '.95rem', padding: '.9rem', background: index === 0 ? '#eff6ff' : '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.45rem' }}>
                            <strong>{entry.tipo_pm}</strong>
                            {index === 0 ? <span style={{ color: '#2563eb', fontWeight: 700, fontSize: '.82rem' }}>Proximo en ejecutarse</span> : null}
                          </div>
                          <div style={{ color: '#334155', lineHeight: 1.6, marginBottom: '.75rem' }}>
                            <div>Frecuencia: <strong>{formatCounterValue(entry.frecuencia)}</strong> {entry.vc}</div>
                            <div>Paquete: <strong>{entry.package_nombre || entry.package_codigo || 'Sin nombre'}</strong></div>
                          </div>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removePackageFromCycle(index)}>Quitar</button>
                        </div>
                      ))}
                      {!packageCycleItems.length && (
                        <div style={{ border: '1px dashed #cbd5e1', borderRadius: '.95rem', padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                          Aun no has agregado paquetes al ciclo.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="card" style={{ marginBottom: 0, padding: '.75rem', overflowX: 'auto' }}>
                      <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            <th style={{ border: '1px solid #e5e7eb', padding: '.45rem', width: '90px' }}>Item</th>
                            <th style={{ border: '1px solid #e5e7eb', padding: '.45rem', width: '150px' }}>Frecuencia</th>
                            <th style={{ border: '1px solid #e5e7eb', padding: '.45rem', width: '150px' }}>Var. Ctrl</th>
                            <th style={{ border: '1px solid #e5e7eb', padding: '.45rem', textAlign: 'left' }}>Paquete PM</th>
                            <th style={{ border: '1px solid #e5e7eb', padding: '.45rem', width: '130px' }}>Accion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {packageCycleItems.map((entry, index) => (
                            <tr key={`${entry.package_id || entry.package_codigo || entry.tipo_pm}-${index}`} style={{ background: index === 0 ? '#eff6ff' : '#fff' }}>
                              <td style={{ border: '1px solid #e5e7eb', padding: '.45rem', textAlign: 'center', fontWeight: 700 }}>{entry.tipo_pm}</td>
                              <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{formatCounterValue(entry.frecuencia)}</td>
                              <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{entry.vc}</td>
                              <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{entry.package_nombre || entry.package_codigo || 'Sin nombre'}</td>
                              <td style={{ border: '1px solid #e5e7eb', padding: '.45rem', textAlign: 'center' }}>
                                <button type="button" className="btn btn-danger btn-sm" onClick={() => removePackageFromCycle(index)}>Quitar</button>
                              </td>
                            </tr>
                          ))}
                          {!packageCycleItems.length && (
                            <tr>
                              <td colSpan={5} style={{ border: '1px solid #e5e7eb', padding: '.75rem', textAlign: 'center', color: '#6b7280' }}>
                                Aun no has agregado paquetes al ciclo.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e5e7eb', background: '#fff' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.75rem' }}>Ultimo servicio ejecutado</div>
                <div style={{ marginBottom: '.95rem', padding: '.9rem 1rem', borderRadius: '.95rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.55rem', color: '#0f172a', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={!!form.has_previous_maintenance}
                      onChange={(event) => setForm((prev) => ({ ...prev, has_previous_maintenance: event.target.checked }))}
                    />
                    El equipo ya tiene recorrido e historial de mantenimiento previo
                  </label>
                  <div style={{ color: '#64748b', marginTop: '.45rem', lineHeight: 1.6 }}>
                    Activa esta opcion cuando el equipo ya venga trabajando y necesites arrancar el plan desde su ultimo mantenimiento real.
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Ultimo paquete ejecutado</label>
                    <select
                      className="form-select"
                      value={form.has_previous_maintenance ? form.tipo_pm_ultimo : ''}
                      onChange={(event) => setForm({ ...form, tipo_pm_ultimo: event.target.value })}
                      disabled={!form.has_previous_maintenance || !packageCycleOptions.length}
                    >
                      <option value="">
                        {packageCycleOptions.length ? '-- Seleccionar ultimo mantenimiento --' : 'Primero agrega paquetes al ciclo'}
                      </option>
                      {packageCycleOptions.map((entry) => (
                        <option key={entry.tipo_pm} value={entry.tipo_pm}>
                          {entry.tipo_pm} | {entry.package_nombre || entry.package_codigo || 'Paquete sin nombre'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Hra / Km ultimo servicio {form.has_previous_maintenance ? '*' : ''}</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={form.km_ultimo_mantenimiento}
                      onChange={(event) => setForm({ ...form, km_ultimo_mantenimiento: event.target.value })}
                      disabled={!form.has_previous_maintenance}
                      required={!!form.has_previous_maintenance}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Fecha ultimo servicio {form.has_previous_maintenance ? '*' : ''}</label>
                    <input
                      type="date"
                      className="form-input"
                      value={form.fecha_ultimo_servicio}
                      onChange={(event) => setForm({ ...form, fecha_ultimo_servicio: event.target.value })}
                      disabled={!form.has_previous_maintenance}
                      required={!!form.has_previous_maintenance}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '.8rem', padding: '.85rem 1rem', borderRadius: '.9rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', lineHeight: 1.6 }}>
                  {form.has_previous_maintenance ? (
                    suggestedNextCycleEntry ? (
                      <>
                        Proximo paquete sugerido para este plan: <strong>{suggestedNextCycleEntry.tipo_pm}</strong> | {suggestedNextCycleEntry.package_nombre || suggestedNextCycleEntry.package_codigo || 'Paquete sin nombre'}
                      </>
                    ) : (
                      <>Selecciona el ultimo paquete ejecutado para que el sistema calcule el siguiente.</>
                    )
                  ) : (
                    <>Si el equipo empieza un ciclo nuevo, el sistema tomara como primer paquete el <strong>PM1</strong>.</>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Guardar plan'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showCounterModal && selectedPlan && (
        <Modal title={`Actualizar contador - ${selectedPlan.codigo}`} onClose={() => setShowCounterModal(false)} maxWidth="560px">
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ padding: '1rem', borderRadius: '.95rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.35rem' }}>{selectedPlan.equipo}</div>
              <div style={{ color: '#64748b', lineHeight: 1.6 }}>
                Ultimo valor: <strong>{formatCounterValue(selectedPlan.km_actual)}</strong> | Fecha de toma: <strong>{formatDateDisplay(selectedPlan.fecha_toma)}</strong>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '.85rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nuevo contador ({selectedPlan.vc})</label>
                <input type="number" min="0" className="form-input" value={counterForm.valor_contador} onChange={(event) => setCounterForm((prev) => ({ ...prev, valor_contador: event.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha de toma</label>
                <input type="date" className="form-input" value={counterForm.fecha_toma} onChange={(event) => setCounterForm((prev) => ({ ...prev, fecha_toma: event.target.value }))} />
              </div>
            </div>

            <div style={{ padding: '.9rem 1rem', borderRadius: '.9rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '.92rem', lineHeight: 1.6 }}>
              Cada actualizacion genera un historial que luego puede corregirse desde <strong>Configuraciones &gt; Contadores</strong> si el valor se ingreso de forma erronea.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCounterModal(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={saveCounterUpdate}>Guardar contador</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
