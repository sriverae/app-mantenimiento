import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Dashboard from './pages/Dashboard';
import Indicators from './pages/Indicators';
import ControlCenter from './pages/ControlCenter';
import MaintenanceAnalytics from './pages/MaintenanceAnalytics';
import ExecutiveAudit from './pages/ExecutiveAudit';
import OperationalEvents from './pages/OperationalEvents';
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
import AttendanceManagement from './pages/AttendanceManagement';
import AttendanceHistory from './pages/AttendanceHistory';
import MaterialsManagement from './pages/MaterialsManagement';
import SettingsOtOrders from './pages/SettingsOtOrders';
import SettingsImports from './pages/SettingsImports';
import SettingsCounters from './pages/SettingsCounters';
import SettingsDropdownLists from './pages/SettingsDropdownLists';
import SettingsPdfFormat from './pages/SettingsPdfFormat';
import { RRHH_SECTIONS } from './components/RrhhSectionNav';
import { getDefaultSettingsPath, getVisibleSettingsSections } from './utils/settingsSections';
import { ROLE_COLORS, canCreateMaintenanceNotices } from './utils/roleAccess';
import { SHARED_DOCUMENT_CONFLICT_EVENT } from './services/sharedDocuments';

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
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileSection, setMobileSection] = useState(null);
  const [sharedDocAlert, setSharedDocAlert] = useState(null);
  const mobileMenuRef = useRef(null);
  const pmpMenuRef = useRef(null);
  const rrhhMenuRef = useRef(null);
  const controlMenuRef = useRef(null);
  const settingsMenuRef = useRef(null);
  const userMenuRef = useRef(null);
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
  const rrhhOptions = RRHH_SECTIONS;
  const controlOptions = [
    { label: 'Centro de control', path: '/control/centro' },
    { label: 'Analitica ejecutiva', path: '/control/analitica' },
    { label: 'Eventos operativos', path: '/control/eventos' },
    { label: 'Bitacora ejecutiva', path: '/control/bitacora' },
  ];
  const settingsOptions = getVisibleSettingsSections(user);
  const defaultSettingsPath = getDefaultSettingsPath(user);
  const isOperationalRole = canCreateMaintenanceNotices(user);
  const operationalBrowseOptions = [
    { label: 'Notificaciones de Trabajo', path: '/tasks' },
    { label: 'Indicadores', path: '/indicadores' },
    { label: 'Gestion de OT', path: '/pmp/gestion-ot' },
    { label: 'Plan de mantenimiento - Km', path: '/pmp/km' },
    { label: 'Equipos', path: '/pmp/equipos' },
    { label: 'Historial de OTs', path: '/pmp/historial-ot' },
    { label: 'RRHH', path: '/rrhh/personal-propio' },
    { label: 'Materiales', path: '/materiales' },
  ];

  const isActive = (path) => location.pathname === path;
  const isInSection = (prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`);
  const isInAnySection = (paths = []) => paths.some((path) => isInSection(path));
  const navLinkClass = (path, mode = 'exact') => `nav-link ${mode === 'section' ? (isInSection(path) ? 'active' : '') : (isActive(path) ? 'active' : '')}`;
  const roleColor = ROLE_COLORS[user?.role] || '#6b7280';
  const userInitial = String(user?.full_name || user?.username || 'U').trim().charAt(0).toUpperCase() || 'U';
  const mobileLinks = isOperationalRole
    ? [
      { label: 'Inicio', path: '/' },
      { label: 'Indicadores', path: '/indicadores' },
      { label: 'Avisos', path: '/pmp/avisos' },
      { label: 'Mis registros', path: '/worklogs' },
      { label: 'Consulta OT', path: '/pmp/gestion-ot' },
      { label: 'Equipos', path: '/pmp/equipos' },
    ]
    : [
      { label: 'Dashboard', path: '/' },
      { label: 'Indicadores', path: '/indicadores' },
      ...(hasMinRole('PLANNER') ? [{ label: 'Control', path: '/control/centro' }] : []),
      { label: 'Notificaciones', path: '/tasks' },
      { label: 'Registros', path: '/worklogs' },
      { label: 'PMP', path: '/pmp', children: pmpOptions },
      { label: 'RRHH', path: '/rrhh/personal-propio' },
      { label: 'Materiales', path: '/materiales' },
      ...(hasMinRole('ENCARGADO') ? [{ label: 'Usuarios', path: '/users' }] : []),
      ...(hasMinRole('PLANNER') ? [{ label: 'Configuraciones', path: defaultSettingsPath }] : []),
    ];
  const operationalBrowseActive = isInAnySection(['/tasks', '/indicadores', '/pmp/gestion-ot', '/pmp/km', '/pmp/equipos', '/pmp/historial-ot', '/rrhh', '/materiales']);

  useEffect(() => {
    setOpenMenu(null);
    setMobileSection(null);
  }, [location.pathname]);

  useEffect(() => {
    const handleConflict = (event) => {
      setSharedDocAlert({
        key: event.detail?.key || '',
        message: event.detail?.message || 'Hay cambios nuevos guardados por otro usuario. Recarga la pantalla antes de seguir editando.',
      });
    };
    window.addEventListener(SHARED_DOCUMENT_CONFLICT_EVENT, handleConflict);
    return () => window.removeEventListener(SHARED_DOCUMENT_CONFLICT_EVENT, handleConflict);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      const menuRefs = [
        { key: 'mobile', ref: mobileMenuRef },
        { key: 'pmp', ref: pmpMenuRef },
        { key: 'rrhh', ref: rrhhMenuRef },
        { key: 'control', ref: controlMenuRef },
        { key: 'settings', ref: settingsMenuRef },
        { key: 'user', ref: userMenuRef },
      ];
      const clickedInsideKnownMenu = menuRefs.some(({ ref }) => ref.current && ref.current.contains(target));
      if (!clickedInsideKnownMenu) {
        setOpenMenu(null);
        setMobileSection(null);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setMobileSection(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toggleMenu = (menuKey) => {
    setOpenMenu((current) => (current === menuKey ? null : menuKey));
  };

  const closeMenus = () => {
    setOpenMenu(null);
    setMobileSection(null);
  };

  return (
    <div className="App">
      <nav className="navbar">
        <div className="navbar-container">
          <div className="navbar-main">
            <Link to="/" className="navbar-brand">Mantenimiento</Link>
            <div className="mobile-nav">
              <details className="mobile-nav-details" open={openMenu === 'mobile'} ref={mobileMenuRef}>
                <summary
                  className="mobile-nav-summary"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleMenu('mobile');
                  }}
                >
                  Menu
                </summary>
                <div className="mobile-nav-menu">
                  {mobileLinks.map((item) => {
                    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
                    if (hasChildren) {
                      const expanded = mobileSection === item.label;
                      return (
                        <div key={item.label} className="mobile-nav-group">
                          <button
                            type="button"
                            className={`mobile-nav-item mobile-nav-group-trigger ${isInSection(item.path) ? 'active' : ''}`}
                            onClick={() => setMobileSection((current) => (current === item.label ? null : item.label))}
                            aria-expanded={expanded}
                          >
                            <span>{item.label}</span>
                            <span className="mobile-nav-caret">{expanded ? '-' : '+'}</span>
                          </button>
                          {expanded && (
                            <div className="mobile-nav-submenu">
                              {item.children.map((child) => (
                                <Link key={child.path} to={child.path} className={`mobile-nav-subitem ${isActive(child.path) ? 'active' : ''}`} onClick={closeMenus}>
                                  {child.label}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <Link key={item.path} to={item.path} className={`mobile-nav-item ${isActive(item.path) ? 'active' : ''}`} onClick={closeMenus}>
                        {item.label}
                      </Link>
                    );
                  })}
                  <div className="mobile-nav-divider" />
                  <Link to="/change-password" className="mobile-nav-item" onClick={closeMenus}>
                    Cambiar contraseña
                  </Link>
                  <button
                    type="button"
                    className="mobile-nav-item mobile-nav-logout"
                    onClick={() => {
                      closeMenus();
                      logout();
                    }}
                  >
                    Cerrar sesión
                  </button>
                </div>
              </details>
            </div>
            <ul className="navbar-nav">
              {isOperationalRole ? (
                <>
                  <li><Link to="/" className={navLinkClass('/')}>Dashboard</Link></li>
                  <li><Link to="/indicadores" className={navLinkClass('/indicadores')}>Indicadores</Link></li>
                  <li><Link to="/pmp/avisos" className={navLinkClass('/pmp/avisos')}>Avisos de Mantenimiento</Link></li>
                  <li><Link to="/worklogs" className={navLinkClass('/worklogs')}>Mis Registros</Link></li>
                  <li className="nav-dropdown">
                    <details className="nav-dropdown-details" open={openMenu === 'pmp'} ref={pmpMenuRef}>
                      <summary
                        className={`nav-link ${operationalBrowseActive ? 'active' : ''} nav-dropdown-trigger`}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleMenu('pmp');
                        }}
                      >
                        Consulta <span style={{ fontSize: '.7rem' }}>+</span>
                      </summary>
                      <div className="nav-dropdown-menu">
                        {operationalBrowseOptions.map((option) => (
                          <Link key={option.label} to={option.path} className="nav-dropdown-item" onClick={closeMenus}>
                            {option.label}
                          </Link>
                        ))}
                      </div>
                    </details>
                  </li>
                </>
              ) : (
                <>
                  <li><Link to="/" className={navLinkClass('/')}>Dashboard</Link></li>
                  <li><Link to="/indicadores" className={navLinkClass('/indicadores')}>Indicadores</Link></li>
                  <li><Link to="/tasks" className={navLinkClass('/tasks', 'section')}>Notificaciones de Trabajo</Link></li>
                  <li><Link to="/worklogs" className={navLinkClass('/worklogs')}>Registros</Link></li>
                  <li className="nav-dropdown">
                    <details className="nav-dropdown-details" open={openMenu === 'pmp'} ref={pmpMenuRef}>
                      <summary
                        className={`${navLinkClass('/pmp', 'section')} nav-dropdown-trigger`}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleMenu('pmp');
                        }}
                      >
                        PMP <span style={{ fontSize: '.7rem' }}>+</span>
                      </summary>
                      <div className="nav-dropdown-menu">
                        {pmpOptions.map((option) => option.path ? (
                          <Link key={option.label} to={option.path} className="nav-dropdown-item" onClick={closeMenus}>
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
                  <li className="nav-dropdown">
                    <details className="nav-dropdown-details" open={openMenu === 'control'} ref={controlMenuRef}>
                      <summary
                        className={`${navLinkClass('/control', 'section')} nav-dropdown-trigger`}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleMenu('control');
                        }}
                      >
                        Control <span style={{ fontSize: '.7rem' }}>+</span>
                      </summary>
                      <div className="nav-dropdown-menu">
                        {controlOptions.map((option) => (
                          <Link key={option.path} to={option.path} className="nav-dropdown-item" onClick={closeMenus}>
                            {option.label}
                          </Link>
                        ))}
                      </div>
                    </details>
                  </li>
                  <li className="nav-dropdown">
                    <details className="nav-dropdown-details" open={openMenu === 'rrhh'} ref={rrhhMenuRef}>
                      <summary
                        className={`${navLinkClass('/rrhh', 'section')} nav-dropdown-trigger`}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleMenu('rrhh');
                        }}
                      >
                        Gestion de RRHH <span style={{ fontSize: '.7rem' }}>+</span>
                      </summary>
                      <div className="nav-dropdown-menu">
                        {rrhhOptions.map((option) => (
                          <Link key={option.path} to={option.path} className="nav-dropdown-item" onClick={closeMenus}>
                            {option.label}
                          </Link>
                        ))}
                      </div>
                    </details>
                  </li>
                  <li><Link to="/materiales" className={navLinkClass('/materiales')}>Gestion de Materiales</Link></li>
                  {hasMinRole('PLANNER') && (
                    <li className="nav-dropdown">
                      <details className="nav-dropdown-details" open={openMenu === 'settings'} ref={settingsMenuRef}>
                        <summary
                          className={`${navLinkClass('/settings', 'section')} nav-dropdown-trigger`}
                          onClick={(e) => {
                            e.preventDefault();
                            toggleMenu('settings');
                          }}
                        >
                          Configuraciones <span style={{ fontSize: '.7rem' }}>+</span>
                        </summary>
                        <div className="nav-dropdown-menu">
                          {settingsOptions.map((option) => (
                            <Link key={option.label} to={option.path} className="nav-dropdown-item" onClick={closeMenus}>
                              {option.label}
                            </Link>
                          ))}
                        </div>
                      </details>
                    </li>
                  )}
                  {hasMinRole('ENCARGADO') && (
                    <li><Link to="/users" className={navLinkClass('/users')}>Usuarios</Link></li>
                  )}
                </>
              )}
            </ul>
          </div>

          <div className="navbar-user-panel">
            <div className="navbar-user-meta">
              <div className="navbar-user-name">{user?.full_name}</div>
              <div className="navbar-user-role" style={{ color: roleColor }}>{user?.role}</div>
            </div>
            <div className="nav-user-menu-wrapper">
              <details className="nav-user-menu-details" open={openMenu === 'user'} ref={userMenuRef}>
                <summary
                  className="navbar-avatar-summary"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleMenu('user');
                  }}
                >
                  {userInitial}
                </summary>
                <div className="nav-user-menu">
                  <Link to="/change-password" className="nav-user-menu-item" onClick={closeMenus}>
                    Cambiar contrasena
                  </Link>
                  <button onClick={() => { closeMenus(); logout(); }} className="nav-user-menu-item nav-user-menu-item-danger">
                    Cerrar sesion
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
      </nav>

      {sharedDocAlert && (
        <div className="shared-document-alert" role="alert">
          <div>
            <strong>Conflicto de guardado</strong>
            <span>{sharedDocAlert.message}</span>
          </div>
          <button type="button" onClick={() => setSharedDocAlert(null)}>Cerrar</button>
        </div>
      )}

      <div className="container">
        <Routes>
          <Route path="/" element={<PrivateRoute><Dashboard user={user} /></PrivateRoute>} />
          <Route path="/indicadores" element={<PrivateRoute minRole="OPERADOR"><Indicators /></PrivateRoute>} />
          <Route path="/control/centro" element={<PrivateRoute minRole="PLANNER"><ControlCenter /></PrivateRoute>} />
          <Route path="/control/analitica" element={<PrivateRoute minRole="PLANNER"><MaintenanceAnalytics /></PrivateRoute>} />
          <Route path="/control/eventos" element={<PrivateRoute minRole="PLANNER"><OperationalEvents /></PrivateRoute>} />
          <Route path="/control/bitacora" element={<PrivateRoute minRole="PLANNER"><ExecutiveAudit /></PrivateRoute>} />
          <Route path="/tasks" element={<PrivateRoute><WorkNotifications user={user} /></PrivateRoute>} />
          <Route path="/tasks/:taskId" element={<PrivateRoute><TaskDetail user={user} /></PrivateRoute>} />
          <Route path="/worklogs" element={<PrivateRoute><WorkLogs user={user} /></PrivateRoute>} />
          <Route path="/rrhh" element={<Navigate to="/rrhh/personal-propio" replace />} />
          <Route path="/rrhh/personal-propio" element={<PrivateRoute minRole="OPERADOR"><RrhhManagement personTypeFilter="propio" /></PrivateRoute>} />
          <Route path="/rrhh/personal-tercero" element={<PrivateRoute minRole="OPERADOR"><RrhhManagement personTypeFilter="tercero" /></PrivateRoute>} />
          <Route path="/rrhh/asistencia" element={<PrivateRoute minRole="OPERADOR"><AttendanceManagement /></PrivateRoute>} />
          <Route path="/rrhh/asistencia/historial" element={<PrivateRoute minRole="OPERADOR"><AttendanceHistory /></PrivateRoute>} />
          <Route path="/materiales" element={<PrivateRoute minRole="OPERADOR"><MaterialsManagement /></PrivateRoute>} />
          <Route path="/pmp/equipos" element={<PrivateRoute minRole="OPERADOR"><PmpEquipos /></PrivateRoute>} />
          <Route path="/pmp/fechas" element={<PrivateRoute minRole="OPERADOR"><PmpFechas /></PrivateRoute>} />
          <Route path="/pmp/amef" element={<PrivateRoute minRole="OPERADOR"><PmpAmef /></PrivateRoute>} />
          <Route path="/pmp/amef/matriz" element={<PrivateRoute minRole="OPERADOR"><PmpAmef matrixOnly /></PrivateRoute>} />
          <Route path="/pmp/calendario" element={<PrivateRoute minRole="OPERADOR"><PmpCalendario /></PrivateRoute>} />
          <Route path="/pmp/km" element={<PrivateRoute minRole="OPERADOR"><PmpKm /></PrivateRoute>} />
          <Route path="/pmp/bajas" element={<PrivateRoute minRole="OPERADOR"><PmpBajas /></PrivateRoute>} />
          <Route path="/pmp/intercambios/historial" element={<PrivateRoute minRole="OPERADOR"><PmpIntercambiosHistorial /></PrivateRoute>} />
          <Route path="/pmp/bajas/historial" element={<PrivateRoute minRole="OPERADOR"><PmpBajasHistorial /></PrivateRoute>} />
          <Route path="/pmp/gestion-ot" element={<PrivateRoute minRole="OPERADOR"><PmpGestionOt /></PrivateRoute>} />
          <Route path="/pmp/avisos" element={<PrivateRoute minRole="OPERADOR"><PmpMaintenanceNotices /></PrivateRoute>} />
          <Route path="/pmp/historial-ot" element={<PrivateRoute minRole="OPERADOR"><PmpHistorialOt /></PrivateRoute>} />
          <Route path="/pmp/paquetes" element={<PrivateRoute minRole="OPERADOR"><PmpPaquetesMantenimiento /></PrivateRoute>} />
          <Route path="/settings/listas-desplegables" element={<PrivateRoute minRole="PLANNER"><SettingsDropdownLists /></PrivateRoute>} />
          <Route path="/settings/ordenes-trabajo" element={<PrivateRoute minRole="INGENIERO"><SettingsOtOrders /></PrivateRoute>} />
          <Route path="/settings/contadores" element={<PrivateRoute minRole="INGENIERO"><SettingsCounters /></PrivateRoute>} />
          <Route path="/settings/formato-pdf-ot" element={<PrivateRoute minRole="PLANNER"><SettingsPdfFormat /></PrivateRoute>} />
          <Route path="/settings/importaciones/:section" element={<PrivateRoute minRole="INGENIERO"><SettingsImports /></PrivateRoute>} />
          <Route path="/users" element={<PrivateRoute minRole="ENCARGADO"><UserManagement /></PrivateRoute>} />
          <Route path="/change-password" element={<PrivateRoute><ChangePassword /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>

      <nav className="bottom-nav">
        <div className="bottom-nav-items">
          {isOperationalRole ? (
            <>
              <Link to="/" className={`bottom-nav-item ${isActive('/') ? 'active' : ''}`}>
                <span className="bottom-nav-icon">IN</span><span className="bottom-nav-label">Inicio</span>
              </Link>
              <Link to="/pmp/avisos" className={`bottom-nav-item ${isActive('/pmp/avisos') ? 'active' : ''}`}>
                <span className="bottom-nav-icon">AV</span><span className="bottom-nav-label">Avisos</span>
              </Link>
              <Link to="/worklogs" className={`bottom-nav-item ${isActive('/worklogs') ? 'active' : ''}`}>
                <span className="bottom-nav-icon">RG</span><span className="bottom-nav-label">Registros</span>
              </Link>
              <Link to="/pmp/gestion-ot" className={`bottom-nav-item ${operationalBrowseActive ? 'active' : ''}`}>
                <span className="bottom-nav-icon">CO</span><span className="bottom-nav-label">Consulta</span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/" className={`bottom-nav-item ${isActive('/') ? 'active' : ''}`}>
                <span className="bottom-nav-icon">IN</span><span className="bottom-nav-label">Inicio</span>
              </Link>
              {hasMinRole('PLANNER') && (
                <Link to="/control/centro" className={`bottom-nav-item ${isInSection('/control') ? 'active' : ''}`}>
                  <span className="bottom-nav-icon">CT</span><span className="bottom-nav-label">Control</span>
                </Link>
              )}
              <Link to="/tasks" className={`bottom-nav-item ${isActive('/tasks') ? 'active' : ''}`}>
                <span className="bottom-nav-icon">OT</span><span className="bottom-nav-label">Trabajo</span>
              </Link>
              <Link to="/worklogs" className={`bottom-nav-item ${isActive('/worklogs') ? 'active' : ''}`}>
                <span className="bottom-nav-icon">HH</span><span className="bottom-nav-label">Registros</span>
              </Link>
              <Link to="/rrhh/asistencia" className={`bottom-nav-item ${isInSection('/rrhh/asistencia') ? 'active' : ''}`}>
                  <span className="bottom-nav-icon">AS</span><span className="bottom-nav-label">Asistencia</span>
              </Link>
              {hasMinRole('ENCARGADO') && (
                <Link to="/users" className={`bottom-nav-item ${isActive('/users') ? 'active' : ''}`}>
                  <span className="bottom-nav-icon">US</span><span className="bottom-nav-label">Usuarios</span>
                </Link>
              )}
            </>
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
