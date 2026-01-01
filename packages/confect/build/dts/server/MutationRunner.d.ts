import { Ref as Ref$1 } from "../api/Refs.js";
import { Context, Effect, Layer, Schema } from "effect";
import { GenericMutationCtx } from "convex/server";
import * as effect_ParseResult2 from "effect/ParseResult";

//#region src/server/MutationRunner.d.ts
declare namespace MutationRunner_d_exports {
  export { MutationRollback, MutationRunner, layer };
}
declare const MutationRunner: Context.Tag<(<Mutation extends Ref$1.AnyMutation>(mutation: Mutation, args: Ref$1.Args<Mutation>["Type"]) => Effect.Effect<any, effect_ParseResult2.ParseError, never>), <Mutation extends Ref$1.AnyMutation>(mutation: Mutation, args: Ref$1.Args<Mutation>["Type"]) => Effect.Effect<any, effect_ParseResult2.ParseError, never>>;
type MutationRunner = typeof MutationRunner.Identifier;
declare const layer: (runMutation: GenericMutationCtx<any>["runMutation"]) => Layer.Layer<(<Mutation extends Ref$1.AnyMutation>(mutation: Mutation, args: Ref$1.Args<Mutation>["Type"]) => Effect.Effect<any, effect_ParseResult2.ParseError, never>), never, never>;
declare const MutationRollback_base: Schema.TaggedErrorClass<MutationRollback, "MutationRollback", {
  readonly _tag: Schema.tag<"MutationRollback">;
} & {
  mutationName: typeof Schema.String;
  error: typeof Schema.Unknown;
}>;
declare class MutationRollback extends MutationRollback_base {
  get message(): string;
}
//#endregion
export { MutationRollback, MutationRunner, MutationRunner_d_exports, layer };
//# sourceMappingURL=MutationRunner.d.ts.map