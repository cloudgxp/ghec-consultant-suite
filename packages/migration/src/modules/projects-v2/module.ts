import {
  MIGRATION_SCHEMA_VERSION,
  type ModuleExecutionResult,
  type ModulePlan,
  type ModuleVerificationResult,
  type OperationExecutionResult,
  type PlannedOperation,
  type VerificationDiscrepancy,
} from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  TargetWriteOperation,
} from '../../core/types.js';
import {
  PROJECT_BUILTIN_FIELD_NAMES,
  type CreateProjectV2FieldPayload,
  type CreateProjectV2Payload,
  type ProjectV2FieldDefinition,
  type ProjectV2SingleSelectOption,
  type ProjectV2State,
  type ProjectsV2Data,
  PROJECTS_V2_MODULE_ID,
  type RawGraphQLOrgProjectsV2Response,
} from './types.js';

export const GET_ORG_PROJECTS_V2_QUERY = `
  query GetOrgProjectsV2($org: String!) {
    organization(login: $org) {
      id
      projectsV2(first: 50) {
        nodes {
          id
          number
          title
          shortDescription
          closed
          public
          fields(first: 50) {
            nodes {
              ... on ProjectV2Field {
                id
                name
                dataType
              }
              ... on ProjectV2IterationField {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                options {
                  id
                  name
                  color
                  description
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const CREATE_PROJECT_V2_MUTATION = `
  mutation CreateProjectV2($input: CreateProjectV2Input!) {
    createProjectV2(input: $input) {
      projectV2 {
        id
        number
        title
        url
      }
    }
  }
`;

export const CREATE_PROJECT_V2_FIELD_MUTATION = `
  mutation CreateProjectV2Field($input: CreateProjectV2FieldInput!) {
    createProjectV2Field(input: $input) {
      projectV2Field {
        ... on ProjectV2Field {
          id
          name
          dataType
        }
        ... on ProjectV2SingleSelectField {
          id
          name
          dataType
        }
      }
    }
  }
`;

function slugifyTitle(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

function parseOrgProjectsV2(
  org: string,
  res?: RawGraphQLOrgProjectsV2Response | null | undefined,
): ProjectsV2Data {
  const organization = res?.organization;
  const orgNodeId =
    typeof organization?.id === 'string' ? organization.id : undefined;

  const rawProjects = organization?.projectsV2?.nodes;
  const projects: ProjectV2State[] = [];

  if (Array.isArray(rawProjects)) {
    for (const p of rawProjects) {
      if (p && typeof p.id === 'string' && typeof p.title === 'string') {
        const rawFields = p.fields?.nodes;
        const fields: ProjectV2FieldDefinition[] = [];

        if (Array.isArray(rawFields)) {
          for (const f of rawFields) {
            if (f && typeof f.id === 'string' && typeof f.name === 'string') {
              const rawOptions = f.options;
              const options: ProjectV2SingleSelectOption[] = [];
              if (Array.isArray(rawOptions)) {
                for (const opt of rawOptions) {
                  if (opt && typeof opt.name === 'string') {
                    options.push({
                      id: typeof opt.id === 'string' ? opt.id : undefined,
                      name: opt.name,
                      color:
                        typeof opt.color === 'string' ? opt.color : undefined,
                      description:
                        typeof opt.description === 'string'
                          ? opt.description
                          : undefined,
                    });
                  }
                }
              }

              fields.push({
                id: f.id,
                name: f.name,
                dataType: typeof f.dataType === 'string' ? f.dataType : 'TEXT',
                options: options.length > 0 ? options : undefined,
              });
            }
          }
        }

        projects.push({
          id: p.id,
          number: typeof p.number === 'number' ? p.number : 0,
          title: p.title,
          shortDescription:
            typeof p.shortDescription === 'string'
              ? p.shortDescription
              : undefined,
          closed: p.closed ?? false,
          public: p.public ?? false,
          fields,
        });
      }
    }
  }

  return {
    org,
    orgNodeId,
    projects,
  };
}

export class ProjectsV2MigrationModule implements MigrationModule<ProjectsV2Data> {
  readonly id = PROJECTS_V2_MODULE_ID;
  readonly displayName = 'Projects v2 (Memex)';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = ['org-settings'];

  async discover(ctx: MigrationContext): Promise<ProjectsV2Data> {
    const sourceOrg = ctx.scope.sourceOrg;
    if (!sourceOrg) {
      return {
        org: '',
        projects: [],
      };
    }

    try {
      const res =
        await ctx.sourceClient.queryGraphQL<RawGraphQLOrgProjectsV2Response>(
          GET_ORG_PROJECTS_V2_QUERY,
          { org: sourceOrg },
          ctx.signal,
        );

      return parseOrgProjectsV2(sourceOrg, res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('INSUFFICIENT_SCOPES') ||
        message.includes('FORBIDDEN') ||
        message.includes('requires one of the following scopes')
      ) {
        ctx.logger.warn(
          `[projects-v2] Skipping source Projects v2 discovery for org ${sourceOrg} due to token scope permissions: ${message}`,
        );
        return {
          org: sourceOrg,
          projects: [],
        };
      }
      throw new Error(
        `Failed to discover projects-v2 for org ${sourceOrg}: ${message}`,
        { cause: err },
      );
    }
  }

  async plan(
    ctx: MigrationContext,
    source: ProjectsV2Data,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    let targetProjectsData: ProjectsV2Data = {
      org: targetOrg,
      projects: [],
    };

    try {
      const res =
        await ctx.targetClient.queryGraphQL<RawGraphQLOrgProjectsV2Response>(
          GET_ORG_PROJECTS_V2_QUERY,
          { org: targetOrg },
          ctx.signal,
        );
      targetProjectsData = parseOrgProjectsV2(targetOrg, res.data);
    } catch (err: unknown) {
      ctx.logger.warn(
        `Could not query target projects-v2 for org ${targetOrg}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const targetOrgNodeId = targetProjectsData.orgNodeId;
    const targetProjectsMap = new Map<string, ProjectV2State>();
    for (const proj of targetProjectsData.projects) {
      targetProjectsMap.set(proj.title.toLowerCase(), proj);
    }

    for (const project of source.projects) {
      const existingProject = targetProjectsMap.get(
        project.title.toLowerCase(),
      );

      if (existingProject) {
        operations.push({
          id: `op-noop-project-v2-${slugifyTitle(project.title)}`,
          resourceType: 'project_v2',
          resourceName: project.title,
          operation: 'noop',
          sourceState: project as unknown as Record<string, unknown>,
          destinationCurrentState: existingProject as unknown as Record<
            string,
            unknown
          >,
          reason: `Project v2 "${project.title}" already exists in target organization`,
        });

        const targetFieldsMap = new Map<string, ProjectV2FieldDefinition>();
        for (const f of existingProject.fields) {
          targetFieldsMap.set(f.name.toLowerCase(), f);
        }

        for (const field of project.fields) {
          const existingField = targetFieldsMap.get(field.name.toLowerCase());
          if (existingField) {
            operations.push({
              id: `op-noop-project-v2-field-${slugifyTitle(project.title)}-${slugifyTitle(field.name)}`,
              resourceType: 'project_v2_field',
              resourceName: `${project.title}:${field.name}`,
              operation: 'noop',
              sourceState: field as unknown as Record<string, unknown>,
              destinationCurrentState: existingField as unknown as Record<
                string,
                unknown
              >,
              reason: `Field "${field.name}" already exists on project "${project.title}"`,
            });
          } else {
            if (PROJECT_BUILTIN_FIELD_NAMES.has(field.name.toLowerCase())) {
              continue;
            }
            const fieldPayload: CreateProjectV2FieldPayload = {
              org: targetOrg,
              projectTitle: project.title,
              projectId: existingProject.id,
              name: field.name,
              dataType: field.dataType,
              singleSelectOptions: field.options,
            };
            operations.push({
              id: `op-create-project-v2-field-${slugifyTitle(project.title)}-${slugifyTitle(field.name)}`,
              resourceType: 'project_v2_field',
              resourceName: `${project.title}:${field.name}`,
              operation: 'create',
              sourceState: field as unknown as Record<string, unknown>,
              payload: fieldPayload as unknown as Record<string, unknown>,
            });
          }
        }
      } else {
        const createProjectPayload: CreateProjectV2Payload = {
          org: targetOrg,
          ownerId: targetOrgNodeId,
          title: project.title,
          shortDescription: project.shortDescription,
        };
        operations.push({
          id: `op-create-project-v2-${slugifyTitle(project.title)}`,
          resourceType: 'project_v2',
          resourceName: project.title,
          operation: 'create',
          sourceState: project as unknown as Record<string, unknown>,
          payload: createProjectPayload as unknown as Record<string, unknown>,
        });

        for (const field of project.fields) {
          if (PROJECT_BUILTIN_FIELD_NAMES.has(field.name.toLowerCase())) {
            continue;
          }
          const fieldPayload: CreateProjectV2FieldPayload = {
            org: targetOrg,
            projectTitle: project.title,
            name: field.name,
            dataType: field.dataType,
            singleSelectOptions: field.options,
          };
          operations.push({
            id: `op-create-project-v2-field-${slugifyTitle(project.title)}-${slugifyTitle(field.name)}`,
            resourceType: 'project_v2_field',
            resourceName: `${project.title}:${field.name}`,
            operation: 'create',
            sourceState: field as unknown as Record<string, unknown>,
            payload: fieldPayload as unknown as Record<string, unknown>,
          });
        }
      }
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: targetOrg,
      operations,
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const results: OperationExecutionResult[] = [];
    const createdProjectIds = new Map<string, string>();

    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (op.resourceType === 'project_v2') {
        const destProj = op.destinationCurrentState as
          { id?: string; title?: string } | undefined;
        if (typeof destProj?.id === 'string') {
          createdProjectIds.set(op.resourceName.toLowerCase(), destProj.id);
        }
      }

      if (op.operation === 'noop' || op.operation === 'skip') {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }

      if (ctx.dryRun) {
        ctx.logger.info(
          `[DRY RUN] Would execute operation ${op.id} (${op.resourceType} "${op.resourceName}")`,
        );
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }

      if (!ctx.targetWriteClient) {
        throw new Error(
          `Cannot apply operation '${op.id}' without targetWriteClient`,
        );
      }

      const client = ctx.targetWriteClient;

      try {
        if (op.resourceType === 'project_v2') {
          const payload = op.payload as CreateProjectV2Payload | undefined;
          const ownerId = payload?.ownerId;
          const title = payload?.title ?? op.resourceName;

          if (!ownerId) {
            throw new Error(
              `Cannot create project "${title}": missing target organization ownerId`,
            );
          }

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'POST',
            path: '/graphql',
            body: {
              query: CREATE_PROJECT_V2_MUTATION,
              variables: {
                input: {
                  ownerId,
                  title,
                },
              },
            },
          };

          const res = await client.mutate<{
            createProjectV2?: {
              projectV2?: {
                id?: string;
              };
            };
            data?: {
              createProjectV2?: {
                projectV2?: {
                  id?: string;
                };
              };
            };
          }>(writeOp, ctx.signal);

          const createdId =
            res.data?.createProjectV2?.projectV2?.id ??
            res.data?.data?.createProjectV2?.projectV2?.id;
          if (createdId) {
            createdProjectIds.set(title.toLowerCase(), createdId);
          }

          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        } else if (op.resourceType === 'project_v2_field') {
          const payload = op.payload as CreateProjectV2FieldPayload | undefined;
          const projectTitle = payload?.projectTitle ?? '';
          const fieldName =
            payload?.name ?? op.resourceName.split(':')[1] ?? 'Field';
          if (PROJECT_BUILTIN_FIELD_NAMES.has(fieldName.toLowerCase())) {
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: 200,
              completedAt: new Date().toISOString(),
            });
            continue;
          }
          const projectId =
            payload?.projectId ??
            createdProjectIds.get(projectTitle.toLowerCase());

          if (!projectId) {
            throw new Error(
              `Cannot create field "${op.resourceName}": parent project ID could not be resolved`,
            );
          }

          const input: Record<string, unknown> = {
            projectId,
            dataType: payload?.dataType ?? 'TEXT',
            name: payload?.name ?? op.resourceName.split(':')[1] ?? 'Field',
          };

          if (
            payload?.singleSelectOptions &&
            payload.singleSelectOptions.length > 0
          ) {
            input.singleSelectOptions = payload.singleSelectOptions.map(
              (opt) => ({
                name: opt.name,
                color: opt.color ?? 'GRAY',
                description: opt.description ?? '',
              }),
            );
          }

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'POST',
            path: '/graphql',
            body: {
              query: CREATE_PROJECT_V2_FIELD_MUTATION,
              variables: { input },
            },
          };

          const res = await client.mutate(writeOp, ctx.signal);

          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        } else {
          results.push({
            operationId: op.id,
            status: 'skipped',
            completedAt: new Date().toISOString(),
          });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        ctx.logger.error(
          `Failed to apply operation ${op.id} for "${op.resourceName}": ${errorMsg}`,
        );
        results.push({
          operationId: op.id,
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: errorMsg,
        });

        if (!ctx.continueOnError) {
          break;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const hasFailures = results.some((r) => r.status === 'failed');
    const allFailures =
      results.length > 0 && results.every((r) => r.status === 'failed');

    const status = allFailures
      ? 'failed'
      : hasFailures
        ? 'partial'
        : 'complete';

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status,
      results,
      durationMs,
    };
  }

  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetOrg = ctx.scope.targetOrg;
    const discrepancies: VerificationDiscrepancy[] = [];

    if (plan.operations.length === 0) {
      return {
        moduleId: this.id,
        verified: true,
        discrepancies: [],
      };
    }

    let targetProjectsData: ProjectsV2Data;

    try {
      const res =
        await ctx.targetClient.queryGraphQL<RawGraphQLOrgProjectsV2Response>(
          GET_ORG_PROJECTS_V2_QUERY,
          { org: targetOrg },
          ctx.signal,
        );
      targetProjectsData = parseOrgProjectsV2(targetOrg, res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      discrepancies.push({
        resourceName: `${targetOrg}:projects-v2`,
        expected: 'accessible',
        actual: `Failed to query: ${message}`,
        message: `Failed to query target projects-v2 on org ${targetOrg}: ${message}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    const targetMap = new Map<string, ProjectV2State>();
    for (const p of targetProjectsData.projects) {
      targetMap.set(p.title.toLowerCase(), p);
    }

    for (const op of plan.operations) {
      if (op.operation === 'noop' || op.operation === 'create') {
        if (op.resourceType === 'project_v2') {
          const title = op.resourceName;
          const act = targetMap.get(title.toLowerCase());

          if (!act) {
            discrepancies.push({
              resourceName: `${targetOrg} (projectsV2.${title})`,
              expected: title,
              actual: null,
              message: `Project v2 "${title}" is missing on target organization ${targetOrg}.`,
            });
          }
        } else if (op.resourceType === 'project_v2_field') {
          const parts = op.resourceName.split(':');
          const projectTitle = parts[0] ?? '';
          const fieldName = parts[1] ?? '';

          const actProj = targetMap.get(projectTitle.toLowerCase());
          if (actProj) {
            const fieldMatch = actProj.fields.some(
              (f) => f.name.toLowerCase() === fieldName.toLowerCase(),
            );
            if (!fieldMatch) {
              discrepancies.push({
                resourceName: `${targetOrg} (projectsV2.${op.resourceName})`,
                expected: fieldName,
                actual: null,
                message: `Custom field "${fieldName}" on project "${projectTitle}" is missing on target organization ${targetOrg}.`,
              });
            }
          } else {
            discrepancies.push({
              resourceName: `${targetOrg} (projectsV2.${op.resourceName})`,
              expected: fieldName,
              actual: null,
              message: `Parent project "${projectTitle}" for field "${fieldName}" is missing on target organization ${targetOrg}.`,
            });
          }
        }
      }
    }

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}
