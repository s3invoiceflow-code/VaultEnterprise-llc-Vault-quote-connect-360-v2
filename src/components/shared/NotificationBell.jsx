import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bell, AlertTriangle, Clock, RefreshCw, ClipboardCheck, CheckCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, isPast, isWithinInterval, addDays } from "date-fns";

function useAlerts() {
  const today = new Date();

  const { data: tasks = [] } = useQuery({
    queryKey: ["alerts-tasks"],
    queryFn: () => base44.entities.CaseTask.filter({ status: "pending" }, "-due_date", 50),
    refetchInterval: 120000,
  });

  const { data: scenarios = [] } = useQuery({
    queryKey: ["alerts-scenarios"],
    queryFn: () => base44.entities.QuoteScenario.list("-created_date", 50),
    refetchInterval: 120000,
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["alerts-enrollments"],
    queryFn: () => base44.entities.EnrollmentWindow.list("-end_date", 20),
    refetchInterval: 120000,
  });

  const { data: renewals = [] } = useQuery({
    queryKey: ["alerts-renewals"],
    queryFn: () => base44.entities.RenewalCycle.list("-renewal_date", 20),
    refetchInterval: 120000,
  });

  const alerts = [];

  // Overdue tasks
  tasks.filter(t => t.due_date && isPast(new Date(t.due_date))).slice(0, 5).forEach(t =>
    alerts.push({
      id: `task-overdue-${t.id}`,
      type: "danger",
      icon: AlertTriangle,
      title: "Overdue Task",
      body: t.title,
      sub: t.employer_name,
      path: "/tasks",
    })
  );

  // Expiring quotes (within 7 days)
  scenarios.filter(s => s.expires_at && isWithinInterval(new Date(s.expires_at), { start: today, end: addDays(today, 7) })).slice(0, 3).forEach(s =>
    alerts.push({
      id: `quote-expiring-${s.id}`,
      type: "warning",
      icon: Clock,
      title: "Quote Expiring Soon",
      body: s.name,
      sub: `Expires ${format(new Date(s.expires_at), "MMM d")}`,
      path: `/cases/${s.case_id}`,
    })
  );

  // Closing enrollments
  enrollments.filter(e => ["open","closing_soon"].includes(e.status) && e.end_date && isWithinInterval(new Date(e.end_date), { start: today, end: addDays(today, 5) })).slice(0, 3).forEach(e =>
    alerts.push({
      id: `enroll-closing-${e.id}`,
      type: "warning",
      icon: ClipboardCheck,
      title: "Enrollment Closing",
      body: e.employer_name || "Enrollment Window",
      sub: `Closes ${format(new Date(e.end_date), "MMM d")}`,
      path: "/enrollment",
    })
  );

  // Upcoming renewals (within 90 days)
  renewals.filter(r => r.renewal_date && isWithinInterval(new Date(r.renewal_date), { start: today, end: addDays(today, 90) }) && !["completed"].includes(r.status)).slice(0, 3).forEach(r =>
    alerts.push({
      id: `renewal-${r.id}`,
      type: "info",
      icon: RefreshCw,
      title: "Renewal Approaching",
      body: r.employer_name || "Renewal",
      sub: format(new Date(r.renewal_date), "MMM d, yyyy"),
      path: "/renewals",
    })
  );

  return alerts;
}

const TYPE_STYLES = {
  danger: "text-red-600 bg-red-50 border-red-100",
  warning: "text-amber-600 bg-amber-50 border-amber-100",
  info: "text-blue-600 bg-blue-50 border-blue-100",
};

const BADGE_STYLES = {
  danger: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("qc360_dismissed_alerts") || "[]"); } catch { return []; }
  });
  const panelRef = useRef(null);
  const allAlerts = useAlerts();
  const visible = allAlerts.filter(a => !dismissed.includes(a.id));

  useEffect(() => {
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem("qc360_dismissed_alerts", JSON.stringify(next));
  };

  const dismissAll = () => {
    const next = allAlerts.map(a => a.id);
    setDismissed(next);
    localStorage.setItem("qc360_dismissed_alerts", JSON.stringify(next));
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <Button variant="ghost" size="icon" className="relative h-9 w-9" onClick={() => setOpen(o => !o)}>
        <Bell className="w-4 h-4" />
        {visible.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {visible.length > 9 ? "9+" : visible.length}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-1rem))] bg-popover border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Alerts</span>
              {visible.length > 0 && <Badge className="h-4 px-1.5 text-[10px]">{visible.length}</Badge>}
            </div>
            {visible.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-6 text-muted-foreground" onClick={dismissAll}>
                Clear all
              </Button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                <p className="text-sm font-medium">All clear!</p>
                <p className="text-xs text-muted-foreground mt-0.5">No alerts at this time</p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {visible.map(alert => {
                  const Icon = alert.icon;
                  return (
                    <div key={alert.id} className={cn("flex items-start gap-3 p-3 rounded-lg border text-sm", TYPE_STYLES[alert.type])}>
                      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xs uppercase tracking-wide opacity-70">{alert.title}</p>
                        <Link to={alert.path} onClick={() => setOpen(false)} className="font-medium hover:underline truncate block">{alert.body}</Link>
                        {alert.sub && <p className="text-xs opacity-70 mt-0.5">{alert.sub}</p>}
                      </div>
                      <button onClick={() => dismiss(alert.id)} className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity mt-0.5">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}