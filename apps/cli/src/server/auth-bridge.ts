import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface AuthStatus {
  authenticated: boolean;
  authType: 'gh_cli' | 'env_token' | 'unauthenticated';
  user: string | null;
  token?: string | null;
}

export async function resolveAmbientToken(): Promise<{
  token: string | null;
  authType: 'gh_cli' | 'env_token' | 'unauthenticated';
}> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], {
      timeout: 3000,
    });
    const token = stdout.trim();
    if (token) {
      return { token, authType: 'gh_cli' };
    }
  } catch {
    // gh CLI is either not installed or not logged in
  }

  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (envToken && envToken.trim()) {
    return { token: envToken.trim(), authType: 'env_token' };
  }

  return { token: null, authType: 'unauthenticated' };
}

export async function getAuthStatus(
  explicitToken?: string | null,
  fetchFn: typeof fetch = fetch,
  tokenResolver: () => Promise<{
    token: string | null;
    authType: 'gh_cli' | 'env_token' | 'unauthenticated';
  }> = resolveAmbientToken,
): Promise<AuthStatus> {
  let token: string | null;
  let authType: 'gh_cli' | 'env_token' | 'unauthenticated';

  if (explicitToken === null) {
    token = null;
    authType = 'unauthenticated';
  } else if (typeof explicitToken === 'string' && explicitToken.length > 0) {
    token = explicitToken;
    authType = 'env_token';
  } else {
    const resolved = await tokenResolver();
    token = resolved.token;
    authType = resolved.authType;
  }

  if (!token) {
    return {
      authenticated: false,
      authType: 'unauthenticated',
      user: null,
    };
  }

  try {
    const res = await fetchFn('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ghec-consultant-cli',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (res.ok) {
      const data = (await res.json()) as { login?: string };
      return {
        authenticated: true,
        authType,
        user: data.login ?? null,
        token,
      };
    }
  } catch {
    // Network or authentication check error
  }

  return {
    authenticated: false,
    authType,
    user: null,
    token,
  };
}
