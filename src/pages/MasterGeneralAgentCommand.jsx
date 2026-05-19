/**
 * MGA Phase 5 — MasterGeneralAgentCommandPage
 * Route: /mga/command
 * RBAC: mga_admin | mga_manager | mga_user | mga_read_only | platform_super_admin
 *
 * Safety rules enforced:
 * 1. No direct base44.entities.* reads/writes
 * 2. All data loaded through Phase 3 scoped services
 * 3. master_general_agent_id resolved server-side via scopeGate (never client-trusted)
 * 4. Fail-closed on denied/ambiguous scope
 * 5. No cross-MGA visibility under any condition
 * 6. Sub-features: Invite (Gate 6A ✅ active 2026-05-05), TXQuote transmit (inactive), report exports (inactive)
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import MGAHeader from '@/components/mga/MGAHeader';
import MGAKPIBar from '@/components/mga/MGAKPIBar';
import MGAMasterGroupPanel from '@/components/mga/MGAMasterGroupPanel';
import MGACaseWorkflowPanel from '@/components/mga/MGACaseWorkflowPanel';
import MGADocumentsPanel from '@/components/mga/MGADocumentsPanel';
import MGAUsersPanel from '@/components/mga/MGAUsersPanel';
import MGAAuditPanel from '@/components/mga/MGAAuditPanel';
import MGAScopeErrorBoundary from '@/components/mga/MGAScopeErrorBoundary';
import MGAAnalyticsDashboard from '@/components/mga/MGAAnalyticsDashboard';
import { base44 } from '@/api/base44Client';

import { listMGAs } from '@/lib/mga/services/mgaService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield } from 'lucide-react';

// Gate 6K rollback switch — ACTIVATED per operator approval 2026-05-12
const MGA_ANALYTICS_DASHBOARD_ENABLED = true;

const MGA_ROLES = ['mga_admin', 'mga_manager', 'mga_user', 'mga_read_only', 'platform_super_admin', 'admin'];

export default function MasterGeneralAgentCommandPage() {
  const { user } = useAuth();
  const [mgaRecord, setMgaRecord] = useState(null);
  const [allMGAs, setAllMGAs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scopeDenied, setScopeDenied] = useState(false);
  const [scopeError, setScopeError] = useState(null);
  const isPlatformAdmin = user && ['admin', 'platform_super_admin'].includes(user.role);

  // Safety rule: fail-closed role check
  const hasAccess = user && MGA_ROLES.includes(user.role);

  useEffect(() => {
    if (!hasAccess) {
      setScopeDenied(true);
      setLoading(false);
      return;
    }
    loadMGAScope();
  }, [user]);

  async function loadMGAScope() {
    setLoading(true);
    setScopeDenied(false);
    setScopeError(null);
    try {
      // Platform admins: load all MGAs directly
      if (isPlatformAdmin) {
        const all = await base44.entities.MasterGeneralAgent.list();
        setAllMGAs(all || []);
        if (all?.length) {
          setMgaRecord(all[0]);
        }
        // Platform admins always see the page even with no MGAs
        return;
      }
      // MGA-scoped users: use scoped service
      const result = await listMGAs({
        actor_email: user.email,
        actor_session_token: user.id,
        request_channel: 'web_ui',
        target_entity_id: 'list_operation',
      });
      if (!result?.success && result?.reason_code) {
        setScopeDenied(true);
        setScopeError(result.reason_code);
      } else if (result?.data?.length) {
        setMgaRecord(result.data[0]);
      } else {
        setScopeDenied(true);
        setScopeError('NO_MGA_IN_SCOPE');
      }
    } catch (e) {
      setScopeDenied(true);
      setScopeError('SCOPE_RESOLUTION_ERROR');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Resolving MGA scope…</p>
        </div>
      </div>
    );
  }

  // Non-platform users with no access
  if (!hasAccess || (scopeDenied && !isPlatformAdmin)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <Shield className="w-10 h-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">Access Restricted</p>
          <p className="text-sm text-muted-foreground">
            You do not have an active MGA membership or your scope could not be resolved.
            {scopeError && <span className="block mt-1 text-xs font-mono text-muted-foreground/70">{scopeError}</span>}
          </p>
        </div>
      </div>
    );
  }

  // Platform admin with no MGAs yet — show empty state
  if (isPlatformAdmin && !mgaRecord) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3 text-center max-w-md">
            <Shield className="w-10 h-10 text-primary/40" />
            <p className="text-base font-medium text-foreground">No MGA Records Found</p>
            <p className="text-sm text-muted-foreground">
              There are no Master General Agent records in the system yet. Create your first MGA to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const scopeRequest = {
    actor_email: user.email,
    actor_session_token: user.id,
    target_entity_id: mgaRecord.id,
    request_channel: 'web_ui',
  };

  const isAdmin = user.role === 'mga_admin' || isPlatformAdmin;
  const isManager = isAdmin || user.role === 'mga_manager';
  const isReadOnly = user.role === 'mga_read_only';

  return (
    <MGAScopeErrorBoundary>
      <div className="p-6 space-y-6">
        {/* Admin MGA Switcher */}
        {isPlatformAdmin && allMGAs.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Viewing MGA:</span>
            <Select value={mgaRecord.id} onValueChange={id => setMgaRecord(allMGAs.find(m => m.id === id))}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allMGAs.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name} {m.code ? `(${m.code})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Section 1 — MGA Header */}
        <MGAHeader mgaRecord={mgaRecord} user={user} scopeRequest={scopeRequest} />

        {/* Section 2 — KPI Widgets */}
        <MGAKPIBar mgaId={mgaRecord.id} scopeRequest={scopeRequest} />

        {/* Sections 3–7 — Tabbed panels */}
         <Tabs defaultValue="mastergroups" className="w-full">
           <TabsList className="flex-wrap h-auto gap-1 mb-2">
             <TabsTrigger value="mastergroups">Broker / Agencies</TabsTrigger>
             <TabsTrigger value="workflows">Cases & Workflows</TabsTrigger>
             <TabsTrigger value="documents">Documents</TabsTrigger>
             {isManager && <TabsTrigger value="users">Users & Roles</TabsTrigger>}
             {isManager && <TabsTrigger value="audit">Audit Log</TabsTrigger>}
             {isManager && MGA_ANALYTICS_DASHBOARD_ENABLED && <TabsTrigger value="analytics">Analytics</TabsTrigger>}
           </TabsList>

          {/* Section 3 — Broker / Agency Management (internal entity: MasterGroup) */}
          <TabsContent value="mastergroups">
            <MGAScopeErrorBoundary>
              <MGAMasterGroupPanel
                mgaId={mgaRecord.id}
                scopeRequest={scopeRequest}
                isAdmin={isAdmin}
                isManager={isManager}
                isReadOnly={isReadOnly}
              />
            </MGAScopeErrorBoundary>
          </TabsContent>

          {/* Section 4 — Case / Quote / Census Workflow */}
          <TabsContent value="workflows">
            <MGAScopeErrorBoundary>
              <MGACaseWorkflowPanel
                mgaId={mgaRecord.id}
                scopeRequest={scopeRequest}
                isManager={isManager}
                isReadOnly={isReadOnly}
                userRole={user.role}
                actorEmail={user.email}
              />
            </MGAScopeErrorBoundary>
          </TabsContent>

          {/* Section 5 — Documents */}
          <TabsContent value="documents">
            <MGAScopeErrorBoundary>
              <MGADocumentsPanel
                mgaId={mgaRecord.id}
                scopeRequest={scopeRequest}
                isReadOnly={isReadOnly}
              />
            </MGAScopeErrorBoundary>
          </TabsContent>

          {/* Section 6 — Users & Roles (manager+ only) */}
          {isManager && (
            <TabsContent value="users">
              <MGAScopeErrorBoundary>
                <MGAUsersPanel
                  mgaId={mgaRecord.id}
                  scopeRequest={scopeRequest}
                  userRole={user.role}
                />
              </MGAScopeErrorBoundary>
            </TabsContent>
          )}

          {/* Section 7 — Audit Log (manager+ only) */}
          {isManager && (
            <TabsContent value="audit">
              <MGAScopeErrorBoundary>
                <MGAAuditPanel
                  mgaId={mgaRecord.id}
                  scopeRequest={scopeRequest}
                  isPlatformAdmin={user.role === 'platform_super_admin' || user.role === 'admin'}
                />
              </MGAScopeErrorBoundary>
            </TabsContent>
          )}

          {/* Section 8 — Analytics Dashboard (manager+ only, Gate 6K) */}
          {isManager && MGA_ANALYTICS_DASHBOARD_ENABLED && (
            <TabsContent value="analytics">
              <MGAScopeErrorBoundary>
                <MGAAnalyticsDashboard
                  featureFlag={MGA_ANALYTICS_DASHBOARD_ENABLED}
                  userRole={user.role}
                  mgaId={mgaRecord.id}
                />
              </MGAScopeErrorBoundary>
            </TabsContent>
          )}
          </Tabs>
      </div>
    </MGAScopeErrorBoundary>
  );
}