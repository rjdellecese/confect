import { __export } from "../_virtual/rolldown_runtime.js";
import { Record, pipe } from "effect";

//#region src/api/Refs.ts
var Refs_exports = /* @__PURE__ */ __export({
	getConvexFunctionName: () => getConvexFunctionName,
	getFunction: () => getFunction,
	justInternal: () => justInternal,
	justPublic: () => justPublic,
	make: () => make
});
const justInternal = (refs) => refs;
const justPublic = (refs) => refs;
const HiddenFunctionKey = "@rjdellecese/confect/api/HiddenFunctionKey";
const getFunction = (ref) => ref[HiddenFunctionKey];
const HiddenConvexFunctionNameKey = "@rjdellecese/confect/api/HiddenConvexFunctionNameKey";
const getConvexFunctionName = (ref) => ref[HiddenConvexFunctionNameKey];
const makeRef = (convexFunctionName, function_) => ({
	[HiddenFunctionKey]: function_,
	[HiddenConvexFunctionNameKey]: convexFunctionName
});
const make = (spec) => makeHelper(spec.groups);
const makeHelper = (groups, groupPath = null) => pipe(groups, Record.map((group) => {
	const currentGroupPath = groupPath ? `${groupPath}/${group.name}` : group.name;
	return Record.union(makeHelper(group.groups, currentGroupPath), Record.map(group.functions, (function_) => makeRef(`${currentGroupPath}:${function_.name}`, function_)), (_subGroup, _function) => {
		throw new Error(`Group and function at same level have same name ('${getConvexFunctionName(_function)}')`);
	});
}));

//#endregion
export { Refs_exports, getConvexFunctionName, getFunction, justInternal, justPublic, make };
//# sourceMappingURL=Refs.js.map