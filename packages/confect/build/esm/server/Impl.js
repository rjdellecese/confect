import { __export } from "../_virtual/rolldown_runtime.js";
import { Context, Effect, Layer } from "effect";

//#region src/server/Impl.ts
var Impl_exports = /* @__PURE__ */ __export({
	Impl: () => Impl,
	make: () => make
});
var Impl = class extends Context.Tag("@rjdellecese/confect/server/Impl")() {};
const make = (api) => Layer.effect(Impl, Effect.map(Effect.context(), (context) => ({
	api,
	context
})));

//#endregion
export { Impl, Impl_exports, make };
//# sourceMappingURL=Impl.js.map