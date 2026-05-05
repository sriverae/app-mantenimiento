import React, { useEffect, useMemo, useState } from 'react';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { loadSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { filterRowsByColumns } from '../utils/tableFilters';

const HISTORY_KEY = SHARED_DOCUMENT_KEYS.equipmentExchangeHistory;

export default function PmpIntercambiosHistorial() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadSharedDocument(HISTORY_KEY, []).then((data) => {
      if (!active) return;
      setHistory(Array.isArray(data) ? data : []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const sorted = useMemo(
    () => [...history].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
    [history],
  );
  const tableColumns = useMemo(() => ([
    { id: 'fecha', getValue: (item) => new Date(item.fecha).toLocaleString() },
    { id: 'sourceEquipo', getValue: (item) => item.sourceEquipo },
    { id: 'targetEquipo', getValue: (item) => item.targetEquipo },
    { id: 'nodeName', getValue: (item) => item.nodeName },
    { id: 'oldCode', getValue: (item) => item.oldCode },
    { id: 'newCode', getValue: (item) => item.newCode },
    { id: 'levelsMigrated', getValue: (item) => item.levelsMigrated },
  ]), []);
  const { filters, setFilter } = useTableColumnFilters(tableColumns);
  const visibleRows = useMemo(
    () => filterRowsByColumns(sorted, tableColumns, filters),
    [sorted, tableColumns, filters],
  );

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

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
              <TableFilterRow columns={tableColumns} rows={sorted} filters={filters} onChange={setFilter} dark />
            </thead>
            <tbody>
              {visibleRows.map((item) => (
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
              {!visibleRows.length && (
                <tr>
                  <td colSpan={7} style={{ border: '1px solid #e5e7eb', padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                    No hay intercambios que coincidan con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
