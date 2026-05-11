import React, { useEffect } from 'react';

export default function ImagePreviewModal({ src, alt = 'Imagen', title = 'Vista de imagen', onClose }) {
  useEffect(() => {
    if (!src) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(15, 23, 42, .9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        cursor: 'zoom-out',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(1100px, 100%)',
          maxHeight: 'calc(100vh - 2.5rem)',
          display: 'grid',
          gap: '.75rem',
          justifyItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar imagen"
          className="btn btn-secondary"
          style={{
            position: 'absolute',
            top: '.75rem',
            right: '.75rem',
            zIndex: 1,
            minWidth: '44px',
            height: '44px',
            borderRadius: '999px',
            padding: 0,
            fontSize: '1.35rem',
            lineHeight: 1,
            background: '#fff',
            color: '#111827',
            border: '1px solid #cbd5e1',
            boxShadow: '0 12px 28px rgba(0,0,0,.25)',
          }}
        >
          ×
        </button>
        <img
          src={src}
          alt={alt}
          style={{
            maxWidth: '100%',
            maxHeight: 'calc(100vh - 2.5rem)',
            objectFit: 'contain',
            borderRadius: '.75rem',
            background: '#fff',
            boxShadow: '0 24px 70px rgba(0,0,0,.35)',
          }}
        />
      </div>
    </div>
  );
}
