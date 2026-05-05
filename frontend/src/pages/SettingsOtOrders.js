import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import {
  formatOtNumber,
  getOtSequenceConfigForYear,
  inferMaxOtSequenceForYear,
  normalizeOtSequenceSettings,
  upsertOtSequenceConfig,
} from '../utils/otSequence';
import SettingsNav from '../components/SettingsNav';
import { firstValidationError, validateNonNegativeFields, validatePositiveFields } from '../utils/formValidation';

const OT_SEQUENCE_KEY = SHARED_DOCUMENT_KEYS.otSequenceSettings;
const OT_ALERTS_KEY = SHARED_DOCUMENT_KEYS.otAlerts;
const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;

export default function SettingsOtOrders() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [settings, setSettings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ start_number: 1, last_number: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [loadedSettings, loadedAlerts, loadedHistory] = await Promise.all([
        loadSharedDocument(OT_SEQUENCE_KEY, []),
        loadSharedDocument(OT_ALERTS_KEY, []),
        loadSharedDocument(OT_HISTORY_KEY, []),
      ]);
      if (!active) return;
      setSettings(normalizeOtSequenceSettings(loadedSettings));
      setAlerts(Array.isArray(loadedAlerts) ? loadedAlerts : []);
      setHistory(Array.isArray(loadedHistory) ? loadedHistory : []);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const detectedMax = useMemo(
    () => inferMaxOtSequenceForYear([...alerts, ...history], year),
    [alerts, history, year],
  );

  const currentConfig = useMemo(
    () => getOtSequenceConfigForYear(settings, year, detectedMax),
    [settings, year, detectedMax],
  );

  useEffect(() => {
    setForm({
      start_number: currentConfig.start_number,
      last_number: currentConfig.last_number,
    });
  }, [currentConfig.year, currentConfig.start_number, currentConfig.last_number]);

  const nextNumber = useMemo(() => {
    const start = Math.max(Number(form.start_number) || 1, 1);
    const safeLast = Math.max(Number(form.last_number) || 0, detectedMax);
    return Math.max(safeLast + 1, start);
  }, [form.start_number, form.last_number, detectedMax]);

  const save = async () => {
    const validationError = firstValidationError(
      validatePositiveFields([
        ['Anio', year],
        ['Numero inicial', form.start_number],
      ]),
      validateNonNegativeFields([['Ultimo numero usado', form.last_number]]),
    );
    if (validationError) {
      setError(validationError);
      setSuccess('');
      return;
    }
    const safeYear = Math.max(Number(year) || currentYear, 2000);
    const startNumber = Math.max(Number(form.start_number) || 1, 1);
    const typedLast = Math.max(Number(form.last_number) || 0, 0);
    const safeLast = Math.max(typedLast, detectedMax);
    const nextSettings = upsertOtSequenceConfig(settings, {
      year: safeYear,
      start_number: startNumber,
      last_number: safeLast,
    });

    setSaving(true);
    try {
      await saveSharedDocument(OT_SEQUENCE_KEY, nextSettings);
      setSettings(nextSettings);
      setError('');
      setSuccess('Configuracion de OT guardada correctamente.');
    } catch (err) {
      console.error('Error guardando configuracion OT:', err);
      setError('No se pudo guardar la configuracion de ordenes de trabajo.');
      setSuccess('');
    } finally {
      setSaving(false);
    }
  };

  const resetYear = () => {
    const startNumber = Math.max(Number(form.start_number) || 1, 1);
    setForm((prev) => ({ ...prev, last_number: Math.max(startNumber - 1, 0) }));
    setSuccess('');
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
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Controla la numeracion correlativa anual de las ordenes de trabajo.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <SettingsNav activeKey="ordenes-trabajo" />

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">Año configurado</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{year}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ultimo numero OT</div>
          <div className="stat-value" style={{ color: '#111827' }}>
            {currentConfig.last_number > 0 ? formatOtNumber(year, currentConfig.last_number) : 'Sin OT'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Siguiente OT</div>
          <div className="stat-value" style={{ color: '#059669' }}>{formatOtNumber(year, nextNumber)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Maximo detectado</div>
          <div className="stat-value" style={{ color: '#b45309' }}>{detectedMax}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, .95fr) minmax(320px, 1.05fr)', gap: '1rem' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <h2 className="card-title">Ordenes de Trabajo</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.85rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Año</label>
              <input
                type="number"
                min="2000"
                max="2100"
                className="form-input"
                value={year}
                onChange={(e) => {
                  setYear(Number(e.target.value) || currentYear);
                  setSuccess('');
                  setError('');
                }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Numero inicial del año</label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={form.start_number}
                onChange={(e) => setForm((prev) => ({ ...prev, start_number: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Ultimo numero asignado</label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={form.last_number}
                onChange={(e) => setForm((prev) => ({ ...prev, last_number: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Proximo correlativo</label>
              <input className="form-input" readOnly value={formatOtNumber(year, nextNumber)} />
            </div>
          </div>

          <div style={{ marginTop: '1rem', padding: '.9rem 1rem', borderRadius: '.8rem', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '.35rem' }}>Regla aplicada</div>
            <div style={{ color: '#475569', fontSize: '.92rem' }}>
              Las OT toman numero solo al momento de liberarse. El sistema usa el mayor valor entre el ultimo numero guardado y el maximo detectado en las OT existentes del año.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={resetYear}>Reiniciar al inicio</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar configuracion'}
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <h2 className="card-title">Resumen del año</h2>
          <div style={{ display: 'grid', gap: '.85rem' }}>
            <div style={{ padding: '1rem', borderRadius: '.8rem', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '.82rem', color: '#1d4ed8', marginBottom: '.25rem' }}>Formato OT</div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{formatOtNumber(year, nextNumber)}</div>
            </div>
            <div style={{ padding: '1rem', borderRadius: '.8rem', background: '#fff7ed', border: '1px solid #fdba74' }}>
              <div style={{ fontSize: '.82rem', color: '#c2410c', marginBottom: '.25rem' }}>Maximo detectado en OT existentes</div>
              <div style={{ fontWeight: 700, color: '#7c2d12' }}>{detectedMax}</div>
            </div>
            <div style={{ padding: '1rem', borderRadius: '.8rem', background: '#ecfdf5', border: '1px solid #86efac' }}>
              <div style={{ fontSize: '.82rem', color: '#047857', marginBottom: '.25rem' }}>Ultimo correlativo guardado</div>
              <div style={{ fontWeight: 700, color: '#065f46' }}>{currentConfig.last_number}</div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', color: '#6b7280', fontSize: '.92rem', lineHeight: 1.6 }}>
            Si cambias de año, el sistema comienza una nueva secuencia anual. Desde esta pantalla puedes definir el numero inicial y el ultimo correlativo para continuar desde donde necesites.
          </div>
        </div>
      </div>
    </div>
  );
}
