import type { DiscoveryBundle } from '@ghec/contracts';

type Metric = {
  value: number | null;
  unit: 'bytes' | 'count' | 'minutes';
  availability: 'observed' | 'unknown' | 'unavailable';
  reason: string | null;
};

/**
 * Formats a byte metric cleanly, respecting availability.
 * Never coerces unknown/unavailable bytes to 0.
 */
export function formatBytesMetric(metric?: Metric | null): string {
  if (!metric) return 'Unknown';
  if (metric.availability === 'observed' && metric.value !== null) {
    return formatBytes(metric.value);
  }
  return `Unknown${metric.reason ? ` (${metric.reason})` : ''}`;
}

/**
 * Formats a count metric cleanly, respecting availability.
 */
export function formatCountMetric(metric?: Metric | null): string {
  if (!metric) return 'Unknown';
  if (metric.availability === 'observed' && metric.value !== null) {
    return metric.value.toLocaleString();
  }
  return `Unknown${metric.reason ? ` (${metric.reason})` : ''}`;
}

/**
 * Formats minutes metric cleanly.
 */
export function formatMinutesMetric(metric?: Metric | null): string {
  if (!metric) return 'Unknown';
  if (metric.availability === 'observed' && metric.value !== null) {
    return `${metric.value.toLocaleString()} mins`;
  }
  return `Unknown${metric.reason ? ` (${metric.reason})` : ''}`;
}

/**
 * Formats raw byte counts into human-readable strings (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const num = bytes / Math.pow(k, i);
  return `${num.toFixed(num < 10 && i > 0 ? 1 : 0)} ${sizes[i]}`;
}

/**
 * Formats an ISO 8601 timestamp string into human-readable UTC date/time.
 */
export function formatTimestamp(isoString?: string | null): string {
  if (!isoString) return 'Unknown';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, ' UTC');
  } catch {
    return isoString;
  }
}

/**
 * Computes execution duration between two ISO timestamps.
 */
export function formatDuration(startedAt: string, completedAt: string): string {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (isNaN(start) || isNaN(end) || end < start) return 'Unknown';
  const diffMs = end - start;
  if (diffMs < 1000) return `${diffMs}ms`;
  const secs = Math.round(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

/**
 * Return Primer Label variant for finding severity.
 */
export function getSeverityBadgeClass(severity: string): string {
  switch (severity) {
    case 'high':
      return 'danger';
    case 'medium':
      return 'attention';
    case 'low':
      return 'accent';
    case 'info':
    default:
      return 'secondary';
  }
}

/**
 * Return Primer Label variant for dimension status.
 */
export function getDimensionStatusBadgeClass(status: string): string {
  switch (status) {
    case 'review_required':
      return 'attention';
    case 'no_issue_observed':
      return 'success';
    case 'unknown':
      return 'secondary';
    case 'not_applicable':
      return 'default';
    default:
      return 'secondary';
  }
}

/**
 * Return Primer Label variant for collector terminal status.
 */
export function getCollectorStatusBadgeClass(status: string): string {
  switch (status) {
    case 'complete':
      return 'success';
    case 'partial':
      return 'attention';
    case 'failed':
      return 'danger';
    case 'skipped':
    case 'unavailable':
    default:
      return 'secondary';
  }
}

/**
 * Resolves an organization's login or displayName given an ID.
 */
export function resolveOrgName(
  bundle: DiscoveryBundle,
  organizationId: string,
): string {
  const org = bundle.organizations.find((o) => o.id === organizationId);
  if (!org) return organizationId;
  return org.displayName ? `${org.displayName} (${org.login})` : org.login;
}
