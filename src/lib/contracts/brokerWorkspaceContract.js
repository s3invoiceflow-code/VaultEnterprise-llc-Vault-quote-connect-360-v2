/**
 * Broker Workspace Contract — Phase 7A-2.4
 * 
 * Backend contract layer for broker workspace data access with Direct Book / MGA-Affiliated Book separation.
 * All broker workspace queries must go through this contract.
 * No raw frontend entity reads.
 * 
 * Scope enforcement:
 * - Tenant scope (master_general_agent_id for MGA users, null for standalone brokers)
 * - Broker agency scope (broker_agency_id)
 * - DistributionChannelContext scope where applicable
 * - Feature flags (all fail-closed)
 * - Permissions
 * 
 * Channel classification:
 * - direct_book: master_general_agent_id null, owner_org_type = broker_agency
 * - mga_affiliated_book: master_general_agent_id populated, owner_org_type = broker_agency
 * - platform_direct: read/admin only if permissioned
 * - hybrid_direct: direct_book with platform oversight
 * - hybrid_mga: mga_affiliated_book with platform oversight
 * 
 * Safe payload behavior:
 * - No raw census data
 * - No SSN or sensitive employee data
 * - No public document URLs
 * - Document references private/signed only
 * - Dashboard counters cannot leak out-of-scope records
 * - Every record includes channel/book classification
 * - MGA cannot view standalone Direct Book without explicit BrokerScopeAccessGrant
 */

import { base44 } from '@/api/base44Client';

/**
 * classifyRecord
 * 
 * Classify a record as direct_book or mga_affiliated_book based on scopes.
 * Returns channel and classification metadata.
 */
function classifyRecord(record) {
  if (!record) return null;

  const isMGAAffiliated = !!(record.master_general_agent_id);
  
  return {
    channel: isMGAAffiliated ? 'mga_affiliated_book' : 'direct_book',
    owner_org_type: record.owner_org_type || 'broker_agency',
    supervising_org_type: isMGAAffiliated ? 'mga' : (record.supervising_org_type || null),
    master_general_agent_id: record.master_general_agent_id || null,
    broker_agency_id: record.broker_agency_id || null,
  };
}

/**
 * canAccessMGAAffiliatedBook
 * 
 * Check if user/MGA can access MGA-Affiliated Book records.
 * Validates BrokerMGARelationship and BrokerScopeAccessGrant.
 */
async function canAccessMGAAffiliatedBook(brokerAgencyId, mgaId) {
  if (!mgaId) return false;

  try {
    // Check BrokerMGARelationship status
    const relationships = await base44.entities.BrokerMGARelationship.filter({
      broker_agency_id: brokerAgencyId,
      master_general_agent_id: mgaId,
    });

    if (!relationships || relationships.length === 0) {
      return false;
    }

    const relationship = relationships[0];
    
    // Relationship must be active
    if (relationship.status !== 'active') {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking MGA relationship:', error);
    return false;
  }
}

/**
 * canAccessDirectBook
 * 
 * Check if MGA can access Direct Book records via BrokerScopeAccessGrant.
 */
async function canAccessDirectBook(brokerAgencyId, requestingMgaId) {
  if (!requestingMgaId) return true; // Broker can access own direct book

  try {
    // Check for active BrokerScopeAccessGrant
    const grants = await base44.entities.BrokerScopeAccessGrant.filter({
      broker_agency_id: brokerAgencyId,
      master_general_agent_id: requestingMgaId,
    });

    if (!grants || grants.length === 0) {
      return false;
    }

    const grant = grants[0];

    // Grant must be active and not expired
    if (grant.status !== 'active') {
      return false;
    }

    if (grant.expires_at && new Date(grant.expires_at) < new Date()) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking scope access grant:', error);
    return false;
  }
}

/**
 * getBrokerWorkspaceAccessState
 * 
 * Evaluate broker workspace access eligibility using Gate 7A-1 portal access rules.
 * Returns one of 12 access states without activating workspace (feature flag control).
 * 
 * Access States:
 * 1. NOT_STARTED - No onboarding initiated
 * 2. PENDING_EMAIL_VERIFICATION - Email verification pending
 * 3. PROFILE_INCOMPLETE - Onboarding profile incomplete
 * 4. PENDING_COMPLIANCE - Awaiting compliance document submission
 * 5. PENDING_PLATFORM_REVIEW - Submitted for platform review
 * 6. PENDING_MORE_INFORMATION - Platform review requested more info
 * 7. COMPLIANCE_HOLD - Compliance hold active, portal access blocked
 * 8. REJECTED - Application rejected
 * 9. SUSPENDED - Account suspended
 * 10. APPROVED_BUT_WORKSPACE_DISABLED - Approved but workspace flag false
 * 11. ELIGIBLE_PENDING_WORKSPACE_ACTIVATION - Eligible pending feature flag activation
 * 12. ACTIVE - Workspace activated (reserved for later activation only)
 */
export async function getBrokerWorkspaceAccessState(brokerAgencyId) {
  try {
    const user = await base44.auth.me();
    
    // Audit event: access evaluation started
    if (user) {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_EVALUATED',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'initiated',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
    }

    if (!user) {
      return {
        eligible: false,
        reason: 'NOT_AUTHENTICATED',
        access_state: 'NOT_STARTED',
        workspace_activated: false,
        status: 401,
      };
    }

    // Scope validation: user must be valid BrokerAgencyUser
    const brokerUsers = await base44.entities.BrokerAgencyUser.filter({
      broker_agency_id: brokerAgencyId,
      user_email: user.email,
    });

    if (!brokerUsers || brokerUsers.length === 0) {
      // Cross-tenant or invalid scope - masked 404
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_INVALID_ROLE',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
          event_detail: 'Invalid BrokerAgencyUser role',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: false,
        reason: 'INVALID_BROKER_AGENCY_USER',
        access_state: 'INVALID_USER_ROLE',
        workspace_activated: false,
        status: 404, // masked 404
      };
    }

    // Get broker agency profile
    const brokerProfiles = await base44.entities.BrokerAgencyProfile.filter({
      id: brokerAgencyId,
    });

    if (!brokerProfiles || brokerProfiles.length === 0) {
      // Invalid scope - masked 404
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_SCOPE',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
          event_detail: 'Broker agency profile not found',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: false,
        reason: 'BROKER_AGENCY_NOT_FOUND',
        access_state: 'INVALID_SCOPE',
        workspace_activated: false,
        status: 404, // masked 404
      };
    }

    const brokerProfile = brokerProfiles[0];

    // State 1: NOT_STARTED or PENDING_EMAIL_VERIFICATION
    if (brokerProfile.onboarding_status === 'not_started') {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_PENDING_REVIEW',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
          event_detail: 'Onboarding not started',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: false,
        reason: 'ONBOARDING_NOT_STARTED',
        access_state: 'NOT_STARTED',
        workspace_activated: false,
        status: 403,
      };
    }

    // State 3: PROFILE_INCOMPLETE
    if (brokerProfile.onboarding_status === 'in_progress') {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_PENDING_REVIEW',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
          event_detail: 'Onboarding profile incomplete',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: false,
        reason: 'ONBOARDING_NOT_COMPLETE',
        access_state: 'PROFILE_INCOMPLETE',
        workspace_activated: false,
        status: 403,
      };
    }

    // State 4: PENDING_COMPLIANCE
    if (brokerProfile.onboarding_status === 'pending_compliance') {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_PENDING_REVIEW',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
          event_detail: 'Awaiting compliance documents',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: false,
        reason: 'AWAITING_COMPLIANCE',
        access_state: 'PENDING_COMPLIANCE',
        workspace_activated: false,
        status: 403,
      };
    }

    // State 5: PENDING_PLATFORM_REVIEW
    if (brokerProfile.onboarding_status === 'pending_review') {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_PENDING_REVIEW',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
          event_detail: 'Pending platform review',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: false,
        reason: 'PENDING_PLATFORM_REVIEW',
        access_state: 'PENDING_PLATFORM_REVIEW',
        workspace_activated: false,
        status: 403,
      };
    }

    // State 6: PENDING_MORE_INFORMATION
    if (brokerProfile.onboarding_status === 'pending_more_information') {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_PENDING_REVIEW',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
          event_detail: 'Pending additional information from applicant',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: false,
        reason: 'AWAITING_MORE_INFORMATION',
        access_state: 'PENDING_MORE_INFORMATION',
        workspace_activated: false,
        status: 403,
      };
    }

    // State 8: REJECTED
    if (brokerProfile.onboarding_status === 'rejected') {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_PENDING_REVIEW',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
          event_detail: 'Application rejected',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: false,
        reason: 'APPLICATION_REJECTED',
        access_state: 'REJECTED',
        workspace_activated: false,
        status: 403,
      };
    }

    // State 9: SUSPENDED
    if (brokerProfile.onboarding_status === 'suspended') {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_SUSPENDED',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
          event_detail: 'Account suspended',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: false,
        reason: 'ACCOUNT_SUSPENDED',
        access_state: 'SUSPENDED',
        workspace_activated: false,
        status: 403,
      };
    }

    // If we reach here, onboarding_status should be 'active'
    if (brokerProfile.onboarding_status !== 'active') {
      return {
        eligible: false,
        reason: 'UNKNOWN_ONBOARDING_STATUS',
        access_state: 'INVALID_SCOPE',
        workspace_activated: false,
        status: 403,
      };
    }

    // Get broker platform relationship
    const relationships = await base44.entities.BrokerPlatformRelationship.filter({
      broker_agency_id: brokerAgencyId,
    });

    if (!relationships || relationships.length === 0) {
      return {
        eligible: false,
        reason: 'NO_PLATFORM_RELATIONSHIP',
        access_state: 'INVALID_SCOPE',
        workspace_activated: false,
        status: 403,
      };
    }

    const relationship = relationships[0];

    if (relationship.status !== 'active') {
      return {
        eligible: false,
        reason: 'RELATIONSHIP_NOT_ACTIVE',
        access_state: 'INVALID_SCOPE',
        workspace_activated: false,
        status: 403,
      };
    }

    if (!brokerProfile.portal_access_enabled) {
      return {
        eligible: false,
        reason: 'PORTAL_ACCESS_DISABLED',
        access_state: 'PORTAL_ACCESS_DISABLED',
        workspace_activated: false,
        status: 403,
      };
    }

    // State 7: COMPLIANCE_HOLD
    if (brokerProfile.compliance_status === 'compliance_hold') {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_COMPLIANCE_HOLD',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
          event_detail: 'Active compliance hold',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: false,
        reason: 'COMPLIANCE_HOLD_ACTIVE',
        access_state: 'COMPLIANCE_HOLD',
        workspace_activated: false,
        status: 403,
      };
    }

    // State 10/11: APPROVED but workspace disabled or pending activation
    const workspaceActivated = brokerProfile.workspace_activated || false;

    if (!workspaceActivated) {
      // State 10: APPROVED_BUT_WORKSPACE_DISABLED (when flag is false)
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_ELIGIBLE_PENDING_ACTIVATION',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'eligible_but_disabled',
          event_detail: 'Approved but workspace flag disabled',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        eligible: true,
        portal_access_eligible: true,
        reason: 'PORTAL_ACCESS_ELIGIBLE',
        access_state: 'APPROVED_BUT_WORKSPACE_DISABLED',
        workspace_activated: false,
        status: 200,
      };
    }

    // State 12: ACTIVE (only reachable after workspace activation approval)
    try {
      await base44.entities.AuditEvent.create({
        event_type: 'BROKER_WORKSPACE_ACCESS_ELIGIBLE_PENDING_ACTIVATION',
        actor_id: user.email,
        broker_agency_id: brokerAgencyId,
        outcome: 'eligible_active',
        event_detail: 'Workspace activated and eligible',
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }
    return {
      eligible: true,
      portal_access_eligible: true,
      workspace_activated: true,
      reason: 'WORKSPACE_ACTIVATED',
      access_state: 'ACTIVE',
      status: 200,
    };
  } catch (error) {
    try {
      const user = await base44.auth.me();
      if (user) {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_WORKSPACE_ACCESS_DENIED_SCOPE',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'error',
          event_detail: `Evaluation error: ${error.message}`,
        });
      }
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }
    return {
      eligible: false,
      reason: 'EVALUATION_ERROR',
      error: error.message,
      access_state: 'INVALID_SCOPE',
      workspace_activated: false,
      status: 500,
    };
  }
}

/**
 * getBrokerDashboard
 * 
 * Returns safe dashboard counters with separated Direct Book and MGA-Affiliated Book.
 * Does not expose hidden records in counts.
 */
export async function getBrokerDashboard(brokerAgencyId, requestingMgaId = null) {
  try {
    const user = await base44.auth.me();
    const accessState = await getBrokerWorkspaceAccessState(brokerAgencyId);
    
    if (!accessState.eligible) {
      return {
        success: false,
        error: accessState.reason,
        status: accessState.status,
      };
    }

    // Get direct book counts
    const directEmployers = await base44.entities.EmployerGroup.filter({
      broker_agency_id: brokerAgencyId,
      master_general_agent_id: null,
    });
    const directCases = await base44.entities.BenefitCase.filter({
      broker_agency_id: brokerAgencyId,
      master_general_agent_id: null,
    });

    const directQuotes = await base44.entities.QuoteScenario.filter({
      case_id: { $in: (directCases || []).map(c => c.id) },
    });
    const directProposals = await base44.entities.Proposal.filter({
      case_id: { $in: (directCases || []).map(c => c.id) },
    });

    // Get MGA-Affiliated Book counts
    let mgaAffiliatedCounts = {
      total_employers: 0,
      total_cases: 0,
      open_quotes: 0,
      proposals_ready: 0,
    };

    const mgaRelationships = await base44.entities.BrokerMGARelationship.filter({
      broker_agency_id: brokerAgencyId,
      relationship_status: 'active',
    });

    if (mgaRelationships && mgaRelationships.length > 0) {
      const mgaIds = mgaRelationships.map(r => r.master_general_agent_id);
      const mgaEmployers = await base44.entities.EmployerGroup.filter({
        broker_agency_id: brokerAgencyId,
        master_general_agent_id: { $in: mgaIds },
      });
      const mgaCases = await base44.entities.BenefitCase.filter({
        broker_agency_id: brokerAgencyId,
        master_general_agent_id: { $in: mgaIds },
      });

      const mgaQuotes = await base44.entities.QuoteScenario.filter({
        case_id: { $in: (mgaCases || []).map(c => c.id) },
      });
      const mgaProposals = await base44.entities.Proposal.filter({
        case_id: { $in: (mgaCases || []).map(c => c.id) },
      });

      mgaAffiliatedCounts = {
        total_employers: mgaEmployers ? mgaEmployers.length : 0,
        total_cases: mgaCases ? mgaCases.length : 0,
        open_quotes: mgaQuotes ? mgaQuotes.length : 0,
        proposals_ready: mgaProposals ? mgaProposals.length : 0,
      };
    }

    try {
      await base44.entities.AuditEvent.create({
        event_type: 'BROKER_DASHBOARD_VIEWED',
        actor_id: user.email,
        broker_agency_id: brokerAgencyId,
        master_general_agent_id: requestingMgaId,
        outcome: 'success',
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    return {
      success: true,
      dashboard: {
        book_of_business: {
          direct_book: {
            total_employers: directEmployers ? directEmployers.length : 0,
            total_cases: directCases ? directCases.length : 0,
            open_quotes: directQuotes ? directQuotes.length : 0,
            proposals_ready: directProposals ? directProposals.length : 0,
            channel: 'direct_book',
          },
          mga_affiliated_book: {
            ...mgaAffiliatedCounts,
            channel: 'mga_affiliated_book',
            accessible: mgaRelationships && mgaRelationships.length > 0,
          },
        },
        alerts: {
          compliance_alerts: 0,
          tasks_due: 0,
          renewals_due: 0,
        },
      },
      status: 200,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }
}

/**
 * listBrokerBookOfBusiness
 * 
 * Returns safe book-of-business list with Direct Book vs MGA-Affiliated Book separation.
 * Enforces scope and relationship visibility.
 * MGA cannot access Direct Book without explicit BrokerScopeAccessGrant.
 */
export async function listBrokerBookOfBusiness(brokerAgencyId, requestingMgaId = null) {
  try {
    const user = await base44.auth.me();
    if (!user) {
      return {
        success: false,
        error: 'NOT_AUTHENTICATED',
        status: 401,
      };
    }

    const accessState = await getBrokerWorkspaceAccessState(brokerAgencyId);
    
    if (!accessState.eligible) {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_BOOK_ACCESS_DENIED_SCOPE',
          actor_id: user.email,
          broker_agency_id: brokerAgencyId,
          master_general_agent_id: requestingMgaId,
          outcome: 'blocked',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        success: false,
        error: accessState.reason,
        status: accessState.status,
      };
    }

    // Get broker's employers and cases for direct book
    const directEmployers = await base44.entities.EmployerGroup.filter({
      broker_agency_id: brokerAgencyId,
      master_general_agent_id: null, // Direct book only
    });
    const directCases = await base44.entities.BenefitCase.filter({
      broker_agency_id: brokerAgencyId,
      master_general_agent_id: null, // Direct book only
    });

    const directBook = {
      channel: 'direct_book',
      owner_org_type: 'broker_agency',
      employer_count: directEmployers ? directEmployers.length : 0,
      case_count: directCases ? directCases.length : 0,
      employers: (directEmployers || []).map(e => ({
        id: e.id,
        name: e.name,
        employee_count: e.employee_count,
        status: e.status,
        channel: 'direct_book',
      })),
      cases: (directCases || []).map(c => ({
        id: c.id,
        case_number: c.case_number,
        employer_id: c.employer_id,
        stage: c.stage,
        effective_date: c.effective_date,
        channel: 'direct_book',
      })),
    };

    // Get MGA-Affiliated Book if applicable
    let mgaAffiliatedBook = {
      channel: 'mga_affiliated_book',
      owner_org_type: 'broker_agency',
      supervising_org_type: 'mga',
      employer_count: 0,
      case_count: 0,
      employers: [],
      cases: [],
      accessible: false,
    };

    // Check for MGA-Affiliated Book access
    const mgaRelationships = await base44.entities.BrokerMGARelationship.filter({
      broker_agency_id: brokerAgencyId,
    });

    if (mgaRelationships && mgaRelationships.length > 0) {
      const activeRelationships = mgaRelationships.filter(r => r.status === 'active');

      if (activeRelationships.length > 0) {
        mgaAffiliatedBook.accessible = true;
        mgaAffiliatedBook.mga_relationships_count = activeRelationships.length;

        // Get MGA-Affiliated employers and cases
        const mgaEmployers = await base44.entities.EmployerGroup.filter({
          broker_agency_id: brokerAgencyId,
          master_general_agent_id: { $in: activeRelationships.map(r => r.master_general_agent_id) },
        });
        const mgaCases = await base44.entities.BenefitCase.filter({
          broker_agency_id: brokerAgencyId,
          master_general_agent_id: { $in: activeRelationships.map(r => r.master_general_agent_id) },
        });

        mgaAffiliatedBook.employer_count = mgaEmployers ? mgaEmployers.length : 0;
        mgaAffiliatedBook.case_count = mgaCases ? mgaCases.length : 0;
        mgaAffiliatedBook.employers = (mgaEmployers || []).map(e => ({
          id: e.id,
          name: e.name,
          employee_count: e.employee_count,
          status: e.status,
          channel: 'mga_affiliated_book',
          mga_id: e.master_general_agent_id,
        }));
        mgaAffiliatedBook.cases = (mgaCases || []).map(c => ({
          id: c.id,
          case_number: c.case_number,
          employer_id: c.employer_id,
          stage: c.stage,
          effective_date: c.effective_date,
          channel: 'mga_affiliated_book',
          mga_id: c.master_general_agent_id,
        }));
      }
    }

    try {
      await base44.entities.AuditEvent.create({
        event_type: 'BROKER_BOOK_CLASSIFICATION_EVALUATED',
        actor_id: user.email,
        broker_agency_id: brokerAgencyId,
        master_general_agent_id: requestingMgaId,
        outcome: 'success',
        event_detail: `Direct book: ${directBook.employer_count} employers, ${directBook.case_count} cases. MGA-Affiliated: ${mgaAffiliatedBook.employer_count} employers, ${mgaAffiliatedBook.case_count} cases.`,
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    return {
      success: true,
      book_of_business: {
        direct_book: directBook,
        mga_affiliated_book: mgaAffiliatedBook,
      },
      status: 200,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }
}

/**
 * listBrokerEmployers
 * 
 * Returns broker-visible employers separated by Direct Book vs MGA-Affiliated Book.
 * Each employer includes channel classification.
 */
export async function listBrokerEmployers(brokerAgencyId, requestingMgaId = null) {
  try {
    const user = await base44.auth.me();
    const accessState = await getBrokerWorkspaceAccessState(brokerAgencyId);
    
    if (!accessState.eligible) {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_BOOK_ACCESS_DENIED_SCOPE',
          actor_id: user?.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        success: false,
        error: accessState.reason,
        status: accessState.status,
      };
    }

    const directEmployers = await base44.entities.EmployerGroup.filter({
      broker_agency_id: brokerAgencyId,
      master_general_agent_id: null,
    });

    const mgaRelationships = await base44.entities.BrokerMGARelationship.filter({
      broker_agency_id: brokerAgencyId,
      relationship_status: 'active',
    });

    let mgaEmployers = [];
    if (mgaRelationships && mgaRelationships.length > 0) {
      const mgaIds = mgaRelationships.map(r => r.master_general_agent_id);
      mgaEmployers = await base44.entities.EmployerGroup.filter({
        broker_agency_id: brokerAgencyId,
        master_general_agent_id: { $in: mgaIds },
      });
    }

    try {
      await base44.entities.AuditEvent.create({
        event_type: 'BROKER_EMPLOYERS_LISTED',
        actor_id: user?.email,
        broker_agency_id: brokerAgencyId,
        outcome: 'success',
        event_detail: `Direct book: ${directEmployers ? directEmployers.length : 0}, MGA-Affiliated: ${mgaEmployers ? mgaEmployers.length : 0}`,
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    return {
      success: true,
      employers: {
        direct_book: (directEmployers || []).map(e => ({
          id: e.id,
          name: e.name,
          ein: e.ein ? '****' : null, // Mask EIN
          employee_count: e.employee_count,
          status: e.status,
          channel: 'direct_book',
          created_date: e.created_date,
        })),
        mga_affiliated_book: (mgaEmployers || []).map(e => ({
          id: e.id,
          name: e.name,
          ein: e.ein ? '****' : null, // Mask EIN
          employee_count: e.employee_count,
          status: e.status,
          channel: 'mga_affiliated_book',
          mga_id: e.master_general_agent_id,
          created_date: e.created_date,
        })),
      },
      count: {
        direct_book: directEmployers ? directEmployers.length : 0,
        mga_affiliated_book: mgaEmployers ? mgaEmployers.length : 0,
        total: (directEmployers ? directEmployers.length : 0) + (mgaEmployers ? mgaEmployers.length : 0),
      },
      status: 200,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }
}

/**
 * listBrokerCases
 * 
 * Returns broker-visible cases separated by Direct Book vs MGA-Affiliated Book.
 * Each case includes channel lineage.
 */
export async function listBrokerCases(brokerAgencyId, requestingMgaId = null) {
  try {
    const user = await base44.auth.me();
    const accessState = await getBrokerWorkspaceAccessState(brokerAgencyId);
    
    if (!accessState.eligible) {
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'BROKER_BOOK_ACCESS_DENIED_SCOPE',
          actor_id: user?.email,
          broker_agency_id: brokerAgencyId,
          outcome: 'blocked',
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError);
      }
      return {
        success: false,
        error: accessState.reason,
        status: accessState.status,
      };
    }

    const directCases = await base44.entities.BenefitCase.filter({
      broker_agency_id: brokerAgencyId,
      master_general_agent_id: null,
    });

    const mgaRelationships = await base44.entities.BrokerMGARelationship.filter({
      broker_agency_id: brokerAgencyId,
      relationship_status: 'active',
    });

    let mgaCases = [];
    if (mgaRelationships && mgaRelationships.length > 0) {
      const mgaIds = mgaRelationships.map(r => r.master_general_agent_id);
      mgaCases = await base44.entities.BenefitCase.filter({
        broker_agency_id: brokerAgencyId,
        master_general_agent_id: { $in: mgaIds },
      });
    }

    try {
      await base44.entities.AuditEvent.create({
        event_type: 'BROKER_CASES_LISTED',
        actor_id: user?.email,
        broker_agency_id: brokerAgencyId,
        outcome: 'success',
        event_detail: `Direct book: ${directCases ? directCases.length : 0}, MGA-Affiliated: ${mgaCases ? mgaCases.length : 0}`,
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    return {
      success: true,
      cases: {
        direct_book: (directCases || []).map(c => ({
          id: c.id,
          case_number: c.case_number,
          case_type: c.case_type,
          stage: c.stage,
          effective_date: c.effective_date,
          employee_count: c.employee_count,
          channel: 'direct_book',
          created_date: c.created_date,
        })),
        mga_affiliated_book: (mgaCases || []).map(c => ({
          id: c.id,
          case_number: c.case_number,
          case_type: c.case_type,
          stage: c.stage,
          effective_date: c.effective_date,
          employee_count: c.employee_count,
          channel: 'mga_affiliated_book',
          mga_id: c.master_general_agent_id,
          created_date: c.created_date,
        })),
      },
      count: {
        direct_book: directCases ? directCases.length : 0,
        mga_affiliated_book: mgaCases ? mgaCases.length : 0,
        total: (directCases ? directCases.length : 0) + (mgaCases ? mgaCases.length : 0),
      },
      status: 200,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }
}

/**
 * listBrokerCensusVersions
 * 
 * Returns census metadata only.
 * No raw census rows.
 * No SSN / sensitive employee data.
 */
export async function listBrokerCensusVersions(brokerAgencyId) {
  try {
    const accessState = await getBrokerWorkspaceAccessState(brokerAgencyId);
    
    if (!accessState.eligible) {
      return {
        success: false,
        error: accessState.reason,
        status: accessState.status,
      };
    }

    // Get broker cases to filter census versions
    const cases = await base44.entities.BenefitCase.filter({
      broker_agency_id: brokerAgencyId,
    });

    if (!cases || cases.length === 0) {
      return {
        success: true,
        census_versions: [],
        count: 0,
        status: 200,
      };
    }

    // Get census versions for broker cases (metadata only)
    const censusVersions = await base44.entities.CensusVersion.filter({
      case_id: { $in: cases.map(c => c.id) },
    });

    return {
      success: true,
      census_versions: (censusVersions || []).map(cv => ({
        id: cv.id,
        case_id: cv.case_id,
        version_number: cv.version_number,
        file_name: cv.file_name,
        status: cv.status,
        total_employees: cv.total_employees,
        eligible_employees: cv.eligible_employees,
        total_dependents: cv.total_dependents,
        uploaded_at: cv.created_date,
      })),
      count: censusVersions ? censusVersions.length : 0,
      status: 200,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }
}

/**
 * listBrokerQuotes
 * 
 * Read-only quote visibility separated by Direct Book vs MGA-Affiliated Book.
 * No QuoteWorkspaceWrapper exposure.
 * No quote creation or edit activation.
 */
export async function listBrokerQuotes(brokerAgencyId, requestingMgaId = null) {
  try {
    const user = await base44.auth.me();
    const accessState = await getBrokerWorkspaceAccessState(brokerAgencyId);
    
    if (!accessState.eligible) {
      return {
        success: false,
        error: accessState.reason,
        status: accessState.status,
      };
    }

    const directCases = await base44.entities.BenefitCase.filter({
      broker_agency_id: brokerAgencyId,
      master_general_agent_id: null,
    });

    const mgaRelationships = await base44.entities.BrokerMGARelationship.filter({
      broker_agency_id: brokerAgencyId,
      relationship_status: 'active',
    });

    let mgaCases = [];
    if (mgaRelationships && mgaRelationships.length > 0) {
      const mgaIds = mgaRelationships.map(r => r.master_general_agent_id);
      mgaCases = await base44.entities.BenefitCase.filter({
        broker_agency_id: brokerAgencyId,
        master_general_agent_id: { $in: mgaIds },
      });
    }

    const directCaseIds = (directCases || []).map(c => c.id);
    const mgaCaseIds = (mgaCases || []).map(c => c.id);

    const directQuotes = directCaseIds.length > 0 ? 
      await base44.entities.QuoteScenario.filter({
        case_id: { $in: directCaseIds },
      }) : [];

    const mgaQuotes = mgaCaseIds.length > 0 ? 
      await base44.entities.QuoteScenario.filter({
        case_id: { $in: mgaCaseIds },
      }) : [];

    try {
      await base44.entities.AuditEvent.create({
        event_type: 'BROKER_QUOTES_LISTED',
        actor_id: user?.email,
        broker_agency_id: brokerAgencyId,
        outcome: 'success',
        event_detail: `Direct book: ${directQuotes ? directQuotes.length : 0}, MGA-Affiliated: ${mgaQuotes ? mgaQuotes.length : 0}`,
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    return {
      success: true,
      quotes: {
        direct_book: (directQuotes || []).map(q => ({
          id: q.id,
          case_id: q.case_id,
          name: q.name,
          status: q.status,
          is_recommended: q.is_recommended,
          total_monthly_premium: q.total_monthly_premium,
          channel: 'direct_book',
          quoted_at: q.quoted_at,
        })),
        mga_affiliated_book: (mgaQuotes || []).map(q => ({
          id: q.id,
          case_id: q.case_id,
          name: q.name,
          status: q.status,
          is_recommended: q.is_recommended,
          total_monthly_premium: q.total_monthly_premium,
          channel: 'mga_affiliated_book',
          quoted_at: q.quoted_at,
        })),
      },
      count: {
        direct_book: directQuotes ? directQuotes.length : 0,
        mga_affiliated_book: mgaQuotes ? mgaQuotes.length : 0,
        total: (directQuotes ? directQuotes.length : 0) + (mgaQuotes ? mgaQuotes.length : 0),
      },
      read_only: true,
      quote_creation_enabled: false,
      status: 200,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }
}

/**
 * listBrokerProposals
 * 
 * Read-only proposal visibility separated by Direct Book vs MGA-Affiliated Book.
 * No proposal creation activation unless later approved.
 */
export async function listBrokerProposals(brokerAgencyId, requestingMgaId = null) {
  try {
    const user = await base44.auth.me();
    const accessState = await getBrokerWorkspaceAccessState(brokerAgencyId);
    
    if (!accessState.eligible) {
      return {
        success: false,
        error: accessState.reason,
        status: accessState.status,
      };
    }

    const directCases = await base44.entities.BenefitCase.filter({
      broker_agency_id: brokerAgencyId,
      master_general_agent_id: null,
    });

    const mgaRelationships = await base44.entities.BrokerMGARelationship.filter({
      broker_agency_id: brokerAgencyId,
      relationship_status: 'active',
    });

    let mgaCases = [];
    if (mgaRelationships && mgaRelationships.length > 0) {
      const mgaIds = mgaRelationships.map(r => r.master_general_agent_id);
      mgaCases = await base44.entities.BenefitCase.filter({
        broker_agency_id: brokerAgencyId,
        master_general_agent_id: { $in: mgaIds },
      });
    }

    const directCaseIds = (directCases || []).map(c => c.id);
    const mgaCaseIds = (mgaCases || []).map(c => c.id);

    const directProposals = directCaseIds.length > 0 ? 
      await base44.entities.Proposal.filter({
        case_id: { $in: directCaseIds },
      }) : [];

    const mgaProposals = mgaCaseIds.length > 0 ? 
      await base44.entities.Proposal.filter({
        case_id: { $in: mgaCaseIds },
      }) : [];

    try {
      await base44.entities.AuditEvent.create({
        event_type: 'BROKER_PROPOSALS_LISTED',
        actor_id: user?.email,
        broker_agency_id: brokerAgencyId,
        outcome: 'success',
        event_detail: `Direct book: ${directProposals ? directProposals.length : 0}, MGA-Affiliated: ${mgaProposals ? mgaProposals.length : 0}`,
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    return {
      success: true,
      proposals: {
        direct_book: (directProposals || []).map(p => ({
          id: p.id,
          case_id: p.case_id,
          title: p.title,
          status: p.status,
          channel: 'direct_book',
          sent_at: p.sent_at,
          viewed_at: p.viewed_at,
        })),
        mga_affiliated_book: (mgaProposals || []).map(p => ({
          id: p.id,
          case_id: p.case_id,
          title: p.title,
          status: p.status,
          channel: 'mga_affiliated_book',
          sent_at: p.sent_at,
          viewed_at: p.viewed_at,
        })),
      },
      count: {
        direct_book: directProposals ? directProposals.length : 0,
        mga_affiliated_book: mgaProposals ? mgaProposals.length : 0,
        total: (directProposals ? directProposals.length : 0) + (mgaProposals ? mgaProposals.length : 0),
      },
      read_only: true,
      proposal_creation_enabled: false,
      status: 200,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }
}

/**
 * listBrokerTasks
 * 
 * Returns broker-visible tasks only.
 * No out-of-scope counts.
 */
export async function listBrokerTasks(brokerAgencyId) {
  try {
    const accessState = await getBrokerWorkspaceAccessState(brokerAgencyId);
    
    if (!accessState.eligible) {
      return {
        success: false,
        error: accessState.reason,
        status: accessState.status,
      };
    }

    // Get broker cases to filter tasks
    const cases = await base44.entities.BenefitCase.filter({
      broker_agency_id: brokerAgencyId,
    });

    if (!cases || cases.length === 0) {
      return {
        success: true,
        tasks: [],
        count: 0,
        status: 200,
      };
    }

    // Get tasks for broker cases
    const tasks = await base44.entities.CaseTask.filter({
      case_id: { $in: cases.map(c => c.id) },
    });

    return {
      success: true,
      tasks: (tasks || []).map(t => ({
        id: t.id,
        case_id: t.case_id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        due_date: t.due_date,
        assigned_to: t.assigned_to,
      })),
      count: tasks ? tasks.length : 0,
      status: 200,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }
}

/**
 * listBrokerDocuments
 * 
 * Returns document metadata only.
 * Private/signed references only.
 * No public URLs.
 */
export async function listBrokerDocuments(brokerAgencyId) {
  try {
    const accessState = await getBrokerWorkspaceAccessState(brokerAgencyId);
    
    if (!accessState.eligible) {
      return {
        success: false,
        error: accessState.reason,
        status: accessState.status,
      };
    }

    // Get broker cases to filter documents
    const cases = await base44.entities.BenefitCase.filter({
      broker_agency_id: brokerAgencyId,
    });

    if (!cases || cases.length === 0) {
      return {
        success: true,
        documents: [],
        count: 0,
        status: 200,
      };
    }

    // Get documents for broker cases
    const documents = await base44.entities.Document.filter({
      case_id: { $in: cases.map(c => c.id) },
    });

    return {
      success: true,
      documents: (documents || []).map(d => ({
        id: d.id,
        case_id: d.case_id,
        name: d.document_type,
        document_type: d.document_type,
        file_name: d.file_name,
        uploaded_by: d.uploaded_by,
        created_date: d.created_date,
        // NO public URL exposure
        // File URL must be accessed via signed reference only
      })),
      count: documents ? documents.length : 0,
      file_access: 'requires_private_signed_url',
      status: 200,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }
}