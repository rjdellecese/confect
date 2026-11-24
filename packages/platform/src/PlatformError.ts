import * as Schema from "effect/Schema";

const operation = { operation: Schema.String };
const response = { ...operation, status: Schema.Int };

export class InvalidRequest extends Schema.TaggedError<
  InvalidRequest,
  { readonly brand: unique symbol }
>()("InvalidRequest", operation) {}

export class TransportError extends Schema.TaggedError<
  TransportError,
  { readonly brand: unique symbol }
>()("TransportError", operation) {}

export class HttpError extends Schema.TaggedError<
  HttpError,
  { readonly brand: unique symbol }
>()("HttpError", response) {}

export class InvalidResponse extends Schema.TaggedError<
  InvalidResponse,
  { readonly brand: unique symbol }
>()("InvalidResponse", response) {}

export class InvalidPagination extends Schema.TaggedError<
  InvalidPagination,
  { readonly brand: unique symbol }
>()("InvalidPagination", operation) {}

export class InvalidTeamConfiguration extends Schema.TaggedError<
  InvalidTeamConfiguration,
  { readonly brand: unique symbol }
>()("InvalidTeamConfiguration", {
  operation: Schema.Literal("createTeam"),
  status: Schema.Literal(400),
}) {}

export class TeamCreationForbidden extends Schema.TaggedError<
  TeamCreationForbidden,
  { readonly brand: unique symbol }
>()("TeamCreationForbidden", {
  operation: Schema.Literal("createTeam"),
  status: Schema.Literal(403),
}) {}

export class TeamAccessTokenForbidden extends Schema.TaggedError<
  TeamAccessTokenForbidden,
  { readonly brand: unique symbol }
>()("TeamAccessTokenForbidden", {
  operation: Schema.Literal("createTeamAccessToken"),
  status: Schema.Literal(403),
}) {}

export type RequestFailure =
  | InvalidRequest
  | TransportError
  | HttpError
  | InvalidResponse;

export type PlatformError =
  | RequestFailure
  | InvalidPagination
  | InvalidTeamConfiguration
  | TeamCreationForbidden
  | TeamAccessTokenForbidden;
