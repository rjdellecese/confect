import type { ManagementApi } from "@confect/platform";
import * as DeploymentClient from "@confect/platform/DeploymentClient";
import * as ManagementClient from "@confect/platform/ManagementClient";
import type {
  InvalidPagination,
  RequestFailure,
} from "@confect/platform/PlatformError";
import * as Config from "effect/Config";
import * as Stream from "effect/Stream";
import * as Str from "effect/String";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

export type Project = ManagementApi.ProjectResponse;
export type CreatedProject = ManagementApi.PlatformCreateProjectResponse;
export type Deployment = ManagementApi.PlatformDeploymentResponse;
export type DeployKey = ManagementClient.DeployKey;
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
export type CreatedDeployKey = Readonly<
  Effect.Success<ReturnType<ManagementClient.Service["createDeployKey"]>>
>;
export type EnvironmentVariableChange =
  DeploymentClient.UpdateEnvironmentVariablesInput["changes"][number];
export type EnvironmentVariables = Readonly<
  Effect.Success<
    DeploymentClient.Service["listEnvironmentVariables"]
  >["environmentVariables"]
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

const clientError = (
  error: RequestFailure | InvalidPagination,
): ConvexClientError => {
  const fields = {
    operation: error.operation,
    code: error._tag,
    ...("status" in error ? { status: error.status } : {}),
  };
  if (error._tag === "HttpError" && error.status === 404)
    return ConvexNotFound.make(fields);
  if (error._tag === "HttpError" && error.status === 409)
    return ConvexConflict.make(fields);
  return ConvexApiError.make(fields);
};

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

  const scopedFetch = Effect.context<never>().pipe(
    Effect.map((current) => {
      const context = Context.merge(defaults, current);
      const transport = Context.get(context, FetchHttpClient.Fetch);
      const init = Context.getOrUndefined(context, FetchHttpClient.RequestInit);
      return (request: Request) => {
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
        });
      };
    }),
  );

  const management = Effect.fn("ConvexClient.management")(function* <A>(
    request: (
      client: ManagementClient.Service,
    ) => Effect.Effect<A, RequestFailure | InvalidPagination>,
  ) {
    const token = yield* managementToken;
    const fetch = yield* scopedFetch;
    const client = ManagementClient.make(token, {
      baseUrl: "https://api.convex.dev/v1",
      fetch,
    });
    return yield* request(client).pipe(Effect.mapError(clientError));
  });

  const deployment = Effect.fn("ConvexClient.deployment")(function* (
    operation: string,
    url: string,
    key: Redacted.Redacted<string>,
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
    return DeploymentClient.make(parsed.origin, key, {
      fetch: yield* scopedFetch,
    });
  });

  return {
    listProjects: Effect.fn("ConvexClient.listProjects")((teamId: number) =>
      management((client) => Stream.runCollect(client.streamProjects(teamId))),
    ),
    getProject: Effect.fn("ConvexClient.getProject")((projectId: number) =>
      management((client) => client.getProject(projectId)),
    ),
    createProject: Effect.fn("ConvexClient.createProject")(
      (teamId: number, input: CreateProjectInput) =>
        management((client) => client.createProject(teamId, input)),
    ),
    updateProject: Effect.fn("ConvexClient.updateProject")(
      (projectId: number, input: UpdateProjectInput) =>
        management((client) => client.updateProject(projectId, input)),
    ),
    deleteProject: Effect.fn("ConvexClient.deleteProject")(
      (projectId: number) =>
        management((client) => client.deleteProject(projectId)),
    ),
    listDeployments: Effect.fn("ConvexClient.listDeployments")(
      (
        projectId: number,
      ): Effect.Effect<readonly Deployment[], ConvexClientError> =>
        management((client) => client.listDeployments(projectId)),
    ),
    getDeployment: Effect.fn("ConvexClient.getDeployment")((name: string) =>
      management((client) => client.getDeployment(name)),
    ),
    createDeployment: Effect.fn("ConvexClient.createDeployment")(
      (projectId: number, input: CreateDeploymentInput) =>
        management((client) => client.createDeployment(projectId, input)),
    ),
    updateDeployment: Effect.fn("ConvexClient.updateDeployment")(
      (name: string, input: UpdateDeploymentInput) =>
        management((client) => client.updateDeployment(name, input)),
    ),
    deleteDeployment: Effect.fn("ConvexClient.deleteDeployment")(
      (name: string) => management((client) => client.deleteDeployment(name)),
    ),
    createDeployKey: Effect.fn("ConvexClient.createDeployKey")(
      (
        name: string,
        input: CreateDeployKeyInput,
      ): Effect.Effect<CreatedDeployKey, ConvexClientError> =>
        management((client) => client.createDeployKey(name, input)),
    ),
    listDeployKeys: Effect.fn("ConvexClient.listDeployKeys")(
      (name: string): Effect.Effect<readonly DeployKey[], ConvexClientError> =>
        management((client) => client.listDeployKeys(name)),
    ),
    deleteDeployKey: Effect.fn("ConvexClient.deleteDeployKey")(
      (name: string, id: string | Redacted.Redacted<string>) =>
        management((client) => client.deleteDeployKey(name, { id })),
    ),
    listEnvironmentVariables: Effect.fn(
      "ConvexClient.listEnvironmentVariables",
    )(function* (
      url: string,
      key: Redacted.Redacted<string>,
    ): Effect.fn.Return<EnvironmentVariables, ConvexClientError> {
      const client = yield* deployment("listEnvironmentVariables", url, key);
      const result = yield* client.listEnvironmentVariables.pipe(
        Effect.mapError(clientError),
      );
      return result.environmentVariables;
    }),
    updateEnvironmentVariables: Effect.fn(
      "ConvexClient.updateEnvironmentVariables",
    )(function* (
      url: string,
      key: Redacted.Redacted<string>,
      changes: readonly EnvironmentVariableChange[],
    ) {
      const client = yield* deployment("updateEnvironmentVariables", url, key);
      yield* client
        .updateEnvironmentVariables({ changes })
        .pipe(Effect.mapError(clientError));
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
