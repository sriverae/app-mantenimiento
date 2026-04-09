import React, { useEffect, useMemo, useState } from 'react';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { formatDateDisplay, formatDateTimeDisplay } from '../utils/dateFormat';

const OT_HISTORY_KEY = SHARED_DOCUMENT_KEYS.otHistory;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildCloseReportHtml = (alert, reports) => {
  const reportRows = (reports || []).map((report, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(report.reportCode || '')}</td>
      <td>${escapeHtml(formatDateTimeDisplay(report.fechaInicio, report.horaInicio, 'N.A.'))}</td>
      <td>${escapeHtml(formatDateTimeDisplay(report.fechaFin, report.horaFin, 'N.A.'))}</td>
      <td>${escapeHtml((report.tecnicos || []).map((item) => `${item.tecnico} (${item.horas} h)`).join(', '))}</td>
      <td>${escapeHtml((report.materialesExtra || []).map((item) => `${item.codigo || item.descripcion} x${item.cantidad}`).join(', '))}</td>
      <td>${escapeHtml(report.observaciones || '')}</td>
    </tr>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>OT ${escapeHtml(alert.ot_numero || '')}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          h1, h2 { margin: 0 0 12px; }
          .section { margin-top: 24px; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 10px 20px; }
          .label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
          .value { font-size: 14px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; }
          th { background: #eff6ff; }
        </style>
      </head>
      <body>
        <h1>Orden de Trabajo ${escapeHtml(alert.ot_numero || 'N.A.')}</h1>
        <div class="grid section">
          <div><div class="label">Equipo</div><div class="value">${escapeHtml(alert.codigo || '')} - ${escapeHtml(alert.descripcion || '')}</div></div>
          <div><div class="label">Estado final</div><div class="value">${escapeHtml(alert.status_ot || '')}</div></div>
          <div><div class="label">Responsable</div><div class="value">${escapeHtml(alert.responsable || '')}</div></div>
          <div><div class="label">Fecha a ejecutar</div><div class="value">${escapeHtml(formatDateDisplay(alert.fecha_ejecutar || '', 'N.A.'))}</div></div>
          <div><div class="label">Inicio OT</div><div class="value">${escapeHtml(formatDateTimeDisplay(alert.cierre_ot?.fecha_inicio || alert.registro_ot?.fecha_inicio || '', alert.cierre_ot?.hora_inicio || alert.registro_ot?.hora_inicio || '', 'N.A.'))}</div></div>
          <div><div class="label">Fin OT</div><div class="value">${escapeHtml(formatDateTimeDisplay(alert.cierre_ot?.fecha_fin || alert.registro_ot?.fecha_fin || '', alert.cierre_ot?.hora_fin || alert.registro_ot?.hora_fin || '', 'N.A.'))}</div></div>
        </div>

        <div class="section">
          <h2>Personal y materiales</h2>
          <div><strong>Personal:</strong> ${escapeHtml(alert.personal_mantenimiento || 'N.A.')}</div>
          <div><strong>Materiales:</strong> ${escapeHtml(alert.materiales || 'N.A.')}</div>
          <div><strong>Observaciones cierre:</strong> ${escapeHtml(alert.cierre_ot?.observaciones || '')}</div>
        </div>

        <div class="section">
          <h2>Registros de trabajo</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Codigo</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Tecnicos</th>
                <th>Materiales extra</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows || '<tr><td colspan="7">Sin registros.</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `;
};

const openCloseReportPdf = (alert, reports) => {
  const printWindow = window.open('', '_blank', 'width=1024,height=768');
  if (!printWindow) {
    window.alert('No se pudo abrir la ventana para generar el PDF.');
    return;
  }
  printWindow.document.write(buildCloseReportHtml(alert, reports));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 300);
};

export default function PmpHistorialOt() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadSharedDocument(OT_HISTORY_KEY, []).then((data) => {
      if (!active) return;
      setItems(Array.isArray(data) ? data : []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => items.filter((it) => (
    `${it.ot_numero} ${it.codigo} ${it.descripcion} ${it.area_trabajo} ${it.responsable} ${it.personal_mantenimiento}`.toLowerCase().includes(query.toLowerCase())
  )), [items, query]);

  const clearHistory = async () => {
    if (!window.confirm('¿Seguro que deseas limpiar el historial de OTs cerradas?')) return;
    await saveSharedDocument(OT_HISTORY_KEY, []);
    setItems([]);
  };

  const reloadHistory = async () => {
    setItems(await loadSharedDocument(OT_HISTORY_KEY, []));
  };

  const handleRegeneratePdf = (item) => {
    openCloseReportPdf(item, item.reportes_trabajo || []);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 700, marginBottom: '.35rem' }}>Historial de OTs</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Aquí se guardan las órdenes cerradas para revisión histórica.</p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="form-input" style={{ maxWidth: '420px' }} placeholder="Buscar por OT, código, descripción, área..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={reloadHistory}>Recargar</button>
          <button type="button" className="btn btn-danger" onClick={clearHistory}>Limpiar historial</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1800px' }}>
          <thead>
            <tr style={{ background: '#0b5c8c', color: '#fff' }}>
              {[
                'Fecha cierre', 'Fecha inicio', 'Hora inicio', 'Fecha fin', 'Hora fin', 'Código', 'Descripción', 'Área', '# OT', 'Var. Ctrl', 'Tipo mantto',
                'Puesto trabajo resp.', 'Personal de trabajo', 'Materiales', 'Tiempo efectivo (Hh)', 'Estado equipo', 'Satisfacción', 'Observaciones',
                'PDF',
              ].map((h) => (
                <th key={h} style={{ border: '1px solid #2f6fb2', padding: '.55rem .5rem', fontSize: '.8rem', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id}>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{formatDateDisplay(it.fecha_cierre || '', 'N.A.')}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{formatDateDisplay(it.cierre_ot?.fecha_inicio || it.registro_ot?.fecha_inicio || '', 'N.A.')}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.cierre_ot?.hora_inicio || it.registro_ot?.hora_inicio || 'N.A.'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{formatDateDisplay(it.cierre_ot?.fecha_fin || it.registro_ot?.fecha_fin || it.fecha_ejecucion || '', 'N.A.')}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>{it.cierre_ot?.hora_fin || it.registro_ot?.hora_fin || 'N.A.'}</td>
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
                <td style={{ border: '1px solid #d1d5db', padding: '.45rem .5rem' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRegeneratePdf(it)}>
                    Generar PDF
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={19} style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', border: '1px solid #d1d5db' }}>
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
