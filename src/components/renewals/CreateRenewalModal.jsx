import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

/**
 * CreateRenewalModal
 * Create new renewal with case selector, renewal date, current premium.
 *
 * Props:
 *   open      — boolean
 *   onClose   — () => void
 */
export default function CreateRenewalModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [currentPremium, setCurrentPremium] = useState("");
  const [errors, setErrors] = useState({});
  const [mutationError, setMutationError] = useState(null);

  const { data: activeCases = [] } = useQuery({
    queryKey: ["active-cases-for-renewal"],
    queryFn: () => base44.entities.BenefitCase.list("-created_date", 100),
    enabled: open,
  });

  const eligibleCases = useMemo(() => {
    return activeCases.filter((c) => ["active", "renewal_pending"].includes(c.stage));
  }, [activeCases]);

  const selectedCase = eligibleCases.find(c => c.id === selectedCaseId);

  useEffect(() => {
    if (!selectedCase) return;
    if (!renewalDate && selectedCase.effective_date) {
      const current = new Date(selectedCase.effective_date);
      const next = new Date(current.getFullYear() + 1, current.getMonth(), current.getDate());
      setRenewalDate(next.toISOString().slice(0, 10));
    }
  }, [selectedCase, renewalDate]);

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedCase) throw new Error("Case not found");

      const existingRenewals = await base44.entities.RenewalCycle.filter({ case_id: selectedCaseId }, "-created_date", 20);
      const hasOpenRenewal = existingRenewals.some((renewal) => renewal.status !== "completed");
      if (hasOpenRenewal) throw new Error("This case already has an active renewal cycle");

      const renewal = await base44.entities.RenewalCycle.create({
        case_id: selectedCaseId,
        employer_group_id: selectedCase.employer_group_id,
        employer_name: selectedCase.employer_name,
        renewal_date: renewalDate,
        current_premium: parseFloat(currentPremium),
        status: "pre_renewal",
        assigned_to: selectedCase.assigned_to,
      });
      await base44.entities.BenefitCase.update(selectedCaseId, {
        stage: "renewal_pending",
        case_type: "renewal",
        last_activity_date: new Date().toISOString(),
      });
      await base44.entities.ActivityLog.create({
        case_id: selectedCaseId,
        action: "Renewal created",
        detail: `Renewal cycle opened for ${selectedCase.employer_name}`,
        entity_type: "RenewalCycle",
        entity_id: renewal.id,
        new_value: renewalDate,
      });
      return renewal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["renewals-all"] });
      setMutationError(null);
      handleClose();
    },
    onError: (err) => {
      setMutationError(err?.message || "Failed to create renewal. Please try again.");
    },
  });

  const handleClose = () => {
    setSelectedCaseId("");
    setRenewalDate("");
    setCurrentPremium("");
    setErrors({});
    setMutationError(null);
    onClose();
  };

  const validate = () => {
    const err = {};
    if (!selectedCaseId) err.case = "Please select a case";
    if (!renewalDate) err.renewalDate = "Renewal date required";
    if (!currentPremium || isNaN(parseFloat(currentPremium))) err.premium = "Valid premium required";
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      create.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Renewal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="case" className="text-sm">
              Active Case
            </Label>
            <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
              <SelectTrigger id="case" className={errors.case ? "border-destructive" : ""}>
                <SelectValue placeholder="Select a case" />
              </SelectTrigger>
              <SelectContent>
                {eligibleCases.length === 0 && (
                  <SelectItem value="_none" disabled>No eligible cases</SelectItem>
                )}
                {eligibleCases.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.employer_name} • {c.case_number || c.id.slice(-6)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.case && <p className="text-xs text-destructive mt-1">{errors.case}</p>}
          </div>

          <div>
            <Label htmlFor="renewalDate" className="text-sm">
              Renewal Date
            </Label>
            <Input
              id="renewalDate"
              type="date"
              value={renewalDate}
              onChange={e => setRenewalDate(e.target.value)}
              className={errors.renewalDate ? "border-destructive" : ""}
            />
            {errors.renewalDate && <p className="text-xs text-destructive mt-1">{errors.renewalDate}</p>}
          </div>

          <div>
            <Label htmlFor="premium" className="text-sm">
              Current Monthly Premium ($)
            </Label>
            <Input
              id="premium"
              type="number"
              step="0.01"
              value={currentPremium}
              onChange={e => setCurrentPremium(e.target.value)}
              placeholder="0.00"
              className={errors.premium ? "border-destructive" : ""}
            />
            {errors.premium && <p className="text-xs text-destructive mt-1">{errors.premium}</p>}
          </div>

          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex gap-2 text-xs text-blue-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>A new renewal cycle for {selectedCase?.employer_name || "this case"} will be created and marked as "Pre-Renewal".</span>
          </div>

          {mutationError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{mutationError}</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={create.isPending || eligibleCases.length === 0}>
              {create.isPending ? "Creating..." : "Create Renewal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}