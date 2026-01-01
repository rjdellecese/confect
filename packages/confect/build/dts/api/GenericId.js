import { __export } from "../_virtual/rolldown_runtime.js";
import { Schema, SchemaAST } from "effect";

//#region src/api/GenericId.ts
var GenericId_exports = /* @__PURE__ */ __export({
	GenericId: () => GenericId,
	tableName: () => tableName
});
const ConvexId = Symbol.for("ConvexId");
const GenericId = (tableName$1) => Schema.String.pipe(Schema.annotations({ [ConvexId]: tableName$1 }));
const tableName = (ast) => SchemaAST.getAnnotation(ConvexId)(ast);

//#endregion
export { GenericId, GenericId_exports, tableName };
//# sourceMappingURL=GenericId.js.map