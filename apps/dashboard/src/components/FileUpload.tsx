import React, { useState, useRef } from 'react';
import {
  importBundleFile,
  loadSampleBundle,
  type ImportResult,
} from '../lib/importer.js';

interface FileUploadProps {
  onLoadBundle: (result: ImportResult) => void;
  errorMessage: string | null;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onLoadBundle,
  errorMessage,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const result = await importBundleFile(file);
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

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-base-content tracking-tight sm:text-4xl">
          GitHub Enterprise Cloud Assessment
        </h1>
        <p className="mt-3 text-lg text-base-content/70 max-w-2xl mx-auto">
          Ingest discovery bundles produced by the CLI to evaluate migration
          readiness, inspect security posture, audit automation dependencies,
          and export clean reports.
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div
          role="alert"
          className="alert alert-error mb-6 shadow-sm border border-error/20"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h3 className="font-bold">Import Failed</h3>
            <div className="text-sm">{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Drag & Drop Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`card border-2 border-dashed rounded-2xl p-10 text-center transition-all bg-base-100 ${
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-base-300 hover:border-primary/50'
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

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="p-4 bg-primary/10 text-primary rounded-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-base-content">
              Select or drop a Discovery Bundle JSON
            </h2>
            <p className="text-sm text-base-content/60 mt-1">
              Supports GHEC Contract Schema v1.0.0 (up to 50 MB)
            </p>
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary px-8"
          >
            {isLoading ? 'Validating Bundle...' : 'Choose Local File'}
          </button>
        </div>
      </div>

      {/* Quick-Load Samples Section */}
      <div className="mt-8 bg-base-200/60 rounded-xl p-6 border border-base-300">
        <div className="text-center mb-4">
          <span className="badge badge-primary badge-outline text-xs uppercase tracking-wider font-semibold">
            One-Click Test Fixtures
          </span>
          <h3 className="text-base font-bold text-base-content mt-1">
            Test immediately with synthetic CLI evidence
          </h3>
          <p className="text-xs text-base-content/60">
            No file upload needed. Explore pre-packaged synthetic bundles
            containing real contract scenarios.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleSampleLoad('organization')}
            className="btn btn-outline hover:btn-primary flex flex-col items-start p-4 h-auto text-left"
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-bold text-sm">
                Single Organization Sample
              </span>
              <span className="badge badge-sm badge-success">Valid</span>
            </div>
            <p className="text-xs text-base-content/70 mt-1 font-normal">
              <code>organization-v1.json</code>: 1 organization, private repo,
              partial LFS storage, active ruleset, and advisory finding.
            </p>
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleSampleLoad('enterprise')}
            className="btn btn-outline hover:btn-primary flex flex-col items-start p-4 h-auto text-left"
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-bold text-sm">
                Multi-Org Enterprise Sample
              </span>
              <span className="badge badge-sm badge-warning">Partial Enum</span>
            </div>
            <p className="text-xs text-base-content/70 mt-1 font-normal">
              <code>enterprise-v1.json</code>: 2 organizations, partial
              enterprise enumeration, failed security collector, and multiple
              repos.
            </p>
          </button>
        </div>
      </div>

      {/* Privacy Guarantee Note */}
      <div className="mt-8 flex items-center justify-center gap-2 text-xs text-base-content/60">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 text-success shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span>
          <strong>Zero External Network Requests</strong>: All bundle validation
          and analysis occurs strictly within your local browser memory.
        </span>
      </div>
    </div>
  );
};
