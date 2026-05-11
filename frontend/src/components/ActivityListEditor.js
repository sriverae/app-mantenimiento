import React, { useMemo, useState } from 'react';

const splitActivities = (value) => String(value || '')
  .split(/\r?\n+/)
  .map((item) => item.trim())
  .filter(Boolean)
  .filter((item, index) => {
    if (index !== 0) return true;
    const normalized = item
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return !(/^x?\d+\s*[-:]/.test(normalized) && normalized.includes('paquete'));
  });

const formatActivities = (items) => (Array.isArray(items) ? items : [])
  .map((item) => String(item || '').trim())
  .filter(Boolean)
  .join('\n');

export default function ActivityListEditor({
  label = 'Actividades',
  value = '',
  onChange,
  placeholder = 'Escribe una actividad',
  emptyText = 'Sin actividades registradas.',
  disabled = false,
  inputStyle,
}) {
  const [draft, setDraft] = useState('');
  const activities = useMemo(() => splitActivities(value), [value]);

  const emit = (nextItems) => {
    onChange?.(formatActivities(nextItems));
  };

  const addActivity = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    emit([...activities, text]);
    setDraft('');
  };

  const updateActivity = (index, text) => {
    emit(activities.map((item, itemIndex) => (itemIndex === index ? text : item)));
  };

  const removeActivity = (index) => {
    emit(activities.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div>
      {label && <div className="form-label">{label}</div>}
      <div style={{ border: '1px solid #dbeafe', background: '#f8fafc', borderRadius: '.75rem', padding: '.85rem', display: 'grid', gap: '.6rem', ...inputStyle }}>
        {activities.length ? activities.map((item, index) => (
          <div key={`${index}_${item}`} style={{ display: 'grid', gridTemplateColumns: '2rem minmax(0, 1fr) auto', gap: '.5rem', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, color: '#2563eb', textAlign: 'center' }}>{index + 1}</div>
            <input
              className="form-input"
              value={item}
              disabled={disabled}
              onChange={(event) => updateActivity(index, event.target.value)}
              placeholder={placeholder}
            />
            <button type="button" className="btn btn-danger btn-sm" disabled={disabled} onClick={() => removeActivity(index)}>Quitar</button>
          </div>
        )) : (
          <span style={{ color: '#64748b' }}>{emptyText}</span>
        )}

        {!disabled && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.5rem', alignItems: 'center' }}>
            <input
              className="form-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addActivity();
                }
              }}
              placeholder={placeholder}
            />
            <button type="button" className="btn btn-secondary" onClick={addActivity}>Agregar</button>
          </div>
        )}
      </div>
    </div>
  );
}
