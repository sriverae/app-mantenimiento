import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import NewTask from './pages/NewTask';
import TaskDetail from './pages/TaskDetail';
import WorkLogs from './pages/WorkLogs';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import ChangePassword from './pages/ChangePassword';

// ---------------------------------------------------------------------------
// Guard: redirect to /login if not authenticated
// ---------------------------------------------------------------------------
function PrivateRoute({ children, minRole }) {
  const { user, loading, hasMinRole } = useAuth();
  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (minRole && !hasMinRole(minRole)) return (
    <div className="container" style={{ marginTop: '4rem', textAlign: 'center' }}>
      <p style={{ fontSize: '3rem' }}>🚫</p>
      <h2>Acceso denegado</h2>
      <p style={{ color: '#6b7280' }}>Tu rol no tiene permiso para ver esta página.</p>
    </div>
  );
  return children;
}

// ---------------------------------------------------------------------------
// Main layout (navbar + bottom nav)
// ---------------------------------------------------------------------------
function AppLayout() {
  const { user, logout, hasMinRole } = useAuth();
  const location = useLocation();
  const pmpOptions = [
    'Plan de mantenimiento - Fechas',
    'Plan de mantenimiento - Km',
    'Paquetes de mantenimiento',
    'Calendario',
    'AMEF',
    'Gestión de OT',
  ];

  const isActive = (path) => location.pathname === path;

  const ROLE_COLORS = { INGENIERO: '#7c3aed', PLANNER: '#2563eb', ENCARGADO: '#0891b2', TECNICO: '#059669' };
  const roleColor = ROLE_COLORS[user?.role] || '#6b7280';

  return (
    <div className="App">
      {/* Top navbar */}
      <nav className="navbar">
        <div className="navbar-container">
          <Link to="/" className="navbar-brand">🔧 Mantenimiento</Link>
          <ul className="navbar-nav">
            <li><Link to="/" className="nav-link">Dashboard</Link></li>
            <li><Link to="/tasks" className="nav-link">Tareas</Link></li>
            <li><Link to="/worklogs" className="nav-link">Registros</Link></li>
            <li style={{ position: 'relative' }}>
              <details>
                <summary className="nav-link" style={{ cursor: 'pointer', listStyle: 'none' }}>
                  PMP ▾
                </summary>
                <div style={{ position: 'absolute', top: '2.2rem', left: 0, background: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', borderRadius: '0.5rem', minWidth: '280px', zIndex: 120, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  {pmpOptions.map((option) => (
                    <button key={option} type="button" style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid #f3f4f6', padding: '0.65rem 0.9rem', fontSize: '0.88rem', color: '#1f2937', cursor: 'pointer' }}>
                      {option}
                    </button>
                  ))}
                </div>
              </details>
            </li>
            {hasMinRole('ENCARGADO') && (
              <li><Link to="/users" className="nav-link">Usuarios</Link></li>
            )}
          </ul>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user?.full_name}</div>
              <div style={{ fontSize: '0.75rem', color: roleColor, fontWeight: 600 }}>{user?.role}</div>
            </div>
            <div style={{ position: 'relative' }}>
              <details style={{ cursor: 'pointer' }}>
                <summary style={{ listStyle: 'none', background: '#f3f4f6', border: 'none', borderRadius: '50%', width: '2.5rem', height: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.2rem' }}>
                  👤
                </summary>
                <div style={{ position: 'absolute', right: 0, top: '3rem', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderRadius: '0.5rem', minWidth: '180px', zIndex: 100, overflow: 'hidden' }}>
                  <Link to="/change-password" style={{ display: 'block', padding: '0.75rem 1rem', color: '#374151', textDecoration: 'none', fontSize: '0.9rem', borderBottom: '1px solid #f3f4f6' }}>
                    🔑 Cambiar contraseña
                  </Link>
                  <button onClick={logout} style={{ width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: '#dc2626', fontSize: '0.9rem' }}>
                    🚪 Cerrar sesión
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="container">
        <Routes>
          <Route path="/" element={<PrivateRoute><Dashboard user={user} /></PrivateRoute>} />
          <Route path="/tasks" element={<PrivateRoute><Tasks user={user} /></PrivateRoute>} />
          <Route path="/tasks/new" element={<PrivateRoute minRole="PLANNER"><NewTask user={user} /></PrivateRoute>} />
          <Route path="/tasks/:taskId" element={<PrivateRoute><TaskDetail user={user} /></PrivateRoute>} />
          <Route path="/worklogs" element={<PrivateRoute><WorkLogs user={user} /></PrivateRoute>} />
          <Route path="/users" element={<PrivateRoute minRole="ENCARGADO"><UserManagement /></PrivateRoute>} />
          <Route path="/change-password" element={<PrivateRoute><ChangePassword /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>

      {/* Bottom navigation (mobile) */}
      <nav className="bottom-nav">
        <div className="bottom-nav-items">
          <Link to="/" className={`bottom-nav-item ${isActive('/') ? 'active' : ''}`}>
            <span className="bottom-nav-icon">📊</span><span>Dashboard</span>
          </Link>
          <Link to="/tasks" className={`bottom-nav-item ${isActive('/tasks') ? 'active' : ''}`}>
            <span className="bottom-nav-icon">📋</span><span>Tareas</span>
          </Link>
          {hasMinRole('PLANNER') && (
            <Link to="/tasks/new" className={`bottom-nav-item ${isActive('/tasks/new') ? 'active' : ''}`}>
              <span className="bottom-nav-icon">➕</span><span>Nueva</span>
            </Link>
          )}
          <Link to="/worklogs" className={`bottom-nav-item ${isActive('/worklogs') ? 'active' : ''}`}>
            <span className="bottom-nav-icon">⏱️</span><span>Registros</span>
          </Link>
          {hasMinRole('ENCARGADO') && (
            <Link to="/users" className={`bottom-nav-item ${isActive('/users') ? 'active' : ''}`}>
              <span className="bottom-nav-icon">👥</span><span>Usuarios</span>
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root: decide login vs app
// ---------------------------------------------------------------------------
function RootRouter() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/*" element={user ? <AppLayout /> : <Navigate to="/login" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <RootRouter />
      </Router>
    </AuthProvider>
  );
}
