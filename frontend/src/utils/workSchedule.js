const DAY_MINUTES = 24 * 60;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeTimeValue(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Math.min(Math.max(Number(match[1]) || 0, 0), 23);
  const minutes = Math.min(Math.max(Number(match[2]) || 0, 0), 59);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function minutesFromTime(value) {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return (hours * 60) + minutes;
}

export function minutesBetweenTimes(startValue, endValue) {
  const start = minutesFromTime(startValue);
  const end = minutesFromTime(endValue);
  if (start === null || end === null) return 0;
  if (start === end) return 0;
  return end > start ? end - start : (DAY_MINUTES - start) + end;
}

export function normalizeBreaks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => ({
      id: item?.id || `ref_${index + 1}`,
      inicio: normalizeTimeValue(item?.inicio || item?.start || item?.desde),
      fin: normalizeTimeValue(item?.fin || item?.end || item?.hasta),
    }));
}

export function buildEmptyBreak() {
  return {
    id: `ref_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    inicio: '',
    fin: '',
  };
}

export function calculateBreakHours(breaks = []) {
  const minutes = normalizeBreaks(breaks)
    .reduce((sum, item) => sum + minutesBetweenTimes(item.inicio, item.fin), 0);
  return Number((minutes / 60).toFixed(2));
}

export function calculateScheduleHours(person = {}) {
  const shiftMinutes = minutesBetweenTimes(person?.hora_entrada, person?.hora_salida);
  if (shiftMinutes > 0) {
    const breakMinutes = normalizeBreaks(person?.refrigerios)
      .reduce((sum, item) => sum + minutesBetweenTimes(item.inicio, item.fin), 0);
    return Number((Math.max(shiftMinutes - breakMinutes, 0) / 60).toFixed(2));
  }
  return Number(toNumber(person?.disponibilidad_diaria_horas ?? person?.capacidad_hh_dia).toFixed(2));
}

export function formatBreaksLabel(breaks = []) {
  const labels = normalizeBreaks(breaks)
    .filter((item) => item.inicio && item.fin)
    .map((item) => `${item.inicio}-${item.fin}`);
  return labels.length ? labels.join(', ') : 'Sin refrigerio registrado';
}

export function formatWorkSchedule(person = {}) {
  const start = normalizeTimeValue(person?.hora_entrada);
  const end = normalizeTimeValue(person?.hora_salida);
  const hours = calculateScheduleHours(person);
  if (!start || !end) {
    return hours > 0 ? `Horario no definido | ${hours.toFixed(2)} h` : 'Horario no definido';
  }
  return `${start} - ${end} | Ref.: ${formatBreaksLabel(person?.refrigerios)} | ${hours.toFixed(2)} h`;
}
