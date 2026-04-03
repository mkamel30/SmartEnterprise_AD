import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
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
import { SocketProvider } from './context/SocketContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import SoftwareUpdates from './pages/SoftwareUpdates';
import LicenseManager from './pages/LicenseManager';
import Analytics from './pages/Analytics';
import SyncMonitoring from './pages/SyncMonitoring';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

const SUPER_ADMIN_ROUTES = [
  '/', '/branches', '/users', '/analytics', '/sync-status', '/sync-monitoring',
  '/reports', '/reports/financial', '/reports/movements', '/reports/requests',
  '/reports/payments', '/reports/sales', '/reports/installments',
  '/reports/inventory', '/reports/simcards', '/reports/price-history',
  '/version-logs', '/software-updates', '/license-manager', '/settings'
];

const BRANCH_ADMIN_ROUTES = [
  '/', '/analytics', '/sync-status', '/sync-monitoring',
  '/reports', '/reports/financial', '/reports/movements', '/reports/requests',
  '/reports/payments', '/reports/sales', '/reports/installments',
  '/reports/inventory', '/reports/simcards', '/reports/price-history',
  '/settings'
];

function canAccessRoute(role: string | undefined, path: string): boolean {
  if (!role) return false;
  if (role === 'SUPER_ADMIN') return SUPER_ADMIN_ROUTES.some(r => path === r || path.startsWith(r + '/'));
  if (role === 'BRANCH_ADMIN') return BRANCH_ADMIN_ROUTES.some(r => path === r || path.startsWith(r + '/'));
  return path === '/' || path === '/settings' || path.startsWith('/reports');
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <SocketProvider>
            <Router>
              <AppRoutes />
              <Toaster position="top-right" />
            </Router>
          </SocketProvider>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppRoutes() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white font-black text-sm">جاري التحقق من الجلسة...</p>
      </div>
    </div>
  );

  if (!user) {
    return (
      <Routes location={location}>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const accessibleRoutes = [
    { path: '/', element: <Dashboard /> },
    { path: '/branches', element: <Branches /> },
    { path: '/users', element: <UsersPage /> },
    { path: '/analytics', element: <Analytics /> },
    { path: '/sync-status', element: <SyncStatus /> },
    { path: '/sync-monitoring', element: <SyncMonitoring /> },
    { path: '/reports', element: <Reports /> },
    { path: '/reports/financial', element: <Reports /> },
    { path: '/reports/movements', element: <Reports /> },
    { path: '/reports/requests', element: <Reports /> },
    { path: '/reports/payments', element: <Reports /> },
    { path: '/reports/sales', element: <Reports /> },
    { path: '/reports/installments', element: <Reports /> },
    { path: '/reports/inventory', element: <Reports /> },
    { path: '/reports/simcards', element: <Reports /> },
    { path: '/reports/price-history', element: <Reports /> },
    { path: '/version-logs', element: <VersionLogs /> },
    { path: '/software-updates', element: <SoftwareUpdates /> },
    { path: '/license-manager', element: <LicenseManager /> },
    { path: '/settings', element: <Settings /> },
  ].filter(r => canAccessRoute(user?.role, r.path));

  return (
    <AdminLayout>
      <Routes>
        {accessibleRoutes.map(r => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminLayout>
  );
}

export default App;
