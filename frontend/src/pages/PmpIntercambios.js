import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ReadOnlyAccessNotice from '../components/ReadOnlyAccessNotice';
import { useAuth } from '../context/AuthContext';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import { applyEquipmentExchange, getEquipmentLabel, getNodeLabel } from '../utils/equipmentExchange';
import { isReadOnlyRole } from '../utils/roleAccess';

const EQUIPOS_KEY = SHARED_DOCUMENT_KEYS.equipmentItems;
const HISTORY_KEY = SHARED_DOCUMENT_KEYS.equipmentExchangeHistory;

export default function PmpIntercambios() {
  const { user } = useAuth();
  const isReadOnly = isReadOnlyRole(user);
  const [equipos, setEquipos] = useState([]);
  const [history, setHistory] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [equiposData, historyData] = await Promise.all([
        loadSharedDocument(EQUIPOS_KEY, []),
        loadSharedDocument(HISTORY_KEY, []),
      ]);
      if (!active) return;
      const rows = Array.isArray(equiposData) ? equiposData : [];
      setEquipos(rows);
      setHistory(Array.isArray(historyData) ? historyData : []);
      setSourceId(rows[0]?.id || '');
      setTargetId(rows.find((eq) => String(eq.id) !== String(rows[0]?.id))?.id || '');
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const sourceEquipo = useMemo(
    () => equipos.find((eq) => String(eq.id) === String(sourceId)) || null,
    [equipos, sourceId],
  );
  const availableNodes = useMemo(
    () => (Array.isArray(sourceEquipo?.despiece) ? sourceEquipo.despiece : []),
    [sourceEquipo],
  );
  const targetOptions = useMemo(
    () => equipos.filter((eq) => String(eq.id) !== String(sourceId)),
    [equipos, sourceId],
  );
  const selectedNode = useMemo(
    () => availableNodes.find((node) => String(node.id) === String(nodeId)) || null,
    [availableNodes, nodeId],
  );

  const handleSourceChange = (value) => {
    setSourceId(value);
    setNodeId('');
    const nextTarget = equipos.find((eq) => String(eq.id) !== String(value))?.id || '';
    setTargetId(nextTarget);
  };

  const registerExchange = async () => {
    if (isReadOnly) return;
    setError('');
    if (!String(nodeId || '').trim()) {
      setError('Selecciona el subequipo que se va a intercambiar.');
      return;
    }
    const targetEquipo = equipos.find((eq) => String(eq.id) === String(targetId));
    const confirmed = window.confirm(`Confirmar intercambio de "${selectedNode?.nombre || 'subequipo'}" hacia ${targetEquipo?.codigo || 'equipo destino'}?`);
    if (!confirmed) return;

    try {
      setSaving(true);
      const actor = user?.full_name || user?.username || user?.role || 'Sistema';
      const result = applyEquipmentExchange(equipos, {
        sourceId,
        targetId,
        nodeId,
        motivo,
        registradoPor: actor,
        registradoEn: 'Modulo de intercambios',
      });
      const nextHistory = [result.record, ...history];
      await Promise.all([
        saveSharedDocument(EQUIPOS_KEY, result.equipos),
        saveSharedDocument(HISTORY_KEY, nextHistory),
      ]);
      setEquipos(result.equipos);
      setHistory(nextHistory);
      setNodeId('');
      setMotivo('');
      setError('');
      window.alert('Intercambio registrado correctamente.');
    } catch (err) {
      console.error('Error registrando intercambio:', err);
      setError(err?.message || 'No se pudo registrar el intercambio.');
    } finally {
      setSaving(false);
    }
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Intercambios de subequipos</h1>
          <p className="page-subtitle">Migra componentes o sistemas entre equipos y conserva la trazabilidad en historial.</p>
        </div>
        <Link className="btn btn-secondary" to="/pmp/intercambios/historial">Ver historial</Link>
      </div>

      {isReadOnly && (
        <ReadOnlyAccessNotice message="Puedes revisar intercambios, pero este perfil no puede registrar movimientos de subequipos." />
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="exchange-layout">
        <section className="page-card exchange-panel">
          <div>
            <h2 className="card-title">Registrar intercambio</h2>
            <p className="page-subtitle">Selecciona el equipo origen, el nivel del despiece y el equipo destino.</p>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Equipo origen</label>
              <select className="form-select" value={sourceId || ''} onChange={(e) => handleSourceChange(e.target.value)}>
                {equipos.map((eq) => (
                  <option key={eq.id} value={eq.id}>{getEquipmentLabel(eq)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Equipo destino</label>
              <select className="form-select" value={targetId || ''} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">Selecciona destino</option>
                {targetOptions.map((eq) => (
                  <option key={eq.id} value={eq.id}>{getEquipmentLabel(eq)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Subequipo / nivel a intercambiar</label>
            <select className="form-select" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
              <option value="">Selecciona un nivel del despiece</option>
              {availableNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {getNodeLabel(node)} {node.tipo_nodo === 'titulo' ? '(sistema)' : '(componente)'}
                </option>
              ))}
            </select>
            {!availableNodes.length && <small style={{ color: '#b45309' }}>Este equipo no tiene despiece registrado.</small>}
          </div>

          <div className="form-group">
            <label className="form-label">Motivo / observacion</label>
            <textarea
              className="form-textarea"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Cambio de motor entre lineas por disponibilidad operativa."
            />
          </div>

          <div className="exchange-summary">
            <strong>{selectedNode ? selectedNode.nombre : 'Sin subequipo seleccionado'}</strong>
            <span>Se movera con sus niveles hijos hacia el equipo destino.</span>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setNodeId(''); setMotivo(''); }}>Limpiar</button>
            <button type="button" className="btn btn-primary" onClick={registerExchange} disabled={isReadOnly || saving || !nodeId || !targetId}>
              {saving ? 'Registrando...' : 'Registrar intercambio'}
            </button>
          </div>
        </section>

        <aside className="page-card exchange-panel">
          <h2 className="card-title">Ultimos movimientos</h2>
          <div className="exchange-history-list">
            {history.slice(0, 6).map((item) => (
              <div key={item.id} className="exchange-history-item">
                <strong>{item.nodeName}</strong>
                <span>{item.sourceEquipo} hacia {item.targetEquipo}</span>
                <small>{new Date(item.fecha).toLocaleString()} · {item.levelsMigrated || 1} nivel(es)</small>
              </div>
            ))}
            {!history.length && <p style={{ color: '#6b7280', margin: 0 }}>Aun no hay intercambios registrados.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
