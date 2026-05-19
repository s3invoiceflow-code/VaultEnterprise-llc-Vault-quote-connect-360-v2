import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Cases from '@/pages/Cases';
import CaseDetail from '@/pages/CaseDetail.jsx';
import CaseNew from '@/pages/CaseNew';
import Census from '@/pages/Census';
import Quotes from '@/pages/Quotes.jsx';
import Enrollment from '@/pages/Enrollment.jsx';
import Renewals from '@/pages/Renewals';
import Tasks from '@/pages/Tasks';
import Settings from '@/pages/Settings';
import Employers from '@/pages/Employers';
import PlanLibrary from '@/pages/PlanLibrary';
import Rates from '@/pages/Rates';
import ProposalBuilder from '@/pages/ProposalBuilder';
import ExceptionQueue from '@/pages/ExceptionQueue';
import ContributionModeling from '@/pages/ContributionModeling';
import EmployeePortal from '@/pages/EmployeePortal';
import EmployeeManagement from '@/pages/EmployeeManagement';
import EmployeePortalLogin from '@/pages/EmployeePortalLogin';
import EmployeeEnrollment from '@/pages/EmployeeEnrollment';
import EmployeeBenefits from '@/pages/EmployeeBenefits';
import EmployerPortal from '@/pages/EmployerPortal';
import PolicyMatchAI from '@/pages/PolicyMatchAI';
import IntegrationInfrastructure from '@/pages/IntegrationInfrastructure.jsx';
import HelpCenter from '@/pages/HelpCenter';
import HelpAdmin from '@/pages/HelpAdmin';
import HelpDashboard from '@/pages/HelpDashboard';
import HelpCoverageReport from '@/pages/HelpCoverageReport';
import HelpSearchAnalytics from '@/pages/HelpSearchAnalytics';
import HelpTargetRegistry from '@/pages/HelpTargetRegistry';
import HelpManualManager from '@/pages/HelpManualManager';
import ACALibrary from '@/pages/ACALibrary';
import MasterGeneralAgentCommand from '@/pages/MasterGeneralAgentCommand';
import BrokerSignup from '@/pages/BrokerSignup';
import BrokerSignupShell from '@/pages/BrokerSignupShell';
import BrokerOnboardingShell from '@/pages/BrokerOnboardingShell';
import PlatformBrokerAgencies from '@/pages/PlatformBrokerAgencies';
import PlatformBrokerReviewShell from '@/pages/PlatformBrokerReviewShell';
import Phase1BrokerSmokeTest from '@/pages/Phase1BrokerSmokeTest';
import BrokerWorkspaceShell from '@/pages/BrokerWorkspaceShell';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground">Loading Connect Quote 360...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/new" element={<CaseNew />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/census" element={<Census />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/enrollment" element={<Enrollment />} />
        <Route path="/renewals" element={<Renewals />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/employers" element={<Employers />} />
        <Route path="/plans" element={<PlanLibrary />} />
        <Route path="/rates" element={<Rates />} />
        <Route path="/proposals" element={<ProposalBuilder />} />
        <Route path="/exceptions" element={<ExceptionQueue />} />
        <Route path="/contributions" element={<ContributionModeling />} />
        <Route path="/employee-portal" element={<EmployeePortal />} />
        <Route path="/employee-management" element={<EmployeeManagement />} />
        <Route path="/employee-enrollment" element={<EmployeeEnrollment />} />
        <Route path="/employee-benefits" element={<EmployeeBenefits />} />
        <Route path="/employer-portal" element={<EmployerPortal />} />
        <Route path="/policymatch" element={<PolicyMatchAI />} />
        <Route path="/integration-infra" element={<IntegrationInfrastructure />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<HelpCenter />} />
        <Route path="/help-admin" element={user?.role === "admin" || user?.role === "platform_super_admin" ? <HelpAdmin /> : <PageNotFound />} />
        <Route path="/help-dashboard" element={<HelpDashboard />} />
        <Route path="/help-coverage" element={<HelpCoverageReport />} />
        <Route path="/help-analytics" element={<HelpSearchAnalytics />} />
        <Route path="/help-target-registry" element={<HelpTargetRegistry />} />
        <Route path="/help-manual-manager" element={<HelpManualManager />} />
        <Route path="/aca-library" element={<ACALibrary />} />
        <Route path="/mga/command" element={
          ['mga_admin','mga_manager','mga_user','mga_read_only','platform_super_admin','admin'].includes(user?.role)
            ? <MasterGeneralAgentCommand />
            : <PageNotFound />
        } />
        <Route path="/command-center/broker-agencies" element={
          user?.role === 'admin' || user?.role === 'platform_super_admin' ? <PlatformBrokerAgencies /> : <PageNotFound />
        } />
        <Route path="/command-center/broker-agencies/pending" element={
          user?.role === 'admin' || user?.role === 'platform_super_admin' ? <PlatformBrokerReviewShell /> : <PageNotFound />
        } />
        <Route path="/command-center/qa/phase-1-broker-smoke-test" element={
          user?.role === 'admin' || user?.role === 'platform_super_admin' ? <Phase1BrokerSmokeTest /> : <PageNotFound />
        } />
      </Route>
      <Route path="/broker-signup" element={<BrokerSignupShell />} />
      <Route path="/broker-onboarding" element={<BrokerOnboardingShell />} />
      <Route path="/broker" element={<BrokerWorkspaceShell />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App