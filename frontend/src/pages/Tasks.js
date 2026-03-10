import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTasks } from '../services/api';
import { format } from 'date-fns';

function Tasks({ user }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    day_date: new Date().toISOString().split('T')[0],
    status: '',
  });

  useEffect(() => {
    loadTasks();
  }, [filters]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await getTasks(filters);
      setTasks(data);
    } catch (err) {
      console.error('Error cargando tareas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value
    });
  };

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
        <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>
          Tareas
        </h1>
        <Link to="/tasks/new" className="btn btn-primary">
          ➕ Nueva Tarea
        </Link>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
          Filtros
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fecha</label>
            <input
              type="date"
              name="day_date"
              className="form-input"
              value={filters.day_date}
              onChange={handleFilterChange}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Estado</label>
            <select
              name="status"
              className="form-select"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">Todos</option>
              <option value="OPEN">Abierta</option>
              <option value="IN_PROGRESS">En Progreso</option>
              <option value="DONE">Completada</option>
              <option value="CANCELLED">Cancelada</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Tareas */}
      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</p>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            No hay tareas para los filtros seleccionados
          </p>
          <Link to="/tasks/new" className="btn btn-primary">
            Crear Nueva Tarea
          </Link>
        </div>
      ) : (
        <div>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            Mostrando {tasks.length} tarea(s)
          </p>
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.id} className="task-item">
                <div className="task-header">
                  <div style={{ flex: 1 }}>
                    <div className="task-title">{task.description}</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      📍 {task.area} • 🔧 {task.equipo}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <span className={`task-badge ${getPriorityBadgeClass(task.priority)}`}>
                      {task.priority}
                    </span>
                    <span className={`task-badge ${getStatusBadgeClass(task.status)}`}>
                      {getStatusText(task.status)}
                    </span>
                  </div>
                </div>

                <div className="task-info">
                  <div>📅 Fecha: {format(new Date(task.day_date), 'dd/MM/yyyy')}</div>
                  {task.members.length > 0 && (
                    <div>👥 {task.members.length} miembro(s) asignado(s)</div>
                  )}
                  {task.rescheduled_date && (
                    <div style={{ color: '#f59e0b' }}>
                      ⏰ Reprogramada para: {format(new Date(task.rescheduled_date), 'dd/MM/yyyy')}
                    </div>
                  )}
                </div>

                <div className="task-actions">
                  <Link to={`/tasks/${task.id}`} className="btn btn-sm btn-primary">
                    Ver Detalles
                  </Link>
                  {task.members.includes(user.telegram_id) && (
                    <span className="btn btn-sm btn-success" style={{ cursor: 'default' }}>
                      ✓ Asignado a ti
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Tasks;
