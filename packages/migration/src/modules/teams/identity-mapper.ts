import type { IdentityMappingConfig, IdentityMappingResult } from './types.js';

/**
 * Maps source GitHub identities to target GHEC-EMU logins.
 * Supports explicit dictionary mapping, enterprise suffix rules (e.g. `_acme`),
 * or pass-through mode, with structured fallback warnings for unmapped users.
 */
export class IdentityMappingEngine {
  private readonly config: IdentityMappingConfig;

  constructor(config?: IdentityMappingConfig) {
    this.config = config ?? { strategy: 'pass-through' };
  }

  /**
   * Maps a single source login to target login based on configured strategy.
   */
  mapLogin(sourceLogin: string): IdentityMappingResult {
    const trimmed = sourceLogin.trim();
    if (!trimmed) {
      return {
        sourceLogin,
        mappedLogin: sourceLogin,
        status: 'unmapped',
        warning: 'Empty source login cannot be mapped',
      };
    }

    // 1. Explicit dictionary override always takes precedence across all strategies
    if (this.config.mappings && trimmed in this.config.mappings) {
      const mapped = this.config.mappings[trimmed]!;
      return {
        sourceLogin: trimmed,
        mappedLogin: mapped,
        status: 'mapped',
      };
    }

    // 2. Strategy evaluation
    switch (this.config.strategy) {
      case 'pass-through': {
        return {
          sourceLogin: trimmed,
          mappedLogin: trimmed,
          status: 'pass-through',
        };
      }

      case 'emu-saml': {
        if (this.config.suffix) {
          const suffix = this.config.suffix.startsWith('_')
            ? this.config.suffix
            : `_${this.config.suffix}`;
          return {
            sourceLogin: trimmed,
            mappedLogin: `${trimmed}${suffix}`,
            status: 'mapped',
          };
        }
        return {
          sourceLogin: trimmed,
          mappedLogin: trimmed,
          status: 'unmapped',
          warning: `No suffix configured for EMU SAML strategy; user '${trimmed}' remained untranslated`,
        };
      }

      case 'manual': {
        return {
          sourceLogin: trimmed,
          mappedLogin: trimmed,
          status: 'unmapped',
          warning: `Explicit EMU dictionary mapping missing for user '${trimmed}'`,
        };
      }

      default: {
        return {
          sourceLogin: trimmed,
          mappedLogin: trimmed,
          status: 'pass-through',
        };
      }
    }
  }

  /**
   * Maps an array of logins in batch.
   */
  mapLogins(sourceLogins: readonly string[]): IdentityMappingResult[] {
    return sourceLogins.map((login) => this.mapLogin(login));
  }

  /**
   * Checks whether any results in a set of mappings contain unmapped identities.
   */
  hasUnmappedIdentities(results: readonly IdentityMappingResult[]): boolean {
    return results.some((r) => r.status === 'unmapped');
  }
}
