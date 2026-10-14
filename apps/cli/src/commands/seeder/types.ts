import type { SeedExecutionAction } from '@ghec/contracts';
import type { SeederGitHubClient } from './client.js';

export interface ItemProvisionContext {
  readonly client: SeederGitHubClient;
  readonly organization: string;
  readonly repository?: string | undefined;
  readonly prefix: string;
  readonly dryRun: boolean;
  readonly logger: (message: string) => void;
}

export interface ProvisionResult {
  readonly action: SeedExecutionAction;
  readonly resourceIdentifier: string;
  readonly details?: string | null | undefined;
  readonly warning?: string | null | undefined;
  readonly error?: string | null | undefined;
}

export interface ItemProvisioner {
  readonly id: string;
  provision(ctx: ItemProvisionContext): Promise<ProvisionResult>;
  cleanup?(ctx: ItemProvisionContext): Promise<void>;
}

export interface SeederRunOptions {
  readonly client?: SeederGitHubClient | undefined;
  readonly logger?: ((message: string) => void) | undefined;
  readonly provisioners?: Map<string, ItemProvisioner> | undefined;
}
