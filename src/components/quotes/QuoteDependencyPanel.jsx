import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buildQuoteReadiness } from "@/components/quotes/quoteGovernanceEngine";

export default function QuoteDependencyPanel({ scenarios, cases, censusVersions, enrollments, renewals }) {
  // Scenarios whose case has no CensusVersion at all (no census uploaded for the parent case)
  const withoutCensus = scenarios.filter((scenario) => !censusVersions.some((version) => version.case_id === scenario.case_id));
  // Scenarios with no plan_count (unpriced: draft or never calculated)
  const withoutPlans = scenarios.filter((scenario) => !scenario.plan_count);
  const errored = scenarios.filter((scenario) => scenario.status === "error");
  // Cases where quoting is done (quote_status=completed) — downstream handoff count
  const completedQuoteCases = cases.filter((item) => item.quote_status === "completed");
  // Approved scenarios (approval_status field) blocked from enrollment handoff
  const notReadyForEnrollment = scenarios.filter((scenario) => {
    const caseRecord = cases.find((item) => item.id === scenario.case_id);
    const readiness = buildQuoteReadiness({ scenario, caseRecord, censusVersions, enrollments, renewals });
    return scenario.approval_status === "approved" && !readiness.checks.enrollmentCompatible;
  });
  // Enrollment windows linked to cases that have a completed quote scenario
  const completedQuoteCaseIds = new Set(scenarios.filter((s) => s.status === "completed").map((s) => s.case_id));
  const enrollmentHandoffs = enrollments.filter((e) => completedQuoteCaseIds.has(e.case_id));
  // Renewal cycles linked to cases with completed quote scenarios
  const renewalDependencies = renewals.filter((r) => completedQuoteCaseIds.has(r.case_id));

  const issues = [
    { label: "No case census", value: withoutCensus.length },
    { label: "Unpriced scenarios", value: withoutPlans.length },
    { label: "Calculation errors", value: errored.length },
    { label: "Blocked approvals", value: notReadyForEnrollment.length },
    { label: "Enrollment handoffs", value: enrollmentHandoffs.length },
    { label: "Renewal dependencies", value: renewalDependencies.length },
    { label: "Cases with quotes", value: completedQuoteCases.length },
  ];

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pricing Dependency Trace</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {issues.map((issue) => {
          const isWarning = issue.value > 0 && !["Enrollment handoffs", "Renewal dependencies", "Cases with quotes"].includes(issue.label);
          return (
          <div key={issue.label} className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{issue.label}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-2xl font-semibold tracking-tight">{issue.value}</span>
              {isWarning && (
                <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 bg-amber-50">Attention</Badge>
              )}
            </div>
          </div>
          );
        })}
      </CardContent>
    </Card>
  );
}