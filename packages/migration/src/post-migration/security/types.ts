export type SecurityFeatureStatus = 'enabled' | 'disabled' | 'not_set';

export interface FeatureStatusObject {
  readonly status: SecurityFeatureStatus;
}

export interface RepositorySecuritySettings {
  readonly advanced_security?: FeatureStatusObject | undefined;
  readonly secret_scanning?: FeatureStatusObject | undefined;
  readonly secret_scanning_push_protection?: FeatureStatusObject | undefined;
  readonly dependabot_security_updates?: FeatureStatusObject | undefined;
  readonly secret_scanning_validity_checks?: FeatureStatusObject | undefined;
}

export interface RawRepositorySecurityResponse {
  readonly id?: number;
  readonly name?: string;
  readonly full_name?: string;
  readonly security_and_analysis?:
    | {
        readonly advanced_security?: { readonly status?: string } | undefined;
        readonly secret_scanning?: { readonly status?: string } | undefined;
        readonly secret_scanning_push_protection?:
          { readonly status?: string } | undefined;
        readonly dependabot_security_updates?:
          { readonly status?: string } | undefined;
        readonly secret_scanning_validity_checks?:
          { readonly status?: string } | undefined;
      }
    | undefined;
}

export interface SecretScanningAlert {
  readonly number: number;
  readonly secret_type: string;
  readonly secret_type_display_name?: string | undefined;
  readonly state: 'open' | 'resolved';
  readonly resolution?:
    | 'false_positive'
    | 'wont_fix'
    | 'revoked'
    | 'used_in_tests'
    | string
    | null
    | undefined;
  readonly resolved_at?: string | null | undefined;
  readonly resolution_comment?: string | null | undefined;
  readonly secret?: string | undefined;
}

export interface SarifAnalysisRecord {
  readonly id: number;
  readonly ref: string;
  readonly commit_sha: string;
  readonly tool: {
    readonly name: string;
    readonly version?: string | undefined;
  };
  readonly sarif?: string | undefined;
}

export interface GhasSecurityDiscoveredData {
  readonly repository: string;
  readonly settings: RepositorySecuritySettings;
  readonly resolvedAlerts: readonly SecretScanningAlert[];
  readonly sarifAnalyses?: readonly SarifAnalysisRecord[] | undefined;
}

export interface GhasSecurityModuleOptions {
  readonly syncSarif?: boolean | undefined;
  readonly defaultResolutionCommentPrefix?: string | undefined;
  readonly targetHasGhasLicense?: boolean | undefined;
}

export interface AlertRemediationMatch {
  readonly targetAlertNumber: number;
  readonly secretType: string;
  readonly sourceResolution: string;
  readonly resolutionComment: string;
}

export interface GhasFidelityReport {
  readonly repository: string;
  readonly featuresConfigured: Record<string, SecurityFeatureStatus>;
  readonly secretAlertsRemediatedCount: number;
  readonly sarifUploaded: boolean;
  readonly limitationsNotices: readonly string[];
}
