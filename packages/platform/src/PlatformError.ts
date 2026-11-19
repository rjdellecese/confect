import * as Schema from "effect/Schema";

export class PlatformError extends Schema.TaggedError<
  PlatformError,
  { readonly brand: unique symbol }
>()("PlatformError", {
  code: Schema.Literals([
    "HttpError",
    "InvalidResponse",
    "TransportError",
    "InvalidRequest",
  ]),
  status: Schema.optionalKey(Schema.Finite),
}) {}
