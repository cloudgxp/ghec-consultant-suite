import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
} from '@ghec/contracts';
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
import { OciRegistryClient } from './registry-client.js';
import type {
  MigrationPackage,
  MigrationPackageVersion,
  PackageType,
  PackagesMigrationData,
  PackagesModuleOptions,
  RawApiPackage,
  RawApiPackageVersion,
  RegistryClientInterface,
  ReplicateVersionPayload,
} from './types.js';

const PACKAGE_TYPES: readonly PackageType[] = [
  'container',
  'npm',
  'maven',
  'rubygems',
  'nuget',
];

export class PackagesMigrationModule implements MigrationModule<PackagesMigrationData> {
  readonly id = 'packages';
  readonly displayName = 'Packages & GHCR Container Image Migration';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = ['org-variables', 'org-secrets'];

  private readonly registryClient: RegistryClientInterface;

  constructor(private readonly options: PackagesModuleOptions = {}) {
    this.registryClient = options.registryClient ?? new OciRegistryClient();
  }

  /**
   * Discovers organization packages and their versions across supported ecosystems.
   */
  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<PackagesMigrationData> {
    const org = ctx.scope.sourceOrg;
    if (!org) {
      throw new Error(
        'PackagesMigrationModule requires sourceOrg in migration context.',
      );
    }

    if (this.options.packages && this.options.packages.length > 0) {
      return {
        org,
        packages: this.options.packages,
      };
    }

    // 1. Cached discovery bundle mode
    if (cachedData && typeof cachedData === 'object') {
      const bundle = cachedData as DiscoveryBundle;
      if (bundle.entities) {
        const packageEntities = bundle.entities.filter(
          (e) => e.kind === 'package',
        );
        if (packageEntities.length > 0) {
          const mappedPackages: MigrationPackage[] = packageEntities.map(
            (pe) => {
              const p = pe as unknown as {
                name: string;
                ecosystem?: string;
                visibility?: string;
                repositoryId?: string;
                versions?: MigrationPackageVersion[];
              };
              return {
                id: 0,
                name: p.name,
                packageType: (PACKAGE_TYPES.includes(p.ecosystem as PackageType)
                  ? p.ecosystem
                  : 'container') as PackageType,
                visibility:
                  p.visibility === 'public' ||
                  p.visibility === 'private' ||
                  p.visibility === 'internal'
                    ? p.visibility
                    : 'unknown',
                repositoryName: p.repositoryId
                  ? String(p.repositoryId)
                  : undefined,
                versions: Array.isArray(p.versions)
                  ? p.versions
                  : [{ id: 1, name: 'latest', tags: ['latest'] }],
              };
            },
          );

          return {
            org,
            packages: mappedPackages,
          };
        }
      }
    }

    // 2. Live API discovery
    const packages: MigrationPackage[] = [];

    for (const packageType of PACKAGE_TYPES) {
      if (ctx.signal.aborted) break;

      try {
        let rawPackages: RawApiPackage[] = [];
        const fetchResult = await ctx.sourceClient.fetchAll<RawApiPackage>(
          {
            id: 'rest.packages.listPackages',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/packages',
            pathParams: { org },
            queryParams: { package_type: packageType, per_page: 100 },
          },
          ctx.signal,
        );

        if (fetchResult && Array.isArray(fetchResult.items)) {
          rawPackages = [...fetchResult.items];
        } else {
          const res = await ctx.sourceClient.readSingle<RawApiPackage[]>(
            {
              id: 'rest.packages.listPackages',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/orgs/{org}/packages',
              pathParams: { org },
              queryParams: { package_type: packageType },
            },
            ctx.signal,
          );
          if (res.status === 200 && Array.isArray(res.data)) {
            rawPackages = res.data;
          }
        }

        for (const rawPkg of rawPackages) {
          let versions: MigrationPackageVersion[] = [];

          try {
            const verResult =
              await ctx.sourceClient.fetchAll<RawApiPackageVersion>(
                {
                  id: 'rest.packages.listPackageVersions',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/orgs/{org}/packages/{package_type}/{package_name}/versions',
                  pathParams: {
                    org,
                    package_type: packageType,
                    package_name: rawPkg.name,
                  },
                  queryParams: { per_page: 100 },
                },
                ctx.signal,
              );

            const rawVersions = Array.isArray(verResult?.items)
              ? verResult.items
              : [];
            versions = rawVersions.map(mapApiPackageVersion);
          } catch {
            // If versions endpoint fails or is empty
            versions = [{ id: 1, name: 'latest', tags: ['latest'] }];
          }

          packages.push({
            id: rawPkg.id,
            name: rawPkg.name,
            packageType,
            visibility:
              rawPkg.visibility === 'public' ||
              rawPkg.visibility === 'private' ||
              rawPkg.visibility === 'internal'
                ? rawPkg.visibility
                : 'unknown',
            repositoryName: rawPkg.repository?.name,
            versions,
          });
        }
      } catch (err) {
        ctx.logger.info(
          `Could not list ${packageType} packages for org ${org}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      org,
      packages,
    };
  }

  /**
   * Plans package replication by diffing versions against destination organization.
   */
  async plan(
    ctx: MigrationContext,
    sourceData: PackagesMigrationData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const targetIdentifier = targetOrg;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    // Query destination packages
    const targetPackages = new Map<string, MigrationPackage>();

    for (const packageType of PACKAGE_TYPES) {
      if (ctx.signal.aborted) break;

      try {
        const fetchResult = await ctx.targetClient.fetchAll<RawApiPackage>(
          {
            id: 'rest.packages.listPackages',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/packages',
            pathParams: { org: targetOrg },
            queryParams: { package_type: packageType, per_page: 100 },
          },
          ctx.signal,
        );

        const items = Array.isArray(fetchResult?.items)
          ? fetchResult.items
          : [];
        for (const rawPkg of items) {
          let versions: MigrationPackageVersion[] = [];
          try {
            const verResult =
              await ctx.targetClient.fetchAll<RawApiPackageVersion>(
                {
                  id: 'rest.packages.listPackageVersions',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/orgs/{org}/packages/{package_type}/{package_name}/versions',
                  pathParams: {
                    org: targetOrg,
                    package_type: packageType,
                    package_name: rawPkg.name,
                  },
                  queryParams: { per_page: 100 },
                },
                ctx.signal,
              );
            versions = (verResult?.items ?? []).map(mapApiPackageVersion);
          } catch {
            versions = [];
          }

          const key = `${packageType}:${rawPkg.name.toLowerCase()}`;
          targetPackages.set(key, {
            id: rawPkg.id,
            name: rawPkg.name,
            packageType,
            visibility: 'unknown',
            versions,
          });
        }
      } catch {
        // Target packages lookup failed; assume empty target
      }
    }

    for (const srcPkg of sourceData.packages) {
      const key = `${srcPkg.packageType}:${srcPkg.name.toLowerCase()}`;
      const targetPkg = targetPackages.get(key);

      if (srcPkg.repositoryName) {
        warnings.push(
          `Package "${srcPkg.name}" is linked to repository "${srcPkg.repositoryName}"; ensure repository is migrated to retain linkage.`,
        );
      }

      for (const ver of srcPkg.versions) {
        const opId = `package:${srcPkg.packageType}:${srcPkg.name}:${ver.name}`;
        const payload: ReplicateVersionPayload = {
          packageName: srcPkg.name,
          packageType: srcPkg.packageType,
          versionName: ver.name,
          digest: ver.digest,
          tags: ver.tags,
          repositoryName: srcPkg.repositoryName,
        };

        const targetVer = targetPkg?.versions.find(
          (tv) =>
            tv.name === ver.name ||
            (tv.digest && ver.digest && tv.digest === ver.digest) ||
            tv.tags.some((t) => ver.tags.includes(t)),
        );

        if (!targetVer) {
          operations.push({
            id: opId,
            resourceType: 'package-version',
            resourceName: `${srcPkg.name}@${ver.name}`,
            operation: 'create',
            sourceState: ver,
            payload,
            reason: `Package version "${srcPkg.name}@${ver.name}" (${srcPkg.packageType}) is missing on target organization.`,
          });
        } else {
          operations.push({
            id: opId,
            resourceType: 'package-version',
            resourceName: `${srcPkg.name}@${ver.name}`,
            operation: 'noop',
            sourceState: ver,
            destinationCurrentState: targetVer,
          });
        }
      }
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier,
      operations,
      warnings,
    };
  }

  /**
   * Applies planned package version replications.
   */
  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const results: OperationExecutionResult[] = [];

    const createOps = plan.operations.filter((op) => op.operation === 'create');
    const noopOps = plan.operations.filter((op) => op.operation === 'noop');
    const skipOps = plan.operations.filter((op) => op.operation === 'skip');

    for (const op of noopOps) {
      results.push({
        operationId: op.id,
        status: 'succeeded',
        completedAt: new Date().toISOString(),
      });
    }

    for (const op of skipOps) {
      results.push({
        operationId: op.id,
        status: 'skipped',
        completedAt: new Date().toISOString(),
      });
    }

    if (ctx.dryRun) {
      ctx.logger.info(
        `[DRY-RUN] Simulating replication of ${createOps.length} package versions`,
      );
      for (const op of createOps) {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt: new Date().toISOString(),
        });
      }

      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: 'complete',
        results,
        durationMs: Date.now() - startTime,
      };
    }

    for (const op of createOps) {
      const payload = op.payload as ReplicateVersionPayload;
      const completedAt = new Date().toISOString();

      try {
        if (payload.packageType === 'container') {
          await this.registryClient.replicateContainerVersion(
            ctx.scope.sourceOrg,
            ctx.scope.targetOrg,
            payload.packageName,
            {
              id: 0,
              name: payload.versionName,
              digest: payload.digest,
              tags: payload.tags,
            },
            ctx.signal,
          );
        } else {
          await this.registryClient.replicateLanguagePackage(
            ctx.scope.sourceOrg,
            ctx.scope.targetOrg,
            payload.packageName,
            payload.packageType,
            {
              id: 0,
              name: payload.versionName,
              digest: payload.digest,
              tags: payload.tags,
            },
            ctx.signal,
          );
        }

        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 201,
          completedAt,
        });
      } catch (err) {
        results.push({
          operationId: op.id,
          status: 'failed',
          error:
            (err as Error).message || 'Failed to replicate package version',
          completedAt,
        });
        if (!ctx.continueOnError) break;
      }
    }

    const hasFailed = results.some((r) => r.status === 'failed');
    const hasSucceeded = results.some((r) => r.status === 'succeeded');
    let overallStatus: ModuleExecutionResult['status'];

    if (!hasFailed && hasSucceeded) {
      overallStatus = 'complete';
    } else if (hasFailed && hasSucceeded) {
      overallStatus = 'partial';
    } else if (hasFailed && !hasSucceeded) {
      overallStatus = 'failed';
    } else {
      overallStatus = 'skipped';
    }

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: overallStatus,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Verifies destination organization packages and versions.
   */
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetOrg = ctx.scope.targetOrg;
    const discrepancies: VerificationDiscrepancy[] = [];

    const targetPackages = new Map<string, MigrationPackage>();

    for (const packageType of PACKAGE_TYPES) {
      if (ctx.signal.aborted) break;

      try {
        const fetchResult = await ctx.targetClient.fetchAll<RawApiPackage>(
          {
            id: 'rest.packages.listPackages',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/packages',
            pathParams: { org: targetOrg },
            queryParams: { package_type: packageType, per_page: 100 },
          },
          ctx.signal,
        );

        const items = Array.isArray(fetchResult?.items)
          ? fetchResult.items
          : [];
        for (const rawPkg of items) {
          let versions: MigrationPackageVersion[] = [];
          try {
            const verResult =
              await ctx.targetClient.fetchAll<RawApiPackageVersion>(
                {
                  id: 'rest.packages.listPackageVersions',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/orgs/{org}/packages/{package_type}/{package_name}/versions',
                  pathParams: {
                    org: targetOrg,
                    package_type: packageType,
                    package_name: rawPkg.name,
                  },
                  queryParams: { per_page: 100 },
                },
                ctx.signal,
              );
            versions = (verResult?.items ?? []).map(mapApiPackageVersion);
          } catch {
            versions = [];
          }

          const key = `${packageType}:${rawPkg.name.toLowerCase()}`;
          targetPackages.set(key, {
            id: rawPkg.id,
            name: rawPkg.name,
            packageType,
            visibility: 'unknown',
            versions,
          });
        }
      } catch (err) {
        discrepancies.push({
          resourceName: `${targetOrg}/${packageType}`,
          expected: 'reachable',
          actual: 'unreachable',
          message: `Failed to query destination packages: ${(err as Error).message}`,
        });
      }
    }

    for (const op of plan.operations) {
      if (op.resourceType === 'package-version' && op.operation !== 'skip') {
        const payload = op.payload as ReplicateVersionPayload | undefined;
        if (!payload) continue;

        const key = `${payload.packageType}:${payload.packageName.toLowerCase()}`;
        const targetPkg = targetPackages.get(key);

        if (!targetPkg) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: 'present',
            actual: 'missing',
            message: `Package "${payload.packageName}" (${payload.packageType}) is missing on target organization ${targetOrg}.`,
          });
          continue;
        }

        const targetVer = targetPkg.versions.find(
          (tv) =>
            tv.name === payload.versionName ||
            (tv.digest && payload.digest && tv.digest === payload.digest) ||
            tv.tags.some((t) => payload.tags.includes(t)),
        );

        if (!targetVer) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: 'present',
            actual: 'missing',
            message: `Package version "${op.resourceName}" (${payload.packageType}) is missing on target organization ${targetOrg}.`,
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
}

function mapApiPackageVersion(
  raw: RawApiPackageVersion,
): MigrationPackageVersion {
  const containerTags =
    raw.metadata?.container?.tags ?? raw.metadata?.docker?.tags ?? [];
  return {
    id: raw.id,
    name: raw.name,
    digest: raw.name.startsWith('sha256:') ? raw.name : undefined,
    tags: containerTags.length > 0 ? containerTags : [raw.name],
  };
}
