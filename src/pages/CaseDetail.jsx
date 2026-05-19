import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Users, FileText, ClipboardCheck, Calendar,
  Clock, FileCheck, AlertTriangle, Briefcase, Pencil, X, Copy, Send
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useAuth } from "@/lib/AuthContext";

// ── Shared ──────────────────────────────────────────────────────────────────
import StatusBadge from "@/components/shared/StatusBadge";

// ── Case sub-components ──────────────────────────────────────────────────────
import StageProgress     from "@/components/cases/StageProgress";
import LifecycleChecklist from "@/components/cases/LifecycleChecklist";
import CaseInfoCard      from "@/components/cases/CaseInfoCard";
import CaseTasksTab      from "@/components/cases/CaseTasksTab";
import CaseCensusTab     from "@/components/cases/CaseCensusTab";
import CaseQuotesTab     from "@/components/cases/CaseQuotesTab";
import CaseEditModal     from "@/components/cases/CaseEditModal";
import CaseCloseModal    from "@/components/cases/CaseCloseModal";
import StageAdvanceModal from "@/components/cases/StageAdvanceModal";
import DocumentsTab      from "@/components/cases/DocumentsTab";
import ActivityTab       from "@/components/cases/ActivityTab";
import StageValidationWarnings from "@/components/cases/StageValidationWarnings";
import DependencyCheckPanel from "@/components/cases/DependencyCheckPanel";
import CloneCaseModal    from "@/components/cases/CloneCaseModal";
import TxQuoteWorkspace from "@/components/cases/TxQuoteWorkspace";
import TxQuoteOptionsModal from "@/components/cases/TxQuoteOptionsModal";
import AuditTrailViewer  from "@/components/shared/AuditTrailViewer";
import { getCaseWorkflowSignals, getNextCaseStage, getStageRequirements } from "@/components/cases/caseWorkflow";
import { getTxQuoteDisabledReason, isTxQuoteStepComplete } from "@/components/cases/txQuoteWorkflow";
import { getTxQuoteButtonState } from "@/components/cases/txQuoteEngine";

// ── AI ───────────────────────────────────────────────────────────────────────
import AIAssistant from "@/components/ai/AIAssistant";

// ── Constants ────────────────────────────────────────────────────────────────
const STAGE_ORDER = [
  "draft", "census_in_progress", "census_validated", "ready_for_quote",
  "quoting", "proposal_ready", "employer_review", "approved_for_enrollment",
  "enrollment_open", "enrollment_complete", "install_in_progress", "active",
];

const STAGE_LABELS = {
  draft: "Draft",
  census_in_progress: "Census",
  census_validated: "Validated",
  ready_for_quote: "TxQuote",
  quoting: "Quoting",
  proposal_ready: "Proposal",
  employer_review: "Review",
  approved_for_enrollment: "Approved",
  enrollment_open: "Enrollment",
  enrollment_complete: "Enrolled",
  install_in_progress: "Install",
  active: "Active",
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CaseDetail() {
  const { id: caseId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showEdit, setShowEdit]     = useState(false);
  const [showClose, setShowClose]   = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [showClone, setShowClone]   = useState(false);
  const [showTxQuote, setShowTxQuote] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: caseData, isLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => base44.entities.BenefitCase.filter({ id: caseId }).then(r => r[0]),
    enabled: !!caseId,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["case-tasks", caseId],
    queryFn: () => base44.entities.CaseTask.filter({ case_id: caseId }, "-created_date"),
    enabled: !!caseId,
  });

  const { data: censusVersions = [] } = useQuery({
    queryKey: ["census-versions", caseId],
    queryFn: () => base44.entities.CensusVersion.filter({ case_id: caseId }, "-version_number"),
    enabled: !!caseId,
  });

  const { data: scenarios = [] } = useQuery({
    queryKey: ["quote-scenarios", caseId],
    queryFn: () => base44.entities.QuoteScenario.filter({ case_id: caseId }, "-created_date"),
    enabled: !!caseId,
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["documents", caseId],
    queryFn: () => base44.entities.Document.filter({ case_id: caseId }),
    enabled: !!caseId,
  });

  const { data: enrollmentWindows = [] } = useQuery({
    queryKey: ["enrollment-windows", caseId],
    queryFn: () => base44.entities.EnrollmentWindow.filter({ case_id: caseId }, "-created_date"),
    enabled: !!caseId,
  });

  const { data: renewals = [] } = useQuery({
    queryKey: ["case-renewals", caseId],
    queryFn: () => base44.entities.RenewalCycle.filter({ case_id: caseId }, "-created_date"),
    enabled: !!caseId,
  });

  const { data: exceptions = [] } = useQuery({
    queryKey: ["case-exceptions", caseId],
    queryFn: () => base44.entities.ExceptionItem.filter({ case_id: caseId }, "-created_date"),
    enabled: !!caseId,
  });

  const { data: activityLog = [] } = useQuery({
    queryKey: ["activity", caseId],
    queryFn: () => base44.entities.ActivityLog.filter({ case_id: caseId }, "-created_date"),
    enabled: !!caseId,
  });

  const { data: quoteRoutes = [] } = useQuery({
    queryKey: ["quote-provider-routes"],
    queryFn: () => base44.entities.QuoteProviderRoute.list("provider_code", 50),
    enabled: !!caseId,
  });

  const { data: quoteTransmissions = [] } = useQuery({
    queryKey: ["quote-transmissions", caseId],
    queryFn: () => base44.entities.QuoteTransmission.filter({ case_id: caseId }, "-created_date", 200),
    enabled: !!caseId,
  });

  const { data: txQuoteCase } = useQuery({
    queryKey: ["txquote-case", caseId],
    queryFn: () => base44.entities.TxQuoteCase.filter({ case_id: caseId }, "-created_date", 1).then((items) => items[0] || null),
    enabled: !!caseId,
  });

  const { data: txQuoteDestinations = [] } = useQuery({
    queryKey: ["txquote-destinations", caseId],
    queryFn: async () => {
      const currentTxQuoteCase = await base44.entities.TxQuoteCase.filter({ case_id: caseId }, "-created_date", 1).then((items) => items[0] || null);
      if (!currentTxQuoteCase) return [];
      return base44.entities.TxQuoteDestination.filter({ txquote_case_id: currentTxQuoteCase.id }, "destination_code", 20);
    },
    enabled: !!caseId,
  });

  const { data: txQuoteReadinessResults = [] } = useQuery({
    queryKey: ["txquote-readiness", caseId],
    queryFn: async () => {
      const currentTxQuoteCase = await base44.entities.TxQuoteCase.filter({ case_id: caseId }, "-created_date", 1).then((items) => items[0] || null);
      if (!currentTxQuoteCase) return [];
      return base44.entities.TxQuoteReadinessResult.filter({ txquote_case_id: currentTxQuoteCase.id }, "-created_date", 200);
    },
    enabled: !!caseId,
  });

  const { data: censusImportJobs = [] } = useQuery({
    queryKey: ["census-import-job", caseId],
    queryFn: () => base44.entities.CensusImportJob.filter({ case_id: caseId }, "-created_date", 10),
    enabled: !!caseId,
  });

  // ── Stage advance mutation ─────────────────────────────────────────────────
  const advanceStageMutation = useMutation({
    mutationFn: async (nextStage) => {
      await base44.entities.BenefitCase.update(caseId, { stage: nextStage });
      await base44.entities.ActivityLog.create({
        case_id: caseId,
        actor_email: user?.email,
        actor_name: user?.full_name,
        action: "Stage advanced",
        detail: `Case moved to ${STAGE_LABELS[nextStage] || nextStage}`,
        old_value: STAGE_LABELS[caseData?.stage] || caseData?.stage,
        new_value: STAGE_LABELS[nextStage] || nextStage,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["activity", caseId] });
      setShowAdvance(false);
    },
  });

  // ── Loading / not found guards ─────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!caseData) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Case not found</p>
      <Link to="/cases">
        <Button variant="outline" className="mt-4">Back to Cases</Button>
      </Link>
    </div>
  );

  // ── Derived values ─────────────────────────────────────────────────────────
  const currentStageIndex = STAGE_ORDER.indexOf(caseData.stage);
  const nextStage = getNextCaseStage(caseData.stage);

  const workflowContext = {
    caseData,
    ...getCaseWorkflowSignals({
      caseData,
      censusVersions,
      scenarios,
      enrollmentWindows,
      tasks,
      renewals,
      exceptions,
    }),
  };

  const txQuoteDisabledReason = getTxQuoteDisabledReason({ caseData, censusVersions, routes: quoteRoutes, user, latestImportJob: censusImportJobs[0] || null });
  const txQuoteComplete = isTxQuoteStepComplete({ censusVersions, transmissions: quoteTransmissions }) || txQuoteCase?.status === "sent_complete";
  const txQuoteButtonState = getTxQuoteButtonState({
    txQuoteCase,
    readinessResults: txQuoteReadinessResults,
    destinations: txQuoteDestinations,
    censusVersions,
  });

  const aiContext = {
    employer:         caseData.employer_name,
    caseNumber:       caseData.case_number,
    caseType:         caseData.case_type,
    stage:            caseData.stage,
    effectiveDate:    caseData.effective_date,
    employeeCount:    caseData.employee_count,
    priority:         caseData.priority,
    censusStatus:     caseData.census_status,
    quoteStatus:      caseData.quote_status,
    enrollmentStatus: caseData.enrollment_status,
    taskCount:        tasks.length,
    scenarioCount:    scenarios.length,
    censusVersions:   censusVersions.length,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/cases">
            <Button variant="ghost" size="icon" className="rounded-full flex-shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight truncate">
                {caseData.employer_name || "Unnamed Employer"}
              </h1>
              <StatusBadge status={caseData.stage} />
              {caseData.priority !== "normal" && <StatusBadge status={caseData.priority} />}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
              <span>{caseData.case_number || `Case #${caseId?.slice(-6)}`}</span>
              <span>•</span>
              <span className="capitalize">{caseData.case_type?.replace(/_/g, " ")}</span>
              {caseData.effective_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Eff. {format(new Date(caseData.effective_date), "MMM d, yyyy")}
                </span>
              )}
              {caseData.assigned_to && <span>→ {caseData.assigned_to}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowClone(true)}>
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Clone
          </Button>
          {caseData.stage !== "closed" && (
            <Button
              variant="outline" size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => setShowClose(true)}
            >
              <X className="w-3.5 h-3.5 mr-1.5" /> Close Case
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowTxQuote(true)} disabled={!!txQuoteDisabledReason}>
            <Send className="w-3.5 h-3.5 mr-1.5" /> {txQuoteButtonState.label}
          </Button>
          {nextStage && caseData.stage !== "closed" && (
            <Button size="sm" onClick={() => setShowAdvance(true)}>
              Advance → {STAGE_LABELS[nextStage]}
            </Button>
          )}
        </div>
      </div>

      {/* ── Stage progress bar ── */}
      <Card>
        <CardContent className="py-3">
          <StageProgress currentStage={caseData.stage} />
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs defaultValue="overview">
        <TabsList className="bg-muted/50 flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="census">Census ({censusVersions.length})</TabsTrigger>
          <TabsTrigger value="quotes">Quotes ({scenarios.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="documents">Docs ({docs.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <div className="space-y-4">
            {/* Validation warnings */}
            {nextStage && (
              <StageValidationWarnings
                nextStage={nextStage}
                workflowContext={workflowContext}
              />
            )}

            {/* Dependency check for closing */}
            {caseData.stage !== "closed" && (
              <DependencyCheckPanel tasks={tasks} caseData={caseData} />
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-4">
            <div className="xl:col-span-2 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <CaseInfoCard label="Employee Count"    value={caseData.employee_count || "—"}                                           icon={Users} />
                <CaseInfoCard label="Census Status"     value={<StatusBadge status={caseData.census_status || "not_started"} />}         icon={FileCheck} />
                <CaseInfoCard label="Quote Status"      value={<StatusBadge status={caseData.quote_status || "not_started"} />}          icon={FileText} />
                <CaseInfoCard label="Enrollment Status" value={<StatusBadge status={caseData.enrollment_status || "not_started"} />}     icon={ClipboardCheck} />
                <CaseInfoCard label="Priority"          value={<StatusBadge status={caseData.priority || "normal"} />}                   icon={AlertTriangle} />
                <CaseInfoCard label="Assigned To"       value={caseData.assigned_to || "Unassigned"}                                     icon={Briefcase} />
              </div>

              {caseData.products_requested?.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Products Requested</p>
                    <div className="flex flex-wrap gap-2">
                      {caseData.products_requested.map(p => (
                        <Badge key={p} variant="secondary" className="capitalize text-sm px-3 py-1">{p}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {caseData.notes && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</p>
                    <p className="text-sm leading-relaxed">{caseData.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <div>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Lifecycle Checklist</p>
                  <LifecycleChecklist
                    caseData={caseData}
                    censusCount={censusVersions.length}
                    scenarioCount={scenarios.length}
                    taskCount={tasks.length}
                    docCount={docs.length}
                    txQuoteComplete={txQuoteComplete}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Census */}
        <TabsContent value="census" className="mt-4">
          <CaseCensusTab
            caseId={caseId}
            censusVersions={censusVersions}
            onOpenTxQuote={() => setShowTxQuote(true)}
            txQuoteAvailable={!txQuoteDisabledReason}
          />
        </TabsContent>

        {/* Quotes */}
        <TabsContent value="quotes" className="mt-4">
          <CaseQuotesTab caseId={caseId} scenarios={scenarios} />
        </TabsContent>

        {/* Tasks */}
        <TabsContent value="tasks" className="mt-4">
          <CaseTasksTab caseId={caseId} employerName={caseData.employer_name} tasks={tasks} />
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab caseId={caseId} employerName={caseData.employer_name} />
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ActivityTab caseId={caseId} />
            </div>
            <div>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Change History</p>
                  <AuditTrailViewer activities={activityLog} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Modals ── */}
      {showEdit && (
        <CaseEditModal caseData={caseData} open={showEdit} onClose={() => setShowEdit(false)} />
      )}
      {showClone && (
        <CloneCaseModal caseData={caseData} isOpen={showClone} onClose={() => setShowClone(false)} />
      )}
      {showClose && (
        <CaseCloseModal caseData={caseData} open={showClose} onClose={() => setShowClose(false)} />
      )}
      {showAdvance && (
        <StageAdvanceModal
          caseData={caseData}
          nextStage={nextStage}
          nextStageLabel={STAGE_LABELS[nextStage]}
          workflowContext={workflowContext}
          open={showAdvance}
          onConfirm={() => advanceStageMutation.mutate(nextStage)}
          onClose={() => setShowAdvance(false)}
          isPending={advanceStageMutation.isPending}
        />
      )}
      {showTxQuote && (
        <TxQuoteOptionsModal
          open={showTxQuote}
          onClose={() => setShowTxQuote(false)}
        />
      )}

      {/* ── AI Assistant ── */}
      <AIAssistant caseContext={aiContext} />
    </div>
  );
}