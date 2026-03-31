import React, { useMemo, useState } from 'react';

const OT_ALERTS_KEY = 'pmp_ot_alertas_v1';

const readJson = (key, fallback = []) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export default function WorkNotifications() {
  const [alerts] = useState(() => readJson(OT_ALERTS_KEY, []));

  const liberatedNotifications = useMemo(
    () => alerts
      .filter((item) => item.status_ot === 'Liberada')
      .sort((a, b) => new Date(b.fecha_ejecutar || 0) - new Date(a.fecha_ejecutar || 0)),
    [alerts],
  );

  return (
    <div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Notificaciones de Trabajo</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Aquí solo aparecen OTs en estado <strong>Liberada</strong>. La notificación migra con toda la información registrada al liberar la OT.
      </p>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1650px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Estado OT', '# OT', 'Código', 'Descripción', 'Prioridad', 'Actividad', 'Responsable', 'Fecha a ejecutar', 'Fecha inicio', 'Hora inicio', 'Fecha fin', 'Hora fin', 'Personal asignado', 'Materiales asignados'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f4f75', padding: '.55rem .5rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {liberatedNotifications.map((item) => (
              <tr key={item.id}>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.status_ot}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.ot_numero || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.codigo}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.descripcion}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.prioridad || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.actividad || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.responsable || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.fecha_ejecutar || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.fecha_inicio || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.hora_inicio || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.fecha_fin || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.hora_fin || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.personal_mantenimiento || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.materiales || 'N.A.'}</td>
              </tr>
            ))}
            {!liberatedNotifications.length && (
              <tr>
                <td colSpan={14} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                  No hay notificaciones de trabajo liberadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
