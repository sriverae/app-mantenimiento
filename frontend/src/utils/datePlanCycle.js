function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeText(value) {
  return String(value || '').trim();
}

export function normalizeDateInput(value) {
  const text = safeText(value);
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

export function splitActivitiesList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => safeText(item)).filter(Boolean);
  }
  return safeText(value)
    .split(/\r?\n|;/)
    .map((item) => safeText(item))
    .filter(Boolean);
}

export const LEGACY_FREQ_TO_DAYS = {
  Semanal: 7,
  Mensual: 30,
  Bimestral: 60,
  Trimestral: 90,
  Semestral: 180,
  Anual: 365,
};

export function inferLegacyDays(value, fallback = 30) {
  const text = safeText(value);
  if (!text) return fallback;
  if (LEGACY_FREQ_TO_DAYS[text]) return LEGACY_FREQ_TO_DAYS[text];
  const numeric = toSafeNumber(text);
  return numeric > 0 ? numeric : fallback;
}

export function buildDateCycleMarker(item) {
  return `X${Math.max(1, Number(item) || 1)}`;
}

export function normalizeDateCycleEntry(entry, index = 0) {
  const item = Math.max(1, Math.trunc(toSafeNumber(entry?.item || index + 1)) || index + 1);
  const sourceType = safeText(entry?.source_type || entry?.tipo || entry?.kind).toLowerCase() === 'manual'
    ? 'manual'
    : 'package';
  const frequencyDays = Math.max(
    1,
    Math.trunc(
      toSafeNumber(
        entry?.frecuencia_dias
        ?? entry?.frecuencia
        ?? entry?.dias
        ?? entry?.intervalo_dias,
      ),
    ) || 1,
  );
  const activities = splitActivitiesList(entry?.actividades);
  const packageId = safeText(entry?.package_id ?? entry?.paquete_id);
  const packageCode = safeText(entry?.package_codigo ?? entry?.codigo_paquete ?? entry?.codigo);
  const packageName = safeText(entry?.package_nombre ?? entry?.nombre_paquete ?? entry?.nombre);
  const manualTitle = safeText(entry?.manual_title ?? entry?.titulo_manual ?? entry?.label);
  const label = sourceType === 'manual'
    ? (manualTitle || activities[0] || `Actividad manual ${item}`)
    : (packageName || packageCode || `Paquete PM ${item}`);

  return {
    item,
    marker: buildDateCycleMarker(item),
    source_type: sourceType,
    label,
    frecuencia_dias: frequencyDays,
    package_id: packageId,
    package_codigo: packageCode,
    package_nombre: packageName,
    actividades: activities,
    vc: safeText(entry?.vc || entry?.vc_categoria || 'V.C - DIA') || 'V.C - DIA',
  };
}

export function reindexDateCycleEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => normalizeDateCycleEntry({ ...entry, item: index + 1 }, index))
    .map((entry, index) => ({
      ...entry,
      item: index + 1,
      marker: buildDateCycleMarker(index + 1),
    }));
}

export function getDatePlanCycle(plan) {
  const rawCycle = Array.isArray(plan?.cycle_entries)
    ? plan.cycle_entries
    : Array.isArray(plan?.date_cycle)
      ? plan.date_cycle
      : [];

  if (rawCycle.length) {
    return reindexDateCycleEntries(rawCycle).filter((entry) => entry.frecuencia_dias > 0 && (entry.label || entry.actividades.length));
  }

  const fallbackFrequency = inferLegacyDays(plan?.frecuencia, 30);
  const fallbackActivities = splitActivitiesList(plan?.actividades);
  const fallbackEntry = normalizeDateCycleEntry({
    item: 1,
    source_type: safeText(plan?.paquete_id) ? 'package' : 'manual',
    frecuencia_dias: fallbackFrequency,
    package_id: plan?.paquete_id || '',
    package_codigo: plan?.paquete_codigo || '',
    package_nombre: plan?.paquete_nombre || '',
    label: safeText(plan?.paquete_nombre || plan?.paquete_codigo || plan?.equipo || 'Paso PM'),
    actividades: fallbackActivities,
  });

  if (!fallbackEntry.label && !fallbackEntry.actividades.length) {
    return [];
  }

  return [fallbackEntry];
}

export function getDatePlanLeadDays(plan) {
  return Math.max(
    0,
    Math.trunc(
      toSafeNumber(plan?.dias_anticipacion_alerta ?? plan?.alerta_previa_dias ?? plan?.aviso_dias),
    ) || 0,
  );
}

function addDays(isoDate, days) {
  const normalized = normalizeDateInput(isoDate);
  const parsed = new Date(`${normalized}T00:00:00`);
  if (!normalized || Number.isNaN(parsed.getTime())) return '';
  parsed.setDate(parsed.getDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
}

export function buildDateOccurrenceId(planId, dueDate, item) {
  return `fecha_${String(planId)}_${String(dueDate)}_${Math.max(1, Number(item) || 1)}`;
}

export function getDatePlanOccurrencesInWindow(plan, windowStart, windowEnd, { includeAlertWindow = false } = {}) {
  const cycle = getDatePlanCycle(plan);
  const startDate = normalizeDateInput(plan?.fecha_inicio);
  if (!cycle.length || !startDate) return [];

  const from = new Date(`${normalizeDateInput(windowStart)}T00:00:00`);
  const to = new Date(`${normalizeDateInput(windowEnd)}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const leadDays = getDatePlanLeadDays(plan);
  const generationEnd = new Date(to);
  if (includeAlertWindow && leadDays > 0) {
    generationEnd.setDate(generationEnd.getDate() + leadDays);
  }

  let cursor = startDate;
  let cycleIndex = 0;
  const occurrences = [];
  let guard = 0;

  while (guard < 5000) {
    guard += 1;
    const dueDate = normalizeDateInput(cursor);
    const dueParsed = new Date(`${dueDate}T00:00:00`);
    if (Number.isNaN(dueParsed.getTime())) break;
    if (dueParsed > generationEnd) break;

    const step = cycle[cycleIndex];
    const alertDate = addDays(dueDate, -leadDays);
    const alertParsed = new Date(`${alertDate}T00:00:00`);
    const dueInWindow = dueParsed >= from && dueParsed <= to;
    const alertInWindow = includeAlertWindow && alertParsed >= from && alertParsed <= to;

    if (dueInWindow || alertInWindow) {
      occurrences.push({
        id: buildDateOccurrenceId(plan?.id, dueDate, step.item),
        fecha: dueDate,
        alerta_desde: alertDate,
        dias_anticipacion_alerta: leadDays,
        item: step.item,
        marker: step.marker,
        step_index: cycleIndex,
        step,
        source_type: step.source_type,
        title: step.label,
        activities: step.actividades,
        activities_text: step.actividades.join('\n'),
        frequency_days: step.frecuencia_dias,
        package_id: step.package_id,
        package_codigo: step.package_codigo,
        package_nombre: step.package_nombre,
      });
    }

    cursor = addDays(dueDate, step.frecuencia_dias);
    cycleIndex = (cycleIndex + 1) % cycle.length;
  }

  return occurrences;
}

export function getDatePlanCycleSummary(plan, maxItems = 4) {
  const cycle = getDatePlanCycle(plan);
  if (!cycle.length) return 'Sin ciclo definido';
  const parts = cycle.slice(0, maxItems).map((entry) => {
    const stepNumber = Math.max(1, Number(entry.item) || 1);
    return `Paso ${stepNumber}: ${entry.label} (${entry.frecuencia_dias}d)`;
  });
  if (cycle.length > maxItems) parts.push(`+${cycle.length - maxItems}`);
  return parts.join('  ·  ');
}
