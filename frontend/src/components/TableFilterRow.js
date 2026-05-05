import React, { useMemo } from 'react';
import { buildColumnFilterOptions, EXACT_FILTER_PREFIX } from '../utils/tableFilters';

function stripExactPrefix(value) {
  const text = String(value || '');
  return text.startsWith(EXACT_FILTER_PREFIX) ? text.slice(EXACT_FILTER_PREFIX.length) : text;
}

export default function TableFilterRow({
  columns = [],
  filters = {},
  onChange,
  dark = false,
  rows = [],
  maxOptions = 120,
}) {
  const optionsByColumn = useMemo(() => (
    (Array.isArray(columns) ? columns : []).reduce((acc, column) => {
      if (column?.filterable === false || !column?.id) return acc;
      acc[column.id] = Array.isArray(column.filterOptions)
        ? column.filterOptions
        : buildColumnFilterOptions(rows, column, column.maxFilterOptions || maxOptions);
      return acc;
    }, {})
  ), [columns, rows, maxOptions]);

  return (
    <tr style={{ background: dark ? '#102f48' : '#f8fafc' }}>
      {columns.map((column) => (
        <th
          key={`filter-${column.id || column.label}`}
          style={{
            border: dark ? '1px solid #2f4f75' : '1px solid #e5e7eb',
            padding: '.25rem',
            minWidth: column.minFilterWidth || '90px',
            background: dark ? '#102f48' : '#f8fafc',
          }}
        >
          {column.filterable === false ? null : (() => {
            const value = filters[column.id] ?? '';
            const displayValue = stripExactPrefix(value);
            const options = optionsByColumn[column.id] || [];
            const normalizedOptions = displayValue && !options.includes(displayValue) ? [displayValue, ...options] : options;

            return (
              <div style={{ position: 'relative' }}>
                <select
                  value={value}
                  onChange={(event) => onChange?.(column.id, event.target.value)}
                  title={displayValue ? `Filtro: ${displayValue}` : `Filtrar ${column.label || column.id}`}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    appearance: 'none',
                    borderRadius: '999px',
                    border: value ? '1px solid #2563eb' : (dark ? '1px solid #335f86' : '1px solid #cbd5e1'),
                    padding: '.34rem 1.45rem .34rem .55rem',
                    fontSize: '.74rem',
                    fontWeight: value ? 700 : 600,
                    background: value ? '#eff6ff' : '#fff',
                    color: value ? '#1d4ed8' : '#475569',
                    boxShadow: value ? '0 0 0 1px rgba(37,99,235,.08)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Todos</option>
                  {normalizedOptions.map((option) => (
                    <option key={`${column.id}-${option}`} value={`${EXACT_FILTER_PREFIX}${option}`}>
                      {option}
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    right: '.52rem',
                    top: '50%',
                    transform: 'translateY(-52%)',
                    color: value ? '#1d4ed8' : '#64748b',
                    fontSize: '.72rem',
                    pointerEvents: 'none',
                  }}
                >
                  v
                </span>
              </div>
            );
          })()}
        </th>
      ))}
    </tr>
  );
}
