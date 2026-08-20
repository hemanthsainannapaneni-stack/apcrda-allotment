import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest } from '../lib/http';
import { audit } from '../lib/audit';
import { getSettings } from '../lib/settings';
import { CAPABILITIES, TERMINAL_STATUSES } from '../lib/enums';
import { caseScope, requireCapability } from '../middleware/auth';
import { loadStages } from '../workflow/engine';

export const reportsRouter = Router();

type Column = { key: string; label: string; align?: 'left' | 'right'; width?: number };
type Report = {
  id: string;
  title: string;
  description: string;
  columns: Column[];
  rows: Record<string, any>[];
  summary: { label: string; value: string }[];
};

const REPORT_IDS = [
  'case-pipeline',
  'stage-aging',
  'approvals-log',
  'financial-dues',
  'at-risk-allotments',
  'grievance-summary',
  'allotment-profile',
] as const;

reportsRouter.get(
  '/',
  requireCapability(CAPABILITIES.REPORTS_VIEW),
  asyncHandler(async (_req, res) => {
    res.json([
      { id: 'case-pipeline', title: 'Case Pipeline', description: 'Every case with its current stage, owner, age, and SLA position.' },
      { id: 'stage-aging', title: 'Stage Aging & Bottlenecks', description: 'Average and worst time-in-stage for cases currently sitting at each stage.' },
      { id: 'approvals-log', title: 'Approvals Log', description: 'Every gate decision recorded, with actor, outcome, and remarks.' },
      { id: 'financial-dues', title: 'Financial Dues', description: 'Outstanding and overdue payment lines with accrued penalty.' },
      { id: 'at-risk-allotments', title: 'Dormant / At-Risk Allotments', description: 'Commencement overdue, breach notices, lapsed LOIs, and cure periods running.' },
      { id: 'grievance-summary', title: 'Grievance Summary', description: 'Grievance register with status, assignee, and SLA position.' },
      { id: 'allotment-profile', title: 'Allotments by Objective / Sector / Mode', description: 'Distribution of allotments and committed investment.' },
    ]);
  })
);

reportsRouter.get(
  '/:id',
  requireCapability(CAPABILITIES.REPORTS_VIEW),
  asyncHandler(async (req, res) => {
    const id = req.params.id as (typeof REPORT_IDS)[number];
    if (!REPORT_IDS.includes(id)) throw badRequest(`Unknown report "${id}".`);

    const filters = {
      from: req.query.from ? new Date(String(req.query.from)) : null,
      to: req.query.to ? new Date(String(req.query.to)) : null,
      phase: req.query.phase && req.query.phase !== 'ALL' ? String(req.query.phase) : null,
      status: req.query.status && req.query.status !== 'ALL' ? String(req.query.status) : null,
    };

    const report = await build(id, req, filters);
    const format = String(req.query.format ?? 'json').toLowerCase();

    if (format === 'csv') {
      await audit(req, { action: 'REPORT_EXPORTED', entity: 'Report', entityId: id, summary: `${report.title} exported as CSV` });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${id}-${stamp()}.csv"`);
      return res.send(toCsv(report));
    }

    if (format === 'pdf') {
      await audit(req, { action: 'REPORT_EXPORTED', entity: 'Report', entityId: id, summary: `${report.title} exported as PDF` });
      const settings = await getSettings();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${id}-${stamp()}.pdf"`);
      return writePdf(res, report, {
        org: settings.org_name ?? 'APCRDA',
        portal: settings.org_portal_name ?? 'Amaravati Land Allotment Portal',
        by: req.user!.name,
      });
    }

    return res.json(report);
  })
);

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const day = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ---------------------------------------------------------------------------

async function build(id: string, req: any, filters: any): Promise<Report> {
  const scope = caseScope(req);
  const caseWhere: any = { deletedAt: null, ...scope };
  if (filters.phase) caseWhere.phase = filters.phase;
  if (filters.status) caseWhere.status = filters.status;
  if (filters.from || filters.to) {
    caseWhere.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const stages = await loadStages();
  const stageOf = (sid: string | null) => stages.find((s) => s.id === sid);

  switch (id) {
    case 'case-pipeline': {
      const rows = await prisma.case.findMany({
        where: caseWhere,
        orderBy: { code: 'asc' },
        include: { applicant: { select: { name: true } }, plot: { select: { code: true, themeCity: true } } },
      });
      const now = Date.now();
      return {
        id,
        title: 'Case Pipeline',
        description: 'Every case with its current stage, owner, age, and SLA position.',
        columns: [
          { key: 'code', label: 'Case', width: 95 },
          { key: 'applicant', label: 'Applicant', width: 110 },
          { key: 'plot', label: 'Plot', width: 60 },
          { key: 'stage', label: 'Current stage', width: 120 },
          { key: 'phase', label: 'Phase', width: 40 },
          { key: 'status', label: 'Status', width: 65 },
          { key: 'ageDays', label: 'Age (d)', align: 'right', width: 45 },
          { key: 'sla', label: 'SLA due', width: 70 },
        ],
        rows: rows.map((c) => {
          const stage = stageOf(c.currentStageId);
          return {
            code: c.code,
            applicant: c.applicant.name,
            plot: c.plot?.code ?? '—',
            stage: stage ? `${stage.code} · ${stage.name}` : '—',
            phase: c.phase,
            status: c.status,
            ageDays: Math.floor((now - c.createdAt.getTime()) / 86_400_000),
            sla: c.slaDueAt ? day(c.slaDueAt) + (c.slaDueAt < new Date() ? ' (overdue)' : '') : '—',
          };
        }),
        summary: [
          { label: 'Total cases', value: String(rows.length) },
          { label: 'Active', value: String(rows.filter((c) => !TERMINAL_STATUSES.includes(c.status)).length) },
          {
            label: 'Overdue',
            value: String(
              rows.filter((c) => !TERMINAL_STATUSES.includes(c.status) && c.slaDueAt && c.slaDueAt < new Date()).length
            ),
          },
          { label: 'Committed investment', value: inr(rows.reduce((s, c) => s + c.investmentAmount, 0)) },
        ],
      };
    }

    case 'stage-aging': {
      const instances = await prisma.stageInstance.findMany({
        where: { status: 'ACTIVE', case: { ...caseWhere, status: { notIn: TERMINAL_STATUSES } } },
        select: { stageId: true, startedAt: true, dueAt: true },
      });
      const grouped = new Map<string, { days: number[]; overdue: number }>();
      for (const si of instances) {
        const g = grouped.get(si.stageId) ?? { days: [], overdue: 0 };
        g.days.push(Math.floor((Date.now() - si.startedAt.getTime()) / 86_400_000));
        if (si.dueAt && si.dueAt < new Date()) g.overdue += 1;
        grouped.set(si.stageId, g);
      }
      const rows = stages
        .filter((s) => grouped.has(s.id))
        .map((s) => {
          const g = grouped.get(s.id)!;
          return {
            stage: `${s.code} · ${s.name}`,
            owner: s.ownerRoleKey,
            cases: g.days.length,
            avgDays: Math.round(g.days.reduce((a, b) => a + b, 0) / g.days.length),
            maxDays: Math.max(...g.days),
            slaDays: s.slaDays,
            overdue: g.overdue,
          };
        });
      return {
        id,
        title: 'Stage Aging & Bottlenecks',
        description: 'Average and worst time-in-stage for cases currently sitting at each stage.',
        columns: [
          { key: 'stage', label: 'Stage', width: 165 },
          { key: 'owner', label: 'Owner role', width: 115 },
          { key: 'cases', label: 'Cases', align: 'right', width: 45 },
          { key: 'avgDays', label: 'Avg (d)', align: 'right', width: 50 },
          { key: 'maxDays', label: 'Max (d)', align: 'right', width: 50 },
          { key: 'slaDays', label: 'SLA (d)', align: 'right', width: 50 },
          { key: 'overdue', label: 'Overdue', align: 'right', width: 50 },
        ],
        rows,
        summary: [
          { label: 'Stages holding cases', value: String(rows.length) },
          { label: 'Cases in flight', value: String(instances.length) },
          {
            label: 'Worst bottleneck',
            value: rows.length ? rows.reduce((a, b) => (a.avgDays > b.avgDays ? a : b)).stage : '—',
          },
        ],
      };
    }

    case 'approvals-log': {
      const rows = await prisma.decision.findMany({
        where: {
          stageInstance: { case: caseWhere },
          ...(filters.from || filters.to
            ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
        include: {
          stageInstance: {
            include: { case: { select: { code: true } }, stage: { select: { code: true, name: true } } },
          },
        },
      });
      return {
        id,
        title: 'Approvals Log',
        description: 'Every gate decision recorded, with actor, outcome, and remarks.',
        columns: [
          { key: 'date', label: 'Date', width: 70 },
          { key: 'code', label: 'Case', width: 95 },
          { key: 'stage', label: 'Stage', width: 120 },
          { key: 'round', label: 'Round', width: 38 },
          { key: 'outcome', label: 'Outcome', width: 85 },
          { key: 'actor', label: 'Actor', width: 90 },
          { key: 'remarks', label: 'Remarks', width: 120 },
        ],
        rows: rows.map((d) => ({
          date: day(d.createdAt),
          code: d.stageInstance.case.code,
          stage: `${d.stageInstance.stage.code} · ${d.stageInstance.stage.name}`,
          round: d.stageInstance.roundLabel,
          outcome: d.outcomeLabel || d.outcome,
          actor: `${d.actorName} (${d.actorRole})`,
          remarks: d.remarks,
        })),
        summary: [
          { label: 'Decisions', value: String(rows.length) },
          { label: 'Passed', value: String(rows.filter((r) => r.kind === 'pass').length) },
          { label: 'Returned / deferred', value: String(rows.filter((r) => ['return', 'defer'].includes(r.kind)).length) },
          { label: 'Rejected / lapsed', value: String(rows.filter((r) => ['reject', 'lapse'].includes(r.kind)).length) },
        ],
      };
    }

    case 'financial-dues': {
      const rows = await prisma.payment.findMany({
        where: { case: caseWhere, status: { in: ['PENDING', 'OVERDUE'] } },
        orderBy: { dueDate: 'asc' },
        include: { case: { select: { code: true, applicant: { select: { name: true } } } } },
      });
      const total = rows.reduce((s, p) => s + p.amount, 0);
      const penalty = rows.reduce((s, p) => s + p.penalty, 0);
      return {
        id,
        title: 'Financial Dues',
        description: 'Outstanding and overdue payment lines with accrued penalty.',
        columns: [
          { key: 'code', label: 'Case', width: 95 },
          { key: 'applicant', label: 'Applicant', width: 110 },
          { key: 'label', label: 'Item', width: 110 },
          { key: 'due', label: 'Due', width: 70 },
          { key: 'amount', label: 'Amount', align: 'right', width: 85 },
          { key: 'penalty', label: 'Penalty', align: 'right', width: 70 },
          { key: 'status', label: 'Status', width: 60 },
        ],
        rows: rows.map((p) => ({
          code: p.case.code,
          applicant: p.case.applicant.name,
          label: p.label,
          due: day(p.dueDate),
          amount: inr(p.amount),
          penalty: p.penalty ? inr(p.penalty) : '—',
          status: p.status,
        })),
        summary: [
          { label: 'Open lines', value: String(rows.length) },
          { label: 'Outstanding', value: inr(total) },
          { label: 'Penalty accrued', value: inr(penalty) },
          { label: 'Overdue lines', value: String(rows.filter((p) => p.status === 'OVERDUE').length) },
        ],
      };
    }

    case 'at-risk-allotments': {
      const [compliance, lapsed] = await Promise.all([
        prisma.complianceRecord.findMany({
          where: { status: { in: ['AT_RISK', 'BREACH_NOTICE', 'CURE_PERIOD', 'RESUMED'] }, case: caseWhere },
          include: { case: { select: { code: true, applicant: { select: { name: true } }, status: true } } },
        }),
        prisma.case.findMany({
          where: { ...caseWhere, status: 'LAPSED' },
          include: { applicant: { select: { name: true } } },
        }),
      ]);

      const rows = [
        ...compliance.map((c) => ({
          code: c.case.code,
          applicant: c.case.applicant.name,
          risk: c.status,
          deadline: day(c.commencementDeadline),
          cureBy: day(c.cureDeadline),
          caseStatus: c.case.status,
          note: c.note,
        })),
        ...lapsed.map((c) => ({
          code: c.code,
          applicant: c.applicant.name,
          risk: 'LOI_LAPSED',
          deadline: day(c.loiValidUntil),
          cureBy: '—',
          caseStatus: c.status,
          note: 'LOI validity expired without acceptance.',
        })),
      ];

      return {
        id,
        title: 'Dormant / At-Risk Allotments',
        description: 'Commencement overdue, breach notices, lapsed LOIs, and cure periods running.',
        columns: [
          { key: 'code', label: 'Case', width: 95 },
          { key: 'applicant', label: 'Applicant', width: 110 },
          { key: 'risk', label: 'Risk', width: 85 },
          { key: 'deadline', label: 'Deadline', width: 70 },
          { key: 'cureBy', label: 'Cure by', width: 70 },
          { key: 'caseStatus', label: 'Case status', width: 70 },
          { key: 'note', label: 'Note', width: 130 },
        ],
        rows,
        summary: [
          { label: 'At-risk cases', value: String(rows.length) },
          { label: 'Breach notices', value: String(compliance.filter((c) => c.status === 'BREACH_NOTICE').length) },
          { label: 'Lapsed LOIs', value: String(lapsed.length) },
          { label: 'Resumed', value: String(compliance.filter((c) => c.status === 'RESUMED').length) },
        ],
      };
    }

    case 'grievance-summary': {
      const rows = await prisma.grievance.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          case: { select: { code: true } },
          raisedBy: { select: { name: true } },
          assignee: { select: { name: true } },
        },
      });
      return {
        id,
        title: 'Grievance Summary',
        description: 'Grievance register with status, assignee, and SLA position.',
        columns: [
          { key: 'code', label: 'Ref', width: 85 },
          { key: 'caseCode', label: 'Case', width: 95 },
          { key: 'subject', label: 'Subject', width: 140 },
          { key: 'category', label: 'Category', width: 90 },
          { key: 'status', label: 'Status', width: 70 },
          { key: 'assignee', label: 'Assignee', width: 90 },
          { key: 'sla', label: 'SLA due', width: 70 },
        ],
        rows: rows.map((g) => ({
          code: g.code,
          caseCode: g.case?.code ?? '—',
          subject: g.subject,
          category: g.category,
          status: g.status,
          assignee: g.assignee?.name ?? 'Unassigned',
          sla: day(g.slaDueAt) + (g.slaDueAt && g.slaDueAt < new Date() && ['OPEN', 'UNDER_REVIEW'].includes(g.status) ? ' (breached)' : ''),
        })),
        summary: [
          { label: 'Total', value: String(rows.length) },
          { label: 'Open', value: String(rows.filter((g) => g.status === 'OPEN').length) },
          { label: 'Under review', value: String(rows.filter((g) => g.status === 'UNDER_REVIEW').length) },
          { label: 'Resolved', value: String(rows.filter((g) => g.status === 'RESOLVED').length) },
        ],
      };
    }

    case 'allotment-profile': {
      const cases = await prisma.case.findMany({
        where: caseWhere,
        include: { plot: { select: { themeCity: true, extentAcres: true } } },
      });
      const key = (c: any) => `${c.objectiveCategory}||${c.sector || '—'}||${c.mode}||${c.holdingType}`;
      const grouped = new Map<string, { count: number; investment: number; jobs: number; acres: number }>();
      for (const c of cases) {
        const g = grouped.get(key(c)) ?? { count: 0, investment: 0, jobs: 0, acres: 0 };
        g.count += 1;
        g.investment += c.investmentAmount;
        g.jobs += c.jobsCommitted;
        g.acres += c.extentAcres || c.plot?.extentAcres || 0;
        grouped.set(key(c), g);
      }
      return {
        id,
        title: 'Allotments by Objective / Sector / Mode',
        description: 'Distribution of allotments and committed investment.',
        columns: [
          { key: 'objective', label: 'Objective', width: 110 },
          { key: 'sector', label: 'Sector', width: 110 },
          { key: 'mode', label: 'Mode', width: 100 },
          { key: 'holding', label: 'Holding', width: 60 },
          { key: 'count', label: 'Cases', align: 'right', width: 45 },
          { key: 'acres', label: 'Acres', align: 'right', width: 50 },
          { key: 'investment', label: 'Investment', align: 'right', width: 90 },
          { key: 'jobs', label: 'Jobs', align: 'right', width: 50 },
        ],
        rows: [...grouped.entries()].map(([k, g]) => {
          const [objective, sector, mode, holding] = k.split('||');
          return {
            objective,
            sector,
            mode,
            holding,
            count: g.count,
            acres: g.acres.toFixed(2),
            investment: inr(g.investment),
            jobs: g.jobs,
          };
        }),
        summary: [
          { label: 'Cases', value: String(cases.length) },
          { label: 'Total investment', value: inr(cases.reduce((s, c) => s + c.investmentAmount, 0)) },
          { label: 'Jobs committed', value: cases.reduce((s, c) => s + c.jobsCommitted, 0).toLocaleString('en-IN') },
          {
            label: 'Leasehold : Freehold',
            value: `${cases.filter((c) => c.holdingType === 'LEASEHOLD').length} : ${cases.filter((c) => c.holdingType === 'FREEHOLD').length}`,
          },
        ],
      };
    }

    default:
      throw badRequest('Unknown report.');
  }
}

// ---------------------------------------------------------------------------
// Exporters
// ---------------------------------------------------------------------------

function toCsv(report: Report) {
  const esc = (v: any) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    `# ${report.title}`,
    `# Generated ${new Date().toISOString()}`,
    ...report.summary.map((s) => `# ${s.label}: ${s.value}`),
    '',
    report.columns.map((c) => esc(c.label)).join(','),
    ...report.rows.map((row) => report.columns.map((c) => esc(row[c.key])).join(',')),
  ];
  return lines.join('\n');
}

function writePdf(res: any, report: Report, meta: { org: string; portal: string; by: string }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
  doc.pipe(res);

  const drawHeader = () => {
    doc.fillColor('#0f2d52').fontSize(15).text(meta.org, { continued: false });
    doc.fillColor('#5b6b82').fontSize(9).text(`${meta.portal} · ${report.title}`);
    doc
      .fillColor('#8a94a6')
      .fontSize(7.5)
      .text(`Generated ${new Date().toLocaleString('en-GB')} by ${meta.by}`);
    doc.moveDown(0.4);
    doc.strokeColor('#d5dbe5').lineWidth(0.7).moveTo(32, doc.y).lineTo(810, doc.y).stroke();
    doc.moveDown(0.5);
  };

  drawHeader();

  doc.fillColor('#33415c').fontSize(8);
  const summaryLine = report.summary.map((s) => `${s.label}: ${s.value}`).join('     ');
  doc.text(summaryLine);
  doc.moveDown(0.6);

  const startX = 32;
  const widths = report.columns.map((c) => c.width ?? 80);

  const drawRow = (values: string[], opts: { header?: boolean; zebra?: boolean }) => {
    const height = 16;
    if (doc.y + height > doc.page.height - 40) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 32 });
      drawHeader();
    }
    const y = doc.y;
    if (opts.header) {
      doc.rect(startX, y - 2, widths.reduce((a, b) => a + b, 0), height).fill('#0f2d52');
    } else if (opts.zebra) {
      doc.rect(startX, y - 2, widths.reduce((a, b) => a + b, 0), height).fill('#f3f6fa');
    }
    let x = startX;
    values.forEach((value, i) => {
      doc
        .fillColor(opts.header ? '#ffffff' : '#1f2937')
        .font(opts.header ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7)
        .text(value, x + 3, y + 2, {
          width: widths[i] - 6,
          align: report.columns[i].align === 'right' ? 'right' : 'left',
          ellipsis: true,
          height: height - 4,
        });
      x += widths[i];
    });
    doc.y = y + height;
  };

  drawRow(report.columns.map((c) => c.label), { header: true });
  report.rows.forEach((row, i) => {
    drawRow(report.columns.map((c) => String(row[c.key] ?? '')), { zebra: i % 2 === 1 });
  });

  if (!report.rows.length) {
    doc.moveDown(1).fillColor('#8a94a6').fontSize(9).text('No records match the selected filters.');
  }

  doc.end();
}
