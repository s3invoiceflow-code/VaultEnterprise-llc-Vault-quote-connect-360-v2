/**
 * Enhanced Permission Resolver with Relationship Context
 * 
 * Evaluates user permissions based on:
 * - User role and organization scope
 * - Broker Agency ownership
 * - MGA affiliation status
 * - BrokerMGARelationship lifecycle status
 * - Relationship-scoped operation authorization
 * - Record classification (direct_broker_owned vs mga_affiliated)
 * 
 * Gate 7A-3 Phase 7A-3.3
 * Backward-compatible with Gate 7A-0 permission model
 */

import { base44 } from '@/api/base44Client';
import relationshipScopeResolver from '@/lib/scopeResolvers/relationshipScopeResolver.js';

// Permission Actions
export const PERMISSION_ACTIONS = {
  // Read operations
  READ_CASE: 'read_case',
  READ_CENSUS: 'read_census',
  READ_QUOTE: 'read_quote',
  READ_PROPOSAL: 'read_proposal',
  READ_DOCUMENT: 'read_document',
  READ_TASK: 'read_task',
  READ_EMPLOYER: 'read_employer',

  // Create operations
  CREATE_CASE: 'create_case',
  CREATE_CENSUS: 'create_census',
  CREATE_QUOTE: 'create_quote',
  CREATE_PROPOSAL: 'create_proposal',
  CREATE_DOCUMENT: 'create_document',
  CREATE_TASK: 'create_task',

  // Update operations
  UPDATE_CASE: 'update_case',
  UPDATE_CENSUS: 'update_census',
  UPDATE_QUOTE: 'update_quote',
  UPDATE_PROPOSAL: 'update_proposal',
  UPDATE_DOCUMENT: 'update_document',
  UPDATE_TASK: 'update_task',

  // Delete operations
  DELETE_CASE: 'delete_case',
  DELETE_CENSUS: 'delete_census',
  DELETE_QUOTE: 'delete_quote',
  DELETE_PROPOSAL: 'delete_proposal',
  DELETE_DOCUMENT: 'delete_document',
  DELETE_TASK: 'delete_task',

  // Admin operations
  ADMIN_OVERRIDE: 'admin_override',
  MANAGE_RELATIONSHIP: 'manage_relationship'
};

// Role-based default permissions
const ROLE_PERMISSIONS = {
  // Platform admin: all permissions
  platform_admin: Object.values(PERMISSION_ACTIONS),
  platform_super_admin: Object.values(PERMISSION_ACTIONS),

  // MGA admin: all MGA-scoped operations
  mga_admin: [
    PERMISSION_ACTIONS.READ_CASE,
    PERMISSION_ACTIONS.READ_CENSUS,
    PERMISSION_ACTIONS.READ_QUOTE,
    PERMISSION_ACTIONS.READ_PROPOSAL,
    PERMISSION_ACTIONS.READ_DOCUMENT,
    PERMISSION_ACTIONS.READ_TASK,
    PERMISSION_ACTIONS.READ_EMPLOYER,
    PERMISSION_ACTIONS.CREATE_CASE,
    PERMISSION_ACTIONS.CREATE_CENSUS,
    PERMISSION_ACTIONS.CREATE_QUOTE,
    PERMISSION_ACTIONS.CREATE_PROPOSAL,
    PERMISSION_ACTIONS.CREATE_DOCUMENT,
    PERMISSION_ACTIONS.CREATE_TASK,
    PERMISSION_ACTIONS.UPDATE_CASE,
    PERMISSION_ACTIONS.UPDATE_CENSUS,
    PERMISSION_ACTIONS.UPDATE_QUOTE,
    PERMISSION_ACTIONS.UPDATE_PROPOSAL,
    PERMISSION_ACTIONS.UPDATE_DOCUMENT,
    PERMISSION_ACTIONS.UPDATE_TASK,
    PERMISSION_ACTIONS.MANAGE_RELATIONSHIP
  ],

  // MGA user: read + create/update for affiliated records only
  mga_user: [
    PERMISSION_ACTIONS.READ_CASE,
    PERMISSION_ACTIONS.READ_CENSUS,
    PERMISSION_ACTIONS.READ_QUOTE,
    PERMISSION_ACTIONS.READ_PROPOSAL,
    PERMISSION_ACTIONS.READ_DOCUMENT,
    PERMISSION_ACTIONS.READ_TASK,
    PERMISSION_ACTIONS.READ_EMPLOYER,
    PERMISSION_ACTIONS.CREATE_CASE,
    PERMISSION_ACTIONS.CREATE_CENSUS,
    PERMISSION_ACTIONS.CREATE_QUOTE,
    PERMISSION_ACTIONS.CREATE_PROPOSAL,
    PERMISSION_ACTIONS.CREATE_DOCUMENT,
    PERMISSION_ACTIONS.CREATE_TASK,
    PERMISSION_ACTIONS.UPDATE_CASE,
    PERMISSION_ACTIONS.UPDATE_CENSUS,
    PERMISSION_ACTIONS.UPDATE_QUOTE,
    PERMISSION_ACTIONS.UPDATE_PROPOSAL,
    PERMISSION_ACTIONS.UPDATE_DOCUMENT,
    PERMISSION_ACTIONS.UPDATE_TASK
  ],

  mga_read_only: [
    PERMISSION_ACTIONS.READ_CASE,
    PERMISSION_ACTIONS.READ_CENSUS,
    PERMISSION_ACTIONS.READ_QUOTE,
    PERMISSION_ACTIONS.READ_PROPOSAL,
    PERMISSION_ACTIONS.READ_DOCUMENT,
    PERMISSION_ACTIONS.READ_TASK,
    PERMISSION_ACTIONS.READ_EMPLOYER
  ],

  // Broker admin: all broker-scoped operations (direct book only)
  broker_admin: [
    PERMISSION_ACTIONS.READ_CASE,
    PERMISSION_ACTIONS.READ_CENSUS,
    PERMISSION_ACTIONS.READ_QUOTE,
    PERMISSION_ACTIONS.READ_PROPOSAL,
    PERMISSION_ACTIONS.READ_DOCUMENT,
    PERMISSION_ACTIONS.READ_TASK,
    PERMISSION_ACTIONS.READ_EMPLOYER,
    PERMISSION_ACTIONS.CREATE_CASE,
    PERMISSION_ACTIONS.CREATE_CENSUS,
    PERMISSION_ACTIONS.CREATE_QUOTE,
    PERMISSION_ACTIONS.CREATE_PROPOSAL,
    PERMISSION_ACTIONS.CREATE_DOCUMENT,
    PERMISSION_ACTIONS.CREATE_TASK,
    PERMISSION_ACTIONS.UPDATE_CASE,
    PERMISSION_ACTIONS.UPDATE_CENSUS,
    PERMISSION_ACTIONS.UPDATE_QUOTE,
    PERMISSION_ACTIONS.UPDATE_PROPOSAL,
    PERMISSION_ACTIONS.UPDATE_DOCUMENT,
    PERMISSION_ACTIONS.UPDATE_TASK
  ],

  // Broker user: read + create/update for own direct records only
  broker_user: [
    PERMISSION_ACTIONS.READ_CASE,
    PERMISSION_ACTIONS.READ_CENSUS,
    PERMISSION_ACTIONS.READ_QUOTE,
    PERMISSION_ACTIONS.READ_PROPOSAL,
    PERMISSION_ACTIONS.READ_DOCUMENT,
    PERMISSION_ACTIONS.READ_TASK,
    PERMISSION_ACTIONS.READ_EMPLOYER,
    PERMISSION_ACTIONS.CREATE_CASE,
    PERMISSION_ACTIONS.CREATE_CENSUS,
    PERMISSION_ACTIONS.CREATE_QUOTE,
    PERMISSION_ACTIONS.CREATE_PROPOSAL,
    PERMISSION_ACTIONS.CREATE_DOCUMENT,
    PERMISSION_ACTIONS.CREATE_TASK,
    PERMISSION_ACTIONS.UPDATE_CASE,
    PERMISSION_ACTIONS.UPDATE_CENSUS,
    PERMISSION_ACTIONS.UPDATE_QUOTE,
    PERMISSION_ACTIONS.UPDATE_PROPOSAL,
    PERMISSION_ACTIONS.UPDATE_DOCUMENT,
    PERMISSION_ACTIONS.UPDATE_TASK
  ],

  broker_read_only: [
    PERMISSION_ACTIONS.READ_CASE,
    PERMISSION_ACTIONS.READ_CENSUS,
    PERMISSION_ACTIONS.READ_QUOTE,
    PERMISSION_ACTIONS.READ_PROPOSAL,
    PERMISSION_ACTIONS.READ_DOCUMENT,
    PERMISSION_ACTIONS.READ_TASK,
    PERMISSION_ACTIONS.READ_EMPLOYER
  ]
};

class PermissionResolver {
  /**
   * Resolve user permissions for an action on a record
   * Evaluates: role permission + relationship scope (if MGA)
   * 
   * @param {object} user — { email, role, broker_agency_id?, mga_id? }
   * @param {string} action — PERMISSION_ACTIONS.* constant
   * @param {object} record — { id, broker_agency_id, relationship_id }
   * @returns {object} { allowed: boolean, reason: string, reason_detail?: string }
   */
  async resolvePermission(user, action, record) {
    // Step 1: Platform super admin — unconditional full access, bypass all checks
    if (user?.role === 'platform_super_admin') {
      return { allowed: true, reason: 'ALLOW_PLATFORM_SUPER_ADMIN_UNRESTRICTED' };
    }

    // Step 2: Validate user has role-based permission for action
    const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
    if (!rolePermissions.includes(action)) {
      return {
        allowed: false,
        reason: 'DENY_ROLE_LACKS_PERMISSION',
        reason_detail: `Role '${user.role}' cannot perform '${action}'`
      };
    }

    // Step 3: Platform admin override — allow all
    if (['platform_admin', 'platform_super_admin', 'admin'].includes(user.role)) {
      return {
        allowed: true,
        reason: 'ALLOW_PLATFORM_ADMIN_OVERRIDE'
      };
    }

    // Step 3: MGA user — check relationship scope
    if (['mga_user', 'mga_admin', 'mga_read_only'].includes(user.role)) {
      const scopeDecision = await relationshipScopeResolver.canMGAAccessRecord(
        user.email,
        user.mga_id,
        record,
        action
      );

      if (!scopeDecision.allowed) {
        return {
          allowed: false,
          reason: `DENY_RELATIONSHIP_SCOPE_${scopeDecision.reason}`,
          reason_detail: scopeDecision.detail,
          scope_failure: true
        };
      }

      return {
        allowed: true,
        reason: 'ALLOW_MGA_ROLE_AND_RELATIONSHIP_SCOPE',
        relationship_id: record.relationship_id
      };
    }

    // Step 4: Broker user — check direct ownership
    if (['broker_user', 'broker_admin', 'broker_read_only'].includes(user.role)) {
      const scopeDecision = await relationshipScopeResolver.canBrokerAccessRecord(
        user.email,
        user.broker_agency_id,
        record
      );

      if (!scopeDecision.allowed) {
        return {
          allowed: false,
          reason: `DENY_BROKER_SCOPE_${scopeDecision.reason}`,
          reason_detail: scopeDecision.detail,
          scope_failure: true
        };
      }

      return {
        allowed: true,
        reason: 'ALLOW_BROKER_ROLE_AND_DIRECT_OWNERSHIP'
      };
    }

    // Step 5: Admin role — allow all
    if (user.role === 'admin') {
      return { allowed: true, reason: 'ALLOW_ADMIN_ROLE' };
    }

    // Step 6: Other roles not supported
    return {
      allowed: false,
      reason: 'DENY_INVALID_ROLE',
      reason_detail: `Role '${user.role}' not recognized`
    };
  }

  /**
   * Batch resolve permissions for multiple records
   * @param {object} user
   * @param {string} action
   * @param {array} records
   * @returns {object} { allowed: [], denied: [], details: [] }
   */
  async resolveBatchPermissions(user, action, records) {
    const allowed = [];
    const denied = [];
    const details = [];

    for (const record of records) {
      const decision = await this.resolvePermission(user, action, record);

      if (decision.allowed) {
        allowed.push(record.id);
      } else {
        denied.push(record.id);
        details.push({
          record_id: record.id,
          reason: decision.reason,
          reason_detail: decision.reason_detail
        });
      }
    }

    return { allowed, denied, details };
  }

  /**
   * Check if user can perform admin override (platform admin only)
   * All overrides are audited
   * @param {object} user
   * @param {string} action
   * @returns {boolean}
   */
  canPerformAdminOverride(user) {
    return ['platform_admin', 'platform_super_admin'].includes(user.role);
  }

  /**
   * Get user's allowed actions based on role
   * @param {string} role
   * @returns {array}
   */
  getActionsByRole(role) {
    return ROLE_PERMISSIONS[role] || [];
  }

  /**
   * Check if relationship scope is required for this action
   * @param {string} role
   * @returns {boolean}
   */
  requiresRelationshipScope(role) {
    return ['mga_user', 'mga_admin', 'mga_read_only'].includes(role);
  }

  /**
   * Check if direct ownership is required for this action
   * @param {string} role
   * @returns {boolean}
   */
  requiresDirectOwnership(role) {
    return ['broker_user', 'broker_admin', 'broker_read_only'].includes(role);
  }
}

export default new PermissionResolver();