import type {
  DiscoveryBundle,
  MigrationPlan,
  PlannedOperation,
} from '@ghec/contracts';
import { sanitizeDiagnostics } from '@ghec/github-client';
import { sanitizeCsvCell } from '../advisory/apps-matrix.js';
import {
  buildGitHubAppUrlParametersLink,
  buildRecreatedAppSlug,
} from '../modules/apps-inventory/manifest.js';
import type {
  GranularMigrationItemRow,
  OrgModuleDetailModel,
  RepositoryModuleDetailModel,
} from './results-markdown-formatter.js';
import { escapeMarkdownTableCell } from './results-markdown-formatter.js';

export type PostCareOperationalMode = 'discovery' | 'dry-run' | 'live';

export type PostCareCategory =
  | 'secret'
  | 'webhook'
  | 'github-app'
  | 'runner'
  | 'deploy-key'
  | 'mannequin'
  | 'idp-team'
  | 'collaborator'
  | 'policy'
  | 'package'
  | 'security'
  | 'failed-operation';

export type PostCarePriority = 'high' | 'medium' | 'low';

export type PostCareMigrationStatus =
  | 'sealed-placeholder'
  | 'inactive-webhook'
  | 'manual-action-required'
  | 'failed'
  | 'skipped'
  | 'discrepancy'
  | 'planned'
  | 'discovered';

export interface PostCareItem {
  readonly itemId: string;
  readonly mode: PostCareOperationalMode;
  readonly priority: PostCarePriority;
  readonly category: PostCareCategory;
  readonly scopeLevel: 'organization' | 'repository' | 'environment';
  readonly targetOrg: string;
  readonly targetRepo?: string | undefined;
  readonly environmentName?: string | undefined;
  readonly moduleId: string;
  readonly resourceType: string;
  readonly resourceName: string;
  readonly subDomain: string;
  readonly migrationStatus: PostCareMigrationStatus;
  readonly actionRequired: string;
  readonly settingsUrl: string;
  readonly secondaryUrl?: string | undefined;
  readonly cliCommand?: string | undefined;
  readonly notes?: string | undefined;
}

export interface FullMigrationOperationRow {
  readonly scopeLevel: 'organization' | 'repository' | 'environment';
  readonly targetOrg: string;
  readonly targetRepo: string;
  readonly moduleId: string;
  readonly resourceName: string;
  readonly resourceType: string;
  readonly subDomain: string;
  readonly operationType: string;
  readonly status: string;
  readonly verificationStatus: string;
  readonly requiresPostCare: boolean;
  readonly settingsUrl: string;
  readonly cliCommand: string;
  readonly notes: string;
}

export interface ResolvedSettingsLinks {
  readonly settingsUrl: string;
  readonly settingsLinkLabel: string;
  readonly secondaryUrl?: string | undefined;
  readonly secondaryLinkLabel?: string | undefined;
  readonly cliCommand?: string | undefined;
  readonly subDomain: string;
  readonly environmentName?: string | undefined;
  readonly cleanResourceName: string;
}

export interface GeneratePostCareOptions {
  readonly runId?: string | undefined;
  readonly generatedAt?: string | undefined;
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly mode: PostCareOperationalMode;
  readonly discoveryBundle?: DiscoveryBundle | undefined;
  readonly plan?: MigrationPlan | undefined;
  readonly orgModuleModels?:
    | ReadonlyMap<string, OrgModuleDetailModel>
    | readonly OrgModuleDetailModel[]
    | undefined;
  readonly repoModuleModels?:
    | ReadonlyMap<string, RepositoryModuleDetailModel>
    | readonly RepositoryModuleDetailModel[]
    | undefined;
  readonly repoSourceToTarget?: ReadonlyMap<string, string> | undefined;
}

export interface GeneratedPostCareDeliverables {
  readonly items: readonly PostCareItem[];
  readonly operationRows: readonly FullMigrationOperationRow[];
  readonly checklistMarkdown: string;
  readonly csvFiles: Readonly<Record<string, string>>;
}

export type PostCareDeliverables = GeneratedPostCareDeliverables;

/**
 * Extracts secret domain ('actions' | 'dependabot' | 'codespaces' | 'agents') from available operation context.
 */
export function extractSecretDomain(params: {
  readonly operationId?: string | undefined;
  readonly resourceType?: string | undefined;
  readonly resourceName?: string | undefined;
  readonly notes?: string | undefined;
  readonly plannedOp?: PlannedOperation | undefined;
}): 'actions' | 'dependabot' | 'codespaces' | 'agents' {
  const { operationId, resourceType, resourceName, notes, plannedOp } = params;

  const payloadDomain =
    plannedOp?.payload &&
    typeof plannedOp.payload === 'object' &&
    'domain' in plannedOp.payload
      ? (plannedOp.payload as { domain?: unknown }).domain
      : undefined;
  if (
    payloadDomain === 'actions' ||
    payloadDomain === 'dependabot' ||
    payloadDomain === 'codespaces' ||
    payloadDomain === 'agents'
  ) {
    return payloadDomain;
  }
  if (payloadDomain === 'copilot') {
    return 'agents';
  }

  const stateDomain =
    plannedOp?.sourceState &&
    typeof plannedOp.sourceState === 'object' &&
    'domain' in plannedOp.sourceState
      ? (plannedOp.sourceState as { domain?: unknown }).domain
      : undefined;
  if (
    stateDomain === 'actions' ||
    stateDomain === 'dependabot' ||
    stateDomain === 'codespaces' ||
    stateDomain === 'agents'
  ) {
    return stateDomain;
  }
  if (stateDomain === 'copilot') {
    return 'agents';
  }

  const combined = [
    operationId ?? '',
    resourceType ?? '',
    resourceName ?? '',
    notes ?? '',
    plannedOp?.reason ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (combined.includes('dependabot')) {
    return 'dependabot';
  }
  if (combined.includes('codespaces')) {
    return 'codespaces';
  }
  if (
    combined.includes(':agents:') ||
    combined.includes('agents:') ||
    combined.includes('agents secret') ||
    combined.includes('agent secret') ||
    combined.includes('copilot')
  ) {
    return 'agents';
  }
  return 'actions';
}

/**
 * Strips leading domain prefix ('actions:', 'dependabot:', 'codespaces:', 'agents:') from a secret or variable name if present.
 */
export function stripSecretDomainPrefix(name: string): string {
  return name.replace(/^(actions|dependabot|codespaces|agents):/i, '');
}

/**
 * Resolves deterministic target GitHub Settings deep links and copy-pasteable gh CLI commands
 * for any module and resource across organization, repository, and environment scopes.
 */
export function resolveTargetSettingsLinks(params: {
  readonly moduleId: string;
  readonly resourceType: string;
  readonly resourceName: string;
  readonly targetOrg: string;
  readonly targetRepo?: string | undefined;
  readonly operationId?: string | undefined;
  readonly notes?: string | undefined;
  readonly plannedOp?: PlannedOperation | undefined;
}): ResolvedSettingsLinks {
  const {
    moduleId,
    resourceType,
    resourceName,
    targetOrg,
    targetRepo,
    operationId,
    notes,
    plannedOp,
  } = params;

  const modLower = moduleId.toLowerCase();
  const typeLower = resourceType.toLowerCase();
  const encOrg = encodeURIComponent(targetOrg);
  const encRepo = targetRepo ? encodeURIComponent(targetRepo) : '';

  // 1. Environment Secrets & Environments
  if (
    typeLower === 'environment-secret' ||
    (modLower === 'environments' &&
      (typeLower.includes('secret') ||
        (operationId?.includes(':secret:') ?? false)))
  ) {
    const slashIdx = resourceName.indexOf('/');
    const colonIdx = resourceName.indexOf(':');
    const sepIdx = slashIdx !== -1 ? slashIdx : colonIdx !== -1 ? colonIdx : -1;
    const envName =
      sepIdx !== -1 ? resourceName.slice(0, sepIdx) : 'production';
    const secretName =
      sepIdx !== -1 ? resourceName.slice(sepIdx + 1) : resourceName;
    const settingsUrl = encRepo
      ? `https://github.com/${encOrg}/${encRepo}/settings/environments`
      : `https://github.com/organizations/${encOrg}/settings/secrets/actions`;
    return {
      settingsUrl,
      settingsLinkLabel: 'Edit Environment Secret ↗',
      cliCommand: targetRepo
        ? `gh secret set ${secretName} --repo ${targetOrg}/${targetRepo} --env "${envName}"`
        : undefined,
      subDomain: 'environment',
      environmentName: envName,
      cleanResourceName: secretName,
    };
  }

  if (modLower === 'environments' || typeLower.startsWith('environment')) {
    const slashIdx = resourceName.indexOf('/');
    const envName =
      slashIdx !== -1 ? resourceName.slice(0, slashIdx) : resourceName;
    const settingsUrl = encRepo
      ? `https://github.com/${encOrg}/${encRepo}/settings/environments`
      : `https://github.com/organizations/${encOrg}/settings/profile`;
    return {
      settingsUrl,
      settingsLinkLabel: 'Open Environments Settings ↗',
      subDomain: 'environment',
      environmentName: envName,
      cleanResourceName: resourceName,
    };
  }

  // 2. Organization Secrets
  if (
    modLower === 'org-secrets' ||
    modLower === 'actions-secrets' ||
    typeLower === 'organization-secret' ||
    typeLower === 'org-secret' ||
    (!targetRepo && typeLower.includes('secret'))
  ) {
    const domain = extractSecretDomain({
      operationId,
      resourceType,
      resourceName,
      notes,
      plannedOp,
    });
    const cleanName = stripSecretDomainPrefix(resourceName);
    const encSecret = encodeURIComponent(cleanName);
    return {
      settingsUrl: `https://github.com/organizations/${encOrg}/settings/secrets/${domain}/${encSecret}`,
      settingsLinkLabel: `Edit Org ${capitalize(domain)} Secret ↗`,
      secondaryUrl: `https://github.com/organizations/${encOrg}/settings/secrets/${domain}`,
      secondaryLinkLabel: `All Org ${capitalize(domain)} Secrets ↗`,
      cliCommand: `gh secret set ${cleanName} --org ${targetOrg} --app ${domain}`,
      subDomain: domain,
      cleanResourceName: cleanName,
    };
  }

  // 3. Repository Secrets
  if (
    modLower === 'repo-secrets' ||
    typeLower === 'repo-secret' ||
    typeLower === 'secret' ||
    (Boolean(targetRepo) && typeLower.includes('secret'))
  ) {
    const domain = extractSecretDomain({
      operationId,
      resourceType,
      resourceName,
      notes,
      plannedOp,
    });
    const cleanName = stripSecretDomainPrefix(resourceName);
    const encSecret = encodeURIComponent(cleanName);
    const repoPath = encRepo ? `${encOrg}/${encRepo}` : encOrg;
    return {
      settingsUrl: `https://github.com/${repoPath}/settings/secrets/${domain}/${encSecret}`,
      settingsLinkLabel: `Edit Repo ${capitalize(domain)} Secret ↗`,
      secondaryUrl: `https://github.com/${repoPath}/settings/secrets/${domain}`,
      secondaryLinkLabel: `All Repo ${capitalize(domain)} Secrets ↗`,
      cliCommand: targetRepo
        ? `gh secret set ${cleanName} --repo ${targetOrg}/${targetRepo} --app ${domain}`
        : `gh secret set ${cleanName} --org ${targetOrg} --app ${domain}`,
      subDomain: domain,
      cleanResourceName: cleanName,
    };
  }

  // 4. GitHub Apps
  if (
    modLower === 'apps-inventory' ||
    typeLower === 'github_app_installation' ||
    typeLower === 'github-app-installation' ||
    typeLower === 'github_app' ||
    typeLower === 'github_app_repository_binding'
  ) {
    const appSlug = resourceName;
    const payload =
      plannedOp?.payload && typeof plannedOp.payload === 'object'
        ? (plannedOp.payload as Record<string, unknown>)
        : undefined;
    const combinedNotes = `${notes ?? ''} ${plannedOp?.reason ?? ''}`;
    const isCustomPrivate =
      payload?.classification === 'custom_private' ||
      combinedNotes.toLowerCase().includes('private custom app');
    const installUrl =
      typeof payload?.destination_install_url === 'string'
        ? payload.destination_install_url
        : (extractUrlFromText(combinedNotes, 'Install URL:') ??
          `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new`);
    const recreateUrl =
      typeof payload?.recreate_app_url === 'string'
        ? payload.recreate_app_url
        : (extractUrlFromText(combinedNotes, 'Recreate URL:') ??
          buildGitHubAppUrlParametersLink(
            {
              app_id: 0,
              app_slug: appSlug,
              permissions: {},
              events: [],
            },
            targetOrg,
          ));
    const recreatedSlug =
      typeof payload?.recreated_app_slug === 'string'
        ? payload.recreated_app_slug
        : buildRecreatedAppSlug(appSlug, targetOrg);

    return {
      settingsUrl: installUrl,
      settingsLinkLabel: 'Marketplace / Install Link ↗',
      secondaryUrl: recreateUrl,
      secondaryLinkLabel: `Custom Recreate Link (${recreatedSlug}) ↗`,
      cliCommand: `node scripts/register-app.mjs --org ${targetOrg} --app ${appSlug}`,
      subDomain: isCustomPrivate ? 'custom_private' : 'third_party_or_public',
      cleanResourceName: appSlug,
    };
  }

  // 5. Webhooks (Org & Repo)
  if (
    modLower === 'webhooks' ||
    modLower === 'org-webhooks' ||
    typeLower === 'webhook' ||
    typeLower === 'org-webhook'
  ) {
    if (targetRepo && modLower !== 'org-webhooks') {
      return {
        settingsUrl: `https://github.com/${encOrg}/${encRepo}/settings/hooks`,
        settingsLinkLabel: 'Configure Repo Webhooks ↗',
        cliCommand: `gh api --method PATCH /repos/${targetOrg}/${targetRepo}/hooks/<HOOK_ID> -f "config[url]=${resourceName}" -f "config[content_type]=json" -f "config[secret]=<SECRET>" -F active=true`,
        subDomain: 'repo-webhook',
        cleanResourceName: resourceName,
      };
    }
    return {
      settingsUrl: `https://github.com/organizations/${encOrg}/settings/hooks`,
      settingsLinkLabel: 'Configure Org Webhooks ↗',
      cliCommand: `gh api --method PATCH /orgs/${targetOrg}/hooks/<HOOK_ID> -f "config[url]=${resourceName}" -f "config[content_type]=json" -f "config[secret]=<SECRET>" -F active=true`,
      subDomain: 'org-webhook',
      cleanResourceName: resourceName,
    };
  }

  // 6. Self-Hosted Runners, Larger GitHub-Hosted Runners & Runner Groups
  if (
    modLower === 'actions-runners' ||
    typeLower === 'actions_runner_group' ||
    typeLower === 'actions-runner' ||
    typeLower === 'action-runner' ||
    typeLower === 'action-runner-group' ||
    typeLower === 'hosted-runner'
  ) {
    const combinedNotes =
      `${notes ?? ''} ${plannedOp?.reason ?? ''}`.toLowerCase();
    const isHostedRunner =
      typeLower === 'hosted-runner' ||
      (operationId?.toLowerCase().includes('hosted-runner') ?? false) ||
      combinedNotes.includes('hosted runner');
    if (isHostedRunner) {
      return {
        settingsUrl: `https://github.com/organizations/${encOrg}/settings/actions/runners`,
        settingsLinkLabel: 'View GitHub-Hosted Runners ↗',
        secondaryUrl: `https://github.com/organizations/${encOrg}/settings/billing`,
        secondaryLinkLabel: 'Verify Actions Spending Limit ↗',
        cliCommand: `gh api /orgs/${targetOrg}/actions/hosted-runners`,
        subDomain: 'hosted-runner',
        cleanResourceName: resourceName,
      };
    }
    if (targetRepo) {
      return {
        settingsUrl: `https://github.com/${encOrg}/${encRepo}/settings/actions/runners/new`,
        settingsLinkLabel: 'Register Repo Runner ↗',
        secondaryUrl: `https://github.com/${encOrg}/${encRepo}/settings/actions/runners`,
        secondaryLinkLabel: 'View Repo Runners ↗',
        cliCommand: `gh api --method POST /repos/${targetOrg}/${targetRepo}/actions/runners/registration-token`,
        subDomain: 'repo-runner',
        cleanResourceName: resourceName,
      };
    }
    const isGroup = typeLower.includes('group');
    return {
      settingsUrl: isGroup
        ? `https://github.com/organizations/${encOrg}/settings/actions/runner-groups`
        : `https://github.com/organizations/${encOrg}/settings/actions/runners/new`,
      settingsLinkLabel: isGroup
        ? 'Manage Runner Groups ↗'
        : 'Register Org Runner ↗',
      secondaryUrl: `https://github.com/organizations/${encOrg}/settings/actions/runners/new`,
      secondaryLinkLabel: 'Register New Org Runner ↗',
      cliCommand: `gh api --method POST /orgs/${targetOrg}/actions/runners/registration-token`,
      subDomain: isGroup ? 'runner-group' : 'org-runner',
      cleanResourceName: resourceName,
    };
  }

  // 7. Deploy Keys
  if (modLower === 'deploy-keys' || typeLower === 'deploy-key') {
    const settingsUrl = encRepo
      ? `https://github.com/${encOrg}/${encRepo}/settings/keys`
      : `https://github.com/organizations/${encOrg}/settings/keys`;
    return {
      settingsUrl,
      settingsLinkLabel: 'Manage Deploy Keys ↗',
      cliCommand: targetRepo
        ? `ghec-consultant-cli cutover --source-org <SOURCE_ORG> --target-org ${targetOrg} --repos ${targetRepo} --include-deploy-keys`
        : undefined,
      subDomain: 'ssh-deploy-key',
      cleanResourceName: resourceName,
    };
  }

  // 8. Mannequins
  if (
    modLower === 'mannequins' ||
    modLower === 'post-migration-mannequins' ||
    typeLower.includes('mannequin')
  ) {
    return {
      settingsUrl: `https://github.com/organizations/${encOrg}/people`,
      settingsLinkLabel: 'Review Org Members & Mannequins ↗',
      cliCommand: `gh gei reclaim-mannequin --github-target-org ${targetOrg} --csv-file mannequin-mappings.csv`,
      subDomain: 'mannequin',
      cleanResourceName: resourceName,
    };
  }

  // 9. Teams & EMU IdP Sync
  if (modLower === 'teams' || typeLower.startsWith('team')) {
    const teamSlug = resourceName.split(':')[0] ?? resourceName;
    const encTeam = encodeURIComponent(
      teamSlug.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    );
    return {
      settingsUrl: `https://github.com/orgs/${encOrg}/teams/${encTeam}/Sync`,
      settingsLinkLabel: 'Open Team IdP Group Sync ↗',
      secondaryUrl: `https://github.com/orgs/${encOrg}/teams/${encTeam}/edit`,
      secondaryLinkLabel: 'Edit Team Settings ↗',
      cliCommand: `gh api --method PATCH /orgs/${targetOrg}/teams/${encTeam}/external-groups -f group_id=<IDP_GROUP_ID>`,
      subDomain: typeLower === 'team-idp-group' ? 'team' : typeLower,
      cleanResourceName: teamSlug,
    };
  }

  // 10. Outside Collaborators
  if (modLower === 'collaborators' || typeLower === 'collaborator') {
    const settingsUrl = encRepo
      ? `https://github.com/${encOrg}/${encRepo}/settings/access`
      : `https://github.com/organizations/${encOrg}/people`;
    return {
      settingsUrl,
      settingsLinkLabel: 'Manage Repository Access ↗',
      cliCommand: targetRepo
        ? `gh api --method PUT /repos/${targetOrg}/${targetRepo}/collaborators/${resourceName} -f permission=push`
        : undefined,
      subDomain: 'collaborator',
      cleanResourceName: resourceName,
    };
  }

  // 11. Rulesets & Branch Protection
  if (modLower === 'branch-protection' || typeLower === 'branch-protection') {
    return {
      settingsUrl: encRepo
        ? `https://github.com/${encOrg}/${encRepo}/settings/branches`
        : `https://github.com/organizations/${encOrg}/settings/rules`,
      settingsLinkLabel: 'Configure Branch Protection ↗',
      subDomain: 'branch-protection',
      cleanResourceName: resourceName,
    };
  }

  if (
    modLower === 'rulesets' ||
    modLower === 'org-rulesets' ||
    modLower === 'rulesets-org' ||
    typeLower.includes('ruleset')
  ) {
    const isOrgRuleset =
      !targetRepo ||
      modLower === 'org-rulesets' ||
      modLower === 'rulesets-org' ||
      typeLower === 'org-ruleset';
    return {
      settingsUrl: isOrgRuleset
        ? `https://github.com/organizations/${encOrg}/settings/rules`
        : `https://github.com/${encOrg}/${encRepo}/settings/rules`,
      settingsLinkLabel: isOrgRuleset
        ? 'Configure Org Rulesets ↗'
        : 'Configure Repo Rulesets ↗',
      subDomain: isOrgRuleset ? 'org-ruleset' : 'repo-ruleset',
      cleanResourceName: resourceName,
    };
  }

  // 12. Packages
  if (modLower === 'packages' || typeLower === 'package') {
    return {
      settingsUrl: `https://github.com/orgs/${encOrg}/packages`,
      settingsLinkLabel: 'View Org Packages ↗',
      subDomain: 'packages',
      cleanResourceName: resourceName,
    };
  }

  // 13. Security & Codeowners
  if (
    modLower === 'codeowners' ||
    modLower === 'post-migration-codeowners' ||
    typeLower.includes('codeowners')
  ) {
    const rawPath = resourceName.startsWith('/')
      ? resourceName.slice(1)
      : resourceName;
    const cleanPath = rawPath.endsWith('.md') ? `${rawPath}#L1` : rawPath;
    return {
      settingsUrl: encRepo
        ? `https://github.com/${encOrg}/${encRepo}/blob/HEAD/${cleanPath}`
        : `https://github.com/${encOrg}`,
      settingsLinkLabel: 'Inspect CODEOWNERS ↗',
      subDomain: 'codeowners',
      cleanResourceName: resourceName,
    };
  }

  if (
    modLower === 'security' ||
    modLower === 'post-migration-security' ||
    typeLower.includes('security')
  ) {
    return {
      settingsUrl: encRepo
        ? `https://github.com/${encOrg}/${encRepo}/settings/security_analysis`
        : `https://github.com/organizations/${encOrg}/settings/security_analysis`,
      settingsLinkLabel: 'Configure Code Security & GHAS ↗',
      secondaryUrl: encRepo
        ? `https://github.com/${encOrg}/${encRepo}/security/secret-scanning`
        : undefined,
      secondaryLinkLabel: encRepo ? 'Secret Scanning Alerts ↗' : undefined,
      subDomain: 'security',
      cleanResourceName: resourceName,
    };
  }

  // 14. Variables, Custom Properties, Settings, Policies, Roles, IP Allow Lists, Releases, Issues, PRs, Discussions, Projects
  if (modLower === 'org-variables' || typeLower === 'org-variable') {
    const isAgentsVar =
      (operationId?.includes(':agents:') ?? false) ||
      /^agents:/i.test(resourceName) ||
      (plannedOp?.sourceState as { domain?: unknown } | undefined)?.domain ===
        'agents' ||
      /\bagent(?:s)?\s+variable\b/i.test(
        `${notes ?? ''} ${plannedOp?.reason ?? ''}`,
      );
    const cleanName = stripSecretDomainPrefix(resourceName);
    if (isAgentsVar) {
      return {
        settingsUrl: `https://github.com/organizations/${encOrg}/settings/variables/agents`,
        settingsLinkLabel: 'Org Agents Variables ↗',
        cliCommand: `gh api -X POST /orgs/${targetOrg}/agents/variables -f name=${cleanName} -f value="<VALUE>" -f visibility=private`,
        subDomain: 'agents-variable',
        cleanResourceName: cleanName,
      };
    }
    return {
      settingsUrl: `https://github.com/organizations/${encOrg}/settings/variables/actions`,
      settingsLinkLabel: 'Org Actions Variables ↗',
      cliCommand: `gh variable set ${cleanName} --org ${targetOrg}`,
      subDomain: 'actions-variable',
      cleanResourceName: cleanName,
    };
  }
  if (modLower === 'repo-variables' || typeLower === 'repo-variable') {
    const isAgentsVar =
      (operationId?.includes(':agents:') ?? false) ||
      /^agents:/i.test(resourceName) ||
      (plannedOp?.sourceState as { domain?: unknown } | undefined)?.domain ===
        'agents' ||
      /\bagent(?:s)?\s+variable\b/i.test(
        `${notes ?? ''} ${plannedOp?.reason ?? ''}`,
      );
    const cleanName = stripSecretDomainPrefix(resourceName);
    if (isAgentsVar) {
      return {
        settingsUrl: encRepo
          ? `https://github.com/${encOrg}/${encRepo}/settings/variables/agents`
          : `https://github.com/organizations/${encOrg}/settings/variables/agents`,
        settingsLinkLabel: 'Repo Agents Variables ↗',
        cliCommand: targetRepo
          ? `gh api -X POST /repos/${targetOrg}/${targetRepo}/agents/variables -f name=${cleanName} -f value="<VALUE>"`
          : undefined,
        subDomain: 'agents-variable',
        cleanResourceName: cleanName,
      };
    }
    return {
      settingsUrl: encRepo
        ? `https://github.com/${encOrg}/${encRepo}/settings/variables/actions`
        : `https://github.com/organizations/${encOrg}/settings/variables/actions`,
      settingsLinkLabel: 'Repo Actions Variables ↗',
      cliCommand: targetRepo
        ? `gh variable set ${cleanName} --repo ${targetOrg}/${targetRepo}`
        : undefined,
      subDomain: 'actions-variable',
      cleanResourceName: cleanName,
    };
  }
  if (
    modLower === 'org-custom-properties' ||
    modLower === 'custom-properties' ||
    typeLower === 'custom-property-definition'
  ) {
    return {
      settingsUrl: `https://github.com/organizations/${encOrg}/settings/custom-properties`,
      settingsLinkLabel: 'Org Custom Properties ↗',
      subDomain: 'custom-property',
      cleanResourceName: resourceName,
    };
  }
  if (
    modLower === 'repo-custom-properties' ||
    typeLower === 'repo-custom-property'
  ) {
    return {
      settingsUrl: encRepo
        ? `https://github.com/${encOrg}/${encRepo}/settings/custom-properties`
        : `https://github.com/organizations/${encOrg}/settings/custom-properties`,
      settingsLinkLabel: 'Repo Custom Properties ↗',
      subDomain: 'custom-property',
      cleanResourceName: resourceName,
    };
  }
  if (modLower === 'custom-roles' || modLower === 'org-custom-roles') {
    return {
      settingsUrl: `https://github.com/organizations/${encOrg}/settings/roles`,
      settingsLinkLabel: 'Org Custom Roles ↗',
      subDomain: 'custom-role',
      cleanResourceName: resourceName,
    };
  }
  if (modLower === 'actions-policies') {
    return {
      settingsUrl: `https://github.com/organizations/${encOrg}/settings/actions`,
      settingsLinkLabel: 'Org Actions Policies ↗',
      subDomain: 'actions-policy',
      cleanResourceName: resourceName,
    };
  }
  if (modLower === 'ip-allow-lists') {
    return {
      settingsUrl: `https://github.com/organizations/${encOrg}/settings/security`,
      settingsLinkLabel: 'Org IP Allow List ↗',
      subDomain: 'ip-allow-list',
      cleanResourceName: resourceName,
    };
  }
  if (modLower === 'org-settings') {
    return {
      settingsUrl: `https://github.com/organizations/${encOrg}/settings/profile`,
      settingsLinkLabel: 'Org Settings ↗',
      subDomain: 'org-settings',
      cleanResourceName: resourceName,
    };
  }
  if (modLower === 'autolinks') {
    return {
      settingsUrl: encRepo
        ? `https://github.com/${encOrg}/${encRepo}/settings/key_links`
        : `https://github.com/organizations/${encOrg}/settings/profile`,
      settingsLinkLabel: 'Repo Autolinks ↗',
      subDomain: 'autolink',
      cleanResourceName: resourceName,
    };
  }
  if (modLower === 'releases') {
    return {
      settingsUrl: encRepo
        ? `https://github.com/${encOrg}/${encRepo}/releases`
        : `https://github.com/${encOrg}`,
      settingsLinkLabel: 'Repo Releases ↗',
      subDomain: 'release',
      cleanResourceName: resourceName,
    };
  }
  if (modLower === 'projects-v2' || modLower === 'org-projects-v2') {
    return {
      settingsUrl: `https://github.com/orgs/${encOrg}/projects`,
      settingsLinkLabel: 'Org Projects ↗',
      subDomain: 'project-v2',
      cleanResourceName: resourceName,
    };
  }

  return {
    settingsUrl: encRepo
      ? `https://github.com/${encOrg}/${encRepo}/settings`
      : `https://github.com/organizations/${encOrg}/settings/profile`,
    settingsLinkLabel: encRepo ? 'Repo Settings ↗' : 'Org Settings ↗',
    subDomain: typeLower || modLower,
    cleanResourceName: resourceName,
  };
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractUrlFromText(text: string, marker: string): string | undefined {
  const idx = text.indexOf(marker);
  if (idx === -1) return undefined;
  const after = text.slice(idx + marker.length).trimStart();
  const match = /^https?:\/\/[^\s|)]+/.exec(after);
  return match ? match[0] : undefined;
}

function classifyPostCareCategory(
  moduleId: string,
  resourceType: string,
): PostCareCategory {
  const mod = moduleId.toLowerCase();
  const type = resourceType.toLowerCase();

  if (
    mod === 'org-secrets' ||
    mod === 'repo-secrets' ||
    mod === 'actions-secrets' ||
    type.includes('secret')
  ) {
    return 'secret';
  }
  if (
    mod === 'webhooks' ||
    mod === 'org-webhooks' ||
    type.includes('webhook')
  ) {
    return 'webhook';
  }
  if (
    mod === 'apps-inventory' ||
    type.includes('github_app') ||
    type.includes('github-app')
  ) {
    return 'github-app';
  }
  if (mod === 'actions-runners' || type.includes('runner')) {
    return 'runner';
  }
  if (
    mod === 'deploy-keys' ||
    type.includes('deploy-key') ||
    type.includes('deploy_key')
  ) {
    return 'deploy-key';
  }
  if (
    mod === 'mannequins' ||
    mod === 'post-migration-mannequins' ||
    type.includes('mannequin')
  ) {
    return 'mannequin';
  }
  if (mod === 'teams' || type.startsWith('team')) {
    return 'idp-team';
  }
  if (mod === 'collaborators' || type.includes('collaborator')) {
    return 'collaborator';
  }
  if (
    mod === 'rulesets' ||
    mod === 'org-rulesets' ||
    mod === 'rulesets-org' ||
    mod === 'branch-protection' ||
    type.includes('ruleset') ||
    type.includes('branch-protection')
  ) {
    return 'policy';
  }
  if (mod === 'packages' || type.includes('package')) {
    return 'package';
  }
  if (
    mod === 'security' ||
    mod === 'post-migration-security' ||
    mod === 'codeowners' ||
    mod === 'post-migration-codeowners'
  ) {
    return 'security';
  }
  return 'failed-operation';
}

function extractIdpGroupFromNotes(
  notes?: string | undefined,
): string | undefined {
  if (!notes) return undefined;
  const bracketMatch = /\[IdP Group:\s*([^\]]+)\]/i.exec(notes);
  if (bracketMatch?.[1]) {
    return bracketMatch[1].trim();
  }
  const bindMatch = /to IdP group(?:s)?\s+(.+?)\s+on\s+/i.exec(notes);
  if (bindMatch?.[1]) {
    return bindMatch[1].trim();
  }
  const colonBindMatch = /to IdP group(?:\(s\)|s)?:\s*([^\n.]+)/i.exec(notes);
  if (colonBindMatch?.[1]) {
    return colonBindMatch[1].trim();
  }
  return undefined;
}

function buildActionInstruction(params: {
  readonly category: PostCareCategory;
  readonly subDomain: string;
  readonly cleanResourceName: string;
  readonly targetOrg: string;
  readonly targetRepo?: string | undefined;
  readonly environmentName?: string | undefined;
  readonly migrationStatus: PostCareMigrationStatus;
  readonly notes?: string | undefined;
}): string {
  const {
    category,
    subDomain,
    cleanResourceName,
    targetOrg,
    targetRepo,
    environmentName,
    migrationStatus,
    notes,
  } = params;

  switch (category) {
    case 'secret': {
      if (environmentName) {
        return `Populate plaintext value for environment secret "${cleanResourceName}" in environment "${environmentName}" on ${targetOrg}/${targetRepo ?? ''}.`;
      }
      if (targetRepo) {
        return `Populate plaintext value for ${subDomain} repository secret "${cleanResourceName}" on ${targetOrg}/${targetRepo}.`;
      }
      return `Populate plaintext value for ${subDomain} organization secret "${cleanResourceName}" on ${targetOrg}.`;
    }
    case 'webhook':
      return targetRepo
        ? `Enter webhook HMAC signing secret and check the "Active" checkbox (entering a secret does not auto-activate an inactive webhook) for ${cleanResourceName} on ${targetOrg}/${targetRepo}.`
        : `Enter organization webhook HMAC signing secret and check the "Active" checkbox (entering a secret does not auto-activate an inactive webhook) for ${cleanResourceName} on ${targetOrg}.`;
    case 'github-app': {
      const selectedMatch = notes
        ? /\(Selected repositories:\s*([^)]+)\)/i.exec(notes)
        : null;
      const selectedSuffix = selectedMatch?.[1]
        ? ` Scope installation to selected repositories: ${selectedMatch[1].trim()}.`
        : '';
      return subDomain === 'custom_private'
        ? `Recreate internal custom GitHub App "${cleanResourceName}" on ${targetOrg} using the Custom Recreate Link or App Manifest, then install on target repositories.${selectedSuffix}`
        : `Install and authorize GitHub App "${cleanResourceName}" on ${targetOrg} (or recreate as a custom app if internal).${selectedSuffix}`;
    }
    case 'runner':
      if (subDomain === 'hosted-runner') {
        return `Verify larger GitHub-hosted runner "${cleanResourceName}" on ${targetOrg} and ensure GitHub Actions billing spending limits are configured (> $0) so jobs can provision runner VMs.`;
      }
      return subDomain === 'runner-group'
        ? `Register self-hosted runner agents into runner group "${cleanResourceName}" on ${targetOrg}.`
        : targetRepo
          ? `Re-register self-hosted runner agent "${cleanResourceName}" against ${targetOrg}/${targetRepo}.`
          : `Re-register self-hosted runner agent "${cleanResourceName}" against ${targetOrg}.`;
    case 'deploy-key':
      return `SSH deploy key "${cleanResourceName}" on ${targetOrg}/${targetRepo ?? ''} is globally unique across GitHub. Either generate a new key pair, or run the manual Post-Migration Source-Detach Cutover workflow ("post-migration-cutover.yml") / CLI ("ghec-consultant-cli cutover") to delete the key from the source repository and migrate it to ${targetOrg}/${targetRepo ?? ''}.`;
    case 'mannequin':
      return `Map and reclaim mannequin "${cleanResourceName}" to target EMU user identity on ${targetOrg}.`;
    case 'idp-team': {
      const idpGroup = extractIdpGroupFromNotes(notes);
      if (idpGroup) {
        return `Verify or bind team "${cleanResourceName}" on ${targetOrg} to Identity Provider (IdP) SCIM group ${idpGroup} at https://github.com/orgs/${targetOrg}/teams/${cleanResourceName}/Sync.`;
      }
      return `Verify team "${cleanResourceName}" on ${targetOrg} and bind to your Identity Provider (IdP) SCIM group at https://github.com/orgs/${targetOrg}/teams/${cleanResourceName}/Sync if IdP-managed.`;
    }
    case 'collaborator':
      return `Review outside collaborator "${cleanResourceName}" on ${targetOrg}/${targetRepo ?? ''} and provision as an EMU guest/team member.`;
    case 'policy':
      return `Review ${subDomain} "${cleanResourceName}" bypass actors and app integrations on ${targetRepo ? `${targetOrg}/${targetRepo}` : targetOrg}.`;
    case 'package':
      return `Verify package "${cleanResourceName}" on ${targetOrg} and update downstream package registry URLs.`;
    case 'security':
      return `Review ${subDomain} configuration ("${cleanResourceName}") on ${targetRepo ? `${targetOrg}/${targetRepo}` : targetOrg}.`;
    case 'failed-operation':
      return notes && notes.trim().length > 0
        ? `Resolve ${migrationStatus} item "${cleanResourceName}": ${notes}`
        : `Investigate and remediate ${migrationStatus} operation for "${cleanResourceName}".`;
  }
}

function shouldIncludeGranularItemInPostCare(params: {
  readonly moduleId: string;
  readonly item: GranularMigrationItemRow;
}): boolean {
  const { moduleId, item } = params;
  const modLower = moduleId.toLowerCase();
  const typeLower = item.resourceType.toLowerCase();

  if (
    item.status === 'failed' ||
    item.status === 'skipped' ||
    item.operationType === 'warn' ||
    item.operationType === 'skip' ||
    item.verificationStatus === 'discrepancy'
  ) {
    return true;
  }

  // Always include secrets (Org, Repo, Environment) because plaintext values are never exposed by GitHub API
  if (
    item.isSecret ||
    modLower === 'org-secrets' ||
    modLower === 'repo-secrets' ||
    modLower === 'actions-secrets' ||
    typeLower.includes('secret')
  ) {
    return true;
  }

  // Always include webhooks (need HMAC secret population / activation review)
  if (
    modLower === 'webhooks' ||
    modLower === 'org-webhooks' ||
    typeLower.includes('webhook')
  ) {
    return true;
  }

  // Always include GitHub Apps inventory items (need installation / recreation), except succeeded repo bindings
  if (
    modLower === 'apps-inventory' ||
    typeLower.includes('github_app') ||
    typeLower.includes('github-app')
  ) {
    if (typeLower === 'github_app_repository_binding') {
      return false;
    }
    return true;
  }

  // Always include self-hosted runner groups / runners and larger GitHub-hosted runners (need registration or billing spend limit verification)
  if (modLower === 'actions-runners' || typeLower.includes('runner')) {
    return true;
  }

  // Always include mannequins
  if (
    modLower === 'mannequins' ||
    modLower === 'post-migration-mannequins' ||
    typeLower.includes('mannequin')
  ) {
    return true;
  }

  // Include teams only when they have a discovered IdP / SCIM group binding
  if (modLower === 'teams') {
    if (typeLower === 'team-idp-group') {
      return true;
    }
    if (typeLower === 'team' && Boolean(extractIdpGroupFromNotes(item.notes))) {
      return true;
    }
    return false;
  }

  // Always include deploy keys (SSH public keys require rotation or detachment from source repo due to GitHub global key uniqueness)
  if (modLower === 'deploy-keys' || typeLower.includes('deploy-key')) {
    return true;
  }

  return false;
}

/**
 * Generates the complete set of Post-Care items, `POST-CARE-CHECKLIST.md`, and `exports/*.csv` files.
 */
export function generatePostCareDeliverables(
  options: GeneratePostCareOptions,
): GeneratedPostCareDeliverables {
  const {
    sourceOrg,
    targetOrg,
    mode,
    discoveryBundle,
    plan,
    orgModuleModels,
    repoModuleModels,
    repoSourceToTarget,
  } = options;

  const postCareMap = new Map<string, PostCareItem>();
  const operationRows: FullMigrationOperationRow[] = [];

  const planOpsById = new Map<string, PlannedOperation>();
  if (plan?.modules) {
    for (const mod of plan.modules) {
      for (const op of mod.operations) {
        planOpsById.set(op.id, op);
      }
    }
  }

  const addPostCareItem = (item: PostCareItem): void => {
    const existing = postCareMap.get(item.itemId);
    if (!existing) {
      postCareMap.set(item.itemId, item);
      return;
    }
    // Prefer failed/discrepancy/sealed status over generic planned/discovered
    if (
      existing.migrationStatus === 'discovered' ||
      existing.migrationStatus === 'planned'
    ) {
      postCareMap.set(item.itemId, item);
    }
  };

  // 1. Extract from Execution / Verification Granular Models (Org & Repo)
  if (orgModuleModels) {
    for (const orgModel of orgModuleModels.values()) {
      const { moduleId } = orgModel;
      for (const item of orgModel.items) {
        const plannedOp = item.operationId
          ? planOpsById.get(item.operationId)
          : undefined;
        const links = resolveTargetSettingsLinks({
          moduleId,
          resourceType: item.resourceType,
          resourceName: item.resourceName,
          targetOrg,
          operationId: item.operationId,
          notes: item.notes,
          plannedOp,
        });
        const requiresPostCare = shouldIncludeGranularItemInPostCare({
          moduleId,
          item,
        });

        operationRows.push({
          scopeLevel: 'organization',
          targetOrg,
          targetRepo: '',
          moduleId,
          resourceName: links.cleanResourceName,
          resourceType: item.resourceType,
          subDomain: links.subDomain,
          operationType: item.operationType,
          status: item.status,
          verificationStatus: item.verificationStatus,
          requiresPostCare,
          settingsUrl: links.settingsUrl,
          cliCommand: links.cliCommand ?? '',
          notes: sanitizeDiagnostics(item.notes ?? ''),
        });

        if (requiresPostCare) {
          const category = classifyPostCareCategory(
            moduleId,
            item.resourceType,
          );
          const migrationStatus: PostCareMigrationStatus =
            item.status === 'failed'
              ? 'failed'
              : item.verificationStatus === 'discrepancy'
                ? 'discrepancy'
                : item.status === 'skipped' || item.operationType === 'skip'
                  ? 'skipped'
                  : category === 'secret'
                    ? 'sealed-placeholder'
                    : category === 'webhook'
                      ? 'inactive-webhook'
                      : mode === 'dry-run'
                        ? 'planned'
                        : 'manual-action-required';
          const priority: PostCarePriority =
            item.status === 'failed' ||
            item.verificationStatus === 'discrepancy' ||
            category === 'secret' ||
            category === 'webhook' ||
            category === 'github-app'
              ? 'high'
              : 'medium';

          const itemId = `postcare:org:${moduleId}:${links.subDomain}:${links.cleanResourceName}`;
          addPostCareItem({
            itemId,
            mode,
            priority,
            category,
            scopeLevel: 'organization',
            targetOrg,
            moduleId,
            resourceType: item.resourceType,
            resourceName: links.cleanResourceName,
            subDomain: links.subDomain,
            migrationStatus,
            actionRequired: buildActionInstruction({
              category,
              subDomain: links.subDomain,
              cleanResourceName: links.cleanResourceName,
              targetOrg,
              migrationStatus,
              notes: item.notes,
            }),
            settingsUrl: links.settingsUrl,
            secondaryUrl: links.secondaryUrl,
            cliCommand: links.cliCommand,
            notes: item.notes ? sanitizeDiagnostics(item.notes) : undefined,
          });
        }
      }
    }
  }

  if (repoModuleModels) {
    for (const repoModel of repoModuleModels.values()) {
      const { moduleId, targetRepo } = repoModel;
      for (const item of repoModel.items) {
        const plannedOp = item.operationId
          ? planOpsById.get(item.operationId)
          : undefined;
        const links = resolveTargetSettingsLinks({
          moduleId,
          resourceType: item.resourceType,
          resourceName: item.resourceName,
          targetOrg,
          targetRepo,
          operationId: item.operationId,
          notes: item.notes,
          plannedOp,
        });
        const requiresPostCare = shouldIncludeGranularItemInPostCare({
          moduleId,
          item,
        });
        const scopeLevel: 'repository' | 'environment' = links.environmentName
          ? 'environment'
          : 'repository';

        operationRows.push({
          scopeLevel,
          targetOrg,
          targetRepo,
          moduleId,
          resourceName: links.cleanResourceName,
          resourceType: item.resourceType,
          subDomain: links.subDomain,
          operationType: item.operationType,
          status: item.status,
          verificationStatus: item.verificationStatus,
          requiresPostCare,
          settingsUrl: links.settingsUrl,
          cliCommand: links.cliCommand ?? '',
          notes: sanitizeDiagnostics(item.notes ?? ''),
        });

        if (requiresPostCare) {
          const category = classifyPostCareCategory(
            moduleId,
            item.resourceType,
          );
          const migrationStatus: PostCareMigrationStatus =
            item.status === 'failed'
              ? 'failed'
              : item.verificationStatus === 'discrepancy'
                ? 'discrepancy'
                : item.status === 'skipped' || item.operationType === 'skip'
                  ? 'skipped'
                  : category === 'secret'
                    ? 'sealed-placeholder'
                    : category === 'webhook'
                      ? 'inactive-webhook'
                      : mode === 'dry-run'
                        ? 'planned'
                        : 'manual-action-required';
          const priority: PostCarePriority =
            item.status === 'failed' ||
            item.verificationStatus === 'discrepancy' ||
            category === 'secret' ||
            category === 'webhook' ||
            category === 'github-app'
              ? 'high'
              : 'medium';

          const itemId = `postcare:repo:${targetRepo}:${moduleId}:${links.environmentName ?? ''}:${links.subDomain}:${links.cleanResourceName}`;
          addPostCareItem({
            itemId,
            mode,
            priority,
            category,
            scopeLevel,
            targetOrg,
            targetRepo,
            environmentName: links.environmentName,
            moduleId,
            resourceType: item.resourceType,
            resourceName: links.cleanResourceName,
            subDomain: links.subDomain,
            migrationStatus,
            actionRequired: buildActionInstruction({
              category,
              subDomain: links.subDomain,
              cleanResourceName: links.cleanResourceName,
              targetOrg,
              targetRepo,
              environmentName: links.environmentName,
              migrationStatus,
              notes: item.notes,
            }),
            settingsUrl: links.settingsUrl,
            secondaryUrl: links.secondaryUrl,
            cliCommand: links.cliCommand,
            notes: item.notes ? sanitizeDiagnostics(item.notes) : undefined,
          });
        }
      }
    }
  }

  // 2. Extract from MigrationPlan if provided (covers standalone `plan` mode or planned operations not yet in execution models)
  if (plan?.modules) {
    for (const modPlan of plan.modules) {
      const isOrg = modPlan.scopeLevel === 'organization';
      const rawTargetRepo = !isOrg
        ? modPlan.targetIdentifier.includes('/')
          ? modPlan.targetIdentifier.split('/').pop()
          : modPlan.targetIdentifier
        : undefined;
      const targetRepo = rawTargetRepo
        ? (repoSourceToTarget?.get(rawTargetRepo.toLowerCase()) ??
          rawTargetRepo)
        : undefined;

      for (const op of modPlan.operations) {
        const syntheticItem: GranularMigrationItemRow = {
          operationId: op.id,
          resourceName: op.resourceName,
          resourceType: op.resourceType,
          operationType: op.operation,
          status: op.operation === 'skip' ? 'skipped' : 'succeeded',
          verificationStatus: 'not-verified',
          notes: op.reason,
        };
        const links = resolveTargetSettingsLinks({
          moduleId: modPlan.moduleId,
          resourceType: op.resourceType,
          resourceName: op.resourceName,
          targetOrg,
          targetRepo,
          operationId: op.id,
          notes: op.reason,
          plannedOp: op,
        });
        const requiresPostCare = shouldIncludeGranularItemInPostCare({
          moduleId: modPlan.moduleId,
          item: syntheticItem,
        });
        const scopeLevel: 'organization' | 'repository' | 'environment' = isOrg
          ? 'organization'
          : links.environmentName
            ? 'environment'
            : 'repository';

        const orgModelsCount = orgModuleModels
          ? Array.isArray(orgModuleModels)
            ? orgModuleModels.length
            : (orgModuleModels as ReadonlyMap<string, OrgModuleDetailModel>)
                .size
          : 0;
        const repoModelsCount = repoModuleModels
          ? Array.isArray(repoModuleModels)
            ? repoModuleModels.length
            : (
                repoModuleModels as ReadonlyMap<
                  string,
                  RepositoryModuleDetailModel
                >
              ).size
          : 0;
        if (orgModelsCount === 0 && repoModelsCount === 0) {
          operationRows.push({
            scopeLevel,
            targetOrg,
            targetRepo: targetRepo ?? '',
            moduleId: modPlan.moduleId,
            resourceName: links.cleanResourceName,
            resourceType: op.resourceType,
            subDomain: links.subDomain,
            operationType: op.operation,
            status: 'planned',
            verificationStatus: 'not-verified',
            requiresPostCare,
            settingsUrl: links.settingsUrl,
            cliCommand: links.cliCommand ?? '',
            notes: sanitizeDiagnostics(op.reason ?? ''),
          });
        }

        if (requiresPostCare) {
          const category = classifyPostCareCategory(
            modPlan.moduleId,
            op.resourceType,
          );
          const migrationStatus: PostCareMigrationStatus =
            op.operation === 'skip'
              ? 'skipped'
              : category === 'secret'
                ? 'sealed-placeholder'
                : category === 'webhook'
                  ? 'inactive-webhook'
                  : 'planned';
          const priority: PostCarePriority =
            category === 'secret' ||
            category === 'webhook' ||
            category === 'github-app'
              ? 'high'
              : 'medium';
          const itemId = isOrg
            ? `postcare:org:${modPlan.moduleId}:${links.subDomain}:${links.cleanResourceName}`
            : `postcare:repo:${targetRepo ?? ''}:${modPlan.moduleId}:${links.environmentName ?? ''}:${links.subDomain}:${links.cleanResourceName}`;

          addPostCareItem({
            itemId,
            mode,
            priority,
            category,
            scopeLevel,
            targetOrg,
            targetRepo,
            environmentName: links.environmentName,
            moduleId: modPlan.moduleId,
            resourceType: op.resourceType,
            resourceName: links.cleanResourceName,
            subDomain: links.subDomain,
            migrationStatus,
            actionRequired: buildActionInstruction({
              category,
              subDomain: links.subDomain,
              cleanResourceName: links.cleanResourceName,
              targetOrg,
              targetRepo,
              environmentName: links.environmentName,
              migrationStatus,
              notes: op.reason,
            }),
            settingsUrl: links.settingsUrl,
            secondaryUrl: links.secondaryUrl,
            cliCommand: links.cliCommand,
            notes: op.reason ? sanitizeDiagnostics(op.reason) : undefined,
          });
        }
      }
    }
  }

  // 3. Extract from DiscoveryBundle if provided (Discovery mode or cached bundle enrichment)
  if (discoveryBundle?.entities) {
    const repoIdToTargetName = new Map<string, string>();
    for (const entity of discoveryBundle.entities) {
      if (entity.kind === 'repository') {
        const mappedName =
          repoSourceToTarget?.get(entity.name.toLowerCase()) ?? entity.name;
        repoIdToTargetName.set(entity.id, mappedName);
        repoIdToTargetName.set(entity.name, mappedName);
      }
    }

    const resolveRepoFromEntityId = (
      repoId?: string | null | undefined,
    ): string | undefined => {
      if (!repoId) return undefined;
      const direct = repoIdToTargetName.get(repoId);
      if (direct) return direct;
      const colonIdx = repoId.lastIndexOf(':');
      if (colonIdx !== -1) {
        const tail = repoId.slice(colonIdx + 1);
        return repoIdToTargetName.get(tail) ?? tail;
      }
      return repoId;
    };

    for (const entity of discoveryBundle.entities) {
      if (
        entity.kind === 'configuration-metadata' &&
        entity.configurationKind === 'secret'
      ) {
        const targetRepo = resolveRepoFromEntityId(entity.repositoryId);
        const isOrg = entity.level === 'organization' || !targetRepo;
        const isEnv =
          entity.level === 'environment' || Boolean(entity.environmentName);
        const moduleId = isOrg
          ? 'org-secrets'
          : isEnv
            ? 'environments'
            : 'repo-secrets';
        const resourceType = isOrg
          ? 'organization-secret'
          : isEnv
            ? 'environment-secret'
            : 'repo-secret';
        const resourceName =
          isEnv && entity.environmentName
            ? `${entity.environmentName}/${entity.name}`
            : entity.name;
        const domain =
          entity.domain === 'dependabot' || entity.domain === 'codespaces'
            ? entity.domain
            : entity.domain === 'copilot'
              ? 'agents'
              : 'actions';
        const links = resolveTargetSettingsLinks({
          moduleId,
          resourceType,
          resourceName,
          targetOrg,
          targetRepo,
          operationId: `${moduleId}:${domain}:${entity.name}`,
        });
        const scopeLevel: 'organization' | 'repository' | 'environment' = isOrg
          ? 'organization'
          : isEnv
            ? 'environment'
            : 'repository';
        const itemId = isOrg
          ? `postcare:org:org-secrets:${links.subDomain}:${links.cleanResourceName}`
          : `postcare:repo:${targetRepo ?? ''}:${moduleId}:${links.environmentName ?? ''}:${links.subDomain}:${links.cleanResourceName}`;

        addPostCareItem({
          itemId,
          mode,
          priority: 'high',
          category: 'secret',
          scopeLevel,
          targetOrg,
          targetRepo,
          environmentName: links.environmentName,
          moduleId,
          resourceType,
          resourceName: links.cleanResourceName,
          subDomain: links.subDomain,
          migrationStatus: 'discovered',
          actionRequired: buildActionInstruction({
            category: 'secret',
            subDomain: links.subDomain,
            cleanResourceName: links.cleanResourceName,
            targetOrg,
            targetRepo,
            environmentName: links.environmentName,
            migrationStatus: 'discovered',
          }),
          settingsUrl: links.settingsUrl,
          secondaryUrl: links.secondaryUrl,
          cliCommand: links.cliCommand,
          notes: `Access mode: ${entity.accessMode}`,
        });
      } else if (
        (entity.kind === 'actions-secret' &&
          entity.configurationKind === 'secret') ||
        entity.kind === 'dependabot-secret' ||
        entity.kind === 'codespaces-secret'
      ) {
        const targetRepo = resolveRepoFromEntityId(entity.repositoryId);
        const isOrg = entity.level === 'organization' || !targetRepo;
        const isEnv = entity.level === 'environment';
        const domain =
          entity.kind === 'dependabot-secret'
            ? 'dependabot'
            : entity.kind === 'codespaces-secret'
              ? 'codespaces'
              : 'actions';
        const moduleId = isOrg
          ? 'org-secrets'
          : isEnv
            ? 'environments'
            : 'repo-secrets';
        const resourceType = isOrg
          ? 'organization-secret'
          : isEnv
            ? 'environment-secret'
            : 'repo-secret';
        const links = resolveTargetSettingsLinks({
          moduleId,
          resourceType,
          resourceName: entity.name,
          targetOrg,
          targetRepo,
          operationId: `${moduleId}:${domain}:${entity.name}`,
        });
        const scopeLevel: 'organization' | 'repository' | 'environment' = isOrg
          ? 'organization'
          : isEnv
            ? 'environment'
            : 'repository';
        const itemId = isOrg
          ? `postcare:org:org-secrets:${links.subDomain}:${links.cleanResourceName}`
          : `postcare:repo:${targetRepo ?? ''}:${moduleId}:${links.environmentName ?? ''}:${links.subDomain}:${links.cleanResourceName}`;

        addPostCareItem({
          itemId,
          mode,
          priority: 'high',
          category: 'secret',
          scopeLevel,
          targetOrg,
          targetRepo,
          environmentName: links.environmentName,
          moduleId,
          resourceType,
          resourceName: links.cleanResourceName,
          subDomain: links.subDomain,
          migrationStatus: 'discovered',
          actionRequired: buildActionInstruction({
            category: 'secret',
            subDomain: links.subDomain,
            cleanResourceName: links.cleanResourceName,
            targetOrg,
            targetRepo,
            environmentName: links.environmentName,
            migrationStatus: 'discovered',
          }),
          settingsUrl: links.settingsUrl,
          secondaryUrl: links.secondaryUrl,
          cliCommand: links.cliCommand,
        });
      } else if (entity.kind === 'integration') {
        const targetRepo = resolveRepoFromEntityId(entity.repositoryId);
        const isOrg = !targetRepo;
        if (entity.integrationKind === 'github_app') {
          const links = resolveTargetSettingsLinks({
            moduleId: 'apps-inventory',
            resourceType: 'github_app_installation',
            resourceName: entity.label,
            targetOrg,
          });
          addPostCareItem({
            itemId: `postcare:org:apps-inventory:${links.subDomain}:${links.cleanResourceName}`,
            mode,
            priority: 'high',
            category: 'github-app',
            scopeLevel: 'organization',
            targetOrg,
            moduleId: 'apps-inventory',
            resourceType: 'github_app_installation',
            resourceName: links.cleanResourceName,
            subDomain: links.subDomain,
            migrationStatus: 'discovered',
            actionRequired: buildActionInstruction({
              category: 'github-app',
              subDomain: links.subDomain,
              cleanResourceName: links.cleanResourceName,
              targetOrg,
              migrationStatus: 'discovered',
            }),
            settingsUrl: links.settingsUrl,
            secondaryUrl: links.secondaryUrl,
            cliCommand: links.cliCommand,
          });
        } else if (entity.integrationKind === 'webhook') {
          const moduleId = isOrg ? 'org-webhooks' : 'webhooks';
          const links = resolveTargetSettingsLinks({
            moduleId,
            resourceType: isOrg ? 'org-webhook' : 'webhook',
            resourceName: entity.label,
            targetOrg,
            targetRepo,
          });
          const itemId = isOrg
            ? `postcare:org:org-webhooks:${links.subDomain}:${links.cleanResourceName}`
            : `postcare:repo:${targetRepo ?? ''}:webhooks::${links.subDomain}:${links.cleanResourceName}`;
          addPostCareItem({
            itemId,
            mode,
            priority: 'high',
            category: 'webhook',
            scopeLevel: isOrg ? 'organization' : 'repository',
            targetOrg,
            targetRepo,
            moduleId,
            resourceType: isOrg ? 'org-webhook' : 'webhook',
            resourceName: links.cleanResourceName,
            subDomain: links.subDomain,
            migrationStatus: 'discovered',
            actionRequired: buildActionInstruction({
              category: 'webhook',
              subDomain: links.subDomain,
              cleanResourceName: links.cleanResourceName,
              targetOrg,
              targetRepo,
              migrationStatus: 'discovered',
            }),
            settingsUrl: links.settingsUrl,
            cliCommand: links.cliCommand,
          });
        } else if (entity.integrationKind === 'deploy_key') {
          const links = resolveTargetSettingsLinks({
            moduleId: 'deploy-keys',
            resourceType: 'deploy-key',
            resourceName: entity.label,
            targetOrg,
            targetRepo,
          });
          addPostCareItem({
            itemId: `postcare:repo:${targetRepo ?? ''}:deploy-keys::${links.subDomain}:${links.cleanResourceName}`,
            mode,
            priority: 'medium',
            category: 'deploy-key',
            scopeLevel: 'repository',
            targetOrg,
            targetRepo,
            moduleId: 'deploy-keys',
            resourceType: 'deploy-key',
            resourceName: links.cleanResourceName,
            subDomain: links.subDomain,
            migrationStatus: 'discovered',
            actionRequired: buildActionInstruction({
              category: 'deploy-key',
              subDomain: links.subDomain,
              cleanResourceName: links.cleanResourceName,
              targetOrg,
              targetRepo,
              migrationStatus: 'discovered',
            }),
            settingsUrl: links.settingsUrl,
            cliCommand: links.cliCommand,
          });
        }
      } else if (
        entity.kind === 'action-runner' &&
        (entity.runnerType === 'self-hosted' || entity.runnerType === 'hosted')
      ) {
        const isHosted = entity.runnerType === 'hosted';
        const targetRepo = resolveRepoFromEntityId(entity.repositoryId);
        const resourceType = isHosted ? 'hosted-runner' : 'action-runner';
        const links = resolveTargetSettingsLinks({
          moduleId: 'actions-runners',
          resourceType,
          resourceName: entity.name,
          targetOrg,
          targetRepo,
        });
        const itemId = targetRepo
          ? `postcare:repo:${targetRepo}:actions-runners::${links.subDomain}:${links.cleanResourceName}`
          : `postcare:org:actions-runners:${links.subDomain}:${links.cleanResourceName}`;
        addPostCareItem({
          itemId,
          mode,
          priority: 'medium',
          category: 'runner',
          scopeLevel: targetRepo ? 'repository' : 'organization',
          targetOrg,
          targetRepo,
          moduleId: 'actions-runners',
          resourceType,
          resourceName: links.cleanResourceName,
          subDomain: links.subDomain,
          migrationStatus: 'discovered',
          actionRequired: buildActionInstruction({
            category: 'runner',
            subDomain: links.subDomain,
            cleanResourceName: links.cleanResourceName,
            targetOrg,
            targetRepo,
            migrationStatus: 'discovered',
          }),
          settingsUrl: links.settingsUrl,
          secondaryUrl: links.secondaryUrl,
          cliCommand: links.cliCommand,
          notes: `OS: ${entity.operatingSystem ?? 'unknown'}, Labels: ${entity.labels.join(', ') || 'none'}`,
        });
      }
    }
  }

  const items = Array.from(postCareMap.values());
  const checklistMarkdown = formatPostCareChecklistMarkdown({
    sourceOrg,
    targetOrg,
    mode,
    items,
  });
  const csvFiles = buildPostCareCsvFiles(items, operationRows);

  return {
    items,
    operationRows,
    checklistMarkdown,
    csvFiles,
  };
}

/**
 * Formats the root `POST-CARE-CHECKLIST.md` guide with direct clickable GitHub Settings URLs and CLI commands.
 */
export function formatPostCareChecklistMarkdown(params: {
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly mode: PostCareOperationalMode;
  readonly items: readonly PostCareItem[];
}): string {
  const { sourceOrg, targetOrg, mode, items } = params;

  const modeLabel =
    mode === 'discovery'
      ? 'Discovery Preview (Projected Post-Care)'
      : mode === 'dry-run'
        ? 'Dry-Run Preview (Planned Post-Care)'
        : 'Live Migration (Actionable Post-Care)';

  const secretItems = items.filter((i) => i.category === 'secret');
  const appItems = items.filter((i) => i.category === 'github-app');
  const webhookItems = items.filter((i) => i.category === 'webhook');
  const runnerItems = items.filter((i) => i.category === 'runner');
  const accessItems = items.filter(
    (i) =>
      i.category === 'idp-team' ||
      i.category === 'mannequin' ||
      i.category === 'collaborator' ||
      i.category === 'deploy-key',
  );
  const otherItems = items.filter(
    (i) =>
      i.category === 'policy' ||
      i.category === 'package' ||
      i.category === 'security' ||
      i.category === 'failed-operation',
  );

  const lines: string[] = [
    '[← Back to Overview](README.md)',
    '',
    `# Customer Post-Care Checklist: ${sourceOrg} ➔ ${targetOrg}`,
    '',
    `> **Operational Phase:** \`${modeLabel}\`  `,
    `> **Total Post-Care Action Items:** **${items.length}**  `,
    `> **Master CSV Spreadsheet:** [\`exports/post-care-items.csv\`](exports/post-care-items.csv)  `,
    `> **Full Operations Ledger CSV:** [\`exports/migration-operations-full.csv\`](exports/migration-operations-full.csv)  `,
    '',
    'Use this checklist to complete post-migration setup steps that require customer secrets, third-party app authorization, or infrastructure registration. Click any **Direct Settings Link** to open the exact GitHub Settings page on the destination organization.',
    '',
    '---',
    '',
    '## Summary by Category & CSV Exports',
    '',
    '| Post-Care Category | Action Items | Priority | Downloadable CSV Slice |',
    '| :--- | ---: | :--- | :--- |',
    `| 🔐 Secrets to Populate (Org, Repo & Environment) | ${secretItems.length} | **High** | [\`exports/secrets-to-populate.csv\`](exports/secrets-to-populate.csv) |`,
    `| 🤖 GitHub Apps to Install or Recreate | ${appItems.length} | **High** | [\`exports/github-apps-reinstall.csv\`](exports/github-apps-reinstall.csv) |`,
    `| 🪝 Webhooks to Populate Secret & Activate | ${webhookItems.length} | **High** | [\`exports/webhooks-reconfiguration.csv\`](exports/webhooks-reconfiguration.csv) |`,
    `| 🖥️ Self-Hosted & Larger Hosted Runners | ${runnerItems.length} | **Medium** | [\`exports/runners-registration.csv\`](exports/runners-registration.csv) |`,
    `| 👥 Teams (IdP Sync), Mannequins, Collaborators & Deploy Keys | ${accessItems.length} | **Medium** | [\`exports/post-care-items.csv\`](exports/post-care-items.csv) |`,
    `| ⚠️ Policies, Packages, Security & Failed/Skipped Items | ${otherItems.length} | **High / Medium** | [\`exports/post-care-items.csv\`](exports/post-care-items.csv) |`,
    '',
  ];

  if (items.length === 0) {
    lines.push('---');
    lines.push('');
    lines.push(
      '_No post-care action items were required or detected for this run._',
    );
    lines.push('');
    return lines.join('\n');
  }

  // Section 1: Secrets
  if (secretItems.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 1. Secrets Requiring Value Population');
    lines.push('');
    lines.push(
      'GitHub APIs never expose plaintext secret values (`DEC-004`). Secrets are created at the destination as sealed blank placeholders (`""`) so your workflows and environments have their names reserved. Click **Edit Secret in GitHub** or run the **CLI Command** to set each secret value.',
    );
    lines.push('');

    const orgSecrets = secretItems.filter(
      (i) => i.scopeLevel === 'organization',
    );
    const repoAndEnvSecrets = secretItems.filter(
      (i) => i.scopeLevel !== 'organization',
    );

    if (orgSecrets.length > 0) {
      lines.push('### 1.1 Organization Secrets');
      lines.push('');
      lines.push(
        '| Secret Name | Domain | Status | Direct Settings Link | CLI Command (`gh`) |',
      );
      lines.push('| :--- | :--- | :--- | :--- | :--- |');
      for (const s of orgSecrets) {
        const name = escapeMarkdownTableCell(s.resourceName);
        const domain = escapeMarkdownTableCell(s.subDomain);
        const status = escapeMarkdownTableCell(s.migrationStatus);
        const link = `[Edit Secret in GitHub ↗](${s.settingsUrl})`;
        const cli = s.cliCommand
          ? `\`${escapeMarkdownTableCell(s.cliCommand)}\``
          : '-';
        lines.push(
          `| \`${name}\` \`[SEALED]\` | \`${domain}\` | \`${status}\` | ${link} | ${cli} |`,
        );
      }
      lines.push('');
    }

    if (repoAndEnvSecrets.length > 0) {
      lines.push('### 1.2 Repository & Environment Secrets');
      lines.push('');
      lines.push(
        '| Repository | Scope / Environment | Secret Name | Domain | Direct Settings Link | CLI Command (`gh`) |',
      );
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
      for (const s of repoAndEnvSecrets) {
        const repo = escapeMarkdownTableCell(s.targetRepo ?? '-');
        const scopeLabel = s.environmentName
          ? `Environment: \`${escapeMarkdownTableCell(s.environmentName)}\``
          : 'Repository';
        const name = escapeMarkdownTableCell(s.resourceName);
        const domain = escapeMarkdownTableCell(s.subDomain);
        const link = s.environmentName
          ? `[Open Environments Settings ↗](${s.settingsUrl})`
          : `[Edit Secret in GitHub ↗](${s.settingsUrl})`;
        const cli = s.cliCommand
          ? `\`${escapeMarkdownTableCell(s.cliCommand)}\``
          : '-';
        lines.push(
          `| \`${repo}\` | ${scopeLabel} | \`${name}\` \`[SEALED]\` | \`${domain}\` | ${link} | ${cli} |`,
        );
      }
      lines.push('');
    }
  }

  // Section 2: GitHub Apps
  if (appItems.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 2. GitHub Apps Requiring Installation or Recreation');
    lines.push('');
    lines.push(
      'GitHub App installations and private keys cannot be transferred automatically across organizations. Use the **Marketplace Link** for public/marketplace apps or the **Custom Recreate Link** for internal custom apps.',
    );
    lines.push('');
    lines.push('> [!NOTE]');
    lines.push(
      `> **Enterprise-Owned & Repository-Scoped GitHub Apps:** Any Enterprise-owned GitHub App installed on \`${sourceOrg}\` is automatically detected via \`GET /orgs/${sourceOrg}/installations\` and listed below. When an app is scoped to selected repositories, the exact repository list is included in **Action Required** and will be automatically bound if the app is already installed on \`${targetOrg}\`.`,
    );
    lines.push('');
    lines.push(
      '| App Slug | Classification | Action Required | Marketplace Link | Custom Recreate Link |',
    );
    lines.push('| :--- | :--- | :--- | :--- | :--- |');
    for (const app of appItems) {
      const slug = escapeMarkdownTableCell(app.resourceName);
      const cls = escapeMarkdownTableCell(app.subDomain);
      const action = escapeMarkdownTableCell(app.actionRequired);
      const marketplaceLink = `[Install App on ${targetOrg} ↗](${app.settingsUrl})`;
      const customRecreateLink = app.secondaryUrl
        ? `[Recreate Custom App (Pre-Filled) ↗](${app.secondaryUrl})`
        : '-';
      lines.push(
        `| \`${slug}\` | \`${cls}\` | ${action} | ${marketplaceLink} | ${customRecreateLink} |`,
      );
    }
    lines.push('');
  }

  // Section 3: Webhooks
  if (webhookItems.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 3. Webhooks Requiring Signing Secret & Activation');
    lines.push('');
    lines.push(
      `Webhook HMAC signing secrets are write-only on source organizations. Any webhook that had a signing secret on \`${sourceOrg}\` is created in an **inactive** state (\`active: false\`) on \`${targetOrg}\` so unverified payloads are never sent before you supply the secret. **Important:** Entering a secret in the GitHub WebUI does **not** automatically re-enable an inactive webhook—you must both enter the **Secret** and check the **[x] Active** checkbox before clicking **Update webhook** (or run the \`gh api --method PATCH ... -F active=true\` CLI command).`,
    );
    lines.push('');
    lines.push(
      '| Scope | Target | Webhook URL / Identifier | Status | Direct Settings Link | CLI Command (`gh`) |',
    );
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
    for (const wh of webhookItems) {
      const scope = wh.targetRepo ? 'Repository' : 'Organization';
      const target = escapeMarkdownTableCell(
        wh.targetRepo ? `${targetOrg}/${wh.targetRepo}` : targetOrg,
      );
      const name = escapeMarkdownTableCell(wh.resourceName);
      const status = escapeMarkdownTableCell(wh.migrationStatus);
      const link = `[Configure Webhooks ↗](${wh.settingsUrl})`;
      const cli = wh.cliCommand
        ? `\`${escapeMarkdownTableCell(wh.cliCommand)}\``
        : '-';
      lines.push(
        `| ${scope} | \`${target}\` | \`${name}\` | \`${status}\` | ${link} | ${cli} |`,
      );
    }
    lines.push('');
  }

  // Section 4: Self-Hosted & Larger GitHub-Hosted Runners
  if (runnerItems.length > 0) {
    const hasHostedRunners = runnerItems.some(
      (r) =>
        r.subDomain === 'hosted-runner' || r.resourceType === 'hosted-runner',
    );
    lines.push('---');
    lines.push('');
    lines.push('## 4. Self-Hosted & Larger GitHub-Hosted Runners');
    lines.push('');
    lines.push(
      'Runner groups and larger GitHub-hosted runner definitions are migrated automatically via API, while physical or VM self-hosted runner machines must be registered against the destination using a registration token.',
    );
    lines.push('');
    if (hasHostedRunners) {
      lines.push('> [!WARNING]');
      lines.push(
        `> **Billing & Spending Limits Required for Larger GitHub-Hosted Runners:** Larger GitHub-hosted runners are automatically created via the REST API without modifying your billing settings. However, GitHub will not provision runner VMs or start workflow jobs until an organization or enterprise billing manager configures a non-zero **GitHub Actions spending limit** at [Billing & Spending Limits ↗](https://github.com/organizations/${encodeURIComponent(targetOrg)}/settings/billing).`,
      );
      lines.push('');
    }
    lines.push(
      '| Scope | Runner / Group Name | Type | Direct Settings Link | CLI Command |',
    );
    lines.push('| :--- | :--- | :--- | :--- | :--- |');
    for (const r of runnerItems) {
      const scope = r.targetRepo
        ? `Repo: \`${escapeMarkdownTableCell(r.targetRepo)}\``
        : `Org: \`${escapeMarkdownTableCell(targetOrg)}\``;
      const name = escapeMarkdownTableCell(r.resourceName);
      const sub = escapeMarkdownTableCell(r.subDomain);
      const link =
        r.subDomain === 'hosted-runner' && r.secondaryUrl
          ? `[View Runners ↗](${r.settingsUrl}) / [Billing Limits ↗](${r.secondaryUrl})`
          : `[Open Runner Settings ↗](${r.settingsUrl})`;
      const cli = r.cliCommand
        ? `\`${escapeMarkdownTableCell(r.cliCommand)}\``
        : '-';
      lines.push(`| ${scope} | \`${name}\` | \`${sub}\` | ${link} | ${cli} |`);
    }
    lines.push('');
  }

  // Section 5: Teams (IdP Sync), Mannequins, Collaborators & Deploy Keys
  if (accessItems.length > 0) {
    const hasDeployKeys = accessItems.some((a) => a.category === 'deploy-key');
    lines.push('---');
    lines.push('');
    lines.push(
      '## 5. Teams (IdP Group Sync), Mannequins, Collaborators & Deploy Keys',
    );
    lines.push('');
    if (hasDeployKeys) {
      lines.push(
        '### 5.1 Automated Post-Migration Source-Detach Cutover (SSH Deploy Keys & Custom Domains)',
      );
      lines.push('');
      lines.push(
        `GitHub enforces global uniqueness across all organizations for **SSH deploy keys** (\`422 Key is already in use\`) and **GitHub Pages custom \`CNAME\` domains**. Standard migration never deletes resources from \`${sourceOrg}\`. When you are ready to cut over from \`${sourceOrg}\` to \`${targetOrg}\`, you can automatically detach these items from \`${sourceOrg}\` and recreate them on \`${targetOrg}\` (with automatic rollback if target creation fails):`,
      );
      lines.push('');
      lines.push(
        `To run the post-migration source-detach cutover from the CLI (add \`--dry-run\` first to preview):`,
      );
      lines.push('');
      lines.push('```bash');
      lines.push(
        `ghec-consultant-cli cutover --source-org ${sourceOrg} --target-org ${targetOrg} --include-deploy-keys --include-pages-cname`,
      );
      lines.push('```');
      lines.push('');
      lines.push(
        'Or trigger the manual **Post-Migration Source-Detach Cutover** GitHub Actions workflow:',
      );
      lines.push('');
      lines.push('```bash');
      lines.push(
        `gh workflow run post-migration-cutover.yml -f source_org=${sourceOrg} -f target_org=${targetOrg} -f include_deploy_keys=true -f include_pages_cname=true -f confirm_cutover=CUTOVER`,
      );
      lines.push('```');
      lines.push('');
    }
    lines.push(
      '| Category | Target Scope | Resource Name | Action Required | Direct Settings Link |',
    );
    lines.push('| :--- | :--- | :--- | :--- | :--- |');
    for (const a of accessItems) {
      const cat = escapeMarkdownTableCell(a.category);
      const scope = escapeMarkdownTableCell(
        a.targetRepo ? `${targetOrg}/${a.targetRepo}` : targetOrg,
      );
      const name = escapeMarkdownTableCell(a.resourceName);
      const action = escapeMarkdownTableCell(a.actionRequired);
      const link = `[Open Settings ↗](${a.settingsUrl})`;
      lines.push(
        `| \`${cat}\` | \`${scope}\` | \`${name}\` | ${action} | ${link} |`,
      );
    }
    lines.push('');
  }

  // Section 6: Other Post-Care Items (Policies, Packages, Security, Failed/Skipped)
  if (otherItems.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push(
      '## 6. Policies, Packages, Security & Failed/Skipped Operations',
    );
    lines.push('');
    lines.push(
      '| Module | Target Scope | Resource Name | Status | Action Required | Direct Settings Link |',
    );
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
    for (const o of otherItems) {
      const mod = escapeMarkdownTableCell(o.moduleId);
      const scope = escapeMarkdownTableCell(
        o.targetRepo ? `${targetOrg}/${o.targetRepo}` : targetOrg,
      );
      const name = escapeMarkdownTableCell(o.resourceName);
      const status = escapeMarkdownTableCell(o.migrationStatus);
      const action = escapeMarkdownTableCell(o.actionRequired);
      const link = `[Open Settings ↗](${o.settingsUrl})`;
      lines.push(
        `| \`${mod}\` | \`${scope}\` | \`${name}\` | \`${status}\` | ${action} | ${link} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export const POST_CARE_CSV_HEADERS = [
  'resource_type',
  'resource_name',
  'action_required',
  'priority',
  'category',
  'migration_status',
  'scope_level',
  'target_org',
  'target_repo',
  'environment_name',
  'module_id',
  'sub_domain',
  'settings_url',
  'secondary_url',
  'cli_command',
  'notes',
  'mode',
  'item_id',
] as const;

const FULL_OPERATIONS_CSV_HEADERS = [
  'resource_type',
  'resource_name',
  'operation_type',
  'status',
  'verification_status',
  'requires_post_care',
  'scope_level',
  'target_org',
  'target_repo',
  'module_id',
  'sub_domain',
  'settings_url',
  'cli_command',
  'notes',
] as const;

export function sanitizePostCareCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const scrubbed = sanitizeDiagnostics(String(value)).replace(/\r?\n/g, ' ');
  return sanitizeCsvCell(scrubbed);
}

export function serializePostCareItemsToCsv(
  items: readonly PostCareItem[],
): string {
  const rows: string[] = [POST_CARE_CSV_HEADERS.join(',')];
  for (const item of items) {
    const cells = [
      sanitizePostCareCsvCell(item.resourceType),
      sanitizePostCareCsvCell(item.resourceName),
      sanitizePostCareCsvCell(item.actionRequired),
      sanitizePostCareCsvCell(item.priority),
      sanitizePostCareCsvCell(item.category),
      sanitizePostCareCsvCell(item.migrationStatus),
      sanitizePostCareCsvCell(item.scopeLevel),
      sanitizePostCareCsvCell(item.targetOrg),
      sanitizePostCareCsvCell(item.targetRepo ?? ''),
      sanitizePostCareCsvCell(item.environmentName ?? ''),
      sanitizePostCareCsvCell(item.moduleId),
      sanitizePostCareCsvCell(item.subDomain),
      sanitizePostCareCsvCell(item.settingsUrl),
      sanitizePostCareCsvCell(item.secondaryUrl ?? ''),
      sanitizePostCareCsvCell(item.cliCommand ?? ''),
      sanitizePostCareCsvCell(item.notes ?? ''),
      sanitizePostCareCsvCell(item.mode),
      sanitizePostCareCsvCell(item.itemId),
    ];
    rows.push(cells.join(','));
  }
  return rows.join('\n') + '\n';
}

export function serializeFullOperationsToCsv(
  operations: readonly FullMigrationOperationRow[],
): string {
  const rows: string[] = [FULL_OPERATIONS_CSV_HEADERS.join(',')];
  for (const op of operations) {
    const cells = [
      sanitizePostCareCsvCell(op.resourceType),
      sanitizePostCareCsvCell(op.resourceName),
      sanitizePostCareCsvCell(op.operationType),
      sanitizePostCareCsvCell(op.status),
      sanitizePostCareCsvCell(op.verificationStatus),
      sanitizePostCareCsvCell(op.requiresPostCare ? 'true' : 'false'),
      sanitizePostCareCsvCell(op.scopeLevel),
      sanitizePostCareCsvCell(op.targetOrg),
      sanitizePostCareCsvCell(op.targetRepo),
      sanitizePostCareCsvCell(op.moduleId),
      sanitizePostCareCsvCell(op.subDomain),
      sanitizePostCareCsvCell(op.settingsUrl),
      sanitizePostCareCsvCell(op.cliCommand),
      sanitizePostCareCsvCell(op.notes),
    ];
    rows.push(cells.join(','));
  }
  return rows.join('\n') + '\n';
}

function buildPostCareCsvFiles(
  items: readonly PostCareItem[],
  operationRows: readonly FullMigrationOperationRow[],
): Record<string, string> {
  return {
    'exports/post-care-items.csv': serializePostCareItemsToCsv(items),
    'exports/secrets-to-populate.csv': serializePostCareItemsToCsv(
      items.filter((i) => i.category === 'secret'),
    ),
    'exports/github-apps-reinstall.csv': serializePostCareItemsToCsv(
      items.filter((i) => i.category === 'github-app'),
    ),
    'exports/webhooks-reconfiguration.csv': serializePostCareItemsToCsv(
      items.filter((i) => i.category === 'webhook'),
    ),
    'exports/runners-registration.csv': serializePostCareItemsToCsv(
      items.filter((i) => i.category === 'runner'),
    ),
    'exports/migration-operations-full.csv':
      serializeFullOperationsToCsv(operationRows),
  };
}
