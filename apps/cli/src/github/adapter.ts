/**
 * Compatibility shim: the read adapter contracts now live in
 * `@ghec/github-client`. New code should import from the package directly.
 */
export type {
  EndpointProbeResult,
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from '@ghec/github-client';
