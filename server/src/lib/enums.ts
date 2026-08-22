/**
 * Central vocabulary. SQLite has no native enums, so these are the single
 * source of truth for the string values stored in the database and shipped to
 * the client via /api/meta.
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  LANDS_OFFICER: 'LANDS_OFFICER',
  TECHNICAL_REVIEWER: 'TECHNICAL_REVIEWER',
  ECODEV_REVIEWER: 'ECODEV_REVIEWER',
  LASC_MEMBER: 'LASC_MEMBER',
  GOM_MEMBER: 'GOM_MEMBER',
  CABINET_SUBCOMMITTEE: 'CABINET_SUBCOMMITTEE',
  AUTHORITY_APPROVER: 'AUTHORITY_APPROVER',
  CABINET_APPROVER: 'CABINET_APPROVER',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  PLANNING_OFFICER: 'PLANNING_OFFICER',
  INVESTOR: 'INVESTOR',
  VIEWER: 'VIEWER',
} as const;
export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

/** Non-stage abilities checked by requireCapability(). */
export const CAPABILITIES = {
  USERS_MANAGE: 'users:manage',
  SETTINGS_MANAGE: 'settings:manage',
  WORKFLOW_MANAGE: 'workflow:manage',
  AUDIT_VIEW: 'audit:view',
  CASES_VIEW_ALL: 'cases:view_all',
  CASES_CREATE: 'cases:create',
  CASES_ASSIGN: 'cases:assign',
  PLOTS_MANAGE: 'plots:manage',
  INVITATIONS_MANAGE: 'invitations:manage',
  PAYMENTS_MANAGE: 'payments:manage',
  PAYMENTS_PAY: 'payments:pay',
  GRIEVANCE_RAISE: 'grievance:raise',
  GRIEVANCE_RESOLVE: 'grievance:resolve',
  CANCELLATION_REQUEST: 'cancellation:request',
  CANCELLATION_DECIDE: 'cancellation:decide',
  CONSTRUCTION_MANAGE: 'construction:manage',
  CONSTRUCTION_UPDATE: 'construction:update',
  REPORTS_VIEW: 'reports:view',
  COMMENTS_INTERNAL: 'comments:internal',
} as const;

export const CASE_STATUS = {
  DRAFT: 'DRAFT',
  IN_PROGRESS: 'IN_PROGRESS',
  ON_HOLD: 'ON_HOLD',
  REJECTED: 'REJECTED',
  LAPSED: 'LAPSED',
  CANCELLED: 'CANCELLED',
  RESUMED: 'RESUMED',
  COMPLETED: 'COMPLETED',
} as const;

export const TERMINAL_STATUSES = [
  CASE_STATUS.REJECTED,
  CASE_STATUS.LAPSED,
  CASE_STATUS.CANCELLED,
  CASE_STATUS.RESUMED,
  CASE_STATUS.COMPLETED,
] as string[];

export const STAGE_INSTANCE_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  RETURNED: 'RETURNED',
  REJECTED: 'REJECTED',
  DEFERRED: 'DEFERRED',
  SKIPPED: 'SKIPPED',
  LAPSED: 'LAPSED',
} as const;

/** Gate outcome kinds understood by the workflow engine. */
export const OUTCOME_KIND = {
  PASS: 'pass',
  RETURN: 'return',
  REJECT: 'reject',
  DEFER: 'defer',
  LAPSE: 'lapse',
} as const;
export type OutcomeKind = (typeof OUTCOME_KIND)[keyof typeof OUTCOME_KIND];

export const MODES_OF_ALLOTMENT = [
  { value: 'NOMINATION', label: 'Nomination' },
  { value: 'QUALITY_BASED', label: 'Quality-Based Selection' },
  { value: 'QUALITY_CUM_PRICE', label: 'Quality-cum-Price' },
  { value: 'PUBLIC_TENDER', label: 'Public Tender / e-Tendering' },
  { value: 'PUBLIC_AUCTION', label: 'Public Auction / e-Auction' },
  { value: 'RANDOMIZED', label: 'Randomized (Draw of Lots)' },
];

export const OBJECTIVE_CATEGORIES = [
  { value: 'REVENUE_MAXIMISATION', label: 'Revenue Maximisation' },
  { value: 'ECONOMIC_DEVELOPMENT', label: 'Economic Development' },
  { value: 'SOCIAL_DEVELOPMENT', label: 'Social Development' },
  { value: 'INFRASTRUCTURE', label: 'Infrastructure Development' },
];

export const ENTITY_TYPES = [
  { value: 'PRIVATE_LIMITED', label: 'Private Limited Company' },
  { value: 'PUBLIC_LIMITED', label: 'Public Limited Company' },
  { value: 'LLP', label: 'Limited Liability Partnership' },
  { value: 'PARTNERSHIP', label: 'Partnership Firm' },
  { value: 'TRUST', label: 'Trust / Society' },
  { value: 'PSU', label: 'Public Sector Undertaking' },
  { value: 'GOVERNMENT_BODY', label: 'Government Body / Department' },
  { value: 'EDUCATIONAL', label: 'Educational Institution' },
  { value: 'FOREIGN_ENTITY', label: 'Foreign Entity / JV' },
];

export const SECTORS = [
  'Information Technology',
  'Electronics Manufacturing',
  'Healthcare & Life Sciences',
  'Education & Skilling',
  'Financial Services',
  'Media & Entertainment',
  'Sports & Recreation',
  'Tourism & Hospitality',
  'Logistics & Warehousing',
  'Renewable Energy',
  'Legal & Judiciary',
  'Public Administration',
];

export const THEME_CITIES = [
  'Government City',
  'Knowledge City',
  'Financial City',
  'Health City',
  'Sports City',
  'Electronics City',
  'Justice City',
  'Media City',
  'Tourism City',
];

export const HOLDING_TYPES = [
  { value: 'LEASEHOLD', label: 'Leasehold' },
  { value: 'FREEHOLD', label: 'Freehold' },
];

export const LAND_USES = [
  'Commercial',
  'Institutional',
  'Mixed Use',
  'Industrial',
  'Residential',
  'Recreational',
  'Public / Semi-Public',
];

export const DOCUMENT_TYPES = [
  'Application Form',
  'Incorporation Certificate',
  'PAN / GST Certificate',
  'Audited Financials',
  'Net Worth Certificate',
  'EMD Receipt',
  'Detailed Project Report',
  'Revised DPR',
  'Economic Impact Note',
  'Site Verification Report',
  'Title Verification Report',
  'LASC Minutes',
  'GoM Minutes',
  'Cabinet Sub-Committee Minutes',
  'Authority Resolution',
  'Cabinet Note',
  'Government Order',
  'Letter of Intent',
  'LOI Acceptance',
  'Payment Receipt',
  'Lease / Sale Agreement',
  'Registered Deed',
  'Possession Certificate',
  'Building Plans',
  'Architectural Drawings',
  'Structural Drawings',
  'Services Drawings (MEP)',
  'BIM Model',
  'Site / Layout Plan',
  'Soil Investigation Report',
  'Fire Safety Plan',
  'Statutory NOC',
  'Building Permission Order',
  'Occupancy Certificate',
  'Progress Photograph',
  'Utilisation Certificate',
  'Completion Certificate',
  'Grievance Attachment',
  'Show-Cause Notice',
  'Other',
];

/**
 * The document set a building-permit application is assessed on. `SUBMITTED`
 * comes from the applicant and gates the scrutiny; `ISSUED` is what APCRDA puts
 * back on the file once the permit is sanctioned.
 */
export const PERMIT_DOCUMENT_TYPES: {
  type: string;
  kind: 'SUBMITTED' | 'ISSUED';
  required: boolean;
  /** One line saying what the document actually is, for the enclosures list. */
  description: string;
}[] = [
  { type: 'Building Plans', kind: 'SUBMITTED', required: true, description: 'Construction plan package' },
  { type: 'Architectural Drawings', kind: 'SUBMITTED', required: true, description: 'Elevations, sections and floor plans' },
  { type: 'Structural Drawings', kind: 'SUBMITTED', required: true, description: 'Framing, foundation and load design' },
  { type: 'Site / Layout Plan', kind: 'SUBMITTED', required: true, description: 'Setbacks, access and site layout' },
  { type: 'Services Drawings (MEP)', kind: 'SUBMITTED', required: false, description: 'Mechanical, electrical and plumbing' },
  { type: 'BIM Model', kind: 'SUBMITTED', required: false, description: 'Building information model' },
  { type: 'Soil Investigation Report', kind: 'SUBMITTED', required: false, description: 'Geotechnical investigation report' },
  { type: 'Fire Safety Plan', kind: 'SUBMITTED', required: false, description: 'Fire safety and evacuation plan' },
  { type: 'Statutory NOC', kind: 'SUBMITTED', required: true, description: 'Clearances from other departments' },
  { type: 'Building Permission Order', kind: 'ISSUED', required: false, description: 'The sanctioned permission order' },
  { type: 'Occupancy Certificate', kind: 'ISSUED', required: false, description: 'Issued once the building is fit for use' },
];

/** Scrutiny outcome for a filed document. */
export const DOCUMENT_REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

/** Where a building-permit application can sit. */
export const PERMIT_STATUSES = [
  'NOT_STARTED',
  'SUBMITTED',
  'UNDER_SCRUTINY',
  'RETURNED',
  'SANCTIONED',
  'REJECTED',
] as const;

export const NOC_TYPES = [
  'Fire Services',
  'Environment (SEIAA)',
  'Airport Authority (Height Clearance)',
  'Railway Clearance',
  'Irrigation Department',
  'Pollution Control Board',
  'Traffic & Transportation',
  'Heritage / Archaeology',
];

export const PAYMENT_TYPES = [
  { value: 'PROCESSING_FEE', label: 'Processing Fee' },
  { value: 'EMD', label: 'Earnest Money Deposit' },
  { value: 'DOWN_PAYMENT', label: 'Down Payment' },
  { value: 'INSTALMENT', label: 'Instalment' },
  { value: 'STAMP_DUTY', label: 'Stamp Duty' },
  { value: 'REGISTRATION_CHARGE', label: 'Registration Charges' },
  { value: 'PERMIT_SCRUTINY_FEE', label: 'Permit Scrutiny Fee' },
  { value: 'DEVELOPMENT_CHARGE', label: 'Development Charges' },
  { value: 'BETTERMENT_CHARGE', label: 'Betterment Charges' },
  { value: 'LABOUR_CESS', label: 'Labour Cess' },
  { value: 'PENALTY', label: 'Penalty' },
  { value: 'REFUND', label: 'Refund' },
];

/**
 * The fee lines a building permit attracts. The permits desk raises these
 * demands itself; Finance still reconciles the receipt in the payments module.
 */
export const PERMIT_PAYMENT_TYPES = [
  'PERMIT_SCRUTINY_FEE',
  'DEVELOPMENT_CHARGE',
  'BETTERMENT_CHARGE',
  'LABOUR_CESS',
] as string[];

export const PHASES = [
  { value: 'A', label: 'Phase A — Inventory & Intake' },
  { value: 'B', label: 'Phase B — Review & Approval' },
  { value: 'C', label: 'Phase C — Issuance & Handover' },
  { value: 'D', label: 'Phase D — Development & Compliance' },
];

export const GRIEVANCE_CATEGORIES = [
  'DECISION_APPEAL',
  'PROCESS_DELAY',
  'PAYMENT_DISPUTE',
  'DOCUMENT_ISSUE',
  'OTHER',
];
