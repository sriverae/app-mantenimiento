import React, { useMemo, useState } from 'react';

const BAJAS_HISTORY_KEY = 'pmp_bajas_history_v1';

const readHistory = () => {
  try {
    const raw = localStorage.getItem(BAJAS_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function PmpBajasHistorial() {
  const [history] = useState(() => readHistory());
  const sorted = useMemo(() => [...history].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)), [history]);

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.4rem' }}>Historial de bajas</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Evidencia de bajas totales y parciales de equipos/subequipos.</p>

      <div className="card" style={{ overflowX: 'auto' }}>
        {sorted.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No existen bajas registradas todavía.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px' }}>
            <thead>
              <tr style={{ background: '#1f3b5b', color: '#fff' }}>
                {['Fecha', 'Tipo', 'Equipo', 'Descripción', 'Elemento dado de baja', 'Niveles afectados'].map((h) => (
                  <th key={h} style={{ border: '1px solid #2f4f75', textAlign: 'left', padding: '.55rem .5rem', fontSize: '.8rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.id}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{new Date(item.fecha).toLocaleString()}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.tipo}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.equipo}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.descripcion}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.subequipo}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.nivelesAfectados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
