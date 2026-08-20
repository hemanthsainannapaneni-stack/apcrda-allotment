import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';

import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import CaseDetail from './pages/CaseDetail';
import Applications from './pages/Applications';
import NewApplication from './pages/NewApplication';
import CommitteeQueue from './pages/CommitteeQueue';
import LandInventory from './pages/LandInventory';
import Payments from './pages/Payments';
import Construction from './pages/Construction';
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
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/new" element={<NewApplication />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/queue" element={<CommitteeQueue />} />
        <Route path="/land-inventory" element={<LandInventory />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/construction" element={<Construction />} />
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
