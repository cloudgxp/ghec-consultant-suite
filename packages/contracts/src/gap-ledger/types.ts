/**
 * Core domain types and enumerations for the migration capability gap ledger.
 */

export type ResourceCategory =
  'organization' | 'repository' | 'actions' | 'security' | 'identity';

export type MigrationMechanism =
  'gei_native' | 'rest_rehydration' | 'graphql_mutation' | 'manual_advisory';

export type ImplementationStatus = 'implemented' | 'partial' | 'missing';

export type SecretHandlingStrategy =
  'sealed_box_blank' | 'vault_hook' | 'none' | 'ephemeral_runtime';

export type EmuConstraintType =
  | 'scim_identity'
  | 'saml_sso'
  | 'mannequin_mapping'
  | 'visibility_policy'
  | 'outside_collaborator'
  | 'runner_network';

export type WavePriority = 'P1' | 'P2' | 'P3';

export type DiscrepancySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface EmuGovernanceConstraint {
  readonly type: EmuConstraintType;
  readonly description: string;
  readonly mitigation: string;
}

export interface CapabilityGapEntry {
  readonly id: string;
  readonly name: string;
  readonly category: ResourceCategory;
  readonly docsRef: string;
  readonly mechanism: MigrationMechanism;
  readonly status: ImplementationStatus;
  readonly existingModuleId?: string;
  readonly proposedModuleId?: string;
  readonly secretHandling: SecretHandlingStrategy;
  readonly emuConstraints: readonly EmuGovernanceConstraint[];
  readonly notes: string;
}

export interface GapSummary {
  readonly totalResources: number;
  readonly implementedCount: number;
  readonly partialCount: number;
  readonly missingCount: number;
  readonly categoryCounts: Readonly<Record<string, number>>;
}

export interface ImplementationRoadmapWave {
  readonly wave: number;
  readonly name: string;
  readonly priority: WavePriority;
  readonly moduleIds: readonly string[];
  readonly rationale: string;
}

export interface GapLedgerManifest {
  readonly schemaVersion: '1.0.0';
  readonly generatedAt: string;
  readonly summary: GapSummary;
  readonly resources: readonly CapabilityGapEntry[];
  readonly waves: readonly ImplementationRoadmapWave[];
}

export interface StageContract {
  readonly [key: string]: unknown;
}

export interface ModuleDecompositionBlueprint {
  readonly moduleId: string;
  readonly targetResource: string;
  readonly dependencies: readonly string[];
  readonly discoverStage: {
    readonly clientMethod: string;
    readonly payloadType: string;
    readonly queryPattern: string;
  };
  readonly planStage: {
    readonly diffStrategy: string;
    readonly actionTypes: readonly string[];
    readonly idempotencyKey: string;
  };
  readonly applyStage: {
    readonly clientMethod: string;
    readonly dryRunSupported: true;
    readonly rateLimitBucket: string;
    readonly mutationEndpoint: string;
  };
  readonly verifyStage: {
    readonly verificationQuery: string;
    readonly comparisonKeys: readonly string[];
    readonly discrepancySeverity: DiscrepancySeverity;
  };
}
