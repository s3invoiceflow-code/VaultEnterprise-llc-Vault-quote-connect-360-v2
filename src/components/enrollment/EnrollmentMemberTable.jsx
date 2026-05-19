import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Mail, Send, Loader2, FileSignature } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/shared/EmptyState";
import { format } from "date-fns";
import DocuSignStatusBadge from "@/components/employee/DocuSignStatusBadge";

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-700",
  invited: "bg-blue-100 text-blue-700",
  enrolled: "bg-green-100 text-green-700",
  waived: "bg-gray-100 text-gray-500",
  terminated: "bg-red-100 text-red-700",
};

export default function EnrollmentMemberTable({ enrollmentWindowId, caseId }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sendingId, setSendingId] = useState(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch EmployeeEnrollment records to get IDs for invite emails
  const { data: employeeEnrollments = [] } = useQuery({
    queryKey: ["employee-enrollments-window", enrollmentWindowId],
    queryFn: () => base44.entities.EmployeeEnrollment.filter({ enrollment_window_id: enrollmentWindowId }),
    enabled: !!enrollmentWindowId,
  });

  const handleResendDocuSign = async (ee) => {
    setSendingId(`ds-${ee.id}`);
    try {
      await base44.functions.invoke("sendDocuSignEnvelope", { enrollment_id: ee.id, resend: true });
      toast({ title: "DocuSign re-sent!", description: `Signing request sent to ${ee.employee_email}` });
      queryClient.invalidateQueries({ queryKey: ["employee-enrollments-window", enrollmentWindowId] });
    } catch (err) {
      toast({ title: "Resend failed", description: err.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const handleSendInvite = async (member) => {
    // Find the corresponding EmployeeEnrollment
    const ee = employeeEnrollments.find(e => e.employee_email === member.email);
    if (!ee) {
      toast({ title: "No enrollment record", description: "This member doesn't have an EmployeeEnrollment record with an access token.", variant: "destructive" });
      return;
    }
    setSendingId(member.id);
    try {
      const res = await base44.functions.invoke("sendEnrollmentInvite", { enrollment_id: ee.id });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: "Invite sent!", description: `Email sent to ${member.email}` });
      updateStatus.mutate({ id: member.id, status: "invited" });
    } catch (err) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["enrollment-members", enrollmentWindowId],
    queryFn: () => base44.entities.EnrollmentMember.filter({ enrollment_window_id: enrollmentWindowId }),
    enabled: !!enrollmentWindowId,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.EnrollmentMember.update(id, {
      status,
      enrolled_at: status === "enrolled" ? new Date().toISOString() : undefined,
      invited_at: status === "invited" ? new Date().toISOString() : undefined,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["enrollment-members", enrollmentWindowId] }),
    onError: (err) => {
      toast({ title: "Status update failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const filtered = members.filter(m => {
    const name = `${m.first_name} ${m.last_name}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || m.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (isLoading) return <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (members.length === 0) return (
    <EmptyState icon={Mail} title="No Enrollment Records" description="No members have been added to this enrollment window yet" />
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search members..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-xs" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="enrolled">Enrolled</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs py-2">Name</TableHead>
              <TableHead className="text-xs py-2">Coverage</TableHead>
              <TableHead className="text-xs py-2">Status</TableHead>
              <TableHead className="text-xs py-2">DocuSign</TableHead>
              <TableHead className="text-xs py-2">Updated</TableHead>
              <TableHead className="text-xs py-2">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(m => {
              const ee = employeeEnrollments.find(e => e.employee_email === m.email);
              return (
              <TableRow key={m.id} className="text-xs">
                <TableCell className="py-2">
                  <div className="font-medium">{m.first_name} {m.last_name}</div>
                  {m.email && <div className="text-muted-foreground">{m.email}</div>}
                </TableCell>
                <TableCell className="py-2 capitalize">{m.coverage_tier?.replace(/_/g, " ") || "—"}</TableCell>
                <TableCell className="py-2">
                  <Badge className={`text-[10px] ${STATUS_COLORS[m.status] || ""}`}>{m.status}</Badge>
                  {m.waiver_reason && <div className="text-muted-foreground mt-0.5">{m.waiver_reason}</div>}
                </TableCell>
                <TableCell className="py-2">
                  {ee ? (
                    <DocuSignStatusBadge
                      status={ee.docusign_status || "not_sent"}
                      documentUrl={ee.docusign_document_url}
                      showActions={true}
                      onResend={() => handleResendDocuSign(ee)}
                    />
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="py-2 text-muted-foreground">{format(new Date(m.updated_date), "MMM d")}</TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center gap-1.5">
                    <Select value={m.status} onValueChange={v => updateStatus.mutate({ id: m.id, status: v })}>
                      <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="invited">Invited</SelectItem>
                        <SelectItem value="enrolled">Enrolled</SelectItem>
                        <SelectItem value="waived">Waived</SelectItem>
                      </SelectContent>
                    </Select>
                    {m.email && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        title="Send invite email"
                        disabled={sendingId === m.id}
                        onClick={() => handleSendInvite(m)}
                      >
                        {sendingId === m.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Send className="w-3 h-3" />}
                      </Button>
                    )}
                    {ee && m.status === "enrolled" && (ee.docusign_status === "not_sent" || !ee.docusign_status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        title="Send DocuSign"
                        disabled={sendingId === `ds-${ee.id}`}
                        onClick={() => handleResendDocuSign(ee)}
                      >
                        {sendingId === `ds-${ee.id}`
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <FileSignature className="w-3 h-3" />}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );})}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} of {members.length} members</p>
    </div>
  );
}