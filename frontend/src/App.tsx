import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Branches from './pages/Branches';
import Settings from './pages/Settings';
import UsersPage from './pages/Users';
import Warehouse from './pages/Warehouse';
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
import AdminStore from './pages/AdminStore';
import SoftwareUpdates from './pages/SoftwareUpdates';
import LicenseManager from './pages/LicenseManager';
import StockMovements from './pages/StockMovements';
import MaintenanceRequests from './pages/MaintenanceRequests';
import Payments from './pages/Payments';
import InventoryOverview from './pages/InventoryOverview';
import PriceHistory from './pages/PriceHistory';

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
    return <Login />;
  }

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/branches" element={<Branches />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/admin-store" element={<AdminStore />} />
          <Route path="/warehouse" element={<Warehouse />} />
          <Route path="/sync-status" element={<SyncStatus />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/movements" element={<StockMovements />} />
          <Route path="/reports/requests" element={<MaintenanceRequests />} />
          <Route path="/reports/payments" element={<Payments />} />
          <Route path="/reports/inventory" element={<InventoryOverview />} />
          <Route path="/reports/price-history" element={<PriceHistory />} />
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
