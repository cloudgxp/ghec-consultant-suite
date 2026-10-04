import type { StructuredLogger } from '../../core/types.js';
import type { GeiCommandRunner } from '../../gei/types.js';
import type { IdentityMappingEngine } from '../../modules/teams/identity-mapper.js';

/**
 * Notice documenting GHEC-EMU platform limitation regarding Git commit authorship reattribution.
 * Per DEC-013, managed users cannot add secondary emails to their EMU profiles.
 */
export const COMMIT_AUTHORSHIP_LIMITATION_NOTICE =
  'In GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU), managed users cannot add personal or secondary email addresses to their enterprise accounts. Consequently, Git commits authored using non-primary or legacy email addresses will remain attributed to author strings rather than linked to the user’s EMU profile. Only commits authored using the user’s primary IdP-linked email address can be attributed to the managed user account. (DEC-013)';

/**
 * Represents a single mannequin identity parsed from `generate-mannequin-csv` output.
 */
export interface MannequinRecord {
  /** Placeholder login assigned to the user during migration (e.g. 'monalisa-mannequin'). */
  mannequinUser: string;
  /** Unique GraphQL node ID of the mannequin. */
  mannequinId: string;
  /** Target GitHub or EMU login to attribute contributions to (e.g. 'monalisa_acme'). */
  targetUser?: string | undefined;
  /** Current reclamation status. */
  status?: ('completed' | 'invited' | 'unmapped' | 'pending') | undefined;
}

/**
 * Discovered mannequin state for an organization.
 */
export interface MannequinDiscoveredData {
  targetOrg: string;
  records: MannequinRecord[];
  sourceCsvPath?: string | undefined;
}

/**
 * Configuration options for executing mannequin reclamation.
 */
export interface MannequinReclamationOptions {
  /** Target GHEC organization name. */
  targetOrg: string;
  /** Personal Access Token with admin access to destination organization. */
  targetToken?: string | undefined;
  /** Optional custom path for the generated/modified mannequin CSV. */
  csvPath?: string | undefined;
  /**
   * Whether destination is a GHEC-EMU environment.
   * If true (default), passes `--skip-invitation` to immediately reattribute contributions.
   * If false, sends standard attribution invitation emails.
   */
  isEmu?: boolean | undefined;
  /** Engine used to map source contributors to target EMU identities. */
  identityMapper?: IdentityMappingEngine | undefined;
  /** Custom runner for GEI CLI commands (used for testing or custom execution). */
  geiRunner?: GeiCommandRunner | undefined;
  /** If true, simulates reclamation without executing destructive mutations. */
  dryRun?: boolean | undefined;
  /** Structured logger. */
  logger?: StructuredLogger | undefined;
}

/**
 * Outcome report produced by the MannequinReclamationEngine.
 */
export interface MannequinReclamationReport {
  targetOrg: string;
  totalMannequins: number;
  reclaimedCount: number;
  invitedCount: number;
  unmappedCount: number;
  records: MannequinRecord[];
  unmappedUsers: string[];
  limitationsNotice: string;
}
