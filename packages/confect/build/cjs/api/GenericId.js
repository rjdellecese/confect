const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/api/GenericId.ts
var GenericId_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	GenericId: () => GenericId,
	tableName: () => tableName
});
const ConvexId = Symbol.for("ConvexId");
const GenericId = (tableName$1) => effect.Schema.String.pipe(effect.Schema.annotations({ [ConvexId]: tableName$1 }));
const tableName = (ast) => effect.SchemaAST.getAnnotation(ConvexId)(ast);

//#endregion
exports.GenericId = GenericId;
Object.defineProperty(exports, 'GenericId_exports', {
  enumerable: true,
  get: function () {
    return GenericId_exports;
  }
});
exports.tableName = tableName;
//# sourceMappingURL=GenericId.cjs.map