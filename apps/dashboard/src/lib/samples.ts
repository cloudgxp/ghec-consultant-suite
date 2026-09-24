import type { DiscoveryBundle } from '@ghec/contracts';
import orgJson from '../../../../fixtures/synthetic/organization-v1.json';
import enterpriseJson from '../../../../fixtures/synthetic/enterprise-v1.json';

export const SAMPLE_ORGANIZATION_BUNDLE = orgJson as unknown as DiscoveryBundle;
export const SAMPLE_ENTERPRISE_BUNDLE =
  enterpriseJson as unknown as DiscoveryBundle;
