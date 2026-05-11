import React, { useMemo, useState } from 'react';

const normalizeText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const getUniqueOptions = (items, getValue) => Array.from(new Set(
  (Array.isArray(items) ? items : [])
    .map((item) => String(getValue(item) || '').trim())
    .filter(Boolean),
)).sort((a, b) => a.localeCompare(b));

export default function CatalogSearchSelect({
  label,
  items = [],
  value = '',
  onChange,
  optionLabel,
  placeholder = 'Selecciona...',
  textPlaceholder = 'Buscar...',
  filters = [],
  searchFields = [],
  resultLabel = 'resultado(s)',
}) {
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState({});

  const normalizedFilters = useMemo(() => filters.map((filter) => ({
    ...filter,
    options: Array.isArray(filter.options) ? filter.options : getUniqueOptions(items, filter.getValue || ((item) => item?.[filter.id])),
  })), [filters, items]);

  const visibleItems = useMemo(() => {
    const q = normalizeText(query);
    return (Array.isArray(items) ? items : []).filter((item) => {
      const matchesQuery = !q || searchFields.some((field) => {
        const raw = typeof field === 'function' ? field(item) : item?.[field];
        return normalizeText(raw).includes(q);
      });
      const matchesFilters = normalizedFilters.every((filter) => {
        const selected = filterValues[filter.id] || '';
        if (!selected) return true;
        const raw = filter.getValue ? filter.getValue(item) : item?.[filter.id];
        return String(raw || '') === String(selected);
      });
      return matchesQuery && matchesFilters;
    });
  }, [filterValues, items, normalizedFilters, query, searchFields]);

  const selectedStillVisible = visibleItems.some((item) => String(item.id) === String(value));
  const selectedItem = (Array.isArray(items) ? items : []).find((item) => String(item.id) === String(value));

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      {label && <label className="form-label">{label}</label>}
      <div style={{ display: 'grid', gridTemplateColumns: normalizedFilters.length ? `minmax(220px, 1fr) repeat(${normalizedFilters.length}, minmax(150px, .55fr))` : '1fr', gap: '.55rem', marginBottom: '.55rem' }}>
        <input
          className="form-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={textPlaceholder}
        />
        {normalizedFilters.map((filter) => (
          <select
            key={filter.id}
            className="form-select"
            value={filterValues[filter.id] || ''}
            onChange={(event) => setFilterValues((prev) => ({ ...prev, [filter.id]: event.target.value }))}
          >
            <option value="">{filter.allLabel || 'Todos'}</option>
            {filter.options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ))}
      </div>
      <select
        className="form-select"
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {!selectedStillVisible && selectedItem && (
          <option value={selectedItem.id}>{optionLabel(selectedItem)}</option>
        )}
        {visibleItems.map((item) => (
          <option key={item.id} value={item.id}>{optionLabel(item)}</option>
        ))}
      </select>
      <div style={{ marginTop: '.35rem', color: '#64748b', fontSize: '.82rem' }}>
        {visibleItems.length} {resultLabel}
      </div>
    </div>
  );
}
