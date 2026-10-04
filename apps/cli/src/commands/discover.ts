import { parseArgs } from 'node:util';
import { MODULE_IDS, type ModuleId } from '@ghec/contracts';
import type { DiscoveryPlan } from '@ghec/discovery';
export type { DiscoveryPlan } from '@ghec/discovery';
/** Offline syntax validation only. Does not validate credentials or API access. */
export function parseDiscoveryOptions(args: string[]): DiscoveryPlan {
  // Normalize --resume if passed as bare flag
  const normalizedArgs = [...args];
  const resumeIdx = normalizedArgs.indexOf('--resume');
  if (resumeIdx !== -1) {
    const nextArg = normalizedArgs[resumeIdx + 1];
    if (!nextArg || nextArg.startsWith('-')) {
      normalizedArgs.splice(resumeIdx + 1, 0, 'latest');
    }
  }

  const { values } = parseArgs({
    args: normalizedArgs,
    strict: true,
    allowPositionals: false,
    options: {
      organization: { type: 'string' },
      enterprise: { type: 'string' },
      modules: { type: 'string' },
      output: { type: 'string', default: './scans' },
      format: { type: 'string', default: 'json' },
      'dry-run': { type: 'boolean', default: false },
      'include-sensitive-metadata': { type: 'boolean', default: false },
      'redaction-profile': { type: 'string', default: 'standard' },
      'continue-on-error': { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      'app-id': { type: 'string' },
      'private-key-path': { type: 'string' },
      'installation-id': { type: 'string' },
      resume: { type: 'string' },
      salt: { type: 'string' },
    },
  });

  const isResume = Boolean(values.resume);

  if (Boolean(values.organization) && Boolean(values.enterprise)) {
    throw new Error('Choose exactly one scope');
  }

  let scopeKind: 'organization' | 'enterprise';
  let scopeName: string;

  if (!values.organization && !values.enterprise) {
    if (!isResume) {
      throw new Error('Choose exactly one scope');
    }
    scopeKind = 'organization';
    scopeName = '__RESUME__';
  } else {
    scopeKind = values.organization ? 'organization' : 'enterprise';
    const name = values.organization ?? values.enterprise;
    if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(name)) {
      throw new Error('Invalid scope name');
    }
    scopeName = name;
  }

  let resolvedModules: ModuleId[];
  if (!values.modules) {
    if (!isResume) {
      throw new Error('Modules are required');
    }
    resolvedModules = [];
  } else {
    const selected =
      values.modules === 'all'
        ? [...MODULE_IDS]
        : values.modules.split(',').map((m) => m.trim());
    if (
      !selected.length ||
      selected.some((m) => !MODULE_IDS.includes(m as ModuleId))
    ) {
      throw new Error('Invalid modules');
    }

    const modules = new Set<ModuleId>(selected as ModuleId[]);
    modules.add('orgs');
    if (selected.some((m) => !['orgs', 'users'].includes(m))) {
      modules.add('repos');
    }
    resolvedModules = MODULE_IDS.filter((m) => modules.has(m));
  }

  if (values.format !== 'json') throw new Error('Only json is supported');
  if (!values.output?.trim()) throw new Error('Output path is empty');
  if (!['standard', 'minimal'].includes(values['redaction-profile'])) {
    throw new Error('Invalid redaction profile');
  }

  return {
    scope: { kind: scopeKind, name: scopeName },
    modules: resolvedModules,
    output: values.output,
    format: 'json',
    dryRun: values['dry-run'],
    includeSensitiveMetadata: values['include-sensitive-metadata'],
    redactionProfile: values['redaction-profile'] as 'standard' | 'minimal',
    continueOnError: values['continue-on-error'],
    verbose: values.verbose,
    appId: values['app-id'],
    privateKeyPath: values['private-key-path'],
    installationId: values['installation-id'],
    resume: values.resume,
    salt: values.salt,
  };
}
