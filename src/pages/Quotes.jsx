import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, Search, Filter, GitCompare, ChevronDown, ChevronUp,
  AlertTriangle, SortAsc, X, XCircle, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import QuotesKPIBar from "@/components/quotes/QuotesKPIBar";
import QuotesSystemSummary from "@/components/quotes/QuotesSystemSummary";
import QuoteDependencyPanel from "@/components/quotes/QuoteDependencyPanel";
import ScenarioCard from "@/components/quotes/ScenarioCard";
import ScenarioCompare from "@/components/quotes/ScenarioCompare";
import NewScenarioFromQuotes from "@/components/quotes/NewScenarioFromQuotes";
import QuoteScenarioModal from "@/components/quotes/QuoteScenarioModal";
import ScenarioDetailModal from "@/components/quotes/ScenarioDetailModal";
import ApprovalModal from "@/components/quotes/ApprovalModal";
import ContributionSlider from "@/components/quotes/ContributionSlider";
import SavedViewsPanel from "@/components/quotes/SavedViewsPanel";
import QuotePipelinePanel from "@/components/quotes/QuotePipelinePanel";
import QuoteControlCenter from "@/components/quotes/QuoteControlCenter";
import QuoteValidationDeck from "@/components/quotes/QuoteValidationDeck";
import QuoteInsightsPanel from "@/components/quotes/QuoteInsightsPanel";
import QuoteActivityFeed from "@/components/quotes/QuoteActivityFeed";
import { buildQuoteReadiness, buildScenarioVersionSnapshot, appendScenarioVersion } from "@/components/quotes/quoteGovernanceEngine";
import { useToast } from "@/components/ui/use-toast";
import { parseISO, isAfter, addDays } from "date-fns";

export default function Quotes() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [caseFilter, setCaseFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_date");
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [compareMode, setCompareMode] = useState(false);
  const [showNewScenario, setShowNewScenario] = useState(false);
  const [editingScenario, setEditingScenario] = useState(null);
  const [calculating, setCalculating] = useState(null);
  const [collapsedCases, setCollapsedCases] = useState({});
  const [groupByCaseMode, setGroupByCaseMode] = useState(true);
  const [carrierFilter, setCarrierFilter] = useState("all");
  const [bulkCalculating, setBulkCalculating] = useState(false);
  const [scenarioDetailModal, setScenarioDetailModal] = useState(null);
  const [approvalModal, setApprovalModal] = useState(null);
  const [contributionModal, setContributionModal] = useState(null);

  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ["scenarios-all"],
    queryFn: () => base44.entities.QuoteScenario.list("-created_date", 200),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ["cases"],
    queryFn: () => base44.entities.BenefitCase.list("-created_date", 100),
  });

  const { data: censusVersions = [] } = useQuery({
    queryKey: ["quotes-census-versions"],
    queryFn: () => base44.entities.CensusVersion.list("-created_date", 300),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["quotes-enrollments"],
    queryFn: () => base44.entities.EnrollmentWindow.list("-created_date", 200),
  });

  const { data: renewals = [] } = useQuery({
    queryKey: ["quotes-renewals"],
    queryFn: () => base44.entities.RenewalCycle.list("-created_date", 200),
  });

  const { data: activityLogs = [] } = useQuery({
    queryKey: ["quotes-activity-logs"],
    queryFn: () => base44.entities.ActivityLog.list("-created_date", 100),
  });

  const caseMap = useMemo(() => Object.fromEntries(cases.map(c => [c.id, c])), [cases]);

  const now = new Date();
  const expiringSoon = useMemo(() => scenarios.filter(s => {
    if (!s.expires_at || s.status === "expired") return false;
    const exp = parseISO(s.expires_at);
    return isAfter(exp, now) && !isAfter(exp, addDays(now, 14));
  }), [scenarios]);

  const employers = useMemo(() => {
    const map = {};
    scenarios.forEach(s => {
      const c = caseMap[s.case_id];
      if (c?.employer_name) map[s.case_id] = c.employer_name;
    });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [scenarios, caseMap]);

  const allCarriers = useMemo(() => {
    const set = new Set();
    scenarios.forEach(s => s.carriers_included?.forEach(c => set.add(c)));
    return Array.from(set).sort();
  }, [scenarios]);

  const filtered = useMemo(() => {
    let result = scenarios.filter(s => {
      const c = caseMap[s.case_id];
      const q = search.toLowerCase();
      const matchSearch = !search ||
        s.name?.toLowerCase().includes(q) ||
        c?.employer_name?.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      const matchCase = caseFilter === "all" || s.case_id === caseFilter;
      const matchExpiring = !showExpiringOnly || expiringSoon.some(e => e.id === s.id);
      const matchCarrier = carrierFilter === "all" || s.carriers_included?.includes(carrierFilter);
      return matchSearch && matchStatus && matchCase && matchExpiring && matchCarrier;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === "premium") return (b.total_monthly_premium || 0) - (a.total_monthly_premium || 0);
      if (sortBy === "expiry") {
        if (!a.expires_at && !b.expires_at) return 0;
        if (!a.expires_at) return 1;
        if (!b.expires_at) return -1;
        return parseISO(a.expires_at) - parseISO(b.expires_at);
      }
      if (sortBy === "score") return (b.recommendation_score || 0) - (a.recommendation_score || 0);
      return new Date(b.created_date) - new Date(a.created_date);
    });

    return result;
  }, [scenarios, search, statusFilter, caseFilter, showExpiringOnly, sortBy, caseMap, expiringSoon, carrierFilter]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(s => {
      const key = s.case_id || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return Object.entries(groups).map(([caseId, items]) => ({
      caseId,
      caseName: caseMap[caseId]?.employer_name || "Unknown Employer",
      caseNumber: caseMap[caseId]?.case_number || caseId.slice(-6),
      stage: caseMap[caseId]?.stage,
      items,
    }));
  }, [filtered, caseMap]);

  const handleCalculate = async (scenario) => {
    setCalculating(scenario.id);
    try {
      await base44.entities.QuoteScenario.update(scenario.id, { status: "running" });
      queryClient.invalidateQueries({ queryKey: ["scenarios-all"] });
      const res = await base44.functions.invoke("calculateQuoteRates", { scenario_id: scenario.id });
      if (res.data?.error) throw new Error(res.data.error);

      const refreshedScenario = scenarios.find((item) => item.id === scenario.id) || scenario;
      await base44.entities.QuoteScenario.update(scenario.id, {
        status: "reviewed",
        versions: appendScenarioVersion(refreshedScenario.versions || [], buildScenarioVersionSnapshot({
          ...refreshedScenario,
          status: "reviewed",
          total_monthly_premium: res.data.total_monthly_premium,
          employer_monthly_cost: res.data.employer_monthly_cost,
          employee_monthly_cost_avg: res.data.employee_monthly_cost_avg,
          plan_count: res.data.plan_results?.length || 0,
          census_version_id: res.data.census?.censusVersionId,
        })),
      });

      queryClient.invalidateQueries({ queryKey: ["scenarios-all"] });
      toast({
        title: "Rates calculated",
        description: `$${res.data.total_monthly_premium?.toLocaleString()}/mo across ${res.data.plan_results?.length || 0} plans`,
      });
    } catch (e) {
      await base44.entities.QuoteScenario.update(scenario.id, { status: "error" });
      queryClient.invalidateQueries({ queryKey: ["scenarios-all"] });
      toast({ title: "Calculation failed", description: e.message, variant: "destructive" });
    } finally {
      setCalculating(null);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const selectedScenarios = scenarios.filter(s => selectedIds.includes(s.id));

  const toggleCase = (caseId) => {
    setCollapsedCases(prev => ({ ...prev, [caseId]: !prev[caseId] }));
  };

  const activeFilters = [
    search && { label: `"${search}"`, clear: () => setSearch("") },
    statusFilter !== "all" && { label: statusFilter, clear: () => setStatusFilter("all") },
    caseFilter !== "all" && { label: employers.find(e => e.id === caseFilter)?.name, clear: () => setCaseFilter("all") },
    showExpiringOnly && { label: "Expiring soon", clear: () => setShowExpiringOnly(false) },
    carrierFilter !== "all" && { label: carrierFilter, clear: () => setCarrierFilter("all") },
  ].filter(Boolean);

  const draftScenarios = filtered.filter(s => s.status === "draft");

  const readinessItems = useMemo(() => {
    const invalidCensus = scenarios.filter((scenario) => {
      const readiness = buildQuoteReadiness({ scenario, caseRecord: caseMap[scenario.case_id], censusVersions, enrollments, renewals });
      return !readiness.checks.censusValidated;
    }).length;

    const missingPlans = scenarios.filter((scenario) => !Number(scenario.plan_count || 0)).length;
    const blockedEnrollment = scenarios.filter((scenario) => {
      const readiness = buildQuoteReadiness({ scenario, caseRecord: caseMap[scenario.case_id], censusVersions, enrollments, renewals });
      return scenario.approval_status === "approved" && !readiness.checks.enrollmentCompatible;
    }).length;

    const blockedRenewal = scenarios.filter((scenario) => {
      const readiness = buildQuoteReadiness({ scenario, caseRecord: caseMap[scenario.case_id], censusVersions, enrollments, renewals });
      return scenario.approval_status === "approved" && !readiness.checks.renewalCompatible;
    }).length;

    return [
      { label: "Census validation", value: invalidCensus, detail: "Quotes without validated census inputs.", href: "/census" },
      { label: "Plan mapping", value: missingPlans, detail: "Scenarios missing priced plan selections.", href: "/plans" },
      { label: "Enrollment compatibility", value: blockedEnrollment, detail: "Approved quotes blocked from enrollment handoff.", href: "/enrollment" },
      { label: "Renewal compatibility", value: blockedRenewal, detail: "Approved quotes not ready for renewal workflows.", href: "/renewals" },
    ];
  }, [scenarios, caseMap, censusVersions, enrollments, renewals]);

  const quoteInsights = useMemo(() => {
    const completed = scenarios.filter((scenario) => scenario.status === "completed");
    const totalPremium = completed.reduce((sum, scenario) => sum + Number(scenario.total_monthly_premium || 0), 0);
    const totalEmployer = completed.reduce((sum, scenario) => sum + Number(scenario.employer_monthly_cost || 0), 0);
    const totalEmployee = completed.reduce((sum, scenario) => sum + Math.max(0, Number(scenario.total_monthly_premium || 0) - Number(scenario.employer_monthly_cost || 0)), 0);
    const tracedEmployees = cases.reduce((sum, item) => sum + Number(item.employee_count || 0), 0);
    const costPerEmployee = tracedEmployees > 0 ? Math.round(totalPremium / tracedEmployees) : 0;
    const priorQuotes = scenarios.filter((scenario) => Array.isArray(scenario.versions) && scenario.versions.length > 1).length;

    // "Approved" — uses approval_status field (not status); status enum has no "approved" value
    const approvedCount = scenarios.filter((scenario) => scenario.approval_status === "approved").length;
    // "Converted" — proxy: completed scenarios whose parent case has enrollment_status open/in_progress/completed
    const convertedCount = scenarios.filter((scenario) => {
      if (scenario.status !== "completed") return false;
      const c = cases.find((item) => item.id === scenario.case_id);
      return c && ["open", "in_progress", "completed"].includes(c.enrollment_status);
    }).length;

    return [
      { label: "Total Premium", value: `$${totalPremium.toLocaleString()}`, detail: "Sum of monthly premium across completed scenarios." },
      { label: "Employer Split", value: `$${totalEmployer.toLocaleString()}`, detail: "Employer monthly contribution across completed scenarios." },
      { label: "Employee Split", value: `$${totalEmployee.toLocaleString()}`, detail: "Employee monthly responsibility across completed scenarios." },
      { label: "Cost / Employee", value: costPerEmployee ? `$${costPerEmployee}` : "—", detail: "Total completed premium ÷ employee_count on case records." },
      { label: "Versioned Quotes", value: priorQuotes, detail: "Scenarios with 2+ saved historical version snapshots." },
      { label: "Risk Flags", value: scenarios.filter((scenario) => scenario.status === "error" || scenario.status === "expired").length, detail: "Scenarios in error or expired state requiring action." },
      { label: "Approved", value: approvedCount, detail: "Scenarios with approval_status = approved." },
      { label: "Converted", value: convertedCount, detail: "Completed scenarios whose case has an active enrollment window." },
    ];
  }, [scenarios, cases]);

  const quoteActivity = useMemo(() => activityLogs
    .filter((item) => item.entity_type === "QuoteScenario" || item.action?.toLowerCase().includes("quote") || item.action?.toLowerCase().includes("scenario"))
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.action,
      detail: item.detail || item.actor_name || item.actor_email || "Quote activity",
      time: new Date(item.created_date).toLocaleDateString(),
    })), [activityLogs]);

  const handleCalculateAllDrafts = async () => {
    if (!draftScenarios.length) return;
    setBulkCalculating(true);
    let success = 0, fail = 0;
    for (const s of draftScenarios) {
      try {
        await base44.entities.QuoteScenario.update(s.id, { status: "running" });
        const res = await base44.functions.invoke("calculateQuoteRates", { scenario_id: s.id });
        if (res.data?.error) throw new Error(res.data.error);
        success++;
      } catch {
        await base44.entities.QuoteScenario.update(s.id, { status: "error" });
        fail++;
      }
    }
    queryClient.invalidateQueries({ queryKey: ["scenarios-all"] });
    setBulkCalculating(false);
    toast?.({ title: `Bulk calculation complete`, description: `${success} succeeded, ${fail} failed.` });
  };

  const handleBulkExpire = async () => {
    await Promise.all(selectedIds.map(id => base44.entities.QuoteScenario.update(id, { status: "expired", expires_at: new Date().toISOString() })));
    queryClient.invalidateQueries({ queryKey: ["scenarios-all"] });
    setSelectedIds([]);
    toast?.({ title: `${selectedIds.length} scenarios marked expired` });
  };

  const handleBulkDelete = async () => {
    await Promise.all(selectedIds.map(id => base44.entities.QuoteScenario.delete(id)));
    queryClient.invalidateQueries({ queryKey: ["scenarios-all"] });
    setSelectedIds([]);
    toast?.({ title: `${selectedIds.length} scenarios deleted` });
  };

  const handleBulkExportCSV = () => {
    const headers = ["Name", "Status", "Employer", "Premium", "Employer Cost", "Employee Cost", "Plans", "Carriers", "Score", "Recommended"];
    const rows = selectedScenarios.map(s => [
      s.name,
      s.status,
      caseMap[s.case_id]?.employer_name || "",
      s.total_monthly_premium || "",
      s.employer_monthly_cost || "",
      s.employee_monthly_cost_avg || "",
      s.plan_count || "",
      s.carriers_included?.join(";") || "",
      s.recommendation_score || "",
      s.is_recommended ? "Yes" : "No",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scenarios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast?.({ title: "Export started" });
  };

  const handleLoadPreset = (filters) => {
    if (filters.search !== undefined) setSearch(filters.search || "");
    if (filters.statusFilter !== undefined) setStatusFilter(filters.statusFilter);
    if (filters.caseFilter !== undefined) setCaseFilter(filters.caseFilter);
    if (filters.carrierFilter !== undefined) setCarrierFilter(filters.carrierFilter);
    if (filters.showExpiringOnly !== undefined) setShowExpiringOnly(filters.showExpiringOnly);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setShowNewScenario(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedIds.length >= 2) {
        e.preventDefault();
        setCompareMode(true);
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectedIds]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        description="View, calculate, and compare quote scenarios"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {expiringSoon.length > 0 && (
              <button
                onClick={() => setShowExpiringOnly(v => !v)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  showExpiringOnly
                    ? "bg-orange-100 text-orange-700 border-orange-300"
                    : "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {expiringSoon.length} expiring soon
              </button>
            )}

            <SavedViewsPanel
              currentFilters={{ search, statusFilter, caseFilter, carrierFilter, showExpiringOnly }}
              onLoadPreset={handleLoadPreset}
            />

            <Button onClick={() => setShowNewScenario(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Scenario
            </Button>
          </div>
        }
      />

      <QuotesSystemSummary scenarios={scenarios} cases={cases} enrollments={enrollments} renewals={renewals} />

      <QuotePipelinePanel scenarios={scenarios} />

      <QuotesKPIBar scenarios={filtered.length ? filtered : scenarios} />

      <QuoteDependencyPanel scenarios={scenarios} cases={cases} censusVersions={censusVersions} enrollments={enrollments} renewals={renewals} />

      <QuoteValidationDeck items={readinessItems} />

      <QuoteInsightsPanel insights={quoteInsights} />

      {compareMode && selectedScenarios.length >= 2 && (
        <ScenarioCompare
          scenarios={selectedScenarios}
          onClose={() => { setCompareMode(false); setSelectedIds([]); }}
        />
      )}

      <QuoteControlCenter
        groupByCaseMode={groupByCaseMode}
        setGroupByCaseMode={setGroupByCaseMode}
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        caseFilter={caseFilter}
        setCaseFilter={setCaseFilter}
        employers={employers}
        sortBy={sortBy}
        setSortBy={setSortBy}
        allCarriers={allCarriers}
        carrierFilter={carrierFilter}
        setCarrierFilter={setCarrierFilter}
        activeFilters={activeFilters}
        clearAll={() => { setSearch(""); setStatusFilter("all"); setCaseFilter("all"); setShowExpiringOnly(false); setCarrierFilter("all"); }}
        filteredCount={filtered.length}
      />

      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap -mt-2">
          {activeFilters.map((f, i) => (
            <button
              key={i}
              onClick={f.clear}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              {f.label} <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-xs font-medium text-primary">{selectedIds.length} selected</span>
          <div className="flex items-center gap-1.5 ml-auto">
            {selectedIds.length >= 2 && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCompareMode(v => !v)}>
                <GitCompare className="w-3.5 h-3.5 mr-1.5" /> Compare
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleBulkExportCSV}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50" onClick={handleBulkExpire}>
              <XCircle className="w-3.5 h-3.5 mr-1.5" /> Mark Expired
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/20 hover:bg-destructive/5" onClick={handleBulkDelete}>
              Delete Selected
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds([])}>
              <X className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      {draftScenarios.length > 1 && (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 border border-amber-200">
          <span className="text-xs text-amber-800 font-medium">{draftScenarios.length} scenarios waiting to be calculated</span>
          <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" onClick={handleCalculateAllDrafts} disabled={bulkCalculating}>
            {bulkCalculating ? "Calculating all…" : `Calculate All (${draftScenarios.length})`}
          </Button>
        </div>
      )}

      {!compareMode && selectedIds.length > 0 && selectedIds.length < 2 && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
          Select {2 - selectedIds.length} more scenario{2 - selectedIds.length !== 1 ? "s" : ""} to enable comparison (max 4).
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Quote Scenarios"
          description={scenarios.length === 0 ? "Create a new scenario to start quoting" : "No scenarios match your current filters"}
          actionLabel={scenarios.length === 0 ? "New Scenario" : undefined}
          onAction={scenarios.length === 0 ? () => setShowNewScenario(true) : undefined}
        />
      ) : groupByCaseMode ? (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.caseId} className="border rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors"
                onClick={() => toggleCase(group.caseId)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-sm font-semibold">{group.caseName}</span>
                  <span className="text-xs text-muted-foreground"># {group.caseNumber}</span>
                  {group.stage && (
                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full capitalize">
                      {group.stage.replace(/_/g, " ")}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px]">{group.items.length} scenario{group.items.length !== 1 ? "s" : ""}</Badge>
                  {group.items.some(s => s.is_recommended) && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      ✓ {group.items.find(s => s.is_recommended)?.name}
                    </span>
                  )}
                </div>
                {collapsedCases[group.caseId] ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
              </button>

              {!collapsedCases[group.caseId] && (
                <div className="p-3 space-y-2 bg-card">
                  {group.items.map(s => (
                    <ScenarioCard
                      key={s.id}
                      scenario={s}
                      isSelected={selectedIds.includes(s.id)}
                      onToggleSelect={toggleSelect}
                      onEdit={setEditingScenario}
                      onShowDetails={() => setScenarioDetailModal(s)}
                      onApproval={() => setApprovalModal(s)}
                      onContribution={() => setContributionModal(s)}
                      calculating={calculating}
                      onCalculate={handleCalculate}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <ScenarioCard
              key={s.id}
              scenario={s}
              isSelected={selectedIds.includes(s.id)}
              onToggleSelect={toggleSelect}
              onEdit={setEditingScenario}
              onShowDetails={() => setScenarioDetailModal(s)}
              onApproval={() => setApprovalModal(s)}
              onContribution={() => setContributionModal(s)}
              calculating={calculating}
              onCalculate={handleCalculate}
            />
          ))}
        </div>
      )}

      <QuoteActivityFeed items={quoteActivity} />

      {showNewScenario && (
        <NewScenarioFromQuotes open={showNewScenario} onClose={() => setShowNewScenario(false)} />
      )}
      {editingScenario && (
        <QuoteScenarioModal
          caseId={editingScenario.case_id}
          scenario={editingScenario}
          open={!!editingScenario}
          onClose={() => setEditingScenario(null)}
        />
      )}
      {scenarioDetailModal && (
        <ScenarioDetailModal
          scenario={scenarioDetailModal}
          open={!!scenarioDetailModal}
          onClose={() => setScenarioDetailModal(null)}
        />
      )}
      {approvalModal && (
        <ApprovalModal
          scenario={approvalModal}
          open={!!approvalModal}
          onClose={() => setApprovalModal(null)}
        />
      )}
      {contributionModal && (
        <ContributionSlider
          scenario={contributionModal}
          open={!!contributionModal}
          onClose={() => setContributionModal(null)}
        />
      )}
    </div>
  );
}