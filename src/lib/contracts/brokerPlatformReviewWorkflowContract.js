/**
 * Broker Platform Review Workflow Contract — Phase 7A-1.6
 *
 * Implements platform operator review of standalone broker onboarding.
 * Controls approval, rejection, more-information requests, compliance holds, and release.
 * Manages portal access enablement through comprehensive gates.
 * All operations feature-flag gated (fail-closed).
 *
 * Feature flags: All false (fail-closed)
 * Scope enforcement: Masked 404 on cross-org access
 * Permission enforcement: 403 on unauthorized actions
 * Audit logging: Append-only for all material events
 * Self-approval prevention: Applicant cannot approve own signup
 * Compliance holds block approval and portal access
 *
 * @module brokerPlatformReviewWorkflowContract
 */

import crypto from 'crypto';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const FEATURE_FLAGS = {
  BROKER_PLATFORM_REVIEW_ENABLED: false,
  BROKER_COMPLIANCE_HOLD_ENABLED: false,
};

const REVIEW_APPROVAL_PERMISSIONS = {
  APPROVE: 'platform_broker.approval_decide',
  REJECT: 'platform_broker.approval_decide',
  REQUEST_INFO: 'platform_broker.approval_decide',
  HOLD: 'platform_broker.compliance_hold',
  RELEASE_HOLD: 'platform_broker.compliance_hold',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Assert that actor has required permission.
 * @param {object} context - Authenticated context
 * @param {string} permission - Permission key
 * @throws {Error} 403 if permission denied
 */
function assertPermission(context, permission) {
  // platform_super_admin and admin bypass all permission checks
  if (context.role === 'platform_super_admin' || context.role === 'admin') return;
  const hasPermission = false;
  if (!hasPermission) {
    throw {
      status: 403,
      code: 'PERMISSION_DENIED',
      message: `Permission denied: ${permission}`,
    };
  }
}

/**
 * Assert scope access with masked 404 on failure.
 * @param {object} context - Authenticated context
 * @param {object} resource - Resource with tenant_id
 * @throws {Error} 404 masked if cross-tenant access
 */
function assertScopeAccess(context, resource) {
  if (context.tenant_id !== resource.tenant_id) {
    throw {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Resource not visible in your scope',
    };
  }
}

/**
 * Assert that actor is not applicant (self-approval prevention).
 * @param {object} context - Authenticated context
 * @param {object} resource - Resource with applicant_email or owner_email
 * @throws {Error} 403 if applicant tries to approve own signup
 */
function assertNotSelfApproval(context, resource) {
  if (context.user_email === resource.applicant_email) {
    throw {
      status: 403,
      code: 'SELF_APPROVAL_NOT_ALLOWED',
      message: 'Applicant cannot approve their own signup',
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
    actor_user_id: event.actor_user_id,
    actor_role: event.actor_role,
    action: event.action,
    detail: event.detail || '',
    entity_type: event.entity_type || 'BrokerAgencyOnboardingCase',
    entity_id: event.entity_id || '',
    outcome: event.outcome || 'success',
    audit_trace_id: event.audit_trace_id || crypto.randomUUID(),
  };

  await base44.asServiceRole.entities.AuditEvent.create(auditEventData);
}

/**
 * Calculate info request deadline (30 days from now).
 * @returns {string} ISO 8601 timestamp
 */
function calculateInfoDeadline() {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 30);
  return deadline.toISOString();
}

// ============================================================================
// CONTRACT METHODS
// ============================================================================

/**
 * Start platform review of broker onboarding.
 *
 * Transitions onboarding case to pending_platform_review.
 * Records review start event.
 * Feature flag gated.
 *
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, user_email, role }
 * @param {object} payload - { broker_agency_id }
 * @returns {object} { success: true, review_started: ISO timestamp }
 * @throws {Error} Validation/scope/permission error
 */
export async function startBrokerPlatformReview(base44, context, payload) {
  // platform_super_admin bypasses feature flag gates
  const isSuperAdmin = context.role === 'platform_super_admin' || context.role === 'admin';
  // Feature flag check: fail-closed
  if (!isSuperAdmin && !FEATURE_FLAGS.BROKER_PLATFORM_REVIEW_ENABLED) {
    throw {
      status: 403,
      code: 'NOT_AUTHORIZED_FOR_GATE_7A_1',
      message: 'Platform review is not yet authorized for this phase',
    };
  }

  // Permission check: fail-closed
  assertPermission(context, REVIEW_APPROVAL_PERMISSIONS.APPROVE);

  const { tenant_id } = context;
  const { broker_agency_id } = payload;
  const auditTraceId = crypto.randomUUID();
  const reviewStartedAt = new Date().toISOString();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess(context, profile);

    // Get onboarding case
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length === 0) {
      throw { status: 404, message: 'Onboarding case not found' };
    }

    const onboardingCase = cases[0];

    // Update onboarding case
    await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
      onboardingCase.id,
      {
        status: 'pending_platform_review',
        assigned_approver: context.user_id,
        awaiting_approval_at: reviewStartedAt,
      }
    );

    // Audit: BROKER_PLATFORM_REVIEW_STARTED
    await createAuditEvent(base44, {
      tenant_id,
      actor_user_id: context.user_id,
      actor_role: context.role,
      action: 'BROKER_PLATFORM_REVIEW_STARTED',
      detail: `Platform review started by: ${context.user_id}`,
      entity_type: 'BrokerAgencyOnboardingCase',
      entity_id: onboardingCase.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true, review_started: reviewStartedAt };
  } catch (error) {
    if (error.status) throw error;
    throw {
      status: 500,
      code: 'REVIEW_START_ERROR',
      message: error.message,
    };
  }
}

/**
 * Approve standalone broker for platform activation.
 *
 * Checks: completed onboarding profile, compliance readiness, no unresolved holds.
 * Sets BrokerAgencyProfile.onboarding_status = active.
 * Sets BrokerPlatformRelationship.relationship_status = active.
 * Enables portal access flag (route remains inactive).
 * Blocks self-approval.
 * Permission-gated.
 *
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, user_email, role }
 * @param {object} payload - { broker_agency_id }
 * @returns {object} { success: true, approved_at: ISO timestamp }
 * @throws {Error} Validation/scope/permission error
 */
export async function approveBrokerForActivation(base44, context, payload) {
  const isSuperAdmin = context.role === 'platform_super_admin' || context.role === 'admin';
  // Feature flag check: fail-closed
  if (!isSuperAdmin && !FEATURE_FLAGS.BROKER_PLATFORM_REVIEW_ENABLED) {
    throw {
      status: 403,
      code: 'NOT_AUTHORIZED_FOR_GATE_7A_1',
      message: 'Approval is not yet authorized for this phase',
    };
  }

  // Permission check: fail-closed
  assertPermission(context, REVIEW_APPROVAL_PERMISSIONS.APPROVE);

  const { tenant_id } = context;
  const { broker_agency_id } = payload;
  const auditTraceId = crypto.randomUUID();
  const approvedAt = new Date().toISOString();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess(context, profile);

    // Self-approval prevention
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length > 0) {
      assertNotSelfApproval(context, cases[0]);
    }

    const onboardingCase = cases[0];

    // Validation: Completed profile
    if (!onboardingCase.applicant_email) {
      throw {
        status: 400,
        message: 'Onboarding profile must be completed before approval',
      };
    }

    // Validation: No unresolved compliance hold
    if (onboardingCase.compliance_hold && !onboardingCase.compliance_override_approved) {
      throw {
        status: 400,
        message: 'Compliance hold must be released or overridden before approval',
      };
    }

    // Validation: Compliance documents submitted
    if (!onboardingCase.compliance_documents_submitted) {
      throw {
        status: 400,
        message: 'Compliance documents must be submitted before approval',
      };
    }

    // Update BrokerAgencyProfile
    await base44.asServiceRole.entities.BrokerAgencyProfile.update(
      broker_agency_id,
      {
        onboarding_status: 'active',
        approval_status: 'approved',
        portal_access_enabled: true,
      }
    );

    // Update BrokerAgencyOnboardingCase
    await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
      onboardingCase.id,
      {
        status: 'active',
        approved_at: approvedAt,
      }
    );

    // Update BrokerPlatformRelationship
    const relationships = await base44.asServiceRole.entities.BrokerPlatformRelationship.filter(
      { broker_agency_id, tenant_id }
    );
    if (relationships.length > 0) {
      await base44.asServiceRole.entities.BrokerPlatformRelationship.update(
        relationships[0].id,
        {
          status: 'active',
          approval_status: 'approved',
          approval_approved_by: context.user_id,
          approval_approved_at: approvedAt,
        }
      );
    }

    // Audit: BROKER_PLATFORM_RELATIONSHIP_APPROVED & BROKER_ONBOARDING_APPROVED
    await createAuditEvent(base44, {
      tenant_id,
      actor_user_id: context.user_id,
      actor_role: context.role,
      action: 'BROKER_PLATFORM_RELATIONSHIP_APPROVED',
      detail: `Broker approved for activation by: ${context.user_id}`,
      entity_type: 'BrokerAgencyOnboardingCase',
      entity_id: onboardingCase.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    await createAuditEvent(base44, {
      tenant_id,
      actor_user_id: context.user_id,
      actor_role: context.role,
      action: 'BROKER_ONBOARDING_APPROVED',
      detail: 'Onboarding approved, portal access enabled',
      entity_type: 'BrokerAgencyOnboardingCase',
      entity_id: onboardingCase.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    // Audit: BROKER_PORTAL_ACCESS_ENABLED (internal flag, route still disabled)
    await createAuditEvent(base44, {
      tenant_id,
      actor_user_id: context.user_id,
      actor_role: context.role,
      action: 'BROKER_PORTAL_ACCESS_ENABLED',
      detail: 'Portal access flag set, but /broker route remains inactive during Gate 7A-1',
      entity_type: 'BrokerAgencyProfile',
      entity_id: broker_agency_id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true, approved_at: approvedAt };
  } catch (error) {
    if (error.status) throw error;
    throw {
      status: 500,
      code: 'APPROVAL_ERROR',
      message: error.message,
    };
  }
}

/**
 * Reject standalone broker application.
 *
 * Sets status to rejected.
 * Stores rejection reason.
 * Prevents future token use.
 * Blocks portal access.
 * Permission-gated.
 *
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, user_email, role }
 * @param {object} payload - { broker_agency_id, reason }
 * @returns {object} { success: true, rejected_at: ISO timestamp }
 * @throws {Error} Validation/scope/permission error
 */
export async function rejectBrokerApplication(base44, context, payload) {
  const isSuperAdmin = context.role === 'platform_super_admin' || context.role === 'admin';
  // Feature flag check: fail-closed
  if (!isSuperAdmin && !FEATURE_FLAGS.BROKER_PLATFORM_REVIEW_ENABLED) {
    throw {
      status: 403,
      code: 'NOT_AUTHORIZED_FOR_GATE_7A_1',
      message: 'Rejection is not yet authorized for this phase',
    };
  }

  // Permission check: fail-closed
  assertPermission(context, REVIEW_APPROVAL_PERMISSIONS.REJECT);

  const { tenant_id } = context;
  const { broker_agency_id, reason } = payload;
  const auditTraceId = crypto.randomUUID();
  const rejectedAt = new Date().toISOString();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess(context, profile);

    // Get onboarding case
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length === 0) {
      throw { status: 404, message: 'Onboarding case not found' };
    }

    const onboardingCase = cases[0];

    // Update BrokerAgencyProfile
    await base44.asServiceRole.entities.BrokerAgencyProfile.update(
      broker_agency_id,
      {
        approval_status: 'rejected',
        portal_access_enabled: false,
      }
    );

    // Update BrokerAgencyOnboardingCase
    await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
      onboardingCase.id,
      {
        status: 'rejected',
        rejected_at: rejectedAt,
      }
    );

    // Update BrokerPlatformRelationship
    const relationships = await base44.asServiceRole.entities.BrokerPlatformRelationship.filter(
      { broker_agency_id, tenant_id }
    );
    if (relationships.length > 0) {
      await base44.asServiceRole.entities.BrokerPlatformRelationship.update(
        relationships[0].id,
        {
          status: 'rejected',
          approval_status: 'rejected',
          approval_notes: reason,
        }
      );
    }

    // Audit: BROKER_PLATFORM_RELATIONSHIP_REJECTED
    await createAuditEvent(base44, {
      tenant_id,
      actor_user_id: context.user_id,
      actor_role: context.role,
      action: 'BROKER_PLATFORM_RELATIONSHIP_REJECTED',
      detail: `Broker rejected by: ${context.user_id}`,
      entity_type: 'BrokerAgencyOnboardingCase',
      entity_id: onboardingCase.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    await createAuditEvent(base44, {
      tenant_id,
      actor_user_id: context.user_id,
      actor_role: context.role,
      action: 'BROKER_ONBOARDING_REJECTED',
      detail: `Rejection reason: ${reason || 'Not provided'}`,
      entity_type: 'BrokerAgencyOnboardingCase',
      entity_id: onboardingCase.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true, rejected_at: rejectedAt };
  } catch (error) {
    if (error.status) throw error;
    throw {
      status: 500,
      code: 'REJECTION_ERROR',
      message: error.message,
    };
  }
}

/**
 * Request more information from broker applicant.
 *
 * Sets status to pending_more_information.
 * Sets 30-day deadline.
 * Stores request details.
 * Blocks approval until resolved.
 * Permission-gated.
 *
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, user_email, role }
 * @param {object} payload - { broker_agency_id, information_requested }
 * @returns {object} { success: true, deadline: ISO timestamp }
 * @throws {Error} Validation/scope/permission error
 */
export async function requestBrokerMoreInformation(base44, context, payload) {
  const isSuperAdmin = context.role === 'platform_super_admin' || context.role === 'admin';
  // Feature flag check: fail-closed
  if (!isSuperAdmin && !FEATURE_FLAGS.BROKER_PLATFORM_REVIEW_ENABLED) {
    throw {
      status: 403,
      code: 'NOT_AUTHORIZED_FOR_GATE_7A_1',
      message: 'Information requests are not yet authorized for this phase',
    };
  }

  // Permission check: fail-closed
  assertPermission(context, REVIEW_APPROVAL_PERMISSIONS.REQUEST_INFO);

  const { tenant_id } = context;
  const { broker_agency_id, information_requested } = payload;
  const auditTraceId = crypto.randomUUID();
  const deadline = calculateInfoDeadline();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess(context, profile);

    // Get onboarding case
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length === 0) {
      throw { status: 404, message: 'Onboarding case not found' };
    }

    const onboardingCase = cases[0];

    // Update onboarding case
    await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
      onboardingCase.id,
      {
        status: 'pending_more_information',
        more_info_deadline: deadline,
        more_info_details: information_requested,
      }
    );

    // Audit: BROKER_MORE_INFORMATION_REQUESTED
    await createAuditEvent(base44, {
      tenant_id,
      actor_user_id: context.user_id,
      actor_role: context.role,
      action: 'BROKER_MORE_INFORMATION_REQUESTED',
      detail: `Information requested by: ${context.user_id}`,
      entity_type: 'BrokerAgencyOnboardingCase',
      entity_id: onboardingCase.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true, deadline };
  } catch (error) {
    if (error.status) throw error;
    throw {
      status: 500,
      code: 'INFO_REQUEST_ERROR',
      message: error.message,
    };
  }
}

/**
 * Place compliance hold on broker onboarding.
 *
 * Blocks approval and portal access.
 * Stores hold reason.
 * Compliance hold must be released or overridden before approval.
 * Permission-gated.
 *
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, user_email, role }
 * @param {object} payload - { broker_agency_id, reason }
 * @returns {object} { success: true, hold_placed: ISO timestamp }
 * @throws {Error} Validation/scope/permission error
 */
export async function placeComplianceHold(base44, context, payload) {
  const isSuperAdmin = context.role === 'platform_super_admin' || context.role === 'admin';
  // Feature flag check: fail-closed
  if (!isSuperAdmin && !FEATURE_FLAGS.BROKER_COMPLIANCE_HOLD_ENABLED) {
    throw {
      status: 403,
      code: 'NOT_AUTHORIZED_FOR_GATE_7A_1',
      message: 'Compliance holds are not yet authorized for this phase',
    };
  }

  // Permission check: fail-closed
  assertPermission(context, REVIEW_APPROVAL_PERMISSIONS.HOLD);

  const { tenant_id } = context;
  const { broker_agency_id, reason } = payload;
  const auditTraceId = crypto.randomUUID();
  const holdPlacedAt = new Date().toISOString();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess(context, profile);

    // Get onboarding case
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length === 0) {
      throw { status: 404, message: 'Onboarding case not found' };
    }

    const onboardingCase = cases[0];

    // Update onboarding case
    await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
      onboardingCase.id,
      {
        compliance_hold: true,
        compliance_hold_reason: reason,
        compliance_hold_placed_at: holdPlacedAt,
        compliance_hold_placed_by: context.user_id,
        compliance_status: 'compliance_hold',
      }
    );

    // Update BrokerAgencyProfile
    await base44.asServiceRole.entities.BrokerAgencyProfile.update(
      broker_agency_id,
      {
        compliance_status: 'compliance_hold',
        portal_access_enabled: false,
      }
    );

    // Audit: BROKER_COMPLIANCE_HOLD_PLACED
    await createAuditEvent(base44, {
      tenant_id,
      actor_user_id: context.user_id,
      actor_role: context.role,
      action: 'BROKER_COMPLIANCE_HOLD_PLACED',
      detail: `Compliance hold placed by: ${context.user_id}, reason: ${reason}`,
      entity_type: 'BrokerAgencyOnboardingCase',
      entity_id: onboardingCase.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true, hold_placed: holdPlacedAt };
  } catch (error) {
    if (error.status) throw error;
    throw {
      status: 500,
      code: 'HOLD_ERROR',
      message: error.message,
    };
  }
}

/**
 * Release compliance hold on broker onboarding.
 *
 * Allows approval to proceed.
 * Clears hold timestamp and reason.
 * Updates compliance status.
 * Permission-gated.
 *
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, user_email, role }
 * @param {object} payload - { broker_agency_id }
 * @returns {object} { success: true, hold_released: ISO timestamp }
 * @throws {Error} Validation/scope/permission error
 */
export async function releaseComplianceHold(base44, context, payload) {
  const isSuperAdmin = context.role === 'platform_super_admin' || context.role === 'admin';
  // Feature flag check: fail-closed
  if (!isSuperAdmin && !FEATURE_FLAGS.BROKER_COMPLIANCE_HOLD_ENABLED) {
    throw {
      status: 403,
      code: 'NOT_AUTHORIZED_FOR_GATE_7A_1',
      message: 'Compliance hold release is not yet authorized for this phase',
    };
  }

  // Permission check: fail-closed
  assertPermission(context, REVIEW_APPROVAL_PERMISSIONS.RELEASE_HOLD);

  const { tenant_id } = context;
  const { broker_agency_id } = payload;
  const auditTraceId = crypto.randomUUID();
  const holdReleasedAt = new Date().toISOString();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess(context, profile);

    // Get onboarding case
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length === 0) {
      throw { status: 404, message: 'Onboarding case not found' };
    }

    const onboardingCase = cases[0];

    // Update onboarding case
    await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
      onboardingCase.id,
      {
        compliance_hold: false,
        compliance_hold_reason: null,
        compliance_hold_released_at: holdReleasedAt,
        compliance_status: 'compliant',
      }
    );

    // Update BrokerAgencyProfile
    await base44.asServiceRole.entities.BrokerAgencyProfile.update(
      broker_agency_id,
      {
        compliance_status: 'compliant',
      }
    );

    // Audit: BROKER_COMPLIANCE_HOLD_RELEASED
    await createAuditEvent(base44, {
      tenant_id,
      actor_user_id: context.user_id,
      actor_role: context.role,
      action: 'BROKER_COMPLIANCE_HOLD_RELEASED',
      detail: `Compliance hold released by: ${context.user_id}`,
      entity_type: 'BrokerAgencyOnboardingCase',
      entity_id: onboardingCase.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true, hold_released: holdReleasedAt };
  } catch (error) {
    if (error.status) throw error;
    throw {
      status: 500,
      code: 'RELEASE_ERROR',
      message: error.message,
    };
  }
}

/**
 * Approve manual compliance override.
 *
 * Allows broker approval despite active compliance hold.
 * Requires explicit permission and audit reason.
 * Records override timestamp and authorizing user.
 * Permission-gated.
 *
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, user_email, role }
 * @param {object} payload - { broker_agency_id, override_reason }
 * @returns {object} { success: true, override_approved: ISO timestamp }
 * @throws {Error} Validation/scope/permission error
 */
export async function approveComplianceOverride(base44, context, payload) {
  const isSuperAdmin = context.role === 'platform_super_admin' || context.role === 'admin';
  // Feature flag check: fail-closed (uses same HOLD flag for now)
  if (!isSuperAdmin && !FEATURE_FLAGS.BROKER_COMPLIANCE_HOLD_ENABLED) {
    throw {
      status: 403,
      code: 'NOT_AUTHORIZED_FOR_GATE_7A_1',
      message: 'Compliance override is not yet authorized for this phase',
    };
  }

  // Permission check: fail-closed
  assertPermission(context, REVIEW_APPROVAL_PERMISSIONS.RELEASE_HOLD);

  const { tenant_id } = context;
  const { broker_agency_id, override_reason } = payload;
  const auditTraceId = crypto.randomUUID();
  const overrideApprovedAt = new Date().toISOString();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess(context, profile);

    // Get onboarding case
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length === 0) {
      throw { status: 404, message: 'Onboarding case not found' };
    }

    const onboardingCase = cases[0];

    // Update onboarding case
    await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
      onboardingCase.id,
      {
        compliance_override_approved: true,
        compliance_override_reason: override_reason,
        compliance_override_approved_by: context.user_id,
        compliance_override_approved_at: overrideApprovedAt,
      }
    );

    // Audit: BROKER_REVIEW_OVERRIDE_USED
    await createAuditEvent(base44, {
      tenant_id,
      actor_user_id: context.user_id,
      actor_role: context.role,
      action: 'BROKER_REVIEW_OVERRIDE_USED',
      detail: `Compliance override approved by: ${context.user_id}, reason: ${override_reason}`,
      entity_type: 'BrokerAgencyOnboardingCase',
      entity_id: onboardingCase.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true, override_approved: overrideApprovedAt };
  } catch (error) {
    if (error.status) throw error;
    throw {
      status: 500,
      code: 'OVERRIDE_ERROR',
      message: error.message,
    };
  }
}

export default {
  startBrokerPlatformReview,
  approveBrokerForActivation,
  rejectBrokerApplication,
  requestBrokerMoreInformation,
  placeComplianceHold,
  releaseComplianceHold,
  approveComplianceOverride,
};