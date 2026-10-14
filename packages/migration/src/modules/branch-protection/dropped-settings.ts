import type { BranchProtectionRule } from './types.js';

export interface DroppedSettingDescriptor {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly isPresentInSource: (rule: BranchProtectionRule) => boolean;
}

/**
 * The 7 specific classic branch protection settings dropped by GEI during native import (DEC-009).
 */
export const GEI_DROPPED_BRANCH_PROTECTION_SETTINGS: readonly DroppedSettingDescriptor[] =
  [
    {
      key: 'bypass_pull_request_allowances',
      name: 'Bypass Pull Request Allowances',
      description:
        'Allow specific actors (users/teams/apps) to bypass pull request requirements.',
      isPresentInSource: (rule) => {
        const bypass =
          rule.required_pull_request_reviews?.bypass_pull_request_allowances;
        if (!bypass) return false;
        return Boolean(
          (bypass.users && bypass.users.length > 0) ||
          (bypass.teams && bypass.teams.length > 0) ||
          (bypass.apps && bypass.apps.length > 0),
        );
      },
    },
    {
      key: 'require_last_push_approval',
      name: 'Require Last Push Approval',
      description:
        'Require the most recent reviewable push to be approved before merging.',
      isPresentInSource: (rule) =>
        Boolean(rule.required_pull_request_reviews?.require_last_push_approval),
    },
    {
      key: 'required_deployments',
      name: 'Required Deployments Enforcement',
      description:
        'Require successful deployments to specific environments prior to merge.',
      isPresentInSource: (rule) => {
        const deployments = rule.required_deployments?.environments;
        return Boolean(deployments && deployments.length > 0);
      },
    },
    {
      key: 'lock_branch',
      name: 'Lock Branch',
      description: 'Make the protected branch read-only.',
      isPresentInSource: (rule) => {
        if (typeof rule.lock_branch === 'boolean') return rule.lock_branch;
        return Boolean(rule.lock_branch?.enabled);
      },
    },
    {
      key: 'block_creations',
      name: 'Block Creations',
      description: 'Restrict pushes that create matching branch names.',
      isPresentInSource: (rule) => {
        if (typeof rule.block_creations === 'boolean')
          return rule.block_creations;
        return Boolean(rule.block_creations?.enabled);
      },
    },
    {
      key: 'restrictions_users',
      name: 'Force Push User Restrictions',
      description:
        'Restrict force push permissions to designated individual actors.',
      isPresentInSource: (rule) => {
        const restrictions = rule.restrictions;
        return Boolean(restrictions?.users && restrictions.users.length > 0);
      },
    },
    {
      key: 'dismissal_restrictions',
      name: 'Review Dismissal Exemptions',
      description:
        'Restrict who can dismiss pull request reviews to designated actors.',
      isPresentInSource: (rule) => {
        const dismissal =
          rule.required_pull_request_reviews?.dismissal_restrictions;
        if (!dismissal) return false;
        return Boolean(
          (dismissal.users && dismissal.users.length > 0) ||
          (dismissal.teams && dismissal.teams.length > 0) ||
          (dismissal.apps && dismissal.apps.length > 0),
        );
      },
    },
  ];

/**
 * Evaluates a source branch protection rule and returns the keys of any omitted settings present.
 */
export function identifyDroppedSettings(
  rule: BranchProtectionRule,
): readonly string[] {
  return GEI_DROPPED_BRANCH_PROTECTION_SETTINGS.filter((s) =>
    s.isPresentInSource(rule),
  ).map((s) => s.key);
}

/**
 * Returns true if a source branch protection rule requires post-GEI reconciliation.
 */
export function requiresBranchProtectionReconciliation(
  rule: BranchProtectionRule,
): boolean {
  return identifyDroppedSettings(rule).length > 0;
}
