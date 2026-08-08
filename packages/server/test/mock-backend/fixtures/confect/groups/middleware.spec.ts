import { FunctionSpec, GroupSpec, MiddlewareSpec } from "@confect/core";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";

export class Viewer extends Context.Service<
  Viewer,
  { readonly username: string }
>()(
  "@confect/server-mock-backend-fixtures/confect/groups/middleware.spec/Viewer",
) {}

export class NoViewer extends Schema.TaggedError<NoViewer>()("NoViewer", {}) {}

export class NoNotes extends Schema.TaggedError<NoNotes>()("NoNotes", {}) {}

/**
 * The flagship middleware shape: provides `Viewer` to downstream handlers,
 * short-circuiting with the typed `NoViewer` error when no user exists.
 * Declares all three kinds; the impl uses `makeByKind` (`DatabaseReader` in
 * queries/mutations, `QueryRunner` of an internal query in actions).
 */
export class ProvideViewer extends MiddlewareSpec.Service<
  ProvideViewer,
  { provides: Viewer }
>()("ProvideViewer", {
  error: () => NoViewer,
}) {}

export default GroupSpec.make()
  .middleware(ProvideViewer)
  .addFunction(
    FunctionSpec.publicQuery({
      name: "viewerName",
      args: () => Schema.Struct({}),
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "viewerNameMutation",
      args: () => Schema.Struct({}),
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "viewerNameAction",
      args: () => Schema.Struct({}),
      returns: () => Schema.String,
    }),
  )
  // Declares its own `error` schema *and* is covered by a failing
  // middleware — the client-visible error union is `NoNotes | NoViewer`.
  .addFunction(
    FunctionSpec.publicQuery({
      name: "firstNoteForViewer",
      args: () => Schema.Struct({}),
      returns: () => Schema.String,
      error: () => NoNotes,
    }),
  );
