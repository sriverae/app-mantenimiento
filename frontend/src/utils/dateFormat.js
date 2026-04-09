function safeText(value) {
  return String(value || '').trim();
}

export function formatDateDisplay(value, fallback = 'N.A.') {
  const text = safeText(value);
  if (!text) return fallback;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-');
    return `${day}/${month}/${year}`;
  }

  const isoDateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})T/.exec(text);
  if (isoDateTimeMatch) {
    return `${isoDateTimeMatch[3]}/${isoDateTimeMatch[2]}/${isoDateTimeMatch[1]}`;
  }

  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text);
  if (slashMatch) {
    const day = String(Number(slashMatch[1])).padStart(2, '0');
    const month = String(Number(slashMatch[2])).padStart(2, '0');
    const rawYear = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${day}/${month}/${rawYear}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}`;
  }

  return text;
}

export function formatTimeDisplay(value, fallback = '') {
  const text = safeText(value);
  if (!text) return fallback;
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  if (!match) return text;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

export function formatDateTimeDisplay(dateValue, timeValue, fallback = 'N.A.') {
  const dateText = formatDateDisplay(dateValue, '');
  const timeText = formatTimeDisplay(timeValue, '');
  const result = [dateText, timeText].filter(Boolean).join(' ').trim();
  return result || fallback;
}

export function formatIsoTimestampDisplay(value, fallback = 'N.A.') {
  const text = safeText(value);
  if (!text) return fallback;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()} ${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}
