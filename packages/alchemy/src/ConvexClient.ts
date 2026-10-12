import type * as DeploymentApi from "@convex-dev/platform/deploymentApi";
import type * as ManagementApi from "@convex-dev/platform/managementApi";
import * as Config from "effect/Config";
import * as Arr from "effect/Array";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";

export type Project = ManagementApi.ProjectResponse;
export type CreatedProject = ManagementApi.PlatformCreateProjectResponse;
export type Deployment = ManagementApi.PlatformDeploymentResponse;
export type DeployKey = Omit<
  ManagementApi.PlatformDeployKeyResponse,
  "allowedActions"
> & {
  readonly allowedActions: readonly string[];
};
export type CreateProjectInput = Pick<
  ManagementApi.PlatformCreateProjectArgs,
  "projectName"
>;
export type UpdateProjectInput = Pick<
  ManagementApi.PlatformUpdateProjectArgs,
  "name"
>;
export type CreateDeploymentInput = Pick<
  ManagementApi.PlatformCreateDeploymentArgs,
  "type" | "region" | "class"
> & { readonly reference: string };
export type UpdateDeploymentInput = Pick<
  ManagementApi.PlatformUpdateDeploymentArgs,
  "reference" | "expiresAt" | "sendLogsToClient"
>;
export type CreateDeployKeyInput = ManagementApi.PlatformCreateDeployKeyArgs;
export type CreatedDeployKey = {
  readonly deployKey: Redacted.Redacted<
    ManagementApi.PlatformCreateDeployKeyResponse["deployKey"]
  >;
};
export type EnvironmentVariableChange = Omit<
  DeploymentApi.UpdateEnvVarRequest,
  "value"
> & {
  readonly value?:
    | Exclude<DeploymentApi.UpdateEnvVarRequest["value"], undefined>
    | Redacted.Redacted<string>;
};
export type EnvironmentVariables = Readonly<
  Record<
    string,
    Redacted.Redacted<
      DeploymentApi.ListEnvVarsResponse["environmentVariables"][string]
    >
  >
>;

const errorFields = {
  operation: Schema.String,
  status: Schema.optionalKey(Schema.Finite),
  code: Schema.Literals([
    "HttpError",
    "TransportError",
    "InvalidResponse",
    "InvalidRequest",
    "InvalidPagination",
    "InvalidConfiguration",
  ]),
};

export class ConvexApiError extends Schema.TaggedError<
  ConvexApiError,
  { readonly brand: unique symbol }
>()("ConvexApiError", errorFields) {}

export class ConvexNotFound extends Schema.TaggedError<
  ConvexNotFound,
  { readonly brand: unique symbol }
>()("ConvexNotFound", errorFields) {}

export class ConvexConflict extends Schema.TaggedError<
  ConvexConflict,
  { readonly brand: unique symbol }
>()("ConvexConflict", errorFields) {}

export type ConvexClientError =
  | ConvexApiError
  | ConvexNotFound
  | ConvexConflict;

const ProjectSchema = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  slug: Schema.String,
  teamId: Schema.Finite,
  teamSlug: Schema.String,
  createTime: Schema.Finite,
  prodDeploymentName: Schema.String.pipe(Schema.NullOr, Schema.optionalKey),
  devDeploymentName: Schema.String.pipe(Schema.NullOr, Schema.optionalKey),
}) satisfies Schema.Schema<Project>;

const CreatedProjectSchema = Schema.Struct({
  id: Schema.Finite,
  projectId: Schema.Finite,
  slug: Schema.String,
  deploymentName: Schema.String.pipe(Schema.NullOr, Schema.optionalKey),
  deploymentUrl: Schema.String.pipe(Schema.NullOr, Schema.optionalKey),
}) satisfies Schema.Schema<CreatedProject>;

const deploymentFields = {
  name: Schema.String,
  createTime: Schema.Finite,
  deploymentType: Schema.Literals(["dev", "prod", "preview", "custom"]),
  projectId: Schema.Finite,
  previewIdentifier: Schema.String.pipe(Schema.NullOr, Schema.optionalKey),
};

const DeploymentSchema = Schema.Union([
  Schema.Struct({
    ...deploymentFields,
    kind: Schema.Literal("cloud"),
    id: Schema.Finite,
    lastDeployTime: Schema.Finite.pipe(Schema.NullOr, Schema.optionalKey),
    creator: Schema.Finite.pipe(Schema.NullOr, Schema.optionalKey),
    region: Schema.Literals([
      "aws-us-east-1",
      "aws-eu-west-1",
      "aws-ap-southeast-2",
      "aws-ca-central-1",
    ]),
    isDefault: Schema.Boolean,
    reference: Schema.String,
    dashboardEditConfirmation: Schema.Boolean.pipe(
      Schema.NullOr,
      Schema.optionalKey,
    ),
    deploymentUrl: Schema.String,
    expiresAt: Schema.Finite.pipe(Schema.NullOr, Schema.optionalKey),
    class: Schema.String,
    sendLogsToClient: Schema.Boolean.pipe(Schema.NullOr, Schema.optionalKey),
  }),
  Schema.Struct({
    ...deploymentFields,
    kind: Schema.Literal("local"),
    creator: Schema.Finite,
    port: Schema.Finite,
    deviceName: Schema.String,
    isActive: Schema.Boolean,
  }),
]) satisfies Schema.Schema<Deployment>;

const DeployKeySchema = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  creationTime: Schema.Finite,
  lastUsedTime: Schema.Finite.pipe(Schema.NullOr, Schema.optionalKey),
  expiresAt: Schema.Finite.pipe(Schema.NullOr, Schema.optionalKey),
  creator: Schema.Finite.pipe(Schema.NullOr, Schema.optionalKey),
  managedBy: Schema.Union([
    Schema.Literal("vercel"),
    Schema.Struct({ oauthApp: Schema.String }),
  ]).pipe(Schema.NullOr, Schema.optionalKey),
  allowedActions: Schema.Array(Schema.String),
}) satisfies Schema.Schema<DeployKey>;

const ProjectsPageSchema = Schema.Struct({
  items: Schema.Array(ProjectSchema),
  pagination: Schema.Struct({
    hasMore: Schema.Boolean,
    nextCursor: Schema.String.pipe(Schema.NullOr, Schema.optionalKey),
  }),
});

const make = Effect.fn("ConvexClient.make")(function* (options?: {
  readonly token?: Redacted.Redacted<string>;
}) {
  const http = yield* HttpClient.HttpClient;
  const managementAuthorization = Effect.gen(function* () {
    const token =
      options?.token ??
      (yield* Config.Redacted("CONVEX_ACCESS_TOKEN").pipe(
        Effect.mapError(() =>
          ConvexApiError.make({
            operation: "configure",
            code: "InvalidConfiguration",
          }),
        ),
      ));
    return Redacted.make(`Bearer ${Redacted.value(token)}`);
  });
  const baseUrl = "https://api.convex.dev/v1";

  const send = Effect.fn("ConvexClient.request")(function* (
    operation: string,
    method: "GET" | "POST" | "PATCH",
    url: string,
    authorization: Redacted.Redacted<string>,
    body?: unknown,
  ) {
    let request = HttpClientRequest.make(method)(url).pipe(
      HttpClientRequest.setHeader(
        "authorization",
        Redacted.value(authorization),
      ),
      HttpClientRequest.acceptJson,
    );
    if (body !== undefined) {
      request = yield* HttpClientRequest.bodyJson(request, body).pipe(
        Effect.mapError(() =>
          ConvexApiError.make({ operation, code: "InvalidRequest" }),
        ),
      );
    }
    const response = yield* http.execute(request).pipe(
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: "manual",
      }),
      Effect.mapError(() =>
        ConvexApiError.make({ operation, code: "TransportError" }),
      ),
    );
    if (response.status === 404) {
      return yield* ConvexNotFound.make({
        operation,
        status: 404,
        code: "HttpError",
      });
    }
    if (response.status === 409) {
      return yield* ConvexConflict.make({
        operation,
        status: 409,
        code: "HttpError",
      });
    }
    if (response.status < 200 || response.status >= 300) {
      return yield* ConvexApiError.make({
        operation,
        status: response.status,
        code: "HttpError",
      });
    }
    return response;
  });

  const decode = Effect.fn("ConvexClient.decode")(function* <A>(
    operation: string,
    response: HttpClientResponse.HttpClientResponse,
    schema: Schema.Decoder<A>,
  ) {
    const invalidResponse = () =>
      ConvexApiError.make({
        operation,
        status: response.status,
        code: "InvalidResponse",
      });
    const body = yield* response.json.pipe(Effect.mapError(invalidResponse));
    return yield* Schema.decodeEffect(schema)(body).pipe(
      Effect.mapError(invalidResponse),
    );
  });

  const management = Effect.fn("ConvexClient.management")(function* <A>(
    operation: string,
    method: "GET" | "POST" | "PATCH",
    path: string,
    schema: Schema.Decoder<A>,
    body?: unknown,
  ) {
    const authorization = yield* managementAuthorization;
    const response = yield* send(
      operation,
      method,
      `${baseUrl}${path}`,
      authorization,
      body,
    );
    return yield* decode(operation, response, schema);
  });

  const managementVoid = Effect.fn("ConvexClient.managementVoid")(function* (
    operation: string,
    method: "POST" | "PATCH",
    path: string,
    body?: unknown,
  ) {
    const authorization = yield* managementAuthorization;
    yield* send(operation, method, `${baseUrl}${path}`, authorization, body);
  });

  const deploymentUrl = Effect.fn("ConvexClient.deploymentUrl")(function* (
    operation: string,
    url: string,
  ) {
    const invalidUrl = () =>
      ConvexApiError.make({ operation, code: "InvalidRequest" });
    const parsed = yield* Effect.try({
      try: () => new URL(url),
      catch: invalidUrl,
    });
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.pathname !== "/" ||
      !/^[a-z0-9-]+(?:\.(?:eu-west-1|ap-southeast-2|ca-central-1))?\.convex\.cloud$/.test(
        parsed.hostname,
      ) ||
      Str.replace(/\/$/, "")(url) !== parsed.origin
    ) {
      return yield* invalidUrl();
    }
    return `${parsed.origin}/api/v1`;
  });

  return {
    listProjects: Effect.fn("ConvexClient.listProjects")(function* (
      teamId: number,
    ) {
      const projects: Project[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;
      while (true) {
        const page = yield* management(
          "listProjects",
          "GET",
          `/teams/${teamId}/projects${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
          ProjectsPageSchema,
        );
        projects.push(...page.items);
        if (!page.pagination.hasMore) return projects;
        const nextCursor = page.pagination.nextCursor;
        if (
          nextCursor === undefined ||
          nextCursor === null ||
          nextCursor === "" ||
          seenCursors.has(nextCursor)
        ) {
          return yield* ConvexApiError.make({
            operation: "listProjects",
            code: "InvalidPagination",
          });
        }
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      }
    }),
    getProject: Effect.fn("ConvexClient.getProject")((projectId: number) =>
      management("getProject", "GET", `/projects/${projectId}`, ProjectSchema),
    ),
    createProject: Effect.fn("ConvexClient.createProject")(
      (teamId: number, input: CreateProjectInput) =>
        management(
          "createProject",
          "POST",
          `/teams/${teamId}/create_project`,
          CreatedProjectSchema,
          input,
        ),
    ),
    updateProject: Effect.fn("ConvexClient.updateProject")(
      (projectId: number, input: UpdateProjectInput) =>
        management(
          "updateProject",
          "PATCH",
          `/projects/${projectId}`,
          ProjectSchema,
          input,
        ),
    ),
    deleteProject: Effect.fn("ConvexClient.deleteProject")(
      (projectId: number) =>
        managementVoid(
          "deleteProject",
          "POST",
          `/projects/${projectId}/delete`,
        ),
    ),
    listDeployments: Effect.fn("ConvexClient.listDeployments")(
      (projectId: number) =>
        management(
          "listDeployments",
          "GET",
          `/projects/${projectId}/list_deployments`,
          Schema.Array(DeploymentSchema),
        ),
    ),
    getDeployment: Effect.fn("ConvexClient.getDeployment")((name: string) =>
      management(
        "getDeployment",
        "GET",
        `/deployments/${encodeURIComponent(name)}`,
        DeploymentSchema,
      ),
    ),
    createDeployment: Effect.fn("ConvexClient.createDeployment")(
      (projectId: number, input: CreateDeploymentInput) =>
        management(
          "createDeployment",
          "POST",
          `/projects/${projectId}/create_deployment`,
          DeploymentSchema,
          input,
        ),
    ),
    updateDeployment: Effect.fn("ConvexClient.updateDeployment")(
      (name: string, input: UpdateDeploymentInput) =>
        managementVoid(
          "updateDeployment",
          "PATCH",
          `/deployments/${encodeURIComponent(name)}`,
          input,
        ),
    ),
    deleteDeployment: Effect.fn("ConvexClient.deleteDeployment")(
      (name: string) =>
        managementVoid(
          "deleteDeployment",
          "POST",
          `/deployments/${encodeURIComponent(name)}/delete`,
        ),
    ),
    createDeployKey: Effect.fn("ConvexClient.createDeployKey")(function* (
      name: string,
      input: CreateDeployKeyInput,
    ): Effect.fn.Return<CreatedDeployKey, ConvexClientError> {
      const response = yield* management(
        "createDeployKey",
        "POST",
        `/deployments/${encodeURIComponent(name)}/create_deploy_key`,
        Schema.Struct({ deployKey: Schema.String }),
        input,
      );
      return { deployKey: Redacted.make(response.deployKey) };
    }),
    listDeployKeys: Effect.fn("ConvexClient.listDeployKeys")((name: string) =>
      management(
        "listDeployKeys",
        "GET",
        `/deployments/${encodeURIComponent(name)}/list_deploy_keys`,
        Schema.Array(DeployKeySchema),
      ),
    ),
    deleteDeployKey: Effect.fn("ConvexClient.deleteDeployKey")(
      (name: string, id: string | Redacted.Redacted<string>) =>
        managementVoid(
          "deleteDeployKey",
          "POST",
          `/deployments/${encodeURIComponent(name)}/delete_deploy_key`,
          {
            id: Redacted.isRedacted(id) ? Redacted.value(id) : id,
          } satisfies ManagementApi.PlatformDeleteDeployKeyArgs,
        ),
    ),
    listEnvironmentVariables: Effect.fn(
      "ConvexClient.listEnvironmentVariables",
    )(function* (
      url: string,
      key: Redacted.Redacted<string>,
    ): Effect.fn.Return<EnvironmentVariables, ConvexClientError> {
      const base = yield* deploymentUrl("listEnvironmentVariables", url);
      const response = yield* send(
        "listEnvironmentVariables",
        "GET",
        `${base}/list_environment_variables`,
        Redacted.make(`Convex ${Redacted.value(key)}`),
      );
      const result = yield* decode(
        "listEnvironmentVariables",
        response,
        Schema.Struct({
          environmentVariables: Schema.Record(Schema.String, Schema.String),
        }),
      );
      return Rec.map(result.environmentVariables, (value) =>
        Redacted.make(value),
      );
    }),
    updateEnvironmentVariables: Effect.fn(
      "ConvexClient.updateEnvironmentVariables",
    )(function* (
      url: string,
      key: Redacted.Redacted<string>,
      changes: readonly EnvironmentVariableChange[],
    ) {
      const base = yield* deploymentUrl("updateEnvironmentVariables", url);
      yield* send(
        "updateEnvironmentVariables",
        "POST",
        `${base}/update_environment_variables`,
        Redacted.make(`Convex ${Redacted.value(key)}`),
        {
          changes: Arr.map(changes, ({ name, value }) => ({
            name,
            ...(value === undefined
              ? {}
              : {
                  value: Redacted.isRedacted(value)
                    ? Redacted.value(value)
                    : value,
                }),
          })),
        } satisfies {
          readonly changes: Readonly<
            DeploymentApi.UpdateEnvVarsRequest["changes"]
          >;
        },
      );
    }),
  };
});

export class ConvexClient extends Context.Service<
  ConvexClient,
  Effect.Success<ReturnType<typeof make>>
>()("@confect/alchemy/ConvexClient") {}

export const layer = (options?: {
  readonly token?: Redacted.Redacted<string>;
}) =>
  Layer.effect(ConvexClient, make(options).pipe(Effect.map(ConvexClient.of)));
