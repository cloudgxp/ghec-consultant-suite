export interface MigrationPullRequest {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: 'open' | 'closed';
  readonly merged: boolean;
  readonly headRef: string;
  readonly baseRef: string;
  readonly author: string;
  readonly labels: readonly string[];
  readonly milestone?: number | undefined;
  readonly commentsCount: number;
  readonly reviewCommentsCount: number;
  readonly createdAt: string;
  readonly closedAt?: string | null | undefined;
  readonly mergedAt?: string | null | undefined;
}

export interface MigrationPullRequestComment {
  readonly id?: number | undefined;
  readonly body: string;
  readonly createdAt: string;
  readonly author?: string | undefined;
}

export interface PullRequestsMigrationData {
  readonly repo: string;
  readonly openPullRequests: readonly MigrationPullRequest[];
  readonly closedPullRequests: readonly MigrationPullRequest[];
  readonly commentsByPrNumber: Readonly<
    Record<number, readonly MigrationPullRequestComment[]>
  >;
}

export interface CreatePullRequestPayload {
  readonly sourceNumber: number;
  readonly title: string;
  readonly body: string;
  readonly head: string;
  readonly base: string;
  readonly labels?: readonly string[] | undefined;
  readonly milestone?: number | undefined;
  readonly comments?: readonly MigrationPullRequestComment[] | undefined;
}

export interface ArchivePullRequestsPayload {
  readonly archiveTitle: string;
  readonly closedPrs: readonly MigrationPullRequest[];
}

export interface RawApiPullRequest {
  readonly number: number;
  readonly title: string;
  readonly body?: string | null | undefined;
  readonly state: string;
  readonly merged_at?: string | null | undefined;
  readonly closed_at?: string | null | undefined;
  readonly created_at: string;
  readonly head?: { readonly ref?: string | undefined } | undefined;
  readonly base?: { readonly ref?: string | undefined } | undefined;
  readonly user?: { readonly login?: string | undefined } | undefined;
  readonly labels?: readonly ({ readonly name: string } | string)[] | undefined;
  readonly milestone?: { readonly number: number } | null | undefined;
  readonly comments?: number | undefined;
  readonly review_comments?: number | undefined;
}

export interface RawApiPullComment {
  readonly id?: number | undefined;
  readonly body: string;
  readonly created_at: string;
  readonly user?: { readonly login?: string | undefined } | undefined;
}
