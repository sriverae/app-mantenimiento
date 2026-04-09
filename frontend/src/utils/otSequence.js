export const OT_SEQUENCE_PADDING = 6;

export function formatOtNumber(year, sequence) {
  const safeYear = Number(year) || new Date().getFullYear();
  const safeSequence = Math.max(Number(sequence) || 0, 0);
  return `OT-${safeYear}-${String(safeSequence).padStart(OT_SEQUENCE_PADDING, '0')}`;
}

export function parseOtNumber(value) {
  const match = /^OT-(\d{4})-(\d+)$/.exec(String(value || '').trim());
  if (!match) return null;
  return {
    year: Number(match[1]) || 0,
    sequence: Number(match[2]) || 0,
  };
}

export function inferMaxOtSequenceForYear(rows, year) {
  const safeYear = Number(year) || new Date().getFullYear();
  return (Array.isArray(rows) ? rows : []).reduce((max, row) => {
    const parsed = parseOtNumber(row?.ot_numero);
    if (!parsed || parsed.year !== safeYear) return max;
    return parsed.sequence > max ? parsed.sequence : max;
  }, 0);
}

export function normalizeOtSequenceSettings(data) {
  return (Array.isArray(data) ? data : [])
    .map((item) => ({
      year: Number(item?.year) || new Date().getFullYear(),
      start_number: Math.max(Number(item?.start_number) || 1, 1),
      last_number: Math.max(Number(item?.last_number) || 0, 0),
    }))
    .sort((a, b) => b.year - a.year);
}

export function getOtSequenceConfigForYear(settings, year, detectedMax = 0) {
  const safeYear = Number(year) || new Date().getFullYear();
  const normalized = normalizeOtSequenceSettings(settings);
  const existing = normalized.find((item) => item.year === safeYear);
  const startNumber = Math.max(Number(existing?.start_number) || 1, 1);
  const lastNumber = Math.max(Number(existing?.last_number) || 0, Number(detectedMax) || 0);
  return {
    year: safeYear,
    start_number: startNumber,
    last_number: lastNumber,
    detected_max: Math.max(Number(detectedMax) || 0, 0),
    next_number: Math.max(lastNumber + 1, startNumber),
  };
}

export function upsertOtSequenceConfig(settings, config) {
  const normalized = normalizeOtSequenceSettings(settings);
  const safeYear = Number(config?.year) || new Date().getFullYear();
  const nextRow = {
    year: safeYear,
    start_number: Math.max(Number(config?.start_number) || 1, 1),
    last_number: Math.max(Number(config?.last_number) || 0, 0),
  };
  const filtered = normalized.filter((item) => item.year !== safeYear);
  return [...filtered, nextRow].sort((a, b) => b.year - a.year);
}
