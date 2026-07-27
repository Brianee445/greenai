import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/providers/AuthProvider';
import { AuthModalProvider } from './auth/providers/AuthModalProvider';
import { SubscriptionProvider } from './subscriptions/providers/SubscriptionProvider';
import { PublicRoute } from './auth/middleware/PublicRoute';
import { AdminRoute } from './admin/components/AdminRoute';
import { AdminLayout } from './admin/components/AdminLayout';
import { NotImplemented } from './admin/components/NotImplemented';
import { ErrorBoundary } from './admin/components/ErrorBoundary';
import { AdminLoginPage } from './admin/pages/AdminLoginPage';
import { LoginPage } from './auth/pages/LoginPage';
import { RegisterPage } from './auth/pages/RegisterPage';
import { ForgotPasswordPage } from './auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from './auth/pages/ResetPasswordPage';
import { PricingPage } from './subscriptions/pages/PricingPage';
import { BillingPage } from './subscriptions/pages/BillingPage';
import { DashboardPage } from './admin/pages/DashboardPage';
import { UsersPage } from './admin/pages/UsersPage';
import { UserDetailPage } from './admin/pages/UserDetailPage';
import { PaymentsPage } from './admin/pages/PaymentsPage';
import { RevenuePage } from './admin/pages/RevenuePage';
import { SubscriptionsPage } from './admin/pages/SubscriptionsPage';
import { SubscriptionDetailPage } from './admin/pages/SubscriptionDetailPage';
import { UsagePage } from './admin/pages/UsagePage';
import { ConversationsPage } from './admin/pages/ConversationsPage';
import { ConversationDetailPage } from './admin/pages/ConversationDetailPage';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AuthModalProvider>
          <SubscriptionProvider>
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
              <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
              <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/" element={<App />} />
              <Route path="/ops/login" element={<AdminLoginPage />} />
              <Route
                path="/ops"
                element={
                  <AdminRoute>
                    <ErrorBoundary>
                      <AdminLayout />
                    </ErrorBoundary>
                  </AdminRoute>
                }
              >
                <Route index element={<Navigate to="/ops/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="users/:id" element={<UserDetailPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="revenue" element={<RevenuePage />} />
                <Route path="subscriptions" element={<SubscriptionsPage />} />
                <Route path="subscriptions/:id" element={<SubscriptionDetailPage />} />
                <Route path="usage" element={<UsagePage />} />
                <Route path="conversations" element={<ConversationsPage />} />
                <Route path="conversations/:id" element={<ConversationDetailPage />} />
                <Route path="prompts" element={<NotImplemented name="Prompt Analytics" phase="14" />} />
                <Route path="files" element={<NotImplemented name="File Analytics" phase="14" />} />
                <Route path="features" element={<NotImplemented name="Feature Flags" phase="10" />} />
                <Route path="audit" element={<NotImplemented name="Audit Logs" phase="11" />} />
                <Route path="health" element={<NotImplemented name="System Health" phase="13" />} />
                <Route path="*" element={<Navigate to="/ops/dashboard" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </SubscriptionProvider>
        </AuthModalProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
