import { parseArgs } from 'node:util';
import { MODULE_IDS, type ModuleId } from '@ghec/contracts';
export interface DiscoveryPlan {
  scope: { kind: 'organization' | 'enterprise'; name: string };
  modules: ModuleId[];
  output: string;
  format: 'json';
  dryRun: boolean;
  includeSensitiveMetadata: boolean;
  redactionProfile: 'standard' | 'minimal';
  continueOnError: boolean;
  verbose: boolean;
}
/** Offline syntax validation only. Does not validate credentials or API access. */
export function parseDiscoveryOptions(args: string[]): DiscoveryPlan {
  const { values } = parseArgs({
    args,
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
    },
  });
  if (Boolean(values.organization) === Boolean(values.enterprise))
    throw new Error('Choose exactly one scope');
  const name = values.organization ?? values.enterprise;
  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(name))
    throw new Error('Invalid scope name');
  if (!values.modules) throw new Error('Modules are required');
  const selected =
    values.modules === 'all'
      ? [...MODULE_IDS]
      : values.modules.split(',').map((m) => m.trim());
  if (
    !selected.length ||
    selected.some((m) => !MODULE_IDS.includes(m as ModuleId))
  )
    throw new Error('Invalid modules');
  if (values.format !== 'json') throw new Error('Only json is supported');
  if (!values.output?.trim()) throw new Error('Output path is empty');
  if (!['standard', 'minimal'].includes(values['redaction-profile']))
    throw new Error('Invalid redaction profile');
  // Organization identity is mandatory; repository-scoped modules require normalized repository anchors.
  const modules = new Set<ModuleId>(selected as ModuleId[]);
  modules.add('orgs');
  if (selected.some((m) => !['orgs', 'users'].includes(m)))
    modules.add('repos');
  return {
    scope: { kind: values.organization ? 'organization' : 'enterprise', name },
    modules: MODULE_IDS.filter((m) => modules.has(m)),
    output: values.output,
    format: 'json',
    dryRun: values['dry-run'],
    includeSensitiveMetadata: values['include-sensitive-metadata'],
    redactionProfile: values['redaction-profile'] as 'standard' | 'minimal',
    continueOnError: values['continue-on-error'],
    verbose: values.verbose,
  };
}
