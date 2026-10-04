import React, { useRef, useState } from 'react';
import { ANALYSIS_PRESETS, type AnalysisOptions } from '@ghec/analysis';
import {
  Button,
  Dialog,
  FormControl,
  Select,
  TextInput,
  ToggleSwitch,
} from '@primer/react';
import { GearIcon, DownloadIcon } from '@primer/octicons-react';

interface Props {
  options: AnalysisOptions;
  onChange: (options: AnalysisOptions) => void;
}

const GB = 1024 * 1024 * 1024;
const clampCritical = (value: number) =>
  Math.min(20 * GB, Math.max(1 * GB, value || 5 * GB));

export const SettingsDrawer: React.FC<Props> = ({ options, onChange }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const update = <K extends keyof AnalysisOptions>(
    key: K,
    value: AnalysisOptions[K],
  ) => onChange({ ...options, [key]: value });

  const exportProfile = () => {
    const blob = new Blob(
      [JSON.stringify({ schemaVersion: '1.0', options }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'migration-profile.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="invisible"
        size="small"
        onClick={() => setOpen(true)}
        aria-label="Migration Target Settings"
        leadingVisual={GearIcon}
        className="min-h-11 min-w-11"
      >
        <span className="hidden xl:inline">Target Settings</span>
      </Button>
      {open && (
        <Dialog
          title="Migration Target Settings"
          subtitle="Findings recalculate immediately in memory."
          position="right"
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
          width="large"
        >
          <div className="space-y-4 p-4">
            <FormControl>
              <FormControl.Label>Apply Preset</FormControl.Label>
              <Select
                block
                defaultValue=""
                onChange={(event) => {
                  const preset =
                    ANALYSIS_PRESETS[
                      event.target.value as keyof typeof ANALYSIS_PRESETS
                    ];
                  if (preset) onChange({ ...preset.options });
                }}
              >
                <Select.Option value="" disabled>
                  Choose a standard profile…
                </Select.Option>
                {Object.entries(ANALYSIS_PRESETS).map(([id, preset]) => (
                  <Select.Option key={id} value={id}>
                    {preset.label}
                  </Select.Option>
                ))}
              </Select>
            </FormControl>

            <div className="border-b border-[var(--borderColor-default)] my-3" />

            <div className="space-y-4">
              <FormControl>
                <FormControl.Label>Target Platform</FormControl.Label>
                <Select
                  block
                  value={options.targetPlatform}
                  onChange={(event) =>
                    update(
                      'targetPlatform',
                      event.target.value as AnalysisOptions['targetPlatform'],
                    )
                  }
                >
                  <Select.Option value="ghec_emu">
                    GHEC Enterprise Managed Users
                  </Select.Option>
                  <Select.Option value="ghec_standard">
                    GHEC Standard
                  </Select.Option>
                  <Select.Option value="ghes_3_x">GHES 3.x</Select.Option>
                </Select>
              </FormControl>

              <FormControl>
                <FormControl.Label>
                  Critical Repository Size:{' '}
                  {(options.repoSizeCriticalBytes / GB).toFixed(0)} GB
                </FormControl.Label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  className="w-full accent-[var(--fgColor-accent)] mt-1"
                  value={options.repoSizeCriticalBytes / GB}
                  aria-label="Critical repository size slider"
                  onChange={(event) => {
                    const critical = clampCritical(
                      Number(event.target.value) * GB,
                    );
                    onChange({
                      ...options,
                      repoSizeCriticalBytes: critical,
                      repoSizeWarningBytes: Math.min(
                        options.repoSizeWarningBytes,
                        critical / 2,
                      ),
                    });
                  }}
                />
                <TextInput
                  type="number"
                  min={1}
                  max={20}
                  block
                  size="small"
                  className="mt-2"
                  value={String(options.repoSizeCriticalBytes / GB)}
                  aria-label="Critical repository size in gigabytes"
                  onChange={(event) => {
                    const critical = clampCritical(
                      Number(event.target.value) * GB,
                    );
                    onChange({
                      ...options,
                      repoSizeCriticalBytes: critical,
                      repoSizeWarningBytes: Math.min(
                        options.repoSizeWarningBytes,
                        critical / 2,
                      ),
                    });
                  }}
                />
              </FormControl>

              <FormControl>
                <FormControl.Label>
                  Warning Repository Size:{' '}
                  {(options.repoSizeWarningBytes / GB).toFixed(1)} GB
                </FormControl.Label>
                <TextInput
                  type="number"
                  min={0.25}
                  max={options.repoSizeCriticalBytes / GB - 0.25}
                  step={0.25}
                  block
                  size="small"
                  value={String(options.repoSizeWarningBytes / GB)}
                  aria-label="Warning repository size in gigabytes"
                  onChange={(event) => {
                    const requested = Number(event.target.value) * GB;
                    update(
                      'repoSizeWarningBytes',
                      Math.max(
                        0.25 * GB,
                        Math.min(
                          requested || 0.25 * GB,
                          options.repoSizeCriticalBytes - 0.25 * GB,
                        ),
                      ),
                    );
                  }}
                />
              </FormControl>

              <div className="flex items-center justify-between gap-4 py-1">
                <div>
                  <span
                    id="lfs-cutover-label"
                    className="block font-semibold text-sm text-[var(--fgColor-default)]"
                  >
                    Unmeasured LFS
                  </span>
                  <span className="text-xs text-[var(--fgColor-muted)]">
                    Treat unknown storage as a blocker
                  </span>
                </div>
                <ToggleSwitch
                  aria-labelledby="lfs-cutover-label"
                  size="small"
                  checked={options.lfsCutoverStrictness === 'block_unmeasured'}
                  onChange={(checked) =>
                    update(
                      'lfsCutoverStrictness',
                      checked ? 'block_unmeasured' : 'warn_only',
                    )
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4 py-1">
                <div>
                  <span
                    id="branch-policy-label"
                    className="block font-semibold text-sm text-[var(--fgColor-default)]"
                  >
                    Require Modern Rulesets
                  </span>
                  <span className="text-xs text-[var(--fgColor-muted)]">
                    Disallow classic-only branch protection
                  </span>
                </div>
                <ToggleSwitch
                  aria-labelledby="branch-policy-label"
                  size="small"
                  checked={
                    options.branchProtectionPolicy === 'require_rulesets'
                  }
                  onChange={(checked) =>
                    update(
                      'branchProtectionPolicy',
                      checked ? 'require_rulesets' : 'allow_classic',
                    )
                  }
                />
              </div>

              <FormControl>
                <FormControl.Label>
                  Security Finding Sensitivity
                </FormControl.Label>
                <Select
                  block
                  value={options.securitySeverityCutoff}
                  onChange={(event) =>
                    update(
                      'securitySeverityCutoff',
                      event.target
                        .value as AnalysisOptions['securitySeverityCutoff'],
                    )
                  }
                >
                  <Select.Option value="critical_only">
                    Critical only
                  </Select.Option>
                  <Select.Option value="high_and_critical">
                    High and critical
                  </Select.Option>
                  <Select.Option value="all">All observed gaps</Select.Option>
                </Select>
              </FormControl>
            </div>

            <div className="border-b border-[var(--borderColor-default)] my-4" />

            <Button block leadingVisual={DownloadIcon} onClick={exportProfile}>
              Export migration-profile.json
            </Button>
            <p className="text-[11px] text-[var(--fgColor-muted)] mt-2">
              Profile settings remain in browser memory only and are discarded
              when this page closes.
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
};
