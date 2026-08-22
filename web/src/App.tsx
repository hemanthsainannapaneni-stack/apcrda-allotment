import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';

import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import CaseDetail from './pages/CaseDetail';
import Applications from './pages/Applications';
import NewApplication from './pages/NewApplication';
import LandInventory from './pages/LandInventory';
import Payments from './pages/Payments';
import BuildingPermits from './pages/BuildingPermits';
import Grievances from './pages/Grievances';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Help from './pages/Help';
import AdminUsers from './pages/AdminUsers';
import AdminSettings from './pages/AdminSettings';
import AdminAudit from './pages/AdminAudit';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading portal…" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cases/new" element={<NewApplication />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/applications/:tab" element={<Applications />} />
        {/* All cases, New applications and Waiting on me are tabs of
            Applications now — old links land on the right one. */}
        <Route path="/cases" element={<LegacyCasesLink />} />
        <Route path="/queue" element={<Navigate to="/applications/queue" replace />} />
        <Route path="/land-inventory" element={<LandInventory />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/building-permits" element={<BuildingPermits />} />
        {/* The module used to be called "Building work" — old links still land. */}
        <Route path="/construction" element={<Navigate to="/building-permits" replace />} />
        <Route path="/grievances" element={<Grievances />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/help" element={<Help />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/audit" element={<AdminAudit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

/** /cases keeps its filters on the way to /applications — ?q=, ?status= and so on. */
function LegacyCasesLink() {
  const { search } = useLocation();
  return <Navigate to={`/applications${search}`} replace />;
}
