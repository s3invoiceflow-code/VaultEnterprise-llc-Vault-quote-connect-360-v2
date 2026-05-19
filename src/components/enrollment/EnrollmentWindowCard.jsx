import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Calendar, Users, ChevronDown, ChevronUp, AlertTriangle, CheckCircle,
  Clock, ExternalLink, MoreHorizontal, Bell
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import StatusBadge from "@/components/shared/StatusBadge";
import EnrollmentMemberTable from "@/components/enrollment/EnrollmentMemberTable";
import { format, parseISO, differenceInDays, isAfter } from "date-fns";

const STATUS_ACTIONS = {
  scheduled: { next: "open", label: "Open Enrollment", color: "bg-blue-600 hover:bg-blue-700" },
  open: { next: "closing_soon", label: "Mark Closing Soon", color: "" },
  closing_soon: { next: "closed", label: "Close Window", color: "bg-amber-600 hover:bg-amber-700" },
  closed: { next: "finalized", label: "Finalize", color: "bg-green-600 hover:bg-green-700" },
};

export default function EnrollmentWindowCard({ enrollment }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const now = new Date();
  const endDate = enrollment.end_date ? parseISO(enrollment.end_date) : null;
  const daysRemaining = endDate ? differenceInDays(endDate, now) : null;
  const isClosingSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7;
  const isPastDeadline = endDate && !isAfter(endDate, now) && !["closed","finalized"].includes(enrollment.status);

  const total = enrollment.total_eligible || 1;
  const enrolled = enrollment.enrolled_count || 0;
  const waived = enrollment.waived_count || 0;
  const pending = Math.max(0, total - enrolled - waived);
  const pct = Math.round((enrolled / total) * 100);
  const participationColor = pct >= 75 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-destructive";

  const [statusError, setStatusError] = useState(null);

  const updateStatus = useMutation({
    mutationFn: (status) => base44.entities.EnrollmentWindow.update(enrollment.id, {
      status,
      ...(status === "finalized" ? { finalized_at: new Date().toISOString() } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments-all"] });
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      setStatusError(null);
    },
    onError: (err) => {
      setStatusError(err?.message || "Status update failed. Please try again.");
    },
  });

  const nextAction = STATUS_ACTIONS[enrollment.status];

  const BORDER_MAP = {
    scheduled: "border-l-gray-300",
    open: "border-l-blue-500",
    closing_soon: "border-l-amber-500",
    closed: "border-l-slate-400",
    finalized: "border-l-green-500",
  };

  return (
    <Card className={`border-l-4 ${BORDER_MAP[enrollment.status] || "border-l-gray-300"} overflow-hidden hover:shadow-md transition-all`}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={`/cases/${enrollment.case_id}`} className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1">
                {enrollment.employer_name || "Unknown Employer"}
                <ExternalLink className="w-3 h-3 opacity-50" />
              </Link>
              <StatusBadge status={enrollment.status} />
              {isClosingSoon && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  <AlertTriangle className="w-2.5 h-2.5" /> Closes in {daysRemaining}d
                </span>
              )}
              {isPastDeadline && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                  <AlertTriangle className="w-2.5 h-2.5" /> Past Deadline
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {enrollment.start_date && format(parseISO(enrollment.start_date), "MMM d")}
                {" — "}
                {enrollment.end_date && format(parseISO(enrollment.end_date), "MMM d, yyyy")}
              </span>
              {enrollment.effective_date && (
                <span>Eff. {format(parseISO(enrollment.effective_date), "MMM d, yyyy")}</span>
              )}
              {daysRemaining !== null && ["open","closing_soon"].includes(enrollment.status) && daysRemaining >= 0 && (
                <span className={`flex items-center gap-1 font-medium ${isClosingSoon ? "text-amber-600" : "text-muted-foreground"}`}>
                  <Clock className="w-3 h-3" />
                  {daysRemaining === 0 ? "Closes today" : `${daysRemaining}d remaining`}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {nextAction && (
              <Button
                size="sm"
                className={`h-7 text-xs ${nextAction.color}`}
                onClick={() => updateStatus.mutate(nextAction.next)}
                disabled={updateStatus.isPending}
              >
                {nextAction.label}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {Object.entries(STATUS_ACTIONS).map(([from, action]) => (
                  from !== enrollment.status && (
                    <DropdownMenuItem key={from} onClick={() => updateStatus.mutate(action.next)}>
                      Set: {action.label}
                    </DropdownMenuItem>
                  )
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={`/cases/${enrollment.case_id}`} className="flex items-center gap-2">
                    <ExternalLink className="w-3.5 h-3.5" /> Open Case
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {statusError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-1.5 mb-2">{statusError}</p>
        )}
        {/* Participation Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              <span className="text-green-600 font-medium">{enrolled}</span> enrolled ·{" "}
              <span className="text-amber-600 font-medium">{waived}</span> waived ·{" "}
              <span className="text-muted-foreground">{pending}</span> pending
              {enrollment.total_eligible && <span className="ml-1">of {enrollment.total_eligible} eligible</span>}
            </span>
            <span className={`font-semibold ${participationColor}`}>{pct}% participation</span>
          </div>

          {/* Stacked bar: enrolled | waived | pending */}
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            <div className="bg-green-500 h-full transition-all" style={{ width: `${Math.round((enrolled / total) * 100)}%` }} />
            <div className="bg-gray-300 h-full transition-all" style={{ width: `${Math.round((waived / total) * 100)}%` }} />
          </div>

          {/* Milestone indicators */}
          {pct < 75 && ["open","closing_soon"].includes(enrollment.status) && (
            <p className="text-[10px] text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {75 - pct}% below minimum participation threshold (75%)
            </p>
          )}
        </div>

        {/* Expanded member table */}
        {expanded && (
          <div className="mt-4 pt-4 border-t">
            <EnrollmentMemberTable enrollmentWindowId={enrollment.id} caseId={enrollment.case_id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}