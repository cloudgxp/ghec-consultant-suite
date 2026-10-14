/**
 * Domain types for Repository Discussions migration module.
 */

export interface DiscussionCategory {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | undefined;
  readonly isAnswerable?: boolean | undefined;
}

export interface DiscussionPost {
  readonly id?: string | undefined;
  readonly number?: number | undefined;
  readonly title: string;
  readonly body: string;
  readonly categoryName: string;
  readonly author?: string | undefined;
  readonly createdAt?: string | undefined;
}

export interface DiscussionsData {
  readonly owner: string;
  readonly repo: string;
  readonly repositoryId?: string | undefined;
  readonly hasDiscussionsEnabled: boolean;
  readonly categories: readonly DiscussionCategory[];
  readonly discussions: readonly DiscussionPost[];
}

export interface RawGraphQLDiscussionCategoryNode {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | null | undefined;
  readonly isAnswerable?: boolean | null | undefined;
}

export interface RawGraphQLDiscussionNode {
  readonly id: string;
  readonly number?: number | null | undefined;
  readonly title: string;
  readonly body: string;
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly author?:
    | {
        readonly login: string;
      }
    | null
    | undefined;
  readonly createdAt?: string | null | undefined;
}

export interface RawGraphQLRepoDiscussionsResponse {
  readonly repository?:
    | {
        readonly id?: string | null | undefined;
        readonly hasDiscussionsEnabled?: boolean | null | undefined;
        readonly discussionCategories?:
          | {
              readonly nodes?:
                | readonly (RawGraphQLDiscussionCategoryNode | null)[]
                | null
                | undefined;
            }
          | null
          | undefined;
        readonly discussions?:
          | {
              readonly nodes?:
                readonly (RawGraphQLDiscussionNode | null)[] | null | undefined;
            }
          | null
          | undefined;
      }
    | null
    | undefined;
}
