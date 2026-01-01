const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");
let convex_server = require("convex/server");

//#region src/server/Api.ts
var Api_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	TypeId: () => TypeId,
	isApi: () => isApi,
	make: () => make
});
const TypeId = "@rjdellecese/confect/server/Api";
const isApi = (u) => effect.Predicate.hasProperty(u, TypeId);
const Proto = { [TypeId]: TypeId };
const makeProto = ({ schema, spec }) => Object.assign(Object.create(Proto), {
	schema,
	spec,
	convexSchemaDefinition: (0, effect.pipe)(schema.tables, effect.Record.map(({ tableDefinition }) => tableDefinition), convex_server.defineSchema)
});
const make = (schema, spec) => makeProto({
	schema,
	spec
});

//#endregion
Object.defineProperty(exports, 'Api_exports', {
  enumerable: true,
  get: function () {
    return Api_exports;
  }
});
exports.TypeId = TypeId;
exports.isApi = isApi;
exports.make = make;
//# sourceMappingURL=Api.cjs.map