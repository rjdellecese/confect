const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_internal_utils = require('../internal/utils.js');
const require_server_Registry = require('./Registry.js');
const require_server_RegistryItem = require('./RegistryItem.js');
let effect = require("effect");

//#region src/server/FunctionImpl.ts
var FunctionImpl_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	FunctionImpl: () => FunctionImpl,
	make: () => make
});
const FunctionImpl = ({ groupPath, functionName }) => effect.Context.GenericTag(`@rjdellecese/confect/server/FunctionImpl/${groupPath}/${functionName}`);
const make = (api, groupPath, functionName, handler) => {
	const groupPathParts = effect.String.split(groupPath, ".");
	const [firstGroupPathPart, ...restGroupPathParts] = groupPathParts;
	const function_ = effect.Array.reduce(restGroupPathParts, api.spec.groups[firstGroupPathPart], (currentGroup, groupPathPart) => currentGroup.groups[groupPathPart]).functions[functionName];
	return effect.Layer.effect(FunctionImpl({
		groupPath,
		functionName
	}), effect.Effect.gen(function* () {
		const registry = yield* require_server_Registry.Registry;
		yield* effect.Ref.update(registry, (registryItems) => require_internal_utils.setNestedProperty(registryItems, [...groupPathParts, functionName], require_server_RegistryItem.make({
			function_,
			handler
		})));
		return {
			groupPath,
			functionName
		};
	}));
};

//#endregion
exports.FunctionImpl = FunctionImpl;
Object.defineProperty(exports, 'FunctionImpl_exports', {
  enumerable: true,
  get: function () {
    return FunctionImpl_exports;
  }
});
exports.make = make;
//# sourceMappingURL=FunctionImpl.cjs.map