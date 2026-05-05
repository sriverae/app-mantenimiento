import React, { useEffect, useMemo, useState } from 'react';
import ControlNav from '../components/ControlNav';
import TableFilterRow from '../components/TableFilterRow';
import useTableColumnFilters from '../hooks/useTableColumnFilters';
import { loadSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { buildFailureAnalytics, buildHistoryCostBreakdown } from '../utils/maintenanceExecutive';
import { filterRowsByColumns } from '../utils/tableFilters';

function StatCard({ label, value, color = '#111827' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

function RankedList({ title, rows, formatter = (item) => item.value }) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      <div className="executive-ranked-list">
        {rows.length ? rows.slice(0, 8).map((item) => (
          <div key={`${title}_${item.label}`} className="executive-ranked-row">
            <div>
              <strong style={{ color: '#0f172a' }}>{item.label}</strong>
            </div>
            <span>{formatter(item)}</span>
          </div>
        )) : (
          <div style={{ color: '#64748b' }}>Sin datos suficientes.</div>
        )}
      </div>
    </div>
  );
}

export default function MaintenanceAnalytics() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [amef, setAmef] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [rrhh, setRrhh] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [historyData, amefData, materialsData, rrhhData] = await Promise.all([
        loadSharedDocument(SHARED_DOCUMENT_KEYS.otHistory, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.amef, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.materials, []),
        loadSharedDocument(SHARED_DOCUMENT_KEYS.rrhh, []),
      ]);
      if (!active) return;
      setHistory(Array.isArray(historyData) ? historyData : []);
      setAmef(Array.isArray(amefData) ? amefData : []);
      setMaterials(Array.isArray(materialsData) ? materialsData : []);
      setRrhh(Array.isArray(rrhhData) ? rrhhData : []);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const failureAnalytics = useMemo(() => buildFailureAnalytics(history, amef), [history, amef]);
  const costAnalytics = useMemo(() => buildHistoryCostBreakdown(history, rrhh, materials), [history, rrhh, materials]);
  const manualModeColumns = useMemo(() => [
    { id: 'mode', label: 'Modo de falla' },
    { id: 'equipment', label: 'Equipo' },
    { id: 'cause', label: 'Causa raiz' },
    { id: 'date', label: 'Fecha' },
  ], []);
  const manualModeFilters = useTableColumnFilters(manualModeColumns);
  const visibleManualModes = useMemo(
    () => filterRowsByColumns(failureAnalytics.manualModes, manualModeColumns, manualModeFilters.filters),
    [failureAnalytics.manualModes, manualModeColumns, manualModeFilters.filters],
  );
  const costTableColumns = useMemo(() => [
    { id: 'equipment', label: 'Equipo', getValue: (row) => row.codigo || row.descripcion || 'N.A.' },
    { id: 'area_trabajo', label: 'Area' },
    { id: 'modo_falla', label: 'Modo de falla' },
    { id: 'laborCost', label: 'Labor', getValue: (row) => `S/ ${Number(row.laborCost || 0).toFixed(2)}` },
    { id: 'materialCost', label: 'Materiales', getValue: (row) => `S/ ${Number(row.materialCost || 0).toFixed(2)}` },
    { id: 'serviceCost', label: 'Servicios', getValue: (row) => `S/ ${Number(row.serviceCost || 0).toFixed(2)}` },
    { id: 'totalCost', label: 'Total', getValue: (row) => `S/ ${Number(row.totalCost || 0).toFixed(2)}` },
  ], []);
  const costTableFilters = useTableColumnFilters(costTableColumns);
  const visibleCostRows = useMemo(
    () => filterRowsByColumns(costAnalytics.detailedRows, costTableColumns, costTableFilters.filters),
    [costAnalytics.detailedRows, costTableColumns, costTableFilters.filters],
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
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.95rem', fontWeight: 700, marginBottom: '.35rem' }}>Analitica ejecutiva</h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Cruce del cierre tecnico, modos de falla AMEF y costos reales para detectar repeticion, impacto economico y huecos de ingenieria.
        </p>
      </div>

      <ControlNav activeKey="analitica" />

      <div className="stats-grid">
        <StatCard label="OT correctivas cerradas" value={failureAnalytics.totalCorrective} color="#dc2626" />
        <StatCard label="Equipos con falla repetitiva" value={failureAnalytics.repeatEquipment} color="#b45309" />
        <StatCard label="Cobertura AMEF" value={`${failureAnalytics.amefCoveragePct}%`} color="#059669" />
        <StatCard label="Costo total" value={`S/ ${costAnalytics.totalCost.toFixed(2)}`} color="#2563eb" />
        <StatCard label="Costo de servicios" value={`S/ ${costAnalytics.totalServiceCost.toFixed(2)}`} color="#0f766e" />
        <StatCard label="Peso de terceros" value={`${costAnalytics.serviceWeight}%`} color="#7c3aed" />
      </div>

      <div className="executive-grid-two" style={{ marginTop: '1rem' }}>
        <RankedList title="Pareto de modos de falla" rows={failureAnalytics.topModes} />
        <RankedList title="Pareto de causas raiz" rows={failureAnalytics.topCauses} />
        <RankedList title="Componentes mas intervenidos" rows={failureAnalytics.topComponents} />
        <RankedList title="Equipos con mas correctivos" rows={failureAnalytics.repeatedByEquipment} />
      </div>

      <div className="executive-grid-two" style={{ marginTop: '1rem' }}>
        <RankedList
          title="Costo por equipo"
          rows={costAnalytics.byEquipment}
          formatter={(item) => `S/ ${item.value.toFixed(2)}`}
        />
        <RankedList
          title="Costo por area"
          rows={costAnalytics.byArea}
          formatter={(item) => `S/ ${item.value.toFixed(2)}`}
        />
        <RankedList
          title="Costo por modo de falla"
          rows={costAnalytics.byFailureMode}
          formatter={(item) => `S/ ${item.value.toFixed(2)}`}
        />
        <RankedList
          title="Costo por familia de repuesto"
          rows={costAnalytics.byFamily}
          formatter={(item) => `S/ ${item.value.toFixed(2)}`}
        />
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2 className="card-title">Modos de falla usados fuera del AMEF</h2>
        <p style={{ color: '#64748b', lineHeight: 1.65, marginBottom: '.9rem' }}>
          Si esta lista crece, te conviene consolidar esos modos en el arbol AMEF para no seguir cerrando OTs con conocimiento tecnico suelto.
        </p>
        <div className="executive-table-wrapper">
          <table className="executive-table">
            <thead>
              <tr>
                <th>Modo de falla</th>
                <th>Equipo</th>
                <th>Causa raiz</th>
                <th>Fecha</th>
              </tr>
              <TableFilterRow columns={manualModeColumns} rows={failureAnalytics.manualModes} filters={manualModeFilters.filters} onChange={manualModeFilters.setFilter} dark />
            </thead>
            <tbody>
              {visibleManualModes.length ? visibleManualModes.slice(0, 25).map((row, index) => (
                <tr key={`${row.mode}_${row.equipment}_${index}`}>
                  <td>{row.mode}</td>
                  <td>{row.equipment}</td>
                  <td>{row.cause}</td>
                  <td>{row.date || 'N.A.'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>
                    No hay modos manuales fuera del AMEF en el historial actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2 className="card-title">OT mas costosas</h2>
        <div className="executive-table-wrapper">
          <table className="executive-table">
            <thead>
              <tr>
                <th>Equipo</th>
                <th>Area</th>
                <th>Modo de falla</th>
                <th>Labor</th>
                <th>Materiales</th>
                <th>Servicios</th>
                <th>Total</th>
              </tr>
              <TableFilterRow columns={costTableColumns} rows={costAnalytics.detailedRows} filters={costTableFilters.filters} onChange={costTableFilters.setFilter} dark />
            </thead>
            <tbody>
              {visibleCostRows.length ? visibleCostRows.slice(0, 20).map((row) => (
                <tr key={row.id}>
                  <td>{row.codigo || row.descripcion || 'N.A.'}</td>
                  <td>{row.area_trabajo || 'N.A.'}</td>
                  <td>{row.modo_falla || 'N.A.'}</td>
                  <td>S/ {row.laborCost.toFixed(2)}</td>
                  <td>S/ {row.materialCost.toFixed(2)}</td>
                  <td>S/ {row.serviceCost.toFixed(2)}</td>
                  <td><strong>S/ {row.totalCost.toFixed(2)}</strong></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#64748b' }}>
                    Aun no hay suficiente historial cerrado para consolidar costos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
