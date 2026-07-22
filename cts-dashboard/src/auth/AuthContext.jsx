import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api, getStoredUser, storeSession, clearSession } from '../api/client';

const AuthContext = createContext(null);

const DASHBOARD_ROLES = ['admin', 'manager'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    function handleExpired() {
      setUser(null);
    }
    window.addEventListener('cts:session-expired', handleExpired);
    return () => window.removeEventListener('cts:session-expired', handleExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const loggedInUser = response.data.user;

    if (!DASHBOARD_ROLES.includes(loggedInUser.role)) {
      throw new Error('staff_not_allowed');
    }

    storeSession(response.data);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export { DASHBOARD_ROLES };
