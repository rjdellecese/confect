const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/api/PaginationResult.ts
var PaginationResult_exports = /* @__PURE__ */ require_rolldown_runtime.__export({ PaginationResult: () => PaginationResult });
const PaginationResult = (Doc) => effect.Schema.Struct({
	page: effect.Schema.Array(Doc),
	isDone: effect.Schema.Boolean,
	continueCursor: effect.Schema.String,
	splitCursor: effect.Schema.optionalWith(effect.Schema.Union(effect.Schema.String, effect.Schema.Null), { exact: true }),
	pageStatus: effect.Schema.optionalWith(effect.Schema.Union(effect.Schema.Literal("SplitRecommended"), effect.Schema.Literal("SplitRequired"), effect.Schema.Null), { exact: true })
});

//#endregion
exports.PaginationResult = PaginationResult;
Object.defineProperty(exports, 'PaginationResult_exports', {
  enumerable: true,
  get: function () {
    return PaginationResult_exports;
  }
});
//# sourceMappingURL=PaginationResult.cjs.map