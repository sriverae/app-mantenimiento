import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTask } from '../services/api';

function NewTask({ user }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    day_date: new Date().toISOString().split('T')[0],
    area: '',
    equipo: '',
    description: '',
    priority: 'MEDIA'
  });

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await createTask(formData, user.telegram_id);
      navigate('/tasks');
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al crear la tarea');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
          Nueva Tarea
        </h1>
        <p style={{ color: '#6b7280' }}>
          Completa los datos para crear una nueva tarea
        </p>
      </div>

      <div className="card" style={{ maxWidth: '700px' }}>
        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Fecha *</label>
            <input
              type="date"
              name="day_date"
              className="form-input"
              value={formData.day_date}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Área *</label>
            <input
              type="text"
              name="area"
              className="form-input"
              value={formData.area}
              onChange={handleInputChange}
              required
              placeholder="Ej: Producción, Almacén, Oficinas..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Equipo *</label>
            <input
              type="text"
              name="equipo"
              className="form-input"
              value={formData.equipo}
              onChange={handleInputChange}
              required
              placeholder="Ej: Compresor #3, Bomba Principal, PC-001..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Descripción *</label>
            <textarea
              name="description"
              className="form-textarea"
              value={formData.description}
              onChange={handleInputChange}
              required
              placeholder="Describe el problema o trabajo a realizar..."
              rows="4"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Prioridad</label>
            <select
              name="priority"
              className="form-select"
              value={formData.priority}
              onChange={handleInputChange}
            >
              <option value="BAJA">Baja</option>
              <option value="MEDIA">Media</option>
              <option value="ALTA">Alta</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/tasks')}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? 'Creando...' : 'Crear Tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewTask;
