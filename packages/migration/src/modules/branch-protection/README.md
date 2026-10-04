# `branch-protection` Migration Module (DEC-009)

## Overview

GitHub Enterprise Importer (GEI) automatically migrates repository branch protections, but systematically drops 7 specific settings and exceptions:

1. `bypass_pull_request_allowances`: Users, teams, or apps allowed to bypass required PRs.
2. `require_last_push_approval`: Requiring the most recent commit to receive an approving review.
3. `required_deployments`: Requiring deployments to specified environments before merging.
4. `lock_branch`: Making branches read-only.
5. `block_creations`: Restricting branch creations matching patterns.
6. `allow_force_pushes`: When enabled in "Specify who can force push" mode.
7. `dismissal_restrictions`: Exceptions allowing specific actors to dismiss PR reviews.

This module inspects destination branch protections post-GEI, calculates the missing settings, and applies an in-place merge via `PUT /repos/{owner}/{repo}/branches/{branch}/protection` without clobbering existing settings.

## Conversion to Rulesets

The module also provides `convertBranchProtectionToRuleset`, adhering to official GitHub migration guidance to convert legacy branch protections into modern repository rulesets.
