/**
 * Plain English layer.
 *
 * The domain is full of acronyms and official terms (LASC, GoM, DPR, LOI, EMD,
 * FSI). Those stay on the record because that is what the file must say — but
 * every screen also shows a short, ordinary-language version so a first-time
 * user understands what is happening without a manual.
 */

// ---------------------------------------------------------------------------
// Glossary — surfaced as tooltips via <Term>
// ---------------------------------------------------------------------------

export const GLOSSARY: Record<string, string> = {
  APCRDA: 'Andhra Pradesh Capital Region Development Authority — the body that allots the land.',
  DPR: 'Detailed Project Report — the full plan of what the investor intends to build.',
  LASC: 'Land Allotment Scrutiny Committee — the committee that examines the proposal and checks the site and title.',
  GoM: 'Group of Ministers — the ministerial group that clears the allotment.',
  LOI: 'Letter of Intent — the formal offer of the plot. The investor must accept it within a time limit.',
  GO: 'Government Order — the official order sanctioning the allotment.',
  EMD: 'Earnest Money Deposit — a refundable deposit paid with the application to show the applicant is serious.',
  FSI: 'Floor Space Index — how much floor area may be built relative to the plot size.',
  FAR: 'Floor Area Ratio — same idea as FSI; used interchangeably here.',
  NOC: 'No Objection Certificate — a clearance from another department (fire, environment, airport, and so on).',
  SLA: 'Service Level Agreement — the number of days this step is supposed to take.',
  Leasehold: 'The land is leased for a fixed term (usually 99 years). Ownership stays with the government.',
  Freehold: 'The land is sold outright and ownership transfers to the buyer.',
  Concessional: 'The land is being given at below the normal price, so extra approvals are required.',
  Nomination: 'The plot is allotted directly to a chosen party rather than through a tender or auction.',
  Resumption: 'The government takes the land back because the allottee broke the terms.',
  Forfeiture: 'Money already paid that is kept by the government rather than refunded.',
};

/** Words we auto-link to the glossary when they appear in a label. */
export const GLOSSARY_KEYS = Object.keys(GLOSSARY);

// ---------------------------------------------------------------------------
// Stages in plain words
// ---------------------------------------------------------------------------

export type PlainStage = {
  /** A short, ordinary-language name for the step. */
  short: string;
  /** One sentence: what is actually happening at this step. */
  what: string;
  /** What the person who owns this step has to do. */
  todo: string;
  /**
   * Some steps are shared — the investor supplies something and an officer
   * decides on it. This is the *other* party's job, not the owner's.
   */
  partnerTodo?: string;
};

export const PLAIN_STAGES: Record<string, PlainStage> = {
  S0: {
    short: 'Land put on offer',
    what: 'APCRDA lists the plot and publishes the notice that opens it up for applications.',
    todo: 'Publish the plot and its terms.',
  },
  S1: {
    short: 'Investor applies',
    what: 'The investor fills in the application, pays the fee and deposit, and uploads their company papers.',
    todo: 'Complete the application and upload the supporting documents.',
  },
  S1A: {
    short: 'Is the applicant eligible?',
    what: 'APCRDA checks that the applicant qualifies and confirms how the plot will be allotted.',
    todo: 'Verify the papers and deposit, then confirm eligibility or reject.',
  },
  S2: {
    short: 'Project plan reviewed',
    what: 'Engineers examine the detailed project report — what will be built, at what cost, and over how long.',
    todo: 'Read the project report and accept it, send it back for changes, or reject it.',
    partnerTodo: 'Submit your project report and answer any questions the reviewers raise.',
  },
  S3: {
    short: 'Economic benefit checked',
    what: 'The investment amount, the jobs promised, and how well the project fits the area are assessed.',
    todo: 'Record the assessment and give a positive or negative opinion.',
  },
  S4: {
    short: 'Committee scrutiny',
    what: 'A committee examines the whole proposal and confirms the land itself is clean — site visited, ownership verified.',
    todo: 'Hold the meeting, record the findings, and recommend or seek more information.',
  },
  S5: {
    short: 'Ministers clear it',
    what: 'A group of ministers takes the political decision on whether the allotment goes ahead.',
    todo: 'Record the meeting decision — clear it, or hold it over to the next sitting.',
  },
  S5A: {
    short: 'Sub-committee opinion',
    what: 'An extra review that applies only when the land is being given below the normal price or by direct nomination.',
    todo: 'Record the sub-committee’s recommendation.',
  },
  S6: {
    short: 'Authority approves',
    what: 'The APCRDA Authority formally approves the allotment and its terms.',
    todo: 'Record the resolution number and approve, return, or reject.',
  },
  S6A: {
    short: 'Does Cabinet need to see it?',
    what: 'An automatic check. Large plots, discounted land, and sensitive sites must go to Cabinet; everything else skips straight ahead.',
    todo: 'Run the check — the system decides where the case goes next.',
  },
  S7: {
    short: 'Cabinet approves',
    what: 'The state Cabinet approves the allotment. Only some cases reach this step.',
    todo: 'Record the Cabinet decision.',
  },
  S8: {
    short: 'Government Order issued',
    what: 'The official order is issued, fixing the exact area, the land use, and whether it is leased or sold.',
    todo: 'Enter the order number and date, and confirm the land details.',
  },
  S9: {
    short: 'Offer letter',
    what: 'The formal offer goes to the investor. They have a limited time to accept it — if they miss it, the offer lapses.',
    todo: 'Issue the offer, then record the investor’s acceptance.',
    partnerTodo: 'Accept the offer in writing before the deadline, or it expires.',
  },
  S10: {
    short: 'Payment',
    what: 'The price is split into a down payment and instalments. Late payments attract interest.',
    todo: 'Set up the schedule and confirm the money has come in.',
    partnerTodo: 'Pay each instalment on time and record the transaction reference.',
  },
  S11: {
    short: 'Final plan agreed',
    what: 'The project plan is updated to its final version before the agreement is signed.',
    todo: 'Check the final plan and accept it, or send it back.',
    partnerTodo: 'Submit the final version of your project plan.',
  },
  S12: {
    short: 'Agreement signed',
    what: 'The lease or sale agreement is executed and registered with the Sub-Registrar. The clock for starting construction begins here.',
    todo: 'Record the agreement and registration details.',
    partnerTodo: 'Sign the agreement and complete the registration.',
  },
  S12A: {
    short: 'Land handed over',
    what: 'The plot is physically handed to the investor after the boundaries are marked out on site.',
    todo: 'Confirm the handover date and that boundaries were marked.',
  },
  S13: {
    short: 'Building permission',
    what: 'The building plans are checked and all department clearances collected before construction can start.',
    todo: 'Check the plans and clearances, then sanction the permission.',
  },
  S14: {
    short: 'Construction watched',
    what: 'Progress is tracked against the agreed milestones — what was promised by when, versus what is actually built.',
    todo: 'Record site progress and flag any delays.',
    partnerTodo: 'Report site progress against the milestones you agreed to.',
  },
  S15: {
    short: 'Final check & closure',
    what: 'The last check: did construction start on time and is the land being used as promised? If not, it can be taken back.',
    todo: 'Confirm the land is properly used and close the case, or start action for breach.',
  },
};

export function plainStage(stageId?: string | null): PlainStage {
  return (
    PLAIN_STAGES[stageId ?? ''] ?? {
      short: 'This step',
      what: 'This step is part of the allotment process.',
      todo: 'Review the details and record a decision.',
    }
  );
}

// ---------------------------------------------------------------------------
// Statuses in plain words
// ---------------------------------------------------------------------------

export const PLAIN_STATUS: Record<string, { label: string; help: string }> = {
  DRAFT: { label: 'Not submitted', help: 'Started but not yet sent forward.' },
  IN_PROGRESS: { label: 'In progress', help: 'Moving through the approval steps.' },
  ON_HOLD: { label: 'On hold', help: 'Paused while a withdrawal or cancellation request is decided.' },
  REJECTED: { label: 'Turned down', help: 'The application was refused. It can be appealed.' },
  LAPSED: { label: 'Offer expired', help: 'The investor did not accept the offer in time.' },
  CANCELLED: { label: 'Cancelled', help: 'The allotment was called off.' },
  RESUMED: { label: 'Land taken back', help: 'The land was taken back because the terms were broken.' },
  COMPLETED: { label: 'Finished', help: 'Built and in use as promised. Nothing further to do.' },

  PENDING: { label: 'Not paid yet', help: 'Due but not yet received.' },
  PAID: { label: 'Paid', help: 'Money received and matched to a receipt.' },
  OVERDUE: { label: 'Late', help: 'Past its due date. Interest is being added.' },
  WAIVED: { label: 'Waived', help: 'No longer payable.' },
  REFUNDED: { label: 'Refunded', help: 'Returned to the payer.' },
  FORFEITED: { label: 'Kept by APCRDA', help: 'Not refunded, under the terms of the allotment.' },

  OPEN: { label: 'New', help: 'Raised but not yet picked up.' },
  UNDER_REVIEW: { label: 'Being looked at', help: 'Someone is working on it.' },
  RESOLVED: { label: 'Sorted out', help: 'Closed with an answer.' },

  GOOD_STANDING: { label: 'All in order', help: 'Meeting every condition of the allotment.' },
  AT_RISK: { label: 'Deadline approaching', help: 'A deadline is coming up soon.' },
  BREACH_NOTICE: { label: 'Notice issued', help: 'A deadline was missed and a formal notice has been sent.' },
  CURE_PERIOD: { label: 'Time to fix it', help: 'A grace period is running to put things right.' },

  NOT_STARTED: { label: 'Not started', help: '' },
  SUBMITTED: { label: 'Submitted', help: 'Handed in and waiting to be looked at.' },
  UNDER_SCRUTINY: { label: 'Being checked', help: '' },
  SANCTIONED: { label: 'Approved', help: 'Permission granted.' },
  CLEARED: { label: 'Cleared', help: '' },
  NOT_APPLICABLE: { label: 'Not needed', help: '' },
  PLANNED: { label: 'Planned', help: 'Scheduled but not started.' },
  DELAYED: { label: 'Behind schedule', help: '' },
  ACTIVE: { label: 'Happening now', help: '' },
  SUSPENDED: { label: 'Blocked', help: 'This account cannot sign in.' },
  APPROVED: { label: 'Approved', help: '' },
};

export function plainStatus(status?: string | null) {
  if (!status) return { label: '—', help: '' };
  return (
    PLAIN_STATUS[status] ?? {
      label: status
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase()),
      help: '',
    }
  );
}

// ---------------------------------------------------------------------------
// People, in words rather than role codes
// ---------------------------------------------------------------------------

export const PLAIN_ROLE: Record<string, string> = {
  SUPER_ADMIN: 'the system administrator',
  LANDS_OFFICER: 'the Lands Officer',
  TECHNICAL_REVIEWER: 'the engineering reviewer',
  ECODEV_REVIEWER: 'the economic development reviewer',
  LASC_MEMBER: 'the scrutiny committee',
  GOM_MEMBER: 'the Group of Ministers',
  CABINET_SUBCOMMITTEE: 'the Cabinet sub-committee',
  AUTHORITY_APPROVER: 'the APCRDA Authority',
  CABINET_APPROVER: 'the Cabinet',
  FINANCE_OFFICER: 'the Finance Officer',
  PLANNING_OFFICER: 'the Planning Officer',
  INVESTOR: 'the investor',
  VIEWER: 'the auditor',
};

export const plainRole = (key?: string | null) => PLAIN_ROLE[key ?? ''] ?? 'the assigned officer';

// ---------------------------------------------------------------------------
// Gate actions in plain words
// ---------------------------------------------------------------------------

/** A one-line explanation of what pressing this button will actually do. */
export function plainOutcome(kind: string, stageName: string) {
  switch (kind) {
    case 'pass':
      return 'Moves the case on to the next step.';
    case 'return':
      return 'Sends it back for changes. A fresh attempt at this step opens.';
    case 'defer':
      return 'Holds it over to the next meeting. Nothing is lost.';
    case 'reject':
      return 'Refuses the application and closes the case. This cannot be undone here.';
    case 'lapse':
      return 'Marks the offer expired and closes the case.';
    default:
      return `Records a decision at ${stageName}.`;
  }
}

/**
 * The gate buttons are the most important control in the app, so they get
 * ordinary wording. The official outcome label stays on the record and is shown
 * underneath in the confirmation dialog.
 */
const PLAIN_OUTCOME_LABELS: Record<string, string> = {
  'S1A:ELIGIBLE': 'Eligible — send for review',
  'S1A:INELIGIBLE': 'Not eligible — reject',
  'S2:ACCEPT': 'Accept the project plan',
  'S2:RETURN': 'Send back for changes',
  'S2:REJECT': 'Reject the project plan',
  'S3:POSITIVE': 'Good for the economy — send on',
  'S3:RETURN': 'Send back to the engineers',
  'S4:RECOMMEND': 'Recommend it to the ministers',
  'S4:CLARIFY': 'Ask for more information',
  'S5:CLEAR': 'Ministers approve it',
  'S5:DEFER': 'Hold it over to the next meeting',
  'S5A:RECOMMEND': 'Recommend it to the Authority',
  'S5A:RETURN': 'Send back to the ministers',
  'S6:APPROVED': 'Authority approves it',
  'S6:RETURN': 'Send back to the committee',
  'S6A:EVALUATE': 'Check whether Cabinet is needed',
  'S7:APPROVED': 'Cabinet approves it',
  'S7:RETURN': 'Send back to the Authority',
  'S8:ISSUED': 'Order issued — make the offer',
  'S9:ACCEPTED': 'Investor has accepted the offer',
  'S9:LAPSED': 'Offer expired — close the case',
  'S10:CURRENT': 'Payments are up to date',
  'S10:DEFAULT': 'Not paying — refer for cancellation',
  'S11:ACCEPTED': 'Accept the final plan',
  'S11:RETURN': 'Send back for changes',
  'S12:REGISTERED': 'Agreement signed and registered',
  'S12A:HANDED_OVER': 'Land handed over',
  'S13:SANCTIONED': 'Approve the building plans',
  'S13:RETURN': 'Send back for corrections',
  'S13:REJECT': 'Reject the building plans',
  'S14:ON_TRACK': 'Building on track — do final check',
  'S14:DELAY_NOTICE': 'Flag a delay and keep watching',
  'S15:GOOD_STANDING': 'All in order — close the case',
  'S15:BREACH_NOTICE': 'Send a warning notice',
  'S15:RESUMPTION': 'Take the land back',
};

export function plainOutcomeLabel(stageId: string, value: string, fallback: string) {
  return PLAIN_OUTCOME_LABELS[`${stageId}:${value}`] ?? fallback;
}

/** "Attempt 2 of 3" reads better than "R1" for anyone new to the process. */
export function plainRound(round: number, maxRounds: number) {
  if (maxRounds <= 1) return null;
  return `Attempt ${round + 1} of ${maxRounds}`;
}

/** Phase names people can hold in their head. */
export const PLAIN_PHASE: Record<string, { name: string; blurb: string }> = {
  A: { name: 'Applying', blurb: 'The plot is offered and someone applies for it.' },
  B: { name: 'Getting approved', blurb: 'Reviewers, committees and ministers decide whether to allot it.' },
  C: { name: 'Making it official', blurb: 'The order, the offer, the money, the agreement, and the handover.' },
  D: { name: 'Building & checking', blurb: 'Permission to build, construction progress, and the final check.' },
};
