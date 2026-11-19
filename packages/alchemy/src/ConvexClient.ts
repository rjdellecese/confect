import {
  DeploymentClient,
  ManagementClient,
  type ManagementApi,
  type PlatformError,
} from "@confect/platform";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { cloudOrigin } from "./internal/Target.js";

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
export interface CreatedDeployKey {
  readonly deployKey: Redacted.Redacted<string>;
}
export type EnvironmentVariableChange =
  DeploymentClient.UpdateEnvironmentVariablesInput["changes"][number];
export type EnvironmentVariables = Readonly<
  Record<string, Redacted.Redacted<string>>
>;
interface Options {
  readonly token?: Redacted.Redacted<string>;
}

const failure = {
  operation: Schema.String,
  status: Schema.optionalKey(Schema.Int),
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
>()("ConvexApiError", failure) {
  override get message() {
    return `${this.operation} failed: ${this.code}${this.status === undefined ? "" : ` (${this.status})`}`;
  }
}
export class ConvexNotFound extends Schema.TaggedError<
  ConvexNotFound,
  { readonly brand: unique symbol }
>()("ConvexNotFound", failure) {
  override get message() {
    return `${this.operation} failed: ${this.code}${this.status === undefined ? "" : ` (${this.status})`}`;
  }
}
export class ConvexConflict extends Schema.TaggedError<
  ConvexConflict,
  { readonly brand: unique symbol }
>()("ConvexConflict", failure) {
  override get message() {
    return `${this.operation} failed: ${this.code}${this.status === undefined ? "" : ` (${this.status})`}`;
  }
}
export type ConvexClientError =
  | ConvexApiError
  | ConvexNotFound
  | ConvexConflict;
type Operation<A> = Effect.Effect<A, ConvexClientError>;

interface Service {
  readonly listProjects: (teamId: number) => Operation<Project[]>;
  readonly getProject: (id: number) => Operation<Project>;
  readonly createProject: (
    teamId: number,
    input: CreateProjectInput,
  ) => Operation<CreatedProject>;
  readonly updateProject: (
    id: number,
    input: UpdateProjectInput,
  ) => Operation<Project>;
  readonly deleteProject: (id: number) => Operation<void>;
  readonly listDeployments: (
    projectId: number,
  ) => Operation<ReadonlyArray<Deployment>>;
  readonly getDeployment: (name: string) => Operation<Deployment>;
  readonly createDeployment: (
    projectId: number,
    input: CreateDeploymentInput,
  ) => Operation<Deployment>;
  readonly updateDeployment: (
    name: string,
    input: UpdateDeploymentInput,
  ) => Operation<void>;
  readonly deleteDeployment: (name: string) => Operation<void>;
  readonly createDeployKey: (
    name: string,
    input: CreateDeployKeyInput,
  ) => Operation<CreatedDeployKey>;
  readonly listDeployKeys: (
    name: string,
  ) => Operation<ReadonlyArray<DeployKey>>;
  readonly deleteDeployKey: (
    name: string,
    id: string | Redacted.Redacted<string>,
  ) => Operation<void>;
  readonly listEnvironmentVariables: (
    url: string,
    key: Redacted.Redacted<string>,
  ) => Operation<EnvironmentVariables>;
  readonly updateEnvironmentVariables: (
    url: string,
    key: Redacted.Redacted<string>,
    changes: ReadonlyArray<EnvironmentVariableChange>,
  ) => Operation<void>;
}
export class ConvexClient extends Context.Service<ConvexClient, Service>()(
  "@confect/alchemy/ConvexClient",
) {}

const apiFailure = (
  operation: keyof Service,
  error: PlatformError.RequestFailure | PlatformError.InvalidPagination,
): ConvexClientError => {
  const fields = {
    operation,
    code: error._tag,
    ...("status" in error ? { status: error.status } : {}),
  };
  if (error._tag === "HttpError" && error.status === 404)
    return ConvexNotFound.make(fields);
  if (error._tag === "HttpError" && error.status === 409)
    return ConvexConflict.make(fields);
  return ConvexApiError.make(fields);
};

const credential = (
  value: Redacted.Redacted<string>,
  operation: keyof Service,
) =>
  Result.try({
    try: () => Redacted.value(value),
    catch: () => ConvexApiError.make({ operation, code: "InvalidRequest" }),
  }).pipe(
    Result.filterOrFail(
      (text) =>
        typeof text === "string" && text.length > 0 && !/\s/u.test(text),
      () => ConvexApiError.make({ operation, code: "InvalidRequest" }),
    ),
  );

export const layer = (options?: Options) =>
  Layer.effect(
    ConvexClient,
    Effect.gen(function* () {
      const fallbackFetch = yield* FetchHttpClient.Fetch;
      const fallbackConfig = yield* ConfigProvider.ConfigProvider;
      const construction = yield* Effect.context<never>();
      const defaults = Context.getOrUndefined(
        construction,
        FetchHttpClient.RequestInit,
      );
      const fetchForCall = Effect.contextWith((ctx: Context.Context<never>) => {
        const send =
          Context.getOrUndefined(ctx, FetchHttpClient.Fetch) ?? fallbackFetch;
        const scoped = Context.getOrUndefined(ctx, FetchHttpClient.RequestInit);
        const init = { ...defaults, ...scoped };
        return Effect.succeed((request: Request) => {
          const headers = new Headers(request.headers);
          for (const source of [defaults?.headers, scoped?.headers]) {
            new Headers(source).forEach((value, key) => {
              if (
                !request.headers.has(key) &&
                !/^(?:authorization|cookie2?|host|origin|referer|forwarded|connection|transfer-encoding|trailer|upgrade|expect|te|via)$|^(?:x-(?:http-method|method|original-url|rewrite-url|forwarded)|content-|sec-|proxy-)/iu.test(
                  key,
                )
              )
                headers.set(key, value);
            });
          }
          return send(new Request(request, { headers }), {
            ...(init.cache === undefined ? {} : { cache: init.cache }),
            ...(init.credentials === undefined
              ? {}
              : { credentials: init.credentials }),
            ...(init.keepalive === undefined
              ? {}
              : { keepalive: init.keepalive }),
            ...(init.mode === undefined ? {} : { mode: init.mode }),
            ...(init.priority === undefined ? {} : { priority: init.priority }),
            redirect: "manual",
          });
        });
      });
      const management = <A>(
        operation: keyof Service,
        perform: (
          c: ManagementClient.Service,
        ) => Effect.Effect<
          A,
          PlatformError.RequestFailure | PlatformError.InvalidPagination
        >,
      ) =>
        Effect.gen(function* () {
          const callContext = yield* Effect.context<never>();
          const token =
            options?.token ??
            (yield* Config.Redacted("CONVEX_ACCESS_TOKEN")
              .parse(
                Context.getOrUndefined(
                  callContext,
                  ConfigProvider.ConfigProvider,
                ) ?? fallbackConfig,
              )
              .pipe(
                Effect.mapError(() =>
                  ConvexApiError.make({
                    operation,
                    code: "InvalidConfiguration",
                  }),
                ),
              ));
          yield* Effect.fromResult(credential(token, operation));
          const fetch = yield* fetchForCall;
          return yield* perform(
            ManagementClient.make(token, {
              fetch,
              baseUrl: "https://api.convex.dev/v1",
            }),
          ).pipe(Effect.mapError((error) => apiFailure(operation, error)));
        });
      const deployment = <A>(
        operation: keyof Service,
        url: string,
        key: Redacted.Redacted<string>,
        perform: (
          c: DeploymentClient.Service,
        ) => Effect.Effect<A, PlatformError.RequestFailure>,
      ) =>
        Effect.gen(function* () {
          const origin = yield* Effect.fromResult(cloudOrigin(url)).pipe(
            Effect.mapError(() =>
              ConvexApiError.make({ operation, code: "InvalidRequest" }),
            ),
          );
          yield* Effect.fromResult(credential(key, operation));
          const fetch = yield* fetchForCall;
          return yield* perform(
            DeploymentClient.make(origin, key, { fetch }),
          ).pipe(Effect.mapError((error) => apiFailure(operation, error)));
        });
      return ConvexClient.of({
        listProjects: (id) =>
          management("listProjects", (c) =>
            Stream.runCollect(c.streamProjects(id)),
          ),
        getProject: (id) => management("getProject", (c) => c.getProject(id)),
        deleteProject: (id) =>
          management("deleteProject", (c) => c.deleteProject(id)),
        listDeployments: (id) =>
          management("listDeployments", (c) => c.listDeployments(id)),
        updateProject: (id, input) =>
          management("updateProject", (c) => c.updateProject(id, input)),
        createProject: (id, input) =>
          management("createProject", (c) => c.createProject(id, input)),
        createDeployment: (id, input) =>
          management("createDeployment", (c) => c.createDeployment(id, input)),
        getDeployment: (name) =>
          management("getDeployment", (c) => c.getDeployment(name)),
        deleteDeployment: (name) =>
          management("deleteDeployment", (c) => c.deleteDeployment(name)),
        listDeployKeys: (name) =>
          management("listDeployKeys", (c) => c.listDeployKeys(name)),
        updateDeployment: (name, input) =>
          management("updateDeployment", (c) =>
            c.updateDeployment(name, input),
          ),
        createDeployKey: (name, input) =>
          management("createDeployKey", (c) => c.createDeployKey(name, input)),
        deleteDeployKey: (name, id) =>
          management("deleteDeployKey", (c) => c.deleteDeployKey(name, { id })),
        listEnvironmentVariables: (url, key) =>
          deployment("listEnvironmentVariables", url, key, (c) =>
            c.listEnvironmentVariables.pipe(
              Effect.map((r) => r.environmentVariables),
            ),
          ),
        updateEnvironmentVariables: (url, key, changes) =>
          deployment("updateEnvironmentVariables", url, key, (c) =>
            c.updateEnvironmentVariables({ changes }),
          ),
      });
    }),
  );
