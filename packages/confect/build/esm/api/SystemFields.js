import { __export } from "../_virtual/rolldown_runtime.js";
import { GenericId } from "./GenericId.js";
import { Schema } from "effect";

//#region src/api/SystemFields.ts
var SystemFields_exports = /* @__PURE__ */ __export({
	SystemFields: () => SystemFields,
	extendWithSystemFields: () => extendWithSystemFields
});
/**
* Produces a schema for Convex system fields.
*/
const SystemFields = (tableName) => Schema.Struct({
	_id: GenericId(tableName),
	_creationTime: Schema.Number
});
/**
* Extend a table schema with Convex system fields.
*/
const extendWithSystemFields = (tableName, schema) => Schema.extend(SystemFields(tableName), schema);

//#endregion
export { SystemFields, SystemFields_exports, extendWithSystemFields };
//# sourceMappingURL=SystemFields.js.map