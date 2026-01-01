import { __export } from "../_virtual/rolldown_runtime.js";
import { validateJsIdentifier } from "../internal/utils.js";
import { Predicate, Record } from "effect";

//#region src/api/GroupSpec.ts
var GroupSpec_exports = /* @__PURE__ */ __export({
	TypeId: () => TypeId,
	isGroupSpec: () => isGroupSpec,
	make: () => make
});
const TypeId = "@rjdellecese/confect/api/GroupSpec";
const isGroupSpec = (u) => Predicate.hasProperty(u, TypeId);
const Proto = {
	[TypeId]: TypeId,
	addFunction(function_) {
		const this_ = this;
		return makeProto({
			name: this_.name,
			functions: Record.set(this_.functions, function_.name, function_),
			groups: this_.groups
		});
	},
	addGroup(group) {
		const this_ = this;
		const group_ = group;
		return makeProto({
			name: this_.name,
			functions: this_.functions,
			groups: Record.set(this_.groups, group_.name, group_)
		});
	}
};
const makeProto = ({ name, functions, groups }) => Object.assign(Object.create(Proto), {
	name,
	functions,
	groups
});
const make = (name) => {
	validateJsIdentifier(name);
	return makeProto({
		name,
		functions: Record.empty(),
		groups: Record.empty()
	});
};

//#endregion
export { GroupSpec_exports, TypeId, isGroupSpec, make };
//# sourceMappingURL=GroupSpec.js.map