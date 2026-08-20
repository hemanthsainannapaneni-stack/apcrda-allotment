import { CAPABILITIES as C, ROLES } from '../src/lib/enums';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ROLE_SEED = [
  {
    key: ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Full access: users, settings, workflow configuration, and the audit log.',
    capabilities: Object.values(C),
  },
  {
    key: ROLES.LANDS_OFFICER,
    name: 'APCRDA Officer (Lands)',
    description: 'Land inventory, eligibility, LOI, possession, compliance, and grievance resolution.',
    capabilities: [
      C.CASES_VIEW_ALL, C.CASES_CREATE, C.CASES_ASSIGN, C.PLOTS_MANAGE, C.INVITATIONS_MANAGE,
      C.GRIEVANCE_RESOLVE, C.CANCELLATION_REQUEST, C.CANCELLATION_DECIDE, C.CONSTRUCTION_MANAGE,
      C.REPORTS_VIEW, C.COMMENTS_INTERNAL,
    ],
  },
  {
    key: ROLES.TECHNICAL_REVIEWER,
    name: 'Technical Reviewer (DPR)',
    description: 'Reviews the Detailed Project Report and the final revised DPR.',
    capabilities: [C.CASES_VIEW_ALL, C.REPORTS_VIEW, C.COMMENTS_INTERNAL],
  },
  {
    key: ROLES.ECODEV_REVIEWER,
    name: 'Economic Development Reviewer',
    description: 'Appraises investment quantum, employment, and sector fit.',
    capabilities: [C.CASES_VIEW_ALL, C.REPORTS_VIEW, C.COMMENTS_INTERNAL],
  },
  {
    key: ROLES.LASC_MEMBER,
    name: 'LASC Member',
    description: 'Land Allotment Scrutiny Committee: site and title verification, minutes, recommendation.',
    capabilities: [C.CASES_VIEW_ALL, C.REPORTS_VIEW, C.COMMENTS_INTERNAL],
  },
  {
    key: ROLES.GOM_MEMBER,
    name: 'GoM Member',
    description: 'Group of Ministers: clears or defers the proposal.',
    capabilities: [C.CASES_VIEW_ALL, C.REPORTS_VIEW, C.COMMENTS_INTERNAL],
  },
  {
    key: ROLES.CABINET_SUBCOMMITTEE,
    name: 'Cabinet Sub-Committee Member',
    description: 'Reviews concessional and nomination allotments before the Authority.',
    capabilities: [C.CASES_VIEW_ALL, C.REPORTS_VIEW, C.COMMENTS_INTERNAL],
  },
  {
    key: ROLES.AUTHORITY_APPROVER,
    name: 'Authority Approver',
    description: 'APCRDA Authority approval and the Cabinet-approval test.',
    capabilities: [C.CASES_VIEW_ALL, C.CASES_ASSIGN, C.CANCELLATION_DECIDE, C.REPORTS_VIEW, C.COMMENTS_INTERNAL],
  },
  {
    key: ROLES.CABINET_APPROVER,
    name: 'Cabinet Approver',
    description: 'Cabinet approval where the test routes a case there.',
    capabilities: [C.CASES_VIEW_ALL, C.REPORTS_VIEW, C.COMMENTS_INTERNAL],
  },
  {
    key: ROLES.FINANCE_OFFICER,
    name: 'Finance Officer',
    description: 'Payment schedules, reconciliation, penalties, refunds, and forfeiture.',
    capabilities: [
      C.CASES_VIEW_ALL, C.PAYMENTS_MANAGE, C.PAYMENTS_PAY, C.CANCELLATION_DECIDE,
      C.REPORTS_VIEW, C.COMMENTS_INTERNAL,
    ],
  },
  {
    key: ROLES.PLANNING_OFFICER,
    name: 'Planning / Building Officer',
    description: 'Government Order, agreement and registration, building permission, and construction monitoring.',
    capabilities: [
      C.CASES_VIEW_ALL, C.CASES_CREATE, C.PLOTS_MANAGE, C.CONSTRUCTION_MANAGE,
      C.REPORTS_VIEW, C.COMMENTS_INTERNAL,
    ],
  },
  {
    key: ROLES.INVESTOR,
    name: 'Investor / Applicant',
    description: 'Files applications, submits DPRs, accepts the LOI, pays, and raises grievances — own cases only.',
    capabilities: [
      C.CASES_CREATE, C.PAYMENTS_PAY, C.GRIEVANCE_RAISE, C.CANCELLATION_REQUEST, C.CONSTRUCTION_UPDATE,
    ],
  },
  {
    key: ROLES.VIEWER,
    name: 'Viewer / Auditor',
    description: 'Read-only across every case, report, and audit entry. Cannot act on any stage.',
    capabilities: [C.CASES_VIEW_ALL, C.REPORTS_VIEW, C.AUDIT_VIEW],
  },
];

// ---------------------------------------------------------------------------
// Permissions matrix — which role may ACT on which stage
// ---------------------------------------------------------------------------

export const PERMISSION_MATRIX: Record<string, { act: string[]; view: 'ALL' | string[] }> = {
  [ROLES.SUPER_ADMIN]: { act: [], view: 'ALL' }, // handled as a special case in the seed
  [ROLES.LANDS_OFFICER]: { act: ['S0', 'S1A', 'S9', 'S12A', 'S15'], view: 'ALL' },
  [ROLES.TECHNICAL_REVIEWER]: { act: ['S2', 'S11'], view: 'ALL' },
  [ROLES.ECODEV_REVIEWER]: { act: ['S3'], view: 'ALL' },
  [ROLES.LASC_MEMBER]: { act: ['S4'], view: 'ALL' },
  [ROLES.GOM_MEMBER]: { act: ['S5'], view: 'ALL' },
  [ROLES.CABINET_SUBCOMMITTEE]: { act: ['S5A'], view: 'ALL' },
  [ROLES.AUTHORITY_APPROVER]: { act: ['S6', 'S6A'], view: 'ALL' },
  [ROLES.CABINET_APPROVER]: { act: ['S7'], view: 'ALL' },
  [ROLES.FINANCE_OFFICER]: { act: ['S10'], view: 'ALL' },
  [ROLES.PLANNING_OFFICER]: { act: ['S8', 'S12', 'S13', 'S14'], view: 'ALL' },
  // Investors act on the stages they own or co-own, always scoped to their own cases.
  [ROLES.INVESTOR]: { act: ['S1', 'S2', 'S9', 'S10', 'S11', 'S14'], view: 'ALL' },
  [ROLES.VIEWER]: { act: [], view: 'ALL' },
};

// ---------------------------------------------------------------------------
// Settings — every «CONFIRM» value from the spec lives here, admin-editable
// ---------------------------------------------------------------------------

type SettingSeed = {
  key: string;
  value: string | any;
  group: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'list';
  help?: string;
};

export const SETTINGS_SEED: SettingSeed[] = [
  // --- Workflow ---
  {
    key: 'loi_validity_days',
    value: '90',
    group: 'workflow',
    label: 'LOI validity (days)',
    type: 'number',
    help: '«CONFIRM» Days an investor has to accept the Letter of Intent before the case lapses.',
  },
  {
    key: 'loi_expiry_warning_days',
    value: '15',
    group: 'workflow',
    label: 'LOI expiry warning (days)',
    type: 'number',
    help: 'How far ahead of expiry the portal warns the investor and the Lands Officer.',
  },
  {
    key: 'cabinet_test_extent_acres',
    value: '25',
    group: 'workflow',
    label: 'Cabinet test — extent threshold (acres)',
    type: 'number',
    help: '«CONFIRM» At or above this extent, Stage 6a routes the case to Cabinet.',
  },
  {
    key: 'cabinet_test_sensitive_categories',
    value: ['SENSITIVE'],
    group: 'workflow',
    label: 'Cabinet test — sensitive land categories',
    type: 'list',
    help: 'Land categories that force Cabinet approval regardless of extent.',
  },
  {
    key: 'subcommittee_required_modes',
    value: ['NOMINATION'],
    group: 'workflow',
    label: 'Sub-Committee required for modes',
    type: 'list',
    help: 'Modes of allotment that must pass through the Cabinet Sub-Committee (Stage 5a). Concessional allotments always do.',
  },
  {
    key: 'commencement_deadline_years',
    value: '2',
    group: 'workflow',
    label: 'Construction commencement deadline (years from agreement)',
    type: 'number',
    help: '«CONFIRM» Years from the agreement date within which construction must commence.',
  },
  {
    key: 'commencement_warning_days',
    value: '90',
    group: 'workflow',
    label: 'Commencement warning (days)',
    type: 'number',
    help: 'How far ahead of the commencement deadline a case is flagged At Risk.',
  },
  {
    key: 'cure_period_days',
    value: '90',
    group: 'workflow',
    label: 'Cure period after breach notice (days)',
    type: 'number',
    help: 'Time allowed to remedy a commencement breach before resumption may be initiated.',
  },
  {
    key: 'grievance_sla_days',
    value: '15',
    group: 'workflow',
    label: 'Grievance SLA (days)',
    type: 'number',
  },

  // --- Finance ---
  {
    key: 'penalty_rate_pct_per_annum',
    value: '12',
    group: 'finance',
    label: 'Penalty rate (% per annum)',
    type: 'number',
    help: '«CONFIRM» Simple interest applied to overdue payment lines.',
  },
  {
    key: 'default_down_payment_pct',
    value: '25',
    group: 'finance',
    label: 'Default down payment (%)',
    type: 'number',
  },
  { key: 'default_instalments', value: '4', group: 'finance', label: 'Default number of instalments', type: 'number' },
  { key: 'instalment_gap_days', value: '90', group: 'finance', label: 'Gap between instalments (days)', type: 'number' },
  {
    key: 'forfeiture_pct_withdrawal',
    value: '10',
    group: 'finance',
    label: 'Forfeiture on investor withdrawal (%)',
    type: 'number',
    help: '«CONFIRM» Share of consideration paid that is forfeited when the investor withdraws.',
  },
  {
    key: 'forfeiture_pct_cancellation',
    value: '25',
    group: 'finance',
    label: 'Forfeiture on APCRDA cancellation (%)',
    type: 'number',
    help: '«CONFIRM» EMD is forfeited in full in addition to this share.',
  },
  {
    key: 'forfeiture_pct_resumption',
    value: '50',
    group: 'finance',
    label: 'Forfeiture on resumption (%)',
    type: 'number',
    help: '«CONFIRM» Applied when the allotment is resumed for breach.',
  },

  // --- Organisation ---
  {
    key: 'org_name',
    value: 'Andhra Pradesh Capital Region Development Authority',
    group: 'organisation',
    label: 'Organisation name',
    type: 'string',
  },
  { key: 'org_short_name', value: 'APCRDA', group: 'organisation', label: 'Short name', type: 'string' },
  {
    key: 'org_portal_name',
    value: 'Amaravati Land Allotment Portal',
    group: 'organisation',
    label: 'Portal name',
    type: 'string',
  },
  { key: 'currency', value: 'INR', group: 'organisation', label: 'Currency', type: 'string' },
  { key: 'timezone', value: 'Asia/Kolkata', group: 'organisation', label: 'Timezone', type: 'string' },
  {
    key: 'fiscal_year_start',
    value: '04-01',
    group: 'organisation',
    label: 'Fiscal year start (MM-DD)',
    type: 'string',
  },

  // --- Master data (empty list = use the built-in defaults) ---
  { key: 'master_modes', value: [], group: 'master', label: 'Modes of allotment', type: 'list', help: 'Leave empty to use the built-in list.' },
  { key: 'master_objective_categories', value: [], group: 'master', label: 'Objective categories', type: 'list' },
  { key: 'master_entity_types', value: [], group: 'master', label: 'Eligible entity types', type: 'list' },
  { key: 'master_holding_types', value: [], group: 'master', label: 'Holding types', type: 'list' },
  { key: 'master_sectors', value: [], group: 'master', label: 'Sectors', type: 'list' },
  { key: 'master_theme_cities', value: [], group: 'master', label: 'Theme cities / zones', type: 'list' },
  { key: 'master_land_uses', value: [], group: 'master', label: 'Land-use classifications', type: 'list' },
  { key: 'master_document_types', value: [], group: 'master', label: 'Document types', type: 'list' },
  { key: 'master_noc_types', value: [], group: 'master', label: 'Statutory NOC types', type: 'list' },

  // --- Notifications ---
  {
    key: 'notifications_email_enabled',
    value: 'true',
    group: 'notifications',
    label: 'Send email notifications',
    type: 'boolean',
    help: 'The demo mail driver prints messages to the API console.',
  },
  {
    key: 'template_task_assigned',
    value: 'Action required on {{caseCode}} — stage {{stageCode}} · {{stageName}} is pending with you. Due {{dueDate}}.',
    group: 'notifications',
    label: 'Template — task assigned',
    type: 'string',
  },
  {
    key: 'template_loi_expiring',
    value: 'The Letter of Intent on {{caseCode}} lapses on {{expiryDate}}. Accept and begin payment before then.',
    group: 'notifications',
    label: 'Template — LOI expiring',
    type: 'string',
  },
  {
    key: 'template_payment_overdue',
    value: '{{label}} on {{caseCode}} was due on {{dueDate}}. Penalty accrues at {{penaltyRate}}% per annum.',
    group: 'notifications',
    label: 'Template — payment overdue',
    type: 'string',
  },
  {
    key: 'template_commencement_breach',
    value: 'Construction on {{caseCode}} had to commence by {{deadline}}. A cure period is now running; resumption may follow.',
    group: 'notifications',
    label: 'Template — commencement breach',
    type: 'string',
  },
];
