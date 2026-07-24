import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import Foundation from '@/pages/Foundation';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminUsers from '@/pages/admin/Users';
import AdminRoles from '@/pages/admin/Roles';
import AdminPermissions from '@/pages/admin/Permissions';
import AdminSiteAccess from '@/pages/admin/SiteAccess';
import AdminSecurity from '@/pages/admin/SecurityStatus';
import AdminConnectors from '@/pages/admin/Connectors';
import AdminImports from '@/pages/admin/ImportHistory';
import AdminSync from '@/pages/admin/SyncStatus';
import AdminReconciliation from '@/pages/admin/ReconciliationQueue';
import AdminExceptions from '@/pages/admin/Exceptions';
import AdminAccountMapping from '@/pages/admin/AccountMapping';
import AdminSourceMapping from '@/pages/admin/SourceMapping';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<Foundation />} />
      <Route element={<AdminLayout />}>
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/roles" element={<AdminRoles />} />
        <Route path="/admin/permissions" element={<AdminPermissions />} />
        <Route path="/admin/site-access" element={<AdminSiteAccess />} />
        <Route path="/admin/security" element={<AdminSecurity />} />
        <Route path="/admin/connectors" element={<AdminConnectors />} />
        <Route path="/admin/imports" element={<AdminImports />} />
        <Route path="/admin/sync" element={<AdminSync />} />
        <Route path="/admin/reconciliation" element={<AdminReconciliation />} />
        <Route path="/admin/exceptions" element={<AdminExceptions />} />
        <Route path="/admin/account-mapping" element={<AdminAccountMapping />} />
        <Route path="/admin/source-mapping" element={<AdminSourceMapping />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App