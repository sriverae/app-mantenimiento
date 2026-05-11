import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PmpHistoriales() {
  const { hasMinRole } = useAuth();
  const historyCards = [
    {
      title: 'Historial de OT',
      description: 'Ordenes cerradas, evidencias, costos, recursos y PDF historico.',
      path: '/historiales/ot',
      color: '#2563eb',
    },
    {
      title: 'Historial de avisos',
      description: 'Avisos pendientes, aceptados y rechazados, con filtros por usuario, equipo y estado.',
      path: '/historiales/avisos',
      color: '#b45309',
    },
    {
      title: 'Historial de intercambios',
      description: 'Cambios de subequipos y trazabilidad de componentes intercambiados.',
      path: '/historiales/intercambios',
      color: '#0f766e',
    },
    {
      title: 'Historial de bajas',
      description: 'Equipos o componentes dados de baja y su sustento operativo.',
      path: '/historiales/bajas',
      color: '#dc2626',
    },
    ...(hasMinRole('INGENIERO') ? [{
      title: 'Historial de contadores',
      description: 'Lecturas de kilometraje u horas acumuladas usadas por planes de mantenimiento.',
      path: '/historiales/contadores',
      color: '#7c3aed',
    }] : []),
    {
      title: 'Historial de asistencia',
      description: 'Registros historicos de asistencia, disponibilidad y ausencias del personal.',
      path: '/historiales/asistencia',
      color: '#475569',
    },
  ];

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '.35rem' }}>Historiales</h1>
      <p style={{ color: '#64748b', marginBottom: '1rem' }}>
        Consulta la trazabilidad historica del mantenimiento desde una sola ventana.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        {historyCards.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="card"
            style={{
              display: 'grid',
              gap: '.5rem',
              textDecoration: 'none',
              color: 'inherit',
              borderLeft: `5px solid ${item.color}`,
              minHeight: '150px',
            }}
          >
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>{item.title}</div>
            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.55 }}>{item.description}</p>
            <span style={{ color: item.color, fontWeight: 900, alignSelf: 'end' }}>Abrir</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
