import * as Schema from "effect/Schema";

export const Module = Schema.Struct({
  id: Schema.String,
  file: Schema.String,
  code: Schema.String,
  imports: Schema.Record(Schema.String, Schema.String),
});
export interface Module extends Schema.Schema.Type<typeof Module> {}

export const Snapshot = Schema.Struct({
  entry: Schema.String,
  modules: Schema.Array(Module),
  externals: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      url: Schema.String,
      type: Schema.Literals(["module", "commonjs", "builtin"]),
    }),
  ),
});
export interface Snapshot extends Schema.Schema.Type<typeof Snapshot> {}

export const Request = Schema.Struct({
  snapshot: Snapshot,
  exportName: Schema.String,
  invoke: Schema.Boolean,
});
export interface Request extends Schema.Schema.Type<typeof Request> {}

export const NativeRequest = Schema.TaggedStruct("Native", {
  url: Schema.String,
  exportName: Schema.String,
  invoke: Schema.Boolean,
});
export interface NativeRequest extends Schema.Schema.Type<
  typeof NativeRequest
> {}

export const ChildRequest = Schema.Union([Request, NativeRequest]);

export const Response = Schema.Union([
  Schema.TaggedStruct("Success", { value: Schema.Unknown }),
  Schema.TaggedStruct("Failure", { message: Schema.String }),
]);
export type Response = Schema.Schema.Type<typeof Response>;

export class EvaluationFailed extends Schema.TaggedError<EvaluationFailed>()(
  "PrototypeEvaluationFailed",
  { message: Schema.String },
) {}
