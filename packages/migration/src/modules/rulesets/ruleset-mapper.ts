import type {
  GitHubRuleset,
  RulesetRule,
  BypassActor,
  RulesetConditions,
} from './types.js';

export function isInheritedOrganizationRuleset(
  ruleset: GitHubRuleset,
): boolean {
  return ruleset.source_type === 'Organization';
}

function normalizeArray(arr?: readonly string[]): string[] {
  return arr ? [...arr].sort() : [];
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) {
        sorted[key] = canonicalizeValue(record[key]);
      }
    }
    return sorted;
  }
  return value;
}

function canonicalizeJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

export function areConditionsEqual(
  a?: RulesetConditions,
  b?: RulesetConditions,
): boolean {
  if (!a && !b) return true;
  const condA = a ?? {};
  const condB = b ?? {};

  const aInc = normalizeArray(condA.ref_name?.include);
  const bInc = normalizeArray(condB.ref_name?.include);
  if (
    aInc.length !== bInc.length ||
    aInc.some((val, idx) => val !== bInc[idx])
  ) {
    return false;
  }

  const aExc = normalizeArray(condA.ref_name?.exclude);
  const bExc = normalizeArray(condB.ref_name?.exclude);
  if (
    aExc.length !== bExc.length ||
    aExc.some((val, idx) => val !== bExc[idx])
  ) {
    return false;
  }

  const aRepoInc = normalizeArray(condA.repository_name?.include);
  const bRepoInc = normalizeArray(condB.repository_name?.include);
  if (
    aRepoInc.length !== bRepoInc.length ||
    aRepoInc.some((val, idx) => val !== bRepoInc[idx])
  ) {
    return false;
  }

  const aRepoExc = normalizeArray(condA.repository_name?.exclude);
  const bRepoExc = normalizeArray(condB.repository_name?.exclude);
  if (
    aRepoExc.length !== bRepoExc.length ||
    aRepoExc.some((val, idx) => val !== bRepoExc[idx])
  ) {
    return false;
  }

  if (
    Boolean(condA.repository_name?.protected) !==
    Boolean(condB.repository_name?.protected)
  ) {
    return false;
  }

  const aRepoIds = [...(condA.repository_id?.repository_ids ?? [])].sort(
    (x, y) => x - y,
  );
  const bRepoIds = [...(condB.repository_id?.repository_ids ?? [])].sort(
    (x, y) => x - y,
  );
  if (
    aRepoIds.length !== bRepoIds.length ||
    aRepoIds.some((val, idx) => val !== bRepoIds[idx])
  ) {
    return false;
  }

  const aProp = canonicalizeJson(condA.repository_property ?? null);
  const bProp = canonicalizeJson(condB.repository_property ?? null);
  if (aProp !== bProp) {
    return false;
  }

  return true;
}

export function areRulesEqual(
  aRules?: readonly RulesetRule[],
  bRules?: readonly RulesetRule[],
): boolean {
  const a = aRules ?? [];
  const b = bRules ?? [];
  if (a.length !== b.length) return false;

  const ruleKey = (r: RulesetRule): string =>
    `${r.type}:${canonicalizeJson(r.parameters ?? {})}`;
  const aKeys = a.map(ruleKey).sort();
  const bKeys = b.map(ruleKey).sort();

  return aKeys.every((k, idx) => k === bKeys[idx]);
}

export function areBypassActorsEqual(
  aActors?: readonly BypassActor[],
  bActors?: readonly BypassActor[],
): boolean {
  const a = aActors ?? [];
  const b = bActors ?? [];
  if (a.length !== b.length) return false;

  const key = (act: BypassActor) => {
    const actorId =
      act.actor_type === 'OrganizationAdmin' || act.actor_type === 'DeployKey'
        ? '1'
        : String(act.actor_id ?? '');
    return `${act.actor_type}:${actorId}:${act.bypass_mode}`;
  };
  const aKeys = a.map(key).sort();
  const bKeys = b.map(key).sort();

  return aKeys.every((k, idx) => k === bKeys[idx]);
}

export function areRulesetsEqual(
  source: GitHubRuleset,
  target: GitHubRuleset,
): boolean {
  if (source.name !== target.name) return false;
  if (source.target !== target.target) return false;
  if (source.enforcement !== target.enforcement) return false;
  if (!areConditionsEqual(source.conditions, target.conditions)) return false;
  if (!areRulesEqual(source.rules, target.rules)) return false;
  if (!areBypassActorsEqual(source.bypass_actors, target.bypass_actors))
    return false;

  return true;
}

export function sanitizeRulesetPayload(
  ruleset: GitHubRuleset,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
  };
  if (ruleset.conditions) {
    payload.conditions = ruleset.conditions;
  }
  if (ruleset.rules) {
    payload.rules = ruleset.rules;
  }
  if (ruleset.bypass_actors) {
    payload.bypass_actors = ruleset.bypass_actors;
  }
  return payload;
}
