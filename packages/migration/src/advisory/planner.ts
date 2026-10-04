import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GitHubAppsAdvisoryPlanner } from './apps-matrix.js';
import { PackagesCutoverPlanner } from './packages-guide.js';
import { SelfHostedRunnersPlanner } from './runners-spec.js';
import { UnsupportedItemsAuditor } from './unsupported-audit.js';
import type {
  AdvisoryArtifacts,
  AdvisoryPlannerOptions,
  MigrationAdvisoryReport,
} from './types.js';

export class MigrationAdvisoryPlanner {
  private readonly options: AdvisoryPlannerOptions;
  private readonly appsPlanner = new GitHubAppsAdvisoryPlanner();
  private readonly packagesPlanner = new PackagesCutoverPlanner();
  private readonly runnersPlanner = new SelfHostedRunnersPlanner();
  private readonly unsupportedAuditor = new UnsupportedItemsAuditor();

  constructor(options: AdvisoryPlannerOptions) {
    this.options = options;
  }

  /**
   * Generates the complete advisory report and all rendered artifact documents.
   */
  async generateReport(): Promise<{
    report: MigrationAdvisoryReport;
    artifacts: AdvisoryArtifacts;
  }> {
    const { sourceOrg, targetOrg, adapter, discoveryBundle, signal } =
      this.options;

    // 1. Run all sub-planners concurrently
    const [apps, packages, runnersInfo, unsupportedItems] = await Promise.all([
      this.appsPlanner.discover(
        sourceOrg,
        targetOrg,
        adapter,
        discoveryBundle,
        signal,
      ),
      this.packagesPlanner.discover(
        sourceOrg,
        targetOrg,
        adapter,
        discoveryBundle,
        signal,
      ),
      this.runnersPlanner.discover(sourceOrg, adapter, discoveryBundle, signal),
      this.unsupportedAuditor.audit(
        sourceOrg,
        targetOrg,
        adapter,
        discoveryBundle,
        signal,
      ),
    ]);

    // 2. Assemble structured report
    const report: MigrationAdvisoryReport = {
      reportVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      sourceOrg,
      targetOrg,
      apps,
      packages,
      runners: runnersInfo,
      unsupportedItems,
      summary: {
        appCount: apps.length,
        packageCount: packages.length,
        runnerCount: runnersInfo.runners.length,
        runnerGroupCount: runnersInfo.groups.length,
        unsupportedCategoryCount: unsupportedItems.length,
      },
    };

    // 3. Render individual artifact files
    const appsMatrixCsv = this.appsPlanner.generateAppsMatrixCsv(apps);
    const packagesGuideMarkdown =
      this.packagesPlanner.generatePackagesGuideMarkdown(
        packages,
        sourceOrg,
        targetOrg,
      );
    const runnerInfrastructureSpecMarkdown =
      this.runnersPlanner.generateRunnerInfrastructureSpecMarkdown(
        runnersInfo.runners,
        runnersInfo.groups,
        targetOrg,
      );
    const unsupportedAuditMarkdown =
      this.unsupportedAuditor.generateUnsupportedAuditMarkdown(
        unsupportedItems,
      );

    // 4. Render executive summary markdown
    const reportMarkdown = this.renderExecutiveSummary(
      report,
      unsupportedAuditMarkdown,
    );

    const artifacts: AdvisoryArtifacts = {
      reportJson: JSON.stringify(report, null, 2),
      reportMarkdown,
      appsMatrixCsv,
      packagesGuideMarkdown,
      runnerInfrastructureSpecMarkdown,
    };

    return { report, artifacts };
  }

  /**
   * Writes all advisory artifacts to the target directory.
   */
  async writeArtifacts(
    outputDir: string,
    artifacts: AdvisoryArtifacts,
  ): Promise<{ paths: Record<string, string> }> {
    await mkdir(outputDir, { recursive: true });

    const paths = {
      reportJson: join(outputDir, 'migration-advisory-report.json'),
      reportMarkdown: join(outputDir, 'migration-advisory-report.md'),
      appsMatrixCsv: join(outputDir, 'github-apps-reinstallation-matrix.csv'),
      packagesGuideMarkdown: join(outputDir, 'packages-cutover-guide.md'),
      runnerInfrastructureSpecMarkdown: join(
        outputDir,
        'runner-infrastructure-spec.md',
      ),
    };

    await Promise.all([
      writeFile(paths.reportJson, artifacts.reportJson, 'utf-8'),
      writeFile(paths.reportMarkdown, artifacts.reportMarkdown, 'utf-8'),
      writeFile(paths.appsMatrixCsv, artifacts.appsMatrixCsv, 'utf-8'),
      writeFile(
        paths.packagesGuideMarkdown,
        artifacts.packagesGuideMarkdown,
        'utf-8',
      ),
      writeFile(
        paths.runnerInfrastructureSpecMarkdown,
        artifacts.runnerInfrastructureSpecMarkdown,
        'utf-8',
      ),
    ]);

    return { paths };
  }

  private renderExecutiveSummary(
    report: MigrationAdvisoryReport,
    unsupportedAuditMarkdown: string,
  ): string {
    return [
      `# Migration Advisory & Non-Migrated Items Report`,
      '',
      `**Source Organization:** \`${report.sourceOrg}\`  `,
      `**Target Organization:** \`${report.targetOrg}\`  `,
      `**Generated At:** \`${report.generatedAt}\`  `,
      '',
      `## Executive Summary`,
      '',
      `This report documents all platform resources that require out-of-band administration or post-cutover republishing. High-stakes migrations require explicit planning for resources that GitHub Enterprise Importer (GEI) intentionally does not transfer.`,
      '',
      `| Domain | Discovered Items | Required Action | Artifact Reference |`,
      `|---|---|---|---|`,
      `| **GitHub Apps** | ${report.summary.appCount} App(s) | Reinstallation on target org | [\`github-apps-reinstallation-matrix.csv\`](github-apps-reinstallation-matrix.csv) |`,
      `| **GitHub Packages** | ${report.summary.packageCount} Package(s) | Binary rebuild / republish | [\`packages-cutover-guide.md\`](packages-cutover-guide.md) |`,
      `| **Self-Hosted Runners** | ${report.summary.runnerCount} Runner(s) | Target host re-registration | [\`runner-infrastructure-spec.md\`](runner-infrastructure-spec.md) |`,
      `| **Non-Migrated Entities** | ${report.summary.unsupportedCategoryCount} Categories | Operational review | See audit below |`,
      '',
      `---`,
      '',
      unsupportedAuditMarkdown,
    ].join('\n');
  }
}
