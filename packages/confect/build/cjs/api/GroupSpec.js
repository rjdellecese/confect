const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_internal_utils = require('../internal/utils.js');
let effect = require("effect");

//#region src/api/GroupSpec.ts
var GroupSpec_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	TypeId: () => TypeId,
	isGroupSpec: () => isGroupSpec,
	make: () => make
});
const TypeId = "@rjdellecese/confect/api/GroupSpec";
const isGroupSpec = (u) => effect.Predicate.hasProperty(u, TypeId);
const Proto = {
	[TypeId]: TypeId,
	addFunction(function_) {
		const this_ = this;
		return makeProto({
			name: this_.name,
			functions: effect.Record.set(this_.functions, function_.name, function_),
			groups: this_.groups
		});
	},
	addGroup(group) {
		const this_ = this;
		const group_ = group;
		return makeProto({
			name: this_.name,
			functions: this_.functions,
			groups: effect.Record.set(this_.groups, group_.name, group_)
		});
	}
};
const makeProto = ({ name, functions, groups }) => Object.assign(Object.create(Proto), {
	name,
	functions,
	groups
});
const make = (name) => {
	require_internal_utils.validateJsIdentifier(name);
	return makeProto({
		name,
		functions: effect.Record.empty(),
		groups: effect.Record.empty()
	});
};

//#endregion
Object.defineProperty(exports, 'GroupSpec_exports', {
  enumerable: true,
  get: function () {
    return GroupSpec_exports;
  }
});
exports.TypeId = TypeId;
exports.isGroupSpec = isGroupSpec;
exports.make = make;
//# sourceMappingURL=GroupSpec.cjs.map