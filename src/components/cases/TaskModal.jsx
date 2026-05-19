import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function TaskModal({ caseId, employerName, task, open, onClose, cases = [] }) {
  const queryClient = useQueryClient();
  const isEdit = !!task;

  const [form, setForm] = useState({
    title: task?.title || "",
    description: task?.description || "",
    task_type: task?.task_type || "action_required",
    priority: task?.priority || "normal",
    assigned_to: task?.assigned_to || "",
    due_date: task?.due_date || "",
    status: task?.status || "pending",
    case_id: task?.case_id || caseId || "",
    employer_name: task?.employer_name || employerName || "",
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // When a case is selected from dropdown, also populate employer_name
  const handleCaseSelect = (id) => {
    const c = cases.find(c => c.id === id);
    set("case_id", id);
    if (c) set("employer_name", c.employer_name || "");
  };

  const [saveError, setSaveError] = useState(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      if (!payload.case_id) delete payload.case_id;
      return isEdit
        ? base44.entities.CaseTask.update(task.id, payload)
        : base44.entities.CaseTask.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-tasks", form.case_id] });
      queryClient.invalidateQueries({ queryKey: ["tasks-all"] });
      queryClient.invalidateQueries({ queryKey: ["tasks-pending"] });
      setSaveError(null);
      onClose();
    },
    onError: (err) => {
      setSaveError(err?.message || "Failed to save task. Please try again.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} className="mt-1.5" placeholder="What needs to be done?" />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} className="mt-1.5" placeholder="Optional details..." />
          </div>

          {/* Case association — only show dropdown when creating from the global Tasks page (cases available) */}
          {cases.length > 0 && !caseId && (
            <div>
              <Label>Associated Case</Label>
              <Select value={form.case_id || "__none__"} onValueChange={v => v === "__none__" ? (set("case_id", ""), set("employer_name", "")) : handleCaseSelect(v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a case (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No case —</SelectItem>
                  {cases.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.employer_name || "Unnamed"} · {c.case_number || c.id.slice(-6)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Show linked case name when already tied (from CaseDetail) */}
          {caseId && employerName && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <span>Linked to: <strong>{employerName}</strong></span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Type</Label>
              <Select value={form.task_type} onValueChange={v => set("task_type", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="action_required">Action Required</SelectItem>
                  <SelectItem value="follow_up">Follow Up</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="approval">Approval</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => set("priority", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">🔴 Urgent</SelectItem>
                  <SelectItem value="high">🟠 High</SelectItem>
                  <SelectItem value="normal">🔵 Normal</SelectItem>
                  <SelectItem value="low">⚪ Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Assigned To</Label>
              <Input value={form.assigned_to} onChange={e => set("assigned_to", e.target.value)} placeholder="Email or name" className="mt-1.5" />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} className="mt-1.5" />
            </div>
          </div>

          {isEdit && (
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {saveError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-1">{saveError}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.title || save.isPending}>
            {save.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}