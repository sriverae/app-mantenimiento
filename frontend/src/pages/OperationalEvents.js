import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { formatDateDisplay } from '../utils/dateFormat';

const EVENTS_KEY = SHARED_DOCUMENT_KEYS.operationalEvents;

const EVENT_TYPES = [
  'Evento climatologico',
  'Corte de energia',
  'Restriccion operacional',
  'Parada externa',
  'Otro',
];

const getYesterdayKey = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
};

const buildEventId = () => `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const normalizeEvent = (item = {}) => ({
  id: item.id || buildEventId(),
  fecha_operativa: String(item.fecha_operativa || '').slice(0, 10),
  hubo_evento: Boolean(item.hubo_evento),
  tipo_evento: item.tipo_evento || '',
  hora_inicio: item.hora_inicio || '',
  hora_fin: item.hora_fin || '',
  descripcion: item.descripcion || '',
  registrado_por: item.registrado_por || '',
  registrado_at: item.registrado_at || '',
});

export default function OperationalEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({
    hubo_evento: '',
    tipo_evento: EVENT_TYPES[0],
    hora_inicio: '',
    hora_fin: '',
    descripcion: '',
  });

  const yesterdayKey = getYesterdayKey();

  const loadEvents = async () => {
    setLoading(true);
    const data = await loadSharedDocument(EVENTS_KEY, []);
    setEvents((Array.isArray(data) ? data : []).map(normalizeEvent));
    setLoading(false);
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const yesterdayRecord = useMemo(
    () => events.find((item) => item.fecha_operativa === yesterdayKey) || null,
    [events, yesterdayKey],
  );

  const visibleHistory = useMemo(
    () => events
      .filter((item) => !historyMonth || String(item.fecha_operativa || '').startsWith(historyMonth))
      .sort((a, b) => String(b.fecha_operativa || '').localeCompare(String(a.fecha_operativa || ''))),
    [events, historyMonth],
  );

  const persistRecord = async (record) => {
    const nextEvents = [
      record,
      ...events.filter((item) => item.fecha_operativa !== record.fecha_operativa),
    ].sort((a, b) => String(b.fecha_operativa || '').localeCompare(String(a.fecha_operativa || '')));
    const saved = await saveSharedDocument(EVENTS_KEY, nextEvents);
    setEvents((Array.isArray(saved) ? saved : nextEvents).map(normalizeEvent));
  };

  const handleNoEvent = async () => {
    const confirmed = window.confirm('Confirma la respuesta: ayer no hubo ningun evento climatologico, corte de energia u otro evento externo que afecte la operacion?');
    if (!confirmed) return;

    setSaving(true);
    setMessage('');
    try {
      await persistRecord({
        id: yesterdayRecord?.id || buildEventId(),
        fecha_operativa: yesterdayKey,
        hubo_evento: false,
        tipo_evento: '',
        hora_inicio: '',
        hora_fin: '',
        descripcion: '',
        registrado_por: user?.full_name || user?.username || 'Usuario',
        registrado_at: new Date().toISOString(),
      });
      setForm((current) => ({ ...current, hubo_evento: 'no', descripcion: '', hora_inicio: '', hora_fin: '' }));
      setMessage('Respuesta registrada: ayer no hubo eventos.');
    } catch (error) {
      setMessage(error?.message || 'No se pudo guardar la respuesta.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEvent = async (event) => {
    event.preventDefault();
    if (!form.hora_inicio || !form.hora_fin || !form.descripcion.trim()) {
      setMessage('Completa hora inicio, hora fin y descripcion del evento.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await persistRecord({
        id: yesterdayRecord?.id || buildEventId(),
        fecha_operativa: yesterdayKey,
        hubo_evento: true,
        tipo_evento: form.tipo_evento,
        hora_inicio: form.hora_inicio,
        hora_fin: form.hora_fin,
        descripcion: form.descripcion.trim(),
        registrado_por: user?.full_name || user?.username || 'Usuario',
        registrado_at: new Date().toISOString(),
      });
      setMessage('Evento registrado en el historial.');
    } catch (error) {
      setMessage(error?.message || 'No se pudo guardar el evento.');
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
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Eventos operativos</h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Registro diario de eventos climatologicos, cortes de energia u otros eventos externos que impacten mantenimiento.
        </p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h2 className="card-title" style={{ marginBottom: '.35rem' }}>Pregunta del dia anterior</h2>
            <p style={{ color: '#64748b', margin: 0 }}>
              Fecha a reportar: <strong>{formatDateDisplay(yesterdayKey)}</strong>
            </p>
          </div>
          {yesterdayRecord && (
            <span style={{ borderRadius: '999px', padding: '.25rem .65rem', background: yesterdayRecord.hubo_evento ? '#fff7ed' : '#dcfce7', color: yesterdayRecord.hubo_evento ? '#b45309' : '#166534', fontWeight: 800, fontSize: '.82rem' }}>
              {yesterdayRecord.hubo_evento ? 'Evento registrado' : 'Sin evento registrado'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setForm((current) => ({ ...current, hubo_evento: 'si' }))}
            style={{ background: form.hubo_evento === 'si' ? '#2563eb' : '#6b7280' }}
          >
            Si hubo evento
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleNoEvent}
            disabled={saving}
            style={{ background: form.hubo_evento === 'no' ? '#059669' : '#6b7280' }}
          >
            No hubo evento
          </button>
        </div>

        {form.hubo_evento === 'si' && (
          <form onSubmit={handleSaveEvent} style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div>
                <label className="form-label">Tipo de evento</label>
                <select className="form-select" value={form.tipo_evento} onChange={(e) => setForm({ ...form, tipo_evento: e.target.value })}>
                  {EVENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Hora inicio</label>
                <input type="time" className="form-input" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Hora fin</label>
                <input type="time" className="form-input" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="form-label">Descripcion del evento</label>
              <textarea
                className="form-textarea"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Describe que ocurrio, alcance, zona afectada y cualquier impacto operativo."
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ justifySelf: 'start' }}>
              {saving ? 'Guardando...' : 'Guardar evento'}
            </button>
          </form>
        )}

        {message && (
          <div style={{ marginTop: '1rem', color: message.includes('No se pudo') || message.includes('Completa') ? '#b91c1c' : '#166534', fontWeight: 700 }}>
            {message}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Historial de eventos</h2>
          <div style={{ display: 'grid', gap: '.25rem', minWidth: '180px' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '.78rem' }}>Mes</label>
            <input type="month" className="form-input" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} style={{ padding: '.55rem .7rem' }} />
          </div>
        </div>

        <div className="executive-table-wrapper">
          <table className="executive-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Respuesta</th>
                <th>Tipo</th>
                <th>Horario</th>
                <th>Descripcion</th>
                <th>Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {visibleHistory.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateDisplay(item.fecha_operativa)}</td>
                  <td>{item.hubo_evento ? 'Si' : 'No'}</td>
                  <td>{item.tipo_evento || 'N.A.'}</td>
                  <td>{item.hubo_evento ? `${item.hora_inicio || '--:--'} - ${item.hora_fin || '--:--'}` : 'N.A.'}</td>
                  <td>{item.descripcion || 'Sin evento reportado'}</td>
                  <td>{item.registrado_por || 'N.A.'}</td>
                </tr>
              ))}
              {!visibleHistory.length && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#6b7280' }}>No hay registros para ese mes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
