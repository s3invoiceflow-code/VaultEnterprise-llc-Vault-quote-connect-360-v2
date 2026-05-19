import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getApprovedScenarioForCase, buildEnrollmentConversionPayload, buildEnrollmentWindowFromScenario } from "@/components/enrollment/enrollmentConversionEngine";

export default function CreateEnrollmentModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    case_id: "",
    start_date: "",
    end_date: "",
    effective_date: "",
    total_eligible: "",
    status: "scheduled",
  });

  const { data: cases = [] } = useQuery({
    queryKey: ["cases"],
    queryFn: () => base44.entities.BenefitCase.list("-created_date", 100),
  });

  const { data: scenarios = [] } = useQuery({
    queryKey: ["enrollment-scenarios"],
    queryFn: () => base44.entities.QuoteScenario.list("-created_date", 300),
  });

  const { data: censusVersions = [] } = useQuery({
    queryKey: ["enrollment-census-versions"],
    queryFn: () => base44.entities.CensusVersion.list("-created_date", 300),
  });

  const { data: enrollmentWindows = [] } = useQuery({
    queryKey: ["existing-enrollment-windows"],
    queryFn: () => base44.entities.EnrollmentWindow.list("-created_date", 200),
  });

  const { data: renewals = [] } = useQuery({
    queryKey: ["enrollment-renewals"],
    queryFn: () => base44.entities.RenewalCycle.list("-created_date", 200),
  });

  const activeCases = cases.filter(c =>
    ["approved_for_enrollment", "enrollment_open", "quoting", "proposal_ready", "employer_review"].includes(c.stage)
  );

  const selectedCase = cases.find(c => c.id === form.case_id);
  const approvedScenario = getApprovedScenarioForCase(form.case_id, scenarios);
  const conversion = buildEnrollmentConversionPayload({
    caseRecord: selectedCase,
    scenario: approvedScenario,
    censusVersions,
    enrollments: enrollmentWindows,
    renewals,
  });

  const [mutationError, setMutationError] = useState(null);

  const create = useMutation({
    mutationFn: async () => {
      const enrollment = await base44.entities.EnrollmentWindow.create(
        buildEnrollmentWindowFromScenario({ form, conversion })
      );
      await base44.entities.BenefitCase.update(form.case_id, {
        enrollment_status: form.status === "open" ? "open" : "not_started",
        stage: form.status === "open" ? "enrollment_open" : "approved_for_enrollment",
      });
      if (conversion.defaults.quote_scenario_id) {
        await base44.entities.QuoteScenario.update(conversion.defaults.quote_scenario_id, {
          status: "converted_to_enrollment",
        });
      }
      return enrollment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments-all"] });
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["enrollments-active-count"] });
      setMutationError(null);
      onClose();
    },
    onError: (err) => {
      setMutationError(err?.message || "Failed to create enrollment window. Please try again.");
    },
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  // Allow creation even without an approved scenario — conversion.isValid is informational only
  const isValid = form.case_id && form.start_date && form.end_date;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Enrollment Window</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Case <span className="text-destructive">*</span></Label>
            <Select value={form.case_id} onValueChange={v => set("case_id", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select case..." /></SelectTrigger>
              <SelectContent>
                {activeCases.length === 0 && (
                  <SelectItem value="_none" disabled>No eligible cases</SelectItem>
                )}
                {activeCases.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.employer_name} — {c.case_number || c.id.slice(-6)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>End Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Effective Date</Label>
              <Input type="date" value={form.effective_date || conversion.defaults.effective_date} onChange={e => set("effective_date", e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Total Eligible</Label>
              <Input type="number" min="1" value={form.total_eligible || conversion.defaults.total_eligible} onChange={e => set("total_eligible", e.target.value)} className="mt-1.5" placeholder="e.g. 42" />
            </div>
          </div>

          {form.case_id && (
            <div className={`rounded-lg border p-3 text-xs ${conversion.isValid ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
              {conversion.isValid ? (
                <div className="space-y-1">
                  <p className="font-medium">Enrollment will be created from quote scenario: {conversion.defaults.quote_scenario_name || "Approved scenario"}</p>
                  <p>Monthly premium: ${Number(conversion.defaults.total_monthly_premium || 0).toLocaleString()} · Employer cost: ${Number(conversion.defaults.employer_monthly_cost || 0).toLocaleString()}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium">This case is not ready for quote-driven enrollment.</p>
                  {conversion.errors.map((error) => <p key={error}>• {error}</p>)}
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Initial Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="open">Open (Immediate)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {mutationError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-1">{mutationError}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!isValid || create.isPending}>
            {create.isPending ? "Creating..." : "Create Enrollment Window"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}