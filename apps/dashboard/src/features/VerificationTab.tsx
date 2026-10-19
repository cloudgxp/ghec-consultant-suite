import React from 'react';
import type { DiscoveryBundle, VerificationReport } from '@ghec/contracts';
import { PageHeader } from '../components/ui/index.js';
import { VerificationDiffInspector } from '../components/VerificationDiffInspector.js';

export interface VerificationTabProps {
  bundle?: DiscoveryBundle | null | undefined;
  selectedOrgIds?: string[] | undefined;
  initialReport?: VerificationReport | undefined;
}

export const VerificationTab: React.FC<VerificationTabProps> = ({
  initialReport,
}) => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Verification & Discrepancy Inspector"
        description="Audit post-migration target tenant state against planned migration operations across all 34 modules, inspect side-by-side diffs, and generate copyable CLI remediation commands."
      />
      <VerificationDiffInspector
        key={initialReport?.reportId ?? 'default'}
        initialReport={initialReport}
      />
    </div>
  );
};
