import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import ConfigurableSelectField from '../components/ConfigurableSelectField';
import TableFilterRow from '../components/TableFilterRow';
import useConfigurableLists from '../hooks/useConfigurableLists';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { isReadOnlyRole } from '../utils/roleAccess';
import { filterRowsByColumns } from '../utils/tableFilters';
import {
  firstValidationError,
  getBlockedTextMessage,
  hasBlockedTextChars,
  toNonNegativeNumber,
  validateNonNegativeFields,
  validateRequiredFields,
  validateTextFields,
} from '../utils/formValidation';

const PACKAGES_KEY = SHARED_DOCUMENT_KEYS.maintenancePackages;

const INITIAL_PACKAGES = [
  {
    id: 1,
    codigo: 'PK-001',
    vc: 'V.C - DÍA',
    nombre: 'SECADO_ELEVADOR',
    tiempo_min: 60,
    actividades: ['Inspección visual general', 'Limpieza de componentes', 'Verificación de ajuste de pernos'],
  },
];

const EMPTY_FORM = {
  codigo: '',
  vc: 'V.C - DÍA',
  nombre: '',
  tiempo_min: '',
};

export default function PmpPaquetesMantenimiento() {
  const { user } = useAuth();
  const {
    getOptions,
    addOptionQuickly,
    canManage: canManageConfigurableLists,
  } = useConfigurableLists();
  const isReadOnly = isReadOnlyRole(user);
  const [items, setItems] = useState(INITIAL_PACKAGES);
  const [selectedId, setSelectedId] = useState(INITIAL_PACKAGES[0]?.id ?? null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [activityInput, setActivityInput] = useState('');
  const [activities, setActivities] = useState([]);
  const [filterVc, setFilterVc] = useState('TODOS');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadSharedDocument(PACKAGES_KEY, INITIAL_PACKAGES).then((data) => {
      if (!active) return;
      const nextItems = Array.isArray(data) && data.length ? data : INITIAL_PACKAGES;
      setItems(nextItems);
      setSelectedId(nextItems[0]?.id ?? null);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const persist = async (next) => {
    if (isReadOnly) return;
    setItems(next);
    await saveSharedDocument(PACKAGES_KEY, next);
  };

  const filtered = useMemo(() => {
    if (filterVc === 'TODOS') return items;
    return items.filter((item) => item.vc === filterVc);
  }, [items, filterVc]);
  const packageTableColumns = useMemo(() => ([
    { id: 'codigo', getValue: (item) => item.codigo },
    { id: 'vc', getValue: (item) => item.vc },
    { id: 'nombre', getValue: (item) => item.nombre },
    { id: 'tiempo_min', getValue: (item) => item.tiempo_min },
    { id: 'actividades', getValue: (item) => item.actividades?.length || 0 },
  ]), []);
  const { filters: packageFilters, setFilter: setPackageFilter } = useTableColumnFilters(packageTableColumns);
  const visibleRows = useMemo(
    () => filterRowsByColumns(filtered, packageTableColumns, packageFilters),
    [filtered, packageTableColumns, packageFilters],
  );
  const activityTableColumns = useMemo(() => ([
    { id: 'item', getValue: (row) => row.index + 1 },
    { id: 'descripcion', getValue: (row) => row.activity },
    { id: 'accion', filterable: false },
  ]), []);
  const { filters: activityFilters, setFilter: setActivityFilter } = useTableColumnFilters(activityTableColumns);
  const visibleActivities = useMemo(
    () => filterRowsByColumns(activities.map((activity, index) => ({ activity, index })), activityTableColumns, activityFilters),
    [activities, activityTableColumns, activityFilters],
  );
  const vcOptions = useMemo(
    () => getOptions('variaciones_control', ['V.C - DIA', 'V.C - HRA', 'V.C - KM']),
    [getOptions],
  );

  const selected = items.find((item) => item.id === selectedId) || null;

  const handleNew = () => {
    if (isReadOnly) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
    setActivities([]);
    setActivityInput('');
  };

  const handleEdit = () => {
    if (isReadOnly) return;
    if (!selected) return;
    setEditingId(selected.id);
    setForm({
      codigo: selected.codigo,
      vc: selected.vc,
      nombre: selected.nombre,
      tiempo_min: selected.tiempo_min,
    });
    setActivities(selected.actividades || []);
    setActivityInput('');
  };

  const handleDelete = async () => {
    if (isReadOnly) return;
    if (!selected) return;
    if (!window.confirm(`¿Eliminar paquete ${selected.nombre}?`)) return;
    const next = items.filter((item) => item.id !== selected.id);
    await persist(next);
    setSelectedId(next[0]?.id ?? null);
    handleNew();
  };

  const addActivity = () => {
    if (isReadOnly) return;
    const text = activityInput.trim();
    if (!text) return;
    if (hasBlockedTextChars(text)) {
      window.alert(getBlockedTextMessage('Actividad'));
      return;
    }
    setActivities((prev) => [...prev, text]);
    setActivityInput('');
  };

  const removeActivity = (index) => {
    if (isReadOnly) return;
    setActivities((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    if (isReadOnly) return;
    const validationError = firstValidationError(
      validateRequiredFields([
        ['Codigo', form.codigo],
        ['Nombre', form.nombre],
      ]),
      validateTextFields([
        ['Codigo', form.codigo],
        ['V.C', form.vc],
        ['Nombre', form.nombre],
        ...activities.map((activity, index) => [`Actividad ${index + 1}`, activity]),
      ]),
      validateNonNegativeFields([
        ['Tiempo', form.tiempo_min],
      ]),
    );
    if (validationError) {
      window.alert(validationError);
      return;
    }
    if (!activities.length) {
      window.alert('Completa código, nombre y agrega al menos una actividad.');
      return;
    }

    const payload = {
      codigo: form.codigo.trim().toUpperCase(),
      vc: form.vc,
      nombre: form.nombre.trim(),
      tiempo_min: toNonNegativeNumber(form.tiempo_min),
      actividades: activities,
    };

    if (editingId) {
      const next = items.map((item) => (item.id === editingId ? { ...item, ...payload } : item));
      await persist(next);
      setSelectedId(editingId);
    } else {
      const nextId = items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
      const next = [{ id: nextId, ...payload }, ...items];
      await persist(next);
      setSelectedId(nextId);
    }

    handleNew();
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
      {isReadOnly && (
        <ReadOnlyAccessNotice message="Puedes revisar los paquetes PM y sus actividades, pero este perfil no puede crear, editar ni eliminar paquetes." />
      )}
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Control de paquetes de mantenimiento</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Crea, modifica o elimina paquetes PM (conjunto de actividades).</p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}><input type="radio" name="vc" checked={filterVc === 'TODOS'} onChange={() => setFilterVc('TODOS')} />TODOS</label>
          <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}><input type="radio" name="vc" checked={filterVc === 'V.C - DÍA'} onChange={() => setFilterVc('V.C - DÍA')} />V.C - DÍA</label>
          <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}><input type="radio" name="vc" checked={filterVc === 'V.C - HRA'} onChange={() => setFilterVc('V.C - HRA')} />V.C - HRA</label>
          <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}><input type="radio" name="vc" checked={filterVc === 'V.C - KM'} onChange={() => setFilterVc('V.C - KM')} />V.C - KM</label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1rem' }}>
        <div className="card" style={{ overflowX: 'auto' }}>
          <h3 className="card-title">Paquetes PM</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                {['Código', 'V.C', 'Nombre del paquete PM', 'Tiempo (min.)', 'Actividades'].map((h) => <th key={h} style={{ border: '1px solid #e5e7eb', padding: '.5rem', textAlign: 'left' }}>{h}</th>)}
              </tr>
              <TableFilterRow columns={packageTableColumns} rows={filtered} filters={packageFilters} onChange={setPackageFilter} />
            </thead>
            <tbody>
              {visibleRows.map((item) => (
                <tr key={item.id} onClick={() => setSelectedId(item.id)} style={{ cursor: 'pointer', background: selectedId === item.id ? '#eff6ff' : '#fff' }}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.codigo}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.vc}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.nombre}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.tiempo_min}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.45rem' }}>{item.actividades?.length || 0}</td>
                </tr>
              ))}
              {!visibleRows.length && (
                <tr>
                  <td colSpan={5} style={{ border: '1px solid #e5e7eb', padding: '.8rem', textAlign: 'center', color: '#6b7280' }}>
                    No hay paquetes que coincidan con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 className="card-title">Resultados</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '.7rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Código *</label><input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
            <ConfigurableSelectField
              label="V.C"
              manageLabel="V.C"
              value={form.vc}
              options={vcOptions}
              onChange={(e) => setForm({ ...form, vc: e.target.value })}
              onQuickAdd={async () => {
                const result = await addOptionQuickly('variaciones_control', 'V.C');
                if (result?.added) {
                  setForm((prev) => ({ ...prev, vc: result.value }));
                }
              }}
              canManageOptions={canManageConfigurableLists}
              placeholder="Selecciona V.C"
            />
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Nombre *</label><input className="form-input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Tiempo (min.)</label><input type="number" className="form-input" value={form.tiempo_min} onChange={(e) => setForm({ ...form, tiempo_min: e.target.value })} /></div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label className="form-label">Actividad</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.6rem' }}>
              <input className="form-input" value={activityInput} onChange={(e) => setActivityInput(e.target.value)} placeholder="Escribe una actividad" />
              {!isReadOnly && <button type="button" className="btn btn-primary" onClick={addActivity}>Agregar</button>}
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem', marginBottom: 0, padding: '.8rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', width: '90px' }}>Ítem</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'left' }}>Descripción de las actividades</th>
                  <th style={{ border: '1px solid #e5e7eb', padding: '.4rem', width: '90px' }}>Acción</th>
                </tr>
                <TableFilterRow columns={activityTableColumns} rows={activities.map((activity, index) => ({ activity, index }))} filters={activityFilters} onChange={setActivityFilter} />
              </thead>
              <tbody>
                {visibleActivities.map(({ activity, index }) => (
                  <tr key={`${activity}-${index}`}>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}>{index + 1}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem' }}>{activity}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '.4rem', textAlign: 'center' }}>
                      {!isReadOnly && <button type="button" className="btn btn-danger btn-sm" onClick={() => removeActivity(index)}>Quitar</button>}
                    </td>
                  </tr>
                ))}
                {!visibleActivities.length && <tr><td colSpan={3} style={{ border: '1px solid #e5e7eb', padding: '.6rem', textAlign: 'center', color: '#6b7280' }}>Sin actividades que coincidan con los filtros.</td></tr>}
              </tbody>
            </table>
          </div>

          {!isReadOnly && (
            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={handleNew}>Nuevo</button>
              <button type="button" className="btn btn-secondary" onClick={handleEdit} disabled={!selected}>Editar</button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={!selected}>Eliminar</button>
              <button type="button" className="btn btn-success" onClick={handleSave}>{editingId ? 'Actualizar' : 'Registrar'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
