import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Users, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import CensusUploadModal from "@/components/census/CensusUploadModal";
import CensusVersionHistory from "@/components/census/CensusVersionHistory";
import CensusMemberTable from "@/components/census/CensusMemberTable";
import RiskDashboard from "@/components/census/RiskDashboard";
import GradientAIAnalysisPanel from "@/components/census/GradientAIAnalysisPanel";
import CensusSystemSummary from "@/components/census/CensusSystemSummary";
import CensusReadinessPanel from "@/components/census/CensusReadinessPanel";
import { buildDownstreamReadiness } from "@/components/census/censusEngine";

export default function Census() {
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [viewingVersionId, setViewingVersionId] = useState(null);

  // Fetch all cases
  const { data: cases = [] } = useQuery({
    queryKey: ["cases"],
    queryFn: () => base44.entities.BenefitCase.list("-created_date", 100),
  });

  // Fetch all versions
  const { data: allVersions = [] } = useQuery({
    queryKey: ["census-all"],
    queryFn: () => base44.entities.CensusVersion.list("-created_date", 100),
  });

  // Filter versions by selected case
  const filteredVersions = selectedCaseId
    ? allVersions.filter(v => v.case_id === selectedCaseId)
    : allVersions;

  const { data: censusMembers = [] } = useQuery({
    queryKey: ["census-members-page", selectedCaseId],
    queryFn: () => selectedCaseId ? base44.entities.CensusMember.filter({ case_id: selectedCaseId }, "-created_date", 1000) : Promise.resolve([]),
    enabled: !!selectedCaseId,
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["census-page-enrollments"],
    queryFn: () => base44.entities.EnrollmentWindow.list("-created_date", 200),
  });

  const { data: renewals = [] } = useQuery({
    queryKey: ["census-page-renewals"],
    queryFn: () => base44.entities.RenewalCycle.list("-created_date", 200),
  });

  const selectedCase = cases.find(c => c.id === selectedCaseId);
  const selectedVersionCount = filteredVersions.length;
  const latestSelectedVersion = [...filteredVersions].sort((a, b) => Number(b.version_number || 0) - Number(a.version_number || 0))[0];

  const readiness = useMemo(() => {
    if (!selectedCase) return null;
    return buildDownstreamReadiness({
      caseRecord: selectedCase,
      censusVersions: filteredVersions,
      members: censusMembers,
      enrollments,
      renewals,
    });
  }, [selectedCase, filteredVersions, censusMembers, enrollments, renewals]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Census Management"
        description="Versioned census snapshots, canonical normalization, and downstream readiness control"
        actions={selectedCaseId ? <Button onClick={() => setShowUpload(true)}><FileUp className="w-4 h-4 mr-2" /> Upload Snapshot</Button> : null}
      />

      {/* Case Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a case..." />
              </SelectTrigger>
              <SelectContent>
                {cases.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.employer_name || "Unnamed"} — {c.case_number} — {c.stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCaseId && (
              <Button
                variant="outline"
                onClick={() => setSelectedCaseId("")}
                className="text-xs shrink-0"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <CensusSystemSummary versions={allVersions} members={censusMembers} cases={cases} />

      {selectedCase && latestSelectedVersion && (
        <Card>
          <CardContent className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Canonical Snapshot Version {latestSelectedVersion.version_number}</p>
              <p className="text-xs text-muted-foreground">
                Status: {latestSelectedVersion.status} • Effective snapshot for Quotes, Enrollment, Renewals, and Dashboard consumers
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              Errors: {latestSelectedVersion.validation_errors || 0} • Warnings: {latestSelectedVersion.validation_warnings || 0}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected Case Info */}
      {selectedCase && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">{selectedCase.employer_name}</h3>
                <p className="text-xs text-muted-foreground">
                  Case: {selectedCase.case_number} • Stage: {selectedCase.stage}
                </p>
              </div>
              <Button onClick={() => setShowUpload(true)} size="sm">
                <FileUp className="w-4 h-4 mr-2" /> Upload Census
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {!selectedCaseId ? (
        <EmptyState
          icon={Users}
          title="Select a Case"
          description="Choose a case from the list above to view and manage its census data"
        />
      ) : filteredVersions.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="No Census Data"
          description="This case has no census data yet"
          actionLabel="Upload Census"
          onAction={() => setShowUpload(true)}
        />
      ) : (
        <div className="space-y-6">
          <CensusReadinessPanel readiness={readiness} />

          {/* Version History */}
          <CensusVersionHistory
            versions={filteredVersions}
            onViewMembers={version => setViewingVersionId(version.id)}
          />

          {/* Risk Dashboard */}
          {viewingVersionId && (
            <RiskDashboard censusVersionId={viewingVersionId} caseId={selectedCaseId} />
          )}

          {/* GradientAI Analysis — show for the latest version as soon as a case is selected */}
          {filteredVersions.length > 0 && (
            <GradientAIAnalysisPanel 
              censusVersionId={viewingVersionId || filteredVersions[0].id} 
              caseId={selectedCaseId}
              onAnalysisComplete={() => {}}
            />
          )}

          {/* Member Table */}
          {viewingVersionId && (
            <div className="border rounded-lg p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-sm">Census Members</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewingVersionId(null)}
                  className="text-xs"
                >
                  Hide
                </Button>
              </div>
              <CensusMemberTable censusVersionId={viewingVersionId} caseId={selectedCaseId} />
            </div>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {selectedCaseId && (
        <CensusUploadModal
          caseId={selectedCaseId}
          currentVersionCount={selectedVersionCount}
          open={showUpload}
          onClose={() => {
            setShowUpload(false);
            // Refetch versions to see new upload
          }}
        />
      )}
    </div>
  );
}