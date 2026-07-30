import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import FloatingHomeButton from './components/FloatingHomeButton';
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
import AdminImportData from '@/pages/admin/ImportData';
import AdminSync from '@/pages/admin/SyncStatus';
import AdminReconciliation from '@/pages/admin/ReconciliationQueue';
import AdminExceptions from '@/pages/admin/Exceptions';
import AdminAccountMapping from '@/pages/admin/AccountMapping';
import AdminSourceMapping from '@/pages/admin/SourceMapping';
import AdminCalcRuns from '@/pages/admin/CalculationRuns';
import AdminFinancialResults from '@/pages/admin/FinancialResults';
import AdminKpiResults from '@/pages/admin/KpiResults';
import AdminCalcLineage from '@/pages/admin/CalculationLineage';
import AdminTaxResults from '@/pages/admin/TaxResults';
import AdminEngineStatus from '@/pages/admin/EngineStatus';
import Dashboard from '@/pages/Dashboard';
import Notifications from '@/pages/Notifications';
import AdminDashboardConfig from '@/pages/admin/DashboardConfig';
import AdminWidgetConfig from '@/pages/admin/WidgetConfig';
import AdminAlertRules from '@/pages/admin/AlertRules';
import AdminOwnerBriefRules from '@/pages/admin/OwnerBriefRules';
import AdminDashboardCache from '@/pages/admin/DashboardCache';
import AdminNotificationRules from '@/pages/admin/NotificationRules';
import Timeline from '@/pages/Timeline';
import Forecast from '@/pages/Forecast';
import Scenarios from '@/pages/Scenarios';
import Obligations from '@/pages/Obligations';
import AdminForecastConfig from '@/pages/admin/ForecastConfig';
import AdminForecastAssumptions from '@/pages/admin/ForecastAssumptions';
import AdminScenarioManagement from '@/pages/admin/ScenarioManagement';
import AdminTimelineConfig from '@/pages/admin/TimelineConfig';
import AdminSimulationRules from '@/pages/admin/SimulationRules';
import AdminForecastCache from '@/pages/admin/ForecastCache';
// Phase 09 — Executive Planning
import Goals from '@/pages/Goals';
import Initiatives from '@/pages/Initiatives';
import Scorecard from '@/pages/Scorecard';
import Roadmap from '@/pages/Roadmap';
import Risks from '@/pages/Risks';
import Opportunities from '@/pages/Opportunities';
import Decisions from '@/pages/Decisions';
import ExecutiveReports from '@/pages/ExecutiveReports';
import AdminGoalCategories from '@/pages/admin/GoalCategories';
import AdminInitiativeTemplates from '@/pages/admin/InitiativeTemplates';
import AdminReportTemplates from '@/pages/admin/ReportTemplates';
import AdminRiskRules from '@/pages/admin/RiskRules';
import AdminOpportunityRules from '@/pages/admin/OpportunityRules';
import AdminExecutiveSettings from '@/pages/admin/ExecutiveDashboardSettings';
import WeeklyReport from '@/pages/WeeklyReport';
import AdminWeeklyReportConfig from '@/pages/admin/WeeklyReportConfig';
import AISummary from '@/pages/AISummary';
import EnterpriseDashboard from '@/pages/EnterpriseDashboard';
import EnterpriseAnalytics from '@/pages/EnterpriseAnalytics';
import ComplianceCentre from '@/pages/ComplianceCentre';
import DocumentVault from '@/pages/DocumentVault';
import AdminOrganisations from '@/pages/admin/Organisations';
import AdminSites from '@/pages/admin/Sites';
import AdminEnterpriseRoles from '@/pages/admin/EnterpriseRoles';
import AdminComplianceRules from '@/pages/admin/ComplianceRules';
import AdminDocumentCategories from '@/pages/admin/DocumentCategories';
import AdminBranding from '@/pages/admin/Branding';
import AdminPlatformSettings from '@/pages/admin/PlatformSettings';
import AdminExternalTestResults from '@/pages/admin/ExternalTestResults';

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
    }
    // auth_required: fall through and render the app without a logged-in user
    // (no-login preview mode). Data calls may be restricted by backend security.
  }

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<Dashboard />} />
      <Route path="/foundation" element={<Foundation />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/timeline" element={<Timeline />} />
      <Route path="/forecast" element={<Forecast />} />
      <Route path="/scenarios" element={<Scenarios />} />
      <Route path="/obligations" element={<Obligations />} />
      <Route path="/goals" element={<Goals />} />
      <Route path="/initiatives" element={<Initiatives />} />
      <Route path="/scorecard" element={<Scorecard />} />
      <Route path="/roadmap" element={<Roadmap />} />
      <Route path="/risks" element={<Risks />} />
      <Route path="/opportunities" element={<Opportunities />} />
      <Route path="/decisions" element={<Decisions />} />
      <Route path="/reports" element={<ExecutiveReports />} />
      <Route path="/weekly-report" element={<WeeklyReport />} />
      <Route path="/ai-summary" element={<AISummary />} />
      <Route path="/enterprise-dashboard" element={<EnterpriseDashboard />} />
      <Route path="/enterprise-analytics" element={<EnterpriseAnalytics />} />
      <Route path="/compliance" element={<ComplianceCentre />} />
      <Route path="/document-vault" element={<DocumentVault />} />
      <Route element={<AdminLayout />}>
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/roles" element={<AdminRoles />} />
        <Route path="/admin/permissions" element={<AdminPermissions />} />
        <Route path="/admin/site-access" element={<AdminSiteAccess />} />
        <Route path="/admin/security" element={<AdminSecurity />} />
        <Route path="/admin/connectors" element={<AdminConnectors />} />
        <Route path="/admin/imports" element={<AdminImports />} />
        <Route path="/admin/import-data" element={<AdminImportData />} />
        <Route path="/admin/sync" element={<AdminSync />} />
        <Route path="/admin/reconciliation" element={<AdminReconciliation />} />
        <Route path="/admin/exceptions" element={<AdminExceptions />} />
        <Route path="/admin/account-mapping" element={<AdminAccountMapping />} />
        <Route path="/admin/source-mapping" element={<AdminSourceMapping />} />
        <Route path="/admin/calc-runs" element={<AdminCalcRuns />} />
        <Route path="/admin/financial-results" element={<AdminFinancialResults />} />
        <Route path="/admin/kpi-results" element={<AdminKpiResults />} />
        <Route path="/admin/calc-lineage" element={<AdminCalcLineage />} />
        <Route path="/admin/tax-results" element={<AdminTaxResults />} />
        <Route path="/admin/engine-status" element={<AdminEngineStatus />} />
        <Route path="/admin/dashboard-config" element={<AdminDashboardConfig />} />
        <Route path="/admin/widgets" element={<AdminWidgetConfig />} />
        <Route path="/admin/alert-rules" element={<AdminAlertRules />} />
        <Route path="/admin/brief-rules" element={<AdminOwnerBriefRules />} />
        <Route path="/admin/dashboard-cache" element={<AdminDashboardCache />} />
        <Route path="/admin/notification-rules" element={<AdminNotificationRules />} />
        <Route path="/admin/forecast-config" element={<AdminForecastConfig />} />
        <Route path="/admin/forecast-assumptions" element={<AdminForecastAssumptions />} />
        <Route path="/admin/scenario-management" element={<AdminScenarioManagement />} />
        <Route path="/admin/timeline-config" element={<AdminTimelineConfig />} />
        <Route path="/admin/simulation-rules" element={<AdminSimulationRules />} />
        <Route path="/admin/forecast-cache" element={<AdminForecastCache />} />
        <Route path="/admin/goal-categories" element={<AdminGoalCategories />} />
        <Route path="/admin/initiative-templates" element={<AdminInitiativeTemplates />} />
        <Route path="/admin/report-templates" element={<AdminReportTemplates />} />
        <Route path="/admin/risk-rules" element={<AdminRiskRules />} />
        <Route path="/admin/opportunity-rules" element={<AdminOpportunityRules />} />
        <Route path="/admin/executive-settings" element={<AdminExecutiveSettings />} />
        <Route path="/admin/weekly-report-config" element={<AdminWeeklyReportConfig />} />
        <Route path="/admin/organisations" element={<AdminOrganisations />} />
        <Route path="/admin/sites" element={<AdminSites />} />
        <Route path="/admin/enterprise-roles" element={<AdminEnterpriseRoles />} />
        <Route path="/admin/compliance-rules" element={<AdminComplianceRules />} />
        <Route path="/admin/document-categories" element={<AdminDocumentCategories />} />
        <Route path="/admin/branding" element={<AdminBranding />} />
        <Route path="/admin/platform-settings" element={<AdminPlatformSettings />} />
        <Route path="/admin/external-test-results" element={<AdminExternalTestResults />} />
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
          <FloatingHomeButton />
          <ErrorBoundary>
            <AuthenticatedApp />
          </ErrorBoundary>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App