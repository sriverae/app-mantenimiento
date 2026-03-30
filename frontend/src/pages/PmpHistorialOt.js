import React, { useMemo, useState } from 'react';

const OT_HISTORY_KEY = 'pmp_ot_historial_v1';

const readHistory = () => {
  try {
    const raw = localStorage.getItem(OT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function PmpHistorialOt() {
  const [items, setItems] = useState(() => readHistory());
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => items.filter((it) => (
    `${it.ot_numero} ${it.codigo} ${it.descripcion} ${it.area_trabajo} ${it.responsable} ${it.personal_mantenimiento}`.toLowerCase().includes(query.toLowerCase())
  )), [items, query]);

  const clearHistory = () => {
    if (!window.confirm('¿Seguro que deseas limpiar el historial de OTs cerradas?')) return;
    localStorage.setItem(OT_HISTORY_KEY, JSON.stringify([]));
    setItems([]);
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Historial de OTs</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Aquí se guardan las órdenes cerradas para revisión histórica.</p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="form-input" style={{ maxWidth: '420px' }} placeholder="Buscar por OT, código, descripción, área..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={() => setItems(readHistory())}>Recargar</button>
          <button type="button" className="btn btn-danger" onClick={clearHistory}>Limpiar historial</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1800px' }}>
          <thead>
            <tr style={{ background: '#0b5c8c', color: '#fff' }}>
              {[
                'Fecha cierre', 'Fecha inicio', 'Fecha fin', 'Código', 'Descripción', 'Área', '# OT', 'Var. Ctrl', 'Tipo mantto',
                'Puesto trabajo resp.', 'Personal de trabajo', 'Materiales', 'Tiempo efectivo (Hh)', 'Estado equipo', 'Satisfacción', 'Observaciones',
              ].map((h) => (
                <th key={h} style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', fontSize: '.8rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id}>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.fecha_cierre || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.registro_ot?.fecha_inicio || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.registro_ot?.fecha_fin || it.fecha_ejecucion || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.codigo || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.descripcion || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.area_trabajo || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.ot_numero || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>Día</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.cierre_ot?.tipo_mantenimiento || it.tipo_mantto || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.cierre_ot?.puesto_trabajo_resp || it.responsable || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.personal_mantenimiento || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.materiales || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.cierre_ot?.tiempo_efectivo_hh ?? '0'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.cierre_ot?.estado_equipo || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.cierre_ot?.satisfaccion || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.cierre_ot?.observaciones || it.registro_ot?.observaciones || 'N.A.'}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={16} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #d1d5db' }}>
                  No hay OTs cerradas en el historial.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
