import React from "react";
import { Link } from "react-router-dom";
import { Users, ClipboardCheck, FileText, RefreshCw, Briefcase, AlertTriangle } from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";

export default function SystemControlMetrics({ metrics }) {
  const items = [
    { label: "Eligible Members", value: metrics.totalEligibleMembers, trendLabel: metrics.totalEligible === 0 ? "No windows yet" : `${metrics.totalEligible} window eligible`, icon: Users, href: "/employee-management" },
    { label: "Enrollment Completion", value: `${metrics.enrollmentCompletion}%`, trendLabel: metrics.totalEligibleMembers === 0 ? "No eligible members" : `${metrics.enrolledEmployees} of ${metrics.totalEligibleMembers} enrolled`, icon: ClipboardCheck, href: "/enrollment" },
    { label: "Active Quote Pipeline", value: metrics.quotePipeline, trendLabel: `${metrics.quoteCompleted} completed`, icon: FileText, href: "/quotes" },
    { label: "Renewal Pipeline", value: metrics.renewalPipeline, trendLabel: `${metrics.renewalOverdue} overdue`, icon: RefreshCw, href: "/renewals" },
    { label: "Open Cases", value: metrics.openCases, trendLabel: `${metrics.totalCases} total`, icon: Briefcase, href: "/cases" },
    { label: "Workflow Risk", value: metrics.slaRisk, trendLabel: metrics.slaRisk > 0 ? "Needs action" : "Healthy", icon: AlertTriangle, href: "/cases" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <Link key={item.label} to={item.href} className="rounded-2xl focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-2">
          <MetricCard
            label={item.label}
            value={item.value}
            icon={item.icon}
            trend={item.label === "SLA Risk" && metrics.slaRisk > 0 ? "down" : undefined}
            trendLabel={item.trendLabel}
            className="h-full hover:border-primary/30 hover:bg-card/100"
          />
        </Link>
      ))}
    </div>
  );
}