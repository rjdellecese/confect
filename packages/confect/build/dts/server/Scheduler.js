import { __export } from "../_virtual/rolldown_runtime.js";
import { Context, DateTime, Duration, Effect, Layer } from "effect";

//#region src/server/Scheduler.ts
var Scheduler_exports = /* @__PURE__ */ __export({
	Scheduler: () => Scheduler,
	layer: () => layer
});
const make = (scheduler) => ({
	runAfter: (delay, functionReference, ...args) => {
		const delayMs = Duration.toMillis(delay);
		return Effect.promise(() => scheduler.runAfter(delayMs, functionReference, ...args));
	},
	runAt: (dateTime, functionReference, ...args) => {
		const timestamp = DateTime.toEpochMillis(dateTime);
		return Effect.promise(() => scheduler.runAt(timestamp, functionReference, ...args));
	}
});
const Scheduler = Context.GenericTag("@rjdellecese/confect/server/Scheduler");
const layer = (scheduler) => Layer.succeed(Scheduler, make(scheduler));

//#endregion
export { Scheduler, Scheduler_exports, layer };
//# sourceMappingURL=Scheduler.js.map