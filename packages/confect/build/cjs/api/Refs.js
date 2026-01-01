const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/api/Refs.ts
var Refs_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
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
const makeHelper = (groups, groupPath = null) => (0, effect.pipe)(groups, effect.Record.map((group) => {
	const currentGroupPath = groupPath ? `${groupPath}/${group.name}` : group.name;
	return effect.Record.union(makeHelper(group.groups, currentGroupPath), effect.Record.map(group.functions, (function_) => makeRef(`${currentGroupPath}:${function_.name}`, function_)), (_subGroup, _function) => {
		throw new Error(`Group and function at same level have same name ('${getConvexFunctionName(_function)}')`);
	});
}));

//#endregion
Object.defineProperty(exports, 'Refs_exports', {
  enumerable: true,
  get: function () {
    return Refs_exports;
  }
});
exports.getConvexFunctionName = getConvexFunctionName;
exports.getFunction = getFunction;
exports.justInternal = justInternal;
exports.justPublic = justPublic;
exports.make = make;
//# sourceMappingURL=Refs.cjs.map