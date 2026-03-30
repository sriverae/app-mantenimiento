import React, { useMemo } from 'react';

const OT_ALERTS_KEY = 'pmp_ot_alertas_v1';
const OT_HISTORY_KEY = 'pmp_ot_historial_v1';

const readJson = (key, fallback = []) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export default function WorkNotifications({ user }) {
  const alerts = useMemo(() => readJson(OT_ALERTS_KEY, []), []);
  const history = useMemo(() => readJson(OT_HISTORY_KEY, []), []);

  const notifications = useMemo(() => {
    const byRole = (item) => {
      if (user?.role === 'PLANNER' || user?.role === 'INGENIERO') return true;
      return item.status_ot === 'Liberada' || item.status_ot === 'Cerrada';
    };

    const active = alerts
      .filter(byRole)
      .map((item) => ({
        ...item,
        origen: 'Gestión OT',
        tipo: item.status_ot === 'Pendiente' ? 'Alerta pendiente' : 'Notificación de trabajo',
      }));

    const closed = history
      .filter(byRole)
      .map((item) => ({
        ...item,
        origen: 'Historial OT',
        tipo: 'Trabajo confirmado',
      }));

    return [...active, ...closed].sort((a, b) => new Date(b.fecha_ejecutar || b.fecha_cierre || 0) - new Date(a.fecha_ejecutar || a.fecha_cierre || 0));
  }, [alerts, history, user?.role]);

  return (
    <div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Notificaciones de Trabajo</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Alertas y notificaciones originadas en Gestión de OT. Las OTs liberadas son visibles para técnicos y encargados.
      </p>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1500px' }}>
          <thead>
            <tr style={{ background: '#1f3b5b', color: '#fff' }}>
              {['Tipo', 'Estado OT', '# OT', 'Código', 'Descripción', 'Fecha inicio', 'Hora inicio', 'Fecha fin', 'Hora fin', 'Tiempo efectivo (Hh)', 'Personal', 'Materiales', 'Origen'].map((h) => (
                <th key={h} style={{ border: '1px solid #2f4f75', padding: '.55rem .5rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {notifications.map((item) => (
              <tr key={`${item.id}-${item.origen}`}>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.tipo}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.status_ot}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.ot_numero || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.codigo}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.descripcion}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.fecha_inicio || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.cierre_ot?.hora_inicio || item.registro_ot?.hora_inicio || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.registro_ot?.fecha_fin || item.fecha_ejecucion || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.cierre_ot?.hora_fin || item.registro_ot?.hora_fin || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.cierre_ot?.tiempo_efectivo_hh ?? 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.personal_mantenimiento || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.materiales || 'N.A.'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '.45rem .5rem' }}>{item.origen}</td>
              </tr>
            ))}
            {!notifications.length && (
              <tr>
                <td colSpan={13} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                  No hay notificaciones disponibles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
