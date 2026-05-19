/**
 * MGA Phase 2 — Permission Resolver (RBAC Matrix)
 * lib/mga/permissionResolver.js
 *
 * Implements the certified RBAC permission matrix.
 * Returns "ALLOW" or "DENY" for any role × domain × action combination.
 * Undefined combinations return "DENY" (fail closed).
 * No optional permissions. Unknown = deny.
 *
 * PHASE 2 CONSTRAINT: Inert until called by Phase 3 services via scopeGate.
 *
 * @see docs/MGA_PHASE_2_SCOPE_RESOLUTION_AND_AUTHORIZATION_REPORT.md Section 5
 */

const A = 'ALLOW';
const D = 'DENY';

/**
 * PERMISSION MATRIX
 * Structure: MATRIX[domain][action][role] = "ALLOW" | "DENY"
 * Roles: platform_super_admin, mga_admin, mga_manager, mga_user, mga_read_only, support_impersonation_read_only
 */
const MATRIX = {
  mga: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    detail:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    approve:            { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    transmit:           { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    retry:              { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    upload:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    import:             { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    download:           { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    preview:            { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_users:       { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_settings:    { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_financials:    { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  mastergroup: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    detail:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    approve:            { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    transmit:           { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    retry:              { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    upload:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    import:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    download:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    preview:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    manage_users:       { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_settings:    { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_financials:    { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    deactivate:         { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    reactivate:         { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    contacts_view:      { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    contacts_manage:    { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    settings_view:      { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    settings_manage:    { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    notes_view:         { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    notes_manage:       { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  cases: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    detail:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    approve:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    transmit:           { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    retry:              { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    upload:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    import:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    download:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    preview:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    manage_users:       { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_settings:    { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_financials:    { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  census: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    detail:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    approve:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    transmit:           { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    retry:              { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    upload:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    import:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    download:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    preview:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    manage_users:       { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_settings:    { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_financials:    { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  quotes: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    detail:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    approve:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    transmit:           { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    retry:              { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    upload:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    import:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    download:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    preview:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    manage_users:       { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_settings:    { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_financials:    { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  txquote: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    detail:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    approve:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    transmit:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    retry:              { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    upload:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    import:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    download:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    preview:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    manage_users:       { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_settings:    { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_financials:    { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  enrollment: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    detail:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    approve:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    transmit:           { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    retry:              { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    upload:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    import:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    download:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    preview:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    manage_users:       { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_settings:    { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_financials:    { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  documents: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    detail:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    approve:            { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    transmit:           { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    retry:              { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    upload:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    import:             { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    download:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    preview:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    manage_users:       { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_settings:    { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_financials:    { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  signed_links: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
    download:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    preview:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    delete:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  reports: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    detail:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: D, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    retry:              { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    download:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: D, support_impersonation_read_only: A },
    preview:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: A },
    view_financials:    { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  audit_logs: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    detail:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  users: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    list:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    approve:            { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_users:       { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    // Gate 6F: invite_sub_scope — allows assigning a master_group_id to an invited user
    // Only mga_admin and platform_super_admin may assign sub-scope at invite time
    invite_sub_scope:   { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  settings: {
    view:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    read:               { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    create:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    edit:               { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    delete:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    approve:            { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    export:             { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    manage_settings:    { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_financials:    { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    view_audit:         { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: A },
    administer_quarantine: { platform_super_admin: A, mga_admin: D, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
  },

  reports: {
    templates: {
      view:    { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
      manage:  { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    },
    schedules: {
      view:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
      manage:          { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
      pause:           { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
      cancel:          { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
      audit:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    },
    delivery: {
      view:            { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: A, mga_read_only: A, support_impersonation_read_only: D },
      retry:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
      cancel:          { platform_super_admin: A, mga_admin: A, mga_manager: D, mga_user: A, mga_read_only: D, support_impersonation_read_only: D },
      resend:          { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
      audit:           { platform_super_admin: A, mga_admin: A, mga_manager: A, mga_user: D, mga_read_only: D, support_impersonation_read_only: D },
    }
  },
};

/**
 * check — Look up permission for role × domain × action.
 * Returns "ALLOW" or "DENY". Undefined = DENY (fail closed).
 *
 * @param {string} role — actor role
 * @param {string} domain — operational domain
 * @param {string} action — operation action
 * @returns {"ALLOW"|"DENY"}
 */
export function check(role, domain, action) {
  // platform_super_admin unconditionally bypasses all RBAC checks
  if (role === 'platform_super_admin' || role === 'admin') return A;

  const domainMatrix = MATRIX[domain];
  if (!domainMatrix) return D;
  const actionMatrix = domainMatrix[action];
  if (!actionMatrix) return D;
  const result = actionMatrix[role];
  if (result === undefined) return D;
  return result;
}

/**
 * getDomains — Return all defined domain names.
 */
export function getDomains() {
  return Object.keys(MATRIX);
}

/**
 * getActions — Return all defined action names for a domain.
 */
export function getActions(domain) {
  return MATRIX[domain] ? Object.keys(MATRIX[domain]) : [];
}

export default { check, getDomains, getActions, MATRIX };