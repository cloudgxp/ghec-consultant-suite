import type {
  ModuleExecutionResult,
  ModulePlan,
  OperationExecutionResult,
  PlannedOperation,
} from '@ghec/contracts';
import { sanitizeDiagnostics } from '@ghec/github-client';

export interface ExecutionEnrichmentFallback {
  readonly targetIdentifier?: string | undefined;
  readonly scopeLevel?: 'organization' | 'repository' | undefined;
}

/**
 * Enriches a ModuleExecutionResult and its child OperationExecutionResult entries
 * with targetIdentifier, scopeLevel, resourceType, resourceName, operationType,
 * and reason from the corresponding ModulePlan.
 */
export function enrichModuleExecutionResult(
  result: ModuleExecutionResult,
  plan?: ModulePlan | undefined,
  fallback?: ExecutionEnrichmentFallback | undefined,
): ModuleExecutionResult {
  const opById = new Map<string, PlannedOperation>();
  if (plan?.operations) {
    for (const op of plan.operations) {
      opById.set(op.id, op);
    }
  }

  const targetIdentifier =
    result.targetIdentifier ??
    plan?.targetIdentifier ??
    fallback?.targetIdentifier;
  const scopeLevel =
    result.scopeLevel ?? plan?.scopeLevel ?? fallback?.scopeLevel;

  const singlePlannedOp =
    plan?.operations.length === 1 && result.results.length === 1
      ? plan.operations[0]
      : undefined;

  const enrichedResults: OperationExecutionResult[] = result.results.map(
    (opResult) => {
      const planned = opById.get(opResult.operationId) ?? singlePlannedOp;
      const resourceType = opResult.resourceType ?? planned?.resourceType;
      const resourceName = opResult.resourceName ?? planned?.resourceName;
      const operationType = opResult.operationType ?? planned?.operation;
      const rawReason = opResult.reason ?? planned?.reason;
      const reason =
        rawReason !== undefined ? sanitizeDiagnostics(rawReason) : undefined;
      const error =
        opResult.error !== undefined
          ? sanitizeDiagnostics(opResult.error)
          : undefined;
      const opTargetId = opResult.targetIdentifier ?? targetIdentifier;

      return {
        ...opResult,
        ...(error !== undefined ? { error } : {}),
        ...(resourceType ? { resourceType } : {}),
        ...(resourceName ? { resourceName } : {}),
        ...(operationType ? { operationType } : {}),
        ...(reason !== undefined ? { reason } : {}),
        ...(opTargetId ? { targetIdentifier: opTargetId } : {}),
      };
    },
  );

  return {
    ...result,
    ...(targetIdentifier ? { targetIdentifier } : {}),
    ...(scopeLevel ? { scopeLevel } : {}),
    results: enrichedResults,
  };
}
