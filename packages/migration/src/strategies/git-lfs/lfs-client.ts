import { sanitizeDiagnostics } from '@ghec/github-client';
import { runGeiCommand } from '../../gei/executor.js';
import type { GeiCommandRunner } from '../../gei/types.js';

function redact(message: string, secrets: readonly string[]): string {
  return secrets
    .filter((secret) => secret.length > 0)
    .reduce(
      (output, secret) => output.replaceAll(secret, '[REDACTED_TOKEN]'),
      sanitizeDiagnostics(message),
    );
}

export function validateGitHubIdentifier(name: string, label: string): void {
  if (
    !name ||
    !/^[a-zA-Z0-9_.-]+$/.test(name) ||
    name.startsWith('-') ||
    name.startsWith('.')
  ) {
    throw new Error(`Invalid GitHub ${label}: "${name}".`);
  }
}

export function validateStagingDirectory(directory: string): void {
  if (!directory || directory.startsWith('-')) {
    throw new Error(
      `Invalid staging directory: "${directory}". Staging directory cannot begin with a dash.`,
    );
  }
}

export function repositoryUrl(
  org: string,
  repo: string,
  token: string,
): string {
  validateGitHubIdentifier(org, 'organization');
  validateGitHubIdentifier(repo, 'repository');
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${org}/${repo}.git`;
}

function assertSuccess(
  action: string,
  exitCode: number,
  stdout: string,
  stderr: string,
  secrets: readonly string[],
): void {
  if (exitCode !== 0) {
    throw new Error(
      `${action} failed with exit code ${exitCode}: ${redact(stderr || stdout, secrets)}`,
    );
  }
}

export interface GitLfsClientOptions {
  readonly runner?: GeiCommandRunner;
}

/** Executes Git and Git LFS through no-shell argument arrays. */
export class GitLfsClient {
  private readonly runner: GeiCommandRunner;

  constructor(options: GitLfsClientOptions = {}) {
    this.runner = options.runner ?? runGeiCommand;
  }

  async checkInstalled(signal: AbortSignal): Promise<void> {
    const result = await this.runner('git', ['lfs', 'version'], { signal });
    assertSuccess(
      'git lfs version',
      result.exitCode,
      result.stdout,
      result.stderr,
      [],
    );
  }

  async cloneMirror(
    stagingDirectory: string,
    sourceOrg: string,
    sourceRepo: string,
    sourceToken: string,
    signal: AbortSignal,
  ): Promise<void> {
    validateStagingDirectory(stagingDirectory);
    const secrets = [sourceToken];
    const repoUrl = repositoryUrl(sourceOrg, sourceRepo, sourceToken);
    const result = await this.runner(
      'git',
      ['clone', '--mirror', '--', repoUrl, stagingDirectory],
      { signal, secrets },
    );
    assertSuccess(
      'git clone --mirror',
      result.exitCode,
      result.stdout,
      result.stderr,
      secrets,
    );
  }

  async fetchAll(
    stagingDirectory: string,
    sourceToken: string,
    signal: AbortSignal,
  ): Promise<void> {
    validateStagingDirectory(stagingDirectory);
    const result = await this.runner(
      'git',
      ['-C', stagingDirectory, 'lfs', 'fetch', '--all', 'origin'],
      {
        signal,
        secrets: [sourceToken],
      },
    );
    assertSuccess(
      'git lfs fetch --all',
      result.exitCode,
      result.stdout,
      result.stderr,
      [sourceToken],
    );
  }

  async setTargetRemote(
    stagingDirectory: string,
    targetOrg: string,
    targetRepo: string,
    targetToken: string,
    signal: AbortSignal,
  ): Promise<void> {
    validateStagingDirectory(stagingDirectory);
    const secrets = [targetToken];
    const repoUrl = repositoryUrl(targetOrg, targetRepo, targetToken);
    const result = await this.runner(
      'git',
      ['-C', stagingDirectory, 'remote', 'set-url', '--', 'origin', repoUrl],
      { signal, secrets },
    );
    assertSuccess(
      'git remote set-url',
      result.exitCode,
      result.stdout,
      result.stderr,
      secrets,
    );
  }

  async pushAll(
    stagingDirectory: string,
    targetToken: string,
    signal: AbortSignal,
  ): Promise<void> {
    validateStagingDirectory(stagingDirectory);
    const result = await this.runner(
      'git',
      ['-C', stagingDirectory, 'lfs', 'push', '--all', 'origin'],
      {
        signal,
        secrets: [targetToken],
      },
    );
    assertSuccess(
      'git lfs push --all',
      result.exitCode,
      result.stdout,
      result.stderr,
      [targetToken],
    );
  }
}
