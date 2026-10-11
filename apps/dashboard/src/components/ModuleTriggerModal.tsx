import React, { useState } from 'react';
import { Checkbox, Dialog, Flash, Label, TextInput } from '@primer/react';
import {
  AlertIcon,
  CheckCircleIcon,
  InfoIcon,
  PlayIcon,
  RocketIcon,
} from '@primer/octicons-react';
import {
  buildMigrationScope,
  type RepositoryScopeItem,
} from '../lib/scope-generator.js';

export interface ModuleTriggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  modules: string[];
  sourceOrg: string;
  defaultTargetOrg?: string | undefined;
  affectedCount?: number | undefined;
  entityLabel?: string | undefined;
  prerequisites?: string[] | undefined;
  repositories?: RepositoryScopeItem[] | undefined;
  customOptions?: React.ReactNode | undefined;
  apiBaseUrl?: string | undefined;
  fetchFn?: typeof fetch | undefined;
  onDispatched?:
    | ((result: {
        workflowId: string;
        modules: string[];
        isDryRun: boolean;
        targetOrg: string;
      }) => void)
    | undefined;
}

export const ModuleTriggerModal: React.FC<ModuleTriggerModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  modules,
  sourceOrg,
  defaultTargetOrg,
  affectedCount,
  entityLabel = 'entities',
  prerequisites = [],
  repositories = [],
  customOptions,
  apiBaseUrl = '',
  fetchFn = fetch,
  onDispatched,
}) => {
  const [targetOrg, setTargetOrg] = useState(
    defaultTargetOrg || `${sourceOrg}-target`,
  );
  const [isDryRun, setIsDryRun] = useState(true);
  const [continueOnError, setContinueOnError] = useState(true);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDispatch = async () => {
    setIsDispatching(true);
    setDispatchError(null);
    setDispatchSuccess(null);

    try {
      const generatedScope = buildMigrationScope({
        name: `${modules.join('-')}-${Date.now().toString(36)}`,
        sourceOrg: sourceOrg || 'source-org',
        targetOrg: targetOrg.trim() || `${sourceOrg}-target`,
        repositories,
        selectedModules: modules,
      });

      const workflowId = 'migration-execute-wave.yml';
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
              batch_size: '5',
              modules: modules.join(','),
              dry_run: String(isDryRun),
              continue_on_error: String(continueOnError),
              runner_labels: 'ubuntu-latest',
            },
          }),
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Dispatch failed with HTTP ${res.status}`);
      }

      setDispatchSuccess(
        `Module "${modules.join(', ')}" successfully dispatched to GitHub Actions (${isDryRun ? 'Simulation' : 'Live Execution'}).`,
      );

      onDispatched?.({
        workflowId,
        modules,
        isDryRun,
        targetOrg: targetOrg.trim(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDispatchError(msg);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <Dialog
      title={title}
      subtitle={`Targeted Module Execution: ${modules.join(', ')}`}
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
              ? 'Simulate (Dry-Run)'
              : 'Execute Module Live',
          onClick: handleDispatch,
          disabled: isDispatching || !targetOrg.trim(),
        },
      ]}
    >
      <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
        {/* Description & Entity Count */}
        <div className="p-3 rounded-md bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)] flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--fgColor-default)] font-medium">
              {description}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-[var(--fgColor-muted)]">
                Active Modules:
              </span>
              {modules.map((mod) => (
                <Label key={mod} size="small" variant="accent">
                  {mod}
                </Label>
              ))}
            </div>
          </div>
          {affectedCount !== undefined && (
            <div className="shrink-0 text-right">
              <div className="text-2xl font-bold text-[var(--fgColor-default)]">
                {affectedCount}
              </div>
              <div className="text-xs text-[var(--fgColor-muted)]">
                {entityLabel} detected
              </div>
            </div>
          )}
        </div>

        {/* Prerequisites */}
        {prerequisites.length > 0 && (
          <div className="p-3 rounded-md bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)]">
            <h4 className="text-xs font-bold text-[var(--fgColor-default)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <InfoIcon size={14} className="text-[var(--fgColor-accent)]" />
              Dependency Prerequisites
            </h4>
            <ul className="text-xs text-[var(--fgColor-muted)] space-y-1 list-disc list-inside">
              {prerequisites.map((req, i) => (
                <li key={i}>{req}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Target Org Config */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--fgColor-default)] block">
            Target Organization
          </label>
          <TextInput
            value={targetOrg}
            onChange={(e) => setTargetOrg(e.target.value)}
            placeholder="Target enterprise organization"
            block
            size="small"
          />
          <p className="text-xs text-[var(--fgColor-muted)]">
            Resources will be migrated from <strong>{sourceOrg}</strong> to this
            target organization.
          </p>
        </div>

        {/* Execution Mode (Dry-Run vs Live Apply) */}
        <div className="p-3 rounded-md border border-[var(--borderColor-default)] space-y-2">
          <h4 className="text-xs font-semibold text-[var(--fgColor-default)]">
            Execution Mode
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={isDryRun}
              onClick={() => setIsDryRun(true)}
              className={`p-2.5 rounded-md border text-left flex items-start gap-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-outlineColor)] ${
                isDryRun
                  ? 'border-[var(--borderColor-accent-emphasis)] bg-[var(--canvas-subtle)] ring-1 ring-[var(--borderColor-accent-emphasis)]'
                  : 'border-[var(--borderColor-default)] bg-[var(--canvas-default)] hover:bg-[var(--canvas-subtle)]'
              }`}
            >
              <div className="pt-0.5">
                <RocketIcon
                  size={16}
                  className="text-[var(--fgColor-accent)]"
                />
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--fgColor-default)]">
                  Dry-Run (Simulation)
                </div>
                <div className="text-[11px] text-[var(--fgColor-muted)]">
                  Simulate API mutations, evaluate permissions, and generate
                  diffs without mutating target resources.
                </div>
              </div>
            </button>

            <button
              type="button"
              aria-pressed={!isDryRun}
              onClick={() => setIsDryRun(false)}
              className={`p-2.5 rounded-md border text-left flex items-start gap-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-outlineColor)] ${
                !isDryRun
                  ? 'border-[var(--borderColor-danger-emphasis)] bg-[var(--canvas-subtle)] ring-1 ring-[var(--borderColor-danger-emphasis)]'
                  : 'border-[var(--borderColor-default)] bg-[var(--canvas-default)] hover:bg-[var(--canvas-subtle)]'
              }`}
            >
              <div className="pt-0.5">
                <PlayIcon size={16} className="text-[var(--fgColor-danger)]" />
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--fgColor-danger)]">
                  Live Apply
                </div>
                <div className="text-[11px] text-[var(--fgColor-muted)]">
                  Execute live API mutations on target organization using
                  Actions worker runners.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Custom Options Slot */}
        {customOptions && (
          <div className="p-3 rounded-md bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)] space-y-2">
            <h4 className="text-xs font-semibold text-[var(--fgColor-default)]">
              Module-Specific Options
            </h4>
            {customOptions}
          </div>
        )}

        {/* Continue on Error Checkbox */}
        <div className="flex items-center gap-2">
          <Checkbox
            checked={continueOnError}
            onChange={(e) => setContinueOnError(e.target.checked)}
          />
          <span className="text-xs text-[var(--fgColor-default)]">
            Continue on non-fatal errors (record discrepancy and continue
            migration)
          </span>
        </div>

        {/* Feedback Banners */}
        {dispatchSuccess && (
          <Flash variant="success">
            <div className="flex items-start gap-2">
              <CheckCircleIcon size={16} className="shrink-0 mt-0.5" />
              <div className="text-xs">
                <strong>Dispatched:</strong> {dispatchSuccess}
                <div className="mt-1">
                  <span className="text-[var(--fgColor-muted)]">
                    You can monitor execution progress in the Live Execution
                    Console tab.
                  </span>
                </div>
              </div>
            </div>
          </Flash>
        )}

        {dispatchError && (
          <Flash variant="danger">
            <div className="flex items-start gap-2">
              <AlertIcon size={16} className="shrink-0 mt-0.5" />
              <div className="text-xs">
                <strong>Dispatch Failed:</strong> {dispatchError}
              </div>
            </div>
          </Flash>
        )}
      </div>
    </Dialog>
  );
};
