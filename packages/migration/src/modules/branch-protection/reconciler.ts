import type { GitHubRuleset, RulesetRule } from '../rulesets/types.js';
import type {
  BranchProtectionReconciliationDiff,
  BranchProtectionRule,
  ProtectionActorsAllowances,
} from './types.js';

export function isEnabled(
  val: { readonly enabled: boolean } | boolean | null | undefined,
): boolean {
  if (typeof val === 'boolean') return val;
  if (val && typeof val === 'object' && 'enabled' in val)
    return Boolean(val.enabled);
  return false;
}

function hasActors(actors?: ProtectionActorsAllowances | null): boolean {
  if (!actors) return false;
  return Boolean(
    (actors.users && actors.users.length > 0) ||
    (actors.teams && actors.teams.length > 0) ||
    (actors.apps && actors.apps.length > 0),
  );
}

export function computeBranchProtectionReconciliation(
  source: BranchProtectionRule,
  target?: BranchProtectionRule | undefined,
): BranchProtectionReconciliationDiff {
  const srcPr = source.required_pull_request_reviews;
  const tgtPr = target?.required_pull_request_reviews;

  // 1. Bypass pull request allowances
  const hasBypassPR = Boolean(hasActors(srcPr?.bypass_pull_request_allowances));
  const tgtHasBypassPR = Boolean(
    hasActors(tgtPr?.bypass_pull_request_allowances),
  );
  const omittedBypassPR = hasBypassPR && !tgtHasBypassPR;

  // 2. Require approval of the most recent push
  const srcLastPush = Boolean(srcPr?.require_last_push_approval);
  const tgtLastPush = Boolean(tgtPr?.require_last_push_approval);
  const omittedLastPush = srcLastPush && !tgtLastPush;

  // 3. Require deployments to succeed before merging
  const srcDeployments = source.required_deployments?.environments ?? [];
  const tgtDeployments = target?.required_deployments?.environments ?? [];
  const omittedDeployments =
    srcDeployments.length > 0 &&
    (tgtDeployments.length === 0 ||
      srcDeployments.some((env) => !tgtDeployments.includes(env)));

  // 4. Lock branch
  const srcLock = isEnabled(source.lock_branch);
  const tgtLock = isEnabled(target?.lock_branch);
  const omittedLock = srcLock && !tgtLock;

  // 5. Restrict branch creations (block_creations)
  const srcCreations = isEnabled(source.block_creations);
  const tgtCreations = isEnabled(target?.block_creations);
  const omittedCreations = srcCreations && !tgtCreations;

  // 6. Allow force pushes
  const srcForcePushes = isEnabled(source.allow_force_pushes);
  const tgtForcePushes = isEnabled(target?.allow_force_pushes);
  const omittedForcePushes = srcForcePushes && !tgtForcePushes;

  // 7. Dismissal restrictions exceptions
  const srcDismissal = Boolean(hasActors(srcPr?.dismissal_restrictions));
  const tgtDismissal = Boolean(hasActors(tgtPr?.dismissal_restrictions));
  const omittedDismissal = srcDismissal && !tgtDismissal;

  const needsReconciliation =
    !target ||
    omittedBypassPR ||
    omittedLastPush ||
    omittedDeployments ||
    omittedLock ||
    omittedCreations ||
    omittedForcePushes ||
    omittedDismissal;

  // Build the complete reconciled PUT payload
  const reconciledPayload: Record<string, unknown> = {
    enforce_admins: isEnabled(source.enforce_admins),
    required_linear_history: isEnabled(source.required_linear_history),
    allow_force_pushes: srcForcePushes,
    allow_deletions: isEnabled(source.allow_deletions),
    block_creations: srcCreations,
    required_conversation_resolution: isEnabled(
      source.required_conversation_resolution,
    ),
    lock_branch: srcLock,
  };

  // Required status checks
  if (source.required_status_checks) {
    const checks = source.required_status_checks.checks
      ? source.required_status_checks.checks.map((c) => ({
          context: c.context,
          ...(c.app_id !== undefined ? { app_id: c.app_id } : {}),
        }))
      : [];
    const contexts =
      source.required_status_checks.contexts ??
      source.required_status_checks.checks?.map((c) => c.context) ??
      [];

    reconciledPayload.required_status_checks = {
      strict: Boolean(source.required_status_checks.strict),
      contexts,
      ...(checks.length > 0 ? { checks } : {}),
    };
  } else {
    reconciledPayload.required_status_checks = null;
  }

  // Required pull request reviews (merging the 3 review-level omitted settings)
  if (srcPr) {
    const prPayload: Record<string, unknown> = {
      dismiss_stale_reviews: Boolean(srcPr.dismiss_stale_reviews),
      require_code_owner_reviews: Boolean(srcPr.require_code_owner_reviews),
      required_approving_review_count:
        srcPr.required_approving_review_count ?? 1,
      require_last_push_approval: srcLastPush,
    };

    if (srcPr.dismissal_restrictions) {
      prPayload.dismissal_restrictions = {
        users: srcPr.dismissal_restrictions.users
          ? [...srcPr.dismissal_restrictions.users]
          : [],
        teams: srcPr.dismissal_restrictions.teams
          ? [...srcPr.dismissal_restrictions.teams]
          : [],
        apps: srcPr.dismissal_restrictions.apps
          ? [...srcPr.dismissal_restrictions.apps]
          : [],
      };
    }

    if (srcPr.bypass_pull_request_allowances) {
      prPayload.bypass_pull_request_allowances = {
        users: srcPr.bypass_pull_request_allowances.users
          ? [...srcPr.bypass_pull_request_allowances.users]
          : [],
        teams: srcPr.bypass_pull_request_allowances.teams
          ? [...srcPr.bypass_pull_request_allowances.teams]
          : [],
        apps: srcPr.bypass_pull_request_allowances.apps
          ? [...srcPr.bypass_pull_request_allowances.apps]
          : [],
      };
    }

    reconciledPayload.required_pull_request_reviews = prPayload;
  } else {
    reconciledPayload.required_pull_request_reviews = null;
  }

  // Push restrictions
  if (source.restrictions) {
    reconciledPayload.restrictions = {
      users: source.restrictions.users ? [...source.restrictions.users] : [],
      teams: source.restrictions.teams ? [...source.restrictions.teams] : [],
      apps: source.restrictions.apps ? [...source.restrictions.apps] : [],
    };
  } else {
    reconciledPayload.restrictions = null;
  }

  // Required deployments
  if (srcDeployments.length > 0) {
    reconciledPayload.required_deployments = {
      environments: [...srcDeployments],
    };
  }

  return {
    branch: source.branch,
    needsReconciliation,
    omittedSettings: {
      bypassPullRequestAllowances: omittedBypassPR,
      requireLastPushApproval: omittedLastPush,
      requiredDeployments: omittedDeployments,
      lockBranch: omittedLock,
      blockCreations: omittedCreations,
      allowForcePushesCustom: omittedForcePushes,
      dismissalRestrictions: omittedDismissal,
    },
    reconciledPayload,
  };
}

export function convertBranchProtectionToRuleset(
  protection: BranchProtectionRule,
): GitHubRuleset {
  const rules: RulesetRule[] = [];

  // 1. Deletion rule: in classic branch protection, deletions are blocked unless allow_deletions is true
  if (!isEnabled(protection.allow_deletions)) {
    rules.push({ type: 'deletion' });
  }

  // 2. Non-fast-forward: force pushes blocked unless allow_force_pushes is true
  if (!isEnabled(protection.allow_force_pushes)) {
    rules.push({ type: 'non_fast_forward' });
  }

  // 3. Required linear history
  if (isEnabled(protection.required_linear_history)) {
    rules.push({ type: 'required_linear_history' });
  }

  // 4. Required signatures
  if (isEnabled(protection.required_signatures)) {
    rules.push({ type: 'required_signatures' });
  }

  // 5. Block branch creations
  if (isEnabled(protection.block_creations)) {
    rules.push({ type: 'creation' });
  }

  // 6. Required status checks
  if (protection.required_status_checks) {
    const checks =
      protection.required_status_checks.checks?.map((c) => ({
        context: c.context,
        integration_id: c.app_id,
      })) ??
      protection.required_status_checks.contexts?.map((context) => ({
        context,
      })) ??
      [];

    rules.push({
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: Boolean(
          protection.required_status_checks.strict,
        ),
        required_status_checks: checks,
      },
    });
  }

  // 7. Pull request rule
  if (protection.required_pull_request_reviews) {
    const pr = protection.required_pull_request_reviews;
    rules.push({
      type: 'pull_request',
      parameters: {
        required_approving_review_count:
          pr.required_approving_review_count ?? 1,
        dismiss_stale_reviews_on_push: Boolean(pr.dismiss_stale_reviews),
        require_code_owner_review: Boolean(pr.require_code_owner_reviews),
        require_last_push_approval: Boolean(pr.require_last_push_approval),
        required_review_thread_resolution: isEnabled(
          protection.required_conversation_resolution,
        ),
      },
    });
  }

  // 8. Required deployments
  if (
    protection.required_deployments?.environments &&
    protection.required_deployments.environments.length > 0
  ) {
    rules.push({
      type: 'required_deployments',
      parameters: {
        required_deployment_environments: [
          ...protection.required_deployments.environments,
        ],
      },
    });
  }

  return {
    name: `Branch protection: ${protection.branch}`,
    target: 'branch',
    enforcement: 'active',
    conditions: {
      ref_name: {
        include: [`refs/heads/${protection.branch}`],
        exclude: [],
      },
    },
    rules,
  };
}
