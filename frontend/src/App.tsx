import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Branches from './pages/Branches';
import Settings from './pages/Settings';
import UsersPage from './pages/Users';
import Customers from './pages/Customers';
import Warehouse from './pages/Warehouse';
import Reports from './pages/Reports';
import SyncStatus from './pages/SyncStatus';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import AdminLayout from './components/AdminLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

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
          <Route path="/customers" element={<Customers />} />
          <Route path="/warehouse" element={<Warehouse />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/sync-status" element={<SyncStatus />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </AdminLayout>
  );
}

export default App;
