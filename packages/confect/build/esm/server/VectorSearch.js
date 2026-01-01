import { __export } from "../_virtual/rolldown_runtime.js";
import { Context, Effect, Layer } from "effect";

//#region src/server/VectorSearch.ts
var VectorSearch_exports = /* @__PURE__ */ __export({
	VectorSearch: () => VectorSearch,
	layer: () => layer,
	make: () => make
});
const make = (vectorSearch) => (tableName, indexName, query) => Effect.promise(() => vectorSearch(tableName, indexName, query));
const VectorSearch = () => Context.GenericTag("@rjdellecese/confect/server/VectorSearch");
const layer = (vectorSearch) => Layer.succeed(VectorSearch(), make(vectorSearch));

//#endregion
export { VectorSearch, VectorSearch_exports, layer, make };
//# sourceMappingURL=VectorSearch.js.map