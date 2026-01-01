import { Context, DateTime, Duration, Effect, Layer } from "effect";
import { OptionalRestArgs, SchedulableFunctionReference, Scheduler as Scheduler$1 } from "convex/server";
import * as convex_values0 from "convex/values";

//#region src/server/Scheduler.d.ts
declare namespace Scheduler_d_exports {
  export { Scheduler, layer };
}
declare const Scheduler: Context.Tag<{
  runAfter: <FuncRef extends SchedulableFunctionReference>(delay: Duration.Duration, functionReference: FuncRef, ...args: OptionalRestArgs<FuncRef>) => Effect.Effect<convex_values0.GenericId<"_scheduled_functions">, never, never>;
  runAt: <FuncRef extends SchedulableFunctionReference>(dateTime: DateTime.DateTime, functionReference: FuncRef, ...args: OptionalRestArgs<FuncRef>) => Effect.Effect<convex_values0.GenericId<"_scheduled_functions">, never, never>;
}, {
  runAfter: <FuncRef extends SchedulableFunctionReference>(delay: Duration.Duration, functionReference: FuncRef, ...args: OptionalRestArgs<FuncRef>) => Effect.Effect<convex_values0.GenericId<"_scheduled_functions">, never, never>;
  runAt: <FuncRef extends SchedulableFunctionReference>(dateTime: DateTime.DateTime, functionReference: FuncRef, ...args: OptionalRestArgs<FuncRef>) => Effect.Effect<convex_values0.GenericId<"_scheduled_functions">, never, never>;
}>;
type Scheduler = typeof Scheduler.Identifier;
declare const layer: (scheduler: Scheduler$1) => Layer.Layer<{
  runAfter: <FuncRef extends SchedulableFunctionReference>(delay: Duration.Duration, functionReference: FuncRef, ...args: OptionalRestArgs<FuncRef>) => Effect.Effect<convex_values0.GenericId<"_scheduled_functions">, never, never>;
  runAt: <FuncRef extends SchedulableFunctionReference>(dateTime: DateTime.DateTime, functionReference: FuncRef, ...args: OptionalRestArgs<FuncRef>) => Effect.Effect<convex_values0.GenericId<"_scheduled_functions">, never, never>;
}, never, never>;
//#endregion
export { Scheduler, Scheduler_d_exports, layer };
//# sourceMappingURL=Scheduler.d.ts.map