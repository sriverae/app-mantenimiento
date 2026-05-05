export const EXACT_FILTER_PREFIX = '__exact__:';

export function buildInitialTableFilters(columns = []) {
  return (Array.isArray(columns) ? columns : []).reduce((acc, column) => {
    if (column?.filterable === false || !column?.id) return acc;
    acc[column.id] = '';
    return acc;
  }, {});
}

export function syncTableFilters(columns = [], currentFilters = {}) {
  const nextFilters = buildInitialTableFilters(columns);
  Object.keys(nextFilters).forEach((key) => {
    nextFilters[key] = currentFilters[key] ?? '';
  });
  return nextFilters;
}

export function getColumnFilterValue(row, column) {
  if (!column) return '';
  const rawValue = typeof column.getValue === 'function'
    ? column.getValue(row)
    : row?.[column.id];

  if (Array.isArray(rawValue)) {
    return rawValue.join(' ');
  }

  if (rawValue === null || rawValue === undefined) return '';
  return String(rawValue);
}

export function filterRowsByColumns(rows = [], columns = [], filters = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeColumns = Array.isArray(columns) ? columns : [];

  return safeRows.filter((row) => safeColumns.every((column) => {
    if (column?.filterable === false || !column?.id) return true;
    const rawFilterText = String(filters?.[column.id] ?? '').trim();
    const useExactMatch = rawFilterText.startsWith(EXACT_FILTER_PREFIX);
    const filterText = (useExactMatch ? rawFilterText.slice(EXACT_FILTER_PREFIX.length) : rawFilterText).trim().toLowerCase();
    if (!filterText) return true;
    const value = getColumnFilterValue(row, column).trim().toLowerCase();
    return useExactMatch ? value === filterText : value.includes(filterText);
  }));
}

export function hasActiveTableFilters(filters = {}) {
  return Object.values(filters).some((value) => String(value ?? '').trim());
}

export function buildColumnFilterOptions(rows = [], column = {}, maxOptions = 120) {
  if (!column || column.filterable === false || !column.id) return [];
  const seen = new Set();
  const options = [];

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const value = getColumnFilterValue(row, column).trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push(value);
  });

  return options
    .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' }))
    .slice(0, maxOptions);
}
