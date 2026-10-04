/**
 * Compatibility shim: GitHub App authentication now lives in
 * `@ghec/github-client`. New code should import from the package directly.
 */
export type { TokenProvider } from '@ghec/github-client';
export { GitHubAppAuthProvider, createGitHubAppJwt } from '@ghec/github-client';
