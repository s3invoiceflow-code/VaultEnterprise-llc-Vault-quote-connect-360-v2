import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CLOSE_REASONS = [
  { value: "won", label: "Won — Enrolled" },
  { value: "lost_competition", label: "Lost — Went with competitor" },
  { value: "lost_no_decision", label: "Lost — No decision made" },
  { value: "employer_withdrew", label: "Employer withdrew" },
  { value: "not_eligible", label: "Not eligible" },
  { value: "duplicate", label: "Duplicate case" },
  { value: "other", label: "Other" },
];

export default function CaseCloseModal({ caseData, open, onClose }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [closeError, setCloseError] = useState(null);

  const close = useMutation({
    mutationFn: () => base44.entities.BenefitCase.update(caseData.id, {
      stage: "closed",
      closed_reason: reason,
      closed_date: new Date().toISOString().split("T")[0],
      notes: notes || caseData.notes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseData.id] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      setCloseError(null);
      onClose();
    },
    onError: (err) => {
      setCloseError(err?.message || "Failed to close case. Please try again.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close Case</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">Closing <strong>{caseData?.employer_name}</strong>. This action sets the case stage to Closed.</p>
          <div>
            <Label>Close Reason <span className="text-destructive">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a reason" /></SelectTrigger>
              <SelectContent>
                {CLOSE_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1.5" placeholder="Any final notes..." />
          </div>
        </div>
        {closeError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-1">{closeError}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={close.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={() => close.mutate()} disabled={!reason || close.isPending}>
            {close.isPending ? "Closing..." : "Close Case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}