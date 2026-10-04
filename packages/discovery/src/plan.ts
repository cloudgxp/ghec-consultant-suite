import type { ModuleId } from '@ghec/contracts';

/** Validated, offline-parsed description of a discovery run. */
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
  appId?: string | undefined;
  privateKeyPath?: string | undefined;
  installationId?: string | undefined;
  resume?: string | undefined;
  salt?: string | undefined;
}
