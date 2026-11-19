import { createManagementClient } from "@convex-dev/platform";
import type * as Api from "@convex-dev/platform/managementApi";
import * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type * as Stream from "effect/Stream";
import * as Client from "./internal/Client.js";
import * as Pagination from "./internal/Pagination.js";
import { management } from "./internal/ManagementResponses.js";
import type * as PlatformError from "./PlatformError.js";

export interface Options {
  readonly baseUrl?: string;
  readonly fetch?: (request: Request) => Promise<Response>;
}

type Query<Operation extends keyof Api.operations> = NonNullable<
  Api.operations[Operation]["parameters"]["query"]
>;

type ResponseEffect<A, E = never> = Effect.Effect<
  A,
  PlatformError.RequestFailure | E
>;
type ItemStream<A> = Stream.Stream<
  A,
  PlatformError.RequestFailure | PlatformError.InvalidPagination
>;
type WithSecret<A, Field extends keyof A> = {
  [K in keyof A]: K extends Field ? Redacted.Redacted<A[K]> : A[K];
};
type SecretInput<A, Field extends keyof A> = {
  [K in keyof A]: K extends Field ? A[K] | Redacted.Redacted<string> : A[K];
};

export interface UpdateDefaultEnvironmentVariablesInput {
  readonly changes: ReadonlyArray<
    SecretInput<Api.DefaultEnvironmentVariableChangeArgs, "value">
  >;
}

export type DeployKey = Omit<
  Api.PlatformDeployKeyResponse,
  "allowedActions"
> & { readonly allowedActions: ReadonlyArray<string> };

export interface Service {
  readonly createProject: (
    teamId: number,
    body: Api.PlatformCreateProjectArgs,
  ) => ResponseEffect<Api.PlatformCreateProjectResponse>;
  readonly getProject: (
    projectId: number,
  ) => ResponseEffect<Api.ProjectResponse>;
  readonly updateProject: (
    projectId: number,
    body: Api.PlatformUpdateProjectArgs,
  ) => ResponseEffect<Api.ProjectResponse>;
  readonly listProjects: (
    teamId: number,
    query?: Query<"list projects">,
  ) => ResponseEffect<Api.PlatformPaginatedProjectsResponse>;
  readonly streamProjects: (
    teamId: number,
    query?: Query<"list projects">,
  ) => ItemStream<Api.ProjectResponse>;
  readonly listDeployments: (
    projectId: number,
    query?: Query<"list deployments">,
  ) => ResponseEffect<Api.PlatformDeploymentResponse[]>;
  readonly getProjectDeployment: (
    projectId: number,
    query?: Query<"get deployment in project by project id">,
  ) => ResponseEffect<Api.PlatformDeploymentResponse>;
  readonly getProjectDeploymentBySlug: (
    teamIdOrSlug: string,
    projectSlug: string,
    query?: Query<"get deployment in project by project slug">,
  ) => ResponseEffect<Api.PlatformDeploymentResponse>;
  readonly deleteProject: (projectId: number) => ResponseEffect<void>;
  readonly getProjectBySlug: (
    teamIdOrSlug: string,
    projectSlug: string,
  ) => ResponseEffect<Api.ProjectResponse>;
  readonly createDeployment: (
    projectId: number,
    body: Api.PlatformCreateDeploymentArgs,
  ) => ResponseEffect<Api.PlatformDeploymentResponse>;
  readonly deleteDeployment: (name: string) => ResponseEffect<void>;
  readonly getDeployment: (
    name: string,
  ) => ResponseEffect<Api.PlatformDeploymentResponse>;
  readonly updateDeployment: (
    name: string,
    body: Api.PlatformUpdateDeploymentArgs,
  ) => ResponseEffect<void>;
  readonly transferDeployment: (
    name: string,
    body: Api.PlatformTransferDeploymentArgs,
  ) => ResponseEffect<void>;
  readonly listDeploymentClasses: (
    teamId: number,
  ) => ResponseEffect<Api.ListDeploymentClassesResponse>;
  readonly listDeploymentRegions: (
    teamId: number,
  ) => ResponseEffect<Api.ListDeploymentRegionsResponse>;
  readonly listTeamDeployments: (
    teamId: number,
    query?: Query<"list deployments for team">,
  ) => ResponseEffect<Api.PaginatedDeploymentsResponse>;
  readonly streamTeamDeployments: (
    teamId: number,
    query?: Query<"list deployments for team">,
  ) => ItemStream<Api.PlatformDeploymentResponse>;
  readonly listLocalTeamDeployments: (
    teamId: number,
  ) => ResponseEffect<Api.ListLocalDeploymentsResponse>;
  readonly mintAiGatewayJwt: (
    name: string,
    body: Api.MintLocalAiGatewayJwtArgs,
  ) => ResponseEffect<WithSecret<Api.MintLocalAiGatewayJwtResponse, "token">>;
  readonly createDeployKey: (
    name: string,
    body: Api.PlatformCreateDeployKeyArgs,
  ) => ResponseEffect<
    WithSecret<Api.PlatformCreateDeployKeyResponse, "deployKey">
  >;
  readonly listDeployKeys: (name: string) => ResponseEffect<DeployKey[]>;
  readonly deleteDeployKey: (
    name: string,
    body: SecretInput<Api.PlatformDeleteDeployKeyArgs, "id">,
  ) => ResponseEffect<void>;
  readonly createPreviewDeployKey: (
    projectId: number,
    body: Api.PlatformCreatePreviewDeployKeyArgs,
  ) => ResponseEffect<
    WithSecret<Api.PlatformCreatePreviewDeployKeyResponse, "previewDeployKey">
  >;
  readonly listPreviewDeployKeys: (
    projectId: number,
    query?: Query<"list preview deploy keys">,
  ) => ResponseEffect<
    Omit<Api.PlatformListPreviewDeployKeysResponse, "items"> & {
      items: DeployKey[];
    }
  >;
  readonly deletePreviewDeployKey: (
    projectId: number,
    body: SecretInput<Api.PlatformDeletePreviewDeployKeyArgs, "id">,
  ) => ResponseEffect<void>;
  readonly listPersonalAccessTokens: (
    query?: Query<"list personal access tokens">,
  ) => ResponseEffect<Api.PaginatedPersonalAccessTokensResponse>;
  readonly streamPersonalAccessTokens: (
    query?: Query<"list personal access tokens">,
  ) => ItemStream<Api.PersonalAccessTokenResponse>;
  readonly createPersonalAccessToken: (
    body: Api.CreatePersonalAccessTokenArgs,
  ) => ResponseEffect<
    WithSecret<Api.CreatePersonalAccessTokenResponse, "accessToken">
  >;
  readonly deletePersonalAccessToken: (
    body: SecretInput<Api.DeletePersonalAccessTokenArgs, "id">,
  ) => ResponseEffect<void>;
  readonly listTeamAccessTokens: (
    teamId: number,
    query?: Query<"list team access tokens">,
  ) => ResponseEffect<Api.ListTeamAccessTokensResponse>;
  readonly streamTeamAccessTokens: (
    teamId: number,
    query?: Query<"list team access tokens">,
  ) => ItemStream<Api.TeamAccessTokenResponse>;
  readonly deleteTeamAccessToken: (
    teamId: number,
    body: SecretInput<Api.DeleteTeamAccessTokenArgs, "id">,
  ) => ResponseEffect<void>;
  readonly getTokenDetails: ResponseEffect<Api.PlatformTokenDetailsResponse>;
  readonly createCustomDomain: (
    name: string,
    body: Api.PlatformDeleteCustomDomainArgs,
  ) => ResponseEffect<void>;
  readonly deleteCustomDomain: (
    name: string,
    body: Api.PlatformDeleteCustomDomainArgs,
  ) => ResponseEffect<void>;
  readonly listCustomDomains: (
    name: string,
  ) => ResponseEffect<Api.PlatformListCustomDomainsResponse>;
  readonly listTeamMembers: (
    teamId: number,
  ) => ResponseEffect<Api.PlatformListTeamMembersResponse>;
  readonly createTeam: (
    body: Api.PlatformCreateTeamArgs,
  ) => ResponseEffect<
    Api.TeamResponse,
    PlatformError.InvalidTeamConfiguration | PlatformError.TeamCreationForbidden
  >;
  readonly createTeamAccessToken: (
    teamId: number,
    body?: Api.CreateTeamAccessTokenArgs | null,
  ) => ResponseEffect<
    WithSecret<Api.CreateTeamAccessTokenResponse, "accessToken">,
    PlatformError.TeamAccessTokenForbidden
  >;
  readonly listAuditLogEvents: (
    teamId: number,
    query: Query<"list audit log events">,
  ) => ResponseEffect<Api.ListAuditLogEventsResponse>;
  readonly streamAuditLogEvents: (
    teamId: number,
    query: Query<"list audit log events">,
  ) => ItemStream<Api.AuditLogEventResponse>;
  readonly inviteTeamMember: (
    teamId: number,
    body: Api.CreateInvitationArgs,
  ) => ResponseEffect<void>;
  readonly listPendingTeamInvites: (
    teamId: number,
  ) => ResponseEffect<Api.PlatformListInvitationsResponse>;
  readonly cancelTeamMemberInvite: (
    teamId: number,
    body: Api.CancelInvitationArgs,
  ) => ResponseEffect<void>;
  readonly listDefaultEnvironmentVariables: (
    projectId: number,
    query?: Query<"list default environment variables">,
  ) => ResponseEffect<
    Omit<Api.PaginatedDefaultEnvironmentVariablesResponse, "items"> & {
      items: WithSecret<Api.DefaultEnvironmentVariableResponse, "value">[];
    }
  >;
  readonly updateDefaultEnvironmentVariables: (
    projectId: number,
    body: UpdateDefaultEnvironmentVariablesInput,
  ) => ResponseEffect<void>;
  readonly createCustomRole: (
    teamId: number,
    body: Api.CreateCustomRoleArgs,
  ) => ResponseEffect<Api.CustomRoleResponse>;
  readonly listCustomRoles: (
    teamId: number,
    query?: Query<"list custom roles">,
  ) => ResponseEffect<Api.ListCustomRolesResponse>;
  readonly streamCustomRoles: (
    teamId: number,
    query?: Query<"list custom roles">,
  ) => ItemStream<Api.CustomRoleResponse>;
  readonly updateCustomRole: (
    teamId: number,
    body: Api.UpdateCustomRoleArgs,
  ) => ResponseEffect<Api.CustomRoleResponse>;
  readonly deleteCustomRole: (
    teamId: number,
    body: Api.DeleteCustomRoleArgs,
  ) => ResponseEffect<void>;
  readonly updateTeamMemberRole: (
    teamId: number,
    body: Api.UpdateTeamMemberRoleArgs,
  ) => ResponseEffect<void>;
}

const credentialBody = (input: {
  readonly id: string | Redacted.Redacted<string>;
}) => ({
  get id() {
    return Redacted.isRedacted(input.id) ? Redacted.value(input.id) : input.id;
  },
});

const streamItems = <Q extends { cursor?: string | null }, A, E>(
  operation: string,
  query: Q,
  list: (
    query: Q,
  ) => Effect.Effect<
    { items: ReadonlyArray<A>; pagination: Api.PaginationMetadata },
    E
  >,
) =>
  Pagination.stream(
    operation,
    query.cursor ?? undefined,
    (cursor) => list(cursor === undefined ? query : { ...query, cursor }),
    (page) => page.items,
  );

export const make = (
  token: Redacted.Redacted<string>,
  options?: Options,
): Service => {
  const sdk = token.pipe(Redacted.value, createManagementClient);
  const { request } = Client.make<Api.paths>(
    sdk,
    management,
    options?.fetch,
    options?.baseUrl,
  );

  const listProjects: Service["listProjects"] = (teamId, query = {}) =>
    request("listProjects", "get", "/teams/{team_id}/projects", {
      params: { path: { team_id: teamId }, query },
    });

  const listTeamDeployments: Service["listTeamDeployments"] = (
    teamId,
    query = {},
  ) =>
    request("listTeamDeployments", "get", "/teams/{team_id}/list_deployments", {
      params: { path: { team_id: teamId }, query },
    });

  const listPersonalAccessTokens: Service["listPersonalAccessTokens"] = (
    query = {},
  ) =>
    request("listPersonalAccessTokens", "get", "/list_personal_access_tokens", {
      params: { query },
    });

  const listTeamAccessTokens: Service["listTeamAccessTokens"] = (
    teamId,
    query = {},
  ) =>
    request(
      "listTeamAccessTokens",
      "get",
      "/teams/{team_id}/list_access_tokens",
      { params: { path: { team_id: teamId }, query } },
    );

  const listAuditLogEvents: Service["listAuditLogEvents"] = (teamId, query) =>
    request(
      "listAuditLogEvents",
      "get",
      "/teams/{team_id}/list_audit_log_events",
      { params: { path: { team_id: teamId }, query } },
    );

  const listCustomRoles: Service["listCustomRoles"] = (teamId, query = {}) =>
    request("listCustomRoles", "get", "/teams/{team_id}/list_custom_roles", {
      params: { path: { team_id: teamId }, query },
    });

  return {
    createProject: (teamId, body) =>
      request("createProject", "post", "/teams/{team_id}/create_project", {
        params: { path: { team_id: teamId } },
        body,
      }),
    getProject: (projectId) =>
      request("getProject", "get", "/projects/{project_id}", {
        params: { path: { project_id: projectId } },
      }),
    updateProject: (projectId, body) =>
      request("updateProject", "patch", "/projects/{project_id}", {
        params: { path: { project_id: projectId } },
        body,
      }),
    listProjects,
    streamProjects: (teamId, query = {}) =>
      streamItems("listProjects", query, (next) => listProjects(teamId, next)),
    listDeployments: (projectId, query = {}) =>
      request(
        "listDeployments",
        "get",
        "/projects/{project_id}/list_deployments",
        { params: { path: { project_id: projectId }, query } },
      ),
    getProjectDeployment: (projectId, query = {}) =>
      request(
        "getProjectDeployment",
        "get",
        "/projects/{project_id}/deployment",
        { params: { path: { project_id: projectId }, query } },
      ),
    getProjectDeploymentBySlug: (teamIdOrSlug, projectSlug, query = {}) =>
      request(
        "getProjectDeploymentBySlug",
        "get",
        "/teams/{team_id_or_slug}/projects/{project_slug}/deployment",
        {
          params: {
            path: { team_id_or_slug: teamIdOrSlug, project_slug: projectSlug },
            query,
          },
        },
      ),
    deleteProject: (projectId) =>
      request("deleteProject", "post", "/projects/{project_id}/delete", {
        params: { path: { project_id: projectId } },
      }),
    getProjectBySlug: (teamIdOrSlug, projectSlug) =>
      request(
        "getProjectBySlug",
        "get",
        "/teams/{team_id_or_slug}/projects/{project_slug}",
        {
          params: {
            path: { team_id_or_slug: teamIdOrSlug, project_slug: projectSlug },
          },
        },
      ),
    createDeployment: (projectId, body) =>
      request(
        "createDeployment",
        "post",
        "/projects/{project_id}/create_deployment",
        { params: { path: { project_id: projectId } }, body },
      ),
    deleteDeployment: (name) =>
      request(
        "deleteDeployment",
        "post",
        "/deployments/{deployment_name}/delete",
        { params: { path: { deployment_name: name } } },
      ),
    getDeployment: (name) =>
      request("getDeployment", "get", "/deployments/{deployment_name}", {
        params: { path: { deployment_name: name } },
      }),
    updateDeployment: (name, body) =>
      request("updateDeployment", "patch", "/deployments/{deployment_name}", {
        params: { path: { deployment_name: name } },
        body,
      }),
    transferDeployment: (name, body) =>
      request(
        "transferDeployment",
        "post",
        "/deployments/{deployment_name}/transfer",
        { params: { path: { deployment_name: name } }, body },
      ),
    listDeploymentClasses: (teamId) =>
      request(
        "listDeploymentClasses",
        "get",
        "/teams/{team_id}/list_deployment_classes",
        { params: { path: { team_id: String(teamId) } } },
      ),
    listDeploymentRegions: (teamId) =>
      request(
        "listDeploymentRegions",
        "get",
        "/teams/{team_id}/list_deployment_regions",
        { params: { path: { team_id: String(teamId) } } },
      ),
    listTeamDeployments,
    streamTeamDeployments: (teamId, query = {}) =>
      streamItems("listTeamDeployments", query, (next) =>
        listTeamDeployments(teamId, next),
      ),
    listLocalTeamDeployments: (teamId) =>
      request(
        "listLocalTeamDeployments",
        "get",
        "/teams/{team_id}/list_local_deployments",
        { params: { path: { team_id: teamId } } },
      ),
    mintAiGatewayJwt: (name, body) =>
      request(
        "mintAiGatewayJwt",
        "post",
        "/deployments/{deployment_name}/mint_ai_gateway_jwt",
        { params: { path: { deployment_name: name } }, body },
      ).pipe(Effect.map(({ token: jwt }) => ({ token: Redacted.make(jwt) }))),
    createDeployKey: (name, body) =>
      request(
        "createDeployKey",
        "post",
        "/deployments/{deployment_name}/create_deploy_key",
        { params: { path: { deployment_name: name } }, body },
      ).pipe(
        Effect.map(({ deployKey }) => ({
          deployKey: Redacted.make(deployKey),
        })),
      ),
    listDeployKeys: (name) =>
      request(
        "listDeployKeys",
        "get",
        "/deployments/{deployment_name}/list_deploy_keys",
        { params: { path: { deployment_name: name } } },
      ),
    deleteDeployKey: (name, body) =>
      request(
        "deleteDeployKey",
        "post",
        "/deployments/{deployment_name}/delete_deploy_key",
        {
          params: { path: { deployment_name: name } },
          body: credentialBody(body),
        },
      ),
    createPreviewDeployKey: (projectId, body) =>
      request(
        "createPreviewDeployKey",
        "post",
        "/projects/{project_id}/create_preview_deploy_key",
        { params: { path: { project_id: projectId } }, body },
      ).pipe(
        Effect.map(({ previewDeployKey }) => ({
          previewDeployKey: Redacted.make(previewDeployKey),
        })),
      ),
    listPreviewDeployKeys: (projectId, query = {}) =>
      request(
        "listPreviewDeployKeys",
        "get",
        "/projects/{project_id}/list_preview_deploy_keys",
        { params: { path: { project_id: projectId }, query } },
      ),
    deletePreviewDeployKey: (projectId, body) =>
      request(
        "deletePreviewDeployKey",
        "post",
        "/projects/{project_id}/delete_preview_deploy_key",
        {
          params: { path: { project_id: projectId } },
          body: credentialBody(body),
        },
      ),
    listPersonalAccessTokens,
    streamPersonalAccessTokens: (query = {}) =>
      streamItems("listPersonalAccessTokens", query, listPersonalAccessTokens),
    createPersonalAccessToken: (body) =>
      request(
        "createPersonalAccessToken",
        "post",
        "/create_personal_access_token",
        { body },
      ).pipe(
        Effect.map(({ accessToken }) => ({
          accessToken: Redacted.make(accessToken),
        })),
      ),
    deletePersonalAccessToken: (body) =>
      request(
        "deletePersonalAccessToken",
        "post",
        "/delete_personal_access_token",
        { body: credentialBody(body) },
      ),
    listTeamAccessTokens,
    streamTeamAccessTokens: (teamId, query = {}) =>
      streamItems("listTeamAccessTokens", query, (next) =>
        listTeamAccessTokens(teamId, next),
      ),
    deleteTeamAccessToken: (teamId, body) =>
      request(
        "deleteTeamAccessToken",
        "post",
        "/teams/{team_id}/delete_access_token",
        { params: { path: { team_id: teamId } }, body: credentialBody(body) },
      ),
    getTokenDetails: request("getTokenDetails", "get", "/token_details"),
    createCustomDomain: (name, body) =>
      request(
        "createCustomDomain",
        "post",
        "/deployments/{deployment_name}/create_custom_domain",
        { params: { path: { deployment_name: name } }, body },
      ),
    deleteCustomDomain: (name, body) =>
      request(
        "deleteCustomDomain",
        "post",
        "/deployments/{deployment_name}/delete_custom_domain",
        { params: { path: { deployment_name: name } }, body },
      ),
    listCustomDomains: (name) =>
      request(
        "listCustomDomains",
        "get",
        "/deployments/{deployment_name}/custom_domains",
        { params: { path: { deployment_name: name } } },
      ),
    listTeamMembers: (teamId) =>
      request("listTeamMembers", "get", "/teams/{team_id}/list_members", {
        params: { path: { team_id: String(teamId) } },
      }),
    createTeam: (body) =>
      request("createTeam", "post", "/teams/create_team", { body }).pipe(
        Effect.mapError(Client.forCreateTeam),
      ),
    createTeamAccessToken: (teamId, body) =>
      request(
        "createTeamAccessToken",
        "post",
        "/teams/{team_id}/create_access_token",
        {
          params: { path: { team_id: teamId } },
          ...(body === undefined ? {} : { body }),
        },
      ).pipe(
        Effect.mapBoth({
          onFailure: Client.forCreateTeamAccessToken,
          onSuccess: ({ accessToken, tokenType }) => ({
            accessToken: Redacted.make(accessToken),
            tokenType,
          }),
        }),
      ),
    listAuditLogEvents,
    streamAuditLogEvents: (teamId, query) =>
      streamItems("listAuditLogEvents", query, (next) =>
        listAuditLogEvents(teamId, next),
      ),
    inviteTeamMember: (teamId, body) =>
      request(
        "inviteTeamMember",
        "post",
        "/teams/{team_id}/invite_team_member",
        { params: { path: { team_id: String(teamId) } }, body },
      ),
    listPendingTeamInvites: (teamId) =>
      request(
        "listPendingTeamInvites",
        "get",
        "/teams/{team_id}/list_pending_invites",
        { params: { path: { team_id: String(teamId) } } },
      ),
    cancelTeamMemberInvite: (teamId, body) =>
      request(
        "cancelTeamMemberInvite",
        "post",
        "/teams/{team_id}/cancel_team_member_invite",
        { params: { path: { team_id: String(teamId) } }, body },
      ),
    listDefaultEnvironmentVariables: (projectId, query = {}) =>
      request(
        "listDefaultEnvironmentVariables",
        "get",
        "/projects/{project_id}/list_default_environment_variables",
        { params: { path: { project_id: projectId }, query } },
      ).pipe(
        Effect.map(({ items, pagination }) => ({
          items: Arr.map(items, ({ name, value, deploymentTypes }) => ({
            name,
            value: Redacted.make(value),
            deploymentTypes,
          })),
          pagination,
        })),
      ),
    updateDefaultEnvironmentVariables: (projectId, body) =>
      request(
        "updateDefaultEnvironmentVariables",
        "post",
        "/projects/{project_id}/update_default_environment_variables",
        {
          params: { path: { project_id: projectId } },
          get body() {
            return {
              changes: Arr.map(body.changes, ({ value, ...change }) =>
                value === undefined
                  ? change
                  : {
                      ...change,
                      value: Redacted.isRedacted(value)
                        ? Redacted.value(value)
                        : value,
                    },
              ),
            };
          },
        },
      ),
    createCustomRole: (teamId, body) =>
      request(
        "createCustomRole",
        "post",
        "/teams/{team_id}/create_custom_role",
        { params: { path: { team_id: teamId } }, body },
      ),
    listCustomRoles,
    streamCustomRoles: (teamId, query = {}) =>
      streamItems("listCustomRoles", query, (next) =>
        listCustomRoles(teamId, next),
      ),
    updateCustomRole: (teamId, body) =>
      request(
        "updateCustomRole",
        "post",
        "/teams/{team_id}/update_custom_role",
        { params: { path: { team_id: teamId } }, body },
      ),
    deleteCustomRole: (teamId, body) =>
      request(
        "deleteCustomRole",
        "post",
        "/teams/{team_id}/delete_custom_role",
        { params: { path: { team_id: teamId } }, body },
      ),
    updateTeamMemberRole: (teamId, body) =>
      request(
        "updateTeamMemberRole",
        "post",
        "/teams/{team_id}/update_team_member_role",
        { params: { path: { team_id: teamId } }, body },
      ),
  };
};

export class ManagementClient extends Context.Service<
  ManagementClient,
  Service
>()("@confect/platform/ManagementClient") {}

export const layer = (token: Redacted.Redacted<string>, options?: Options) =>
  Layer.sync(ManagementClient, () => make(token, options));
