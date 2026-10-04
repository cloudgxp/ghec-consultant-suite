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

export function areConditionsEqual(
  a?: RulesetConditions,
  b?: RulesetConditions,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const aInc = normalizeArray(a.ref_name?.include);
  const bInc = normalizeArray(b.ref_name?.include);
  if (
    aInc.length !== bInc.length ||
    aInc.some((val, idx) => val !== bInc[idx])
  ) {
    return false;
  }

  const aExc = normalizeArray(a.ref_name?.exclude);
  const bExc = normalizeArray(b.ref_name?.exclude);
  if (
    aExc.length !== bExc.length ||
    aExc.some((val, idx) => val !== bExc[idx])
  ) {
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

  const aSorted = [...a].sort((x, y) => x.type.localeCompare(y.type));
  const bSorted = [...b].sort((x, y) => x.type.localeCompare(y.type));

  for (let i = 0; i < aSorted.length; i++) {
    const ruleA = aSorted[i]!;
    const ruleB = bSorted[i]!;
    if (ruleA.type !== ruleB.type) return false;

    const paramA = JSON.stringify(ruleA.parameters ?? {});
    const paramB = JSON.stringify(ruleB.parameters ?? {});
    if (paramA !== paramB) return false;
  }

  return true;
}

export function areBypassActorsEqual(
  aActors?: readonly BypassActor[],
  bActors?: readonly BypassActor[],
): boolean {
  const a = aActors ?? [];
  const b = bActors ?? [];
  if (a.length !== b.length) return false;

  const key = (act: BypassActor) =>
    `${act.actor_type}:${act.actor_id ?? ''}:${act.bypass_mode}`;
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
