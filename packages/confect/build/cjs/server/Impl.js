const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/Impl.ts
var Impl_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	Impl: () => Impl,
	make: () => make
});
var Impl = class extends effect.Context.Tag("@rjdellecese/confect/server/Impl")() {};
const make = (api) => effect.Layer.effect(Impl, effect.Effect.map(effect.Effect.context(), (context) => ({
	api,
	context
})));

//#endregion
exports.Impl = Impl;
Object.defineProperty(exports, 'Impl_exports', {
  enumerable: true,
  get: function () {
    return Impl_exports;
  }
});
exports.make = make;
//# sourceMappingURL=Impl.cjs.map