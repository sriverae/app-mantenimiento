import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTodayStats, getTasks } from '../services/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

function Dashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [todayTasks, setTodayTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      
      const [statsData, tasksData] = await Promise.all([
        getTodayStats(),
        getTasks({ day_date: today })
      ]);

      setStats(statsData);
      setTodayTasks(tasksData);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const getStatusBadgeClass = (status) => {
    const classes = {
      'OPEN': 'badge-open',
      'IN_PROGRESS': 'badge-in-progress',
      'DONE': 'badge-done'
    };
    return classes[status] || 'badge-open';
  };

  const getPriorityBadgeClass = (priority) => {
    const classes = {
      'ALTA': 'badge-alta',
      'MEDIA': 'badge-media',
      'BAJA': 'badge-baja'
    };
    return classes[priority] || 'badge-media';
  };

  const getStatusText = (status) => {
    const texts = {
      'OPEN': 'Abierta',
      'IN_PROGRESS': 'En Progreso',
      'DONE': 'Completada',
      'CANCELLED': 'Cancelada'
    };
    return texts[status] || status;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
            Bienvenido, {user.full_name}
          </h1>
          <p style={{ color: '#6b7280' }}>
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
          </p>
        </div>
        <Link to="/tasks/new" className="btn btn-primary">
          ➕ Nueva Tarea
        </Link>
      </div>

      {/* Estadísticas */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Tareas Hoy</div>
          <div className="stat-value">{stats?.total_tasks || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tareas Abiertas</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>
            {stats?.tasks_by_status?.OPEN || 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">En Progreso</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>
            {stats?.tasks_by_status?.IN_PROGRESS || 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completadas</div>
          <div className="stat-value" style={{ color: '#10b981' }}>
            {stats?.tasks_by_status?.DONE || 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Horas Trabajadas</div>
          <div className="stat-value">{stats?.total_hours?.toFixed(1) || 0}h</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Registros</div>
          <div className="stat-value">{stats?.total_worklogs || 0}</div>
        </div>
      </div>

      {/* Tareas de hoy */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            Tareas de Hoy
          </h2>
          <Link to="/tasks" className="btn btn-sm btn-secondary">
            Ver Todas
          </Link>
        </div>

        {todayTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</p>
            <p>No hay tareas para hoy</p>
            <Link to="/tasks/new" className="btn btn-primary" style={{ marginTop: '1rem' }}>
              Crear Primera Tarea
            </Link>
          </div>
        ) : (
          <div className="task-list">
            {todayTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="task-item">
                <div className="task-header">
                  <div>
                    <div className="task-title">{task.description}</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {task.area} - {task.equipo}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className={`task-badge ${getPriorityBadgeClass(task.priority)}`}>
                      {task.priority}
                    </span>
                    <span className={`task-badge ${getStatusBadgeClass(task.status)}`}>
                      {getStatusText(task.status)}
                    </span>
                  </div>
                </div>

                <div className="task-info">
                  {task.members.length > 0 && (
                    <div>👥 {task.members.length} miembro(s) asignado(s)</div>
                  )}
                </div>

                <div className="task-actions">
                  <Link to={`/tasks/${task.id}`} className="btn btn-sm btn-primary">
                    Ver Detalles
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mis Tareas Asignadas */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 className="card-title">Mis Tareas Asignadas</h2>
        {todayTasks.filter(t => t.members.includes(user.id)).length === 0 ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
            No tienes tareas asignadas hoy
          </p>
        ) : (
          <div className="task-list">
            {todayTasks
              .filter(t => t.members.includes(user.id))
              .map((task) => (
                <div key={task.id} className="task-item">
                  <div className="task-header">
                    <div>
                      <div className="task-title">{task.description}</div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        {task.area} - {task.equipo}
                      </div>
                    </div>
                    <span className={`task-badge ${getStatusBadgeClass(task.status)}`}>
                      {getStatusText(task.status)}
                    </span>
                  </div>
                  <div className="task-actions">
                    <Link to={`/tasks/${task.id}`} className="btn btn-sm btn-primary">
                      Trabajar en esta tarea
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
