import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import ProvideViewer from "../middleware/ProvideViewer.spec";
import RequireLongName from "../middleware/RequireLongName.spec";

export class NoNotes extends Schema.TaggedError<NoNotes>()("NoNotes", {}) {}

export default GroupSpec.make()
  .middleware(ProvideViewer)
  .addFunction(
    FunctionSpec.publicQuery({
      name: "viewerName",
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "viewerNameMutation",
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "viewerNameAction",
      returns: () => Schema.String,
    }),
  )
  // Declares its own `error` schema *and* is covered by a failing
  // middleware — the client-visible error union is `NoNotes | NoViewer`.
  .addFunction(
    FunctionSpec.publicQuery({
      name: "firstNoteForViewer",
      returns: () => Schema.String,
      error: () => NoNotes,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "shoutName",
      returns: () => Schema.String,
    }).middleware(RequireLongName),
  );
