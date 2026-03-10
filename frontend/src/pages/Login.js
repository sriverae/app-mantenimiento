import React, { useState } from 'react';
import { createUser, getUsers } from '../services/api';

function Login({ onLogin }) {
  const [step, setStep] = useState('select'); // 'select' o 'register'
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Datos para registro
  const [formData, setFormData] = useState({
    telegram_id: '',
    full_name: '',
    username: '',
    role: 'TECNICO'
  });

  React.useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
    }
  };

  const handleSelectUser = async (user) => {
    onLogin(user);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Generar un telegram_id aleatorio si no se proporciona
      const telegramId = formData.telegram_id || Math.floor(Math.random() * 1000000);
      
      const newUser = await createUser({
        ...formData,
        telegram_id: parseInt(telegramId)
      });
      
      onLogin(newUser);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al crear usuario');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  if (step === 'register') {
    return (
      <div className="container" style={{ maxWidth: '500px', marginTop: '3rem' }}>
        <div className="card">
          <h1 className="card-title">Registrar Nuevo Usuario</h1>
          
          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label className="form-label">Nombre Completo *</label>
              <input
                type="text"
                name="full_name"
                className="form-input"
                value={formData.full_name}
                onChange={handleInputChange}
                required
                placeholder="Ej: Juan Pérez"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Usuario (opcional)</label>
              <input
                type="text"
                name="username"
                className="form-input"
                value={formData.username}
                onChange={handleInputChange}
                placeholder="Ej: jperez"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Rol</label>
              <select
                name="role"
                className="form-select"
                value={formData.role}
                onChange={handleInputChange}
              >
                <option value="TECNICO">Técnico</option>
                <option value="ASISTENTE">Asistente</option>
                <option value="ENCARGADO">Encargado</option>
                <option value="PLANNER">Planner</option>
                <option value="INGENIERO">Ingeniero</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">ID Telegram (opcional)</label>
              <input
                type="number"
                name="telegram_id"
                className="form-input"
                value={formData.telegram_id}
                onChange={handleInputChange}
                placeholder="Se generará automáticamente si está vacío"
              />
              <small style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                Si no tienes ID de Telegram, déjalo vacío
              </small>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep('select')}
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
                {loading ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: '600px', marginTop: '3rem' }}>
      <div className="card">
        <h1 className="card-title" style={{ textAlign: 'center' }}>
          🔧 Sistema de Mantenimiento
        </h1>
        <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '2rem' }}>
          Selecciona tu usuario o crea uno nuevo
        </p>

        {users.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Usuarios Existentes:
            </h3>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className="btn btn-secondary"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    textAlign: 'left'
                  }}
                >
                  <span>
                    <strong>{user.full_name}</strong>
                    {user.username && <span style={{ opacity: 0.7 }}> (@{user.username})</span>}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      background: '#e5e7eb',
                      color: '#374151',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem'
                    }}
                  >
                    {user.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => setStep('register')}
          className="btn btn-primary"
          style={{ width: '100%' }}
        >
          ➕ Crear Nuevo Usuario
        </button>
      </div>
    </div>
  );
}

export default Login;
