import React, { useState, useRef } from 'react';
import { Button, Banner, ProgressBar, Label } from '@primer/react';
import { Blankslate } from '@primer/react/experimental';
import { UploadIcon, ShieldCheckIcon } from '@primer/octicons-react';
import {
  importBundleFile,
  loadSampleBundle,
  type ImportProgress,
  type ImportResult,
} from '../lib/importer.js';

interface FileUploadProps {
  onLoadBundle: (result: ImportResult) => void;
  onLoadComparison?: (baseline: ImportResult, current: ImportResult) => void;
  errorMessage: string | null;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onLoadBundle,
  onLoadComparison,
  errorMessage,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;

    setIsLoading(true);
    setImportProgress({ status: 'reading', progress: 0 });
    try {
      const result = await importBundleFile(file, setImportProgress);
      onLoadBundle(result);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleSampleLoad = (type: 'organization' | 'enterprise') => {
    setIsLoading(true);
    try {
      const result = loadSampleBundle(type);
      onLoadBundle(result);
    } finally {
      setIsLoading(false);
    }
  };

  const handleComparison = async () => {
    if (!baselineFile || !currentFile) return;
    setIsLoading(true);
    setImportProgress({ status: 'reading', progress: 0 });
    try {
      const [baseline, current] = await Promise.all([
        importBundleFile(baselineFile, (progress) =>
          setImportProgress({
            ...progress,
            progress: Math.round(progress.progress / 2),
          }),
        ),
        importBundleFile(currentFile, (progress) =>
          setImportProgress({
            ...progress,
            progress: 50 + Math.round(progress.progress / 2),
          }),
        ),
      ]);
      if (onLoadComparison) {
        onLoadComparison(baseline, current);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const progressLabel = (() => {
    switch (importProgress?.status) {
      case 'reading':
        return 'Reading the local bundle…';
      case 'validating':
        return 'Validating schema and evidence relationships…';
      case 'analyzing':
        return 'Evaluating migration readiness rules…';
      case 'ready':
        return 'Assessment ready';
      case 'error':
        return 'Import stopped';
      default:
        return 'Preparing background importer…';
    }
  })();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--fgColor-default)] sm:text-4xl">
          GitHub Enterprise Cloud Assessment
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-[var(--fgColor-muted)]">
          Ingest discovery bundles produced by the CLI to evaluate migration
          readiness, inspect security posture, audit automation dependencies,
          and export clean reports.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Assessment mode"
        className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'single'}
          className={`cursor-pointer rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            mode === 'single'
              ? 'bg-[var(--bgColor-default)] text-[var(--fgColor-default)] shadow-xs'
              : 'text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
          }`}
          onClick={() => setMode('single')}
        >
          Single Scan Analysis
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'compare'}
          className={`cursor-pointer rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            mode === 'compare'
              ? 'bg-[var(--bgColor-default)] text-[var(--fgColor-default)] shadow-xs'
              : 'text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
          }`}
          onClick={() => setMode('compare')}
        >
          Compare Two Scans
        </button>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="mb-6">
          <Banner variant="critical" title="Import failed">
            {errorMessage}
          </Banner>
        </div>
      )}

      {/* Drag & Drop Area */}
      {mode === 'single' ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`rounded-2xl border-2 border-dashed p-10 text-center transition-all bg-[var(--bgColor-default)] ${
            isDragging
              ? 'border-[var(--borderColor-accent-emphasis)] bg-[var(--bgColor-accent-muted)] scale-[1.01]'
              : 'border-[var(--borderColor-default)] hover:border-[var(--borderColor-accent-emphasis)]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            aria-label="Upload discovery bundle JSON file"
          />

          <Blankslate>
            <Blankslate.Visual>
              <UploadIcon size={32} />
            </Blankslate.Visual>
            <Blankslate.Heading>
              Select or drop a Discovery Bundle JSON
            </Blankslate.Heading>
            <Blankslate.Description>
              Supports GHEC Contract Schema v1.0.0 (up to 250 MB)
            </Blankslate.Description>
            <Blankslate.PrimaryAction
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              {isLoading ? 'Processing in Background…' : 'Choose Local File'}
            </Blankslate.PrimaryAction>
          </Blankslate>

          {isLoading && importProgress && (
            <div
              className="mx-auto mt-6 w-full max-w-xl text-left"
              role="status"
              aria-live="polite"
              aria-label={`${progressLabel} ${importProgress.progress}%`}
            >
              <div className="mb-1 flex justify-between text-xs font-semibold text-[var(--fgColor-default)]">
                <span>{progressLabel}</span>
                <span>{importProgress.progress}%</span>
              </div>
              <ProgressBar progress={importProgress.progress} />
              <p className="mt-1 text-xs text-[var(--fgColor-muted)]">
                Parsing and analysis run in an isolated worker so this page
                remains responsive.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5 rounded-2xl border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-xs">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="cursor-pointer rounded-xl border-2 border-dashed border-[var(--borderColor-default)] p-5 hover:border-[var(--borderColor-accent-emphasis)]">
              <span className="block font-bold text-[var(--fgColor-default)]">
                Baseline Scan (T₀)
              </span>
              <span className="mt-1 block text-xs text-[var(--fgColor-muted)]">
                Original discovery evidence before remediation
              </span>
              <input
                type="file"
                accept=".json,application/json"
                className="mt-4 block w-full text-xs text-[var(--fgColor-default)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--bgColor-neutral-muted)] file:px-3 file:py-1 file:text-xs file:font-semibold"
                onChange={(event) =>
                  setBaselineFile(event.target.files?.[0] ?? null)
                }
                disabled={isLoading}
              />
            </label>
            <label className="cursor-pointer rounded-xl border-2 border-dashed border-[var(--borderColor-default)] p-5 hover:border-[var(--borderColor-accent-emphasis)]">
              <span className="block font-bold text-[var(--fgColor-default)]">
                Current / Remediation Scan (T₁)
              </span>
              <span className="mt-1 block text-xs text-[var(--fgColor-muted)]">
                Follow-up evidence used to verify progress
              </span>
              <input
                type="file"
                accept=".json,application/json"
                className="mt-4 block w-full text-xs text-[var(--fgColor-default)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--bgColor-neutral-muted)] file:px-3 file:py-1 file:text-xs file:font-semibold"
                onChange={(event) =>
                  setCurrentFile(event.target.files?.[0] ?? null)
                }
                disabled={isLoading}
              />
            </label>
          </div>
          <Button
            variant="primary"
            className="w-full"
            disabled={isLoading || !baselineFile || !currentFile}
            onClick={handleComparison}
          >
            {isLoading
              ? 'Comparing Scans in Background…'
              : 'Load and Compare Scans'}
          </Button>
          {isLoading && importProgress && (
            <div role="status" aria-live="polite" className="mt-4">
              <div className="mb-1 flex justify-between text-xs font-semibold text-[var(--fgColor-default)]">
                <span>{progressLabel}</span>
                <span>{importProgress.progress}%</span>
              </div>
              <ProgressBar progress={importProgress.progress} />
            </div>
          )}
        </div>
      )}

      {/* Quick-Load Samples Section */}
      <div className="mt-8 rounded-xl border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-6">
        <div className="mb-4 text-center">
          <Label
            variant="accent"
            className="text-xs font-semibold uppercase tracking-wider"
          >
            One-Click Test Fixtures
          </Label>
          <h3 className="mt-2 text-base font-bold text-[var(--fgColor-default)]">
            Test immediately with synthetic CLI evidence
          </h3>
          <p className="text-xs text-[var(--fgColor-muted)]">
            No file upload needed. Explore pre-packaged synthetic bundles
            containing real contract scenarios.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleSampleLoad('organization')}
            className="flex cursor-pointer flex-col items-start rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-4 text-left transition-colors hover:border-[var(--borderColor-accent-emphasis)]"
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-bold text-[var(--fgColor-default)]">
                Single Organization Sample
              </span>
              <Label variant="success">Valid</Label>
            </div>
            <p className="mt-1 text-xs font-normal text-[var(--fgColor-muted)]">
              <code>organization-v1.json</code>: 1 organization, private repo,
              partial LFS storage, active ruleset, and advisory finding.
            </p>
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleSampleLoad('enterprise')}
            className="flex cursor-pointer flex-col items-start rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-4 text-left transition-colors hover:border-[var(--borderColor-accent-emphasis)]"
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-bold text-[var(--fgColor-default)]">
                Multi-Org Enterprise Sample
              </span>
              <Label variant="attention">Partial Enum</Label>
            </div>
            <p className="mt-1 text-xs font-normal text-[var(--fgColor-muted)]">
              <code>enterprise-v1.json</code>: 2 organizations, partial
              enterprise enumeration, failed security collector, and multiple
              repos.
            </p>
          </button>
        </div>
      </div>

      {/* Privacy Guarantee Note */}
      <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[var(--fgColor-muted)]">
        <ShieldCheckIcon className="shrink-0 text-[var(--fgColor-success)]" />
        <span>
          <strong>Zero External Network Requests</strong>: All bundle validation
          and analysis occurs strictly within your local browser memory.
        </span>
      </div>
    </div>
  );
};
