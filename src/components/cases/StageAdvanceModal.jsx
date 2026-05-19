import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getStageRequirements } from "@/components/cases/caseWorkflow";

export default function StageAdvanceModal({ caseData, nextStage, nextStageLabel, open, onConfirm, onClose, workflowContext, isPending }) {
  const requirements = getStageRequirements(nextStage, workflowContext || {});
  const blockedItems = requirements.filter((item) => !item.met);
  const blocked = blockedItems.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blocked ? "Cannot Advance Stage" : `Advance to ${nextStageLabel}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? blockedItems.map((item) => item.label).join(" • ")
              : `This will move the case for ${caseData?.employer_name} to the "${nextStageLabel}" stage. This action is logged.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          {!blocked && (
            <AlertDialogAction onClick={onConfirm} disabled={isPending}>
              {isPending ? "Advancing…" : "Confirm"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}