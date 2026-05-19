import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function CloneCaseModal({ isOpen, caseData, onClose }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [cloneTasks, setCloneTasks] = useState(false);
  const [cloneDocs, setCloneDocs] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(null);

  const handleClone = async () => {
    setLoading(true);
    setError(null);
    try {
      // Create new case
      const newCase = await base44.entities.BenefitCase.create({
        agency_id: caseData.agency_id,
        employer_group_id: caseData.employer_group_id,
        case_type: caseData.case_type,
        case_number: `${caseData.case_number}-CLONE-${Date.now().toString().slice(-6)}`,
        effective_date: caseData.effective_date,
        stage: "draft",
        priority: caseData.priority,
        products_requested: caseData.products_requested,
        employer_name: caseData.employer_name,
        employee_count: caseData.employee_count,
        notes: `Cloned from ${caseData.case_number}. ${notes}`,
      });

      // Clone tasks if selected
      if (cloneTasks) {
        const tasks = await base44.entities.CaseTask.filter({ case_id: caseData.id });
        for (const task of tasks) {
          await base44.entities.CaseTask.create({
            case_id: newCase.id,
            title: task.title,
            description: task.description,
            task_type: task.task_type,
            priority: task.priority,
            status: "pending",
            employer_name: task.employer_name,
          });
        }
      }

      // Clone documents if selected
      if (cloneDocs) {
        const docs = await base44.entities.Document.filter({ case_id: caseData.id });
        for (const doc of docs) {
          await base44.entities.Document.create({
            case_id: newCase.id,
            employer_group_id: doc.employer_group_id,
            name: doc.name,
            document_type: doc.document_type,
            file_url: doc.file_url,
            file_name: doc.file_name,
            file_size: doc.file_size,
            employer_name: doc.employer_name,
          });
        }
      }

      onClose();
      navigate(`/cases/${newCase.id}`);
    } catch (err) {
      setError(err?.message || "Clone failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Clone Case</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Original Case</Label>
            <p className="text-sm font-medium">{caseData?.employer_name}</p>
            <p className="text-xs text-muted-foreground">{caseData?.case_number}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="clone-tasks" checked={cloneTasks} onCheckedChange={setCloneTasks} />
              <Label htmlFor="clone-tasks" className="text-sm cursor-pointer">Clone tasks (will be reset to pending)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="clone-docs" checked={cloneDocs} onCheckedChange={setCloneDocs} />
              <Label htmlFor="clone-docs" className="text-sm cursor-pointer">Clone documents</Label>
            </div>
          </div>

          <div>
            <Label htmlFor="notes" className="text-xs font-semibold text-muted-foreground uppercase">Additional Notes (optional)</Label>
            <Input
              id="notes"
              placeholder="e.g., 'For 2024 renewal'"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleClone} disabled={loading}>
            {loading && <Loader className="w-4 h-4 mr-2 animate-spin" />}
            Clone Case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}