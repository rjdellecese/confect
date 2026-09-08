import { MiddlewareSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import type { Viewer } from "./ProvideViewer.spec";

export class NameRejected extends Schema.TaggedError<NameRejected>()(
  "NameRejected",
  {
    minLength: Schema.Finite,
  },
) {}

export default class RequireName extends MiddlewareSpec.MiddlewareSpec<
  RequireName,
  {
    requires: Viewer;
    options: { readonly minLength: number };
  }
>()("RequireName", {
  error: () => NameRejected,
  functionTypes: { query: true, mutation: true, action: true },
}) {}
