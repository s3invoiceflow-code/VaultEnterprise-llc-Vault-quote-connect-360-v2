import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Calendar, Users, ChevronDown, ChevronUp,
  Pencil, Trash2, AlertTriangle, CheckCircle, Clock, X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { format, parseISO, differenceInDays, isAfter } from "date-fns";
import EmptyState from "@/components/shared/EmptyState";
import CreateEnrollmentModal from "@/components/enrollment/CreateEnrollmentModal";

const STATUS_CONFIG = {
  scheduled: { color: "border-l-gray-400", badge: "bg-gray-100 text-gray-600", label: "Scheduled" },
  open:       { color: "border-l-blue-500", badge: "bg-blue-100 text-blue-700", label: "Open" },
  closing_soon: { color: "border-l-amber-500", badge: "bg-amber-100 text-amber-700", label: "Closing Soon" },
  closed:     { color: "border-l-slate-400", badge: "bg-slate-100 text-slate-600", label: "Closed" },
  finalized:  { color: "border-l-green-500", badge: "bg-green-100 text-green-700", label: "Finalized" },
};

const NEXT_STATUS = { scheduled: "open", open: "closing_soon", closing_soon: "closed", closed: "finalized" };
const NEXT_LABEL  = { scheduled: "Open Enrollment", open: "Mark Closing Soon", closing_soon: "Close Window", closed: "Finalize" };

function EditWindowModal({ window: win, open, onClose }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    employer_name: win?.employer_name || "",
    start_date: win?.start_date || "",
    end_date: win?.end_date || "",
    effective_date: win?.effective_date || "",
    total_eligible: win?.total_eligible || "",
    status: win?.status || "scheduled",
    notes: win?.notes || "",
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => base44.entities.EnrollmentWindow.update(win.id, {
      ...form,
      total_eligible: Number(form.total_eligible) || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments-all"] });
      toast({ title: "Window updated" });
      onClose();
    },
    onError: (err) => {
      toast({ title: "Update failed", description: err?.message || "Failed to update window.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Enrollment Window</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Employer Name</Label>
            <Input value={form.employer_name} onChange={e => set("employer_name", e.target.value)} className="mt-1.5" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} className="mt-1.5" /></div>
            <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} className="mt-1.5" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Effective Date</Label><Input type="date" value={form.effective_date} onChange={e => set("effective_date", e.target.value)} className="mt-1.5" /></div>
            <div><Label>Total Eligible</Label><Input type="number" value={form.total_eligible} onChange={e => set("total_eligible", e.target.value)} className="mt-1.5" /></div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["scheduled","open","closing_soon","closed","finalized"].map(s => (
                  <SelectItem key={s} value={s} className="capitalize">{STATUS_CONFIG[s]?.label || s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EnrollmentWindowsTab({ windows, enrollments, cases, isLoading }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);

  const enrollmentsByWindow = useMemo(() => {
    const map = {};
    enrollments.forEach(e => {
      if (!map[e.enrollment_window_id]) map[e.enrollment_window_id] = [];
      map[e.enrollment_window_id].push(e);
    });
    return map;
  }, [enrollments]);

  const filtered = useMemo(() => windows.filter(w => {
    const matchSearch = !search || w.employer_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || w.status === statusFilter;
    return matchSearch && matchStatus;
  }), [windows, search, statusFilter]);

  const advanceStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.EnrollmentWindow.update(id, {
      status,
      ...(status === "finalized" ? { finalized_at: new Date().toISOString() } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments-all"] });
      toast({ title: "Status updated" });
    },
    onError: (err) => {
      toast({ title: "Status update failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const deleteWindow = useMutation({
    mutationFn: (id) => base44.entities.EnrollmentWindow.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments-all"] });
      toast({ title: "Window deleted" });
    },
    onError: (err) => {
      toast({ title: "Delete failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />)}</div>;

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const count = windows.filter(w => w.status === status).length;
          return (
            <div key={status} className={`rounded-xl border-l-4 ${cfg.color} bg-card border px-3 py-2 cursor-pointer hover:shadow-sm`}
              onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}>
              <p className="text-xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by employer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([v, cfg]) => <SelectItem key={v} value={v}>{cfg.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || statusFilter !== "all") && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
            <X className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        )}
        <Button size="sm" className="h-9 gap-1.5 ml-auto" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5" /> New Window
        </Button>
      </div>

      {/* Window Cards */}
      {filtered.length === 0 ? (
        <EmptyState icon={Calendar} title="No enrollment windows"
          description="Create a new enrollment window to begin the employee benefits enrollment process."
          actionLabel="New Window" onAction={() => setShowCreate(true)} />
      ) : (
        <div className="space-y-3">
          {filtered.map(win => {
            const cfg = STATUS_CONFIG[win.status] || STATUS_CONFIG.scheduled;
            const winEnrollments = enrollmentsByWindow[win.id] || [];
            const total = win.total_eligible || winEnrollments.length || 1;
            const enrolledCount = winEnrollments.filter(e => e.status === "completed").length;
            const waivedCount = winEnrollments.filter(e => e.status === "waived").length;
            const invitedCount = winEnrollments.filter(e => e.status === "invited").length;
            const startedCount = winEnrollments.filter(e => e.status === "started").length;
            const pct = Math.round((enrolledCount / total) * 100);
            const endDate = win.end_date ? parseISO(win.end_date) : null;
            const daysLeft = endDate ? differenceInDays(endDate, new Date()) : null;
            const isExpanded = expanded[win.id];
            const nextStatus = NEXT_STATUS[win.status];

            return (
              <Card key={win.id} className={`border-l-4 ${cfg.color}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{win.employer_name || "Unnamed Window"}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                        {daysLeft !== null && ["open","closing_soon"].includes(win.status) && daysLeft >= 0 && (
                          <span className={`text-[10px] flex items-center gap-1 font-medium ${daysLeft <= 7 ? "text-amber-600" : "text-muted-foreground"}`}>
                            <Clock className="w-3 h-3" />
                            {daysLeft === 0 ? "Closes today" : `${daysLeft}d left`}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {win.start_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(parseISO(win.start_date), "MMM d")} — {win.end_date && format(parseISO(win.end_date), "MMM d, yyyy")}</span>}
                        {win.effective_date && <span>Eff. {format(parseISO(win.effective_date), "MMM d, yyyy")}</span>}
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{winEnrollments.length} employees</span>
                      </div>

                      {/* Participation bar */}
                      <div className="mt-2.5 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            <span className="text-green-600 font-medium">{enrolledCount}</span> enrolled ·{" "}
                            <span className="text-slate-500">{waivedCount}</span> waived ·{" "}
                            <span className="text-amber-600">{invitedCount + startedCount}</span> pending
                          </span>
                          <span className={`font-semibold ${pct >= 75 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-destructive"}`}>{pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                          <div className="bg-green-500 h-full transition-all" style={{ width: `${Math.round((enrolledCount / total) * 100)}%` }} />
                          <div className="bg-slate-300 h-full transition-all" style={{ width: `${Math.round((waivedCount / total) * 100)}%` }} />
                          <div className="bg-amber-300 h-full transition-all" style={{ width: `${Math.round(((invitedCount + startedCount) / total) * 100)}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      {nextStatus && (
                        <Button size="sm" className="h-7 text-xs"
                          onClick={() => advanceStatus.mutate({ id: win.id, status: nextStatus })}
                          disabled={advanceStatus.isPending}>
                          {NEXT_LABEL[win.status]}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(win)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { if (confirm("Delete this window?")) deleteWindow.mutate(win.id); }}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setExpanded(p => ({ ...p, [win.id]: !p[win.id] }))}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && winEnrollments.length > 0 && (
                    <div className="mt-4 pt-4 border-t space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Employees in this window</p>
                      {winEnrollments.map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-muted/40">
                          <div>
                            <span className="font-medium">{e.employee_name}</span>
                            <span className="text-muted-foreground ml-2">{e.employee_email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {e.coverage_tier && <span className="text-[10px] text-muted-foreground capitalize">{e.coverage_tier.replace(/_/g, " ")}</span>}
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                              e.status === "completed" ? "bg-green-100 text-green-700 border-green-200" :
                              e.status === "invited" ? "bg-amber-100 text-amber-700 border-amber-200" :
                              e.status === "started" ? "bg-blue-100 text-blue-700 border-blue-200" :
                              "bg-slate-100 text-slate-600 border-slate-200"
                            }`}>{e.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && <CreateEnrollmentModal open={showCreate} onClose={() => setShowCreate(false)} />}
      {editing && <EditWindowModal window={editing} open={!!editing} onClose={() => setEditing(null)} />}
    </div>
  );
}