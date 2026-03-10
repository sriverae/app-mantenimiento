import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTask,
  updateTask,
  addTaskMember,
  removeTaskMember,
  getWorkLogs,
  createWorkLog,
  deleteWorkLog
} from '../services/api';
import { format } from 'date-fns';

function TaskDetail({ user }) {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [workLogs, setWorkLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWorkLogForm, setShowWorkLogForm] = useState(false);
  const [workLogForm, setWorkLogForm] = useState({
    start_dt: '',
    end_dt: '',
    notes: '',
    parts: ''
  });

  useEffect(() => {
    loadTaskDetails();
  }, [taskId]);

  const loadTaskDetails = async () => {
    try {
      setLoading(true);
      const [taskData, workLogsData] = await Promise.all([
        getTask(taskId),
        getWorkLogs({ task_id: taskId })
      ]);
      setTask(taskData);
      setWorkLogs(workLogsData);
    } catch (err) {
      console.error('Error cargando tarea:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTask = async () => {
    try {
      await addTaskMember(taskId, user.telegram_id);
      await loadTaskDetails();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al unirse a la tarea');
    }
  };

  const handleLeaveTask = async () => {
    if (!window.confirm('¿Estás seguro de que quieres salir de esta tarea?')) {
      return;
    }
    try {
      await removeTaskMember(taskId, user.telegram_id);
      await loadTaskDetails();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al salir de la tarea');
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await updateTask(taskId, { status: newStatus });
      await loadTaskDetails();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al actualizar estado');
    }
  };

  const handleWorkLogSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Crear objetos Date a partir de los inputs datetime-local
      const start = new Date(workLogForm.start_dt);
      const end = new Date(workLogForm.end_dt);

      if (end <= start) {
        alert('La hora de fin debe ser posterior a la de inicio');
        return;
      }

      await createWorkLog({
        task_id: parseInt(taskId),
        telegram_id: user.telegram_id,
        user_name: user.full_name,
        start_dt: start.toISOString(),
        end_dt: end.toISOString(),
        notes: workLogForm.notes,
        parts: workLogForm.parts
      });

      setShowWorkLogForm(false);
      setWorkLogForm({ start_dt: '', end_dt: '', notes: '', parts: '' });
      await loadTaskDetails();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al crear registro');
    }
  };

  const handleDeleteWorkLog = async (workLogId) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este registro?')) {
      return;
    }
    try {
      await deleteWorkLog(workLogId);
      await loadTaskDetails();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al eliminar registro');
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="card">
        <p>Tarea no encontrada</p>
        <button onClick={() => navigate('/tasks')} className="btn btn-secondary">
          Volver a Tareas
        </button>
      </div>
    );
  }

  const isAssigned = task.members.includes(user.telegram_id);
  const canEdit = user.role === 'INGENIERO' || user.role === 'PLANNER' || user.role === 'ENCARGADO';

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

  const calculateHours = (start, end) => {
    const diff = new Date(end) - new Date(start);
    return (diff / (1000 * 60 * 60)).toFixed(2);
  };

  return (
    <div>
      <button onClick={() => navigate('/tasks')} className="btn btn-secondary" style={{ marginBottom: '1rem' }}>
        ← Volver a Tareas
      </button>

      {/* Información de la Tarea */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
              {task.description}
            </h1>
            <p style={{ color: '#6b7280' }}>
              Tarea #{task.id}
            </p>
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

        <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <strong style={{ color: '#6b7280' }}>📍 Área:</strong> {task.area}
          </div>
          <div>
            <strong style={{ color: '#6b7280' }}>🔧 Equipo:</strong> {task.equipo}
          </div>
          <div>
            <strong style={{ color: '#6b7280' }}>📅 Fecha:</strong> {format(new Date(task.day_date), 'dd/MM/yyyy')}
          </div>
          {task.rescheduled_date && (
            <div>
              <strong style={{ color: '#f59e0b' }}>⏰ Reprogramada para:</strong> {format(new Date(task.rescheduled_date), 'dd/MM/yyyy')}
            </div>
          )}
          <div>
            <strong style={{ color: '#6b7280' }}>👥 Miembros asignados:</strong> {task.members.length}
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {isAssigned ? (
            <>
              <button onClick={handleLeaveTask} className="btn btn-secondary">
                Salir de la Tarea
              </button>
              {task.status !== 'DONE' && (
                <button
                  onClick={() => setShowWorkLogForm(!showWorkLogForm)}
                  className="btn btn-primary"
                >
                  {showWorkLogForm ? 'Cancelar' : '⏱️ Registrar Horas'}
                </button>
              )}
            </>
          ) : (
            <button onClick={handleJoinTask} className="btn btn-success">
              Unirme a esta Tarea
            </button>
          )}

          {canEdit && task.status !== 'DONE' && (
            <button
              onClick={() => handleStatusChange('DONE')}
              className="btn btn-success"
            >
              ✓ Marcar como Completada
            </button>
          )}
        </div>
      </div>

      {/* Formulario de Registro de Horas */}
      {showWorkLogForm && (
        <div className="card">
          <h2 className="card-title">Registrar Horas de Trabajo</h2>
          <form onSubmit={handleWorkLogSubmit}>
            <div className="form-group">
              <label className="form-label">Hora de Inicio *</label>
              <input
                type="datetime-local"
                className="form-input"
                value={workLogForm.start_dt}
                onChange={(e) => setWorkLogForm({ ...workLogForm, start_dt: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Hora de Fin *</label>
              <input
                type="datetime-local"
                className="form-input"
                value={workLogForm.end_dt}
                onChange={(e) => setWorkLogForm({ ...workLogForm, end_dt: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notas del Trabajo</label>
              <textarea
                className="form-textarea"
                value={workLogForm.notes}
                onChange={(e) => setWorkLogForm({ ...workLogForm, notes: e.target.value })}
                placeholder="Describe el trabajo realizado..."
                rows="3"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Repuestos Utilizados</label>
              <textarea
                className="form-textarea"
                value={workLogForm.parts}
                onChange={(e) => setWorkLogForm({ ...workLogForm, parts: e.target.value })}
                placeholder="Lista de repuestos o materiales utilizados..."
                rows="2"
              />
            </div>

            <button type="submit" className="btn btn-primary">
              Guardar Registro
            </button>
          </form>
        </div>
      )}

      {/* Registros de Trabajo */}
      <div className="card">
        <h2 className="card-title">Registros de Trabajo ({workLogs.length})</h2>
        
        {workLogs.length === 0 ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
            No hay registros de trabajo para esta tarea
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {workLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  background: '#f9fafb'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <div>
                    <strong>{log.user_name}</strong>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {format(new Date(log.start_dt), 'dd/MM/yyyy HH:mm')} - {format(new Date(log.end_dt), 'HH:mm')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', color: '#2563eb' }}>
                      {calculateHours(log.start_dt, log.end_dt)}h
                    </span>
                    {log.telegram_id === user.telegram_id && (
                      <button
                        onClick={() => handleDeleteWorkLog(log.id)}
                        className="btn btn-sm btn-danger"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
                
                {log.notes && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong style={{ fontSize: '0.875rem', color: '#6b7280' }}>Notas:</strong>
                    <p style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>{log.notes}</p>
                  </div>
                )}
                
                {log.parts && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong style={{ fontSize: '0.875rem', color: '#6b7280' }}>Repuestos:</strong>
                    <p style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>{log.parts}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskDetail;
