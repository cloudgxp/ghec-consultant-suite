import { runGeiCommand } from './executor.js';
import type {
  GeiCommandRunner,
  GeiPreflightCheck,
  GeiPreflightResult,
} from './types.js';

async function check(
  name: GeiPreflightCheck['name'],
  args: readonly string[],
  installCommand: string,
  runner: GeiCommandRunner,
  signal?: AbortSignal,
): Promise<GeiPreflightCheck> {
  try {
    const result = await runner('gh', args, signal ? { signal } : {});
    return result.exitCode === 0
      ? { name, ready: true, detail: result.stdout || 'Available.' }
      : {
          name,
          ready: false,
          detail:
            result.stderr || `gh ${args.join(' ')} exited ${result.exitCode}.`,
          installCommand,
        };
  } catch (error) {
    return {
      name,
      ready: false,
      detail: error instanceof Error ? error.message : String(error),
      installCommand,
    };
  }
}

/** Checks the GitHub CLI and GEI extension before an irreversible cutover. */
export async function checkGeiPreflight(
  signal?: AbortSignal,
  runner: GeiCommandRunner = runGeiCommand,
): Promise<GeiPreflightResult> {
  const gh = await check(
    'gh',
    ['--version'],
    'https://cli.github.com/',
    runner,
    signal,
  );
  const gei = gh.ready
    ? await check(
        'gh-gei',
        ['extension', 'list'],
        'gh extension install github/gh-gei',
        runner,
        signal,
      )
    : {
        name: 'gh-gei' as const,
        ready: false,
        detail: 'GitHub CLI is not available.',
        installCommand: 'gh extension install github/gh-gei',
      };
  const extensionPresent =
    gei.ready && /(?:github\/gh-gei|\bgei\b)/i.test(gei.detail);
  const checks = [
    gh,
    extensionPresent
      ? gei
      : {
          ...gei,
          ready: false,
          detail: gei.ready
            ? 'The GitHub Enterprise Importer extension is not installed.'
            : gei.detail,
          installCommand: 'gh extension install github/gh-gei',
        },
  ];
  return { ready: checks.every((entry) => entry.ready), checks };
}
