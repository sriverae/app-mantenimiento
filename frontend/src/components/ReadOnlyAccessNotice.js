import React from 'react';

export default function ReadOnlyAccessNotice({ title = 'Modo solo lectura', message }) {
  return (
    <div
      className="card"
      style={{
        marginBottom: '1rem',
        background: '#f8fafc',
        border: '1px solid #cbd5e1',
      }}
    >
      <h3 className="card-title" style={{ marginBottom: '.35rem' }}>{title}</h3>
      <p style={{ marginBottom: 0, color: '#475569', lineHeight: 1.6 }}>
        {message || 'Tu rol puede revisar esta informacion, pero no realizar cambios en esta ventana.'}
      </p>
    </div>
  );
}
