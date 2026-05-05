import React, { useMemo } from 'react';

function uniqueOptions(values = [], currentValue = '') {
  const unique = new Set();
  const result = [];
  [...values, currentValue].forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (unique.has(key)) return;
    unique.add(key);
    result.push(normalized);
  });
  return result;
}

export default function ConfigurableSelectField({
  label,
  value,
  options = [],
  onChange,
  onQuickAdd,
  canManageOptions = false,
  manageLabel,
  placeholder = 'Selecciona una opcion',
  required = false,
  disabled = false,
  selectStyle,
}) {
  const mergedOptions = useMemo(() => uniqueOptions(options, value), [options, value]);
  const quickManageLabel = manageLabel || (typeof label === 'string' ? label : 'opcion');
  const labelNode = React.isValidElement(label) ? label : <label className="form-label">{label}</label>;

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.55rem', marginBottom: '.35rem' }}>
        <div style={{ minWidth: 0, flex: 1 }}>{labelNode}</div>
        {canManageOptions && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onQuickAdd}
            disabled={disabled}
            title={`Editar lista de ${String(quickManageLabel || 'opcion').toLowerCase()}`}
            aria-label={`Editar lista de ${quickManageLabel}`}
            style={{
              minWidth: '34px',
              width: '34px',
              height: '34px',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '999px',
              fontWeight: 800,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            +
          </button>
        )}
      </div>
      <div>
        <select className="form-select" style={selectStyle} value={value} onChange={onChange} required={required} disabled={disabled}>
          <option value="">{placeholder}</option>
          {mergedOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
