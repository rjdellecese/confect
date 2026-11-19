import * as Effect from "effect/Effect";
import { constVoid } from "effect/Function";
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
import { PlatformError } from "../PlatformError.js";

type Options<Operation> = ParamsOption<Operation> &
  RequestBodyOption<Operation>;

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
    method: Method,
    schemaPath: Path,
    ...args: Args<FilterKeys<Paths[Path], Method>>
  ) => Effect.Effect<Data<FilterKeys<Paths[Path], Method>>, PlatformError>;
}

type WireOptions = {
  readonly params?: Pick<MiddlewareRequestParams, "path" | "query">;
  readonly body?: unknown;
};

export function make<Paths extends object>(
  sdk: SdkClient<Paths>,
  fetch?: ClientOptions["fetch"],
  baseUrl?: string,
): Client<Paths>;
export function make(
  sdk: SdkClient<Record<string, PathItemObject>>,
  fetch?: ClientOptions["fetch"],
  baseUrl?: string,
) {
  const request = Effect.fn("PlatformClient.request")(function* (
    method: HttpMethod,
    schemaPath: string,
    options?: WireOptions,
  ) {
    let code: PlatformError["code"] = "InvalidRequest";
    let status: number | undefined;
    const failure = () =>
      PlatformError.make({
        code,
        ...(status === undefined ? {} : { status }),
      });
    const middleware: Middleware = {
      onError: () => {
        code = "TransportError";
      },
      onResponse: ({ response }) => {
        status = response.status;
        code = response.ok ? "InvalidResponse" : "HttpError";
        if (!response.ok) {
          void response.body?.cancel().catch(constVoid);
          throw failure();
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
      catch: failure,
    });
    return result.data;
  });
  return { request };
}
