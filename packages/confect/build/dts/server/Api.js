import { __export } from "../_virtual/rolldown_runtime.js";
import { Predicate, Record, pipe } from "effect";
import { defineSchema } from "convex/server";

//#region src/server/Api.ts
var Api_exports = /* @__PURE__ */ __export({
	TypeId: () => TypeId,
	isApi: () => isApi,
	make: () => make
});
const TypeId = "@rjdellecese/confect/server/Api";
const isApi = (u) => Predicate.hasProperty(u, TypeId);
const Proto = { [TypeId]: TypeId };
const makeProto = ({ schema, spec }) => Object.assign(Object.create(Proto), {
	schema,
	spec,
	convexSchemaDefinition: pipe(schema.tables, Record.map(({ tableDefinition }) => tableDefinition), defineSchema)
});
const make = (schema, spec) => makeProto({
	schema,
	spec
});

//#endregion
export { Api_exports, TypeId, isApi, make };
//# sourceMappingURL=Api.js.map