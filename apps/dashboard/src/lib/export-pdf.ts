import { jsPDF } from 'jspdf';
import autoTableImport, { type UserOptions } from 'jspdf-autotable';
import type { DiscoveryBundle, Entity } from '@ghec/contracts';
import type {
  EvaluatedInsights,
  MigrationDimensionAssessment,
} from '@ghec/analysis';
import { formatBytes, formatDuration } from './formatters.js';
import type { ScanDiff } from './diff-engine.js';

export type PdfReportType = 'executive' | 'technical';

export interface PdfReportScope {
  readonly name: string;
  readonly organizationCount: number;
  readonly entities: DiscoveryBundle['entities'];
  readonly collectors: DiscoveryBundle['collectors'];
  readonly findings: EvaluatedInsights['findings'];
  readonly dimensions: MigrationDimensionAssessment[];
  readonly limitations: string[];
}

const COLORS = {
  navy: [25, 45, 75] as const,
  blue: [31, 111, 235] as const,
  paleBlue: [232, 240, 254] as const,
  red: [176, 38, 38] as const,
  amber: [151, 92, 8] as const,
  green: [28, 112, 72] as const,
  gray: [91, 101, 116] as const,
  paleGray: [244, 246, 248] as const,
};

const PAGE = { left: 14, right: 14, top: 24, bottom: 18 } as const;

// jspdf-autotable publishes different default interop shapes for Node and Vite.
const autoTable = (
  typeof autoTableImport === 'function'
    ? autoTableImport
    : (autoTableImport as unknown as { default: typeof autoTableImport })
        .default
) as (document: jsPDF, options: UserOptions) => void;

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function statusLabel(status: MigrationDimensionAssessment['status']): string {
  switch (status) {
    case 'review_required':
      return 'REVIEW REQUIRED';
    case 'no_issue_observed':
      return 'NO ISSUE OBSERVED';
    case 'not_applicable':
      return 'NOT APPLICABLE';
    default:
      return 'UNKNOWN';
  }
}

function entityCount(
  entities: DiscoveryBundle['entities'],
  kind: Entity['kind'],
): number {
  return entities.filter((entity) => entity.kind === kind).length;
}

/** Builds the exact in-memory report scope used by both PDF variants. */
export function buildPdfReportScope(
  bundle: DiscoveryBundle,
  insights: EvaluatedInsights,
  organizationId?: string,
): PdfReportScope {
  const organization = organizationId
    ? bundle.organizations.find((item) => item.id === organizationId)
    : undefined;
  const included = (candidateOrganizationId: string) =>
    !organizationId || candidateOrganizationId === organizationId;
  const findings = insights.findings.filter((finding) =>
    included(finding.organizationId),
  );
  const findingsByRule = new Map<string, typeof findings>();
  for (const finding of findings) {
    const current = findingsByRule.get(finding.ruleId) ?? [];
    current.push(finding);
    findingsByRule.set(finding.ruleId, current);
  }

  const collectors = bundle.collectors.filter((collector) =>
    included(collector.organizationId),
  );
  const dimensions = insights.dimensions.map((dimension) => {
    if (!organizationId) return dimension;
    const scopedFindings = findingsByRule.get(dimension.ruleId) ?? [];
    const requiredCollectors = collectors.filter(
      (collector) => collector.module === dimension.requiredModule,
    );
    const evidenceComplete =
      requiredCollectors.length > 0 &&
      requiredCollectors.every((collector) => collector.status === 'complete');
    return {
      ...dimension,
      findings: scopedFindings,
      status: scopedFindings.length
        ? ('review_required' as const)
        : evidenceComplete
          ? ('no_issue_observed' as const)
          : ('unknown' as const),
      caveats: unique([
        ...dimension.caveats,
        ...requiredCollectors.flatMap((collector) => [
          ...collector.warnings,
          ...(collector.coverage.reason ? [collector.coverage.reason] : []),
        ]),
      ]),
    };
  });

  const limitations = unique([
    ...bundle.limitations,
    ...insights.scopeLimitations,
    ...collectors.flatMap((collector) => collector.warnings),
  ]);

  return {
    name: organization
      ? organization.displayName || organization.login
      : bundle.scope.kind === 'enterprise'
        ? bundle.scope.slug
        : bundle.organizations[0]?.displayName ||
          bundle.organizations[0]?.login ||
          bundle.scope.organizationId,
    organizationCount: organizationId
      ? organization
        ? 1
        : 0
      : bundle.organizations.length,
    entities: bundle.entities.filter((entity) =>
      included(entity.organizationId),
    ),
    collectors,
    findings,
    dimensions,
    limitations,
  };
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...COLORS.navy);
  doc.text(title, PAGE.left, y);
  doc.setDrawColor(...COLORS.blue);
  doc.setLineWidth(0.6);
  doc.line(PAGE.left, y + 2.5, 196, y + 2.5);
  return y + 8;
}

function addParagraph(doc: jsPDF, text: string, y: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(45, 52, 62);
  const lines = doc.splitTextToSize(text, 182) as string[];
  doc.text(lines, PAGE.left, y);
  return y + lines.length * 4.2 + 2;
}

function table(
  doc: jsPDF,
  startY: number,
  head: string[][],
  body: Array<Array<string | number>>,
  columnStyles: Record<number, { cellWidth?: number }> = {},
): number {
  let finalY = startY;
  autoTable(doc, {
    startY,
    head,
    body: body.length ? body : [['No evidence observed']],
    theme: 'grid',
    margin: {
      top: PAGE.top,
      right: PAGE.right,
      bottom: PAGE.bottom,
      left: PAGE.left,
    },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'top',
      lineColor: [215, 220, 226],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [...COLORS.navy],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [...COLORS.paleGray] },
    columnStyles,
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    didDrawPage: (data) => {
      finalY = data.cursor?.y ?? finalY;
    },
  });
  return finalY + 8;
}

function ensureSpace(doc: jsPDF, y: number, needed = 30): number {
  if (y + needed <= 275) return y;
  doc.addPage();
  return PAGE.top;
}

function addCover(
  doc: jsPDF,
  bundle: DiscoveryBundle,
  scope: PdfReportScope,
  reportTitle: string,
): void {
  doc.setFillColor(...COLORS.navy);
  doc.rect(0, 0, 210, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('GHEC CONSULTANT SUITE', PAGE.left, 18);
  doc.setFontSize(23);
  const titleLines = doc.splitTextToSize(reportTitle, 176) as string[];
  doc.text(titleLines, PAGE.left, 38);

  doc.setFillColor(...COLORS.paleBlue);
  doc.rect(PAGE.left, 94, 182, 72, 'F');
  doc.setTextColor(...COLORS.navy);
  doc.setFontSize(12);
  doc.text('Assessment metadata', 20, 108);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const metadata = [
    ['Scope', scope.name],
    ['Scan ID', bundle.scan.id],
    [
      'Duration',
      formatDuration(bundle.scan.startedAt, bundle.scan.completedAt),
    ],
    ['Producer', `${bundle.scan.producer} ${bundle.scan.producerVersion}`],
    ['Evidence timestamp', bundle.scan.completedAt],
    ['Scan status', bundle.scan.status.toUpperCase()],
  ];
  metadata.forEach(([label, value], index) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 20, 120 + index * 7);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), 57, 120 + index * 7);
  });

  doc.setFillColor(...COLORS.amber);
  doc.rect(PAGE.left, 184, 182, 13, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CONFIDENTIAL | IN-MEMORY ASSESSMENT | AIR-GAPPED', 105, 192.5, {
    align: 'center',
  });
  doc.setTextColor(...COLORS.gray);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    'Generated exclusively from the imported discovery bundle. No external resources are loaded.',
    105,
    214,
    { align: 'center', maxWidth: 174 },
  );
}

function addHeadersAndFooters(
  doc: jsPDF,
  scopeName: string,
  generatedAt: string,
): void {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(210, 216, 223);
    doc.setLineWidth(0.25);
    doc.line(PAGE.left, 15, 196, 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.gray);
    doc.text(`GHEC Consultant Suite - ${scopeName}`, PAGE.left, 11);
    doc.line(PAGE.left, 283, 196, 283);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${page} of ${pages} | Generated on ${generatedAt} | Air-Gapped Evidence`,
      105,
      289,
      { align: 'center' },
    );
  }
}

function createDocument(): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({
    title: 'GitHub Enterprise Cloud Discovery Assessment',
    subject: 'Air-gapped migration readiness evidence',
    author: 'GHEC Consultant Suite',
    creator: 'GHEC Consultant Suite',
  });
  return doc;
}

export function generateExecutivePdf(
  bundle: DiscoveryBundle,
  insights: EvaluatedInsights,
  organizationId?: string,
): jsPDF {
  const doc = createDocument();
  const scope = buildPdfReportScope(bundle, insights, organizationId);
  addCover(
    doc,
    bundle,
    scope,
    'GitHub Enterprise Cloud Discovery & Migration Readiness Assessment',
  );

  doc.addPage();
  let y = addSectionTitle(doc, 'Active Migration Target Profile', PAGE.top);
  y = table(
    doc,
    y,
    [
      [
        'Platform',
        'Critical Size',
        'Warning Size',
        'LFS',
        'Branch Policy',
        'Security',
      ],
    ],
    [
      [
        insights.options.targetPlatform,
        formatBytes(insights.options.repoSizeCriticalBytes),
        formatBytes(insights.options.repoSizeWarningBytes),
        insights.options.lfsCutoverStrictness,
        insights.options.branchProtectionPolicy,
        insights.options.securitySeverityCutoff,
      ],
    ],
  );
  y = addSectionTitle(doc, 'Executive Summary & KPIs', y);
  const repositories = scope.entities.filter(
    (entity) => entity.kind === 'repository',
  );
  const observedBytes = repositories.reduce(
    (total, repository) =>
      total +
      (repository.kind === 'repository' &&
      repository.size.availability === 'observed'
        ? (repository.size.value ?? 0)
        : 0),
    0,
  );
  const workflows = scope.entities
    .filter((entity) => entity.kind === 'actions')
    .reduce(
      (total, action) =>
        total +
        (action.kind === 'actions' &&
        action.workflowCount.availability === 'observed'
          ? (action.workflowCount.value ?? 0)
          : 0),
      0,
    );
  y = table(
    doc,
    y,
    [
      [
        'Organizations',
        'Repositories',
        'Observed Storage',
        'Teams',
        'Workflows',
        'Scan Status',
      ],
    ],
    [
      [
        scope.organizationCount,
        repositories.length,
        `${observedBytes.toLocaleString()} bytes (${formatBytes(observedBytes)})`,
        entityCount(scope.entities, 'team'),
        workflows,
        bundle.scan.status.toUpperCase(),
      ],
    ],
  );
  const disclosure =
    bundle.scan.status === 'complete' && scope.limitations.length === 0
      ? 'The scan completed with no recorded scope limitations.'
      : `This ${bundle.scan.status} assessment must be interpreted with its evidence limitations: ${scope.limitations.join('; ') || 'one or more collectors did not complete.'}`;
  y = addParagraph(doc, disclosure, y);

  y = ensureSpace(doc, y, 35);
  y = addSectionTitle(doc, 'Migration Dimension Scorecard', y);
  y = table(
    doc,
    y,
    [['Dimension', 'Status', 'Rule ID', 'Caveats']],
    scope.dimensions.map((dimension) => [
      dimension.name,
      statusLabel(dimension.status),
      dimension.ruleId,
      dimension.caveats.join('; ') || 'None recorded',
    ]),
    { 0: { cellWidth: 45 }, 1: { cellWidth: 34 }, 2: { cellWidth: 27 } },
  );

  y = ensureSpace(doc, y, 35);
  y = addSectionTitle(doc, 'High-Priority Blocker Summary', y);
  const priorityFindings = [...scope.findings]
    .filter(
      (finding) => finding.severity === 'high' || finding.severity === 'medium',
    )
    .sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1,
    );
  table(
    doc,
    y,
    [['Priority', 'Blocker', 'Affected', 'Suggested remediation']],
    priorityFindings
      .slice(0, 20)
      .map((finding) => [
        finding.severity.toUpperCase(),
        finding.title,
        finding.entityIds.length,
        finding.description,
      ]),
    { 0: { cellWidth: 22 }, 2: { cellWidth: 20 } },
  );

  addHeadersAndFooters(doc, scope.name, bundle.scan.completedAt);
  return doc;
}

export function generateTechnicalPdf(
  bundle: DiscoveryBundle,
  insights: EvaluatedInsights,
  organizationId?: string,
): jsPDF {
  const doc = createDocument();
  const scope = buildPdfReportScope(bundle, insights, organizationId);
  addCover(doc, bundle, scope, 'Technical Discovery & Security Report');

  const repositories = scope.entities.filter(
    (entity) => entity.kind === 'repository',
  );
  const policies = scope.entities.filter((entity) => entity.kind === 'policy');
  const protectedRepositories = new Set(
    policies
      .filter(
        (policy) =>
          policy.kind === 'policy' &&
          policy.repositoryId &&
          policy.enforcement === 'active',
      )
      .map((policy) => (policy.kind === 'policy' ? policy.repositoryId : null)),
  );

  doc.addPage();
  let y = addSectionTitle(doc, 'Active Migration Target Profile', PAGE.top);
  y = table(
    doc,
    y,
    [
      [
        'Platform',
        'Critical Size',
        'Warning Size',
        'LFS',
        'Branch Policy',
        'Security',
      ],
    ],
    [
      [
        insights.options.targetPlatform,
        formatBytes(insights.options.repoSizeCriticalBytes),
        formatBytes(insights.options.repoSizeWarningBytes),
        insights.options.lfsCutoverStrictness,
        insights.options.branchProtectionPolicy,
        insights.options.securitySeverityCutoff,
      ],
    ],
  );
  y = addSectionTitle(doc, 'Repository Inventory Summary', y);
  const visibility = ['private', 'internal', 'public', 'unknown'].map(
    (value) => [
      value.toUpperCase(),
      repositories.filter(
        (repository) =>
          repository.kind === 'repository' && repository.visibility === value,
      ).length,
    ],
  );
  y = table(doc, y, [['Visibility', 'Repository Count']], visibility, {
    1: { cellWidth: 40 },
  });
  y = ensureSpace(doc, y, 35);
  y = addSectionTitle(doc, 'Repository Detail (Largest First)', y);
  y = table(
    doc,
    y,
    [
      [
        'Repository',
        'Visibility',
        'Size',
        'Archived',
        'Default Branch',
        'Active Protection',
      ],
    ],
    [...repositories]
      .sort((a, b) =>
        a.kind === 'repository' && b.kind === 'repository'
          ? (b.size.value ?? -1) - (a.size.value ?? -1)
          : 0,
      )
      .map((repository) => {
        if (repository.kind !== 'repository') return [];
        return [
          repository.name,
          repository.visibility,
          repository.size.availability === 'observed' &&
          repository.size.value !== null
            ? formatBytes(repository.size.value)
            : `Unknown (${repository.size.reason ?? 'not measured'})`,
          repository.archived === null
            ? 'Unknown'
            : repository.archived
              ? 'Yes'
              : 'No',
          repository.defaultBranch ?? 'Unknown',
          protectedRepositories.has(repository.id) ? 'Yes' : 'No evidence',
        ];
      }),
    { 0: { cellWidth: 43 }, 1: { cellWidth: 22 }, 2: { cellWidth: 28 } },
  );

  y = ensureSpace(doc, y, 35);
  y = addSectionTitle(doc, 'Actions & CI/CD Infrastructure', y);
  const actions = scope.entities.filter((entity) => entity.kind === 'actions');
  const secretMetadata = scope.entities.filter(
    (entity) => entity.kind === 'actions-secret',
  );
  y = table(
    doc,
    y,
    [
      [
        'Repository ID',
        'Enabled',
        'Workflows',
        'Runners',
        'Runner Exposure',
        'Secrets / Variables',
      ],
    ],
    actions.map((action) => {
      if (action.kind !== 'actions') return [];
      return [
        action.repositoryId,
        action.enabled === null ? 'Unknown' : action.enabled ? 'Yes' : 'No',
        action.workflowCount.value ?? 'Unknown',
        action.runnerCount.value ?? 'Unknown',
        action.runnerTypes.join(', ') || 'Unknown',
        secretMetadata.filter(
          (secret) =>
            secret.kind === 'actions-secret' &&
            (secret.repositoryId === action.repositoryId ||
              secret.repositoryId === null),
        ).length,
      ];
    }),
    { 0: { cellWidth: 48 }, 4: { cellWidth: 35 } },
  );

  y = ensureSpace(doc, y, 35);
  y = addSectionTitle(doc, 'Security & Governance Posture', y);
  const security = scope.entities.filter(
    (entity) => entity.kind === 'security',
  );
  const adoption = (field: 'codeScanning' | 'dependabot') => {
    const known = security.filter(
      (item) => item.kind === 'security' && item[field] !== 'unknown',
    );
    const enabled = known.filter(
      (item) => item.kind === 'security' && item[field] === 'enabled',
    ).length;
    return known.length
      ? `${((enabled / known.length) * 100).toFixed(1)}% (${enabled}/${known.length})`
      : 'Unknown';
  };
  const alerts = security.reduce(
    (total, item) =>
      total +
      (item.kind === 'security' &&
      item.openAlertCount.availability === 'observed'
        ? (item.openAlertCount.value ?? 0)
        : 0),
    0,
  );
  y = table(
    doc,
    y,
    [['Metric', 'Observed Result', 'Evidence Note']],
    [
      [
        'Code scanning adoption',
        adoption('codeScanning'),
        'Known repository security records only',
      ],
      [
        'Dependabot adoption',
        adoption('dependabot'),
        'Known repository security records only',
      ],
      [
        'Open alert volume',
        alerts,
        'Sum of observed alert counts; unknown values excluded',
      ],
      [
        'Branch protection / ruleset coverage',
        `${protectedRepositories.size}/${repositories.length}`,
        'Active enforcement evidence',
      ],
    ],
    { 0: { cellWidth: 48 }, 1: { cellWidth: 42 } },
  );

  y = ensureSpace(doc, y, 35);
  y = addSectionTitle(doc, 'Collector Provenance & Health Audit', y);
  table(
    doc,
    y,
    [
      [
        'Module',
        'Status',
        'Coverage',
        'Observed / Expected',
        'Sources',
        'Warnings / Errors',
      ],
    ],
    scope.collectors.map((collector) => [
      collector.module,
      collector.status.toUpperCase(),
      collector.coverage.state,
      `${collector.coverage.observed} / ${collector.coverage.expected ?? 'Unknown'}`,
      unique(collector.provenance.map((item) => item.source)).join(', ') ||
        'None',
      [
        ...collector.warnings,
        ...collector.errors.map((error) => `${error.code}: ${error.message}`),
        ...(collector.coverage.reason ? [collector.coverage.reason] : []),
      ].join('; ') || 'None',
    ]),
    {
      0: { cellWidth: 27 },
      1: { cellWidth: 23 },
      2: { cellWidth: 23 },
      3: { cellWidth: 30 },
    },
  );

  addHeadersAndFooters(doc, scope.name, bundle.scan.completedAt);
  return doc;
}

/** Browser-only save operation; report construction itself remains DOM-free. */
export function downloadPdfReport(
  type: PdfReportType,
  bundle: DiscoveryBundle,
  insights: EvaluatedInsights,
  organizationId?: string,
): void {
  const document =
    type === 'executive'
      ? generateExecutivePdf(bundle, insights, organizationId)
      : generateTechnicalPdf(bundle, insights, organizationId);
  const scope = buildPdfReportScope(bundle, insights, organizationId);
  const safeScope = scope.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const filename = `${type}-assessment-${safeScope || bundle.scan.id}-${bundle.scan.id}.pdf`;
  document.save(filename);
  window.dispatchEvent(
    new CustomEvent('ghec:download-complete', { detail: { filename } }),
  );
}

export function generateRemediationPdf(diff: ScanDiff): jsPDF {
  const doc = createDocument();
  const title = 'Remediation Progress Assessment';
  doc.setFillColor(...COLORS.navy);
  doc.rect(0, 0, 210, 54, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(title, PAGE.left, 27);
  doc.setFontSize(9);
  doc.text(`${diff.baselineScanId} vs ${diff.currentScanId}`, PAGE.left, 39);
  let y = addSectionTitle(doc, 'Executive Remediation Summary', 70);
  y = table(
    doc,
    y,
    [['Target Platform', 'Critical Size', 'Warning Size', 'LFS Policy']],
    [
      [
        diff.options.targetPlatform,
        formatBytes(diff.options.repoSizeCriticalBytes),
        formatBytes(diff.options.repoSizeWarningBytes),
        diff.options.lfsCutoverStrictness,
      ],
    ],
  );
  y = table(
    doc,
    y,
    [['Resolved', 'Persistent', 'New', 'Blocker Reduction']],
    [
      [
        diff.resolved,
        diff.persistent,
        diff.new,
        `${diff.reductionPercent.toFixed(1)}%`,
      ],
    ],
  );
  y = addSectionTitle(doc, 'Quantitative Deltas', y);
  y = table(
    doc,
    y,
    [['Metric', 'Change']],
    [
      [
        'Repository storage',
        `${diff.metrics.storageDeltaBytes.toLocaleString()} bytes`,
      ],
      ['Critical blockers', diff.metrics.criticalBlockerDelta],
      ['Protected repositories', diff.metrics.protectedRepositoryDelta],
    ],
  );
  y = ensureSpace(doc, y, 35);
  y = addSectionTitle(doc, 'Finding Remediation Detail', y);
  table(
    doc,
    y,
    [['Status', 'Dimension', 'Rule ID', 'Affected Entity', 'Details']],
    diff.findings.map((finding) => [
      finding.status.toUpperCase(),
      finding.dimension,
      finding.ruleId,
      finding.entityIds.join(', ') || 'Scope-wide',
      finding.description,
    ]),
    {
      0: { cellWidth: 23 },
      1: { cellWidth: 37 },
      2: { cellWidth: 27 },
      3: { cellWidth: 42 },
    },
  );
  addHeadersAndFooters(doc, 'Remediation Tracker', new Date().toISOString());
  return doc;
}

export function downloadRemediationPdf(diff: ScanDiff): void {
  const filename = `remediation-progress-${diff.baselineScanId}-vs-${diff.currentScanId}.pdf`;
  generateRemediationPdf(diff).save(filename);
  window.dispatchEvent(
    new CustomEvent('ghec:download-complete', { detail: { filename } }),
  );
}
