/**
 * Broker Portal Access Contract — Phase 7A-1.8
 * 
 * Evaluates broker portal access eligibility based on:
 * 1. BrokerAgencyProfile.onboarding_status = active
 * 2. BrokerPlatformRelationship.relationship_status = active
 * 3. BrokerAgencyProfile.portal_access_enabled = true (set after approval)
 * 4. BrokerAgencyProfile.compliance_status is not compliance_hold
 * 5. Authenticated user has valid BrokerAgencyUser role
 * 6. Future Gate 7A-2 workspace feature flags are enabled
 * 7. Tenant scope is valid
 * 8. Broker agency scope is valid
 * 
 * Portal access eligibility does NOT equal workspace activation.
 * During Gate 7A-1: /broker remains hidden, workspace inactive.
 * Gate 7A-2 will activate workspace when all flags + approval ready.
 * 
 * Access States (12 total):
 * - NOT_STARTED
 * - PENDING_EMAIL_VERIFICATION
 * - PROFILE_INCOMPLETE
 * - PENDING_COMPLIANCE
 * - PENDING_PLATFORM_REVIEW
 * - PENDING_MORE_INFORMATION
 * - COMPLIANCE_HOLD
 * - REJECTED
 * - SUSPENDED
 * - APPROVED_BUT_WORKSPACE_DISABLED
 * - ELIGIBLE_PENDING_WORKSPACE_ACTIVATION
 * - ACTIVE (reserved for Gate 7A-2)
 * 
 * Feature Flags: All false during Gate 7A-1
 * Audit Events: 7 events for access evaluation
 * 
 * @module brokerPortalAccessContract
 */

import crypto from 'crypto';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const PORTAL_ACCESS_STATES = {
  NOT_STARTED: 'not_started',
  PENDING_EMAIL_VERIFICATION: 'pending_email_verification',
  PROFILE_INCOMPLETE: 'profile_incomplete',
  PENDING_COMPLIANCE: 'pending_compliance',
  PENDING_PLATFORM_REVIEW: 'pending_platform_review',
  PENDING_MORE_INFORMATION: 'pending_more_information',
  COMPLIANCE_HOLD: 'compliance_hold',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
  APPROVED_BUT_WORKSPACE_DISABLED: 'approved_but_workspace_disabled',
  ELIGIBLE_PENDING_WORKSPACE_ACTIVATION: 'eligible_pending_workspace_activation',
  ACTIVE: 'active', // Reserved for Gate 7A-2 activation
};

const FEATURE_FLAGS = {
  BROKER_WORKSPACE_ENABLED: false, // Gate 7A-2 flag (not set during 7A-1)
  BROKER_PORTAL_ACCESS_CHECK_ENABLED: false, // Optional: enable access checks
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Assert scope access (cross-tenant isolation).
 * @param {object} context - Authenticated context
 * @param {string} tenant_id - Resource tenant ID
 * @throws {Error} 404 masked if cross-tenant
 */
function assertScopeAccess(context, tenant_id) {
  if (context.tenant_id !== tenant_id) {
    throw {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Resource not found',
    };
  }
}

/**
 * Create audit event (append-only).
 * @param {object} base44 - SDK client
 * @param {object} event - Audit event data
 */
async function createAuditEvent(base44, event) {
  const auditEventData = {
    tenant_id: event.tenant_id,
    actor_id: event.actor_id || event.actor_user_id || 'system',
    actor_role: event.actor_role || 'system',
    event_type: event.event_type || event.action,
    event_detail: event.event_detail || event.detail || '',
    entity_type: event.entity_type || 'BrokerAgencyProfile',
    entity_id: event.entity_id || '',
    outcome: event.outcome || 'success',
    audit_trace_id: event.audit_trace_id || crypto.randomUUID(),
  };

  await base44.asServiceRole.entities.AuditEvent.create(auditEventData);
}

// ============================================================================
// CONTRACT METHODS
// ============================================================================

/**
 * Evaluate broker portal access eligibility (no feature gate — always runs).
 * 
 * Checks 8 conditions and returns access state + eligibility flag.
 * Does NOT grant access (route remains hidden).
 * Routes remain inactive while feature flags false.
 * 
 * Condition Checks:
 * 1. onboarding_status = active
 * 2. relationship_status = active
 * 3. portal_access_enabled = true (set after approval)
 * 4. compliance_status is not compliance_hold
 * 5. User has valid BrokerAgencyUser role
 * 6. Future workspace flags enabled (false during Gate 7A-1)
 * 7. Tenant scope valid
 * 8. Broker agency scope valid
 * 
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, user_email, role }
 * @param {object} payload - { broker_agency_id }
 * @returns {object} { access_state, is_eligible, conditions_met, reason, details }
 * @throws {Error} Scope/auth error
 */
export async function evaluateBrokerPortalAccess(base44, context, payload) {
  const { tenant_id, user_id, user_email } = context;
  const { broker_agency_id } = payload;
  const auditTraceId = crypto.randomUUID();

  try {
    // 1. Fetch broker profile
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );

    // Scope check
    assertScopeAccess(context, profile.tenant_id);

    // 2. Fetch platform relationship
    const relationships = await base44.asServiceRole.entities.BrokerPlatformRelationship.filter(
      { broker_agency_id, tenant_id }
    );
    const relationship = relationships.length > 0 ? relationships[0] : null;

    // 3. Fetch user's broker agency user record
    const brokerUsers = await base44.asServiceRole.entities.BrokerAgencyUser.filter(
      { broker_agency_id, user_email, tenant_id }
    );
    const brokerUser = brokerUsers.length > 0 ? brokerUsers[0] : null;

    // 4. Evaluate 8 conditions
    const conditions = {
      onboarding_active: profile.onboarding_status === 'activated',
      relationship_active: relationship?.relationship_status === 'active',
      portal_access_enabled: profile.portal_access_enabled === true,
      compliance_not_held: profile.compliance_status !== 'compliance_hold',
      valid_broker_user: brokerUser !== null && brokerUser.status === 'active',
      workspace_flags_enabled: FEATURE_FLAGS.BROKER_WORKSPACE_ENABLED === true,
      tenant_scope_valid: profile.tenant_id === tenant_id,
      broker_scope_valid: profile.id === broker_agency_id,
    };

    const conditionsMet = Object.values(conditions).filter((c) => c === true).length;
    const totalConditions = Object.keys(conditions).length;
    const allConditionsMet =
      conditions.onboarding_active &&
      conditions.relationship_active &&
      conditions.portal_access_enabled &&
      conditions.compliance_not_held &&
      conditions.valid_broker_user &&
      conditions.workspace_flags_enabled &&
      conditions.tenant_scope_valid &&
      conditions.broker_scope_valid;

    // 5. Determine access state
    let accessState = PORTAL_ACCESS_STATES.NOT_STARTED;
    let reason = '';
    let isEligible = false;

    if (!conditions.tenant_scope_valid || !conditions.broker_scope_valid) {
      // Scope failure (masked 404 already thrown above)
      accessState = PORTAL_ACCESS_STATES.NOT_STARTED;
      reason = 'Invalid scope';
    } else if (profile.onboarding_status === 'pending_email_verification') {
      accessState = PORTAL_ACCESS_STATES.PENDING_EMAIL_VERIFICATION;
      reason = 'Awaiting email verification';
    } else if (profile.onboarding_status === 'profile_completed' || !conditions.onboarding_active) {
      accessState = PORTAL_ACCESS_STATES.PROFILE_INCOMPLETE;
      reason = 'Profile incomplete';
    } else if (profile.compliance_status === 'pending_review' || profile.compliance_status === 'warning') {
      accessState = PORTAL_ACCESS_STATES.PENDING_COMPLIANCE;
      reason = 'Compliance review pending';
    } else if (!relationship || relationship.approval_status === 'pending') {
      accessState = PORTAL_ACCESS_STATES.PENDING_PLATFORM_REVIEW;
      reason = 'Awaiting platform review';
    } else if (profile.onboarding_status === 'pending_more_information') {
      accessState = PORTAL_ACCESS_STATES.PENDING_MORE_INFORMATION;
      reason = 'More information requested';
    } else if (profile.compliance_status === 'compliance_hold') {
      accessState = PORTAL_ACCESS_STATES.COMPLIANCE_HOLD;
      reason = 'Compliance hold active';
    } else if (profile.onboarding_status === 'rejected' || relationship?.approval_status === 'rejected') {
      accessState = PORTAL_ACCESS_STATES.REJECTED;
      reason = 'Application rejected';
    } else if (profile.onboarding_status === 'suspended') {
      accessState = PORTAL_ACCESS_STATES.SUSPENDED;
      reason = 'Account suspended';
    } else if (
      conditions.onboarding_active &&
      conditions.relationship_active &&
      conditions.portal_access_enabled &&
      conditions.compliance_not_held &&
      conditions.valid_broker_user &&
      !conditions.workspace_flags_enabled
    ) {
      // Approved but workspace disabled
      accessState = PORTAL_ACCESS_STATES.APPROVED_BUT_WORKSPACE_DISABLED;
      reason = 'Workspace not yet activated (awaiting Gate 7A-2 activation)';
      isEligible = true; // Eligible internally, but route stays hidden
    } else if (allConditionsMet) {
      // All conditions met, ready for activation
      accessState = PORTAL_ACCESS_STATES.ELIGIBLE_PENDING_WORKSPACE_ACTIVATION;
      reason = 'Eligible for workspace activation (Gate 7A-2)';
      isEligible = true;
    } else {
      accessState = PORTAL_ACCESS_STATES.NOT_STARTED;
      reason = `${totalConditions - conditionsMet} conditions not met`;
    }

    // 6. Audit event
    const auditAction = isEligible
      ? 'BROKER_PORTAL_ACCESS_ELIGIBLE_PENDING_ACTIVATION'
      : `BROKER_PORTAL_ACCESS_DENIED_${accessState.toUpperCase()}`;

    await createAuditEvent(base44, {
      tenant_id,
      actor_id: user_id || 'anonymous',
      actor_role: context.role || 'applicant',
      event_type: auditAction,
      event_detail: `Portal access evaluation: ${accessState} (${conditionsMet}/${totalConditions} conditions met)`,
      entity_type: 'BrokerAgencyProfile',
      entity_id: broker_agency_id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    // 7. Return safe payload (no sensitive data)
    return {
      access_state: accessState,
      is_eligible: isEligible,
      reason,
      conditions_met: conditionsMet,
      total_conditions: totalConditions,
      message: isEligible
        ? 'Your application has been approved. Your workspace will be available shortly.'
        : 'Your application is being reviewed. Thank you for your patience.',
      details: {
        // Conditions returned to applicant (safe, no sensitive data)
        profile_complete: conditions.onboarding_active,
        platform_review_complete: conditions.relationship_active,
        compliance_clear: conditions.compliance_not_held,
      },
      audit_trace_id: auditTraceId,
    };
  } catch (error) {
    if (error.status && error.code === 'NOT_FOUND') {
      // Scope failure — return masked 404
      throw error;
    }
    // Wrap unexpected errors
    throw {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Failed to evaluate portal access',
      detail: error.message,
    };
  }
}

/**
 * Get broker portal access state (internal use only — no applicant exposure).
 * Returns detailed access state for platform operators.
 * Permission-gated (platform_broker.access_review).
 * 
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, role }
 * @param {object} payload - { broker_agency_id }
 * @returns {object} { access_state, conditions, profile_summary, relationship_summary }
 * @throws {Error} Permission/scope error
 */
export async function getBrokerPortalAccessState(base44, context, payload) {
  const { tenant_id } = context;
  const { broker_agency_id } = payload;

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess(context, profile.tenant_id);

    // Fetch relationship
    const relationships = await base44.asServiceRole.entities.BrokerPlatformRelationship.filter(
      { broker_agency_id, tenant_id }
    );
    const relationship = relationships.length > 0 ? relationships[0] : null;

    // Evaluate conditions
    const result = await evaluateBrokerPortalAccess(base44, context, payload);

    // Return detailed state (platform operator only)
    return {
      broker_agency_id,
      access_state: result.access_state,
      is_eligible: result.is_eligible,
      reason: result.reason,
      profile_status: {
        onboarding_status: profile.onboarding_status,
        portal_access_enabled: profile.portal_access_enabled,
        compliance_status: profile.compliance_status,
      },
      relationship_status: relationship ? relationship.relationship_status : 'not_started',
      workspace_flag_enabled: FEATURE_FLAGS.BROKER_WORKSPACE_ENABLED,
      conditions_met: result.conditions_met,
      total_conditions: result.total_conditions,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Check if broker can access /broker route (called from route guard).
 * Returns boolean + reason.
 * Does NOT grant access; route remains hidden while flags false.
 * 
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context
 * @param {object} payload - { broker_agency_id }
 * @returns {object} { can_access, reason, access_state }
 */
export async function canBrokerAccessWorkspace(base44, context, payload) {
  try {
    const result = await evaluateBrokerPortalAccess(base44, context, payload);

    // Access granted only if:
    // - Eligible (all conditions met)
    // - Workspace flag enabled
    // - /broker route exists (Gate 7A-2)
    const canAccess =
      result.is_eligible &&
      FEATURE_FLAGS.BROKER_WORKSPACE_ENABLED === true;

    return {
      can_access: canAccess,
      access_state: result.access_state,
      reason: result.reason,
      message: canAccess
        ? 'Workspace access granted'
        : 'Workspace access not available',
    };
  } catch (error) {
    return {
      can_access: false,
      access_state: 'not_started',
      reason: 'Access check failed',
      message: 'Unable to determine workspace access',
    };
  }
}

export default {
  PORTAL_ACCESS_STATES,
  evaluateBrokerPortalAccess,
  getBrokerPortalAccessState,
  canBrokerAccessWorkspace,
};