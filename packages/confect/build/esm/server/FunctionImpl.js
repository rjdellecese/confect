import { __export } from "../_virtual/rolldown_runtime.js";
import { setNestedProperty } from "../internal/utils.js";
import { Registry } from "./Registry.js";
import { make as make$1 } from "./RegistryItem.js";
import { Array, Context, Effect, Layer, Ref, String } from "effect";

//#region src/server/FunctionImpl.ts
var FunctionImpl_exports = /* @__PURE__ */ __export({
	FunctionImpl: () => FunctionImpl,
	make: () => make
});
const FunctionImpl = ({ groupPath, functionName }) => Context.GenericTag(`@rjdellecese/confect/server/FunctionImpl/${groupPath}/${functionName}`);
const make = (api, groupPath, functionName, handler) => {
	const groupPathParts = String.split(groupPath, ".");
	const [firstGroupPathPart, ...restGroupPathParts] = groupPathParts;
	const function_ = Array.reduce(restGroupPathParts, api.spec.groups[firstGroupPathPart], (currentGroup, groupPathPart) => currentGroup.groups[groupPathPart]).functions[functionName];
	return Layer.effect(FunctionImpl({
		groupPath,
		functionName
	}), Effect.gen(function* () {
		const registry = yield* Registry;
		yield* Ref.update(registry, (registryItems) => setNestedProperty(registryItems, [...groupPathParts, functionName], make$1({
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
export { FunctionImpl, FunctionImpl_exports, make };
//# sourceMappingURL=FunctionImpl.js.map