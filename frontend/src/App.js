import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import NewTask from './pages/NewTask';
import TaskDetail from './pages/TaskDetail';
import WorkLogs from './pages/WorkLogs';
import Login from './pages/Login';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Verificar si hay usuario guardado en localStorage
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (user) => {
    setCurrentUser(user);
    localStorage.setItem('currentUser', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div className="App">
        <nav className="navbar">
          <div className="navbar-container">
            <Link to="/" className="navbar-brand">
              🔧 Mantenimiento
            </Link>
            <ul className="navbar-nav">
              <li>
                <Link to="/" className="nav-link">Dashboard</Link>
              </li>
              <li>
                <Link to="/tasks" className="nav-link">Tareas</Link>
              </li>
              <li>
                <Link to="/worklogs" className="nav-link">Mis Registros</Link>
              </li>
              <li>
                <button onClick={handleLogout} className="btn btn-sm btn-secondary">
                  Salir ({currentUser.full_name})
                </button>
              </li>
            </ul>
          </div>
        </nav>

        <div className="container">
          <Routes>
            <Route path="/" element={<Dashboard user={currentUser} />} />
            <Route path="/tasks" element={<Tasks user={currentUser} />} />
            <Route path="/tasks/new" element={<NewTask user={currentUser} />} />
            <Route path="/tasks/:taskId" element={<TaskDetail user={currentUser} />} />
            <Route path="/worklogs" element={<WorkLogs user={currentUser} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>

        {/* Navegación inferior para móvil */}
        <nav className="bottom-nav">
          <div className="bottom-nav-items">
            <Link to="/" className="bottom-nav-item">
              <span className="bottom-nav-icon">📊</span>
              <span>Dashboard</span>
            </Link>
            <Link to="/tasks" className="bottom-nav-item">
              <span className="bottom-nav-icon">📋</span>
              <span>Tareas</span>
            </Link>
            <Link to="/tasks/new" className="bottom-nav-item">
              <span className="bottom-nav-icon">➕</span>
              <span>Nueva</span>
            </Link>
            <Link to="/worklogs" className="bottom-nav-item">
              <span className="bottom-nav-icon">⏱️</span>
              <span>Registros</span>
            </Link>
          </div>
        </nav>
      </div>
    </Router>
  );
}

export default App;
