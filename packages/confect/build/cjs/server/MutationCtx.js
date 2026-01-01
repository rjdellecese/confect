const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/MutationCtx.ts
var MutationCtx_exports = /* @__PURE__ */ require_rolldown_runtime.__export({ MutationCtx: () => MutationCtx });
const MutationCtx = () => effect.Context.GenericTag("@rjdellecese/confect/server/MutationCtx");

//#endregion
exports.MutationCtx = MutationCtx;
Object.defineProperty(exports, 'MutationCtx_exports', {
  enumerable: true,
  get: function () {
    return MutationCtx_exports;
  }
});
//# sourceMappingURL=MutationCtx.cjs.map