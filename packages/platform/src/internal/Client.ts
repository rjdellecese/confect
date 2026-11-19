import * as Effect from "effect/Effect";
import { constVoid } from "effect/Function";
import * as Schema from "effect/Schema";
import type {
  Client as SdkClient,
  ClientOptions,
  FetchResponse,
  Middleware,
  MiddlewareRequestParams,
  ParamsOption,
  RequestBodyOption,
} from "openapi-fetch";
import type {
  FilterKeys,
  HttpMethod,
  MediaType,
  PathItemObject,
  PathsWithMethod,
  RequiredKeysOf,
} from "openapi-typescript-helpers";
import * as PlatformError from "../PlatformError.js";

type Options<Operation> = ParamsOption<Operation> &
  RequestBodyOption<Operation>;

export type Responses<Paths extends object> = {
  [
    Method in HttpMethod
  ]: `${Method} ${PathsWithMethod<Paths, Method> & string}`;
}[HttpMethod];

type Args<Operation> =
  RequiredKeysOf<Options<Operation>> extends never
    ? [options?: Options<Operation>]
    : [options: Options<Operation>];

type Data<Operation> = Operation extends object
  ? Extract<FetchResponse<Operation, {}, MediaType>, { data: unknown }>["data"]
  : never;

export interface Client<Paths extends object> {
  readonly request: <
    Method extends HttpMethod,
    Path extends PathsWithMethod<Paths, Method>,
  >(
    operation: string,
    method: Method,
    schemaPath: Path,
    ...args: Args<FilterKeys<Paths[Path], Method>>
  ) => Effect.Effect<
    Data<FilterKeys<Paths[Path], Method>>,
    PlatformError.RequestFailure
  >;
}

type WireOptions = {
  readonly params?: Pick<MiddlewareRequestParams, "path" | "query">;
  readonly body?: unknown;
};

export function make<Paths extends object>(
  sdk: SdkClient<Paths>,
  responses: Record<Responses<NoInfer<Paths>>, Schema.Decoder<unknown>>,
  fetch?: ClientOptions["fetch"],
  baseUrl?: string,
): Client<Paths>;
export function make(
  sdk: SdkClient<Record<string, PathItemObject>>,
  responses: Record<string, Schema.Decoder<unknown>>,
  fetch?: ClientOptions["fetch"],
  baseUrl?: string,
) {
  const request = Effect.fnUntraced(
    function* (
      operation: string,
      method: HttpMethod,
      schemaPath: string,
      options?: WireOptions,
    ) {
      const schema = responses[`${method} ${schemaPath}`];
      let failure: () => PlatformError.RequestFailure = () =>
        PlatformError.InvalidRequest.make({ operation });
      const middleware: Middleware = {
        onError: () => {
          failure = () => PlatformError.TransportError.make({ operation });
        },
        onResponse: ({ response }) => {
          const status = response.status;
          if (!response.ok) {
            failure = () => PlatformError.HttpError.make({ operation, status });
            void response.body?.cancel().catch(constVoid);
            throw failure();
          }
          failure = () =>
            PlatformError.InvalidResponse.make({ operation, status });
          if (schema === Schema.Void && response.body !== null) {
            void response.body.cancel().catch(constVoid);
            return new Response(null, { status });
          }
        },
      };
      const result = yield* Effect.tryPromise({
        try: (signal) =>
          sdk.request(method, schemaPath, {
            params: {
              path: options?.params?.path,
              query: options?.params?.query,
            },
            body: options?.body,
            ...(baseUrl === undefined ? {} : { baseUrl }),
            ...(fetch === undefined ? {} : { fetch }),
            signal,
            redirect: "manual",
            middleware: [middleware],
          }),
        catch: () => failure(),
      });
      return yield* Schema.decodeUnknownEffect(schema)(result.data).pipe(
        Effect.mapError(() =>
          PlatformError.InvalidResponse.make({
            operation,
            status: result.response.status,
          }),
        ),
      );
    },
    (effect, operation) =>
      Effect.withSpan(effect, `ConvexPlatform.${operation}`),
  );
  return { request };
}

export const forCreateTeam = (error: PlatformError.RequestFailure) => {
  if (error._tag !== "HttpError") return error;
  if (error.status === 400)
    return PlatformError.InvalidTeamConfiguration.make({
      operation: "createTeam",
      status: 400,
    });
  if (error.status === 403)
    return PlatformError.TeamCreationForbidden.make({
      operation: "createTeam",
      status: 403,
    });
  return error;
};

export const forCreateTeamAccessToken = (error: PlatformError.RequestFailure) =>
  error._tag === "HttpError" && error.status === 403
    ? PlatformError.TeamAccessTokenForbidden.make({
        operation: "createTeamAccessToken",
        status: 403,
      })
    : error;
