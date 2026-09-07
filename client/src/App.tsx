import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Layout from '@/components/layout/Layout';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import DashboardPage from '@/pages/DashboardPage';
import DockerPage from '@/pages/DockerPage';
import DockerContainersPage from '@/pages/DockerContainersPage';
import DockerContainerDetailPage from '@/pages/DockerContainerDetailPage';
import DockerImagesPage from '@/pages/DockerImagesPage';
import DockerComposePage from '@/pages/DockerComposePage';
import TemplatesPage from '@/pages/TemplatesPage';
import MonitoringPage from '@/pages/MonitoringPage';
import AlertsPage from '@/pages/AlertsPage';
import NetworkPage from '@/pages/NetworkPage';
import FirewallPage from '@/pages/FirewallPage';
import BillingPage from '@/pages/BillingPage';
import SettingsPage from '@/pages/SettingsPage';
import AdminPage from '@/pages/AdminPage';
import NodeSystemPage from '@/pages/NodeSystemPage';
import ActivateLicense from '@/pages/ActivateLicense';

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
      <Route path="/activate-license" element={<ActivateLicense />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
      <Route path="/docker" element={<ProtectedRoute><Layout><DockerPage /></Layout></ProtectedRoute>} />
      <Route path="/docker/containers" element={<ProtectedRoute><Layout><DockerContainersPage /></Layout></ProtectedRoute>} />
      <Route path="/docker/containers/new" element={<ProtectedRoute><Layout><DockerContainersPage /></Layout></ProtectedRoute>} />
      <Route path="/docker/containers/:id" element={<ProtectedRoute><Layout><DockerContainerDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/docker/images" element={<ProtectedRoute><Layout><DockerImagesPage /></Layout></ProtectedRoute>} />
      <Route path="/docker/compose" element={<ProtectedRoute><Layout><DockerComposePage /></Layout></ProtectedRoute>} />
      <Route path="/templates" element={<ProtectedRoute><Layout><TemplatesPage /></Layout></ProtectedRoute>} />
      <Route path="/monitoring" element={<ProtectedRoute><Layout><MonitoringPage /></Layout></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute><Layout><AlertsPage /></Layout></ProtectedRoute>} />
      <Route path="/network" element={<ProtectedRoute><Layout><NetworkPage /></Layout></ProtectedRoute>} />
      <Route path="/firewall" element={<ProtectedRoute><Layout><FirewallPage /></Layout></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><Layout><BillingPage /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute adminOnly><Layout><AdminPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/node-agents" element={<ProtectedRoute adminOnly><Layout><NodeSystemPage /></Layout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default App;
