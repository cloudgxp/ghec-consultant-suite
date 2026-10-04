import type { OperationType, PlannedOperation } from '../core/types.js';

export interface DiffItem<T = unknown> {
  readonly id: string;
  readonly resourceType: string;
  readonly resourceName: string;
  readonly source?: T | undefined;
  readonly target?: T | undefined;
  readonly isEqual?: (source: T, target: T) => boolean;
  readonly canOverwrite?: boolean | undefined;
  readonly buildPayload?: (source: T, target?: T | undefined) => unknown;
}

/**
 * Pure diffing utility that compares a source entity against a destination entity
 * and yields a standard PlannedOperation ('create' | 'update' | 'noop' | 'skip').
 */
export function calculateEntityDiff<T = unknown>(
  item: DiffItem<T>,
): PlannedOperation {
  const {
    id,
    resourceType,
    resourceName,
    source,
    target,
    isEqual = defaultEqualityCheck,
    canOverwrite = true,
    buildPayload,
  } = item;

  let operation: OperationType;
  let reason: string | undefined;

  if (source !== undefined && target === undefined) {
    operation = 'create';
    reason = 'Resource exists on source but not on destination.';
  } else if (source !== undefined && target !== undefined) {
    if (isEqual(source, target)) {
      operation = 'noop';
      reason = 'Destination resource already matches source configuration.';
    } else if (!canOverwrite) {
      operation = 'skip';
      reason =
        'Destination resource exists with differing configuration and policy forbids overwriting.';
    } else {
      operation = 'update';
      reason =
        'Resource exists on destination with differing configuration; update required.';
    }
  } else if (source === undefined && target !== undefined) {
    operation = 'noop';
    reason = 'Resource exists on destination only; no migration action.';
  } else {
    operation = 'noop';
    reason = 'No resource state detected.';
  }

  const payload =
    buildPayload && (operation === 'create' || operation === 'update')
      ? buildPayload(source as T, target)
      : undefined;

  return {
    id,
    resourceType,
    resourceName,
    operation,
    sourceState: source,
    destinationCurrentState: target,
    payload,
    reason,
  };
}

function defaultEqualityCheck(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  ) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
