import * as Schema from "effect/Schema";

export class SnapshotError extends Schema.TaggedError<SnapshotError>()(
  "SnapshotError",
  {
    reason: Schema.Literals([
      "InvalidShape",
      "NoncanonicalPath",
      "DuplicateLeaf",
      "NoncanonicalFunctionNames",
    ]),
    relativePath: Schema.String,
    pathSegments: Schema.Array(Schema.String),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Invalid generation snapshot (${this.reason}) at ${this.relativePath || "<snapshot>"}`;
  }
}
