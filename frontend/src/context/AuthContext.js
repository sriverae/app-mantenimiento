import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, logout as apiLogout, tokenStorage } from '../services/api';
import { ROLE_HIERARCHY } from '../utils/roleAccess';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = tokenStorage.getUser();
    if (saved && tokenStorage.getAccess()) setUser(saved);
    setLoading(false);
  }, []);

  const login = useCallback(async (username, password) => {
    const userData = await apiLogin(username, password);
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const hasRole = useCallback((roles) => {
    if (!user) return false;
    return Array.isArray(roles) ? roles.includes(user.role) : user.role === roles;
  }, [user]);

  const hasMinRole = useCallback((minRole) => {
    if (!user) return false;
    return (ROLE_HIERARCHY[user.role] || 0) >= (ROLE_HIERARCHY[minRole] || 0);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, hasMinRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe estar dentro de AuthProvider');
  return ctx;
};
