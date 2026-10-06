import React from 'react';
import { Label } from '@primer/react';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  CrossReferenceIcon,
  PersonIcon,
  ShieldCheckIcon,
} from '@primer/octicons-react';
import { predictEmuUsername } from '../lib/team-tree.js';

export interface EmuIdentityItem {
  id: string;
  sourceLogin: string;
  membership: 'member' | 'owner' | 'outside' | 'unknown';
  outsideCollaborator: boolean;
  ssoStatus: 'linked' | 'unlinked' | 'unknown';
  mannequinStatus?: 'claimed' | 'pending' | 'unmapped' | undefined;
  targetLogin?: string | undefined;
}

export interface EmuIdentityMappingCardProps {
  identity: EmuIdentityItem;
  strategy?: 'emu-saml' | 'pass-through' | 'dictionary' | undefined;
  suffix?: string | undefined;
}

export const EmuIdentityMappingCard: React.FC<EmuIdentityMappingCardProps> = ({
  identity,
  strategy = 'emu-saml',
  suffix = '_gxp',
}) => {
  const predictedTarget =
    identity.targetLogin ||
    (strategy === 'emu-saml'
      ? predictEmuUsername(identity.sourceLogin, suffix)
      : identity.sourceLogin);

  const isVerified =
    identity.ssoStatus === 'linked' &&
    (identity.mannequinStatus === 'claimed' || !identity.mannequinStatus);

  return (
    <div
      className={`p-3.5 rounded-lg border transition-all ${
        isVerified
          ? 'border-[var(--borderColor-default)] bg-[var(--canvas-default)]'
          : 'border-[var(--borderColor-attention-muted)] bg-[var(--canvas-subtle)]'
      }`}
    >
      <div className="grid grid-cols-1 md:grid-cols-7 items-center gap-3">
        {/* 1. Left: Source Identity (3 cols) */}
        <div className="md:col-span-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)] flex items-center justify-center text-[var(--fgColor-muted)] shrink-0">
            <PersonIcon size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-xs text-[var(--fgColor-default)] truncate">
                {identity.sourceLogin}
              </span>
              <Label
                variant="secondary"
                className="capitalize text-[10px] shrink-0"
              >
                {identity.membership}
              </Label>
              {identity.outsideCollaborator && (
                <Label variant="attention" className="text-[10px] shrink-0">
                  Outside
                </Label>
              )}
            </div>
            <div className="text-[11px] text-[var(--fgColor-muted)] mt-0.5">
              Source Enterprise Identity
            </div>
          </div>
        </div>

        {/* 2. Center: Translation Rule (1 col) */}
        <div className="md:col-span-1 flex flex-col items-center justify-center text-center py-1">
          <div className="text-[var(--fgColor-muted)] flex items-center justify-center w-6 h-6 rounded-full bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)]">
            <ArrowRightIcon size={12} />
          </div>
          <div className="text-[9px] font-mono font-medium text-[var(--fgColor-accent)] mt-1">
            {strategy === 'emu-saml' ? `rule: ${suffix}` : strategy}
          </div>
        </div>

        {/* 3. Right: Target EMU State (3 cols) */}
        <div className="md:col-span-3 flex items-center justify-between gap-2 border-t md:border-t-0 md:border-l border-[var(--borderColor-muted)] pt-2 md:pt-0 md:pl-4">
          <div className="min-w-0">
            <div className="font-bold font-mono text-xs text-[var(--fgColor-default)] truncate">
              @{predictedTarget}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px]">
              <span className="text-[var(--fgColor-muted)]">SCIM:</span>
              {identity.ssoStatus === 'linked' ? (
                <span className="text-[var(--fgColor-success)] font-medium inline-flex items-center gap-0.5">
                  <CheckCircleIcon size={12} /> Linked
                </span>
              ) : (
                <span className="text-[var(--fgColor-attention)] font-medium inline-flex items-center gap-0.5">
                  <ClockIcon size={12} /> Unlinked
                </span>
              )}

              {identity.mannequinStatus && (
                <>
                  <span className="text-[var(--fgColor-muted)]">|</span>
                  <span className="text-[var(--fgColor-muted)]">
                    Attribution:
                  </span>
                  <span
                    className={`font-medium ${
                      identity.mannequinStatus === 'claimed'
                        ? 'text-[var(--fgColor-success)]'
                        : 'text-[var(--fgColor-attention)]'
                    }`}
                  >
                    {identity.mannequinStatus}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="shrink-0">
            {isVerified ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bgColor-success-muted)] text-[var(--fgColor-success)] border border-[var(--borderColor-success-emphasis)]">
                <ShieldCheckIcon size={12} /> Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bgColor-attention-muted)] text-[var(--fgColor-attention)] border border-[var(--borderColor-attention-emphasis)]">
                <CrossReferenceIcon size={12} /> Pending Link
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
