import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Dashboard from './pages/Dashboard';
import WorkLogs from './pages/WorkLogs';
import WorkNotifications from './pages/WorkNotifications';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import ChangePassword from './pages/ChangePassword';
import PmpFechas from './pages/PmpFechas';
import PmpEquipos from './pages/PmpEquipos';
import PmpIntercambiosHistorial from './pages/PmpIntercambiosHistorial';
import PmpBajas from './pages/PmpBajas';
import PmpBajasHistorial from './pages/PmpBajasHistorial';
import PmpGestionOt from './pages/PmpGestionOt';
import PmpHistorialOt from './pages/PmpHistorialOt';
import PmpPaquetesMantenimiento from './pages/PmpPaquetesMantenimiento';
import RrhhManagement from './pages/RrhhManagement';
import MaterialsManagement from './pages/MaterialsManagement';

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
    { label: 'Equipos', path: '/pmp/equipos' },
    { label: 'Plan de mantenimiento - Fechas', path: '/pmp/fechas' },
    { label: 'Bajas', path: '/pmp/bajas' },
    { label: 'Historial intercambios', path: '/pmp/intercambios/historial' },
    { label: 'Historial bajas', path: '/pmp/bajas/historial' },
    { label: 'Gestión de OT', path: '/pmp/gestion-ot' },
    { label: 'Historial de OTs', path: '/pmp/historial-ot' },
    { label: 'Plan de mantenimiento - Km', path: null },
    { label: 'Paquetes de mantenimiento', path: '/pmp/paquetes' },
    { label: 'Calendario', path: null },
    { label: 'AMEF', path: null },
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
            <li><Link to="/tasks" className="nav-link">Notificaciones de Trabajo</Link></li>
            <li><Link to="/worklogs" className="nav-link">Registros</Link></li>
            <li className="nav-dropdown">
              <details className="nav-dropdown-details">
                <summary className="nav-link nav-dropdown-trigger">
                  PMP <span style={{ fontSize: '.65rem' }}>▼</span>
                </summary>
                <div className="nav-dropdown-menu">
                  {pmpOptions.map((option) => option.path ? (
                    <Link key={option.label} to={option.path} className="nav-dropdown-item">
                      {option.label}
                    </Link>
                  ) : (
                    <button key={option.label} type="button" className="nav-dropdown-item nav-dropdown-item-muted">
                      {option.label}
                    </button>
                  ))}
                </div>
              </details>
            </li>
            {user?.role === 'INGENIERO' && (
              <>
                <li><Link to="/rrhh" className="nav-link">Gestión de RRHH</Link></li>
                <li><Link to="/materiales" className="nav-link">Gestión de Materiales</Link></li>
              </>
            )}
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
          <Route path="/tasks" element={<PrivateRoute><WorkNotifications user={user} /></PrivateRoute>} />
          <Route path="/tasks/new" element={<Navigate to="/tasks" replace />} />
          <Route path="/tasks/:taskId" element={<Navigate to="/tasks" replace />} />
          <Route path="/worklogs" element={<PrivateRoute><WorkLogs user={user} /></PrivateRoute>} />
          <Route path="/rrhh" element={<PrivateRoute minRole="INGENIERO"><RrhhManagement /></PrivateRoute>} />
          <Route path="/materiales" element={<PrivateRoute minRole="INGENIERO"><MaterialsManagement /></PrivateRoute>} />
          <Route path="/pmp/equipos" element={<PrivateRoute minRole="ENCARGADO"><PmpEquipos /></PrivateRoute>} />
          <Route path="/pmp/fechas" element={<PrivateRoute minRole="ENCARGADO"><PmpFechas /></PrivateRoute>} />
          <Route path="/pmp/bajas" element={<PrivateRoute minRole="ENCARGADO"><PmpBajas /></PrivateRoute>} />
          <Route path="/pmp/intercambios/historial" element={<PrivateRoute minRole="ENCARGADO"><PmpIntercambiosHistorial /></PrivateRoute>} />
          <Route path="/pmp/bajas/historial" element={<PrivateRoute minRole="ENCARGADO"><PmpBajasHistorial /></PrivateRoute>} />
          <Route path="/pmp/gestion-ot" element={<PrivateRoute minRole="ENCARGADO"><PmpGestionOt /></PrivateRoute>} />
          <Route path="/pmp/historial-ot" element={<PrivateRoute minRole="ENCARGADO"><PmpHistorialOt /></PrivateRoute>} />
          <Route path="/pmp/paquetes" element={<PrivateRoute minRole="ENCARGADO"><PmpPaquetesMantenimiento /></PrivateRoute>} />
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
            <span className="bottom-nav-icon">📋</span><span>Notif.</span>
          </Link>
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
