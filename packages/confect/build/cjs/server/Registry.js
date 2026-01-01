const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/Registry.ts
var Registry_exports = /* @__PURE__ */ require_rolldown_runtime.__export({ Registry: () => Registry });
var Registry = class extends effect.Context.Reference()("@rjdellecese/confect/server/Registry", { defaultValue: () => effect.Ref.unsafeMake({}) }) {};

//#endregion
exports.Registry = Registry;
Object.defineProperty(exports, 'Registry_exports', {
  enumerable: true,
  get: function () {
    return Registry_exports;
  }
});
//# sourceMappingURL=Registry.cjs.map