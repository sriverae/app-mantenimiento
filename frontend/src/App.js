import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Dashboard from './pages/Dashboard';
import WorkLogs from './pages/WorkLogs';
import WorkNotifications from './pages/WorkNotifications';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import ChangePassword from './pages/ChangePassword';
import TaskDetail from './pages/TaskDetail';
import PmpFechas from './pages/PmpFechas';
import PmpAmef from './pages/PmpAmef';
import PmpCalendario from './pages/PmpCalendario';
import PmpKm from './pages/PmpKm';
import PmpEquipos from './pages/PmpEquipos';
import PmpIntercambiosHistorial from './pages/PmpIntercambiosHistorial';
import PmpBajas from './pages/PmpBajas';
import PmpBajasHistorial from './pages/PmpBajasHistorial';
import PmpGestionOt from './pages/PmpGestionOt';
import PmpHistorialOt from './pages/PmpHistorialOt';
import PmpMaintenanceNotices from './pages/PmpMaintenanceNotices';
import PmpPaquetesMantenimiento from './pages/PmpPaquetesMantenimiento';
import RrhhManagement from './pages/RrhhManagement';
import MaterialsManagement from './pages/MaterialsManagement';
import SettingsOtOrders from './pages/SettingsOtOrders';
import SettingsImports from './pages/SettingsImports';
import { SETTINGS_SECTIONS } from './utils/settingsSections';

function PrivateRoute({ children, minRole }) {
  const { user, loading, hasMinRole } = useAuth();
  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (minRole && !hasMinRole(minRole)) return (
    <div className="container" style={{ marginTop: '4rem', textAlign: 'center' }}>
      <p style={{ fontSize: '3rem' }}>Acceso restringido</p>
      <h2>Acceso denegado</h2>
      <p style={{ color: '#6b7280' }}>Tu rol no tiene permiso para ver esta pagina.</p>
    </div>
  );
  return children;
}

function AppLayout() {
  const { user, logout, hasMinRole } = useAuth();
  const location = useLocation();
  const pmpOptions = [
    { label: 'Equipos', path: '/pmp/equipos' },
    { label: 'Plan de mantenimiento - Fechas', path: '/pmp/fechas' },
    { label: 'Plan de mantenimiento - Km', path: '/pmp/km' },
    { label: 'Paquetes de mantenimiento', path: '/pmp/paquetes' },
    { label: 'Gestion de OT', path: '/pmp/gestion-ot' },
    { label: 'Avisos de Mantenimiento', path: '/pmp/avisos' },
    { label: 'Historial de OTs', path: '/pmp/historial-ot' },
    { label: 'Bajas', path: '/pmp/bajas' },
    { label: 'Historial intercambios', path: '/pmp/intercambios/historial' },
    { label: 'Historial bajas', path: '/pmp/bajas/historial' },
    { label: 'Calendario', path: '/pmp/calendario' },
    { label: 'AMEF', path: '/pmp/amef' },
  ];
  const settingsOptions = SETTINGS_SECTIONS;

  const isActive = (path) => location.pathname === path;
  const isInSection = (prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`);
  const navLinkClass = (path, mode = 'exact') => `nav-link ${mode === 'section' ? (isInSection(path) ? 'active' : '') : (isActive(path) ? 'active' : '')}`;
  const ROLE_COLORS = { INGENIERO: '#7c3aed', PLANNER: '#2563eb', ENCARGADO: '#0891b2', TECNICO: '#059669' };
  const roleColor = ROLE_COLORS[user?.role] || '#6b7280';
  const userInitial = String(user?.full_name || user?.username || 'U').trim().charAt(0).toUpperCase() || 'U';
  const mobileLinks = [
    { label: 'Dashboard', path: '/' },
    { label: 'Notificaciones', path: '/tasks' },
    { label: 'Registros', path: '/worklogs' },
    ...(hasMinRole('ENCARGADO') ? [{ label: 'PMP', path: '/pmp/gestion-ot' }] : []),
    ...(user?.role === 'INGENIERO' ? [{ label: 'RRHH', path: '/rrhh' }, { label: 'Materiales', path: '/materiales' }] : []),
    ...(hasMinRole('ENCARGADO') ? [{ label: 'Usuarios', path: '/users' }] : []),
    ...(user?.role === 'INGENIERO' ? [{ label: 'Configuraciones', path: '/settings/ordenes-trabajo' }] : []),
  ];

  return (
    <div className="App">
      <nav className="navbar">
        <div className="navbar-container">
          <div className="navbar-main">
            <Link to="/" className="navbar-brand">Mantenimiento</Link>
            <div className="mobile-nav">
              <details className="mobile-nav-details">
                <summary className="mobile-nav-summary">Menu</summary>
                <div className="mobile-nav-menu">
                  {mobileLinks.map((item) => (
                    <Link key={item.path} to={item.path} className={`mobile-nav-item ${isActive(item.path) ? 'active' : ''}`}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </details>
            </div>
            <ul className="navbar-nav">
              <li><Link to="/" className={navLinkClass('/')}>Dashboard</Link></li>
              <li><Link to="/tasks" className={navLinkClass('/tasks', 'section')}>Notificaciones de Trabajo</Link></li>
              <li><Link to="/worklogs" className={navLinkClass('/worklogs')}>Registros</Link></li>
              <li className="nav-dropdown">
                <details className="nav-dropdown-details">
                  <summary className={`${navLinkClass('/pmp', 'section')} nav-dropdown-trigger`}>
                    PMP <span style={{ fontSize: '.7rem' }}>+</span>
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
                  <li><Link to="/rrhh" className={navLinkClass('/rrhh')}>Gestion de RRHH</Link></li>
                  <li><Link to="/materiales" className={navLinkClass('/materiales')}>Gestion de Materiales</Link></li>
                  <li className="nav-dropdown">
                    <details className="nav-dropdown-details">
                      <summary className={`${navLinkClass('/settings', 'section')} nav-dropdown-trigger`}>
                        Configuraciones <span style={{ fontSize: '.7rem' }}>+</span>
                      </summary>
                      <div className="nav-dropdown-menu">
                        {settingsOptions.map((option) => (
                          <Link key={option.label} to={option.path} className="nav-dropdown-item">
                            {option.label}
                          </Link>
                        ))}
                      </div>
                    </details>
                  </li>
                </>
              )}
              {hasMinRole('ENCARGADO') && (
                <li><Link to="/users" className={navLinkClass('/users')}>Usuarios</Link></li>
              )}
            </ul>
          </div>

          <div className="navbar-user-panel">
            <div className="navbar-user-meta">
              <div className="navbar-user-name">{user?.full_name}</div>
              <div className="navbar-user-role" style={{ color: roleColor }}>{user?.role}</div>
            </div>
            <div className="nav-user-menu-wrapper">
              <details className="nav-user-menu-details">
                <summary className="navbar-avatar-summary">
                  {userInitial}
                </summary>
                <div className="nav-user-menu">
                  <Link to="/change-password" className="nav-user-menu-item">
                    Cambiar contrasena
                  </Link>
                  <button onClick={logout} className="nav-user-menu-item nav-user-menu-item-danger">
                    Cerrar sesion
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
      </nav>

      <div className="container">
        <Routes>
          <Route path="/" element={<PrivateRoute><Dashboard user={user} /></PrivateRoute>} />
          <Route path="/tasks" element={<PrivateRoute><WorkNotifications user={user} /></PrivateRoute>} />
          <Route path="/tasks/:taskId" element={<PrivateRoute><TaskDetail user={user} /></PrivateRoute>} />
          <Route path="/worklogs" element={<PrivateRoute><WorkLogs user={user} /></PrivateRoute>} />
          <Route path="/rrhh" element={<PrivateRoute minRole="INGENIERO"><RrhhManagement /></PrivateRoute>} />
          <Route path="/materiales" element={<PrivateRoute minRole="INGENIERO"><MaterialsManagement /></PrivateRoute>} />
          <Route path="/pmp/equipos" element={<PrivateRoute minRole="ENCARGADO"><PmpEquipos /></PrivateRoute>} />
          <Route path="/pmp/fechas" element={<PrivateRoute minRole="ENCARGADO"><PmpFechas /></PrivateRoute>} />
          <Route path="/pmp/amef" element={<PrivateRoute minRole="ENCARGADO"><PmpAmef /></PrivateRoute>} />
          <Route path="/pmp/calendario" element={<PrivateRoute minRole="ENCARGADO"><PmpCalendario /></PrivateRoute>} />
          <Route path="/pmp/km" element={<PrivateRoute minRole="ENCARGADO"><PmpKm /></PrivateRoute>} />
          <Route path="/pmp/bajas" element={<PrivateRoute minRole="ENCARGADO"><PmpBajas /></PrivateRoute>} />
          <Route path="/pmp/intercambios/historial" element={<PrivateRoute minRole="ENCARGADO"><PmpIntercambiosHistorial /></PrivateRoute>} />
          <Route path="/pmp/bajas/historial" element={<PrivateRoute minRole="ENCARGADO"><PmpBajasHistorial /></PrivateRoute>} />
          <Route path="/pmp/gestion-ot" element={<PrivateRoute minRole="ENCARGADO"><PmpGestionOt /></PrivateRoute>} />
          <Route path="/pmp/avisos" element={<PrivateRoute minRole="ENCARGADO"><PmpMaintenanceNotices /></PrivateRoute>} />
          <Route path="/pmp/historial-ot" element={<PrivateRoute minRole="ENCARGADO"><PmpHistorialOt /></PrivateRoute>} />
          <Route path="/pmp/paquetes" element={<PrivateRoute minRole="ENCARGADO"><PmpPaquetesMantenimiento /></PrivateRoute>} />
          <Route path="/settings/ordenes-trabajo" element={<PrivateRoute minRole="INGENIERO"><SettingsOtOrders /></PrivateRoute>} />
          <Route path="/settings/importaciones/:section" element={<PrivateRoute minRole="INGENIERO"><SettingsImports /></PrivateRoute>} />
          <Route path="/users" element={<PrivateRoute minRole="ENCARGADO"><UserManagement /></PrivateRoute>} />
          <Route path="/change-password" element={<PrivateRoute><ChangePassword /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>

      <nav className="bottom-nav">
        <div className="bottom-nav-items">
          <Link to="/" className={`bottom-nav-item ${isActive('/') ? 'active' : ''}`}>
            <span className="bottom-nav-icon">IN</span><span className="bottom-nav-label">Inicio</span>
          </Link>
          <Link to="/tasks" className={`bottom-nav-item ${isActive('/tasks') ? 'active' : ''}`}>
            <span className="bottom-nav-icon">OT</span><span className="bottom-nav-label">Trabajo</span>
          </Link>
          <Link to="/worklogs" className={`bottom-nav-item ${isActive('/worklogs') ? 'active' : ''}`}>
            <span className="bottom-nav-icon">HH</span><span className="bottom-nav-label">Registros</span>
          </Link>
          {hasMinRole('ENCARGADO') && (
            <Link to="/users" className={`bottom-nav-item ${isActive('/users') ? 'active' : ''}`}>
              <span className="bottom-nav-icon">US</span><span className="bottom-nav-label">Usuarios</span>
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}

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
