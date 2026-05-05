import React from 'react';
import { Link } from 'react-router-dom';

const CONTROL_SECTIONS = [
  { key: 'centro', label: 'Centro de control', path: '/control/centro' },
  { key: 'analitica', label: 'Analitica ejecutiva', path: '/control/analitica' },
  { key: 'bitacora', label: 'Bitacora ejecutiva', path: '/control/bitacora' },
];

export default function ControlNav({ activeKey }) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        {CONTROL_SECTIONS.map((section) => (
          <Link
            key={section.key}
            to={section.path}
            className="btn"
            style={{
              background: activeKey === section.key ? '#eff6ff' : '#f8fafc',
              color: activeKey === section.key ? '#1d4ed8' : '#334155',
              border: '1px solid',
              borderColor: activeKey === section.key ? '#bfdbfe' : '#e5e7eb',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {section.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

