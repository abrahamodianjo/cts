import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { LiveBoardPage } from './pages/LiveBoardPage';
import { LocationsListPage } from './pages/LocationsListPage';
import { LocationFormPage } from './pages/LocationFormPage';
import { LocationDetailPage } from './pages/LocationDetailPage';
import { AppLayout } from './layout/AppLayout';
import { ProtectedRoute } from './auth/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<LiveBoardPage />} />
          <Route path="/locations" element={<LocationsListPage />} />
          <Route path="/locations/new" element={<LocationFormPage />} />
          <Route path="/locations/:id" element={<LocationDetailPage />} />
          <Route path="/locations/:id/edit" element={<LocationFormPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
