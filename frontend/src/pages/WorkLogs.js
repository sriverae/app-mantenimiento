import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getWorkLogs, getUserStats } from '../services/api';
import { format, subDays } from 'date-fns';

function WorkLogs({ user }) {
  const [workLogs, setWorkLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    loadData();
  }, [user, days]);

  const loadData = async () => {
    try {
      setLoading(true);
      const startDate = subDays(new Date(), days).toISOString().split('T')[0];
      
      const [logsData, statsData] = await Promise.all([
        getWorkLogs({ user_id: user.id }),
        getUserStats(user.id, days)
      ]);

      // Filtrar logs por período usando start_dt (fecha real del trabajo)
      const filteredLogs = logsData.filter(log => {
        const logDate = log.start_dt ? log.start_dt.split('T')[0] : log.day_date;
        return logDate >= startDate;
      });
      
      setWorkLogs(filteredLogs);
      setStats(statsData);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateHours = (start, end) => {
    const diff = new Date(end) - new Date(start);
    return (diff / (1000 * 60 * 60)).toFixed(2);
  };

  const groupByDate = (logs) => {
    const grouped = {};
    logs.forEach(log => {
      if (!grouped[log.day_date]) {
        grouped[log.day_date] = [];
      }
      grouped[log.day_date].push(log);
    });
    return grouped;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const groupedLogs = groupByDate(workLogs);
  const dates = Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '2rem' }}>
        Mis Registros de Trabajo
      </h1>

      {/* Estadísticas */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: '2rem' }}>
          <div className="stat-card">
            <div className="stat-label">Período</div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>
              {days} días
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Tareas Asignadas</div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>
              {stats.tasks_assigned}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Horas Trabajadas</div>
            <div className="stat-value" style={{ fontSize: '1.5rem', color: '#2563eb' }}>
              {stats.total_hours}h
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Registros</div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>
              {stats.total_worklogs}
            </div>
          </div>
        </div>
      )}

      {/* Selector de Período */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Mostrar últimos:</label>
          <select
            className="form-select"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            style={{ maxWidth: '200px' }}
          >
            <option value={7}>7 días</option>
            <option value={15}>15 días</option>
            <option value={30}>30 días</option>
            <option value={60}>60 días</option>
            <option value={90}>90 días</option>
          </select>
        </div>
      </div>

      {/* Registros Agrupados por Fecha */}
      {workLogs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏱️</p>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            No tienes registros de trabajo en este período
          </p>
          <Link to="/tasks" className="btn btn-primary">
            Ver Tareas Disponibles
          </Link>
        </div>
      ) : (
        <div>
          {dates.map(date => {
            const logs = groupedLogs[date];
            const totalHours = logs.reduce((sum, log) => 
              sum + parseFloat(calculateHours(log.start_dt, log.end_dt)), 0
            );

            return (
              <div key={date} className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '1rem',
                  paddingBottom: '1rem',
                  borderBottom: '2px solid #e5e7eb'
                }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                    📅 {format(new Date(date), 'dd/MM/yyyy')}
                  </h3>
                  <span style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: '700',
                    color: '#2563eb'
                  }}>
                    {totalHours.toFixed(2)}h
                  </span>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  {logs.map(log => (
                    <div
                      key={log.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        background: '#f9fafb'
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'start',
                        marginBottom: '0.75rem'
                      }}>
                        <div>
                          <Link 
                            to={`/tasks/${log.task_id}`}
                            style={{ 
                              fontSize: '1rem',
                              fontWeight: '600',
                              color: '#2563eb',
                              textDecoration: 'none'
                            }}
                          >
                            Tarea #{log.task_id}
                          </Link>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            ⏰ {format(new Date(log.start_dt), 'HH:mm')} - {format(new Date(log.end_dt), 'HH:mm')}
                          </div>
                        </div>
                        <span style={{ 
                          fontWeight: '700',
                          color: '#2563eb',
                          fontSize: '1.125rem'
                        }}>
                          {calculateHours(log.start_dt, log.end_dt)}h
                        </span>
                      </div>

                      {log.notes && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            📝 Notas:
                          </strong>
                          <p style={{ 
                            marginTop: '0.25rem', 
                            fontSize: '0.875rem',
                            whiteSpace: 'pre-wrap'
                          }}>
                            {log.notes}
                          </p>
                        </div>
                      )}

                      {log.parts && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            🔧 Repuestos:
                          </strong>
                          <p style={{ 
                            marginTop: '0.25rem', 
                            fontSize: '0.875rem',
                            whiteSpace: 'pre-wrap'
                          }}>
                            {log.parts}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WorkLogs;
