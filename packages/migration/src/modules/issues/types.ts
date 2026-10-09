export interface MigrationMilestone {
  readonly id?: number | undefined;
  readonly number: number;
  readonly title: string;
  readonly description?: string | null | undefined;
  readonly state: 'open' | 'closed';
  readonly dueOn?: string | null | undefined;
}

export interface MigrationLabel {
  readonly id?: number | undefined;
  readonly name: string;
  readonly color: string;
  readonly description?: string | null | undefined;
}

export interface MigrationIssueComment {
  readonly id?: number | undefined;
  readonly body: string;
  readonly createdAt: string;
  readonly user?: { readonly login: string } | null | undefined;
}

export interface MigrationIssue {
  readonly number: number;
  readonly title: string;
  readonly body?: string | null | undefined;
  readonly state: 'open' | 'closed';
  readonly createdAt: string;
  readonly closedAt?: string | null | undefined;
  readonly user?: { readonly login: string } | null | undefined;
  readonly milestone?: MigrationMilestone | null | undefined;
  readonly labels: readonly MigrationLabel[];
  readonly comments: readonly MigrationIssueComment[];
}

export interface IssuesMigrationData {
  readonly repo: string;
  readonly milestones: readonly MigrationMilestone[];
  readonly labels: readonly MigrationLabel[];
  readonly issues: readonly MigrationIssue[];
}

export interface IssueImportPayload {
  readonly issue: {
    readonly title: string;
    readonly body: string;
    readonly created_at?: string | undefined;
    readonly closed?: boolean | undefined;
    readonly closed_at?: string | undefined;
    readonly labels?: readonly string[] | undefined;
    readonly milestone?: number | undefined;
  };
  readonly comments?:
    | ReadonlyArray<{
        readonly created_at?: string | undefined;
        readonly body: string;
      }>
    | undefined;
}

export interface RawApiMilestone {
  readonly id?: number | undefined;
  readonly number: number;
  readonly title: string;
  readonly description?: string | null | undefined;
  readonly state?: string | undefined;
  readonly due_on?: string | null | undefined;
}

export interface RawApiLabel {
  readonly id?: number | undefined;
  readonly name: string;
  readonly color: string;
  readonly description?: string | null | undefined;
}

export interface RawApiIssueComment {
  readonly id?: number | undefined;
  readonly body: string;
  readonly created_at: string;
  readonly user?: { readonly login: string } | null | undefined;
}

export interface RawApiIssue {
  readonly number: number;
  readonly title: string;
  readonly body?: string | null | undefined;
  readonly state: string;
  readonly created_at: string;
  readonly closed_at?: string | null | undefined;
  readonly user?: { readonly login: string } | null | undefined;
  readonly milestone?: RawApiMilestone | null | undefined;
  readonly labels?: readonly (RawApiLabel | string)[] | undefined;
  readonly pull_request?: unknown | undefined;
  readonly comments?: number | undefined;
}
