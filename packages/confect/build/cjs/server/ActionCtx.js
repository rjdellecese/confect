const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/ActionCtx.ts
var ActionCtx_exports = /* @__PURE__ */ require_rolldown_runtime.__export({ ActionCtx: () => ActionCtx });
const ActionCtx = () => effect.Context.GenericTag("@rjdellecese/confect/server/ActionCtx");

//#endregion
exports.ActionCtx = ActionCtx;
Object.defineProperty(exports, 'ActionCtx_exports', {
  enumerable: true,
  get: function () {
    return ActionCtx_exports;
  }
});
//# sourceMappingURL=ActionCtx.cjs.map