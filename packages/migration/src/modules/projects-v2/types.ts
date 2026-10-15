export const PROJECTS_V2_MODULE_ID = 'projects-v2';
export const PROJECTS_V2_DISCREPANCY_SEVERITY = 'HIGH' as const;

export const PROJECT_BUILTIN_FIELD_NAMES = new Set([
  'title',
  'assignees',
  'status',
  'labels',
  'linked pull requests',
  'reviewers',
  'repository',
  'milestone',
  'closed',
  'created',
  'updated',
  'parent issue',
  'sub-issues progress',
  'tracks',
  'tracked by',
]);

export interface ProjectV2SingleSelectOption {
  readonly id?: string | undefined;
  readonly name: string;
  readonly color?: string | undefined;
  readonly description?: string | undefined;
}

export interface ProjectV2FieldDefinition {
  readonly id: string;
  readonly name: string;
  readonly dataType: string;
  readonly options?: readonly ProjectV2SingleSelectOption[] | undefined;
}

export interface ProjectV2State {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly shortDescription?: string | undefined;
  readonly closed: boolean;
  readonly public: boolean;
  readonly fields: readonly ProjectV2FieldDefinition[];
}

export interface ProjectsV2Data {
  readonly org: string;
  readonly orgNodeId?: string | undefined;
  readonly projects: readonly ProjectV2State[];
}

export interface CreateProjectV2Payload {
  readonly org: string;
  readonly ownerId?: string | undefined;
  readonly title: string;
  readonly shortDescription?: string | undefined;
}

export interface CreateProjectV2FieldPayload {
  readonly org: string;
  readonly projectTitle: string;
  readonly projectId?: string | undefined;
  readonly name: string;
  readonly dataType: string;
  readonly singleSelectOptions?:
    readonly ProjectV2SingleSelectOption[] | undefined;
}

export interface RawGraphQLProjectV2FieldNode {
  readonly id?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly dataType?: string | null | undefined;
  readonly options?:
    | ReadonlyArray<{
        readonly id?: string | null | undefined;
        readonly name?: string | null | undefined;
        readonly color?: string | null | undefined;
        readonly description?: string | null | undefined;
      } | null>
    | null
    | undefined;
}

export interface RawGraphQLProjectV2Node {
  readonly id?: string | null | undefined;
  readonly number?: number | null | undefined;
  readonly title?: string | null | undefined;
  readonly shortDescription?: string | null | undefined;
  readonly closed?: boolean | null | undefined;
  readonly public?: boolean | null | undefined;
  readonly fields?:
    | {
        readonly nodes?:
          ReadonlyArray<RawGraphQLProjectV2FieldNode | null> | null | undefined;
      }
    | null
    | undefined;
}

export interface RawGraphQLOrgProjectsV2Response {
  readonly organization?:
    | {
        readonly id?: string | null | undefined;
        readonly projectsV2?:
          | {
              readonly nodes?:
                | ReadonlyArray<RawGraphQLProjectV2Node | null>
                | null
                | undefined;
            }
          | null
          | undefined;
      }
    | null
    | undefined;
}
