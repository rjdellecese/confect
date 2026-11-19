import type {
  DeploymentClient,
  ManagementClient,
  PlatformError,
} from "@confect/platform";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type {
  ConvexClient,
  EnvironmentVariableChange,
} from "../ConvexClient.js";

type Service = typeof ConvexClient.Service;
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

export const apiFailure = (
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

export class PlatformClients extends Context.Service<
  PlatformClients,
  {
    readonly facade: Service;
    readonly management: (
      operation: keyof Service,
    ) => Effect.Effect<ManagementClient.Service, ConvexApiError>;
    readonly deployment: (
      operation: keyof Service,
      url: string,
      key: Redacted.Redacted<string>,
    ) => Effect.Effect<DeploymentClient.Service, ConvexApiError>;
  }
>()("@confect/alchemy/internal/PlatformClients") {}

export const forFacade = (facade: Service) =>
  Effect.serviceOption(PlatformClients).pipe(
    Effect.map((access) =>
      Option.isSome(access) && access.value.facade === facade
        ? access.value
        : undefined,
    ),
  );

export const streamProjects = (
  acquire: Effect.Effect<ManagementClient.Service, ConvexApiError>,
  teamId: number,
) =>
  acquire.pipe(
    Effect.map((client) =>
      client
        .streamProjects(teamId)
        .pipe(Stream.mapError((error) => apiFailure("listProjects", error))),
    ),
    Stream.unwrap,
  );

export const environment = (client: DeploymentClient.Service) => ({
  list: client.listEnvironmentVariables.pipe(
    Effect.mapBoth({
      onSuccess: (r) => r.environmentVariables,
      onFailure: (error) => apiFailure("listEnvironmentVariables", error),
    }),
  ),
  update: (changes: ReadonlyArray<EnvironmentVariableChange>) =>
    client
      .updateEnvironmentVariables({ changes })
      .pipe(
        Effect.mapError((error) =>
          apiFailure("updateEnvironmentVariables", error),
        ),
      ),
});
