const BLOCKED_TEXT_CHARS = /[<>{}[\]\\]/;

export function isBlank(value) {
  return String(value ?? '').trim() === '';
}

export function hasBlockedTextChars(value) {
  return BLOCKED_TEXT_CHARS.test(String(value || ''));
}

export function getBlockedTextMessage(fieldLabel = 'Campo') {
  return `${fieldLabel} contiene caracteres no permitidos. Evita < > { } [ ] \\ y usa texto tecnico normal.`;
}

export function firstValidationError(...messages) {
  return messages.find(Boolean) || '';
}

export function validateRequiredFields(fields = []) {
  const missing = fields
    .filter(([, value]) => isBlank(value))
    .map(([label]) => label);
  return missing.length ? `Completa los campos obligatorios: ${missing.join(', ')}.` : '';
}

export function validateTextFields(fields = []) {
  const invalid = fields.find(([, value]) => hasBlockedTextChars(value));
  return invalid ? getBlockedTextMessage(invalid[0]) : '';
}

export function isNonNegativeNumber(value) {
  if (isBlank(value)) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

export function isPositiveNumber(value) {
  if (isBlank(value)) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function validateNonNegativeFields(fields = []) {
  const invalid = fields.find(([, value]) => !isBlank(value) && !isNonNegativeNumber(value));
  return invalid ? `${invalid[0]} debe ser un numero mayor o igual a cero.` : '';
}

export function validatePositiveFields(fields = []) {
  const invalid = fields.find(([, value]) => !isPositiveNumber(value));
  return invalid ? `${invalid[0]} debe ser un numero mayor a cero.` : '';
}

export function toNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(parsed, 0);
}

export function validateDateRange(startValue, endValue, startLabel = 'Fecha inicio', endLabel = 'Fecha fin') {
  if (isBlank(startValue) || isBlank(endValue)) return '';
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startLabel} y ${endLabel} deben tener fechas validas.`;
  }
  return end < start ? `${endLabel} no puede ser anterior a ${startLabel}.` : '';
}
