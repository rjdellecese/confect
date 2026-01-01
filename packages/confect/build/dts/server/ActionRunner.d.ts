import { Ref as Ref$1 } from "../api/Refs.js";
import { Context, Effect, Layer } from "effect";
import { GenericActionCtx } from "convex/server";
import * as effect_ParseResult0 from "effect/ParseResult";

//#region src/server/ActionRunner.d.ts
declare namespace ActionRunner_d_exports {
  export { ActionRunner, layer };
}
declare const ActionRunner: Context.Tag<(<Action extends Ref$1.AnyAction>(action: Action, args: Ref$1.Args<Action>["Type"]) => Effect.Effect<any, effect_ParseResult0.ParseError, never>), <Action extends Ref$1.AnyAction>(action: Action, args: Ref$1.Args<Action>["Type"]) => Effect.Effect<any, effect_ParseResult0.ParseError, never>>;
type ActionRunner = typeof ActionRunner.Identifier;
declare const layer: (runAction: GenericActionCtx<any>["runAction"]) => Layer.Layer<(<Action extends Ref$1.AnyAction>(action: Action, args: Ref$1.Args<Action>["Type"]) => Effect.Effect<any, effect_ParseResult0.ParseError, never>), never, never>;
//#endregion
export { ActionRunner, ActionRunner_d_exports, layer };
//# sourceMappingURL=ActionRunner.d.ts.map