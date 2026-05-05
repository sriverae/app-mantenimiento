export function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

export function normalizeDateInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text);
  if (slashMatch) {
    const day = String(Number(slashMatch[1])).padStart(2, '0');
    const month = String(Number(slashMatch[2])).padStart(2, '0');
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

export function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeVcLabel(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return 'Km';
  if (text.includes('HRA') || text.includes('HRA') || text.includes('HORA')) return 'Hra';
  return 'Km';
}

export function normalizePmLabel(value, fallback = 'PM0') {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return fallback;
  return text.startsWith('PM') ? text : fallback;
}

export function buildPmLabel(itemNumber = 1) {
  const numericItem = Math.max(1, Math.trunc(toSafeNumber(itemNumber)) || 1);
  return `PM${numericItem}`;
}

export function incrementPmLabel(value) {
  const current = normalizePmLabel(value, 'PM0');
  const match = /^PM(\d+)$/.exec(current);
  if (!match) return 'PM1';
  return `PM${Number(match[1]) + 1}`;
}

export function normalizePackageCycleEntry(entry, index = 0, defaults = {}) {
  const item = Math.max(1, Math.trunc(toSafeNumber(entry?.item || index + 1)) || index + 1);
  const frecuencia = toSafeNumber(
    entry?.frecuencia
    ?? entry?.intervalo_km
    ?? entry?.frecuencia_valor
    ?? defaults?.intervalo_km
    ?? defaults?.frecuencia_valor
    ?? defaults?.frecuencia,
  );
  const vc = normalizeVcLabel(entry?.vc || defaults?.vc || 'Km');
  const packageId = String(entry?.package_id ?? entry?.paquete_id ?? '').trim();
  const packageCode = String(entry?.package_codigo ?? entry?.codigo ?? '').trim();
  const packageName = String(entry?.package_nombre ?? entry?.nombre ?? '').trim();
  const activities = normalizeActivitiesList(entry?.actividades ?? defaults?.actividades);

  return {
    item,
    tipo_pm: buildPmLabel(item),
    frecuencia,
    vc,
    package_id: packageId,
    package_codigo: packageCode,
    package_nombre: packageName || packageCode || `Paquete ${item}`,
    actividades: activities,
  };
}

export function getPlanPackageCycle(plan) {
  const rawCycle = Array.isArray(plan?.package_cycle) ? plan.package_cycle : [];
  if (rawCycle.length) {
    return rawCycle
      .map((entry, index) => normalizePackageCycleEntry(entry, index, plan))
      .filter((entry) => entry.frecuencia > 0 || entry.package_id || entry.actividades.length)
      .map((entry, index) => ({
        ...entry,
        item: index + 1,
        tipo_pm: buildPmLabel(index + 1),
      }));
  }

  const fallbackEntry = normalizePackageCycleEntry({
    item: 1,
    frecuencia: plan?.intervalo_km || plan?.frecuencia_valor || plan?.frecuencia,
    vc: plan?.vc,
    package_id: plan?.paquete_id || '',
    package_codigo: plan?.paquete_codigo || '',
    package_nombre: plan?.paquete_nombre || '',
    actividades: plan?.actividades || '',
  }, 0, plan);

  if (!fallbackEntry.frecuencia && !fallbackEntry.package_id && !fallbackEntry.actividades.length) {
    return [];
  }

  return [fallbackEntry];
}

export function getNormalizedCycleIndex(plan, cycle = getPlanPackageCycle(plan)) {
  if (!cycle.length) return 0;
  const requestedIndex = Math.trunc(toSafeNumber(plan?.current_cycle_index));
  if (requestedIndex >= 0 && requestedIndex < cycle.length) return requestedIndex;

  const requestedPm = normalizePmLabel(plan?.tipo_pm_proximo, '');
  const requestedPmIndex = cycle.findIndex((entry) => entry.tipo_pm === requestedPm);
  if (requestedPmIndex >= 0) return requestedPmIndex;

  const requestedPackageId = String(plan?.paquete_id || '').trim();
  const requestedPackageIndex = cycle.findIndex((entry) => String(entry.package_id || '') === requestedPackageId);
  if (requestedPackageIndex >= 0) return requestedPackageIndex;

  return 0;
}

export function getCurrentPlanCycleEntry(plan) {
  const cycle = getPlanPackageCycle(plan);
  const currentIndex = getNormalizedCycleIndex(plan, cycle);
  return cycle[currentIndex] || null;
}

export function syncPlanWithCurrentCycle(plan) {
  const cycle = getPlanPackageCycle(plan);
  const currentIndex = getNormalizedCycleIndex(plan, cycle);
  const currentEntry = cycle[currentIndex] || null;
  const currentInterval = toSafeNumber(currentEntry?.frecuencia || plan?.intervalo_km || plan?.frecuencia_valor || plan?.frecuencia);

  return {
    ...plan,
    package_cycle: cycle,
    current_cycle_index: currentIndex,
    vc: normalizeVcLabel(currentEntry?.vc || plan?.vc || 'Km'),
    frecuencia_valor: currentInterval,
    intervalo_km: currentInterval,
    paquete_id: currentEntry?.package_id || plan?.paquete_id || '',
    paquete_codigo: currentEntry?.package_codigo || plan?.paquete_codigo || '',
    paquete_nombre: currentEntry?.package_nombre || plan?.paquete_nombre || '',
    actividades: currentEntry?.actividades?.length ? currentEntry.actividades.join('\n') : (plan?.actividades || ''),
    tipo_pm_proximo: currentEntry?.tipo_pm || normalizePmLabel(plan?.tipo_pm_proximo, 'PM1'),
  };
}

export function createCounterEntry(plan, { value, fechaToma, source = 'ACTUALIZACION' } = {}) {
  const counterValue = toSafeNumber(value ?? plan?.km_actual);
  const takeDate = normalizeDateInput(fechaToma || plan?.fecha_toma || getTodayInputDate());
  const createdAt = new Date().toISOString();

  return {
    id: `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    plan_id: String(plan?.id || ''),
    codigo: plan?.codigo || '',
    equipo: plan?.equipo || plan?.descripcion || '',
    area_trabajo: plan?.area_trabajo || 'N.A.',
    marca: plan?.marca || 'N.A.',
    modelo: plan?.modelo || 'N.A.',
    vc: normalizeVcLabel(plan?.vc),
    valor_contador: counterValue,
    fecha_toma: takeDate,
    registrado_en: createdAt,
    origen: source,
  };
}

export function getCounterTimestamp(entry) {
  const parsed = new Date(`${normalizeDateInput(entry?.fecha_toma) || getTodayInputDate()}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function sortCounterEntries(entries = []) {
  return [...(Array.isArray(entries) ? entries : [])].sort((left, right) => {
    const byDate = getCounterTimestamp(right) - getCounterTimestamp(left);
    if (byDate !== 0) return byDate;
    return String(right?.registrado_en || '').localeCompare(String(left?.registrado_en || ''));
  });
}

export function getPlanCounterEntries(entries = [], planId) {
  return sortCounterEntries(
    (Array.isArray(entries) ? entries : []).filter((item) => String(item?.plan_id || '') === String(planId || '')),
  );
}

export function getLatestCounterEntry(entries = [], planId) {
  return getPlanCounterEntries(entries, planId)[0] || null;
}

export function getKmDerivedFields(plan) {
  const currentCounter = toSafeNumber(plan?.km_actual);
  const nextCounter = toSafeNumber(plan?.proximo_km);
  const alertCounter = toSafeNumber(plan?.alerta_km);
  const perDay = toSafeNumber(plan?.km_por_dia);
  const remainingCounter = Math.max(nextCounter - currentCounter, 0);
  const daysRemaining = perDay > 0 ? Math.ceil(remainingCounter / perDay) : null;

  let programmedDate = '';
  const takeDate = normalizeDateInput(plan?.fecha_toma);
  if (takeDate && daysRemaining !== null) {
    const parsed = new Date(`${takeDate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setDate(parsed.getDate() + daysRemaining);
      programmedDate = normalizeDateInput(parsed.toISOString().slice(0, 10));
    }
  }

  let status = { label: 'En control', color: '#059669', bg: '#ecfdf5' };
  if (!nextCounter) {
    status = { label: 'Sin objetivo', color: '#6b7280', bg: '#f3f4f6' };
  } else if (currentCounter >= nextCounter) {
    status = { label: 'Vencido', color: '#dc2626', bg: '#fef2f2' };
  } else if (remainingCounter <= alertCounter) {
    status = { label: 'Proximo', color: '#c2410c', bg: '#fff7ed' };
  }

  return {
    currentCounter,
    nextCounter,
    alertCounter,
    perDay,
    remainingCounter,
    daysRemaining,
    programmedDate,
    status,
  };
}

export function normalizeKmPlan(plan, equipment = null) {
  const safeEquipment = equipment || {};
  const lastPm = normalizePmLabel(plan?.tipo_pm_ultimo, 'PM0');
  const intervalCounter = toSafeNumber(plan?.intervalo_km || plan?.frecuencia_valor || plan?.frecuencia);
  const lastCounter = toSafeNumber(plan?.km_ultimo_mantenimiento);
  const nextCounter = toSafeNumber(plan?.proximo_km || (intervalCounter > 0 ? lastCounter + intervalCounter : 0));
  const basePlan = {
    ...plan,
    codigo: plan?.codigo || safeEquipment.codigo || '',
    equipo: plan?.equipo || plan?.descripcion || safeEquipment.descripcion || '',
    area_trabajo: plan?.area_trabajo || safeEquipment.area_trabajo || 'N.A.',
    marca: plan?.marca || safeEquipment.marca || 'N.A.',
    modelo: plan?.modelo || safeEquipment.modelo || 'N.A.',
    vc: normalizeVcLabel(plan?.vc || 'Km'),
    frecuencia_valor: intervalCounter,
    km_actual: toSafeNumber(plan?.km_actual),
    km_ultimo_mantenimiento: lastCounter,
    intervalo_km: intervalCounter,
    alerta_km: toSafeNumber(plan?.alerta_km),
    proximo_km: nextCounter,
    km_por_dia: toSafeNumber(plan?.km_por_dia || plan?.hrs_kms_dia),
    fecha_ultimo_servicio: normalizeDateInput(plan?.fecha_ultimo_servicio || plan?.fecha_ultimo_mantenimiento),
    fecha_toma: normalizeDateInput(plan?.fecha_toma || plan?.fecha_toma_contador || getTodayInputDate()),
    tipo_pm_ultimo: lastPm,
    tipo_pm_proximo: normalizePmLabel(plan?.tipo_pm_proximo, incrementPmLabel(lastPm)),
    prioridad: plan?.prioridad || 'Media',
    responsable: plan?.responsable || '',
    actividades: plan?.actividades || '',
    paquete_id: plan?.paquete_id || '',
    paquete_codigo: plan?.paquete_codigo || '',
    paquete_nombre: plan?.paquete_nombre || '',
    package_cycle: Array.isArray(plan?.package_cycle) ? plan.package_cycle : [],
    current_cycle_index: Math.trunc(toSafeNumber(plan?.current_cycle_index)),
    counter_initial_id: plan?.counter_initial_id || '',
    ultimo_contador_id: plan?.ultimo_contador_id || '',
  };

  const syncedPlan = syncPlanWithCurrentCycle(basePlan);
  const syncedNextCounter = toSafeNumber(
    syncedPlan?.proximo_km || (syncedPlan.intervalo_km > 0 ? lastCounter + syncedPlan.intervalo_km : 0),
  );

  return {
    ...syncedPlan,
    proximo_km: syncedNextCounter,
  };
}

export function advanceKmPlanCycle(plan, { closeDate = '', currentCounter = null } = {}) {
  const normalizedPlan = normalizeKmPlan(plan);
  const cycle = getPlanPackageCycle(normalizedPlan);
  if (!cycle.length) {
    const executedPm = normalizePmLabel(normalizedPlan.tipo_pm_proximo, normalizePmLabel(normalizedPlan.tipo_pm_ultimo, 'PM0'));
    const intervalCounter = toSafeNumber(normalizedPlan.intervalo_km);
    const counterBase = Math.max(
      toSafeNumber(currentCounter ?? normalizedPlan.km_actual),
      toSafeNumber(normalizedPlan.proximo_km),
    );
    return normalizeKmPlan({
      ...normalizedPlan,
      km_ultimo_mantenimiento: counterBase,
      proximo_km: intervalCounter > 0 ? counterBase + intervalCounter : toSafeNumber(normalizedPlan.proximo_km),
      fecha_ultimo_servicio: normalizeDateInput(closeDate),
      tipo_pm_ultimo: executedPm,
      tipo_pm_proximo: incrementPmLabel(executedPm),
    });
  }

  const currentIndex = getNormalizedCycleIndex(normalizedPlan, cycle);
  const executedEntry = cycle[currentIndex] || cycle[0];
  const nextIndex = (currentIndex + 1) % cycle.length;
  const nextEntry = cycle[nextIndex] || cycle[0];
  const counterBase = Math.max(
    toSafeNumber(currentCounter ?? normalizedPlan.km_actual),
    toSafeNumber(normalizedPlan.proximo_km),
  );
  const nextFrequency = toSafeNumber(nextEntry?.frecuencia);

  return normalizeKmPlan({
    ...normalizedPlan,
    package_cycle: cycle,
    current_cycle_index: nextIndex,
    km_ultimo_mantenimiento: counterBase,
    proximo_km: nextFrequency > 0 ? counterBase + nextFrequency : toSafeNumber(normalizedPlan.proximo_km),
    fecha_ultimo_servicio: normalizeDateInput(closeDate),
    tipo_pm_ultimo: buildPmLabel(executedEntry?.item || currentIndex + 1),
    tipo_pm_proximo: buildPmLabel(nextEntry?.item || nextIndex + 1),
    paquete_id: nextEntry?.package_id || '',
    paquete_codigo: nextEntry?.package_codigo || '',
    paquete_nombre: nextEntry?.package_nombre || '',
    actividades: nextEntry?.actividades?.join('\n') || '',
    vc: normalizeVcLabel(nextEntry?.vc || normalizedPlan.vc),
    intervalo_km: nextFrequency,
    frecuencia_valor: nextFrequency,
  });
}

export function applyLatestCounterEntriesToPlans(plans = [], entries = []) {
  return (Array.isArray(plans) ? plans : []).map((plan) => {
    const latestEntry = getLatestCounterEntry(entries, plan?.id);
    if (!latestEntry) return plan;
    return {
      ...plan,
      km_actual: toSafeNumber(latestEntry.valor_contador),
      fecha_toma: normalizeDateInput(latestEntry.fecha_toma),
      ultimo_contador_id: latestEntry.id,
    };
  });
}
