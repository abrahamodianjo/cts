import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, DASHBOARD_ROLES } from './AuthContext';

export function ProtectedRoute() {
  const { user } = useAuth();

  if (!user || !DASHBOARD_ROLES.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
