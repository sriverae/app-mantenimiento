import React, { useMemo, useState } from 'react';
import SettingsNav from '../components/SettingsNav';
import useConfigurableLists from '../hooks/useConfigurableLists';
import {
  CONFIGURABLE_LIST_DEFINITIONS,
  removeConfigurableOption,
  updateConfigurableOption,
} from '../utils/configurableLists';
import { getBlockedTextMessage, hasBlockedTextChars } from '../utils/formValidation';

export default function SettingsDropdownLists() {
  const {
    lists,
    loading,
    saving,
    error,
    setError,
    persistLists,
  } = useConfigurableLists();
  const [selectedKey, setSelectedKey] = useState(CONFIGURABLE_LIST_DEFINITIONS[0]?.key || 'responsables');
  const [newValue, setNewValue] = useState('');
  const [editingValue, setEditingValue] = useState('');
  const [editingDraft, setEditingDraft] = useState('');
  const [success, setSuccess] = useState('');

  const selectedList = useMemo(
    () => lists.find((item) => item.key === selectedKey) || CONFIGURABLE_LIST_DEFINITIONS[0],
    [lists, selectedKey],
  );

  const summaryCards = useMemo(
    () => lists.map((item) => ({
      key: item.key,
      label: item.label,
      total: item.options.length,
    })),
    [lists],
  );

  const saveNewValue = async () => {
    const typed = String(newValue || '').trim();
    if (!typed) {
      setError('Escribe un valor antes de agregarlo.');
      setSuccess('');
      return;
    }
    if (hasBlockedTextChars(typed)) {
      setError(getBlockedTextMessage('Nuevo valor'));
      setSuccess('');
      return;
    }

    const duplicate = (selectedList?.options || []).some((item) => item.toLowerCase() === typed.toLowerCase());
    if (duplicate) {
      setError(`"${typed}" ya existe en ${selectedList.label.toLowerCase()}.`);
      setSuccess('');
      return;
    }

    try {
      const nextLists = lists.map((item) => (
        item.key === selectedKey ? { ...item, options: [...item.options, typed] } : item
      ));
      await persistLists(nextLists);
      setNewValue('');
      setSuccess(`Se agrego "${typed}" a ${selectedList.label.toLowerCase()}.`);
    } catch (saveError) {
      console.error('Error agregando valor configurable:', saveError);
    }
  };

  const startEdit = (value) => {
    setEditingValue(value);
    setEditingDraft(value);
    setSuccess('');
    setError('');
  };

  const saveEdit = async () => {
    const typed = String(editingDraft || '').trim();
    if (!typed) {
      setError('El valor editado no puede quedar vacio.');
      setSuccess('');
      return;
    }
    if (hasBlockedTextChars(typed)) {
      setError(getBlockedTextMessage('Valor editado'));
      setSuccess('');
      return;
    }
    const duplicate = (selectedList?.options || []).some(
      (item) => item.toLowerCase() === typed.toLowerCase() && item.toLowerCase() !== String(editingValue || '').toLowerCase(),
    );
    if (duplicate) {
      setError(`"${typed}" ya existe en ${selectedList.label.toLowerCase()}.`);
      setSuccess('');
      return;
    }

    try {
      const nextLists = updateConfigurableOption(lists, selectedKey, editingValue, typed);
      await persistLists(nextLists);
      setSuccess(`Se actualizo "${editingValue}" a "${typed}".`);
      setEditingValue('');
      setEditingDraft('');
    } catch (saveError) {
      console.error('Error actualizando valor configurable:', saveError);
    }
  };

  const deleteValue = async (value) => {
    const confirmed = window.confirm(`¿Deseas eliminar "${value}" de ${selectedList.label.toLowerCase()}?`);
    if (!confirmed) return;

    try {
      const nextLists = removeConfigurableOption(lists, selectedKey, value);
      await persistLists(nextLists);
      setSuccess(`Se elimino "${value}" de ${selectedList.label.toLowerCase()}.`);
      if (editingValue === value) {
        setEditingValue('');
        setEditingDraft('');
      }
    } catch (saveError) {
      console.error('Error eliminando valor configurable:', saveError);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Configuraciones</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem', lineHeight: 1.6 }}>
        Administra las listas desplegables que se usan en OT, planes y formularios operativos. Los cambios quedan disponibles para Planner e Ingeniero desde los botones <strong>+</strong> junto a cada lista.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <SettingsNav activeKey="listas-desplegables" />

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        {summaryCards.map((item) => (
          <div key={item.key} className="stat-card" style={{ marginBottom: 0 }}>
            <div className="stat-label">{item.label}</div>
            <div className="stat-value" style={{ color: '#2563eb' }}>{item.total}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, .9fr) minmax(320px, 1.1fr)', gap: '1rem' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <h2 className="card-title">Listas disponibles</h2>
          <div style={{ display: 'grid', gap: '.75rem' }}>
            {lists.map((item) => {
              const active = item.key === selectedKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setSelectedKey(item.key);
                    setEditingValue('');
                    setEditingDraft('');
                    setError('');
                    setSuccess('');
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '.95rem 1rem',
                    borderRadius: '.95rem',
                    border: active ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: active ? '#eff6ff' : '#fff',
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '.25rem' }}>{item.label}</div>
                  <div style={{ color: '#64748b', fontSize: '.9rem', lineHeight: 1.55 }}>{item.description}</div>
                  <div style={{ marginTop: '.45rem', color: active ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: '.88rem' }}>
                    {item.options.length} opcion(es)
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.8rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.85rem' }}>
            <div>
              <h2 className="card-title" style={{ marginBottom: '.2rem' }}>{selectedList?.label || 'Lista'}</h2>
              <div style={{ color: '#64748b', fontSize: '.92rem', lineHeight: 1.6 }}>
                {selectedList?.description}
              </div>
            </div>
            <div style={{ padding: '.4rem .8rem', borderRadius: '999px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800 }}>
              {selectedList?.options?.length || 0} opcion(es)
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.65rem', marginBottom: '1rem' }}>
            <input
              className="form-input"
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              placeholder={`Agregar nuevo valor para ${selectedList?.label?.toLowerCase() || 'la lista'}`}
            />
            <button type="button" className="btn btn-primary" onClick={saveNewValue} disabled={saving}>
              {saving ? 'Guardando...' : 'Agregar'}
            </button>
          </div>

          <div style={{ display: 'grid', gap: '.7rem' }}>
            {(selectedList?.options || []).map((item) => {
              const isEditing = editingValue === item;
              return (
                <div
                  key={item}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                    gap: '.55rem',
                    alignItems: 'center',
                    padding: '.85rem .9rem',
                    borderRadius: '.9rem',
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                  }}
                >
                  {isEditing ? (
                    <input className="form-input" value={editingDraft} onChange={(event) => setEditingDraft(event.target.value)} />
                  ) : (
                    <div style={{ color: '#0f172a', fontWeight: 700 }}>{item}</div>
                  )}

                  {isEditing ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
                      Guardar
                    </button>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(item)}>
                      Editar
                    </button>
                  )}

                  <button
                    type="button"
                    className={isEditing ? 'btn btn-secondary btn-sm' : 'btn btn-danger btn-sm'}
                    onClick={() => (isEditing ? (setEditingValue(''), setEditingDraft('')) : deleteValue(item))}
                  >
                    {isEditing ? 'Cancelar' : 'Eliminar'}
                  </button>
                </div>
              );
            })}

            {!(selectedList?.options || []).length && (
              <div style={{ padding: '1rem', borderRadius: '.9rem', border: '1px dashed #cbd5e1', color: '#6b7280', textAlign: 'center' }}>
                Todavia no hay valores registrados en esta lista.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
