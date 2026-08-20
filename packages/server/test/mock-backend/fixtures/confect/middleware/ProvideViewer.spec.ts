import { MiddlewareSpec } from "@confect/core";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";

export class Viewer extends Context.Service<
  Viewer,
  { readonly username: string }
>()(
  "@confect/server-mock-backend-fixtures/confect/middleware/ProvideViewer.spec/Viewer",
) {}

export class NoViewer extends Schema.TaggedError<NoViewer>()("NoViewer", {}) {}

/**
 * The flagship middleware shape: provides `Viewer` to downstream handlers,
 * short-circuiting with the typed `NoViewer` error when no user exists.
 * Declares all three function types; the impl uses `makeByFunctionType`
 * (`DatabaseReader` in queries/mutations, `QueryRunner` of an internal query in
 * actions).
 */
export default class ProvideViewer extends MiddlewareSpec.MiddlewareSpec<
  ProvideViewer,
  { provides: Viewer }
>()("ProvideViewer", {
  error: () => NoViewer,
  functionTypes: { query: true, mutation: true, action: true },
}) {}
