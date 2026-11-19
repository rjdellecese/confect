import { createDeploymentClient } from "@convex-dev/platform";
import type * as Api from "@convex-dev/platform/deploymentApi";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Record from "effect/Record";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import type * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";
import * as Struct from "effect/Struct";
import * as Client from "./internal/Client.js";
import {
  ActiveDataSync as ActiveDataSyncSchema,
  DataSyncResponse,
  deployment,
  ListActiveSyncsResponse,
} from "./internal/DeploymentResponses.js";
import * as Pagination from "./internal/Pagination.js";
import * as Selections from "./internal/Selection.js";
import * as SyncResponse from "./internal/SyncResponse.js";
import {
  InvalidRequest,
  type InvalidPagination,
  type RequestFailure,
} from "./PlatformError.js";

export interface Options {
  readonly fetch?: (request: Request) => Promise<Response>;
}

type Secret = Redacted.Redacted<string>;
type WithSecretFields<T, Keys extends string> = {
  [K in keyof T]: K extends Keys ? T[K] | Secret : T[K];
};

export type Selection = Selections.Selection;
type WithSelection<T> = {
  [K in keyof T]: K extends "selection"
    ? Exclude<T[K], Api.Selection> | Selection
    : T[K];
};

type WithSyncTimestamps<T> = {
  [K in keyof T]: K extends "ts" | "snapshotTs" | "syncedTs" ? bigint : T[K];
};
export type DataSyncPage = Omit<
  Api.DataSyncResponse,
  "status" | "values" | "truncates"
> & {
  readonly status: WithSyncTimestamps<Api.DataSyncStatus>;
  readonly values: ReadonlyArray<
    Omit<WithSyncTimestamps<Api.DataSyncValue>, "value"> & {
      readonly value: Schema.JsonObject;
    }
  >;
  readonly truncates: ReadonlyArray<Api.DataSyncTruncate>;
};
export type ActiveDataSync = Omit<Api.ActiveDataSync, "status"> & {
  readonly status: WithSyncTimestamps<Api.ActiveDataSyncStatus>;
};
export type ActiveSyncsPage = Omit<Api.ListActiveSyncsResponse, "syncs"> & {
  readonly syncs: ReadonlyArray<ActiveDataSync>;
};

const decodeDataSync = SyncResponse.decode("page", DataSyncResponse);
const decodeActiveSync = SyncResponse.decode("active", ActiveDataSyncSchema);
const decodeActiveSyncs = SyncResponse.decode("list", ListActiveSyncsResponse);

export interface UpdateEnvironmentVariablesInput {
  readonly changes: ReadonlyArray<
    WithSecretFields<Api.UpdateEnvVarRequest, "value">
  >;
}

type LogStreamCredential =
  | "apiKey"
  | "ddApiKey"
  | "accessKeyId"
  | "secretAccessKey"
  | "dsn"
  | "url"
  | "ingestUrl"
  | "host";
export type CreateLogStreamInput = WithSecretFields<
  WithSelection<Api.CreateLogStreamArgs>,
  LogStreamCredential
>;
export type UpdateLogStreamInput = WithSecretFields<
  WithSelection<Api.UpdateLogStreamArgs>,
  LogStreamCredential
>;

type Revealed<A> = A extends Redacted.Redacted<infer V> ? V : A;
interface Reveal extends Struct.Lambda {
  (value: unknown): unknown;
  readonly "~lambda.out": Revealed<this["~lambda.in"]>;
}
const reveal = Struct.lambda<Reveal>((value) =>
  Redacted.isRedacted(value) ? Redacted.value(value) : value,
);

const redactUrl = (url: string | null | undefined) =>
  typeof url === "string" ? Redacted.make(url) : null;

type LogStreamOutput<T> = {
  [K in keyof T]: K extends LogStreamCredential | "hmacSecret"
    ? Exclude<T[K], string> | Secret
    : T[K];
};
export type LogStream = LogStreamOutput<WithSelection<Api.LogStreamConfig>>;

const redactLogStream = (stream: Api.LogStreamConfig): LogStream => {
  switch (stream.logStreamType) {
    case "webhook":
      return {
        ...stream,
        url: Redacted.make(stream.url),
        hmacSecret: Redacted.make(stream.hmacSecret),
      };
    case "s3Export":
      return {
        ...stream,
        accessKeyId: Redacted.make(stream.accessKeyId),
        selection: Selections.decode(stream.selection),
      };
    case "axiom":
      return Struct.evolve(stream, { ingestUrl: redactUrl });
    case "postHogLogs":
      return Struct.evolve(stream, { host: redactUrl });
    case "postHogErrorTracking":
      return Struct.evolve(stream, { host: redactUrl });
    case "datadog":
    case "sentry":
      return stream;
  }
};

type AuditLogQuery =
  Api.operations["list_audit_log_events"]["parameters"]["query"];
type ActiveSyncsQuery = NonNullable<
  Api.operations["list_active_syncs"]["parameters"]["query"]
>;
type Operation<A> = Effect.Effect<A, RequestFailure>;
type ItemStream<A> = Stream.Stream<A, RequestFailure | InvalidPagination>;

const encodeSelection = (selection: Selection) =>
  Result.getOrThrow(Selections.encode(selection));

function logStreamBody(
  input: CreateLogStreamInput,
  operation: "createLogStream",
): Api.CreateLogStreamArgs;
function logStreamBody(
  input: UpdateLogStreamInput,
  operation: "updateLogStream",
): Api.UpdateLogStreamArgs;
function logStreamBody(
  input: CreateLogStreamInput | UpdateLogStreamInput,
  operation: string,
) {
  if (input.logStreamType !== "s3Export") {
    if ("selection" in input && input.selection != null)
      throw InvalidRequest.make({ operation });
    return Struct.map(input, reveal);
  }
  const { selection, ...rest } = input;
  const body = Struct.map(rest, reveal);
  return selection === undefined
    ? body
    : {
        ...body,
        selection: selection === null ? null : encodeSelection(selection),
      };
}

export interface Service {
  readonly listEnvironmentVariables: Operation<{
    environmentVariables: Record<string, Secret>;
  }>;
  readonly updateEnvironmentVariables: (
    input: UpdateEnvironmentVariablesInput,
  ) => Operation<void>;
  readonly listAuditLogEvents: (
    query: AuditLogQuery,
  ) => Operation<Api.ListDeploymentAuditLogEventsResponse>;
  readonly streamAuditLogEvents: (
    query: AuditLogQuery,
  ) => ItemStream<Api.DeploymentAuditLogEventResponse>;
  readonly getDeploymentInfo: Operation<Api.DeploymentInfoResponse>;
  readonly getCurrentUsage: Operation<Api.GetCurrentUsageResponse>;
  readonly listUsageLimits: Operation<Api.ListUsageLimitsResponse>;
  readonly createUsageLimit: (
    body: Api.UsageLimitConfigRequest,
  ) => Operation<Api.UsageLimitResponse>;
  readonly updateUsageLimit: (
    id: string,
    body: Api.UsageLimitConfigRequest,
  ) => Operation<Api.UsageLimitResponse>;
  readonly deleteUsageLimit: (id: string) => Operation<void>;
  readonly updateCanonicalUrl: (
    body: Api.UpdateCanonicalUrlRequest,
  ) => Operation<void>;
  readonly getCanonicalUrls: Operation<Api.GetCanonicalUrlsResponse>;
  readonly listLogStreams: Operation<LogStream[]>;
  readonly getLogStream: (id: string) => Operation<LogStream>;
  readonly createLogStream: (
    input: CreateLogStreamInput,
  ) => Operation<LogStreamOutput<Api.CreateLogStreamResponse>>;
  readonly updateLogStream: (
    id: string,
    input: UpdateLogStreamInput,
  ) => Operation<void>;
  readonly deleteLogStream: (id: string) => Operation<void>;
  readonly rotateWebhookSecret: (
    id: string,
  ) => Operation<LogStreamOutput<Api.RotateLogStreamSecretResponse>>;
  readonly pauseDeployment: Operation<void>;
  readonly unpauseDeployment: Operation<void>;
  readonly syncData: (
    body: WithSelection<Api.DataSyncArgs>,
  ) => Operation<DataSyncPage>;
  readonly listActiveSyncs: (
    query?: ActiveSyncsQuery,
  ) => Operation<ActiveSyncsPage>;
  readonly streamActiveSyncs: (
    query?: ActiveSyncsQuery,
  ) => ItemStream<ActiveDataSync>;
  readonly getActiveSync: (syncId: Api.SyncId) => Operation<ActiveDataSync>;
}

export const make = (
  nameOrUrl: string,
  token: Redacted.Redacted<string>,
  options?: Options,
): Service => {
  const address = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(nameOrUrl)
    ? `https://${nameOrUrl}.convex.cloud`
    : Client.normalizeBaseUrl(nameOrUrl);
  const { request } = Client.make<Api.paths>(
    address === undefined
      ? undefined
      : () => createDeploymentClient(address, Redacted.value(token)),
    deployment,
    options?.fetch,
  );
  const listAuditLogEvents = (query: AuditLogQuery) =>
    request("listAuditLogEvents", "get", "/list_audit_log_events", {
      params: { query },
    });
  const listActiveSyncs = (query: ActiveSyncsQuery = {}) =>
    request("listActiveSyncs", "get", "/data/list_active_syncs", {
      params: { query },
      decodeText: decodeActiveSyncs,
    });
  return {
    listEnvironmentVariables: request(
      "listEnvironmentVariables",
      "get",
      "/list_environment_variables",
    ).pipe(
      Effect.map(({ environmentVariables }) => ({
        environmentVariables: Record.map(environmentVariables, (value) =>
          Redacted.make(value),
        ),
      })),
    ),
    updateEnvironmentVariables: (input) =>
      request(
        "updateEnvironmentVariables",
        "post",
        "/update_environment_variables",
        {
          get body() {
            return {
              changes: Array.map(input.changes, (change) =>
                Struct.map(change, reveal),
              ),
            };
          },
        },
      ),
    listAuditLogEvents,
    streamAuditLogEvents: (query) =>
      Pagination.stream(
        "streamAuditLogEvents",
        query.cursor ?? undefined,
        (cursor) =>
          listAuditLogEvents(
            cursor === undefined ? query : { ...query, cursor },
          ),
        (page) => page.items,
      ),
    getDeploymentInfo: request("getDeploymentInfo", "get", "/deployment_info"),
    getCurrentUsage: request("getCurrentUsage", "get", "/get_current_usage"),
    listUsageLimits: request("listUsageLimits", "get", "/list_usage_limits"),
    createUsageLimit: (body) =>
      request("createUsageLimit", "post", "/create_usage_limit", { body }),
    updateUsageLimit: (id, body) =>
      request("updateUsageLimit", "post", "/update_usage_limit/{id}", {
        params: { path: { id } },
        body,
      }),
    deleteUsageLimit: (id) =>
      request("deleteUsageLimit", "post", "/delete_usage_limit/{id}", {
        params: { path: { id } },
      }),
    updateCanonicalUrl: (body) =>
      request("updateCanonicalUrl", "post", "/update_canonical_url", { body }),
    getCanonicalUrls: request("getCanonicalUrls", "get", "/get_canonical_urls"),
    listLogStreams: request("listLogStreams", "get", "/list_log_streams").pipe(
      Effect.map(Array.map(redactLogStream)),
    ),
    getLogStream: (id) =>
      request("getLogStream", "get", "/get_log_stream/{id}", {
        params: { path: { id } },
      }).pipe(Effect.map(redactLogStream)),
    createLogStream: (input) =>
      request("createLogStream", "post", "/create_log_stream", {
        get body() {
          return logStreamBody(input, "createLogStream");
        },
      }).pipe(
        Effect.map((stream) =>
          stream.logStreamType === "webhook"
            ? { ...stream, hmacSecret: Redacted.make(stream.hmacSecret) }
            : stream,
        ),
      ),
    updateLogStream: (id, input) =>
      request("updateLogStream", "post", "/update_log_stream/{id}", {
        params: { path: { id } },
        get body() {
          return logStreamBody(input, "updateLogStream");
        },
      }),
    deleteLogStream: (id) =>
      request("deleteLogStream", "post", "/delete_log_stream/{id}", {
        params: { path: { id } },
      }),
    rotateWebhookSecret: (id) =>
      request("rotateWebhookSecret", "post", "/rotate_webhook_secret/{id}", {
        params: { path: { id } },
      }).pipe(
        Effect.map(({ logStreamType, hmacSecret }) => ({
          logStreamType,
          hmacSecret: Redacted.make(hmacSecret),
        })),
      ),
    pauseDeployment: request("pauseDeployment", "post", "/pause_deployment"),
    unpauseDeployment: request(
      "unpauseDeployment",
      "post",
      "/unpause_deployment",
    ),
    syncData: (body) =>
      request("syncData", "post", "/data/sync", {
        get body() {
          const { selection, ...rest } = body;
          return selection === undefined
            ? rest
            : { ...rest, selection: encodeSelection(selection) };
        },
        decodeText: decodeDataSync,
      }),
    listActiveSyncs,
    streamActiveSyncs: (query = {}) =>
      Pagination.stream(
        "streamActiveSyncs",
        query.cursor ?? undefined,
        (cursor) =>
          listActiveSyncs(cursor === undefined ? query : { ...query, cursor }),
        (page) => page.syncs,
      ),
    getActiveSync: (syncId) =>
      request("getActiveSync", "get", "/data/sync/{sync_id}", {
        params: { path: { sync_id: syncId } },
        decodeText: decodeActiveSync,
      }),
  };
};

export class DeploymentClient extends Context.Service<
  DeploymentClient,
  Service
>()("@confect/platform/DeploymentClient") {}

export const layer = (
  nameOrUrl: string,
  token: Redacted.Redacted<string>,
  options?: Options,
) => Layer.sync(DeploymentClient, () => make(nameOrUrl, token, options));
