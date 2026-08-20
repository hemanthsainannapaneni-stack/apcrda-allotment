import { ROLES } from '../lib/enums';

/**
 * The stage catalogue is SEED DATA, not code. Everything here is written into
 * the Stage table on `npm run seed`; from then on an admin edits stages through
 * Settings → Workflow and the engine reads the table. Nothing in the engine
 * branches on a specific stage id except through `routing.rule`.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'select'
  | 'boolean';

export type StageField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  optionSource?: 'modes' | 'holdingTypes' | 'landUses' | 'objectives';
  help?: string;
};

export type StageOutcome = {
  value: string;
  label: string;
  /** pass | return | reject | defer | lapse */
  kind: 'pass' | 'return' | 'reject' | 'defer' | 'lapse';
  /** Target stage id for `return`; defaults to routing.onReturn. */
  to?: string;
  tone?: 'positive' | 'warning' | 'danger';
};

export type StageRouting = {
  /** 'NEXT' walks the catalogue forward; a stage id jumps directly. */
  onPass?: string;
  onReturn?: string;
  /** Named rule evaluated by the engine (see workflow/rules.ts). */
  rule?: 'CABINET_TEST';
  /** Named applicability predicate for optional stages. */
  applicability?: 'CABINET_REQUIRED' | 'SUBCOMMITTEE_REQUIRED';
};

export type StageDef = {
  id: string;
  code: string;
  name: string;
  order: number;
  phase: 'A' | 'B' | 'C' | 'D';
  type: string;
  ownerRoleKey: string;
  coOwnerRole?: string;
  slaDays: number;
  maxRounds: number;
  roundLabels: string[];
  outcomes: StageOutcome[];
  fields: StageField[];
  docTypes: string[];
  routing: StageRouting;
  optional?: boolean;
  description: string;
};

const yesNo = (key: string, label: string, required = false): StageField => ({
  key,
  label,
  type: 'boolean',
  required,
});

export const STAGE_CATALOGUE: StageDef[] = [
  {
    id: 'S0',
    code: '0',
    name: 'Land Inventory & Invitation Document',
    order: 0,
    phase: 'A',
    type: 'SETUP',
    ownerRoleKey: ROLES.LANDS_OFFICER,
    slaDays: 10,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'PUBLISHED', label: 'Publish — open for application', kind: 'pass', tone: 'positive' },
    ],
    fields: [
      { key: 'invitationRef', label: 'Invitation Document reference', type: 'text', required: true },
      { key: 'plotsPublished', label: 'Plots published', type: 'number' },
      { key: 'mode', label: 'Mode of allotment offered', type: 'select', optionSource: 'modes', required: true },
      { key: 'termsSummary', label: 'Terms summary', type: 'textarea' },
      { key: 'publishedOn', label: 'Published on', type: 'date' },
    ],
    docTypes: ['Other'],
    routing: { onPass: 'NEXT' },
    description:
      'APCRDA Planning/Lands publishes the plot inventory and the invitation document that opens the plot for application.',
  },
  {
    id: 'S1',
    code: '1',
    name: 'Registration & Application (+ fee / EMD)',
    order: 1,
    phase: 'A',
    type: 'INTAKE',
    ownerRoleKey: ROLES.INVESTOR,
    slaDays: 15,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'SUBMITTED', label: 'Submit application for eligibility check', kind: 'pass', tone: 'positive' },
    ],
    fields: [
      { key: 'applicationRef', label: 'Application reference', type: 'text' },
      { key: 'processingFee', label: 'Processing fee paid (₹)', type: 'currency' },
      { key: 'emdAmount', label: 'EMD amount (₹)', type: 'currency', required: true },
      { key: 'emdReference', label: 'EMD / UTR reference', type: 'text', required: true },
      yesNo('declarationSigned', 'Declaration & undertaking signed', true),
    ],
    docTypes: [
      'Application Form',
      'Incorporation Certificate',
      'PAN / GST Certificate',
      'Audited Financials',
      'Net Worth Certificate',
      'EMD Receipt',
    ],
    routing: { onPass: 'NEXT' },
    description:
      'The investor registers, completes the application, and pays the processing fee and earnest money deposit.',
  },
  {
    id: 'S1A',
    code: '1a',
    name: 'Eligibility & Mode-of-Allotment Check',
    order: 2,
    phase: 'A',
    type: 'GATE',
    ownerRoleKey: ROLES.LANDS_OFFICER,
    slaDays: 7,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'ELIGIBLE', label: 'Eligible — proceed to DPR', kind: 'pass', tone: 'positive' },
      { value: 'INELIGIBLE', label: 'Reject — not eligible', kind: 'reject', tone: 'danger' },
    ],
    fields: [
      yesNo('entityTypeEligible', 'Entity type is on the eligible list', true),
      yesNo('netWorthVerified', 'Net worth / financial capacity verified', true),
      yesNo('emdVerified', 'EMD receipt verified by Finance', true),
      {
        key: 'modeOfAllotment',
        label: 'Confirmed mode of allotment',
        type: 'select',
        optionSource: 'modes',
        required: true,
        help: 'Written back onto the case record.',
      },
      { key: 'eligibilityNotes', label: 'Eligibility notes', type: 'textarea' },
    ],
    docTypes: ['Other'],
    routing: { onPass: 'NEXT' },
    description: 'Lands Officer verifies eligibility and locks the mode under which the plot will be allotted.',
  },
  {
    id: 'S2',
    code: '2',
    name: 'DPR Submission & Review',
    order: 3,
    phase: 'B',
    type: 'REVIEW_LOOP',
    ownerRoleKey: ROLES.TECHNICAL_REVIEWER,
    coOwnerRole: ROLES.INVESTOR,
    slaDays: 21,
    maxRounds: 2,
    roundLabels: ['R0', 'R1'],
    outcomes: [
      { value: 'ACCEPT', label: 'Accept DPR', kind: 'pass', tone: 'positive' },
      { value: 'RETURN', label: 'Return to investor for revision', kind: 'return', to: 'S2', tone: 'warning' },
      { value: 'REJECT', label: 'Reject DPR', kind: 'reject', tone: 'danger' },
    ],
    fields: [
      { key: 'dprVersion', label: 'DPR version', type: 'text', required: true },
      { key: 'projectCost', label: 'Project cost (₹)', type: 'currency', required: true },
      { key: 'builtUpArea', label: 'Proposed built-up area (sq ft)', type: 'number' },
      { key: 'phasingPlan', label: 'Phasing plan', type: 'textarea' },
      { key: 'technicalScore', label: 'Technical score (0-100)', type: 'number' },
      { key: 'reviewNotes', label: 'Reviewer observations', type: 'textarea' },
    ],
    docTypes: ['Detailed Project Report', 'Building Plans', 'Other'],
    routing: { onPass: 'NEXT', onReturn: 'S2' },
    description:
      'Technical review of the Detailed Project Report. A return opens the next round (R1) for the investor to revise.',
  },
  {
    id: 'S3',
    code: '3',
    name: 'Economic Development Review',
    order: 4,
    phase: 'B',
    type: 'REVIEW',
    ownerRoleKey: ROLES.ECODEV_REVIEWER,
    slaDays: 14,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'POSITIVE', label: 'Positive appraisal — forward to LASC', kind: 'pass', tone: 'positive' },
      { value: 'RETURN', label: 'Return to DPR review', kind: 'return', to: 'S2', tone: 'warning' },
      { value: 'REJECT', label: 'Reject', kind: 'reject', tone: 'danger' },
    ],
    fields: [
      { key: 'investmentQuantum', label: 'Assessed investment quantum (₹)', type: 'currency' },
      { key: 'directJobs', label: 'Direct jobs', type: 'number' },
      { key: 'indirectJobs', label: 'Indirect jobs', type: 'number' },
      { key: 'sectorPriority', label: 'Sector priority', type: 'select', options: ['High', 'Medium', 'Low'] },
      { key: 'economicScore', label: 'Economic score (0-100)', type: 'number' },
      { key: 'assessment', label: 'Assessment note', type: 'textarea', required: true },
    ],
    docTypes: ['Economic Impact Note', 'Other'],
    routing: { onPass: 'NEXT', onReturn: 'S2' },
    description: 'Appraisal of investment quantum, employment, and sector fit against the objective category.',
  },
  {
    id: 'S4',
    code: '4',
    name: 'LASC Scrutiny + Site & Title Verification',
    order: 5,
    phase: 'B',
    type: 'COMMITTEE',
    ownerRoleKey: ROLES.LASC_MEMBER,
    slaDays: 21,
    maxRounds: 3,
    roundLabels: ['R0', 'R1', 'R2'],
    outcomes: [
      { value: 'RECOMMEND', label: 'Recommend to GoM', kind: 'pass', tone: 'positive' },
      { value: 'CLARIFY', label: 'Seek clarification (next round)', kind: 'return', to: 'S4', tone: 'warning' },
      { value: 'REJECT', label: 'Reject', kind: 'reject', tone: 'danger' },
    ],
    fields: [
      { key: 'meetingNo', label: 'LASC meeting number', type: 'text', required: true },
      { key: 'meetingDate', label: 'Meeting date', type: 'date', required: true },
      yesNo('siteVerified', 'Site verification completed'),
      yesNo('titleVerified', 'Title verification completed'),
      { key: 'encumbrance', label: 'Encumbrance / litigation status', type: 'text' },
      { key: 'recommendedExtent', label: 'Recommended extent (acres)', type: 'number' },
      { key: 'recommendedPrice', label: 'Recommended price (₹/acre)', type: 'currency' },
      { key: 'recommendation', label: 'Committee recommendation', type: 'textarea', required: true },
    ],
    docTypes: ['Site Verification Report', 'Title Verification Report', 'LASC Minutes'],
    routing: { onPass: 'NEXT', onReturn: 'S4' },
    description:
      'Land Allotment Scrutiny Committee examines the proposal alongside site and title verification. Up to three rounds.',
  },
  {
    id: 'S5',
    code: '5',
    name: 'Group of Ministers (GoM)',
    order: 6,
    phase: 'B',
    type: 'COMMITTEE',
    ownerRoleKey: ROLES.GOM_MEMBER,
    slaDays: 30,
    maxRounds: 3,
    roundLabels: ['R0', 'R1', 'Auto'],
    outcomes: [
      { value: 'CLEAR', label: 'Clear the proposal', kind: 'pass', tone: 'positive' },
      { value: 'DEFER', label: 'Defer to next sitting', kind: 'defer', tone: 'warning' },
    ],
    fields: [
      { key: 'gomMeetingNo', label: 'GoM meeting number', type: 'text', required: true },
      { key: 'gomDate', label: 'Meeting date', type: 'date', required: true },
      yesNo('concessionsApproved', 'Concessions approved'),
      { key: 'priceApproved', label: 'Price approved (₹/acre)', type: 'currency' },
      { key: 'gomNotes', label: 'Minutes summary', type: 'textarea', required: true },
    ],
    docTypes: ['GoM Minutes', 'Other'],
    routing: { onPass: 'NEXT' },
    description:
      'Group of Ministers clears the allotment. A deferral opens the next round; the third round is the automatic listing.',
  },
  {
    id: 'S5A',
    code: '5a',
    name: 'Cabinet Sub-Committee',
    order: 7,
    phase: 'B',
    type: 'COMMITTEE',
    ownerRoleKey: ROLES.CABINET_SUBCOMMITTEE,
    slaDays: 21,
    maxRounds: 1,
    roundLabels: ['R0'],
    optional: true,
    outcomes: [
      { value: 'RECOMMEND', label: 'Recommend to Authority', kind: 'pass', tone: 'positive' },
      { value: 'RETURN', label: 'Return to GoM', kind: 'return', to: 'S5', tone: 'warning' },
    ],
    fields: [
      { key: 'subCommitteeRef', label: 'Sub-Committee reference', type: 'text', required: true },
      { key: 'meetingDate', label: 'Meeting date', type: 'date', required: true },
      { key: 'recommendation', label: 'Recommendation', type: 'textarea', required: true },
    ],
    docTypes: ['Cabinet Sub-Committee Minutes', 'Other'],
    routing: { onPass: 'NEXT', applicability: 'SUBCOMMITTEE_REQUIRED' },
    description:
      'Applies where the allotment is concessional or by nomination. Skipped automatically otherwise.',
  },
  {
    id: 'S6',
    code: '6',
    name: 'APCRDA Authority Approval',
    order: 8,
    phase: 'B',
    type: 'APPROVAL',
    ownerRoleKey: ROLES.AUTHORITY_APPROVER,
    slaDays: 21,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'APPROVED', label: 'Approve — run Cabinet test', kind: 'pass', tone: 'positive' },
      { value: 'RETURN', label: 'Return to LASC', kind: 'return', to: 'S4', tone: 'warning' },
      { value: 'REJECT', label: 'Reject', kind: 'reject', tone: 'danger' },
    ],
    fields: [
      { key: 'authorityMeetingNo', label: 'Authority meeting number', type: 'text', required: true },
      { key: 'resolutionNo', label: 'Resolution number', type: 'text', required: true },
      { key: 'approvalDate', label: 'Approval date', type: 'date', required: true },
      { key: 'approvedExtent', label: 'Approved extent (acres)', type: 'number' },
      { key: 'approvedPrice', label: 'Approved price (₹/acre)', type: 'currency' },
      { key: 'conditions', label: 'Conditions of approval', type: 'textarea' },
    ],
    docTypes: ['Authority Resolution', 'Other'],
    routing: { onPass: 'NEXT', onReturn: 'S4' },
    description: 'The APCRDA Authority approves the allotment on the strength of the LASC and GoM record.',
  },
  {
    id: 'S6A',
    code: '6a',
    name: 'Cabinet-Approval Test',
    order: 9,
    phase: 'B',
    type: 'GATE',
    ownerRoleKey: ROLES.AUTHORITY_APPROVER,
    slaDays: 3,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'EVALUATE', label: 'Run test & route', kind: 'pass', tone: 'positive' },
    ],
    fields: [
      yesNo('overrideToCabinet', 'Force routing to Cabinet regardless of test result'),
      { key: 'testNotes', label: 'Notes', type: 'textarea' },
    ],
    docTypes: [],
    routing: { rule: 'CABINET_TEST' },
    description:
      'Rule-driven gate: routes to Cabinet when the extent crosses the configured threshold, the allotment is concessional, or the land is categorised sensitive. Otherwise the case goes straight to the Government Order.',
  },
  {
    id: 'S7',
    code: '7',
    name: 'Cabinet Approval',
    order: 10,
    phase: 'B',
    type: 'APPROVAL',
    ownerRoleKey: ROLES.CABINET_APPROVER,
    slaDays: 30,
    maxRounds: 1,
    roundLabels: ['R0'],
    optional: true,
    outcomes: [
      { value: 'APPROVED', label: 'Cabinet approved — proceed to GO', kind: 'pass', tone: 'positive' },
      { value: 'RETURN', label: 'Return to Authority', kind: 'return', to: 'S6', tone: 'warning' },
      { value: 'REJECT', label: 'Reject', kind: 'reject', tone: 'danger' },
    ],
    fields: [
      { key: 'cabinetMeetingNo', label: 'Cabinet meeting number', type: 'text', required: true },
      { key: 'cabinetDate', label: 'Cabinet date', type: 'date', required: true },
      { key: 'decisionNo', label: 'Decision number', type: 'text' },
      { key: 'conditions', label: 'Conditions', type: 'textarea' },
    ],
    docTypes: ['Cabinet Note', 'Other'],
    routing: { onPass: 'NEXT', onReturn: 'S6', applicability: 'CABINET_REQUIRED' },
    description: 'Entered only when the Cabinet-approval test routed the case here.',
  },
  {
    id: 'S8',
    code: '8',
    name: 'Government Order (GO) & Land Details',
    order: 11,
    phase: 'C',
    type: 'ISSUANCE',
    ownerRoleKey: ROLES.PLANNING_OFFICER,
    slaDays: 14,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [{ value: 'ISSUED', label: 'GO issued — proceed to LOI', kind: 'pass', tone: 'positive' }],
    fields: [
      { key: 'goNumber', label: 'G.O. number', type: 'text', required: true },
      { key: 'goDate', label: 'G.O. date', type: 'date', required: true },
      { key: 'extentAcres', label: 'Sanctioned extent (acres)', type: 'number', required: true },
      { key: 'holdingType', label: 'Holding type', type: 'select', optionSource: 'holdingTypes', required: true },
      { key: 'landUse', label: 'Land use', type: 'select', optionSource: 'landUses', required: true },
      { key: 'tenureYears', label: 'Lease tenure (years)', type: 'number', help: 'Leave blank for freehold.' },
      { key: 'landDetails', label: 'Land / boundary details', type: 'textarea' },
    ],
    docTypes: ['Government Order', 'Other'],
    routing: { onPass: 'NEXT' },
    description: 'The Government Order records the sanctioned extent, holding type, land use, and tenure.',
  },
  {
    id: 'S9',
    code: '9',
    name: 'Letter of Intent',
    order: 12,
    phase: 'C',
    type: 'ISSUANCE',
    ownerRoleKey: ROLES.LANDS_OFFICER,
    coOwnerRole: ROLES.INVESTOR,
    slaDays: 90,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'ACCEPTED', label: 'LOI accepted by investor', kind: 'pass', tone: 'positive' },
      { value: 'LAPSED', label: 'Validity expired — mark lapsed', kind: 'lapse', tone: 'danger' },
    ],
    fields: [
      { key: 'loiNumber', label: 'LOI number', type: 'text', required: true },
      { key: 'loiIssuedOn', label: 'Issued on', type: 'date', required: true },
      { key: 'validityDays', label: 'Validity (days)', type: 'number', help: 'Defaults to the configured LOI validity.' },
      { key: 'acceptedOn', label: 'Accepted on', type: 'date' },
      { key: 'acceptanceRef', label: 'Acceptance reference', type: 'text' },
    ],
    docTypes: ['Letter of Intent', 'LOI Acceptance'],
    routing: { onPass: 'NEXT' },
    description:
      'Issuing the LOI starts the validity countdown. If the investor does not accept in time the case is flagged Lapsed.',
  },
  {
    id: 'S10',
    code: '10',
    name: 'Payment & Financial Processing',
    order: 13,
    phase: 'C',
    type: 'FINANCIAL',
    ownerRoleKey: ROLES.FINANCE_OFFICER,
    coOwnerRole: ROLES.INVESTOR,
    slaDays: 60,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'CURRENT', label: 'Payments current — proceed to revised DPR', kind: 'pass', tone: 'positive' },
      { value: 'DEFAULT', label: 'Payment default — refer for cancellation', kind: 'reject', tone: 'danger' },
    ],
    fields: [
      { key: 'totalConsideration', label: 'Total consideration (₹)', type: 'currency', required: true },
      { key: 'downPaymentPct', label: 'Down payment (%)', type: 'percent' },
      { key: 'instalments', label: 'Number of instalments', type: 'number' },
      { key: 'scheduleNotes', label: 'Schedule notes', type: 'textarea' },
    ],
    docTypes: ['Payment Receipt', 'Other'],
    routing: { onPass: 'NEXT' },
    description:
      'Finance builds the payment schedule and reconciles receipts. Overdue instalments accrue penalty at the configured rate.',
  },
  {
    id: 'S11',
    code: '11',
    name: 'Revised DPR — Final Version',
    order: 14,
    phase: 'C',
    type: 'REVIEW',
    ownerRoleKey: ROLES.TECHNICAL_REVIEWER,
    coOwnerRole: ROLES.INVESTOR,
    slaDays: 21,
    maxRounds: 2,
    roundLabels: ['R0', 'R1'],
    outcomes: [
      { value: 'ACCEPTED', label: 'Accept final DPR — proceed to agreement', kind: 'pass', tone: 'positive' },
      { value: 'RETURN', label: 'Return for revision', kind: 'return', to: 'S11', tone: 'warning' },
    ],
    fields: [
      { key: 'finalDprVersion', label: 'Final DPR version', type: 'text', required: true },
      { key: 'finalProjectCost', label: 'Final project cost (₹)', type: 'currency' },
      { key: 'finalBuiltUpArea', label: 'Final built-up area (sq ft)', type: 'number' },
      { key: 'deviations', label: 'Deviations from the approved DPR', type: 'textarea' },
    ],
    docTypes: ['Revised DPR', 'Building Plans', 'Other'],
    routing: { onPass: 'NEXT', onReturn: 'S11' },
    description: 'The final DPR is locked before the agreement is drawn up.',
  },
  {
    id: 'S12',
    code: '12',
    name: 'Agreement Execution & Registration',
    order: 15,
    phase: 'C',
    type: 'LEGAL',
    ownerRoleKey: ROLES.PLANNING_OFFICER,
    coOwnerRole: ROLES.INVESTOR,
    slaDays: 30,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'REGISTERED', label: 'Registered — proceed to possession', kind: 'pass', tone: 'positive' },
    ],
    fields: [
      { key: 'agreementRef', label: 'Agreement reference', type: 'text', required: true },
      { key: 'agreementDate', label: 'Agreement date', type: 'date', required: true },
      { key: 'subRegistrarOffice', label: 'Sub-Registrar office', type: 'text', required: true },
      { key: 'registrationNo', label: 'Registration document number', type: 'text', required: true },
      { key: 'registrationDate', label: 'Registration date', type: 'date', required: true },
      { key: 'stampDuty', label: 'Stamp duty (₹)', type: 'currency' },
      { key: 'registrationCharges', label: 'Registration charges (₹)', type: 'currency' },
    ],
    docTypes: ['Lease / Sale Agreement', 'Registered Deed', 'Other'],
    routing: { onPass: 'NEXT' },
    description:
      'Execution and registration before the Sub-Registrar. The agreement date starts the construction-commencement clock.',
  },
  {
    id: 'S12A',
    code: '12a',
    name: 'Handover of Physical Possession',
    order: 16,
    phase: 'C',
    type: 'OPERATIONAL',
    ownerRoleKey: ROLES.LANDS_OFFICER,
    slaDays: 14,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'HANDED_OVER', label: 'Possession handed over', kind: 'pass', tone: 'positive' },
    ],
    fields: [
      { key: 'possessionDate', label: 'Possession date', type: 'date', required: true },
      yesNo('boundariesDemarcated', 'Boundaries demarcated on site', true),
      { key: 'handoverRef', label: 'Handover reference', type: 'text' },
      { key: 'siteNotes', label: 'Site notes', type: 'textarea' },
    ],
    docTypes: ['Possession Certificate', 'Progress Photograph'],
    routing: { onPass: 'NEXT' },
    description: 'Physical possession of the demarcated plot is handed to the allottee.',
  },
  {
    id: 'S13',
    code: '13',
    name: 'Building Permission / Development Approval',
    order: 17,
    phase: 'D',
    type: 'APPROVAL',
    ownerRoleKey: ROLES.PLANNING_OFFICER,
    slaDays: 45,
    maxRounds: 2,
    roundLabels: ['R0', 'R1'],
    outcomes: [
      { value: 'SANCTIONED', label: 'Sanction building permission', kind: 'pass', tone: 'positive' },
      { value: 'RETURN', label: 'Return for corrections', kind: 'return', to: 'S13', tone: 'warning' },
      { value: 'REJECT', label: 'Reject', kind: 'reject', tone: 'danger' },
    ],
    fields: [
      { key: 'permissionApplicationNo', label: 'Permission application number', type: 'text', required: true },
      { key: 'proposedFsi', label: 'Proposed FSI', type: 'number', required: true },
      { key: 'proposedFar', label: 'Proposed FAR', type: 'number' },
      { key: 'builtUpArea', label: 'Sanctioned built-up area (sq ft)', type: 'number' },
      yesNo('layoutApproved', 'Layout approved'),
      yesNo('nocsCleared', 'All statutory NOCs cleared'),
      { key: 'sanctionNo', label: 'Sanction number', type: 'text' },
      { key: 'sanctionDate', label: 'Sanction date', type: 'date' },
    ],
    docTypes: ['Building Plans', 'Statutory NOC', 'Building Permission Order'],
    routing: { onPass: 'NEXT', onReturn: 'S13' },
    description:
      'Plans, FSI/FAR, layout, and statutory NOCs are checked before the development permission is sanctioned.',
  },
  {
    id: 'S14',
    code: '14',
    name: 'Construction Commencement & Progress Monitoring',
    order: 18,
    phase: 'D',
    type: 'MONITORING',
    ownerRoleKey: ROLES.PLANNING_OFFICER,
    coOwnerRole: ROLES.INVESTOR,
    slaDays: 90,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'ON_TRACK', label: 'Milestones met — move to compliance', kind: 'pass', tone: 'positive' },
      { value: 'DELAY_NOTICE', label: 'Flag delay — continue monitoring', kind: 'return', to: 'S14', tone: 'warning' },
    ],
    fields: [
      { key: 'commencementDate', label: 'Construction commenced on', type: 'date' },
      { key: 'overallProgressPct', label: 'Overall progress (%)', type: 'percent' },
      { key: 'lastInspection', label: 'Last inspection date', type: 'date' },
      { key: 'delaysNoted', label: 'Delays / deviations noted', type: 'textarea' },
    ],
    docTypes: ['Progress Photograph', 'Other'],
    routing: { onPass: 'NEXT', onReturn: 'S14' },
    description: 'Milestone-by-milestone monitoring of planned versus actual progress.',
  },
  {
    id: 'S15',
    code: '15',
    name: 'Utilisation Compliance & Completion',
    order: 19,
    phase: 'D',
    type: 'COMPLIANCE',
    ownerRoleKey: ROLES.LANDS_OFFICER,
    slaDays: 60,
    maxRounds: 1,
    roundLabels: ['R0'],
    outcomes: [
      { value: 'GOOD_STANDING', label: 'Compliant & complete — close the case', kind: 'pass', tone: 'positive' },
      { value: 'BREACH_NOTICE', label: 'Issue breach notice (cure period)', kind: 'return', to: 'S15', tone: 'warning' },
      { value: 'RESUMPTION', label: 'Resume / cancel the allotment', kind: 'reject', tone: 'danger' },
    ],
    fields: [
      { key: 'commencementDeadline', label: 'Commencement deadline', type: 'date' },
      { key: 'utilisationPct', label: 'Land utilisation (%)', type: 'percent' },
      { key: 'completionCertNo', label: 'Completion certificate number', type: 'text' },
      { key: 'completionDate', label: 'Completion date', type: 'date' },
      {
        key: 'complianceStatus',
        label: 'Compliance status',
        type: 'select',
        options: ['GOOD_STANDING', 'AT_RISK', 'BREACH_NOTICE', 'CURE_PERIOD', 'COMPLETED'],
      },
    ],
    docTypes: ['Utilisation Certificate', 'Completion Certificate', 'Show-Cause Notice'],
    routing: { onPass: 'NEXT', onReturn: 'S15' },
    description:
      'Tracks the commencement deadline, annual utilisation, and completion. A breach opens a cure period and can end in resumption.',
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGE_CATALOGUE.map((s) => [s.id, s]));
