import { MiddlewareSpec } from "@confect/core";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import type users from "../_generated/tables/users";

export class Viewer extends Context.Service<
  Viewer,
  { readonly user: typeof users.Doc.Type }
>()("example/confect/middleware/RequireViewer.spec/Viewer") {}

export class NotSignedIn extends Schema.TaggedError<NotSignedIn>()(
  "NotSignedIn",
  {},
) {}

/**
 * Provides the current viewer (in this auth-less example: the most recently
 * created user) to every function in the groups it is attached to, failing with
 * the typed `NotSignedIn` error when no user exists.
 */
export default class RequireViewer extends MiddlewareSpec.Service<
  RequireViewer,
  { provides: Viewer }
>()("RequireViewer", {
  error: () => NotSignedIn,
  functionTypes: { query: true, mutation: true, action: false },
}) {}
