const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/VectorSearch.ts
var VectorSearch_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	VectorSearch: () => VectorSearch,
	layer: () => layer,
	make: () => make
});
const make = (vectorSearch) => (tableName, indexName, query) => effect.Effect.promise(() => vectorSearch(tableName, indexName, query));
const VectorSearch = () => effect.Context.GenericTag("@rjdellecese/confect/server/VectorSearch");
const layer = (vectorSearch) => effect.Layer.succeed(VectorSearch(), make(vectorSearch));

//#endregion
exports.VectorSearch = VectorSearch;
Object.defineProperty(exports, 'VectorSearch_exports', {
  enumerable: true,
  get: function () {
    return VectorSearch_exports;
  }
});
exports.layer = layer;
exports.make = make;
//# sourceMappingURL=VectorSearch.cjs.map