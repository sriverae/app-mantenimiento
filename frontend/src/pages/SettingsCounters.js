import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { formatDateDisplay, formatIsoTimestampDisplay } from '../utils/dateFormat';
import {
  applyLatestCounterEntriesToPlans,
  getLatestCounterEntry,
  normalizeDateInput,
  normalizeKmPlan,
  sortCounterEntries,
  toSafeNumber,
} from '../utils/kmCounters';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import SettingsNav from '../components/SettingsNav';
import { filterRowsByColumns } from '../utils/tableFilters';
import {
  firstValidationError,
  validateNonNegativeFields,
  validateRequiredFields,
  validateTextFields,
} from '../utils/formValidation';

const COUNTERS_HISTORY_KEY = SHARED_DOCUMENT_KEYS.maintenanceCountersHistory;
const KM_STORAGE_KEY = SHARED_DOCUMENT_KEYS.maintenancePlansKm;

function SummaryCard({ label, value, color = '#111827', helper = '' }) {
  return (
    <div className="stat-card" style={{ marginBottom: 0 }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {helper ? <div style={{ color: '#64748b', marginTop: '.35rem', fontSize: '.86rem' }}>{helper}</div> : null}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '720px', maxHeight: '92vh', overflow: 'auto', background: '#fff', borderRadius: '1rem', boxShadow: '0 24px 64px rgba(15, 23, 42, .26)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.15rem', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cerrar</button>
        </div>
        <div style={{ padding: '1rem 1.15rem 1.15rem' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function formatCounterValue(value) {
  return toSafeNumber(value).toLocaleString('es-PE', { maximumFractionDigits: 2 });
}

export default function SettingsCounters() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [form, setForm] = useState({
    id: '',
    valor_contador: '',
    fecha_toma: '',
    observacion_correccion: '',
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [loadedPlans, loadedEntries] = await Promise.all([
        loadSharedDocument(KM_STORAGE_KEY, []),
        loadSharedDocument(COUNTERS_HISTORY_KEY, []),
      ]);
      if (!active) return;
      setPlans((Array.isArray(loadedPlans) ? loadedPlans : []).map((plan) => normalizeKmPlan(plan)));
      setEntries(sortCounterEntries(Array.isArray(loadedEntries) ? loadedEntries : []));
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const plansMap = useMemo(() => {
    const map = new Map();
    plans.forEach((plan) => map.set(String(plan.id), plan));
    return map;
  }, [plans]);

  const latestEntryIds = useMemo(() => {
    const map = new Map();
    plans.forEach((plan) => {
      const latest = getLatestCounterEntry(entries, plan.id);
      if (latest?.id) map.set(String(plan.id), latest.id);
    });
    return map;
  }, [entries, plans]);

  const filteredEntries = useMemo(() => {
    const text = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const plan = plansMap.get(String(entry.plan_id));
      return (`${entry.codigo} ${entry.equipo} ${entry.area_trabajo} ${entry.marca} ${entry.modelo} ${entry.origen} ${plan?.responsable || ''}`)
        .toLowerCase()
        .includes(text);
    });
  }, [entries, plansMap, query]);

  const counterTableColumns = useMemo(() => ([
    { id: 'codigo', getValue: (entry) => entry.codigo },
    { id: 'equipo', getValue: (entry) => entry.equipo },
    { id: 'area', getValue: (entry) => entry.area_trabajo || 'N.A.' },
    { id: 'marca', getValue: (entry) => entry.marca || 'N.A.' },
    { id: 'modelo', getValue: (entry) => entry.modelo || 'N.A.' },
    { id: 'vc', getValue: (entry) => entry.vc || 'Km' },
    { id: 'contador', getValue: (entry) => formatCounterValue(entry.valor_contador) },
    { id: 'fecha_toma', getValue: (entry) => formatDateDisplay(entry.fecha_toma) },
    { id: 'registrado', getValue: (entry) => formatIsoTimestampDisplay(entry.registrado_en) },
    { id: 'origen', getValue: (entry) => entry.origen || 'ACTUALIZACION' },
    { id: 'estado', getValue: (entry) => `${latestEntryIds.get(String(entry.plan_id)) === entry.id ? 'Actual' : 'Historico'} ${entry.corregido_en ? 'Corregido' : ''} ${plansMap.get(String(entry.plan_id))?.responsable || ''}` },
    { id: 'accion', filterable: false },
  ]), [latestEntryIds, plansMap]);
  const { filters: counterFilters, setFilter: setCounterFilter } = useTableColumnFilters(counterTableColumns);
  const visibleEntries = useMemo(
    () => filterRowsByColumns(filteredEntries, counterTableColumns, counterFilters),
    [filteredEntries, counterTableColumns, counterFilters],
  );

  const correctedCount = useMemo(
    () => entries.filter((entry) => entry.corregido_en).length,
    [entries],
  );

  const lastEntry = entries[0] || null;

  const openEdit = (entry) => {
    setForm({
      id: entry.id,
      valor_contador: String(entry.valor_contador ?? ''),
      fecha_toma: normalizeDateInput(entry.fecha_toma),
      observacion_correccion: entry.observacion_correccion || '',
    });
    setSuccess('');
    setError('');
    setShowModal(true);
  };

  const saveCorrection = async () => {
    const currentEntry = entries.find((entry) => entry.id === form.id);
    if (!currentEntry) return;
    const validationError = firstValidationError(
      validateRequiredFields([
        ['Contador corregido', form.valor_contador],
        ['Fecha de toma corregida', form.fecha_toma],
      ]),
      validateNonNegativeFields([['Contador corregido', form.valor_contador]]),
      validateTextFields([['Observacion de correccion', form.observacion_correccion]]),
    );
    if (validationError) {
      setError(validationError);
      setSuccess('');
      return;
    }

    const nextEntries = sortCounterEntries(entries.map((entry) => (
      entry.id === form.id
        ? {
            ...entry,
            valor_contador: toSafeNumber(form.valor_contador),
            fecha_toma: normalizeDateInput(form.fecha_toma),
            corregido_en: new Date().toISOString(),
            corregido_por: user?.full_name || user?.username || 'Usuario',
            observacion_correccion: String(form.observacion_correccion || '').trim(),
          }
        : entry
    )));

    const nextPlans = applyLatestCounterEntriesToPlans(plans, nextEntries).map((plan) => {
      const latest = getLatestCounterEntry(nextEntries, plan.id);
      return latest
        ? {
            ...plan,
            counter_initial_id: plan.counter_initial_id || latest.id,
            ultimo_contador_id: latest.id,
          }
        : plan;
    });

    setSaving(true);
    try {
      await Promise.all([
        saveSharedDocument(COUNTERS_HISTORY_KEY, nextEntries),
        saveSharedDocument(KM_STORAGE_KEY, nextPlans),
      ]);
      setEntries(nextEntries);
      setPlans(nextPlans);
      setShowModal(false);
      setError('');
      setSuccess('Contador corregido correctamente. Si era la ultima toma, el plan por km ya quedo sincronizado.');
    } catch (saveError) {
      console.error('Error guardando correccion de contador:', saveError);
      setError('No se pudo guardar la correccion del contador.');
      setSuccess('');
    } finally {
      setSaving(false);
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
      <h1 style={{ fontSize: isMobile ? '1.65rem' : '2rem', fontWeight: 700, marginBottom: '.35rem' }}>Configuraciones</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem', lineHeight: 1.6 }}>
        Historial de contadores registrados desde <strong>Plan de mantenimiento - Km</strong>. Desde aqui puedes corregir una toma si fue ingresada de manera erronea y el plan se actualizara automaticamente si esa toma era la ultima vigente.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <SettingsNav activeKey="contadores" />

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <SummaryCard label="Registros de contadores" value={entries.length} color="#2563eb" />
        <SummaryCard label="Planes con historial" value={plans.length} color="#059669" />
        <SummaryCard label="Ultima toma" value={lastEntry ? formatDateDisplay(lastEntry.fecha_toma) : 'Sin data'} color="#7c3aed" helper={lastEntry ? `${lastEntry.codigo} | ${formatCounterValue(lastEntry.valor_contador)}` : ''} />
        <SummaryCard label="Registros corregidos" value={correctedCount} color="#c2410c" />
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <input
          className="form-input"
          placeholder="Buscar por codigo, equipo, area, marca, modelo u origen"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {isMobile ? (
        <div style={{ display: 'grid', gap: '.85rem' }}>
          {visibleEntries.map((entry) => {
            const plan = plansMap.get(String(entry.plan_id));
            const isLatest = latestEntryIds.get(String(entry.plan_id)) === entry.id;
            return (
              <div key={entry.id} className="card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#111827' }}>{entry.codigo}</div>
                    <div style={{ color: '#334155', marginTop: '.15rem' }}>{entry.equipo}</div>
                  </div>
                  <span style={{ display: 'inline-flex', padding: '.3rem .65rem', borderRadius: '999px', background: isLatest ? '#ecfdf5' : '#f8fafc', color: isLatest ? '#047857' : '#475569', fontWeight: 700, fontSize: '.78rem' }}>
                    {isLatest ? 'Actual' : 'Historico'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.65rem', marginBottom: '.75rem' }}>
                  <div style={{ padding: '.75rem', borderRadius: '.8rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <div style={{ color: '#64748b', fontSize: '.8rem' }}>Contador</div>
                    <div style={{ fontWeight: 800 }}>{formatCounterValue(entry.valor_contador)}</div>
                  </div>
                  <div style={{ padding: '.75rem', borderRadius: '.8rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <div style={{ color: '#64748b', fontSize: '.8rem' }}>Fecha toma</div>
                    <div style={{ fontWeight: 800 }}>{formatDateDisplay(entry.fecha_toma)}</div>
                  </div>
                </div>

                <div style={{ color: '#475569', fontSize: '.9rem', lineHeight: 1.6 }}>
                  Area: {entry.area_trabajo || 'N.A.'} | Marca: {entry.marca || 'N.A.'} <br />
                  Modelo: {entry.modelo || 'N.A.'} | Responsable plan: {plan?.responsable || 'N.A.'} <br />
                  Origen: {entry.origen || 'ACTUALIZACION'} <br />
                  Registrado: {formatIsoTimestampDisplay(entry.registrado_en)}
                  {entry.corregido_en ? (
                    <>
                      <br />
                      Corregido: {formatIsoTimestampDisplay(entry.corregido_en)}{entry.corregido_por ? ` por ${entry.corregido_por}` : ''}
                    </>
                  ) : null}
                </div>

                <div style={{ marginTop: '.85rem' }}>
                  <button type="button" className="btn btn-primary" onClick={() => openEdit(entry)}>Editar contador</button>
                </div>
              </div>
            );
          })}

          {!visibleEntries.length && (
            <div className="card" style={{ textAlign: 'center', color: '#6b7280', marginBottom: 0 }}>
              No hay registros de contadores que coincidan con los filtros aplicados.
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1480px' }}>
            <thead>
              <tr style={{ background: '#0f3c63', color: '#fff' }}>
                {['Codigo', 'Descripcion', 'Area', 'Marca', 'Modelo', 'V.C', 'Contador', 'Fecha toma', 'Registrado', 'Origen', 'Estado', 'Accion'].map((header) => (
                  <th key={header} style={{ padding: '.55rem .6rem', border: '1px solid #265277', textAlign: 'left', fontSize: '.82rem' }}>{header}</th>
                ))}
              </tr>
              <TableFilterRow columns={counterTableColumns} rows={filteredEntries} filters={counterFilters} onChange={setCounterFilter} dark />
            </thead>
            <tbody>
              {visibleEntries.map((entry) => {
                const plan = plansMap.get(String(entry.plan_id));
                const isLatest = latestEntryIds.get(String(entry.plan_id)) === entry.id;
                return (
                  <tr key={entry.id} style={{ background: isLatest ? '#eff6ff' : '#fff' }}>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0', fontWeight: 700 }}>{entry.codigo}</td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{entry.equipo}</td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{entry.area_trabajo || 'N.A.'}</td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{entry.marca || 'N.A.'}</td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{entry.modelo || 'N.A.'}</td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{entry.vc || 'Km'}</td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0', fontWeight: 700 }}>{formatCounterValue(entry.valor_contador)}</td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{formatDateDisplay(entry.fecha_toma)}</td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{formatIsoTimestampDisplay(entry.registrado_en)}</td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>{entry.origen || 'ACTUALIZACION'}</td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>
                      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', padding: '.2rem .55rem', borderRadius: '999px', background: isLatest ? '#ecfdf5' : '#f8fafc', color: isLatest ? '#047857' : '#475569', fontWeight: 700, fontSize: '.78rem' }}>
                          {isLatest ? 'Actual' : 'Historico'}
                        </span>
                        {entry.corregido_en && (
                          <span style={{ display: 'inline-flex', padding: '.2rem .55rem', borderRadius: '999px', background: '#fff7ed', color: '#c2410c', fontWeight: 700, fontSize: '.78rem' }}>
                            Corregido
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: '.35rem' }}>
                        Responsable: {plan?.responsable || 'N.A.'}
                      </div>
                    </td>
                    <td style={{ padding: '.55rem .6rem', border: '1px solid #dbe4f0' }}>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => openEdit(entry)}>Editar</button>
                    </td>
                  </tr>
                );
              })}
              {!visibleEntries.length && (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                    No hay registros de contadores que coincidan con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Editar contador registrado" onClose={() => setShowModal(false)}>
          {(() => {
            const currentEntry = entries.find((entry) => entry.id === form.id);
            const linkedPlan = currentEntry ? plansMap.get(String(currentEntry.plan_id)) : null;
            const isLatest = currentEntry ? latestEntryIds.get(String(currentEntry.plan_id)) === currentEntry.id : false;
            return (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ padding: '1rem', borderRadius: '.95rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.35rem' }}>
                    {currentEntry?.codigo || 'Sin codigo'} - {currentEntry?.equipo || 'Sin descripcion'}
                  </div>
                  <div style={{ color: '#475569', lineHeight: 1.6 }}>
                    Area: {currentEntry?.area_trabajo || 'N.A.'} | Marca: {currentEntry?.marca || 'N.A.'} | Modelo: {currentEntry?.modelo || 'N.A.'} <br />
                    Responsable plan: {linkedPlan?.responsable || 'N.A.'} | Estado: {isLatest ? 'Toma actual del plan' : 'Registro historico'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '.85rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Contador corregido</label>
                    <input type="number" min="0" className="form-input" value={form.valor_contador} onChange={(event) => setForm((prev) => ({ ...prev, valor_contador: event.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Fecha de toma corregida</label>
                    <input type="date" className="form-input" value={form.fecha_toma} onChange={(event) => setForm((prev) => ({ ...prev, fecha_toma: event.target.value }))} />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Observacion de correccion</label>
                  <textarea className="form-input" rows={4} value={form.observacion_correccion} onChange={(event) => setForm((prev) => ({ ...prev, observacion_correccion: event.target.value }))} placeholder="Ej: Se corrigio porque el contador se digito con un cero extra." />
                </div>

                <div style={{ padding: '.9rem 1rem', borderRadius: '.9rem', background: isLatest ? '#eff6ff' : '#fff7ed', border: `1px solid ${isLatest ? '#bfdbfe' : '#fdba74'}`, color: isLatest ? '#1d4ed8' : '#9a3412', lineHeight: 1.6 }}>
                  {isLatest
                    ? 'Esta es la ultima toma del plan. Al guardar, el contador actual del plan por km tambien se actualizara.'
                    : 'Este registro es historico. Al guardarlo se corregira el historial, pero el contador actual del plan solo cambiara si esta toma pasa a ser la mas reciente.'}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.7rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                  <button type="button" className="btn btn-primary" onClick={saveCorrection} disabled={saving}>
                    {saving ? 'Guardando...' : 'Guardar correccion'}
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
