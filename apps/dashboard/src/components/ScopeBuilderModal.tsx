import React, { useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  FormControl,
  Label,
  Radio,
  RadioGroup,
  Select,
  TextInput,
} from '@primer/react';
import type {
  MigrationPreflightReport,
  RepositoryOptions,
} from '@ghec/contracts';
import {
  buildMigrationScope,
  type RepositoryScopeItem,
} from '../lib/scope-generator.js';
import {
  PreflightReadinessCard,
  type PreflightStatus,
} from './PreflightReadinessCard.js';

export interface ScopeBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceOrg: string;
  selectedRepositories: RepositoryScopeItem[];
  onDispatchSuccess?: (runId: number) => void;
  apiBaseUrl?: string;
  fetchFn?: typeof fetch;
}

const REPO_MODULES = [
  'gei-repo',
  'rulesets',
  'branch-protection',
  'repo-variables',
  'repo-secrets',
  'repo-custom-properties',
  'repo-settings',
  'webhooks',
  'environments',
  'deploy-keys',
  'releases',
  'lfs',
  'collaborators',
  'issues',
  'pull-requests',
] as const;

export const ScopeBuilderModal: React.FC<ScopeBuilderModalProps> = ({
  isOpen,
  onClose,
  sourceOrg,
  selectedRepositories,
  onDispatchSuccess,
  apiBaseUrl = '',
  fetchFn = fetch,
}) => {
  const [scopeName, setScopeName] = useState('wave-migration-scope');
  const [targetOrg, setTargetOrg] = useState(`${sourceOrg}-target`);
  const [targetVisibility, setTargetVisibility] = useState<
    'inherit' | 'private' | 'internal' | 'public'
  >('inherit');
  const [identitySuffix, setIdentitySuffix] = useState('_gxp');
  const [lfsStrategy, setLfsStrategy] = useState<'dual-remote-stream' | 'skip'>(
    'dual-remote-stream',
  );
  const [releasesStrategy, setReleasesStrategy] = useState<'stream' | 'skip'>(
    'stream',
  );
  const [topology, setTopology] = useState<'linear' | 'matrix'>('linear');
  const [batchSize, setBatchSize] = useState('5');
  const [isDryRun, setIsDryRun] = useState(true);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    () => new Set(REPO_MODULES),
  );

  // Granular per-repository overrides
  const [repoOverrides, setRepoOverrides] = useState<
    Record<string, RepositoryOptions>
  >({});
  const [showOverrides, setShowOverrides] = useState(false);

  const updateRepoOverride = (
    repoName: string,
    patch: Partial<RepositoryOptions>,
  ) => {
    setRepoOverrides((prev) => {
      const current = prev[repoName] || {};
      return {
        ...prev,
        [repoName]: { ...current, ...patch },
      };
    });
  };

  // Preflight state
  const [preflightStatus, setPreflightStatus] =
    useState<PreflightStatus>('idle');
  const [preflightReport, setPreflightReport] =
    useState<MigrationPreflightReport | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  // Dispatch state
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const toggleModule = (id: string) => {
    const next = new Set(selectedModules);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedModules(next);
  };

  const handleRunPreflight = async () => {
    setPreflightStatus('checking');
    setPreflightError(null);

    try {
      const generatedScope = buildMigrationScope({
        name: scopeName,
        sourceOrg,
        targetOrg,
        repositories: selectedRepositories,
        repositoryOptions: repoOverrides,
        targetRepoVisibility: targetVisibility,
        identityStrategy: 'emu-saml',
        identitySuffix,
        lfsStrategy,
        releasesStrategy,
        selectedModules: Array.from(selectedModules),
      });

      const res = await fetchFn(`${apiBaseUrl}/api/cli/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: generatedScope }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      const data = (await res.json()) as {
        report: MigrationPreflightReport;
        hasBlockers: boolean;
        blockedCount: number;
      };

      setPreflightReport(data.report);

      const fatalBlockers = Array.from(
        new Set(data.report.repositoryAssessments.flatMap((r) => r.blockers)),
      );
      const advisoryWarnings = data.report.repositoryAssessments
        .filter(
          (r) =>
            r.status === 'ready-with-follow-up' ||
            r.status === 'requires-special-strategy',
        )
        .map((r) => `${r.repo}: classified as ${r.status}`);

      setBlockers(fatalBlockers);
      setWarnings(advisoryWarnings);

      if (fatalBlockers.length > 0) {
        setPreflightStatus('blocked');
      } else if (advisoryWarnings.length > 0) {
        setPreflightStatus('warning');
      } else {
        setPreflightStatus('ready');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPreflightError(msg);
      setPreflightStatus('error');
    }
  };

  const handleDispatch = async () => {
    setIsDispatching(true);
    setDispatchError(null);

    try {
      const generatedScope = buildMigrationScope({
        name: scopeName,
        sourceOrg,
        targetOrg,
        repositories: selectedRepositories,
        repositoryOptions: repoOverrides,
        targetRepoVisibility: targetVisibility,
        identityStrategy: 'emu-saml',
        identitySuffix,
        lfsStrategy,
        releasesStrategy,
        selectedModules: Array.from(selectedModules),
      });

      const workflowId = 'migration-execute-wave.yml';
      const parsedBatch = Number.parseInt(batchSize, 10) || 5;

      const res = await fetchFn(
        `${apiBaseUrl}/api/actions/workflows/${encodeURIComponent(workflowId)}/dispatch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: sourceOrg,
            repo: 'ghec-consultant-suite',
            ref: 'main',
            inputs: {
              scope: JSON.stringify(generatedScope),
              runner_capacity:
                topology === 'linear' ? '1' : String(parsedBatch),
              batch_size: String(parsedBatch),
              modules: Array.from(selectedModules).join(','),
              dry_run: String(isDryRun),
              continue_on_error: 'true',
              runner_labels: 'ubuntu-latest',
            },
          }),
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      onDispatchSuccess?.(Date.now());
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDispatchError(msg);
    } finally {
      setIsDispatching(false);
    }
  };

  const isDispatchDisabled =
    isDispatching ||
    selectedRepositories.length === 0 ||
    preflightStatus === 'blocked' ||
    preflightStatus === 'checking';

  return (
    <Dialog
      title="Dynamic Scope Builder & Migration Dispatch"
      onClose={onClose}
      width="large"
      footerButtons={[
        {
          buttonType: 'default',
          content: 'Cancel',
          onClick: onClose,
          disabled: isDispatching,
        },
        {
          buttonType: isDryRun ? 'default' : 'primary',
          content: isDispatching
            ? 'Dispatching...'
            : isDryRun
              ? 'Dispatch Dry-Run Wave'
              : 'Dispatch Live Migration Wave',
          onClick: handleDispatch,
          disabled: isDispatchDisabled,
        },
      ]}
    >
      <div className="p-4 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
        {/* Selected Repositories Overview */}
        <div className="p-3 border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-[var(--fgColor-default)]">
              Selected Repositories ({selectedRepositories.length})
            </span>
            <Label variant="accent">{sourceOrg}</Label>
          </div>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {selectedRepositories.map((repo) => (
              <Label key={repo.name} size="small">
                {repo.name}
              </Label>
            ))}
          </div>
        </div>

        {/* Basic Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormControl>
            <FormControl.Label>Migration Scope Name</FormControl.Label>
            <TextInput
              value={scopeName}
              onChange={(e) => setScopeName(e.target.value)}
              block
            />
          </FormControl>

          <FormControl>
            <FormControl.Label>Target Organization Slug</FormControl.Label>
            <TextInput
              value={targetOrg}
              onChange={(e) => setTargetOrg(e.target.value)}
              block
            />
          </FormControl>

          <FormControl>
            <FormControl.Label>Target Repository Visibility</FormControl.Label>
            <Select
              value={targetVisibility}
              onChange={(e) =>
                setTargetVisibility(
                  e.target.value as
                    'inherit' | 'private' | 'internal' | 'public',
                )
              }
              block
            >
              <Select.Option value="inherit">
                Inherit Source Visibility
              </Select.Option>
              <Select.Option value="private">Private</Select.Option>
              <Select.Option value="internal">
                Internal (Enterprise Only)
              </Select.Option>
              <Select.Option value="public">Public</Select.Option>
            </Select>
          </FormControl>

          <FormControl>
            <FormControl.Label>EMU Identity Suffix</FormControl.Label>
            <TextInput
              value={identitySuffix}
              onChange={(e) => setIdentitySuffix(e.target.value)}
              block
            />
          </FormControl>
        </div>

        {/* Strategy Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormControl>
            <FormControl.Label>
              Git LFS Object Transfer Strategy
            </FormControl.Label>
            <Select
              value={lfsStrategy}
              onChange={(e) =>
                setLfsStrategy(e.target.value as 'dual-remote-stream' | 'skip')
              }
              block
            >
              <Select.Option value="dual-remote-stream">
                Dual Remote Streaming (Parallel Worker Pool)
              </Select.Option>
              <Select.Option value="skip">Skip LFS Transfer</Select.Option>
            </Select>
          </FormControl>

          <FormControl>
            <FormControl.Label>Releases & Assets Strategy</FormControl.Label>
            <Select
              value={releasesStrategy}
              onChange={(e) =>
                setReleasesStrategy(e.target.value as 'stream' | 'skip')
              }
              block
            >
              <Select.Option value="stream">
                Stream Releases & Binary Assets
              </Select.Option>
              <Select.Option value="skip">
                Skip Releases (Fast Git Only)
              </Select.Option>
            </Select>
          </FormControl>
        </div>

        {/* Granular Per-Repository Configuration */}
        <div className="p-3 border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs font-bold text-[var(--fgColor-default)] block">
                Granular Per-Repository Overrides
              </span>
              <p className="text-xs text-[var(--fgColor-muted)]">
                Override default migration flags (Skip Releases, Skip LFS,
                Custom Timeout, Target Visibility) for individual repositories.
              </p>
            </div>
            <Button
              size="small"
              onClick={() => setShowOverrides(!showOverrides)}
            >
              {showOverrides ? 'Hide Overrides' : 'Configure Overrides'}
            </Button>
          </div>

          {showOverrides && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--borderColor-default)] text-[var(--fgColor-muted)]">
                    <th className="py-2 px-2">Repository</th>
                    <th className="py-2 px-2 text-center">Skip Releases</th>
                    <th className="py-2 px-2 text-center">Skip LFS</th>
                    <th className="py-2 px-2">Timeout (sec)</th>
                    <th className="py-2 px-2">Visibility</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRepositories.map((repo) => {
                    const current = repoOverrides[repo.name] || {};
                    return (
                      <tr
                        key={repo.name}
                        className="border-b border-[var(--borderColor-muted)]"
                      >
                        <td className="py-2 px-2 font-medium">{repo.name}</td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Skip Releases for ${repo.name}`}
                            checked={Boolean(current.skipReleases)}
                            onChange={(e) =>
                              updateRepoOverride(repo.name, {
                                skipReleases: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Skip LFS for ${repo.name}`}
                            checked={Boolean(current.skipLfs)}
                            onChange={(e) =>
                              updateRepoOverride(repo.name, {
                                skipLfs: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min="1"
                            placeholder="default"
                            aria-label={`Timeout in seconds for ${repo.name}`}
                            value={current.timeoutSeconds ?? ''}
                            onChange={(e) => {
                              const val = e.target.value
                                ? Number.parseInt(e.target.value, 10)
                                : undefined;
                              updateRepoOverride(repo.name, {
                                timeoutSeconds: val,
                              });
                            }}
                            className="w-24 px-2 py-1 text-xs rounded border border-[var(--borderColor-default)] bg-[var(--canvas-default)]"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <select
                            aria-label={`Visibility for ${repo.name}`}
                            value={current.targetRepoVisibility ?? ''}
                            onChange={(e) => {
                              const val = e.target.value as
                                'private' | 'internal' | 'public' | '';
                              updateRepoOverride(repo.name, {
                                targetRepoVisibility: val || undefined,
                              });
                            }}
                            className="px-2 py-1 text-xs rounded border border-[var(--borderColor-default)] bg-[var(--canvas-default)]"
                          >
                            <option value="">Default</option>
                            <option value="private">Private</option>
                            <option value="internal">Internal</option>
                            <option value="public">Public</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Topology & Runner Configuration */}
        <div className="p-3 border border-[var(--borderColor-default)] rounded-lg">
          <span className="text-sm font-bold text-[var(--fgColor-default)] block mb-2">
            Execution Topology & Mode
          </span>
          <div className="flex gap-6 flex-wrap">
            <RadioGroup
              name="topology"
              onChange={(selected) =>
                setTopology(selected as 'linear' | 'matrix')
              }
            >
              <RadioGroup.Label>Runner Topology</RadioGroup.Label>
              <FormControl>
                <Radio value="linear" checked={topology === 'linear'} />
                <FormControl.Label>
                  Single Runner (Linear Pipeline)
                </FormControl.Label>
              </FormControl>
              <FormControl>
                <Radio value="matrix" checked={topology === 'matrix'} />
                <FormControl.Label>
                  Parallel Matrix (Dynamic Fan-Out)
                </FormControl.Label>
              </FormControl>
            </RadioGroup>

            {topology === 'matrix' && (
              <div className="min-w-36">
                <FormControl>
                  <FormControl.Label>Runner Capacity</FormControl.Label>
                  <TextInput
                    type="number"
                    min="1"
                    value={batchSize}
                    onChange={(e) => setBatchSize(e.target.value)}
                  />
                </FormControl>
              </div>
            )}

            <RadioGroup
              name="executionMode"
              onChange={(selected) => setIsDryRun(selected === 'dry-run')}
            >
              <RadioGroup.Label>Execution Mode</RadioGroup.Label>
              <FormControl>
                <Radio value="dry-run" checked={isDryRun} />
                <FormControl.Label>🛡️ Dry-Run (Simulation)</FormControl.Label>
              </FormControl>
              <FormControl>
                <Radio value="live" checked={!isDryRun} />
                <FormControl.Label>
                  ⚡ Live Apply (Mutate Target)
                </FormControl.Label>
              </FormControl>
            </RadioGroup>
          </div>
        </div>

        {/* Module Checklist */}
        <div className="p-3 border border-[var(--borderColor-default)] rounded-lg">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold text-[var(--fgColor-default)]">
              Target Migration Modules ({selectedModules.size} /{' '}
              {REPO_MODULES.length})
            </span>
            <div className="flex gap-2">
              <Button
                size="small"
                onClick={() => setSelectedModules(new Set(REPO_MODULES))}
              >
                Select All
              </Button>
              <Button
                size="small"
                onClick={() => setSelectedModules(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {REPO_MODULES.map((id) => (
              <FormControl key={id} layout="horizontal">
                <Checkbox
                  checked={selectedModules.has(id)}
                  onChange={() => toggleModule(id)}
                />
                <FormControl.Label className="text-xs">{id}</FormControl.Label>
              </FormControl>
            ))}
          </div>
        </div>

        {/* Preflight Readiness Card Gate */}
        <PreflightReadinessCard
          status={preflightStatus}
          report={preflightReport}
          blockers={blockers}
          warnings={warnings}
          errorMessage={preflightError}
          onRunPreflight={handleRunPreflight}
          disabled={selectedRepositories.length === 0}
        />

        {dispatchError && (
          <div className="text-xs text-[var(--color-danger-fg)]">
            Dispatch failed: {dispatchError}
          </div>
        )}
      </div>
    </Dialog>
  );
};
