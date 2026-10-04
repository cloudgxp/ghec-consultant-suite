export type ClassValue = string | false | null | undefined;

/** Compose Primer and scoped CSS utility class names without hiding them. */
export function cx(...values: readonly ClassValue[]): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}
