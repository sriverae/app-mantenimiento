import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ConfigurableSelectField from '../components/ConfigurableSelectField';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import useConfigurableLists from '../hooks/useConfigurableLists';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { isReadOnlyRole } from '../utils/roleAccess';
import { formatDateDisplay } from '../utils/dateFormat';
import {
  getDatePlanCycle,
  getDatePlanCycleSummary,
  getDatePlanOccurrencesInWindow,
  inferLegacyDays,
  normalizeDateCycleEntry,
  normalizeDateInput,
  reindexDateCycleEntries,
  splitActivitiesList,
} from '../utils/datePlanCycle';
import { filterRowsByColumns } from '../utils/tableFilters';
import {
  firstValidationError,
  validateNonNegativeFields,
  validatePositiveFields,
  validateRequiredFields,
  validateTextFields,
} from '../utils/formValidation';

const PLAN_STORAGE_KEY = SHARED_DOCUMENT_KEYS.maintenancePlans;
const EQUIPOS_STORAGE_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const PACKAGES_STORAGE_KEY = SHARED_DOCUMENT_KEYS.maintenancePackages;
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const OT_DELETED_KEY = SHARED_DOCUMENT_KEYS.otDeleted;
const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const PACKAGES_FALLBACK = [
  {
    id: 1,
    codigo: 'PK-001',
    vc: 'V.C - DIA',
    vc_categoria: 'V.C - DIA',
    nombre: 'SECADO_ELEVADOR',
    tiempo_min: 60,
    actividades: ['Inspeccion visual general', 'Limpieza de componentes', 'Verificacion de ajuste de pernos'],
  },
];

const INITIAL_PLANS = [
  {
    id: 1,
    codigo: 'IAISPL1',
    equipo: 'Pre Limpia Sabreca N 1',
    prioridad: 'Alta',
    responsable: 'Mecanico',
    fecha_inicio: '2026-04-01',
    dias_anticipacion_alerta: 2,
    cycle_entries: [
      {
        source_type: 'manual',
        label: 'Inspeccion de fajas y sensores',
        frecuencia_dias: 30,
        actividades: ['Inspeccion de fajas', 'Limpieza de componentes', 'Verificacion de sensores'],
      },
      {
        source_type: 'manual',
        label: 'Revision de ajuste y lubricacion',
        frecuencia_dias: 15,
        actividades: ['Revision de ajuste de pernos', 'Lubricacion general de puntos criticos'],
      },
    ],
  },
  {
    id: 2,
    codigo: 'IAISPL2',
    equipo: 'Pre Limpia Superbrix N 2',
    prioridad: 'Media',
    responsable: 'Electricista',
    fecha_inicio: '2026-04-10',
    dias_anticipacion_alerta: 3,
    cycle_entries: [
      {
        source_type: 'manual',
        label: 'Ajuste electrico preventivo',
        frecuencia_dias: 60,
        actividades: ['Ajuste de conexiones', 'Revision de consumo electrico'],
      },
    ],
  },
];

const EMPTY_FORM = {
  codigo: '',
  equipo: '',
  prioridad: 'Media',
  responsable: '',
  fecha_inicio: new Date().toISOString().slice(0, 10),
  dias_anticipacion_alerta: 0,
  paquete_id: '',
  package_frequency_days: '',
};

const STATUS_META = {
  closed: { label: 'Cerrado', bg: '#dcfce7', color: '#166534', border: '#86efac' },
  deleted: { label: 'Eliminado', bg: '#e5e7eb', color: '#4b5563', border: '#cbd5e1' },
  pending: { label: 'Pendiente', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
  planned: { label: 'Programado', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
};

function Modal({ title, onClose, children }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, .55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '.9rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1120px',
          maxHeight: '92vh',
          background: '#fff',
          borderRadius: '1rem',
          boxShadow: '0 24px 64px rgba(15, 23, 42, .24)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', padding: '1rem 1.15rem', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{title}</h3>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ padding: '1rem 1.1rem 1.15rem', overflowY: 'auto' }}>
          {children}
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
      area_trabajo: eq.area_trabajo || '',
      marca: eq.marca || '',
      modelo: eq.modelo || '',
      ...eq,
    }));
}

function normalizePackagesList(items) {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((pkg, index) => ({
      id: pkg.id ?? `pkg_${index}_${pkg.codigo || 'sin_codigo'}`,
      codigo: pkg.codigo || '',
      nombre: pkg.nombre || pkg.package_nombre || '',
      vc: pkg.vc || pkg.vc_categoria || 'V.C - DIA',
      vc_categoria: pkg.vc_categoria || pkg.vc || 'V.C - DIA',
      actividades: Array.isArray(pkg.actividades) ? pkg.actividades : splitActivitiesList(pkg.actividades),
      ...pkg,
    }));
}

function normalizePlan(plan, index = 0) {
  const cycleEntries = getDatePlanCycle(plan);
  const firstEntry = cycleEntries[0] || null;

  return {
    ...plan,
    id: plan?.id ?? `plan_${index + 1}`,
    codigo: plan?.codigo || '',
    equipo: plan?.equipo || '',
    area_trabajo: plan?.area_trabajo || '',
    prioridad: plan?.prioridad || 'Media',
    responsable: plan?.responsable || '',
    fecha_inicio: normalizeDateInput(plan?.fecha_inicio) || new Date().toISOString().slice(0, 10),
    dias_anticipacion_alerta: Math.max(0, Number(plan?.dias_anticipacion_alerta ?? plan?.alerta_previa_dias ?? plan?.aviso_dias ?? 0) || 0),
    cycle_entries: cycleEntries,
    actividades: firstEntry?.actividades?.join('\n') || splitActivitiesList(plan?.actividades).join('\n'),
    paquete_id: firstEntry?.package_id || plan?.paquete_id || '',
    frecuencia: cycleEntries.length > 1
      ? `${cycleEntries.length} pasos`
      : `${firstEntry?.frecuencia_dias || inferLegacyDays(plan?.frecuencia, 30)} dias`,
  };
}

function normalizePlans(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => normalizePlan(item, index));
}

function getDeletedIdSet(items) {
  return new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => (typeof item === 'string' ? item : item?.id || item?.alert_id || ''))
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  );
}

function getCycleStepShortLabel(entry) {
  if (!entry) return '';
  const stepNumber = Number(String(entry.marker || '').replace(/\D+/g, '')) || 1;
  return entry.source_type === 'manual'
    ? `Paso ${stepNumber} · ${entry.label}`
    : `Paso ${stepNumber} · ${entry.package_nombre || entry.package_codigo || entry.label}`;
}

function getCycleStepBadge(entry, compact = false) {
  const stepNumber = Number(String(entry?.marker || '').replace(/\D+/g, '')) || 1;
  return compact ? String(stepNumber) : `Paso ${stepNumber}`;
}

function getCycleStepDetail(entry) {
  if (!entry) return '';
  const activities = Array.isArray(entry.actividades) ? entry.actividades.join(', ') : '';
  if (activities) return activities;
  return entry.label || '';
}

function getOccurrenceState(occurrenceId, activeAlertMap, closedIds, deletedIds, aliases = []) {
  const keys = [occurrenceId, ...aliases].map((item) => String(item || ''));
  if (keys.some((key) => closedIds.has(key))) return STATUS_META.closed;
  if (keys.some((key) => deletedIds.has(key))) return STATUS_META.deleted;
  if (keys.some((key) => activeAlertMap.has(key))) return STATUS_META.pending;
  return STATUS_META.planned;
}

function buildPlanPayload(form, equipment, cycleEntries, existingPlan = null) {
  const normalizedCycle = reindexDateCycleEntries(cycleEntries);
  const firstEntry = normalizedCycle[0] || null;

  return normalizePlan({
    ...existingPlan,
    ...form,
    codigo: equipment?.codigo || existingPlan?.codigo || form.codigo || '',
    equipo: equipment?.descripcion || existingPlan?.equipo || form.equipo || '',
    area_trabajo: equipment?.area_trabajo || existingPlan?.area_trabajo || '',
    cycle_entries: normalizedCycle,
    actividades: firstEntry?.actividades?.join('\n') || '',
    paquete_id: firstEntry?.package_id || '',
    frecuencia: normalizedCycle.length > 1
      ? `${normalizedCycle.length} pasos`
      : `${firstEntry?.frecuencia_dias || 30} dias`,
  });
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function buildPlanKey(plan) {
  return `${plan.codigo} | ${plan.equipo}`;
}

export default function PmpFechas() {
  const { user } = useAuth();
  const isReadOnly = isReadOnlyRole(user);
  const {
    getOptions,
    addOptionQuickly,
    canManage: canManageConfigurableLists,
  } = useConfigurableLists();
  const [plans, setPlans] = useState(normalizePlans(INITIAL_PLANS));
  const [selectedId, setSelectedId] = useState(INITIAL_PLANS[0]?.id ?? null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [equipos, setEquipos] = useState([]);
  const [packages, setPackages] = useState(PACKAGES_FALLBACK);
  const [alerts, setAlerts] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [deletedAlertIds, setDeletedAlertIds] = useState([]);
  const [equipmentAreaFilter, setEquipmentAreaFilter] = useState('');
  const [equipmentCodeFilter, setEquipmentCodeFilter] = useState('');
  const [equipmentTextFilter, setEquipmentTextFilter] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [cycleItems, setCycleItems] = useState([]);
  const [cycleEditorMode, setCycleEditorMode] = useState('package');
  const [editingCycleIndex, setEditingCycleIndex] = useState(null);
  const [packageVcFilter, setPackageVcFilter] = useState('AUTO');
  const [packageFilterText, setPackageFilterText] = useState('');
  const [packageActivitiesDraft, setPackageActivitiesDraft] = useState('');
  const [manualLabelInput, setManualLabelInput] = useState('');
  const [manualFrequencyDays, setManualFrequencyDays] = useState('');
  const [manualActivitiesDraft, setManualActivitiesDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 960 : false));
  const [detailPlanId, setDetailPlanId] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setIsMobile(window.innerWidth < 960);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [
        loadedPlans,
        loadedEquipos,
        loadedPackages,
        loadedAlerts,
        loadedHistory,
        loadedDeleted,
      ] = await Promise.all([
        loadSharedDocument(PLAN_STORAGE_KEY, INITIAL_PLANS),
        loadSharedDocument(EQUIPOS_STORAGE_KEY, []),
        loadSharedDocument(PACKAGES_STORAGE_KEY, PACKAGES_FALLBACK),
        loadSharedDocument(OT_ALERTS_KEY, []),
        loadSharedDocument(OT_HISTORY_KEY, []),
        loadSharedDocument(OT_DELETED_KEY, []),
      ]);
      if (!active) return;

      const nextPlans = normalizePlans(Array.isArray(loadedPlans) && loadedPlans.length ? loadedPlans : INITIAL_PLANS);
      setPlans(nextPlans);
      setSelectedId(nextPlans[0]?.id ?? null);
      setEquipos(normalizeEquiposList(loadedEquipos));
      setPackages(normalizePackagesList(Array.isArray(loadedPackages) && loadedPackages.length ? loadedPackages : PACKAGES_FALLBACK));
      setAlerts(Array.isArray(loadedAlerts) ? loadedAlerts : []);
      setHistoryRows(Array.isArray(loadedHistory) ? loadedHistory : []);
      setDeletedAlertIds(Array.isArray(loadedDeleted) ? loadedDeleted : []);
      setHydrated(true);
      setLoading(false);
    };

    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || isReadOnly) return;
    saveSharedDocument(PLAN_STORAGE_KEY, plans)
      .then(() => setError(''))
      .catch((err) => {
        console.error('Error guardando planes PMP por fecha:', err);
        setError('No se pudieron guardar los planes PMP por fecha en el servidor.');
      });
  }, [plans, hydrated, isReadOnly]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => String(plan.id) === String(selectedId)) || null,
    [plans, selectedId],
  );

  const activeAlertMap = useMemo(
    () => new Map(
      (Array.isArray(alerts) ? alerts : [])
        .filter((item) => item.status_ot !== 'Cerrada' && item.origen_programacion === 'FECHA')
        .map((item) => [String(item.id), item]),
    ),
    [alerts],
  );

  const closedHistoryIds = useMemo(
    () => new Set((Array.isArray(historyRows) ? historyRows : []).map((item) => String(item.id))),
    [historyRows],
  );

  const deletedIdSet = useMemo(() => getDeletedIdSet(deletedAlertIds), [deletedAlertIds]);

  const monthStart = useMemo(
    () => new Date(calendarYear, calendarMonth, 1).toISOString().slice(0, 10),
    [calendarYear, calendarMonth],
  );
  const monthEnd = useMemo(
    () => new Date(calendarYear, calendarMonth + 1, 0).toISOString().slice(0, 10),
    [calendarYear, calendarMonth],
  );

  const planMonthMap = useMemo(() => {
    const map = new Map();
    plans.forEach((plan) => {
      const occurrences = getDatePlanOccurrencesInWindow(plan, monthStart, monthEnd);
      const byDay = new Map();
      occurrences.forEach((occurrence) => {
        const day = Number(String(occurrence.fecha).slice(8, 10));
        const rows = byDay.get(day) || [];
        rows.push(occurrence);
        byDay.set(day, rows);
      });
      map.set(String(plan.id), { occurrences, byDay });
    });
    return map;
  }, [plans, monthStart, monthEnd]);

  const planRows = useMemo(
    () => plans.map((plan) => ({
      ...plan,
      cycleSummary: getDatePlanCycleSummary(plan, isMobile ? 3 : 4),
      monthData: planMonthMap.get(String(plan.id)) || { occurrences: [], byDay: new Map() },
    })),
    [plans, planMonthMap, isMobile],
  );

  const planTableColumns = useMemo(() => ([
    { id: 'ver', filterable: false },
    { id: 'codigo', getValue: (plan) => plan.codigo },
    { id: 'equipo', getValue: (plan) => plan.equipo },
    { id: 'prioridad', getValue: (plan) => plan.prioridad },
    { id: 'responsable', getValue: (plan) => plan.responsable },
    { id: 'inicio_ciclo', getValue: (plan) => formatDateDisplay(plan.fecha_inicio) },
    { id: 'aviso_ot', getValue: (plan) => (Number(plan.dias_anticipacion_alerta) > 0 ? `${Number(plan.dias_anticipacion_alerta)} dia(s)` : 'El mismo dia') },
    { id: 'secuencia', getValue: (plan) => plan.cycleSummary },
    ...Array.from({ length: 31 }, (_, index) => ({ id: `day_${index + 1}`, filterable: false })),
  ]), []);
  const {
    filters: planFilters,
    setFilter: setPlanFilter,
  } = useTableColumnFilters(planTableColumns);
  const visiblePlanRows = useMemo(
    () => filterRowsByColumns(planRows, planTableColumns, planFilters),
    [planRows, planTableColumns, planFilters],
  );

  const detailPlan = useMemo(
    () => plans.find((plan) => String(plan.id) === String(detailPlanId)) || null,
    [plans, detailPlanId],
  );
  const detailPlanMonthData = useMemo(
    () => (detailPlan ? planMonthMap.get(String(detailPlan.id)) || { occurrences: [], byDay: new Map() } : { occurrences: [], byDay: new Map() }),
    [detailPlan, planMonthMap],
  );

  const uniqueAreas = useMemo(
    () => Array.from(new Set(equipos.map((item) => item.area_trabajo).filter(Boolean))).sort(),
    [equipos],
  );

  const filteredEquipos = useMemo(() => (
    equipos.filter((eq) => {
      const areaOk = !equipmentAreaFilter || eq.area_trabajo === equipmentAreaFilter;
      const codeOk = !equipmentCodeFilter || (eq.codigo || '').toLowerCase().includes(equipmentCodeFilter.toLowerCase());
      const textOk = !equipmentTextFilter || `${eq.codigo} ${eq.descripcion} ${eq.area_trabajo}`.toLowerCase().includes(equipmentTextFilter.toLowerCase());
      return areaOk && codeOk && textOk;
    })
  ), [equipos, equipmentAreaFilter, equipmentCodeFilter, equipmentTextFilter]);

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      const textOk = !packageFilterText || `${pkg.codigo} ${pkg.nombre}`.toLowerCase().includes(packageFilterText.toLowerCase());
      if (!textOk) return false;
      if (packageVcFilter === 'TODOS') return true;
      if (packageVcFilter === 'AUTO') return String(pkg.vc_categoria || pkg.vc || '').toUpperCase() === 'V.C - DIA';
      return String(pkg.vc_categoria || pkg.vc || '').toUpperCase() === packageVcFilter;
    });
  }, [packages, packageFilterText, packageVcFilter]);

  const priorityOptions = getOptions('prioridades', ['Alta', 'Media', 'Baja']);
  const responsibleOptions = getOptions('responsables', ['Mecanico', 'Electricista']);

  const quickAddToForm = async (key, label, field) => {
    const result = await addOptionQuickly(key, label);
    if (result?.added && result.value) {
      setForm((prev) => ({ ...prev, [field]: result.value }));
    }
  };

  const selectedPackage = useMemo(
    () => filteredPackages.find((item) => String(item.id) === String(form.paquete_id))
      || packages.find((item) => String(item.id) === String(form.paquete_id))
      || null,
    [filteredPackages, packages, form.paquete_id],
  );

  const packagePreview = useMemo(() => {
    if (selectedPackage) {
      return {
        codigo: selectedPackage.codigo,
        nombre: selectedPackage.nombre,
        vc: selectedPackage.vc_categoria || selectedPackage.vc || 'V.C - DIA',
        actividades: packageActivitiesDraft || (selectedPackage.actividades || []).join('\n'),
      };
    }
    if (editingCycleIndex !== null && cycleEditorMode === 'package') {
      const current = cycleItems[editingCycleIndex];
      if (current) {
        return {
          codigo: current.package_codigo,
          nombre: current.package_nombre || current.label,
          vc: current.vc || 'V.C - DIA',
          actividades: packageActivitiesDraft,
        };
      }
    }
    return null;
  }, [selectedPackage, packageActivitiesDraft, editingCycleIndex, cycleEditorMode, cycleItems]);

  const cycleItemsTableColumns = useMemo(() => ([
    { id: 'item', getValue: (entry) => entry.marker },
    { id: 'tipo', getValue: (entry) => (entry.source_type === 'manual' ? 'Actividad manual' : 'Paquete PM') },
    { id: 'frecuencia', getValue: (entry) => `${entry.frecuencia_dias} dia(s)` },
    { id: 'paso', getValue: (entry) => `${entry.label} ${getCycleStepDetail(entry)}`.trim() },
    { id: 'acciones', filterable: false },
  ]), []);
  const {
    filters: cycleItemFilters,
    setFilter: setCycleItemFilter,
  } = useTableColumnFilters(cycleItemsTableColumns);
  const visibleCycleItems = useMemo(
    () => filterRowsByColumns(cycleItems, cycleItemsTableColumns, cycleItemFilters),
    [cycleItems, cycleItemsTableColumns, cycleItemFilters],
  );

  const resetCycleEditor = () => {
    setEditingCycleIndex(null);
    setCycleEditorMode('package');
    setForm((prev) => ({ ...prev, paquete_id: '', package_frequency_days: '' }));
    setPackageActivitiesDraft('');
    setManualLabelInput('');
    setManualFrequencyDays('');
    setManualActivitiesDraft('');
  };

  const openCreate = async () => {
    if (isReadOnly) return;
    const [freshEquipos, freshPackages, freshAlerts, freshHistory, freshDeleted] = await Promise.all([
      loadSharedDocument(EQUIPOS_STORAGE_KEY, []),
      loadSharedDocument(PACKAGES_STORAGE_KEY, PACKAGES_FALLBACK),
      loadSharedDocument(OT_ALERTS_KEY, []),
      loadSharedDocument(OT_HISTORY_KEY, []),
      loadSharedDocument(OT_DELETED_KEY, []),
    ]);
    setEquipos(normalizeEquiposList(freshEquipos));
    setPackages(normalizePackagesList(Array.isArray(freshPackages) && freshPackages.length ? freshPackages : PACKAGES_FALLBACK));
    setAlerts(Array.isArray(freshAlerts) ? freshAlerts : []);
    setHistoryRows(Array.isArray(freshHistory) ? freshHistory : []);
    setDeletedAlertIds(Array.isArray(freshDeleted) ? freshDeleted : []);
    setEditingId(null);
    setForm({ ...EMPTY_FORM, fecha_inicio: new Date().toISOString().slice(0, 10), dias_anticipacion_alerta: 0 });
    setEquipmentAreaFilter('');
    setEquipmentCodeFilter('');
    setEquipmentTextFilter('');
    setSelectedEquipmentIds([]);
    setPackageFilterText('');
    setPackageVcFilter('AUTO');
    setCycleItems([]);
    resetCycleEditor();
    setShowModal(true);
  };

  const openEdit = async () => {
    if (isReadOnly || !selectedPlan) return;
    const [freshEquipos, freshPackages] = await Promise.all([
      loadSharedDocument(EQUIPOS_STORAGE_KEY, []),
      loadSharedDocument(PACKAGES_STORAGE_KEY, PACKAGES_FALLBACK),
    ]);
    const normalizedEquipos = normalizeEquiposList(freshEquipos);
    setEquipos(normalizedEquipos);
    setPackages(normalizePackagesList(Array.isArray(freshPackages) && freshPackages.length ? freshPackages : PACKAGES_FALLBACK));
    setEditingId(selectedPlan.id);
    setForm({
      ...EMPTY_FORM,
      codigo: selectedPlan.codigo || '',
      equipo: selectedPlan.equipo || '',
      prioridad: selectedPlan.prioridad || 'Media',
      responsable: selectedPlan.responsable || '',
      fecha_inicio: normalizeDateInput(selectedPlan.fecha_inicio),
      dias_anticipacion_alerta: Number(selectedPlan.dias_anticipacion_alerta) || 0,
      paquete_id: '',
      package_frequency_days: '',
    });
    const existingEquipment = normalizedEquipos.find((item) => String(item.codigo || '') === String(selectedPlan.codigo || ''));
    setSelectedEquipmentIds(existingEquipment ? [String(existingEquipment.id)] : []);
    setEquipmentAreaFilter('');
    setEquipmentCodeFilter('');
    setEquipmentTextFilter('');
    setCycleItems(reindexDateCycleEntries(selectedPlan.cycle_entries || []));
    setPackageFilterText('');
    setPackageVcFilter('AUTO');
    resetCycleEditor();
    setShowModal(true);
  };

  const onDelete = () => {
    if (isReadOnly || !selectedPlan) return;
    if (!window.confirm(`Eliminar el plan ${buildPlanKey(selectedPlan)}?`)) return;
    const remaining = plans.filter((plan) => String(plan.id) !== String(selectedPlan.id));
    setPlans(remaining);
    setSelectedId(remaining[0]?.id ?? null);
  };

  const applyPackageSelection = (value) => {
    setForm((prev) => ({ ...prev, paquete_id: value }));
    const nextPackage = packages.find((item) => String(item.id) === String(value));
    setPackageActivitiesDraft(nextPackage ? (Array.isArray(nextPackage.actividades) ? nextPackage.actividades.join('\n') : String(nextPackage.actividades || '')) : '');
  };

  const updateCycleEntry = (entry) => {
    if (editingCycleIndex === null) {
      setCycleItems((prev) => reindexDateCycleEntries([...prev, entry]));
    } else {
      setCycleItems((prev) => reindexDateCycleEntries(prev.map((item, index) => (index === editingCycleIndex ? entry : item))));
    }
    resetCycleEditor();
  };

  const addOrUpdatePackageStep = () => {
    const frequencyDays = Number(form.package_frequency_days);
    if (!Number.isFinite(frequencyDays) || frequencyDays <= 0) {
      window.alert('Debes indicar cada cuantos dias se ejecuta este paquete dentro del ciclo.');
      return;
    }

    const basePackage = selectedPackage || (editingCycleIndex !== null ? cycleItems[editingCycleIndex] : null);
    if (!basePackage) {
      window.alert('Selecciona un paquete PM antes de agregarlo al ciclo.');
      return;
    }

    const vcLabel = String(basePackage.vc_categoria || basePackage.vc || '').toUpperCase();
    if (vcLabel && vcLabel !== 'V.C - DIA') {
      window.alert('En planes por fecha solo puedes agregar paquetes clasificados como V.C - DIA.');
      return;
    }

    const activities = splitActivitiesList(packageActivitiesDraft || basePackage.actividades || []);
    if (!activities.length) {
      window.alert('Este paquete debe conservar al menos una actividad antes de agregarlo al ciclo.');
      return;
    }
    const validationError = validateTextFields([
      ['Paquete PM', basePackage.nombre || basePackage.package_nombre || basePackage.label || ''],
      ...activities.map((activity, index) => [`Actividad paquete ${index + 1}`, activity]),
    ]);
    if (validationError) {
      window.alert(validationError);
      return;
    }

    updateCycleEntry(normalizeDateCycleEntry({
      item: editingCycleIndex !== null ? cycleItems[editingCycleIndex]?.item : cycleItems.length + 1,
      source_type: 'package',
      frecuencia_dias: frequencyDays,
      package_id: basePackage.id || basePackage.package_id || '',
      package_codigo: basePackage.codigo || basePackage.package_codigo || '',
      package_nombre: basePackage.nombre || basePackage.package_nombre || basePackage.label || '',
      actividades: activities,
      vc: 'V.C - DIA',
    }));
  };

  const addOrUpdateManualStep = () => {
    const label = String(manualLabelInput || '').trim();
    const frequencyDays = Number(manualFrequencyDays);
    const activities = splitActivitiesList(manualActivitiesDraft || label);

    if (!label) {
      window.alert('Debes escribir el nombre de la actividad manual.');
      return;
    }
    if (!Number.isFinite(frequencyDays) || frequencyDays <= 0) {
      window.alert('Debes indicar cada cuantos dias se repetira esta actividad manual.');
      return;
    }
    const validationError = validateTextFields([
      ['Actividad manual', label],
      ...activities.map((activity, index) => [`Detalle actividad manual ${index + 1}`, activity]),
    ]);
    if (validationError) {
      window.alert(validationError);
      return;
    }
    if (!activities.length) {
      window.alert('Debes detallar al menos una actividad manual.');
      return;
    }

    updateCycleEntry(normalizeDateCycleEntry({
      item: editingCycleIndex !== null ? cycleItems[editingCycleIndex]?.item : cycleItems.length + 1,
      source_type: 'manual',
      label,
      frecuencia_dias: frequencyDays,
      actividades: activities,
      vc: 'V.C - DIA',
    }));
  };

  const editCycleEntry = (index) => {
    const current = cycleItems[index];
    if (!current) return;
    setEditingCycleIndex(index);
    setCycleEditorMode(current.source_type === 'manual' ? 'manual' : 'package');
    if (current.source_type === 'manual') {
      setManualLabelInput(current.label || '');
      setManualFrequencyDays(String(current.frecuencia_dias || ''));
      setManualActivitiesDraft((current.actividades || []).join('\n'));
      setForm((prev) => ({ ...prev, paquete_id: '', package_frequency_days: '' }));
      setPackageActivitiesDraft('');
    } else {
      setForm((prev) => ({
        ...prev,
        paquete_id: String(current.package_id || ''),
        package_frequency_days: String(current.frecuencia_dias || ''),
      }));
      setPackageActivitiesDraft((current.actividades || []).join('\n'));
      setManualLabelInput('');
      setManualFrequencyDays('');
      setManualActivitiesDraft('');
    }
  };

  const moveCycleEntry = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= cycleItems.length) return;
    const next = [...cycleItems];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    setCycleItems(reindexDateCycleEntries(next));
    if (editingCycleIndex === index) {
      setEditingCycleIndex(targetIndex);
    }
  };

  const removeCycleEntry = (index) => {
    setCycleItems((prev) => reindexDateCycleEntries(prev.filter((_, itemIndex) => itemIndex !== index)));
    if (editingCycleIndex === index) {
      resetCycleEditor();
    }
  };

  const onSave = (event) => {
    event.preventDefault();
    if (isReadOnly) return;

    const validationError = firstValidationError(
      validateRequiredFields([
        ['Responsable', form.responsable],
        ['Fecha inicio', form.fecha_inicio],
      ]),
      validateTextFields([
        ['Responsable', form.responsable],
        ['Prioridad', form.prioridad],
        ...cycleItems.flatMap((item, index) => [
          [`Paso ${index + 1}`, item.label || item.package_nombre || item.package_codigo || ''],
          ...((item.actividades || []).map((activity, activityIndex) => [`Actividad ${index + 1}.${activityIndex + 1}`, activity])),
        ]),
      ]),
      validateNonNegativeFields([['Dias de anticipacion', form.dias_anticipacion_alerta]]),
      validatePositiveFields(cycleItems.map((item, index) => [`Frecuencia paso ${index + 1}`, item.frecuencia_dias])),
    );
    if (validationError) {
      window.alert(validationError);
      return;
    }

    if (!cycleItems.length) {
      window.alert('Debes construir la secuencia ciclica antes de guardar el plan.');
      return;
    }

    if (editingId) {
      const selectedEquipment = equipos.find((item) => String(item.id) === String(selectedEquipmentIds[0]))
        || equipos.find((item) => String(item.codigo || '') === String(form.codigo || ''))
        || null;
      const payload = buildPlanPayload(form, selectedEquipment, cycleItems, selectedPlan);
      setPlans((prev) => prev.map((plan) => (String(plan.id) === String(editingId) ? payload : plan)));
      setSelectedId(editingId);
    } else {
      const selectedEquipos = equipos.filter((item) => selectedEquipmentIds.includes(String(item.id)));
      if (!selectedEquipos.length) {
        window.alert('Selecciona al menos un equipo para crear el plan.');
        return;
      }
      const maxId = plans.reduce((max, item) => {
        const numericId = Number(item.id);
        return Number.isFinite(numericId) && numericId > max ? numericId : max;
      }, 0);
      const newPlans = selectedEquipos.map((equipment, index) => buildPlanPayload(
        form,
        equipment,
        cycleItems,
        { id: maxId + index + 1 },
      ));
      setPlans((prev) => [...newPlans, ...prev]);
      setSelectedId(newPlans[0]?.id ?? null);
    }

    setShowModal(false);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);

  return (
    <div>
      <div style={{ marginBottom: '1.1rem' }}>
        <h1 style={{ fontSize: isMobile ? '1.65rem' : '2rem', fontWeight: 800, marginBottom: '.35rem' }}>Plan de mantenimiento preventivo</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
          Cronograma anual por fechas con secuencia ciclica mixta: paquetes PM y actividades manuales en el mismo plan.
        </p>
      </div>

      {isReadOnly && (
        <ReadOnlyAccessNotice message="Puedes revisar el cronograma PMP por fechas, pero este perfil no puede crear, editar ni eliminar planes." />
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {!isReadOnly ? (
            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" type="button" onClick={openCreate}>Agregar</button>
              <button className="btn btn-secondary" type="button" onClick={openEdit} disabled={!selectedPlan}>Editar</button>
              <button className="btn btn-danger" type="button" onClick={onDelete} disabled={!selectedPlan}>Eliminar</button>
            </div>
          ) : <div />}

          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-select" style={{ minWidth: '145px' }} value={calendarMonth} onChange={(e) => setCalendarMonth(Number(e.target.value))}>
              {MONTHS.map((monthName, index) => (
                <option key={monthName} value={index}>{monthName}</option>
              ))}
            </select>
            <input
              type="number"
              className="form-input"
              style={{ width: '95px' }}
              min={2000}
              max={2100}
              value={calendarYear}
              onChange={(e) => setCalendarYear(Number(e.target.value) || new Date().getFullYear())}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem', display: 'grid', gap: '.8rem' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.2rem' }}>Cronograma anual de mantenimiento preventivo</h2>
          <p style={{ color: '#6b7280', margin: 0 }}>
            Cada celda muestra el numero del paso del ciclo. Verde: cerrada, gris: eliminada, rojo: pendiente en OT.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
          {[
            { key: 'planned', text: 'Programado' },
            { key: 'pending', text: 'Pendiente' },
            { key: 'closed', text: 'Cerrado' },
            { key: 'deleted', text: 'Eliminado' },
          ].map((item) => (
            <span
              key={item.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.45rem',
                padding: '.4rem .7rem',
                borderRadius: '999px',
                background: STATUS_META[item.key].bg,
                color: STATUS_META[item.key].color,
                border: `1px solid ${STATUS_META[item.key].border}`,
                fontWeight: 700,
                fontSize: '.82rem',
              }}
            >
              {item.text}
            </span>
          ))}
        </div>

        {isMobile ? (
          <div style={{ display: 'grid', gap: '.9rem' }}>
            {visiblePlanRows.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedId(plan.id)}
                style={{
                  textAlign: 'left',
                  border: String(plan.id) === String(selectedId) ? '2px solid #2563eb' : '1px solid #dbe4f0',
                  background: String(plan.id) === String(selectedId) ? '#eff6ff' : '#fff',
                  borderRadius: '1rem',
                  padding: '1rem',
                  display: 'grid',
                  gap: '.75rem',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, .06)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: '#111827' }}>{plan.codigo}</div>
                  <div style={{ color: '#334155', fontWeight: 700, marginTop: '.15rem' }}>{plan.equipo}</div>
                  <div style={{ color: '#64748b', fontSize: '.88rem', marginTop: '.2rem' }}>{plan.area_trabajo || 'Area no definida'}</div>
                </div>

                <div style={{ display: 'grid', gap: '.4rem', color: '#475569', lineHeight: 1.55, fontSize: '.9rem' }}>
                  <div><strong>Inicio:</strong> {formatDateDisplay(plan.fecha_inicio)}</div>
                  <div><strong>Aviso OT:</strong> {Number(plan.dias_anticipacion_alerta) > 0 ? `${plan.dias_anticipacion_alerta} dia(s)` : 'El mismo dia'}</div>
                  <div><strong>Ciclo:</strong> {plan.cycleSummary}</div>
                </div>

                <div style={{ display: 'grid', gap: '.45rem' }}>
                  <div style={{ color: '#0f172a', fontWeight: 700 }}>Ocurrencias del mes</div>
                  {plan.monthData.occurrences.length ? plan.monthData.occurrences.map((occurrence) => {
                    const status = getOccurrenceState(occurrence.id, activeAlertMap, closedHistoryIds, deletedIdSet, [`${occurrence.fecha}_${plan.id}`]);
                    return (
                      <div
                        key={occurrence.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '.75rem',
                          alignItems: 'center',
                          padding: '.65rem .75rem',
                          borderRadius: '.85rem',
                          border: `1px solid ${status.border}`,
                          background: status.bg,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, color: '#111827' }}>{formatDateDisplay(occurrence.fecha)} - {getCycleStepBadge(occurrence)}</div>
                          <div style={{ color: '#475569', fontSize: '.86rem', marginTop: '.15rem' }}>{occurrence.title}</div>
                        </div>
                        <span style={{ color: status.color, fontWeight: 800, fontSize: '.82rem' }}>{status.label}</span>
                      </div>
                    );
                  }) : (
                    <div style={{ color: '#6b7280', fontSize: '.9rem' }}>Sin eventos programados para este mes.</div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDetailPlanId(plan.id);
                    }}
                  >
                    Ver
                  </button>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1820px' }}>
              <thead>
                <tr style={{ background: '#1f3b5b', color: '#fff' }}>
                  {['Ver', 'Codigo', 'Equipo', 'Prioridad', 'Responsable', 'Inicio del ciclo', 'Aviso OT', 'Secuencia ciclica'].map((header) => (
                    <th key={header} style={{ textAlign: 'left', padding: '.7rem .65rem', border: '1px solid #2f4f75', fontSize: '.85rem' }}>
                      {header}
                    </th>
                  ))}
                  <th colSpan={31} style={{ textAlign: 'center', padding: '.7rem .5rem', border: '1px solid #2f4f75', fontSize: '.85rem', background: '#21486e' }}>
                    Cronograma ({MONTHS[calendarMonth]} {calendarYear})
                  </th>
                </tr>
                <tr style={{ background: '#244a71', color: '#fff' }}>
                  <th colSpan={8} style={{ border: '1px solid #2f4f75', padding: '.35rem' }} />
                  {Array.from({ length: 31 }, (_, index) => (
                    <th key={`day-header-${index + 1}`} style={{ width: '34px', textAlign: 'center', border: '1px solid #2f4f75', fontSize: '.72rem', padding: '.35rem 0' }}>
                      {index + 1}
                    </th>
                  ))}
                </tr>
                <TableFilterRow columns={planTableColumns} rows={planRows} filters={planFilters} onChange={setPlanFilter} dark />
              </thead>
              <tbody>
                {visiblePlanRows.map((plan) => (
                  <tr key={plan.id} onClick={() => setSelectedId(plan.id)} style={{ background: String(plan.id) === String(selectedId) ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
                    <td style={{ padding: '.6rem .55rem', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDetailPlanId(plan.id);
                        }}
                      >
                        Ver
                      </button>
                    </td>
                    <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb', fontWeight: 700 }}>{plan.codigo}</td>
                    <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.equipo}</td>
                    <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.prioridad}</td>
                    <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{plan.responsable}</td>
                    <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>{formatDateDisplay(plan.fecha_inicio)}</td>
                    <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb' }}>
                      {Number(plan.dias_anticipacion_alerta) > 0 ? `${Number(plan.dias_anticipacion_alerta)} dia(s)` : 'El mismo dia'}
                    </td>
                    <td style={{ padding: '.6rem .65rem', border: '1px solid #e5e7eb', minWidth: '260px', lineHeight: 1.5 }}>
                      {plan.cycleSummary}
                    </td>
                    {Array.from({ length: 31 }, (_, index) => {
                      const day = index + 1;
                      const dayOccurrences = plan.monthData.byDay.get(day) || [];
                      const inMonth = day <= daysInMonth;
                      return (
                        <td
                          key={`${plan.id}-day-${day}`}
                          style={{
                            width: '34px',
                            minWidth: '34px',
                            textAlign: 'center',
                            border: '1px solid #e5e7eb',
                            background: inMonth ? '#fff' : '#f8fafc',
                            verticalAlign: 'top',
                            padding: '.15rem',
                          }}
                        >
                          {inMonth && dayOccurrences.length ? (
                            <div style={{ display: 'grid', gap: '.15rem', justifyItems: 'center' }}>
                              {dayOccurrences.slice(0, 3).map((occurrence) => {
                                const status = getOccurrenceState(occurrence.id, activeAlertMap, closedHistoryIds, deletedIdSet, [`${occurrence.fecha}_${plan.id}`]);
                                return (
                                  <span
                                    key={occurrence.id}
                                    title={`${getCycleStepBadge(occurrence)} - ${occurrence.title} (${status.label})`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      minWidth: '28px',
                                      padding: '.08rem .2rem',
                                      borderRadius: '999px',
                                      fontWeight: 800,
                                      fontSize: '.64rem',
                                      background: status.bg,
                                      color: status.color,
                                      border: `1px solid ${status.border}`,
                                      lineHeight: 1.1,
                                    }}
                                  >
                                    {getCycleStepBadge(occurrence, true)}
                                  </span>
                                );
                              })}
                              {dayOccurrences.length > 3 && (
                                <span style={{ fontSize: '.64rem', color: '#475569', fontWeight: 700 }}>+{dayOccurrences.length - 3}</span>
                              )}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!visiblePlanRows.length && (
                  <tr>
                    <td colSpan={39} style={{ border: '1px solid #e5e7eb', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                      No hay planes que coincidan con los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailPlan && (
        <Modal title={`Detalle informativo - ${buildPlanKey(detailPlan)}`} onClose={() => setDetailPlanId(null)}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.2rem' }}>{buildPlanKey(detailPlan)}</h2>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  Responsable: {detailPlan.responsable} | Inicio del ciclo: {formatDateDisplay(detailPlan.fecha_inicio)}
                </p>
              </div>
              <span style={{ padding: '.45rem .8rem', borderRadius: '999px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800 }}>
                {detailPlan.cycle_entries.length} paso(s) en el ciclo
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: '1rem' }}>
              <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e5e7eb', background: '#fff' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.8rem' }}>Secuencia del plan</div>
                <div style={{ display: 'grid', gap: '.7rem' }}>
                  {detailPlan.cycle_entries.map((entry, index) => (
                    <div key={`${entry.marker}_${index}`} style={{ border: '1px solid #e5e7eb', borderRadius: '.95rem', padding: '.85rem .95rem', background: index === 0 ? '#f8fbff' : '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', marginBottom: '.35rem' }}>
                        <div style={{ fontWeight: 800, color: '#111827' }}>{getCycleStepShortLabel(entry)}</div>
                        <span style={{ color: '#1d4ed8', fontWeight: 800, fontSize: '.82rem' }}>{entry.frecuencia_dias} dia(s)</span>
                      </div>
                      <div style={{ color: '#475569', lineHeight: 1.6, fontSize: '.92rem' }}>{getCycleStepDetail(entry)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e5e7eb', background: '#fff' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.8rem' }}>Ocurrencias del mes</div>
                <div style={{ display: 'grid', gap: '.65rem' }}>
                  {detailPlanMonthData.occurrences.length ? detailPlanMonthData.occurrences.map((occurrence) => {
                    const status = getOccurrenceState(occurrence.id, activeAlertMap, closedHistoryIds, deletedIdSet, [`${occurrence.fecha}_${detailPlan.id}`]);
                    return (
                      <div key={occurrence.id} style={{ border: `1px solid ${status.border}`, borderRadius: '.95rem', padding: '.8rem .9rem', background: status.bg }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ fontWeight: 800, color: '#111827' }}>{formatDateDisplay(occurrence.fecha)} - {getCycleStepBadge(occurrence)}</div>
                          <span style={{ color: status.color, fontWeight: 800 }}>{status.label}</span>
                        </div>
                        <div style={{ color: '#475569', marginTop: '.25rem', lineHeight: 1.6 }}>
                          <div><strong>Paso:</strong> {occurrence.title}</div>
                          <div><strong>Detalle:</strong> {occurrence.activities_text || 'Sin actividades.'}</div>
                          {Number(detailPlan.dias_anticipacion_alerta) > 0 && (
                            <div><strong>Alerta OT desde:</strong> {formatDateDisplay(occurrence.alerta_desde)}</div>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{ color: '#6b7280' }}>Este plan no tiene ejecuciones programadas en el mes seleccionado.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal title={editingId ? 'Editar plan de mantenimiento' : 'Agregar plan de mantenimiento'} onClose={() => setShowModal(false)}>
          <form onSubmit={onSave} style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e5e7eb', background: '#fff' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.85rem' }}>Datos generales del plan</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Codigo</label>
                  <input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="Se completa desde el equipo" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <ConfigurableSelectField
                    label="Responsable *"
                    value={form.responsable}
                    options={responsibleOptions}
                    onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                    onQuickAdd={() => quickAddToForm('responsables', 'responsable', 'responsable')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona responsable"
                    required
                    disabled={isReadOnly}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <ConfigurableSelectField
                    label="Prioridad"
                    value={form.prioridad}
                    options={priorityOptions}
                    onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
                    onQuickAdd={() => quickAddToForm('prioridades', 'prioridad', 'prioridad')}
                    canManageOptions={canManageConfigurableLists}
                    placeholder="Selecciona prioridad"
                    disabled={isReadOnly}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha inicio del ciclo *</label>
                  <input type="date" className="form-input" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Aviso anticipado en Gestion OT (dias)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="form-input"
                    value={form.dias_anticipacion_alerta}
                    onChange={(e) => setForm({ ...form, dias_anticipacion_alerta: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e5e7eb', background: '#fff' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.85rem' }}>Seleccion de equipos</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.65rem', marginBottom: '.8rem' }}>
                <select className="form-select" value={equipmentAreaFilter} onChange={(e) => setEquipmentAreaFilter(e.target.value)}>
                  <option value="">Area (todas)</option>
                  {uniqueAreas.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
                <input className="form-input" placeholder="Filtro por codigo" value={equipmentCodeFilter} onChange={(e) => setEquipmentCodeFilter(e.target.value)} />
                <input className="form-input" placeholder="Buscar por nombre o area..." value={equipmentTextFilter} onChange={(e) => setEquipmentTextFilter(e.target.value)} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Equipo *</label>
                <select
                  className="form-select"
                  multiple
                  size={Math.min(8, Math.max(4, filteredEquipos.length || 4))}
                  required
                  value={selectedEquipmentIds}
                  onChange={(e) => {
                    const nextSelected = Array.from(e.target.selectedOptions).map((option) => option.value);
                    setSelectedEquipmentIds(nextSelected);
                    if (nextSelected.length > 0) {
                      const selectedEquipment = equipos.find((item) => String(item.id) === String(nextSelected[0]));
                      if (selectedEquipment) {
                        setForm((prev) => ({
                          ...prev,
                          codigo: selectedEquipment.codigo || prev.codigo,
                          equipo: selectedEquipment.descripcion || prev.equipo,
                        }));
                      }
                    }
                  }}
                >
                  {filteredEquipos.map((eq) => (
                    <option key={eq.id} value={String(eq.id)}>
                      {eq.codigo} | {eq.descripcion} {eq.area_trabajo ? `(${eq.area_trabajo})` : ''}
                    </option>
                  ))}
                </select>
                <p style={{ color: '#6b7280', fontSize: '.82rem', marginTop: '.35rem' }}>
                  Seleccion multiple habilitada: puedes crear el mismo plan para varios equipos en una sola operacion.
                </p>
              </div>
            </div>

            <div style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e5e7eb', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.85rem' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.2rem' }}>Secuencia ciclica del plan</div>
                  <div style={{ color: '#64748b', lineHeight: 1.6 }}>
                    Puedes combinar paquetes PM y actividades manuales. Cada paso define cuantos dias pasan antes del siguiente.
                  </div>
                </div>
                {editingCycleIndex !== null && (
                  <button type="button" className="btn btn-secondary" onClick={resetCycleEditor}>Cancelar edicion del paso</button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', marginBottom: '.85rem' }}>
                {[
                  { key: 'package', label: 'Agregar paquete PM' },
                  { key: 'manual', label: 'Agregar actividad manual' },
                ].map((option) => {
                  const active = cycleEditorMode === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setCycleEditorMode(option.key)}
                      style={{
                        padding: '.55rem .9rem',
                        borderRadius: '999px',
                        border: active ? '1px solid #2563eb' : '1px solid #dbe4f0',
                        background: active ? '#eff6ff' : '#fff',
                        color: active ? '#1d4ed8' : '#475569',
                        fontWeight: 800,
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {cycleEditorMode === 'package' ? (
                <div style={{ display: 'grid', gap: '.85rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Clasificacion del paquete PM</label>
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                      {[
                        { value: 'AUTO', label: 'Sugeridos V.C - DIA' },
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

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Filtrar paquetes PM</label>
                      <input className="form-input" placeholder="Buscar por codigo o nombre..." value={packageFilterText} onChange={(e) => setPackageFilterText(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Paquete PM</label>
                      <select className="form-select" value={form.paquete_id || ''} onChange={(e) => applyPackageSelection(e.target.value)}>
                        <option value="">-- Seleccionar paquete --</option>
                        {filteredPackages.map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            {item.codigo} | {item.vc_categoria || item.vc} | {item.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Frecuencia del paso (dias)</label>
                      <input
                        type="number"
                        min="1"
                        className="form-input"
                        value={form.package_frequency_days}
                        onChange={(e) => setForm((prev) => ({ ...prev, package_frequency_days: e.target.value }))}
                        placeholder="Ejemplo: 30"
                      />
                    </div>
                  </div>

                  <div style={{ padding: '.95rem 1rem', borderRadius: '.95rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.45rem' }}>Actividades del paquete seleccionado</div>
                    {packagePreview ? (
                      <div style={{ display: 'grid', gap: '.5rem' }}>
                        <div style={{ color: '#334155', fontWeight: 700 }}>
                          {packagePreview.codigo || 'Sin codigo'} | {packagePreview.vc} | {packagePreview.nombre || 'Paquete sin nombre'}
                        </div>
                        <textarea
                          className="form-input"
                          rows={6}
                          value={packagePreview.actividades}
                          onChange={(e) => setPackageActivitiesDraft(e.target.value)}
                          placeholder="Edita aqui las actividades del paquete para este plan."
                        />
                        <div style={{ color: '#64748b', fontSize: '.82rem' }}>
                          Puedes modificar las actividades solo para este plan sin alterar el paquete base.
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#6b7280' }}>Selecciona un paquete para revisar y ajustar sus actividades antes de agregarlo al ciclo.</div>
                    )}
                  </div>

                  <div>
                    <button type="button" className="btn btn-primary" onClick={addOrUpdatePackageStep}>
                      {editingCycleIndex !== null && cycleEditorMode === 'package' ? 'Actualizar paso del paquete' : 'Agregar paquete al ciclo'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '.85rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Nombre de la actividad manual</label>
                      <input className="form-input" value={manualLabelInput} onChange={(e) => setManualLabelInput(e.target.value)} placeholder="Ejemplo: Limpieza profunda de sensores" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Frecuencia del paso (dias)</label>
                      <input type="number" min="1" className="form-input" value={manualFrequencyDays} onChange={(e) => setManualFrequencyDays(e.target.value)} placeholder="Ejemplo: 15" />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Detalle de actividades manuales</label>
                    <textarea
                      className="form-input"
                      rows={5}
                      value={manualActivitiesDraft}
                      onChange={(e) => setManualActivitiesDraft(e.target.value)}
                      placeholder="Escribe una o varias actividades, una por linea."
                    />
                    <p style={{ color: '#6b7280', fontSize: '.82rem', marginTop: '.35rem' }}>
                      Si lo dejas vacio, el sistema usara el nombre de la actividad como detalle principal.
                    </p>
                  </div>

                  <div>
                    <button type="button" className="btn btn-primary" onClick={addOrUpdateManualStep}>
                      {editingCycleIndex !== null && cycleEditorMode === 'manual' ? 'Actualizar actividad manual' : 'Agregar actividad manual al ciclo'}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.65rem' }}>Ciclo configurado</div>
                {isMobile ? (
                  <div style={{ display: 'grid', gap: '.7rem' }}>
                    {cycleItems.map((entry, index) => (
                      <div key={`${entry.marker}_${index}`} style={{ border: '1px solid #e5e7eb', borderRadius: '.95rem', padding: '.9rem', background: index === 0 ? '#eff6ff' : '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.45rem' }}>
                          <strong>{getCycleStepShortLabel(entry)}</strong>
                          <span style={{ color: '#1d4ed8', fontWeight: 800, fontSize: '.82rem' }}>{entry.frecuencia_dias} dias</span>
                        </div>
                        <div style={{ color: '#475569', lineHeight: 1.6, marginBottom: '.75rem' }}>{getCycleStepDetail(entry)}</div>
                        <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => editCycleEntry(index)}>Editar</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveCycleEntry(index, -1)} disabled={index === 0}>Subir</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveCycleEntry(index, 1)} disabled={index === cycleItems.length - 1}>Bajar</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeCycleEntry(index)}>Quitar</button>
                        </div>
                      </div>
                    ))}
                    {!cycleItems.length && (
                      <div style={{ border: '1px dashed #cbd5e1', borderRadius: '.95rem', padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                        Aun no has agregado pasos al ciclo.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="card" style={{ marginBottom: 0, padding: '.75rem', overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ border: '1px solid #e5e7eb', padding: '.45rem', width: '90px' }}>Item</th>
                          <th style={{ border: '1px solid #e5e7eb', padding: '.45rem', width: '150px' }}>Tipo</th>
                          <th style={{ border: '1px solid #e5e7eb', padding: '.45rem', width: '150px' }}>Frecuencia</th>
                          <th style={{ border: '1px solid #e5e7eb', padding: '.45rem', textAlign: 'left' }}>Paso / Actividades</th>
                          <th style={{ border: '1px solid #e5e7eb', padding: '.45rem', width: '230px' }}>Acciones</th>
                        </tr>
                        <TableFilterRow columns={cycleItemsTableColumns} rows={cycleItems} filters={cycleItemFilters} onChange={setCycleItemFilter} />
                      </thead>
                      <tbody>
                        {visibleCycleItems.map((entry) => {
                          const index = cycleItems.findIndex((item) => item.marker === entry.marker);
                          return (
                          <tr key={`${entry.marker}_${index}`} style={{ background: index === 0 ? '#eff6ff' : '#fff' }}>
                            <td style={{ border: '1px solid #e5e7eb', padding: '.45rem', textAlign: 'center', fontWeight: 800 }}>{entry.marker}</td>
                            <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{entry.source_type === 'manual' ? 'Actividad manual' : 'Paquete PM'}</td>
                            <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{entry.frecuencia_dias} dia(s)</td>
                            <td style={{ border: '1px solid #e5e7eb', padding: '.45rem', lineHeight: 1.5 }}>
                              <div style={{ fontWeight: 800, color: '#111827', marginBottom: '.2rem' }}>{entry.label}</div>
                              <div style={{ color: '#475569' }}>{getCycleStepDetail(entry)}</div>
                            </td>
                            <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>
                              <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => editCycleEntry(index)}>Editar</button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveCycleEntry(index, -1)} disabled={index === 0}>Subir</button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveCycleEntry(index, 1)} disabled={index === cycleItems.length - 1}>Bajar</button>
                                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeCycleEntry(index)}>Quitar</button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                        {!visibleCycleItems.length && (
                          <tr>
                            <td colSpan={5} style={{ border: '1px solid #e5e7eb', padding: '.85rem', textAlign: 'center', color: '#6b7280' }}>
                              No hay pasos del ciclo que coincidan con los filtros aplicados.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Guardar plan'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
