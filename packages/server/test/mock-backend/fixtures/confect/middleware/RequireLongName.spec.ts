import { MiddlewareSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import type { Viewer } from "./ProvideViewer.spec";

export class NameTooShort extends Schema.TaggedError<NameTooShort>()(
  "NameTooShort",
  {},
) {}

/**
 * Cross-middleware dependency: `requires` the `Viewer` provided by
 * `ProvideViewer`, which runs earlier in the chain (group-attached, while this
 * one is function-attached). Fails with `NameTooShort` when the viewer's
 * username has fewer than three characters.
 */
export default class RequireLongName extends MiddlewareSpec.Service<
  RequireLongName,
  { requires: Viewer }
>()("RequireLongName", {
  error: () => NameTooShort,
  functionTypes: { query: true, mutation: true, action: true },
}) {}
