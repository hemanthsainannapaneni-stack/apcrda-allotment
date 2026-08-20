import { ROLES } from '../src/lib/enums';

// ---------------------------------------------------------------------------
// Demo logins — shown on the sign-in screen. Change before production.
// ---------------------------------------------------------------------------

export const USER_SEED = [
  { name: 'K. Ramesh Babu', email: 'admin@apcrda.demo', password: 'Admin@123', roleKey: ROLES.SUPER_ADMIN, designation: 'System Administrator', wing: 'IT & e-Governance', phone: '+91 98480 10001' },
  { name: 'M. Suryanarayana', email: 'lands@apcrda.demo', password: 'Lands@123', roleKey: ROLES.LANDS_OFFICER, designation: 'Deputy Collector (Lands)', wing: 'Lands & Estates', phone: '+91 98480 10002' },
  { name: 'P. Anitha Reddy', email: 'dpr@apcrda.demo', password: 'Dpr@123', roleKey: ROLES.TECHNICAL_REVIEWER, designation: 'Executive Engineer', wing: 'Technical Appraisal', phone: '+91 98480 10003' },
  { name: 'G. Venkat Rao', email: 'ecodev@apcrda.demo', password: 'Eco@123', roleKey: ROLES.ECODEV_REVIEWER, designation: 'Joint Director', wing: 'Economic Development', phone: '+91 98480 10004' },
  { name: 'S. Lakshmi Prasanna', email: 'lasc@apcrda.demo', password: 'Lasc@123', roleKey: ROLES.LASC_MEMBER, designation: 'Member Secretary', committee: 'Land Allotment Scrutiny Committee', phone: '+91 98480 10005' },
  { name: 'Dr. B. Narasimha Rao', email: 'gom@apcrda.demo', password: 'Gom@123', roleKey: ROLES.GOM_MEMBER, designation: 'Convenor', committee: 'Group of Ministers', phone: '+91 98480 10006' },
  { name: 'T. Padmavathi', email: 'subcab@apcrda.demo', password: 'Subcab@123', roleKey: ROLES.CABINET_SUBCOMMITTEE, designation: 'Member', committee: 'Cabinet Sub-Committee', phone: '+91 98480 10007' },
  { name: 'A. Sridhar Reddy, IAS', email: 'authority@apcrda.demo', password: 'Auth@123', roleKey: ROLES.AUTHORITY_APPROVER, designation: 'Commissioner', wing: 'APCRDA Authority', phone: '+91 98480 10008' },
  { name: 'V. Ravi Shankar, IAS', email: 'cabinet@apcrda.demo', password: 'Cabinet@123', roleKey: ROLES.CABINET_APPROVER, designation: 'Principal Secretary (MA&UD)', committee: 'Cabinet', phone: '+91 98480 10009' },
  { name: 'N. Jyothi Kumari', email: 'finance@apcrda.demo', password: 'Finance@123', roleKey: ROLES.FINANCE_OFFICER, designation: 'Chief Accounts Officer', wing: 'Finance & Accounts', phone: '+91 98480 10010' },
  { name: 'R. Kiran Kumar', email: 'planning@apcrda.demo', password: 'Plan@123', roleKey: ROLES.PLANNING_OFFICER, designation: 'Chief Planner', wing: 'Planning & Building Permissions', phone: '+91 98480 10011' },
  { name: 'Rajesh Malhotra', email: 'investor@demo.com', password: 'Investor@123', roleKey: ROLES.INVESTOR, designation: 'Managing Director', phone: '+91 99490 20001' },
  { name: 'Sneha Iyer', email: 'investor2@demo.com', password: 'Investor@123', roleKey: ROLES.INVESTOR, designation: 'Director — Projects', phone: '+91 99490 20002' },
  { name: 'C. Hari Prasad', email: 'viewer@apcrda.demo', password: 'Viewer@123', roleKey: ROLES.VIEWER, designation: 'Audit Officer', wing: 'Internal Audit', phone: '+91 98480 10012' },
];

// ---------------------------------------------------------------------------
// Land inventory
// ---------------------------------------------------------------------------

const cr = (n: number) => n * 10_000_000; // ₹ crore → rupees

export const PLOT_SEED = [
  { code: 'KC-01', name: 'Knowledge City Parcel A', extentAcres: 18.5, surveyRef: 'Sy.No. 214/1, Thullur', gisRef: '16.5183,80.5150', zoneCode: 'KC-R1', themeCity: 'Knowledge City', landUse: 'Institutional', fsi: 3.5, far: 3.5, reservePrice: cr(4.2), objectiveCategory: 'SOCIAL_DEVELOPMENT', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'KC-02', name: 'Knowledge City Parcel B', extentAcres: 32.0, surveyRef: 'Sy.No. 218/3, Thullur', gisRef: '16.5201,80.5188', zoneCode: 'KC-R2', themeCity: 'Knowledge City', landUse: 'Institutional', fsi: 3.0, far: 3.0, reservePrice: cr(3.9), objectiveCategory: 'SOCIAL_DEVELOPMENT', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'EC-01', name: 'Electronics City Block 1', extentAcres: 45.0, surveyRef: 'Sy.No. 96/2, Nelapadu', gisRef: '16.5310,80.4980', zoneCode: 'EC-I1', themeCity: 'Electronics City', landUse: 'Industrial', fsi: 2.5, far: 2.5, reservePrice: cr(3.1), objectiveCategory: 'ECONOMIC_DEVELOPMENT', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'EC-02', name: 'Electronics City Block 2', extentAcres: 12.4, surveyRef: 'Sy.No. 101/1, Nelapadu', gisRef: '16.5322,80.5011', zoneCode: 'EC-I2', themeCity: 'Electronics City', landUse: 'Industrial', fsi: 2.5, far: 2.5, reservePrice: cr(3.4), objectiveCategory: 'ECONOMIC_DEVELOPMENT', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'FC-01', name: 'Financial District Tower Plot 1', extentAcres: 6.8, surveyRef: 'Sy.No. 42/5, Venkatapalem', gisRef: '16.5089,80.5262', zoneCode: 'FC-C1', themeCity: 'Financial City', landUse: 'Commercial', fsi: 6.0, far: 6.0, reservePrice: cr(12.5), objectiveCategory: 'REVENUE_MAXIMISATION', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'FC-02', name: 'Financial District Tower Plot 2', extentAcres: 9.2, surveyRef: 'Sy.No. 44/1, Venkatapalem', gisRef: '16.5095,80.5290', zoneCode: 'FC-C2', themeCity: 'Financial City', landUse: 'Mixed Use', fsi: 5.5, far: 5.5, reservePrice: cr(11.0), objectiveCategory: 'REVENUE_MAXIMISATION', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'HC-01', name: 'Health City Hospital Parcel', extentAcres: 27.5, surveyRef: 'Sy.No. 158/2, Ainavolu', gisRef: '16.5410,80.4890', zoneCode: 'HC-I1', themeCity: 'Health City', landUse: 'Institutional', fsi: 3.0, far: 3.0, reservePrice: cr(2.8), objectiveCategory: 'SOCIAL_DEVELOPMENT', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'SC-01', name: 'Sports City Stadium Parcel', extentAcres: 54.0, surveyRef: 'Sy.No. 305/1, Malkapuram', gisRef: '16.4980,80.5401', zoneCode: 'SC-R1', themeCity: 'Sports City', landUse: 'Recreational', fsi: 1.5, far: 1.5, reservePrice: cr(1.9), objectiveCategory: 'SOCIAL_DEVELOPMENT', landCategory: 'SENSITIVE', availability: 'AVAILABLE', notes: 'Adjoins the Krishna river buffer; irrigation NOC mandatory.' },
  { code: 'MC-01', name: 'Media City Studio Parcel', extentAcres: 15.0, surveyRef: 'Sy.No. 77/4, Rayapudi', gisRef: '16.5150,80.5520', zoneCode: 'MC-C1', themeCity: 'Media City', landUse: 'Commercial', fsi: 4.0, far: 4.0, reservePrice: cr(5.6), objectiveCategory: 'ECONOMIC_DEVELOPMENT', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'JC-01', name: 'Justice City Chambers Parcel', extentAcres: 8.3, surveyRef: 'Sy.No. 11/2, Nekkallu', gisRef: '16.5260,80.5610', zoneCode: 'JC-P1', themeCity: 'Justice City', landUse: 'Public / Semi-Public', fsi: 3.0, far: 3.0, reservePrice: cr(2.2), objectiveCategory: 'INFRASTRUCTURE', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'TC-01', name: 'Tourism City Riverfront Parcel', extentAcres: 22.0, surveyRef: 'Sy.No. 260/1, Undavalli', gisRef: '16.4930,80.5720', zoneCode: 'TC-R1', themeCity: 'Tourism City', landUse: 'Mixed Use', fsi: 2.0, far: 2.0, reservePrice: cr(6.4), objectiveCategory: 'ECONOMIC_DEVELOPMENT', landCategory: 'SENSITIVE', availability: 'AVAILABLE', notes: 'Riverfront parcel; CRZ-equivalent state clearance required.' },
  { code: 'GC-01', name: 'Government City Office Parcel', extentAcres: 11.6, surveyRef: 'Sy.No. 3/1, Velagapudi', gisRef: '16.5145,80.5185', zoneCode: 'GC-P1', themeCity: 'Government City', landUse: 'Public / Semi-Public', fsi: 4.0, far: 4.0, reservePrice: cr(3.0), objectiveCategory: 'INFRASTRUCTURE', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'EC-03', name: 'Electronics City Ancillary Block', extentAcres: 7.4, surveyRef: 'Sy.No. 104/6, Nelapadu', gisRef: '16.5335,80.5040', zoneCode: 'EC-I3', themeCity: 'Electronics City', landUse: 'Industrial', fsi: 2.0, far: 2.0, reservePrice: cr(2.9), objectiveCategory: 'ECONOMIC_DEVELOPMENT', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
  { code: 'KC-03', name: 'Knowledge City Skilling Parcel', extentAcres: 5.2, surveyRef: 'Sy.No. 220/7, Thullur', gisRef: '16.5215,80.5205', zoneCode: 'KC-R3', themeCity: 'Knowledge City', landUse: 'Institutional', fsi: 3.0, far: 3.0, reservePrice: cr(3.6), objectiveCategory: 'SOCIAL_DEVELOPMENT', landCategory: 'NORMAL', availability: 'AVAILABLE', notes: '' },
];

// ---------------------------------------------------------------------------
// Applicants
// ---------------------------------------------------------------------------

export const APPLICANT_SEED = [
  { key: 'vajra', entityType: 'PRIVATE_LIMITED', name: 'Vajra Technologies Pvt Ltd', promoterProfile: 'Promoted by Rajesh Malhotra; 14 years in enterprise software with delivery centres in Hyderabad and Pune.', netWorth: cr(420), pan: 'AABCV1234K', cin: 'U72200AP2011PTC076541', contactEmail: 'investor@demo.com', contactPhone: '+91 99490 20001', address: 'Plot 44, Hitec City, Hyderabad 500081', contactUserEmail: 'investor@demo.com' },
  { key: 'sagara', entityType: 'PUBLIC_LIMITED', name: 'Sagara Infra & Realty Ltd', promoterProfile: 'Listed infrastructure developer; 22 completed commercial projects across South India.', netWorth: cr(1850), pan: 'AAECS8877M', cin: 'L45200AP1998PLC029110', contactEmail: 'investor2@demo.com', contactPhone: '+91 99490 20002', address: 'Sagara Towers, Benz Circle, Vijayawada 520010', contactUserEmail: 'investor2@demo.com' },
  { key: 'nirmaan', entityType: 'LLP', name: 'Nirmaan Health Partners LLP', promoterProfile: 'Consortium of clinicians operating 6 multi-speciality hospitals in Andhra Pradesh.', netWorth: cr(310), pan: 'AAFFN5521Q', cin: 'AAB-7712', contactEmail: 'contact@nirmaanhealth.demo', contactPhone: '+91 99490 20003', address: 'Nirmaan House, Guntur 522002', contactUserEmail: 'investor@demo.com' },
  { key: 'amaravati-edu', entityType: 'TRUST', name: 'Amaravati Education Foundation', promoterProfile: 'Charitable trust running two autonomous colleges and a skilling academy.', netWorth: cr(180), pan: 'AAATA9012R', cin: '', contactEmail: 'office@aef.demo', contactPhone: '+91 99490 20004', address: 'AEF Campus, Mangalagiri 522503' },
  { key: 'bharat-elec', entityType: 'PSU', name: 'Bharat Electronics Systems Ltd', promoterProfile: 'Central public sector undertaking under the Ministry of Defence.', netWorth: cr(9400), pan: 'AAACB2345N', cin: 'L32309KA1954GOI000787', contactEmail: 'amaravati@besl.demo', contactPhone: '+91 99490 20005', address: 'BESL Complex, Bengaluru 560013' },
  { key: 'kaveri-media', entityType: 'PRIVATE_LIMITED', name: 'Kaveri Media Networks Pvt Ltd', promoterProfile: 'Regional broadcaster with three satellite channels and a post-production studio.', netWorth: cr(240), pan: 'AAGCK6633L', cin: 'U92130AP2014PTC095412', contactEmail: 'projects@kaverimedia.demo', contactPhone: '+91 99490 20006', address: 'Kaveri House, Jubilee Hills, Hyderabad 500033', contactUserEmail: 'investor2@demo.com' },
  { key: 'ap-judicial', entityType: 'GOVERNMENT_BODY', name: 'AP Judicial Infrastructure Society', promoterProfile: 'Society constituted by the High Court of Andhra Pradesh for judicial infrastructure.', netWorth: cr(0), pan: 'AAAAA1111A', cin: '', contactEmail: 'apjis@ap.demo', contactPhone: '+91 99490 20007', address: 'High Court Buildings, Amaravati' },
  { key: 'sunrise-sports', entityType: 'PRIVATE_LIMITED', name: 'Sunrise Sports Ventures Pvt Ltd', promoterProfile: 'Sports facility operator running academies in Visakhapatnam and Tirupati.', netWorth: cr(95), pan: 'AAHCS7788P', cin: 'U92419AP2018PTC109887', contactEmail: 'ops@sunrisesports.demo', contactPhone: '+91 99490 20008', address: 'Sunrise Arena, Visakhapatnam 530017' },
  { key: 'krishna-hosp', entityType: 'PRIVATE_LIMITED', name: 'Krishna Hospitality Group Pvt Ltd', promoterProfile: 'Hotel group with 5 properties across the Krishna and Guntur districts.', netWorth: cr(265), pan: 'AAJCK4455T', cin: 'U55101AP2009PTC064221', contactEmail: 'dev@krishnahospitality.demo', contactPhone: '+91 99490 20009', address: 'Krishna Grand, Vijayawada 520008', contactUserEmail: 'investor@demo.com' },
  { key: 'sristi-fin', entityType: 'PUBLIC_LIMITED', name: 'Sristi Financial Services Ltd', promoterProfile: 'NBFC with a pan-India lending book; expanding its back-office to Amaravati.', netWorth: cr(3100), pan: 'AACCS3344J', cin: 'L65923AP2004PLC044552', contactEmail: 'realestate@sristifin.demo', contactPhone: '+91 99490 20010', address: 'Sristi Centre, Chennai 600002' },
  { key: 'global-skills', entityType: 'FOREIGN_ENTITY', name: 'Global Skills Alliance (India JV)', promoterProfile: 'Joint venture between a Singapore skilling group and an Indian training operator.', netWorth: cr(520), pan: 'AAKCG9900W', cin: 'U80903AP2021FTC118776', contactEmail: 'india@globalskills.demo', contactPhone: '+91 99490 20011', address: 'Level 12, Trade Tower, Gurugram 122002' },
  { key: 'deccan-log', entityType: 'PARTNERSHIP', name: 'Deccan Logistics & Warehousing', promoterProfile: 'Family-run logistics firm operating 1.2 million sq ft of warehousing.', netWorth: cr(78), pan: 'AAJFD1122H', cin: '', contactEmail: 'admin@deccanlog.demo', contactPhone: '+91 99490 20012', address: 'Deccan Yard, Guntur 522004' },
];

// ---------------------------------------------------------------------------
// Case specs — the walker in seed.ts drives each one to `stopAt`
// ---------------------------------------------------------------------------

export type CaseSpec = {
  title: string;
  applicantKey: string;
  plotCode?: string;
  year: number;
  mode: string;
  objectiveCategory: string;
  sector: string;
  investmentAmount: number;
  jobsCommitted: number;
  extentAcres?: number;
  holdingType: string;
  isConcessional?: boolean;
  startedDaysAgo: number;
  /** Stage the case currently rests on. */
  stopAt: string;
  /** Extra return/defer rounds before the pass, keyed by stage id. */
  rounds?: Record<string, number>;
  terminal?: 'REJECTED' | 'LAPSED' | 'CANCELLED' | 'RESUMED' | 'COMPLETED';
  overdue?: boolean;
  overdueBy?: number;
  overduePayment?: boolean;
  overdueInstalment?: number;
  plotStatus?: string;
  invitationRef?: string;
  agreementDaysAgo?: number;
  scheduleStartDaysAgo?: number;
  progressPct?: number;
  utilisationPct?: number;
  complianceStatus?: string;
  commenced?: boolean;
  commencementInDays?: number;
  delayed?: boolean;
  partialData?: Record<string, Record<string, any>>;
  grievances?: any[];
  cancellation?: any;
  comments?: any[];
};

export const CASE_SPECS: CaseSpec[] = [
  // --- Phase A ---
  {
    title: 'IT development centre — Knowledge City Parcel A',
    applicantKey: 'vajra', plotCode: 'KC-01', year: 2026,
    mode: 'QUALITY_CUM_PRICE', objectiveCategory: 'ECONOMIC_DEVELOPMENT', sector: 'Information Technology',
    investmentAmount: cr(680), jobsCommitted: 4200, holdingType: 'LEASEHOLD',
    startedDaysAgo: 22, stopAt: 'S1', plotStatus: 'RESERVED',
    invitationRef: 'APCRDA/ID/2024/01',
    comments: [{ authorEmail: 'investor@demo.com', body: 'Audited financials for FY 2024-25 will be uploaded once the statutory audit closes next week.', visibility: 'INVESTOR', daysAgo: 6 }],
  },
  {
    title: 'Regional broadcast & post-production campus — Media City',
    applicantKey: 'kaveri-media', plotCode: 'MC-01', year: 2026,
    mode: 'PUBLIC_AUCTION', objectiveCategory: 'ECONOMIC_DEVELOPMENT', sector: 'Media & Entertainment',
    investmentAmount: cr(310), jobsCommitted: 900, holdingType: 'FREEHOLD',
    startedDaysAgo: 41, stopAt: 'S1A', plotStatus: 'RESERVED',
    invitationRef: 'APCRDA/ID/2025/01',
  },

  // --- Phase B ---
  {
    title: 'Electronics manufacturing cluster — Block 1',
    applicantKey: 'bharat-elec', plotCode: 'EC-01', year: 2026,
    mode: 'NOMINATION', objectiveCategory: 'ECONOMIC_DEVELOPMENT', sector: 'Electronics Manufacturing',
    investmentAmount: cr(1450), jobsCommitted: 6800, holdingType: 'LEASEHOLD', isConcessional: true,
    startedDaysAgo: 96, stopAt: 'S2',
    invitationRef: 'APCRDA/ID/2024/01',
  },
  {
    title: 'Warehousing & cold-chain hub — Electronics City Ancillary',
    applicantKey: 'deccan-log', plotCode: 'EC-03', year: 2026,
    mode: 'PUBLIC_TENDER', objectiveCategory: 'INFRASTRUCTURE', sector: 'Logistics & Warehousing',
    investmentAmount: cr(120), jobsCommitted: 380, holdingType: 'LEASEHOLD',
    startedDaysAgo: 130, stopAt: 'S2', rounds: { S2: 1 }, overdue: true, overdueBy: 12,
    comments: [{ authorEmail: 'dpr@apcrda.demo', body: 'Second round pending with the applicant for over two weeks — escalate at the next review meeting.', visibility: 'INTERNAL', daysAgo: 4 }],
  },
  {
    title: 'Skilling academy & incubation centre — Knowledge City',
    applicantKey: 'global-skills', plotCode: 'KC-03', year: 2026,
    mode: 'QUALITY_BASED', objectiveCategory: 'SOCIAL_DEVELOPMENT', sector: 'Education & Skilling',
    investmentAmount: cr(210), jobsCommitted: 640, holdingType: 'LEASEHOLD',
    startedDaysAgo: 118, stopAt: 'S3',
  },
  {
    title: 'Multi-speciality hospital — Health City',
    applicantKey: 'nirmaan', plotCode: 'HC-01', year: 2026,
    mode: 'QUALITY_BASED', objectiveCategory: 'SOCIAL_DEVELOPMENT', sector: 'Healthcare & Life Sciences',
    investmentAmount: cr(540), jobsCommitted: 1900, holdingType: 'LEASEHOLD',
    startedDaysAgo: 176, stopAt: 'S4', rounds: { S4: 2 },
    invitationRef: 'APCRDA/ID/2024/02',
    comments: [{ authorEmail: 'lasc@apcrda.demo', body: 'Third round listed. Title chain from 1994 onward now on record; encumbrance certificate verified.', visibility: 'INTERNAL', daysAgo: 9 }],
  },
  {
    title: 'Integrated sports complex & academy — Sports City',
    applicantKey: 'sunrise-sports', plotCode: 'SC-01', year: 2025,
    mode: 'NOMINATION', objectiveCategory: 'SOCIAL_DEVELOPMENT', sector: 'Sports & Recreation',
    investmentAmount: cr(390), jobsCommitted: 720, holdingType: 'LEASEHOLD', isConcessional: true,
    startedDaysAgo: 212, stopAt: 'S5', rounds: { S5: 1 },
    invitationRef: 'APCRDA/ID/2024/02',
  },
  {
    title: 'Judicial chambers & records complex — Justice City',
    applicantKey: 'ap-judicial', plotCode: 'JC-01', year: 2025,
    mode: 'NOMINATION', objectiveCategory: 'INFRASTRUCTURE', sector: 'Legal & Judiciary',
    investmentAmount: cr(160), jobsCommitted: 240, holdingType: 'LEASEHOLD', isConcessional: true,
    startedDaysAgo: 238, stopAt: 'S5A',
  },
  {
    title: 'Financial services back-office tower — Financial District',
    applicantKey: 'sristi-fin', plotCode: 'FC-01', year: 2025,
    mode: 'PUBLIC_AUCTION', objectiveCategory: 'REVENUE_MAXIMISATION', sector: 'Financial Services',
    investmentAmount: cr(890), jobsCommitted: 3100, holdingType: 'FREEHOLD',
    startedDaysAgo: 254, stopAt: 'S6',
    invitationRef: 'APCRDA/ID/2025/01',
  },
  {
    title: 'Riverfront convention & hospitality district — Tourism City',
    applicantKey: 'krishna-hosp', plotCode: 'TC-01', year: 2025,
    mode: 'QUALITY_CUM_PRICE', objectiveCategory: 'ECONOMIC_DEVELOPMENT', sector: 'Tourism & Hospitality',
    investmentAmount: cr(720), jobsCommitted: 1600, holdingType: 'LEASEHOLD',
    startedDaysAgo: 286, stopAt: 'S7',
    comments: [{ authorEmail: 'authority@apcrda.demo', body: 'Cabinet-approval test triggered on two counts: extent below threshold but the parcel is categorised sensitive (riverfront).', visibility: 'INTERNAL', daysAgo: 14 }],
  },
  {
    title: 'Higher education campus — Knowledge City Parcel B',
    applicantKey: 'amaravati-edu', plotCode: 'KC-02', year: 2025,
    mode: 'QUALITY_BASED', objectiveCategory: 'SOCIAL_DEVELOPMENT', sector: 'Education & Skilling',
    investmentAmount: cr(430), jobsCommitted: 850, holdingType: 'LEASEHOLD',
    startedDaysAgo: 262, stopAt: 'S4', terminal: 'REJECTED',
    plotStatus: 'AVAILABLE',
    grievances: [{
      code: 'GRV/2026/0001', subject: 'Appeal against LASC rejection of the Knowledge City campus proposal',
      description: 'The committee rejected the proposal citing an incomplete title chain. The missing link deed was filed with the Lands section on 12 March and is on record. We request a re-hearing on the strength of that document.',
      category: 'DECISION_APPEAL', status: 'UNDER_REVIEW', raisedByEmail: 'admin@apcrda.demo',
      assigneeEmail: 'lands@apcrda.demo', raisedDaysAgo: 18, slaInDays: 3,
    }],
  },

  // --- Phase C ---
  {
    title: 'Data centre & cloud campus — Electronics City Block 2',
    applicantKey: 'vajra', plotCode: 'EC-02', year: 2025,
    mode: 'QUALITY_CUM_PRICE', objectiveCategory: 'ECONOMIC_DEVELOPMENT', sector: 'Information Technology',
    investmentAmount: cr(560), jobsCommitted: 1100, holdingType: 'LEASEHOLD',
    startedDaysAgo: 318, stopAt: 'S9',
    partialData: { S9: { loiNumber: 'LOI/0012', validityDays: 90, acceptedOn: '', acceptanceRef: '' } },
    comments: [{ authorEmail: 'lands@apcrda.demo', body: 'LOI issued; acceptance and the first payment are awaited. The validity window closes shortly.', visibility: 'INVESTOR', daysAgo: 3 }],
  },
  {
    title: 'Mixed-use commercial tower — Financial District Plot 2',
    applicantKey: 'sagara', plotCode: 'FC-02', year: 2025,
    mode: 'PUBLIC_AUCTION', objectiveCategory: 'REVENUE_MAXIMISATION', sector: 'Financial Services',
    investmentAmount: cr(1120), jobsCommitted: 2400, holdingType: 'FREEHOLD',
    startedDaysAgo: 344, stopAt: 'S9', terminal: 'LAPSED', plotStatus: 'AVAILABLE',
    comments: [{ authorEmail: 'lands@apcrda.demo', body: 'LOI validity expired without acceptance. Case flagged Lapsed; EMD forfeiture placed before the Authority.', visibility: 'INTERNAL', daysAgo: 7 }],
  },
  {
    title: 'Corporate headquarters & training centre — Government City',
    applicantKey: 'sristi-fin', plotCode: 'GC-01', year: 2025,
    mode: 'PUBLIC_TENDER', objectiveCategory: 'INFRASTRUCTURE', sector: 'Public Administration',
    investmentAmount: cr(340), jobsCommitted: 620, holdingType: 'LEASEHOLD',
    startedDaysAgo: 372, stopAt: 'S10', overduePayment: true, overdueInstalment: 1,
    scheduleStartDaysAgo: 150,
    comments: [{ authorEmail: 'finance@apcrda.demo', body: 'Instalment 2 is 70 days overdue. Penalty accruing at 12% p.a.; notice issued to the allottee.', visibility: 'INVESTOR', daysAgo: 5 }],
  },
  {
    title: 'Specialty oncology block — Health City (Phase II)',
    applicantKey: 'nirmaan', plotCode: 'KC-03', year: 2025,
    mode: 'QUALITY_BASED', objectiveCategory: 'SOCIAL_DEVELOPMENT', sector: 'Healthcare & Life Sciences',
    investmentAmount: cr(295), jobsCommitted: 780, holdingType: 'LEASEHOLD',
    startedDaysAgo: 398, stopAt: 'S11', scheduleStartDaysAgo: 190,
  },
  {
    title: 'Broadcast tower & uplink facility — Media City (Phase II)',
    applicantKey: 'kaveri-media', plotCode: 'MC-01', year: 2024,
    mode: 'QUALITY_CUM_PRICE', objectiveCategory: 'ECONOMIC_DEVELOPMENT', sector: 'Media & Entertainment',
    investmentAmount: cr(185), jobsCommitted: 410, holdingType: 'LEASEHOLD',
    startedDaysAgo: 430, stopAt: 'S12', scheduleStartDaysAgo: 210, agreementDaysAgo: 60,
  },
  {
    title: 'Logistics park & container yard — Electronics City',
    applicantKey: 'deccan-log', plotCode: 'EC-03', year: 2024,
    mode: 'PUBLIC_TENDER', objectiveCategory: 'INFRASTRUCTURE', sector: 'Logistics & Warehousing',
    investmentAmount: cr(150), jobsCommitted: 460, holdingType: 'LEASEHOLD',
    startedDaysAgo: 452, stopAt: 'S12A', scheduleStartDaysAgo: 230, agreementDaysAgo: 95,
    cancellation: {
      code: 'CNL/2026/0001', type: 'WITHDRAWAL', side: 'INVESTOR', status: 'APPROVED',
      initiatedByEmail: 'investor@demo.com', approvedByEmail: 'authority@apcrda.demo',
      reason: 'The promoters have decided not to proceed following a change in the group\'s capital allocation for the Amaravati region.',
      decisionNote: 'Withdrawal accepted. 10% of consideration paid is forfeited under the standing policy; the balance is refunded.',
      refundAmount: 0, forfeitAmount: 0, raisedDaysAgo: 34,
    },
    terminal: 'CANCELLED', plotStatus: 'AVAILABLE',
  },

  // --- Phase D ---
  {
    title: 'IT SEZ campus — Knowledge City Parcel A (Phase II)',
    applicantKey: 'vajra', plotCode: 'KC-01', year: 2024,
    mode: 'QUALITY_CUM_PRICE', objectiveCategory: 'ECONOMIC_DEVELOPMENT', sector: 'Information Technology',
    investmentAmount: cr(760), jobsCommitted: 5200, holdingType: 'LEASEHOLD',
    startedDaysAgo: 486, stopAt: 'S13', scheduleStartDaysAgo: 250, agreementDaysAgo: 140,
    progressPct: 0,
  },
  {
    title: 'Hospitality & convention centre — Tourism City (Phase I)',
    applicantKey: 'krishna-hosp', plotCode: 'TC-01', year: 2024,
    mode: 'QUALITY_CUM_PRICE', objectiveCategory: 'ECONOMIC_DEVELOPMENT', sector: 'Tourism & Hospitality',
    investmentAmount: cr(620), jobsCommitted: 1400, holdingType: 'LEASEHOLD',
    startedDaysAgo: 512, stopAt: 'S14', scheduleStartDaysAgo: 270, agreementDaysAgo: 180,
    progressPct: 48, commencementInDays: 210,
    grievances: [
      {
        code: 'GRV/2026/0002', subject: 'Delay in issue of the airport height-clearance NOC',
        description: 'Our application for height clearance has been pending with the nodal officer for 74 days. The delay is holding up the structural works on the tower block and will breach our milestone plan.',
        category: 'PROCESS_DELAY', status: 'UNDER_REVIEW', raisedByEmail: 'investor@demo.com',
        assigneeEmail: 'planning@apcrda.demo', raisedDaysAgo: 26, slaInDays: 2,
      },
      {
        code: 'GRV/2026/0003', subject: 'Recalculation of penalty on instalment 3',
        description: 'Penalty appears to have been computed from the original due date rather than the revised date allowed by Finance.',
        category: 'PAYMENT_DISPUTE', status: 'RESOLVED', raisedByEmail: 'investor@demo.com',
        assigneeEmail: 'finance@apcrda.demo', raisedDaysAgo: 62, slaInDays: -20,
        resolution: 'Verified against the revised schedule approved on 14 January. Penalty recomputed and reduced by ₹4,18,000; credit note issued.',
      },
    ],
    comments: [{ authorEmail: 'planning@apcrda.demo', body: 'Site inspected on the 14th. Structure Phase I at 48% against a planned 55%; contractor has been asked to file a recovery schedule.', visibility: 'INTERNAL', daysAgo: 11 }],
  },
  {
    title: 'Stadium & training academy — Sports City (Phase I)',
    applicantKey: 'sunrise-sports', plotCode: 'SC-01', year: 2024,
    mode: 'NOMINATION', objectiveCategory: 'SOCIAL_DEVELOPMENT', sector: 'Sports & Recreation',
    investmentAmount: cr(410), jobsCommitted: 690, holdingType: 'LEASEHOLD', isConcessional: true,
    startedDaysAgo: 548, stopAt: 'S15', scheduleStartDaysAgo: 300, agreementDaysAgo: 400,
    progressPct: 12, commenced: false, delayed: true,
    complianceStatus: 'BREACH_NOTICE', commencementInDays: -40, utilisationPct: 8,
    cancellation: {
      code: 'CNL/2026/0002', type: 'RESUMPTION', side: 'APCRDA', status: 'PENDING',
      initiatedByEmail: 'lands@apcrda.demo',
      reason: 'Construction has not commenced within 24 months of the agreement. A show-cause notice was issued and the cure period is running; resumption is placed before the Authority for orders.',
      refundAmount: 0, forfeitAmount: 0, raisedDaysAgo: 12,
    },
    comments: [{ authorEmail: 'lands@apcrda.demo', body: 'Show-cause notice served on 26th. Allottee has sought an extension citing a pending irrigation NOC — being verified.', visibility: 'INTERNAL', daysAgo: 8 }],
  },
  {
    title: 'Enterprise campus — Electronics City Block 1 (completed)',
    applicantKey: 'sagara', plotCode: 'EC-01', year: 2024,
    mode: 'PUBLIC_TENDER', objectiveCategory: 'ECONOMIC_DEVELOPMENT', sector: 'Electronics Manufacturing',
    investmentAmount: cr(980), jobsCommitted: 3400, holdingType: 'LEASEHOLD',
    startedDaysAgo: 574, stopAt: 'S15', terminal: 'COMPLETED',
    scheduleStartDaysAgo: 320, agreementDaysAgo: 430,
    progressPct: 100, utilisationPct: 96, complianceStatus: 'COMPLETED',
    comments: [{ authorEmail: 'lands@apcrda.demo', body: 'Completion certificate and the annual utilisation certificate are on record. Case closed in good standing.', visibility: 'INVESTOR', daysAgo: 15 }],
  },
];
