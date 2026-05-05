import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const RRHH_SECTIONS = [
  { label: 'Registro de personal propio', path: '/rrhh/personal-propio' },
  { label: 'Registro de personal tercero', path: '/rrhh/personal-tercero' },
  { label: 'Control de asistencia', path: '/rrhh/asistencia' },
  { label: 'Historial de asistencia', path: '/rrhh/asistencia/historial' },
];

export default function RrhhSectionNav() {
  const location = useLocation();

  return (
    <div className="card" style={{ marginBottom: '1rem', padding: '.75rem' }}>
      <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
        {RRHH_SECTIONS.map((item) => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                textDecoration: 'none',
                padding: '.65rem .9rem',
                borderRadius: '.9rem',
                border: active ? '1px solid #2563eb' : '1px solid #dbe4f0',
                background: active ? '#eff6ff' : '#fff',
                color: active ? '#1d4ed8' : '#334155',
                fontWeight: 700,
                fontSize: '.92rem',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
