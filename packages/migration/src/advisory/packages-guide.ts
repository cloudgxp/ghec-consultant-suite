import type { DiscoveryBundle } from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import { formatBytes } from '../preflight/sizer.js';
import type { PackageCutoverItem } from './types.js';

interface RawGitHubPackage {
  readonly id?: number | string | undefined;
  readonly name?: string | undefined;
  readonly package_type?: string | undefined;
  readonly visibility?: string | undefined;
  readonly version_count?: number | undefined;
  readonly repository?: { readonly name?: string | undefined } | undefined;
}

export class PackagesCutoverPlanner {
  /**
   * Generates cutover commands appropriate for the package ecosystem.
   */
  generateCutoverCommands(
    name: string,
    ecosystem: PackageCutoverItem['ecosystem'],
    sourceOrg: string,
    targetOrg: string,
  ): string[] {
    switch (ecosystem) {
      case 'container':
        return [
          `docker pull ghcr.io/${sourceOrg}/${name}:latest`,
          `docker tag ghcr.io/${sourceOrg}/${name}:latest ghcr.io/${targetOrg}/${name}:latest`,
          `docker push ghcr.io/${targetOrg}/${name}:latest`,
        ];
      case 'npm':
        return [
          `# In project .npmrc:`,
          `@${targetOrg}:registry=https://npm.pkg.github.com`,
          `npm publish`,
        ];
      case 'maven':
        return [
          `# In pom.xml <distributionManagement>:`,
          `<url>https://maven.pkg.github.com/${targetOrg}</url>`,
          `mvn deploy`,
        ];
      case 'nuget':
        return [
          `dotnet nuget push <package>.nupkg --source https://nuget.pkg.github.com/${targetOrg}/index.json`,
        ];
      case 'rubygems':
        return [
          `gem push <package>.gem --host https://rubygems.pkg.github.com/${targetOrg}`,
        ];
      default:
        return [
          `# Rebuild and republish package to destination registry under ${targetOrg}`,
        ];
    }
  }

  /**
   * Discovers packages from live API or discovery bundle.
   */
  async discover(
    sourceOrg: string,
    targetOrg: string,
    adapter?: GitHubReadAdapter | undefined,
    discoveryBundle?: DiscoveryBundle | undefined,
    signal?: AbortSignal | undefined,
  ): Promise<PackageCutoverItem[]> {
    const packages: PackageCutoverItem[] = [];

    // 1. Query live API across supported package types if adapter is available
    if (adapter) {
      const packageTypes = [
        'container',
        'npm',
        'maven',
        'rubygems',
        'nuget',
      ] as const;

      for (const pType of packageTypes) {
        try {
          const res = await adapter.fetchAll<RawGitHubPackage>(
            {
              id: `rest.packages.listPackages_${pType}`,
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/orgs/{org}/packages',
              pathParams: { org: sourceOrg },
              queryParams: { package_type: pType, per_page: 100 },
            },
            signal ?? new AbortController().signal,
          );

          if (res.items && res.items.length > 0) {
            for (const item of res.items) {
              const name = item.name ?? 'unknown';
              packages.push({
                id: item.id ? String(item.id) : undefined,
                name,
                ecosystem: pType,
                visibility:
                  item.visibility === 'public' || item.visibility === 'internal'
                    ? item.visibility
                    : 'private',
                versionCount: item.version_count ?? 1,
                sizeBytes: null,
                repositoryName: item.repository?.name ?? null,
                cutoverCommands: this.generateCutoverCommands(
                  name,
                  pType,
                  sourceOrg,
                  targetOrg,
                ),
              });
            }
          }
        } catch {
          // If a package type endpoint fails or is unauthorized, proceed with next
        }
      }
    }

    // 2. Fall back to or supplement from discovery bundle
    if (packages.length === 0 && discoveryBundle) {
      const packageEntities = discoveryBundle.entities.filter(
        (e) => e.kind === 'package',
      );

      for (const entity of packageEntities) {
        if (entity.kind === 'package') {
          const ecosystem = (
            ['container', 'npm', 'maven', 'nuget', 'rubygems'].includes(
              entity.ecosystem,
            )
              ? entity.ecosystem
              : 'unknown'
          ) as PackageCutoverItem['ecosystem'];

          packages.push({
            id: entity.id,
            name: entity.name,
            ecosystem,
            visibility: entity.visibility,
            versionCount: entity.versionCount.value ?? 1,
            sizeBytes: entity.size.value,
            cutoverCommands: this.generateCutoverCommands(
              entity.name,
              ecosystem,
              sourceOrg,
              targetOrg,
            ),
          });
        }
      }
    }

    return packages;
  }

  /**
   * Generates the GitHub Packages Cutover Guide markdown document.
   */
  generatePackagesGuideMarkdown(
    packages: readonly PackageCutoverItem[],
    sourceOrg: string,
    targetOrg: string,
  ): string {
    const lines: string[] = [
      `# GitHub Packages Migration & Cutover Blueprint`,
      '',
      `**Source Organization:** \`${sourceOrg}\`  `,
      `**Target Organization:** \`${targetOrg}\`  `,
      '',
      `> [!IMPORTANT]`,
      `> **Platform Design Notice:** GitHub Enterprise Importer (GEI) intentionally does **not** migrate packages stored in GitHub Packages (\`ghcr.io\`, npm, Maven, NuGet, RubyGems). Artifact binaries must be republished to the destination registry during cutover.`,
      '',
      `## 1. Discovered Packages Inventory`,
      '',
    ];

    if (packages.length === 0) {
      lines.push(
        `No hosted packages were discovered in source organization \`${sourceOrg}\`. No package registry cutover operations required.`,
      );
      return lines.join('\n');
    }

    lines.push(
      '| Package Name | Ecosystem | Visibility | Versions | Estimated Size | Associated Repository |',
      '|---|---|---|---|---|---|',
    );

    for (const pkg of packages) {
      const sizeStr =
        pkg.sizeBytes !== null ? formatBytes(pkg.sizeBytes) : 'Unmeasured';
      const repoStr = pkg.repositoryName ? `\`${pkg.repositoryName}\`` : '—';
      lines.push(
        `| \`${pkg.name}\` | **${pkg.ecosystem.toUpperCase()}** | \`${pkg.visibility}\` | ${pkg.versionCount} | ${sizeStr} | ${repoStr} |`,
      );
    }

    lines.push('', '## 2. Registry Republishing Playbooks', '');

    const groupedByEcosystem = new Map<string, PackageCutoverItem[]>();
    for (const pkg of packages) {
      const existing = groupedByEcosystem.get(pkg.ecosystem) ?? [];
      existing.push(pkg);
      groupedByEcosystem.set(pkg.ecosystem, existing);
    }

    for (const [ecosystem, items] of groupedByEcosystem.entries()) {
      lines.push(`### ${ecosystem.toUpperCase()} Registry Cutover`);
      lines.push(
        `The following ${items.length} package(s) require re-publishing to \`${targetOrg}\`:`,
        '',
      );

      for (const item of items) {
        lines.push(`#### \`${item.name}\``);
        lines.push('```bash');
        lines.push(...item.cutoverCommands);
        lines.push('```', '');
      }
    }

    return lines.join('\n');
  }
}
