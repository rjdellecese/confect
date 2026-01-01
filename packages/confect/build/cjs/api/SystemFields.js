const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_api_GenericId = require('./GenericId.js');
let effect = require("effect");

//#region src/api/SystemFields.ts
var SystemFields_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	SystemFields: () => SystemFields,
	extendWithSystemFields: () => extendWithSystemFields
});
/**
* Produces a schema for Convex system fields.
*/
const SystemFields = (tableName) => effect.Schema.Struct({
	_id: require_api_GenericId.GenericId(tableName),
	_creationTime: effect.Schema.Number
});
/**
* Extend a table schema with Convex system fields.
*/
const extendWithSystemFields = (tableName, schema) => effect.Schema.extend(SystemFields(tableName), schema);

//#endregion
exports.SystemFields = SystemFields;
Object.defineProperty(exports, 'SystemFields_exports', {
  enumerable: true,
  get: function () {
    return SystemFields_exports;
  }
});
exports.extendWithSystemFields = extendWithSystemFields;
//# sourceMappingURL=SystemFields.cjs.map