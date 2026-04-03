import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Branches from './pages/Branches';
import Settings from './pages/Settings';
import UsersPage from './pages/Users';
import SyncStatus from './pages/SyncStatus';
import VersionLogs from './pages/VersionLogs';
import Reports from './pages/Reports';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import AdminLayout from './components/AdminLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import SoftwareUpdates from './pages/SoftwareUpdates';
import LicenseManager from './pages/LicenseManager';
import Analytics from './pages/Analytics';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <Router>
            <AuthWrapper />
            <Toaster position="top-right" />
          </Router>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AuthWrapper() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <div className="flex h-screen items-center justify-center font-black">جاري التحقق من الجلسة...</div>;
  
  if (!user) {
    if (location.pathname === '/forgot-password') {
      return <ForgotPassword />;
    }
    return (
      <Routes location={location}>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/branches" element={<Branches />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/sync-status" element={<SyncStatus />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/financial" element={<Reports />} />
          <Route path="/reports/movements" element={<Reports />} />
          <Route path="/reports/requests" element={<Reports />} />
          <Route path="/reports/payments" element={<Reports />} />
          <Route path="/reports/sales" element={<Reports />} />
          <Route path="/reports/installments" element={<Reports />} />
          <Route path="/reports/inventory" element={<Reports />} />
          <Route path="/reports/simcards" element={<Reports />} />
          <Route path="/reports/price-history" element={<Reports />} />
          <Route path="/version-logs" element={<VersionLogs />} />
          <Route path="/software-updates" element={<SoftwareUpdates />} />
          <Route path="/license-manager" element={<LicenseManager />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </AdminLayout>
  );
}

export default App;
