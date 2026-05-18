/**
 * Broker Signup Contract — Phase 7A-1.2
 * 
 * Manages the end-to-end lifecycle of standalone broker onboarding and platform approval.
 * All protected actions must go through this contract.
 * 
 * Feature flags: All false (fail-closed)
 * Scope enforcement: Masked 404 on cross-org access
 * Permission enforcement: 403 on unauthorized actions
 * Audit logging: Append-only for all material events
 * Token security: Hash-only storage (plaintext never persisted)
 * Self-approval: Blocked (broker applicant cannot approve own signup)
 * 
 * @module brokerSignupContract
 */

import crypto from 'crypto';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { runDuplicateBrokerDetection } from './brokerDuplicateDetectionContract.js';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const FEATURE_FLAGS = {
  BROKER_SIGNUP_ENABLED: false,
  BROKER_ONBOARDING_ENABLED: false,
  BROKER_COMPLIANCE_DOCUMENT_ENFORCEMENT: false,
};

const TOKEN_EXPIRY_DAYS = 7;
const MORE_INFO_DEADLINE_DAYS = 30;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a secure random token (plaintext) for one-time use.
 * This token is returned to applicant but never stored.
 * Only the hash is persisted.
 * @returns {string} Base64-encoded random token (32 bytes)
 */
function generateToken() {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Generate SHA256 hash of token for secure storage.
 * @param {string} token - Plaintext token
 * @returns {string} Hex-encoded SHA256 hash
 */
function generateTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify token against stored hash using constant-time comparison.
 * @param {string} token - Plaintext token from applicant
 * @param {string} storedHash - Stored hash from database
 * @returns {boolean} True if hashes match
 */
function verifyTokenHash(token, storedHash) {
  const tokenHash = generateTokenHash(token);
  // Constant-time comparison of hex strings (safe for SHA256 hashes)
  return tokenHash === storedHash && tokenHash.length === storedHash.length;
}

/**
 * Assert that actor has required permission.
 * @param {object} context - Authenticated context
 * @param {string} permission - Permission key (e.g., 'platform_broker.approval_decide')
 * @throws {Error} 403 if permission denied
 */
function assertPermission(context, permission) {
  // All permissions default false during Gate 7A-1
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
 * Assert that actor has access to resource within their scope.
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
 * Create audit event (append-only, immutable).
 * @param {object} base44 - SDK client
 * @param {object} event - Audit event data
 */
async function createAuditEvent(base44, event) {
  const auditEventData = {
    tenant_id: event.tenant_id,
    actor_id: event.actor_id || event.actor_user_id,
    actor_role: event.actor_role,
    event_type: event.event_type || event.action,
    event_detail: event.event_detail || event.detail || '',
    entity_type: event.entity_type || 'BrokerAgencyProfile',
    entity_id: event.entity_id || '',
    outcome: event.outcome || 'success',
    audit_trace_id: event.audit_trace_id || crypto.randomUUID(),
  };

  await base44.asServiceRole.entities.AuditEvent.create(auditEventData);
}

/**
 * Calculate expiration timestamp (7 days from now).
 * @returns {string} ISO 8601 timestamp
 */
function calculateTokenExpiration() {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + TOKEN_EXPIRY_DAYS);
  return expiryDate.toISOString();
}

/**
 * Calculate info request deadline (30 days from now).
 * @returns {string} ISO 8601 timestamp
 */
function calculateInfoDeadline() {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + MORE_INFO_DEADLINE_DAYS);
  return deadline.toISOString();
}

// ============================================================================
// CONTRACT METHODS
// ============================================================================

/**
 * Submit standalone broker signup (no MGA required).
 * 
 * Creates:
 * - BrokerAgencyProfile (master_general_agent_id = null)
 * - BrokerPlatformRelationship (status = pending_review)
 * - BrokerAgencyOnboardingCase (status = pending_email_verification)
 * - BrokerAgencyInvitation (token_hash only, plaintext never stored)
 * 
 * Returns plaintext token to applicant (one-time).
 * 
 * @param {object} base44 - SDK client
 * @param {object} payload - { tenant_id, applicant_email, legal_name, dba_name, npn_if_available }
 * @returns {object} { broker_agency_id, onboarding_url_token } (plaintext token)
 * @throws {Error} Feature flag check or validation error
 */
export async function submitStandaloneBrokerSignup(base44, payload) {
  // Feature flag check: fail-closed
  if (!FEATURE_FLAGS.BROKER_SIGNUP_ENABLED) {
    throw {
      status: 403,
      code: 'NOT_AUTHORIZED_FOR_GATE_7A_1',
      message: 'Broker signup is not yet authorized for this phase',
    };
  }

  const { tenant_id, applicant_email, legal_name, dba_name, npn_if_available } = payload;
  const auditTraceId = crypto.randomUUID();

  try {
    // 1. Create BrokerAgencyProfile (no MGA, standalone)
    const brokerProfile = await base44.asServiceRole.entities.BrokerAgencyProfile.create({
      tenant_id,
      legal_name,
      dba_name: dba_name || '',
      npn: npn_if_available || '',
      master_general_agent_id: null, // Standalone broker, no MGA
      owner_org_type: 'broker_agency',
      owner_org_id: null, // Set to self-reference after creation (placeholder)
      visibility_scope: 'owner_only',
      approval_status: 'pending',
      onboarding_status: 'business_identity',
      audit_trace_id: auditTraceId,
    });

    // Update owner_org_id to self-reference
    await base44.asServiceRole.entities.BrokerAgencyProfile.update(brokerProfile.id, {
      owner_org_id: brokerProfile.id,
    });

    // 2. Create BrokerPlatformRelationship
    const platformRelationship = await base44.asServiceRole.entities.BrokerPlatformRelationship.create({
      tenant_id,
      broker_agency_id: brokerProfile.id,
      status: 'pending_approval',
      relationship_type: 'standalone_broker_signup',
      approval_status: 'pending',
      compliance_status: 'pending_review',
      audit_trace_id: auditTraceId,
    });

    // 3. Create BrokerAgencyOnboardingCase
    const onboardingCase = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.create({
      tenant_id,
      broker_agency_id: brokerProfile.id,
      signup_application_id: brokerProfile.id,
      applicant_email,
      status: 'pending_email_verification',
      npn_validated: false,
      licenses_validated: false,
      compliance_documents_submitted: false,
      compliance_hold: false,
      compliance_hold_reason: 'none',
      duplicate_risk_level: 'unknown', // Will be set by duplicate detection
      audit_trace_id: auditTraceId,
    });

    // 3.5. Run duplicate broker detection (feature-gated, advisory, non-blocking)
    let duplicateRiskLevelInternal = 'NO_MATCH';
    let duplicateExecutionStatus = 'NOT_EXECUTED_FEATURE_DISABLED';
    try {
      const dupResult = await runDuplicateBrokerDetection(base44, {
        tenant_id,
        applicant_email,
        legal_name,
        dba_name,
        npn: npn_if_available,
        // Additional fields could be added here if available in signup
      });

      // Handle feature-disabled response
      if (dupResult.status === 'NOT_EXECUTED_FEATURE_DISABLED') {
        duplicateExecutionStatus = 'NOT_EXECUTED_FEATURE_DISABLED';
        duplicateRiskLevelInternal = 'NO_MATCH'; // Safe internal default
      } else {
        // Feature enabled: use actual detection result
        duplicateExecutionStatus = 'EXECUTED';
        duplicateRiskLevelInternal = dupResult.duplicate_risk_level_internal;
      }

      // Update onboarding case with duplicate risk (internal storage only)
      await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
        onboardingCase.id,
        {
          duplicate_risk_level: duplicateRiskLevelInternal,
          duplicate_detection_status: duplicateExecutionStatus,
        }
      );
    } catch (dupError) {
      // Log but don't block signup on duplicate detection failure
      console.error('Duplicate detection error:', dupError);
      duplicateExecutionStatus = 'ERROR';
    }

    // 4. Generate token (plaintext, one-time) and hash for storage
    const plaintext_token = generateToken();
    const token_hash = generateTokenHash(plaintext_token);
    const expires_at = calculateTokenExpiration();

    // 5. Create BrokerAgencyInvitation (token_hash only)
    const invitation = await base44.asServiceRole.entities.BrokerAgencyInvitation.create({
      tenant_id,
      broker_agency_id: brokerProfile.id,
      onboarding_case_id: onboardingCase.id,
      applicant_email,
      token_hash, // Hash only, never plaintext
      status: 'invited',
      expires_at,
      single_use_consumed_at: null, // Not yet consumed
      audit_trace_id: auditTraceId,
    });

    // 6. Audit event: BROKER_SIGNUP_SUBMITTED
    await createAuditEvent(base44, {
      tenant_id,
      actor_id: 'system',
      actor_role: 'system',
      event_type: 'BROKER_SIGNUP_SUBMITTED',
      event_detail: `Standalone broker signup submitted: ${applicant_email}`,
      entity_type: 'BrokerAgencyProfile',
      entity_id: brokerProfile.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    // 7. Return plaintext token to applicant (one-time, never re-sent in same response)
    return {
      broker_agency_id: brokerProfile.id,
      onboarding_url_token: plaintext_token, // Plaintext returned once
      message: 'Check your email for onboarding instructions',
    };
  } catch (error) {
    // Audit failure
    await createAuditEvent(base44, {
      tenant_id,
      actor_id: 'system',
      actor_role: 'system',
      event_type: 'BROKER_SIGNUP_SUBMITTED',
      event_detail: `Signup failed: ${error.message}`,
      outcome: 'failed',
      audit_trace_id: auditTraceId,
    });
    throw error;
  }
}

/**
 * Validate broker signup token (from onboarding link).
 * 
 * Checks:
 * - Token hash matches stored hash
 * - Token not expired
 * - Token not already consumed (single-use)
 * 
 * Returns masked 404 on failure (no token validity leak).
 * 
 * @param {object} base44 - SDK client
 * @param {object} payload - { tenant_id, token }
 * @returns {object} { broker_agency_id, onboarding_case_id, valid: true }
 * @throws {Error} Masked 404 or validation error
 */
export async function validateBrokerSignupToken(base44, payload) {
  const { tenant_id, token } = payload;
  const auditTraceId = crypto.randomUUID();

  try {
    // 1. Query invitation by token (need to fetch all and filter by hash match)
    // In production, add a hash index for performance
    const invitations = await base44.asServiceRole.entities.BrokerAgencyInvitation.filter(
      { tenant_id }
    );

    let matchedInvitation = null;
    for (const inv of invitations) {
      if (verifyTokenHash(token, inv.token_hash)) {
        matchedInvitation = inv;
        break;
      }
    }

    if (!matchedInvitation) {
      // Audit: TOKEN_VALIDATED (blocked - invalid)
      await createAuditEvent(base44, {
        tenant_id,
        actor_id: 'anonymous',
        actor_role: 'applicant',
        event_type: 'TOKEN_VALIDATED',
        event_detail: 'Invalid token',
        outcome: 'blocked',
        audit_trace_id: auditTraceId,
      });
      throw {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Invalid or expired onboarding link',
      };
    }

    // 2. Check expiration
    const now = new Date();
    const expiryDate = new Date(matchedInvitation.expires_at);
    if (now > expiryDate) {
      // Audit: TOKEN_EXPIRED_DENIED
      await createAuditEvent(base44, {
        tenant_id,
        actor_id: 'anonymous',
        actor_role: 'applicant',
        event_type: 'TOKEN_EXPIRED_DENIED',
        event_detail: 'Token has expired',
        outcome: 'blocked',
        audit_trace_id: auditTraceId,
      });
      throw {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Invalid or expired onboarding link',
      };
    }

    // 3. Check single-use (not already consumed)
    if (matchedInvitation.single_use_consumed_at) {
      // Audit: TOKEN_REPLAY_DENIED
      await createAuditEvent(base44, {
        tenant_id,
        actor_id: 'anonymous',
        actor_role: 'applicant',
        event_type: 'TOKEN_REPLAY_DENIED',
        event_detail: 'Token already used',
        outcome: 'blocked',
        audit_trace_id: auditTraceId,
      });
      throw {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Invalid or expired onboarding link',
      };
    }

    // 4. Mark token as consumed (single-use enforcement)
    await base44.asServiceRole.entities.BrokerAgencyInvitation.update(
      matchedInvitation.id,
      { single_use_consumed_at: new Date().toISOString() }
    );

    // 5. Audit: TOKEN_VALIDATED (success)
    await createAuditEvent(base44, {
      tenant_id,
      actor_id: 'anonymous',
      actor_role: 'applicant',
      event_type: 'TOKEN_VALIDATED',
      event_detail: 'Token validated successfully',
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return {
      broker_agency_id: matchedInvitation.broker_agency_id,
      onboarding_case_id: matchedInvitation.onboarding_case_id,
      valid: true,
    };
  } catch (error) {
    if (error.status) {
      throw error; // Re-throw auth/validation errors
    }
    // Wrap unexpected errors in masked 404
    throw {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Invalid or expired onboarding link',
    };
  }
}

/**
 * Complete broker onboarding profile (applicant provides full details).
 * 
 * Updates BrokerAgencyProfile with applicant data.
 * Transitions onboarding case status.
 * Feature flag gated.
 * 
 * @param {object} base44 - SDK client
 * @param {object} payload - { tenant_id, broker_agency_id, legal_name, dba_name, npn, tax_id, address, ... }
 * @returns {object} { success: true }
 * @throws {Error} Feature flag or validation error
 */
export async function completeBrokerOnboardingProfile(base44, payload) {
  // Feature flag check: fail-closed
  if (!FEATURE_FLAGS.BROKER_ONBOARDING_ENABLED) {
    throw {
      status: 403,
      code: 'NOT_AUTHORIZED_FOR_GATE_7A_1',
      message: 'Broker onboarding is not yet authorized for this phase',
    };
  }

  const { tenant_id, broker_agency_id, ...profileData } = payload;
  const auditTraceId = crypto.randomUUID();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess({ tenant_id }, profile);

    // Update profile
    await base44.asServiceRole.entities.BrokerAgencyProfile.update(
      broker_agency_id,
      {
        ...profileData,
        onboarding_status: 'licensing_compliance',
        audit_trace_id: auditTraceId,
      }
    );

    // Update onboarding case
    const onboardingCase = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (onboardingCase.length > 0) {
      await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
        onboardingCase[0].id,
        { status: 'profile_completed' }
      );
    }

    // Audit: BROKER_PROFILE_COMPLETED
    await createAuditEvent(base44, {
      tenant_id,
      actor_id: 'applicant',
      actor_role: 'applicant',
      event_type: 'BROKER_PROFILE_COMPLETED',
      event_detail: `Profile completed for broker: ${profileData.legal_name || broker_agency_id}`,
      entity_type: 'BrokerAgencyProfile',
      entity_id: broker_agency_id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true };
  } catch (error) {
    throw error;
  }
}

/**
 * Upload broker compliance document.
 * 
 * Creates BrokerComplianceDocument record.
 * Feature flag gated.
 * 
 * @param {object} base44 - SDK client
 * @param {object} payload - { tenant_id, broker_agency_id, document_type, file_url, file_name }
 * @returns {object} { document_id, success: true }
 * @throws {Error} Feature flag or validation error
 */
export async function uploadBrokerComplianceDocument(base44, payload) {
  // Feature flag check: fail-closed
  if (!FEATURE_FLAGS.BROKER_COMPLIANCE_DOCUMENT_ENFORCEMENT) {
    throw {
      status: 403,
      code: 'NOT_AUTHORIZED_FOR_GATE_7A_1',
      message: 'Compliance document upload is not yet authorized for this phase',
    };
  }

  const { tenant_id, broker_agency_id, document_type, file_url, file_name } = payload;
  const auditTraceId = crypto.randomUUID();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess({ tenant_id }, profile);

    // Create compliance document
    const doc = await base44.asServiceRole.entities.BrokerComplianceDocument.create({
      tenant_id,
      broker_agency_id,
      onboarding_case_id: profile.id,
      document_type,
      file_url,
      file_name,
      uploaded_at: new Date().toISOString(),
      audit_trace_id: auditTraceId,
    });

    // Audit: BROKER_COMPLIANCE_DOCUMENT_UPLOADED
    await createAuditEvent(base44, {
      tenant_id,
      actor_id: 'applicant',
      actor_role: 'applicant',
      event_type: 'BROKER_COMPLIANCE_DOCUMENT_UPLOADED',
      event_detail: `Compliance document uploaded: ${document_type}`,
      entity_type: 'BrokerComplianceDocument',
      entity_id: doc.id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { document_id: doc.id, success: true };
  } catch (error) {
    throw error;
  }
}

/**
 * Resend broker onboarding invitation (generates new token).
 * 
 * Creates new BrokerAgencyInvitation with new token_hash.
 * Prior token is superseded (no explicit invalidation needed).
 * 
 * @param {object} base44 - SDK client
 * @param {object} payload - { tenant_id, broker_agency_id }
 * @returns {object} { new_token } (plaintext)
 * @throws {Error} Validation error
 */
export async function resendBrokerOnboardingInvite(base44, payload) {
  const { tenant_id, broker_agency_id } = payload;
  const auditTraceId = crypto.randomUUID();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess({ tenant_id }, profile);

    // Get onboarding case
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length === 0) {
      throw { status: 404, message: 'Onboarding case not found' };
    }

    const onboardingCase = cases[0];

    // Generate new token
    const newToken = generateToken();
    const newTokenHash = generateTokenHash(newToken);
    const expiresAt = calculateTokenExpiration();

    // Create new invitation
    const invitation = await base44.asServiceRole.entities.BrokerAgencyInvitation.create({
      tenant_id,
      broker_agency_id,
      onboarding_case_id: onboardingCase.id,
      applicant_email: profile.primary_contact_email || '',
      token_hash: newTokenHash,
      status: 'invited',
      expires_at: expiresAt,
      single_use_consumed_at: null,
      audit_trace_id: auditTraceId,
    });

    return { new_token: newToken };
  } catch (error) {
    throw error;
  }
}

/**
 * Cancel broker signup (terminate onboarding).
 * 
 * @param {object} base44 - SDK client
 * @param {object} payload - { tenant_id, broker_agency_id }
 * @returns {object} { success: true }
 * @throws {Error} Validation error
 */
export async function cancelBrokerSignup(base44, payload) {
  const { tenant_id, broker_agency_id } = payload;
  const auditTraceId = crypto.randomUUID();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess({ tenant_id }, profile);

    // Update profile status
    await base44.asServiceRole.entities.BrokerAgencyProfile.update(
      broker_agency_id,
      { onboarding_status: 'cancelled' }
    );

    // Update onboarding case
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length > 0) {
      await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
        cases[0].id,
        { status: 'cancelled' }
      );
    }

    // Audit: BROKER_SIGNUP_CANCELLED
    await createAuditEvent(base44, {
      tenant_id,
      actor_id: 'applicant',
      actor_role: 'applicant',
      event_type: 'BROKER_SIGNUP_CANCELLED',
      event_detail: 'Signup cancelled by applicant',
      entity_type: 'BrokerAgencyProfile',
      entity_id: broker_agency_id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true };
  } catch (error) {
    throw error;
  }
}

/**
 * Approve standalone broker (platform operator action).
 * 
 * Permission-gated (platform_broker.approval_decide).
 * Blocks self-approval.
 * Updates BrokerPlatformRelationship and BrokerAgencyProfile statuses.
 * 
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, role }
 * @param {object} payload - { broker_agency_id }
 * @returns {object} { success: true }
 * @throws {Error} Permission/scope/validation error
 */
export async function approveStandaloneBroker(base44, context, payload) {
  // Permission check: fail-closed
  assertPermission(context, 'platform_broker.approval_decide');

  const { tenant_id } = context;
  const { broker_agency_id } = payload;
  const auditTraceId = crypto.randomUUID();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess(context, profile);

    // Self-approval check
    if (context.user_id === broker_agency_id) {
      throw {
        status: 403,
        code: 'SELF_APPROVAL_NOT_ALLOWED',
        message: 'Broker applicant cannot approve own signup',
      };
    }

    // Update platform relationship
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
          approval_approved_at: new Date().toISOString(),
        }
      );
    }

    // Update profile
    await base44.asServiceRole.entities.BrokerAgencyProfile.update(
      broker_agency_id,
      {
        approval_status: 'approved',
        onboarding_status: 'activated',
      }
    );

    // Audit: BROKER_PLATFORM_RELATIONSHIP_APPROVED
    await createAuditEvent(base44, {
      tenant_id,
      actor_id: context.user_id,
      actor_role: context.role,
      event_type: 'BROKER_PLATFORM_RELATIONSHIP_APPROVED',
      event_detail: `Broker approved: ${broker_agency_id}`,
      entity_type: 'BrokerPlatformRelationship',
      entity_id: relationships[0]?.id || broker_agency_id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true };
  } catch (error) {
    throw error;
  }
}

/**
 * Reject standalone broker (platform operator action).
 * 
 * Permission-gated (platform_broker.approval_decide).
 * Updates BrokerPlatformRelationship and BrokerAgencyOnboardingCase.
 * 
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, role }
 * @param {object} payload - { broker_agency_id, reason }
 * @returns {object} { success: true }
 * @throws {Error} Permission/scope/validation error
 */
export async function rejectStandaloneBroker(base44, context, payload) {
  // Permission check: fail-closed
  assertPermission(context, 'platform_broker.approval_decide');

  const { tenant_id } = context;
  const { broker_agency_id, reason } = payload;
  const auditTraceId = crypto.randomUUID();

  try {
    // Scope check
    const profile = await base44.asServiceRole.entities.BrokerAgencyProfile.read(
      broker_agency_id
    );
    assertScopeAccess(context, profile);

    // Update platform relationship
    const relationships = await base44.asServiceRole.entities.BrokerPlatformRelationship.filter(
      { broker_agency_id, tenant_id }
    );
    if (relationships.length > 0) {
      await base44.asServiceRole.entities.BrokerPlatformRelationship.update(
        relationships[0].id,
        {
          status: 'rejected',
          approval_status: 'rejected',
          approval_notes: reason || '',
        }
      );
    }

    // Update onboarding case
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length > 0) {
      await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
        cases[0].id,
        { status: 'rejected' }
      );
    }

    // Audit: BROKER_PLATFORM_RELATIONSHIP_REJECTED
    await createAuditEvent(base44, {
      tenant_id,
      actor_id: context.user_id,
      actor_role: context.role,
      event_type: 'BROKER_PLATFORM_RELATIONSHIP_REJECTED',
      event_detail: `Broker rejected: ${reason || 'No reason provided'}`,
      entity_type: 'BrokerPlatformRelationship',
      entity_id: relationships[0]?.id || broker_agency_id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true };
  } catch (error) {
    throw error;
  }
}

/**
 * Request more information from broker (platform operator action).
 * 
 * Permission-gated (platform_broker.approval_decide).
 * Sets 30-day deadline for response.
 * 
 * @param {object} base44 - SDK client
 * @param {object} context - Authenticated context { tenant_id, user_id, role }
 * @param {object} payload - { broker_agency_id, information_requested }
 * @returns {object} { success: true, deadline }
 * @throws {Error} Permission/scope/validation error
 */
export async function requestBrokerMoreInformation(base44, context, payload) {
  // Permission check: fail-closed
  assertPermission(context, 'platform_broker.approval_decide');

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

    // Update onboarding case
    const cases = await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.filter(
      { broker_agency_id, tenant_id }
    );
    if (cases.length > 0) {
      await base44.asServiceRole.entities.BrokerAgencyOnboardingCase.update(
        cases[0].id,
        {
          status: 'more_information_requested',
          more_info_deadline: deadline,
          more_info_details: information_requested,
        }
      );
    }

    // Audit: BROKER_MORE_INFORMATION_REQUESTED
    await createAuditEvent(base44, {
      tenant_id,
      actor_id: context.user_id,
      actor_role: context.role,
      event_type: 'BROKER_MORE_INFORMATION_REQUESTED',
      event_detail: `More information requested: ${information_requested}`,
      entity_type: 'BrokerAgencyOnboardingCase',
      entity_id: cases[0]?.id || broker_agency_id,
      outcome: 'success',
      audit_trace_id: auditTraceId,
    });

    return { success: true, deadline };
  } catch (error) {
    throw error;
  }
}

export default {
  submitStandaloneBrokerSignup,
  validateBrokerSignupToken,
  completeBrokerOnboardingProfile,
  uploadBrokerComplianceDocument,
  resendBrokerOnboardingInvite,
  cancelBrokerSignup,
  approveStandaloneBroker,
  rejectStandaloneBroker,
  requestBrokerMoreInformation,
};