import { __export } from "../_virtual/rolldown_runtime.js";
import { Schema } from "effect";

//#region src/api/PaginationResult.ts
var PaginationResult_exports = /* @__PURE__ */ __export({ PaginationResult: () => PaginationResult });
const PaginationResult = (Doc) => Schema.Struct({
	page: Schema.Array(Doc),
	isDone: Schema.Boolean,
	continueCursor: Schema.String,
	splitCursor: Schema.optionalWith(Schema.Union(Schema.String, Schema.Null), { exact: true }),
	pageStatus: Schema.optionalWith(Schema.Union(Schema.Literal("SplitRecommended"), Schema.Literal("SplitRequired"), Schema.Null), { exact: true })
});

//#endregion
export { PaginationResult, PaginationResult_exports };
//# sourceMappingURL=PaginationResult.js.map