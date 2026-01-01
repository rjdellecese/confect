const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/Scheduler.ts
var Scheduler_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	Scheduler: () => Scheduler,
	layer: () => layer
});
const make = (scheduler) => ({
	runAfter: (delay, functionReference, ...args) => {
		const delayMs = effect.Duration.toMillis(delay);
		return effect.Effect.promise(() => scheduler.runAfter(delayMs, functionReference, ...args));
	},
	runAt: (dateTime, functionReference, ...args) => {
		const timestamp = effect.DateTime.toEpochMillis(dateTime);
		return effect.Effect.promise(() => scheduler.runAt(timestamp, functionReference, ...args));
	}
});
const Scheduler = effect.Context.GenericTag("@rjdellecese/confect/server/Scheduler");
const layer = (scheduler) => effect.Layer.succeed(Scheduler, make(scheduler));

//#endregion
exports.Scheduler = Scheduler;
Object.defineProperty(exports, 'Scheduler_exports', {
  enumerable: true,
  get: function () {
    return Scheduler_exports;
  }
});
exports.layer = layer;
//# sourceMappingURL=Scheduler.cjs.map