import React, { useMemo, useState } from 'react';

const HISTORY_KEY = 'pmp_equipos_exchange_history_v1';

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function PmpIntercambiosHistorial() {
  const [history] = useState(() => getHistory());
  const sorted = useMemo(
    () => [...history].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
    [history],
  );

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '.45rem' }}>Historial de intercambios</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Registro de migraciones de subequipos entre equipos.</p>

      <div className="card" style={{ overflowX: 'auto' }}>
        {sorted.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No hay intercambios registrados todavía.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ background: '#1f3b5b', color: '#fff' }}>
                {['Fecha', 'Equipo origen', 'Equipo destino', 'Subequipo', 'Código origen', 'Código final', 'Niveles migrados'].map((h) => (
                  <th key={h} style={{ border: '1px solid #2f4f75', textAlign: 'left', padding: '.55rem .5rem', fontSize: '.8rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.id}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{new Date(item.fecha).toLocaleString()}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.sourceEquipo}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.targetEquipo}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.nodeName}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.oldCode}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.newCode}</td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '.5rem' }}>{item.levelsMigrated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
