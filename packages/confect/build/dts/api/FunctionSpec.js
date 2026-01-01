import { __export } from "../_virtual/rolldown_runtime.js";
import { validateJsIdentifier } from "../internal/utils.js";
import { Predicate } from "effect";

//#region src/api/FunctionSpec.ts
var FunctionSpec_exports = /* @__PURE__ */ __export({
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
const isFunctionSpec = (u) => Predicate.hasProperty(u, TypeId);
const Proto = { [TypeId]: TypeId };
const make = (functionType, functionVisibility) => ({ name, args, returns }) => {
	validateJsIdentifier(name);
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
export { FunctionSpec_exports, TypeId, action, internalAction, internalMutation, internalQuery, isFunctionSpec, mutation, query };
//# sourceMappingURL=FunctionSpec.js.map