import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { loadSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';

function Dashboard({ user }) {
  const [sharedMetrics, setSharedMetrics] = useState({
    equipment: [],
    plans: [],
    plansKm: [],
    alerts: [],
    history: [],
    materials: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const [equipment, plans, plansKm, alerts, history, materials] = await Promise.all([
          loadSharedDocument(SHARED_DOCUMENT_KEYS.equipmentItems, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePlans, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.maintenancePlansKm, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.otAlerts, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.otHistory, []),
          loadSharedDocument(SHARED_DOCUMENT_KEYS.materials, []),
        ]);

        setSharedMetrics({
          equipment: Array.isArray(equipment) ? equipment : [],
          plans: Array.isArray(plans) ? plans : [],
          plansKm: Array.isArray(plansKm) ? plansKm : [],
          alerts: Array.isArray(alerts) ? alerts : [],
          history: Array.isArray(history) ? history : [],
          materials: Array.isArray(materials) ? materials : [],
        });
      } catch (err) {
        console.error('Error cargando dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const maintenanceKpis = useMemo(() => {
    const activeAlerts = sharedMetrics.alerts.filter((item) => item.status_ot !== 'Cerrada');
    const liberatedAlerts = activeAlerts.filter((item) => item.status_ot === 'Liberada');
    const requestCloseAlerts = activeAlerts.filter((item) => item.status_ot === 'Solicitud de cierre');
    const closedPreventive = sharedMetrics.history.filter((item) => item.tipo_mantto === 'Preventivo');
    const completedCodes = new Set(closedPreventive.map((item) => `${item.codigo || ''}_${item.fecha_ejecutar || ''}`));
    const duePlans = sharedMetrics.plans.filter((plan) => plan.fecha_inicio && plan.codigo);
    const compliantPlans = duePlans.filter((plan) => completedCodes.has(`${plan.codigo}_${plan.fecha_inicio}`)).length;
    const criticalEquipment = sharedMetrics.equipment.filter((item) => String(item.criticidad || '').toLowerCase() === 'alta').length;
    const unavailableEquipment = sharedMetrics.equipment.filter((item) => String(item.estado || '').toLowerCase() !== 'operativo').length;
    const lowStock = sharedMetrics.materials.filter((item) => (Number(item.stock) || 0) <= (Number(item.stock_min) || 0)).length;
    const kmDue = sharedMetrics.plansKm.filter((plan) => {
      const actual = Number(plan.km_actual) || 0;
      const objetivo = Number(plan.proximo_km) || 0;
      return objetivo > 0 && actual >= objetivo;
    }).length;
    const kmUpcoming = sharedMetrics.plansKm.filter((plan) => {
      const actual = Number(plan.km_actual) || 0;
      const objetivo = Number(plan.proximo_km) || 0;
      const alerta = Number(plan.alerta_km) || 0;
      return objetivo > 0 && actual < objetivo && (objetivo - actual) <= alerta;
    }).length;

    return {
      backlog: activeAlerts.length,
      liberated: liberatedAlerts.length,
      requestClose: requestCloseAlerts.length,
      compliance: duePlans.length ? Math.round((compliantPlans / duePlans.length) * 100) : 0,
      criticalEquipment,
      unavailableEquipment,
      lowStock,
      closedOt: sharedMetrics.history.length,
      plansByDate: sharedMetrics.plans.length,
      plansByKm: sharedMetrics.plansKm.length,
      kmDue,
      kmUpcoming,
    };
  }, [sharedMetrics]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
            Bienvenido, {user.full_name}
          </h1>
          <p style={{ color: '#6b7280' }}>
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
          </p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Backlog OT</div>
          <div className="stat-value" style={{ color: '#1d4ed8' }}>{maintenanceKpis.backlog}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT Liberadas</div>
          <div className="stat-value" style={{ color: '#7c3aed' }}>{maintenanceKpis.liberated}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Solicitudes de Cierre</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{maintenanceKpis.requestClose}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cumplimiento PMP</div>
          <div className="stat-value" style={{ color: '#059669' }}>{maintenanceKpis.compliance}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Equipos Criticos</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{maintenanceKpis.criticalEquipment}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Equipos No Operativos</div>
          <div className="stat-value" style={{ color: '#b45309' }}>{maintenanceKpis.unavailableEquipment}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stock Bajo Minimo</div>
          <div className="stat-value" style={{ color: '#ea580c' }}>{maintenanceKpis.lowStock}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 className="card-title">Resumen Operativo</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.85rem' }}>
          <div style={{ padding: '.9rem', border: '1px solid #e5e7eb', borderRadius: '.75rem', background: '#f8fafc' }}>
            <div style={{ color: '#6b7280', fontSize: '.85rem', marginBottom: '.3rem' }}>Planes por fecha</div>
            <strong style={{ fontSize: '1.4rem' }}>{maintenanceKpis.plansByDate}</strong>
          </div>
          <div style={{ padding: '.9rem', border: '1px solid #e5e7eb', borderRadius: '.75rem', background: '#f8fafc' }}>
            <div style={{ color: '#6b7280', fontSize: '.85rem', marginBottom: '.3rem' }}>Planes por kilometraje</div>
            <strong style={{ fontSize: '1.4rem' }}>{maintenanceKpis.plansByKm}</strong>
          </div>
          <div style={{ padding: '.9rem', border: '1px solid #e5e7eb', borderRadius: '.75rem', background: '#f8fafc' }}>
            <div style={{ color: '#6b7280', fontSize: '.85rem', marginBottom: '.3rem' }}>OT cerradas</div>
            <strong style={{ fontSize: '1.4rem' }}>{maintenanceKpis.closedOt}</strong>
          </div>
          <div style={{ padding: '.9rem', border: '1px solid #e5e7eb', borderRadius: '.75rem', background: '#f8fafc' }}>
            <div style={{ color: '#6b7280', fontSize: '.85rem', marginBottom: '.3rem' }}>Materiales catalogados</div>
            <strong style={{ fontSize: '1.4rem' }}>{sharedMetrics.materials.length}</strong>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 className="card-title">Control por Kilometraje</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.85rem' }}>
          <div style={{ padding: '.85rem', border: '1px solid #e5e7eb', borderRadius: '.75rem', background: '#f8fafc' }}>
            <div style={{ color: '#6b7280', fontSize: '.85rem', marginBottom: '.25rem' }}>Vencidos por km</div>
            <strong style={{ fontSize: '1.4rem', color: '#dc2626' }}>{maintenanceKpis.kmDue}</strong>
          </div>
          <div style={{ padding: '.85rem', border: '1px solid #e5e7eb', borderRadius: '.75rem', background: '#f8fafc' }}>
            <div style={{ color: '#6b7280', fontSize: '.85rem', marginBottom: '.25rem' }}>Proximos por km</div>
            <strong style={{ fontSize: '1.4rem', color: '#c2410c' }}>{maintenanceKpis.kmUpcoming}</strong>
          </div>
          <div style={{ padding: '.85rem', border: '1px solid #e5e7eb', borderRadius: '.75rem', background: '#f8fafc' }}>
            <div style={{ color: '#6b7280', fontSize: '.85rem', marginBottom: '.25rem' }}>Equipos registrados</div>
            <strong style={{ fontSize: '1.4rem' }}>{sharedMetrics.equipment.length}</strong>
          </div>
          <div style={{ padding: '.85rem', border: '1px solid #e5e7eb', borderRadius: '.75rem', background: '#f8fafc' }}>
            <div style={{ color: '#6b7280', fontSize: '.85rem', marginBottom: '.25rem' }}>Planes por fecha</div>
            <strong style={{ fontSize: '1.4rem' }}>{sharedMetrics.plans.length}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
