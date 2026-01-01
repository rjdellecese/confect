const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/QueryCtx.ts
var QueryCtx_exports = /* @__PURE__ */ require_rolldown_runtime.__export({ QueryCtx: () => QueryCtx });
const QueryCtx = () => effect.Context.GenericTag("@rjdellecese/confect/server/QueryCtx");

//#endregion
exports.QueryCtx = QueryCtx;
Object.defineProperty(exports, 'QueryCtx_exports', {
  enumerable: true,
  get: function () {
    return QueryCtx_exports;
  }
});
//# sourceMappingURL=QueryCtx.cjs.map