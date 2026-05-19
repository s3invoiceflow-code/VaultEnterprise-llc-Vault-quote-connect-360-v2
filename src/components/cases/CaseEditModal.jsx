import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function CaseEditModal({ caseData, open, onClose }) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState(null);
  const [form, setForm] = useState({
    employer_name: caseData?.employer_name || "",
    effective_date: caseData?.effective_date || "",
    target_close_date: caseData?.target_close_date || "",
    priority: caseData?.priority || "normal",
    assigned_to: caseData?.assigned_to || "",
    employee_count: caseData?.employee_count || "",
    notes: caseData?.notes || "",
  });

  const update = useMutation({
    mutationFn: () => base44.entities.BenefitCase.update(caseData.id, {
      ...form,
      employee_count: form.employee_count ? Number(form.employee_count) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseData.id] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      setSaveError(null);
      onClose();
    },
    onError: (err) => {
      setSaveError(err?.message || "Failed to save changes. Please try again.");
    },
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Case</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Employer Name</Label>
            <Input value={form.employer_name} onChange={e => set("employer_name", e.target.value)} className="mt-1.5" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Effective Date</Label>
              <Input type="date" value={form.effective_date} onChange={e => set("effective_date", e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Target Close Date</Label>
              <Input type="date" value={form.target_close_date} onChange={e => set("target_close_date", e.target.value)} className="mt-1.5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => set("priority", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employee Count</Label>
              <Input type="number" value={form.employee_count} onChange={e => set("employee_count", e.target.value)} className="mt-1.5" />
            </div>
          </div>
          <div>
            <Label>Assigned To</Label>
            <Input value={form.assigned_to} onChange={e => set("assigned_to", e.target.value)} placeholder="Email" className="mt-1.5" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3} className="mt-1.5" />
          </div>
        </div>
        {saveError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-1">{saveError}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>Cancel</Button>
          <Button onClick={() => update.mutate()} disabled={update.isPending}>
            {update.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}