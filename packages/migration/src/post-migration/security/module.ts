import { MIGRATION_SCHEMA_VERSION } from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
  OperationExecutionResult,
  PlannedOperation,
  VerificationDiscrepancy,
} from '../../core/types.js';
import {
  diffSecuritySettings,
  fetchRepositorySecuritySettings,
} from './ghas-config.js';
import {
  fetchSecretScanningAlerts,
  matchAlertRemediations,
  SECRET_SCANNING_LIMITATION_NOTICE,
} from './secret-scanning-sync.js';
import {
  fetchCodeScanningAnalyses,
  SARIF_LIMITATION_NOTICE,
  uploadSarif,
} from './sarif-sync.js';
import type {
  AlertRemediationMatch,
  GhasFidelityReport,
  GhasSecurityDiscoveredData,
  GhasSecurityModuleOptions,
  SecurityFeatureStatus,
} from './types.js';

export class GhasSecurityMigrationModule implements MigrationModule<GhasSecurityDiscoveredData> {
  readonly id = 'security';
  readonly displayName = 'GitHub Advanced Security & Remediation Sync';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  constructor(private readonly options: GhasSecurityModuleOptions = {}) {}

  async discover(ctx: MigrationContext): Promise<GhasSecurityDiscoveredData> {
    const sourceRepo = ctx.scope.sourceRepo ?? '';
    const sourceOrg = ctx.scope.sourceOrg;

    // 1. Fetch source security settings
    const settings = await fetchRepositorySecuritySettings(
      ctx,
      sourceOrg,
      sourceRepo,
      ctx.sourceClient,
    );

    // 2. Fetch source resolved secret scanning alerts
    const resolvedAlerts = await fetchSecretScanningAlerts(
      ctx,
      sourceOrg,
      sourceRepo,
      'resolved',
      ctx.sourceClient,
    );

    // 3. Optional: Code scanning SARIF analyses
    let sarifAnalyses: GhasSecurityDiscoveredData['sarifAnalyses'] = undefined;
    if (this.options.syncSarif) {
      sarifAnalyses = await fetchCodeScanningAnalyses(
        ctx,
        sourceOrg,
        sourceRepo,
        ctx.sourceClient,
      );
    }

    return {
      repository: sourceRepo,
      settings,
      resolvedAlerts,
      sarifAnalyses,
    };
  }

  async plan(
    ctx: MigrationContext,
    sourceData: GhasSecurityDiscoveredData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const targetOrg = ctx.scope.targetOrg;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    // 1. Reconcile security settings
    const targetSettings = await fetchRepositorySecuritySettings(
      ctx,
      targetOrg,
      targetRepo,
      ctx.targetClient,
    );

    const settingsDiff = diffSecuritySettings(
      sourceData.settings,
      targetSettings,
      { targetHasGhasLicense: this.options.targetHasGhasLicense },
    );

    for (const warn of settingsDiff.warnings) {
      warnings.push(warn);
    }

    if (settingsDiff.hasChanges) {
      operations.push({
        id: `security-settings:${targetRepo}`,
        resourceType: 'repository-security-settings',
        resourceName: targetRepo,
        operation: 'update',
        sourceState: sourceData.settings,
        destinationCurrentState: targetSettings,
        payload: settingsDiff.payload,
      });
      warnings.push(
        `Planned GHAS features: ${settingsDiff.changesDescription.join(', ')}`,
      );
    } else {
      operations.push({
        id: `security-settings:${targetRepo}`,
        resourceType: 'repository-security-settings',
        resourceName: targetRepo,
        operation: 'noop',
        sourceState: sourceData.settings,
        destinationCurrentState: targetSettings,
      });
    }

    // 2. Reconcile secret scanning alert remediations
    if (sourceData.resolvedAlerts.length > 0) {
      const targetOpenAlerts = await fetchSecretScanningAlerts(
        ctx,
        targetOrg,
        targetRepo,
        'open',
        ctx.targetClient,
      );

      const remediationMatches = matchAlertRemediations(
        sourceData.resolvedAlerts,
        targetOpenAlerts,
        {
          defaultResolutionCommentPrefix:
            this.options.defaultResolutionCommentPrefix,
        },
      );

      if (remediationMatches.length > 0) {
        warnings.push(SECRET_SCANNING_LIMITATION_NOTICE);
        for (const match of remediationMatches) {
          operations.push({
            id: `secret-alert-remediation:${targetRepo}:${match.targetAlertNumber}`,
            resourceType: 'secret-scanning-alert',
            resourceName: `alert-#${match.targetAlertNumber} (${match.secretType})`,
            operation: 'update',
            payload: match,
          });
        }
      }
    }

    // 3. Optional SARIF code scanning sync
    if (
      this.options.syncSarif &&
      sourceData.sarifAnalyses &&
      sourceData.sarifAnalyses.length > 0
    ) {
      warnings.push(SARIF_LIMITATION_NOTICE);
      for (const analysis of sourceData.sarifAnalyses) {
        operations.push({
          id: `code-scanning-sarif:${targetRepo}:${analysis.id}`,
          resourceType: 'code-scanning-sarif',
          resourceName: `analysis-#${analysis.id} (${analysis.tool.name})`,
          operation: 'create',
          payload: analysis,
        });
      }
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: `${targetOrg}/${targetRepo}`,
      operations,
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    if (!ctx.targetWriteClient && !ctx.dryRun) {
      throw new Error(
        'TargetWriteClient must be provided in MigrationContext to apply mutations.',
      );
    }

    const startedAt = Date.now();
    const results: OperationExecutionResult[] = [];
    const targetOrg = ctx.scope.targetOrg;
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';

    for (const operation of plan.operations) {
      const completedAt = new Date().toISOString();

      if (operation.operation === 'noop') {
        results.push({
          operationId: operation.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }

      if (ctx.dryRun) {
        results.push({
          operationId: operation.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }

      // 1. Security Settings PATCH
      if (operation.resourceType === 'repository-security-settings') {
        try {
          const res = await ctx.targetWriteClient!.mutate(
            {
              id: 'rest.repos.updateSecuritySettings',
              method: 'PATCH',
              path: '/repos/{owner}/{repo}',
              pathParams: { owner: targetOrg, repo: targetRepo },
              body: {
                security_and_analysis: operation.payload,
              },
            },
            ctx.signal,
          );

          results.push({
            operationId: operation.id,
            status: res.status < 300 ? 'succeeded' : 'failed',
            httpStatus: res.status,
            completedAt,
          });
        } catch (err) {
          results.push({
            operationId: operation.id,
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            completedAt,
          });
        }
        continue;
      }

      // 2. Secret Scanning Alert Remediation PATCH
      if (operation.resourceType === 'secret-scanning-alert') {
        const match = operation.payload as AlertRemediationMatch;
        try {
          const res = await ctx.targetWriteClient!.mutate(
            {
              id: 'rest.secretScanning.updateAlert',
              method: 'PATCH',
              path: '/repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}',
              pathParams: {
                owner: targetOrg,
                repo: targetRepo,
                alert_number: String(match.targetAlertNumber),
              },
              body: {
                state: 'resolved',
                resolution: match.sourceResolution,
                resolution_comment: match.resolutionComment,
              },
            },
            ctx.signal,
          );

          results.push({
            operationId: operation.id,
            status: res.status < 300 ? 'succeeded' : 'failed',
            httpStatus: res.status,
            completedAt,
          });
        } catch (err) {
          results.push({
            operationId: operation.id,
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            completedAt,
          });
        }
        continue;
      }

      // 3. SARIF Upload POST
      if (operation.resourceType === 'code-scanning-sarif') {
        const analysis = operation.payload as {
          commit_sha: string;
          ref: string;
          sarif?: string;
          tool: { name: string };
        };

        const res = await uploadSarif(ctx, targetOrg, targetRepo, {
          commit_sha: analysis.commit_sha,
          ref: analysis.ref,
          sarif: analysis.sarif ?? '',
          tool_name: analysis.tool.name,
        });

        results.push({
          operationId: operation.id,
          status: res.status < 300 ? 'succeeded' : 'failed',
          httpStatus: res.status,
          error: res.error,
          completedAt,
        });
        continue;
      }

      // Unknown resource type fallback
      results.push({
        operationId: operation.id,
        status: 'succeeded',
        completedAt,
      });
    }

    const isFailed = results.some((r) => r.status === 'failed');

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: isFailed ? 'failed' : 'complete',
      results,
      durationMs: Date.now() - startedAt,
    };
  }

  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const targetOrg = ctx.scope.targetOrg;
    const discrepancies: VerificationDiscrepancy[] = [];

    // 1. Verify settings
    const settingsOp = plan.operations.find(
      (op) => op.resourceType === 'repository-security-settings',
    );
    if (settingsOp && settingsOp.operation === 'update') {
      const currentTargetSettings = await fetchRepositorySecuritySettings(
        ctx,
        targetOrg,
        targetRepo,
        ctx.targetClient,
      );

      const expectedPayload = settingsOp.payload as Record<
        string,
        { status: SecurityFeatureStatus }
      >;

      for (const [feat, expected] of Object.entries(expectedPayload)) {
        const actualStatus = (
          currentTargetSettings as Record<
            string,
            { status: SecurityFeatureStatus }
          >
        )[feat]?.status;

        if (actualStatus !== expected.status) {
          discrepancies.push({
            resourceName: `${targetRepo}:${feat}`,
            expected: expected.status,
            actual: actualStatus ?? 'not_set',
            message: `Security feature '${feat}' expected to be '${expected.status}', but found '${actualStatus}'.`,
          });
        }
      }
    }

    // 2. Verify alert remediations
    const remediationOps = plan.operations.filter(
      (op) =>
        op.resourceType === 'secret-scanning-alert' &&
        op.operation === 'update',
    );

    if (remediationOps.length > 0) {
      const openAlerts = await fetchSecretScanningAlerts(
        ctx,
        targetOrg,
        targetRepo,
        'open',
        ctx.targetClient,
      );
      const openAlertNumbers = new Set(openAlerts.map((a) => a.number));

      for (const op of remediationOps) {
        const match = op.payload as AlertRemediationMatch | undefined;
        if (match && openAlertNumbers.has(match.targetAlertNumber)) {
          discrepancies.push({
            resourceName: `secret-alert-#${match.targetAlertNumber}`,
            expected: 'resolved',
            actual: 'open',
            message: `Secret scanning alert #${match.targetAlertNumber} is still open on target repository.`,
          });
        }
      }
    }

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }

  generateFidelityReport(
    discovered: GhasSecurityDiscoveredData,
    plan: ModulePlan,
    result?: ModuleExecutionResult,
  ): GhasFidelityReport {
    const configuredFeatures: Record<string, SecurityFeatureStatus> = {};
    const settingsOp = plan.operations.find(
      (op) => op.resourceType === 'repository-security-settings',
    );
    if (settingsOp?.payload) {
      for (const [k, v] of Object.entries(
        settingsOp.payload as Record<string, { status: SecurityFeatureStatus }>,
      )) {
        configuredFeatures[k] = v.status;
      }
    }

    const alertOps = plan.operations.filter(
      (op) =>
        op.resourceType === 'secret-scanning-alert' &&
        op.operation === 'update',
    );

    const sarifOp = plan.operations.find(
      (op) => op.resourceType === 'code-scanning-sarif',
    );

    return {
      repository: discovered.repository,
      featuresConfigured: configuredFeatures,
      secretAlertsRemediatedCount: alertOps.length,
      sarifUploaded: Boolean(
        sarifOp && (!result || result.status !== 'failed'),
      ),
      limitationsNotices: [
        SECRET_SCANNING_LIMITATION_NOTICE,
        SARIF_LIMITATION_NOTICE,
      ],
    };
  }
}
