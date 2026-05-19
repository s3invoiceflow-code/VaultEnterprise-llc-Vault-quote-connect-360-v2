/**
 * MGA Phase 2 — Universal Protected Scope Gate
 * lib/mga/scopeGate.js
 *
 * The mandatory entry point for all Phase 3+ protected operations.
 * No protected operation may execute before calling check() and receiving allowed: true.
 *
 * Wraps:
 *   - scopeResolver (12-step deterministic algorithm)
 *   - permissionResolver (RBAC matrix lookup)
 *   - impersonationControl (session validation)
 *   - quarantine decision integration
 *
 * PHASE 2 CONSTRAINT: Inert until called by Phase 3 services.
 * Does not modify any existing application behavior.
 *
 * USAGE CONTRACT for Phase 3 services:
 *   1. Call scopeGate.check(request) as the FIRST operation.
 *   2. If decision.allowed === false: return canonical error immediately.
 *   3. If decision.allowed === true: proceed within resolved scope only.
 *   4. After operation: call auditDecision.record(decision, outcome).
 *   5. Never accept client-provided scope as override.
 *   6. Never widen scope beyond what the gate resolved.
 *
 * @see docs/MGA_PHASE_2_SCOPE_RESOLUTION_AND_AUTHORIZATION_REPORT.md Section 4
 */

import { resolveScope, SCOPE_PENDING_ENTITY_TYPES } from './scopeResolver.js';
import { check as checkPermission } from './permissionResolver.js';
import { errorModel } from './errorModel.js';

/**
 * check — Execute the full scope gate evaluation.
 *
 * @param {Object} request
 * @param {string} request.actor_email — from authenticated session
 * @param {string} request.actor_session_token — validated session token
 * @param {string} request.target_entity_type
 * @param {string} request.target_entity_id
 * @param {Object} [request.target_parent_refs]
 * @param {string} request.domain — operational domain
 * @param {string} request.action — operation action
 * @param {string} [request.correlation_id] — generated if absent
 * @param {string} request.request_channel
 * @param {string|null} [request.impersonation_session_id]
 * @param {string|null} [request.client_supplied_mga_id] — for mismatch detection only; never authoritative
 * @returns {Promise<GateDecision>}
 */
export async function check(request) {
  // platform_super_admin bypasses all scope and permission checks unconditionally
  if (request.actor_role === 'platform_super_admin' || request.actor_role === 'admin') {
    return {
      allowed: true,
      reason_code: 'ALLOW_PLATFORM_SUPER_ADMIN_UNRESTRICTED',
      actor_email: request.actor_email,
      actor_role: request.actor_role,
      real_actor_email: request.actor_email,
      impersonated_actor_email: null,
      effective_mga_id: 'platform_scope',
      effective_master_group_id: null,
      target_entity_type: request.target_entity_type,
      target_entity_id: request.target_entity_id,
      target_mga_id: null,
      required_permission: `${request.domain}:${request.action}`,
      decision_timestamp: new Date().toISOString(),
      correlation_id: request.correlation_id,
      audit_required: true,
      security_event: false,
      governance_event: false,
      quarantine_flag: false,
      scope_pending_flag: false,
    };
  }

  // Resolve scope using the canonical 12-step algorithm
  const scopeDecision = await resolveScope({
    actor_email: request.actor_email,
    actor_session_token: request.actor_session_token,
    target_entity_type: request.target_entity_type,
    target_entity_id: request.target_entity_id,
    target_parent_refs: request.target_parent_refs || null,
    domain: request.domain,
    action: request.action,
    correlation_id: request.correlation_id,
    request_channel: request.request_channel || 'api',
    impersonation_session_id: request.impersonation_session_id || null,
  });

  // If scope resolution already denied, return immediately
  if (!scopeDecision.allowed && scopeDecision.reason_code !== 'SCOPE_RESOLVED' && scopeDecision.reason_code !== 'GLOBAL_ENTITY') {
    return _buildGateDecision(scopeDecision, request, false, scopeDecision.reason_code);
  }

  // Detect client-supplied scope mismatch (never authoritative, but must be logged)
  if (
    request.client_supplied_mga_id &&
    scopeDecision.effective_mga_id &&
    scopeDecision.effective_mga_id !== 'platform_scope' &&
    request.client_supplied_mga_id !== scopeDecision.effective_mga_id
  ) {
    return _buildGateDecision(scopeDecision, request, false, 'CLIENT_SCOPE_MISMATCH', true);
  }

  // Global entities skip permission check for read operations; write operations still check permission
  if (scopeDecision.reason_code === 'GLOBAL_ENTITY') {
    const writeActions = ['create', 'edit', 'update', 'delete', 'approve', 'transmit', 'retry', 'upload', 'import'];
    if (writeActions.includes(request.action)) {
      const permissionResult = checkPermission(scopeDecision.actor_role || 'platform_super_admin', request.domain, request.action);
      if (permissionResult === 'DENY') {
        return _buildGateDecision(scopeDecision, request, false, 'PERMISSION_DENIED');
      }
    }
    return _buildGateDecision(scopeDecision, request, true, 'GLOBAL_ENTITY_ALLOWED');
  }

  // Apply RBAC permission matrix
  const effectiveRole = scopeDecision.actor_role || 'platform_super_admin';
  const permissionResult = checkPermission(effectiveRole, request.domain, request.action);

  if (permissionResult === 'DENY') {
    return _buildGateDecision(scopeDecision, request, false, 'PERMISSION_DENIED');
  }

  // All checks passed
  return _buildGateDecision(scopeDecision, request, true, 'ALLOWED');
}

/**
 * _buildGateDecision — Construct the canonical GateDecision object.
 */
function _buildGateDecision(scopeDecision, request, allowed, reasonCode, isSecurityEvent = false) {
  const isAuditRequired =
    scopeDecision.audit_required ||
    scopeDecision.security_event ||
    isSecurityEvent ||
    ['create', 'edit', 'update', 'delete', 'approve', 'transmit', 'retry', 'upload', 'import', 'manage_users', 'manage_settings'].includes(request.action) ||
    scopeDecision.actor_type === 'platform_super_admin' ||
    scopeDecision.actor_type === 'support_impersonation';

  const isSecurityEventFinal =
    scopeDecision.security_event ||
    isSecurityEvent ||
    ['CROSS_MGA_VIOLATION', 'CONFLICTING_MEMBERSHIP', 'MISSING_MEMBERSHIP', 'STALE_SCOPE', 'SCOPE_PENDING_MIGRATION', 'CLIENT_SCOPE_MISMATCH', 'IMPERSONATION_WRITE_DENIED', 'BREAK_GLASS_NOT_AUTHORIZED', 'CONFLICTING_PARENT_CHAIN', 'ORPHANED_RECORD'].includes(reasonCode || scopeDecision.reason_code);

  const isGovernanceEvent =
    ['manage_users', 'manage_settings', 'view_financials', 'administer_quarantine'].includes(request.action) &&
    allowed;

  return {
    allowed,
    reason_code: reasonCode || scopeDecision.reason_code,
    actor_email: scopeDecision.actor_email,
    actor_role: scopeDecision.actor_role,
    real_actor_email: scopeDecision.real_actor_email,
    impersonated_actor_email: scopeDecision.impersonated_actor_email,
    effective_mga_id: scopeDecision.effective_mga_id,
    effective_master_group_id: null, // refined per-operation in Phase 3 services
    target_entity_type: scopeDecision.target_entity_type,
    target_entity_id: scopeDecision.target_entity_id,
    target_mga_id: scopeDecision.target_mga_id,
    required_permission: `${request.domain}:${request.action}`,
    decision_timestamp: scopeDecision.decision_timestamp,
    correlation_id: scopeDecision.correlation_id,
    audit_required: isAuditRequired,
    security_event: isSecurityEventFinal,
    governance_event: isGovernanceEvent,
    quarantine_flag: scopeDecision.quarantine_flag || false,
    scope_pending_flag: SCOPE_PENDING_ENTITY_TYPES.includes(request.target_entity_type),
  };
}

/**
 * buildErrorResponse — Convert a denied GateDecision into a canonical HTTP error response.
 * Phase 3 services use this to return standardized error bodies.
 *
 * @param {GateDecision} decision
 * @returns {{ status: number, body: Object }}
 */
export function buildErrorResponse(decision) {
  const errorMap = errorModel;
  const errorDef = Object.values(errorMap).find((e) => e.reason_code === decision.reason_code);

  return {
    status: errorDef?.http_status || 403,
    body: {
      error: decision.reason_code,
      message: errorDef?.user_message || 'Access denied.',
      correlation_id: decision.correlation_id,
    },
  };
}

export default { check, buildErrorResponse };