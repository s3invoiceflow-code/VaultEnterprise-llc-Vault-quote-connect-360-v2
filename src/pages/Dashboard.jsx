import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Briefcase,
  FileText,
  ClipboardCheck,
  AlertCircle,
  RefreshCw,
  Users,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/shared/MetricCard";
import PageHeader from "@/components/shared/PageHeader";
import { DashboardSkeleton } from "@/components/shared/LoadingSkeleton";
import TodaysPriorities from "@/components/dashboard/TodaysPriorities";
import InteractivePipeline from "@/components/dashboard/InteractivePipeline";
import EnrollmentCountdowns from "@/components/dashboard/EnrollmentCountdowns";
import StalledCases from "@/components/dashboard/StalledCases";
import QuickActions from "@/components/dashboard/QuickActions";
import CensusGapAlert from "@/components/dashboard/CensusGapAlert";
import SystemHealthStrip from "@/components/dashboard/SystemHealthStrip";
import DomainControlGrid from "@/components/dashboard/DomainControlGrid";
import WorkflowBottlenecksPanel from "@/components/dashboard/WorkflowBottlenecksPanel";
import ActionCenterPanel from "@/components/dashboard/ActionCenterPanel";
import WorkflowStartPanel from "@/components/dashboard/WorkflowStartPanel";
import DashboardRoleViewTabs from "@/components/dashboard/DashboardRoleViewTabs";
import SystemControlMetrics from "@/components/dashboard/SystemControlMetrics";
import AlertsAndAuditFeed from "@/components/dashboard/AlertsAndAuditFeed";
import IntegrationStatusPanel from "@/components/dashboard/IntegrationStatusPanel";
import NextBestActionsPanel from "@/components/dashboard/NextBestActionsPanel";
import { buildPlatformDependencyRegistry } from "@/components/platform/platformDependencyRegistry";
import { buildActionCenterFromRegistry } from "@/components/platform/platformOrchestrationEngine";
import { useAuth } from "@/lib/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "platform_super_admin";
  const defaultView = user?.role === "broker" ? "broker" : user?.role === "employer" ? "employer" : "admin";
  const [roleView, setRoleView] = useState(defaultView);

  const STALE = 5 * 60_000;  // 5 minutes — aggressive cache to prevent refetch storms
  const GC    = 10 * 60_000; // 10 minutes — keep cache alive across tab switches
  const ready = !!user;      // gate: don't fire before auth context is available

  // ── Tier 1: Primary KPI queries (7) — fire together once auth is ready ──
  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: () => base44.entities.BenefitCase.list("-created_date", 200),
    staleTime: STALE, gcTime: GC, enabled: ready,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks-pending"],
    queryFn: () => base44.entities.CaseTask.filter({ status: "pending" }, "-created_date", 200),
    staleTime: STALE, gcTime: GC, enabled: ready,
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["enrollments"],
    queryFn: () => base44.entities.EnrollmentWindow.list("-created_date", 100),
    staleTime: STALE, gcTime: GC, enabled: ready,
  });

  const { data: exceptions = [] } = useQuery({
    queryKey: ["exceptions"],
    queryFn: () => base44.entities.ExceptionItem.list("-created_date", 50),
    staleTime: STALE, gcTime: GC, enabled: ready,
  });

  const { data: censusVersions = [] } = useQuery({
    queryKey: ["dashboard-census-versions"],
    queryFn: () => base44.entities.CensusVersion.list("-created_date", 200),
    staleTime: STALE, gcTime: GC, enabled: ready,
  });

  const { data: quoteScenarios = [] } = useQuery({
    queryKey: ["dashboard-quote-scenarios"],
    queryFn: () => base44.entities.QuoteScenario.list("-created_date", 200),
    staleTime: STALE, gcTime: GC, enabled: ready,
  });

  const { data: renewals = [] } = useQuery({
    queryKey: ["dashboard-renewals"],
    queryFn: () => base44.entities.RenewalCycle.list("-created_date", 200),
    staleTime: STALE, gcTime: GC, enabled: ready,
  });

  const { data: employeeEnrollments = [] } = useQuery({
    queryKey: ["dashboard-employee-enrollments"],
    queryFn: () => base44.entities.EmployeeEnrollment.list("-created_date", 500),
    staleTime: STALE, gcTime: GC, enabled: ready,
  });

  // ── Tier 2: Secondary queries (5) — deferred until primary cases data is loaded ──
  const primaryLoaded = ready && !isLoading && cases.length >= 0;

  const { data: documents = [] } = useQuery({
    queryKey: ["dashboard-documents"],
    queryFn: () => base44.entities.Document.list("-created_date", 200),
    staleTime: STALE, gcTime: GC, enabled: primaryLoaded,
  });

  const { data: employers = [] } = useQuery({
    queryKey: ["dashboard-employers"],
    queryFn: () => base44.entities.EmployerGroup.list("-created_date", 200),
    staleTime: STALE, gcTime: GC, enabled: primaryLoaded,
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ["dashboard-proposals"],
    queryFn: () => base44.entities.Proposal.list("-created_date", 200),
    staleTime: STALE, gcTime: GC, enabled: primaryLoaded,
  });

  const { data: activityLogs = [] } = useQuery({
    queryKey: ["dashboard-activity-logs"],
    queryFn: () => base44.entities.ActivityLog.list("-created_date", 50),
    staleTime: STALE, gcTime: GC, enabled: primaryLoaded,
  });

  const { data: censusMembers = [] } = useQuery({
    queryKey: ["dashboard-census-members"],
    queryFn: () => base44.entities.CensusMember.filter({ is_eligible: true }, "-created_date", 500),
    staleTime: STALE, gcTime: GC, enabled: primaryLoaded,
  });

  const activeCases = useMemo(() => cases.filter((c) => !["closed", "renewed"].includes(c.stage)), [cases]);
  const quotingCases = useMemo(() => cases.filter((c) => ["ready_for_quote", "quoting"].includes(c.stage)), [cases]);
  const enrollmentOpen = useMemo(() => enrollments.filter((e) => ["open", "closing_soon"].includes(e.status)), [enrollments]);
  const overdueTasks = useMemo(() => tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date()), [tasks]);
  const censusIssues = useMemo(() => cases.filter((c) => c.census_status === "issues_found").length, [cases]);
  const stalledCasesCount = useMemo(() => cases.filter((c) => {
    if (["closed", "renewed", "active"].includes(c.stage)) return false;
    const last = c.last_activity_date || c.updated_date || c.created_date;
    return last && ((Date.now() - new Date(last).getTime()) / 86400000) >= 7;
  }).length, [cases]);
  const openExceptions = useMemo(() => exceptions.filter((e) => !["resolved", "dismissed"].includes(e.status)).length, [exceptions]);
  const activeRenewals = useMemo(() => renewals.filter((r) => r.status !== "completed").length, [renewals]);
  const draftQuotes = useMemo(() => quoteScenarios.filter((q) => q.status === "draft").length, [quoteScenarios]);
  const proposalAttention = useMemo(() => proposals.filter((p) => ["sent", "viewed"].includes(p.status)).length, [proposals]);
  const pendingSignatures = useMemo(() => employeeEnrollments.filter((e) => e.docusign_status && !["not_sent", "completed"].includes(e.docusign_status)).length, [employeeEnrollments]);
  const healthyDomains = useMemo(() => {
    const checks = [
      openExceptions === 0,
      censusIssues === 0,
      overdueTasks.length === 0,
      stalledCasesCount === 0,
    ];
    return checks.filter(Boolean).length;
  }, [openExceptions, censusIssues, overdueTasks.length, stalledCasesCount]);

  const bottlenecks = useMemo(() => {
    const items = [
      { label: "Overdue Tasks", value: overdueTasks.length, detail: "Pending work requiring intervention", href: "/tasks" },
      { label: "Open Exceptions", value: openExceptions, detail: "Active issues blocking workflows", href: "/exceptions" },
      { label: "Draft Quotes", value: draftQuotes, detail: "Scenarios waiting for calculation", href: "/quotes" },
      { label: "Pending Signatures", value: pendingSignatures, detail: "Employee forms still in DocuSign flow", href: "/employee-management" },
      { label: "Proposal Attention", value: proposalAttention, detail: "Sent/viewed proposals awaiting action", href: "/proposals" },
    ];
    return items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [overdueTasks.length, openExceptions, draftQuotes, pendingSignatures, proposalAttention]);

  const registry = useMemo(() => buildPlatformDependencyRegistry({
    cases,
    tasks,
    censusVersions,
    scenarios: quoteScenarios,
    enrollments,
    renewals,
    exceptions,
    employeeEnrollments,
  }), [cases, tasks, censusVersions, quoteScenarios, enrollments, renewals, exceptions, employeeEnrollments, censusMembers]);

  const actionCenterItems = useMemo(() => buildActionCenterFromRegistry(registry), [registry]);

  const dashboardMetrics = useMemo(() => {
    // True headcount: eligible CensusMember records (is_eligible=true filtered at query)
    const totalEligibleMembers = censusMembers.length;
    // Fallback: sum of EnrollmentWindow.total_eligible (manually-entered field on windows)
    const totalEligible = enrollments.reduce((sum, item) => sum + (item.total_eligible || 0), 0);
    const enrolledEmployees = employeeEnrollments.filter((item) => item.status === "completed").length;
    // Denominator: prefer census-derived eligible count; fall back to window total_eligible
    const enrollmentDenominator = totalEligibleMembers > 0 ? totalEligibleMembers : totalEligible;
    const enrollmentCompletion = enrollmentDenominator > 0 ? Math.round((enrolledEmployees / enrollmentDenominator) * 100) : 0;
    const quoteCompleted = quoteScenarios.filter((item) => item.status === "completed").length;
    // Active pipeline = in-flight only (draft + running); excludes completed
    const quotePipeline = quoteScenarios.filter((item) => ["draft", "running"].includes(item.status)).length;
    const renewalOverdue = renewals.filter((item) => item.renewal_date && new Date(item.renewal_date) < new Date() && item.status !== "completed").length;
    const renewalPipeline = renewals.filter((item) => item.status !== "completed").length;
    const openCases = activeCases.length;
    const totalCases = cases.length;
    const slaRisk = stalledCasesCount + overdueTasks.length;

    return {
      totalEligibleMembers,
      totalEligible,
      enrolledEmployees,
      enrollmentCompletion,
      quoteCompleted,
      quotePipeline,
      renewalOverdue,
      renewalPipeline,
      openCases,
      totalCases,
      slaRisk,
    };
  }, [employeeEnrollments, enrollments, quoteScenarios, renewals, activeCases.length, cases.length, stalledCasesCount, overdueTasks.length]);

  const activeAlerts = useMemo(() => {
    const items = [
      { label: "Census data issues", value: registry.systemSummary.censusIssues, detail: "Validation gaps are blocking downstream work.", href: "/census" },
      { label: "Quote pricing issues", value: registry.systemSummary.quoteFailures + (registry.systemSummary.rateSummary?.quotedPlansWithoutRates || 0), detail: "Scenarios need pricing or rate remediation.", href: "/quotes" },
      { label: "Enrollment blockers", value: registry.systemSummary.enrollmentBlockers, detail: "Enrollment execution is blocked or incomplete.", href: "/enrollment" },
      { label: "Renewal deadlines", value: registry.systemSummary.renewalRisk, detail: "Renewals are approaching or overdue without closure.", href: "/renewals" },
      { label: "Case escalations", value: openExceptions, detail: "Operational exceptions require triage and owner action.", href: "/cases" },
    ];
    return items.filter((item) => item.value > 0);
  }, [registry, openExceptions]);

  const integrationHealth = useMemo(() => ([
    {
      key: "payroll",
      label: "Payroll",
      value: employers.length,
      detail: "Employer records available for downstream sync readiness.",
      healthy: employers.length > 0,
    },
    {
      key: "carrier",
      label: "Carrier Pricing",
      value: registry.systemSummary.rateSummary?.plansWithoutRates || 0,
      detail: "Plans missing rates impact quoting accuracy.",
      healthy: (registry.systemSummary.rateSummary?.plansWithoutRates || 0) === 0,
    },
    {
      key: "edi",
      label: "EDI / Enrollment",
      value: pendingSignatures,
      detail: "In-flight enrollment outputs still awaiting completion.",
      healthy: pendingSignatures === 0,
    },
    {
      key: "ingestion",
      label: "Ingestion Health",
      value: registry.systemSummary.censusIssues,
      detail: "Census uploads with issues need correction.",
      healthy: registry.systemSummary.censusIssues === 0,
    },
  ]), [employers.length, registry, pendingSignatures]);

  const nextBestActions = useMemo(() => {
    const items = [
      registry.systemSummary.censusIssues > 0 && { label: "Fix census issues", meta: `${registry.systemSummary.censusIssues} cases blocked`, href: "/census" },
      pendingSignatures > 0 && { label: "Complete enrollments", meta: `${pendingSignatures} signatures pending`, href: "/employee-management" },
      openExceptions > 0 && { label: "Resolve case exceptions", meta: `${openExceptions} open exceptions`, href: "/exceptions" },
      draftQuotes > 0 && { label: "Finalize quotes", meta: `${draftQuotes} draft scenarios`, href: "/quotes" },
      activeRenewals > 0 && { label: "Complete renewals", meta: `${activeRenewals} active renewal cycles`, href: "/renewals" },
    ].filter(Boolean);
    return items.slice(0, 6);
  }, [registry, pendingSignatures, openExceptions, draftQuotes, activeRenewals]);

  const activityFeed = useMemo(() => activityLogs.slice(0, 8).map((item) => ({
    id: item.id,
    title: item.action,
    detail: item.detail || item.actor_name || item.actor_email || "Recent system activity",
    time: new Date(item.created_date).toLocaleDateString(),
  })), [activityLogs]);

  const domainCards = useMemo(() => [
    {
      key: "cases",
      label: "Cases",
      description: "Core workflow orchestration and stage movement",
      href: "/cases",
      icon: Briefcase,
      stats: [
        { label: "Open", value: activeCases.length },
        { label: "Stalled", value: stalledCasesCount },
        { label: "Urgent", value: cases.filter((c) => c.priority === "urgent").length },
        { label: "Quoting", value: quotingCases.length },
      ],
      actions: [
        { label: "Open case workspace", href: "/cases" },
        { label: "Create new case", href: "/cases/new" },
      ],
    },
    {
      key: "census",
      label: "Census",
      description: "Data intake, validation, and census quality monitoring",
      href: "/census",
      icon: Users,
      stats: [
        { label: "Versions", value: censusVersions.length },
        { label: "Issues", value: censusIssues },
        { label: "Not Started", value: cases.filter((c) => c.census_status === "not_started").length },
        { label: "Validated", value: cases.filter((c) => c.census_status === "validated").length },
      ],
      actions: [
        { label: "Manage census data", href: "/census" },
        { label: "Open active cases", href: "/cases" },
      ],
    },
    {
      key: "quotes",
      label: "Quotes",
      description: "Scenario generation, pricing, and recommendation flow",
      href: "/quotes",
      icon: FileText,
      stats: [
        { label: "Scenarios", value: quoteScenarios.length },
        { label: "Draft", value: draftQuotes },
        { label: "Running", value: quoteScenarios.filter((q) => q.status === "running").length },
        { label: "Completed", value: quoteScenarios.filter((q) => q.status === "completed").length },
      ],
      actions: [
        { label: "Open quote engine", href: "/quotes" },
        { label: "Review proposals", href: "/proposals" },
      ],
    },
    {
      key: "enrollment",
      label: "Enrollment",
      description: "Window operations, participation, and employee execution",
      href: "/enrollment",
      icon: ClipboardCheck,
      stats: [
        { label: "Open", value: enrollmentOpen.length },
        { label: "Windows", value: enrollments.length },
        { label: "Employees", value: employeeEnrollments.length },
        { label: "Signatures", value: pendingSignatures },
      ],
      actions: [
        { label: "Manage enrollment", href: "/enrollment" },
        { label: "Employee management", href: "/employee-management" },
      ],
    },
    {
      key: "renewals",
      label: "Renewals",
      description: "Renewal pipeline, pricing shifts, and decision state",
      href: "/renewals",
      icon: RefreshCw,
      stats: [
        { label: "Active", value: activeRenewals },
        { label: "Overdue", value: renewals.filter((r) => r.renewal_date && new Date(r.renewal_date) < new Date() && r.status !== "completed").length },
        { label: "Decisions", value: renewals.filter((r) => r.status === "decision_made").length },
        { label: "Completed", value: renewals.filter((r) => r.status === "completed").length },
      ],
      actions: [
        { label: "Open renewal desk", href: "/renewals" },
        { label: "Employer renewals", href: "/employers" },
      ],
    },
    {
      key: "supporting",
      label: "Support Systems",
      description: "Employers, proposals, exceptions, documents, and admin workflows",
      href: "/exceptions",
      icon: Settings,
      stats: [
        { label: "Employers", value: employers.length },
        { label: "Documents", value: documents.length },
        { label: "Proposals", value: proposals.length },
        { label: "Exceptions", value: openExceptions },
      ],
      actions: [
        { label: "Employer workspace", href: "/employers" },
        { label: "Proposal builder", href: "/proposals" },
        { label: "Exception queue", href: "/exceptions" },
      ],
    },
  ], [activeCases.length, stalledCasesCount, cases, quotingCases.length, censusVersions.length, censusIssues, quoteScenarios, draftQuotes, enrollmentOpen.length, employeeEnrollments.length, pendingSignatures, activeRenewals, renewals, employers.length, documents.length, proposals.length, openExceptions, enrollments.length]);

  if (isLoading) return <DashboardSkeleton />;

  if (cases.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Overview of your benefits operations"
          actions={<Link to="/cases/new"><Button><Briefcase className="w-4 h-4 mr-2" /> New Case</Button></Link>}
        />
        <WorkflowStartPanel />
        <QuickActions />
      </div>
    );
  }

  const renderAdminView = () => (
    <div className="space-y-8">
      {/* Workflow entry */}
      <WorkflowStartPanel />

      {/* Quick actions bar */}
      <QuickActions />

      {/* Primary KPI strip */}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Performance Overview</p>
        <SystemControlMetrics metrics={dashboardMetrics} />
      </section>

      {/* System health */}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">System Health</p>
        <SystemHealthStrip
          metrics={{
            exceptions: registry.systemSummary.exceptionCount,
            censusIssues: registry.systemSummary.censusIssues,
            stalledCases: stalledCasesCount,
            healthy: healthyDomains,
          }}
        />
      </section>

      {/* Operational signals */}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Operational Signals</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Cases in Quoting" value={quotingCases.length} icon={FileText} trendLabel={`${draftQuotes} draft scenarios`} />
          <MetricCard label="Open Enrollments" value={enrollmentOpen.length} icon={ClipboardCheck} trendLabel={`${pendingSignatures} signatures pending`} />
          <MetricCard label="Overdue Tasks" value={overdueTasks.length} icon={AlertCircle} trend={overdueTasks.length > 0 ? "down" : undefined} trendLabel={overdueTasks.length > 0 ? "needs attention" : "on track"} />
          <MetricCard label="Active Renewals" value={activeRenewals} icon={RefreshCw} trendLabel={`${dashboardMetrics.renewalOverdue} overdue`} />
        </div>
      </section>

      {/* Action center — only shown when there are items */}
      <ActionCenterPanel actions={actionCenterItems} />

      {/* Integration health */}
      <IntegrationStatusPanel items={integrationHealth} />

      {/* Domain grid */}
      <DomainControlGrid domains={domainCards} />

      {/* Alerts + audit */}
      <AlertsAndAuditFeed alerts={activeAlerts} feed={activityFeed} />
    </div>
  );

  const renderOperationsView = () => (
    <>
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard label="Active Cases" value={activeCases.length} icon={Briefcase} trendLabel={`${cases.length} total`} />
        <MetricCard label="Overdue Tasks" value={overdueTasks.length} icon={AlertCircle} trend={overdueTasks.length > 0 ? "down" : undefined} trendLabel={overdueTasks.length > 0 ? "needs attention" : "on track"} />
        <MetricCard label="Open Exceptions" value={openExceptions} icon={AlertCircle} trend={openExceptions > 0 ? "down" : undefined} trendLabel={openExceptions > 0 ? "needs triage" : "clear"} />
        <MetricCard label="Stalled Cases" value={stalledCasesCount} icon={RefreshCw} trend={stalledCasesCount > 0 ? "down" : undefined} trendLabel={stalledCasesCount > 0 ? "needs follow-up" : "on track"} />
      </div>
      <NextBestActionsPanel actions={nextBestActions} />
      <TodaysPriorities tasks={tasks} exceptions={exceptions} cases={cases} enrollments={enrollments} />
      <WorkflowBottlenecksPanel items={bottlenecks} />
      <CensusGapAlert cases={cases} />
      <StalledCases cases={cases} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InteractivePipeline cases={cases} />
        <EnrollmentCountdowns enrollments={enrollments} />
      </div>
    </>
  );

  const renderBrokerView = () => (
    <>
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard label="Active Cases" value={activeCases.length} icon={Briefcase} trendLabel={`${cases.length} total`} />
        <MetricCard label="Cases in Quoting" value={quotingCases.length} icon={FileText} trendLabel={`${draftQuotes} draft scenarios`} />
        <MetricCard label="Proposals Out" value={proposalAttention} icon={FileText} trendLabel="awaiting response" />
        <MetricCard label="Active Renewals" value={activeRenewals} icon={RefreshCw} trendLabel={`${dashboardMetrics.renewalOverdue} overdue`} />
      </div>
      <QuickActions />
      <NextBestActionsPanel actions={nextBestActions} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InteractivePipeline cases={cases} />
        <StalledCases cases={cases} />
      </div>
      <WorkflowBottlenecksPanel items={bottlenecks} />
    </>
  );

  const renderEmployerView = () => (
    <>
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard label="Open Enrollments" value={enrollmentOpen.length} icon={ClipboardCheck} trendLabel={`${pendingSignatures} signatures pending`} />
        <MetricCard label="Employees" value={employeeEnrollments.length} icon={Users} trendLabel={`${dashboardMetrics.enrollmentCompletion}% enrolled`} />
        <MetricCard label="Active Renewals" value={activeRenewals} icon={RefreshCw} trendLabel="renewal pipeline" />
        <MetricCard label="Proposals" value={proposals.length} icon={FileText} trendLabel={`${proposalAttention} awaiting response`} />
      </div>
      <EnrollmentCountdowns enrollments={enrollments} />
      <TodaysPriorities tasks={tasks} exceptions={exceptions} cases={cases} enrollments={enrollments} />
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Start work, monitor blockers, and move cases through census, quoting, enrollment, and renewals."
        actions={<Link to="/cases/new"><Button><Briefcase className="w-4 h-4 mr-2" /> New Case</Button></Link>}
      />

      <DashboardRoleViewTabs value={roleView} onChange={setRoleView} />

      {roleView === "admin" && renderAdminView()}
      {roleView === "operations" && renderOperationsView()}
      {roleView === "broker" && renderBrokerView()}
      {roleView === "employer" && renderEmployerView()}
    </div>
  );
}