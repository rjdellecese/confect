const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_internal_utils = require('../internal/utils.js');
let effect = require("effect");

//#region src/api/FunctionSpec.ts
var FunctionSpec_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	TypeId: () => TypeId,
	action: () => action,
	internalAction: () => internalAction,
	internalMutation: () => internalMutation,
	internalQuery: () => internalQuery,
	isFunctionSpec: () => isFunctionSpec,
	mutation: () => mutation,
	query: () => query
});
const TypeId = "@rjdellecese/confect/api/FunctionSpec";
const isFunctionSpec = (u) => effect.Predicate.hasProperty(u, TypeId);
const Proto = { [TypeId]: TypeId };
const make = (functionType, functionVisibility) => ({ name, args, returns }) => {
	require_internal_utils.validateJsIdentifier(name);
	return Object.assign(Object.create(Proto), {
		functionType,
		functionVisibility,
		name,
		args,
		returns
	});
};
const internalQuery = make("Query", "Internal");
const query = make("Query", "Public");
const internalMutation = make("Mutation", "Internal");
const mutation = make("Mutation", "Public");
const internalAction = make("Action", "Internal");
const action = make("Action", "Public");

//#endregion
Object.defineProperty(exports, 'FunctionSpec_exports', {
  enumerable: true,
  get: function () {
    return FunctionSpec_exports;
  }
});
exports.TypeId = TypeId;
exports.action = action;
exports.internalAction = internalAction;
exports.internalMutation = internalMutation;
exports.internalQuery = internalQuery;
exports.isFunctionSpec = isFunctionSpec;
exports.mutation = mutation;
exports.query = query;
//# sourceMappingURL=FunctionSpec.cjs.map