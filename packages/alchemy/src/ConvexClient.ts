import type { DeploymentApi, ManagementApi } from "@confect/platform";
import * as DeploymentClient from "@confect/platform/DeploymentClient";
import * as ManagementClient from "@confect/platform/ManagementClient";
import type { PlatformError } from "@confect/platform/PlatformError";
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
  const defaults = yield* Effect.context<never>().pipe(
    Effect.map(
      Context.pick(FetchHttpClient.Fetch, FetchHttpClient.RequestInit),
    ),
  );
  const managementToken =
    options?.token === undefined
      ? Config.Redacted("CONVEX_ACCESS_TOKEN").pipe(
          Effect.mapError(() =>
            ConvexApiError.make({
              operation: "configure",
              code: "InvalidConfiguration",
            }),
          ),
        )
      : Effect.succeed(options.token);

  type Fetch = (request: Request) => Promise<Response>;
  const send = Effect.fn("ConvexClient.request")(function* <A>(
    operation: string,
    invoke: (fetch: Fetch) => Effect.Effect<unknown, PlatformError>,
    schema: Schema.Decoder<A>,
  ) {
    const current = yield* Effect.context<never>();
    const context = Context.merge(defaults, current);
    const transport = Context.get(context, FetchHttpClient.Fetch);
    const init = Context.getOrUndefined(context, FetchHttpClient.RequestInit);
    let status: number | undefined;
    const data = yield* invoke((request) => {
      const headers = new Headers(init?.headers);
      headers.set("accept", "application/json");
      request.headers.forEach((value, key) => headers.set(key, value));
      headers.delete("content-length");
      return transport(request, {
        ...init,
        method: request.method,
        body: null,
        headers,
        signal: request.signal,
        redirect: "manual",
      }).then((response) => {
        status = response.status;
        if (
          response.ok &&
          schema.ast._tag === "Void" &&
          response.body !== null
        ) {
          void response.body.cancel().catch(() => undefined);
          return new Response(null, { status });
        }
        return response;
      });
    }).pipe(
      Effect.mapError((error) => {
        const fields = {
          operation,
          code: error.code,
          ...(error.status === undefined ? {} : { status: error.status }),
        };
        if (error.code === "HttpError" && error.status === 404)
          return ConvexNotFound.make(fields);
        if (error.code === "HttpError" && error.status === 409)
          return ConvexConflict.make(fields);
        return ConvexApiError.make(fields);
      }),
    );
    return yield* Schema.decodeUnknownEffect(schema)(data).pipe(
      Effect.mapError(() =>
        ConvexApiError.make({
          operation,
          code: "InvalidResponse",
          ...(status === undefined ? {} : { status }),
        }),
      ),
    );
  });

  const management = Effect.fn("ConvexClient.management")(function* <A>(
    operation: string,
    request: (
      client: ReturnType<typeof ManagementClient.make>,
    ) => Effect.Effect<unknown, PlatformError>,
    schema: Schema.Decoder<A>,
  ) {
    const token = yield* managementToken;
    return yield* send(
      operation,
      (fetch) =>
        request(
          ManagementClient.make(token, {
            baseUrl: "https://api.convex.dev/v1",
            fetch,
          }),
        ),
      schema,
    );
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
    return parsed.origin;
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
          (client) =>
            client.request("get", "/teams/{team_id}/projects", {
              params: {
                path: { team_id: teamId },
                query: cursor === undefined ? {} : { cursor },
              },
            }),
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
      management(
        "getProject",
        (client) =>
          client.request("get", "/projects/{project_id}", {
            params: { path: { project_id: projectId } },
          }),
        ProjectSchema,
      ),
    ),
    createProject: Effect.fn("ConvexClient.createProject")(
      (teamId: number, input: CreateProjectInput) =>
        management(
          "createProject",
          (client) =>
            client.request("post", "/teams/{team_id}/create_project", {
              params: { path: { team_id: teamId } },
              body: input,
            }),
          CreatedProjectSchema,
        ),
    ),
    updateProject: Effect.fn("ConvexClient.updateProject")(
      (projectId: number, input: UpdateProjectInput) =>
        management(
          "updateProject",
          (client) =>
            client.request("patch", "/projects/{project_id}", {
              params: { path: { project_id: projectId } },
              body: input,
            }),
          ProjectSchema,
        ),
    ),
    deleteProject: Effect.fn("ConvexClient.deleteProject")(
      (projectId: number) =>
        management(
          "deleteProject",
          (client) =>
            client.request("post", "/projects/{project_id}/delete", {
              params: { path: { project_id: projectId } },
            }),
          Schema.Void,
        ),
    ),
    listDeployments: Effect.fn("ConvexClient.listDeployments")(
      (projectId: number) =>
        management(
          "listDeployments",
          (client) =>
            client.request("get", "/projects/{project_id}/list_deployments", {
              params: { path: { project_id: projectId } },
            }),
          Schema.Array(DeploymentSchema),
        ),
    ),
    getDeployment: Effect.fn("ConvexClient.getDeployment")((name: string) =>
      management(
        "getDeployment",
        (client) =>
          client.request("get", "/deployments/{deployment_name}", {
            params: { path: { deployment_name: name } },
          }),
        DeploymentSchema,
      ),
    ),
    createDeployment: Effect.fn("ConvexClient.createDeployment")(
      (projectId: number, input: CreateDeploymentInput) =>
        management(
          "createDeployment",
          (client) =>
            client.request("post", "/projects/{project_id}/create_deployment", {
              params: { path: { project_id: projectId } },
              body: input,
            }),
          DeploymentSchema,
        ),
    ),
    updateDeployment: Effect.fn("ConvexClient.updateDeployment")(
      (name: string, input: UpdateDeploymentInput) =>
        management(
          "updateDeployment",
          (client) =>
            client.request("patch", "/deployments/{deployment_name}", {
              params: { path: { deployment_name: name } },
              body: input,
            }),
          Schema.Void,
        ),
    ),
    deleteDeployment: Effect.fn("ConvexClient.deleteDeployment")(
      (name: string) =>
        management(
          "deleteDeployment",
          (client) =>
            client.request("post", "/deployments/{deployment_name}/delete", {
              params: { path: { deployment_name: name } },
            }),
          Schema.Void,
        ),
    ),
    createDeployKey: Effect.fn("ConvexClient.createDeployKey")(function* (
      name: string,
      input: CreateDeployKeyInput,
    ): Effect.fn.Return<CreatedDeployKey, ConvexClientError> {
      const response = yield* management(
        "createDeployKey",
        (client) =>
          client.request(
            "post",
            "/deployments/{deployment_name}/create_deploy_key",
            {
              params: { path: { deployment_name: name } },
              body: input,
            },
          ),
        Schema.Struct({ deployKey: Schema.String }),
      );
      return { deployKey: Redacted.make(response.deployKey) };
    }),
    listDeployKeys: Effect.fn("ConvexClient.listDeployKeys")((name: string) =>
      management(
        "listDeployKeys",
        (client) =>
          client.request(
            "get",
            "/deployments/{deployment_name}/list_deploy_keys",
            {
              params: { path: { deployment_name: name } },
            },
          ),
        Schema.Array(DeployKeySchema),
      ),
    ),
    deleteDeployKey: Effect.fn("ConvexClient.deleteDeployKey")(
      (name: string, id: string | Redacted.Redacted<string>) =>
        management(
          "deleteDeployKey",
          (client) =>
            client.request(
              "post",
              "/deployments/{deployment_name}/delete_deploy_key",
              {
                params: { path: { deployment_name: name } },
                body: { id: Redacted.isRedacted(id) ? Redacted.value(id) : id },
              },
            ),
          Schema.Void,
        ),
    ),
    listEnvironmentVariables: Effect.fn(
      "ConvexClient.listEnvironmentVariables",
    )(function* (
      url: string,
      key: Redacted.Redacted<string>,
    ): Effect.fn.Return<EnvironmentVariables, ConvexClientError> {
      const base = yield* deploymentUrl("listEnvironmentVariables", url);
      const result = yield* send(
        "listEnvironmentVariables",
        (fetch) =>
          DeploymentClient.make(base, key, { fetch }).request(
            "get",
            "/list_environment_variables",
          ),
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
        (fetch) =>
          DeploymentClient.make(base, key, { fetch }).request(
            "post",
            "/update_environment_variables",
            {
              body: {
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
              },
            },
          ),
        Schema.Void,
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
