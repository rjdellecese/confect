import { __export } from "../_virtual/rolldown_runtime.js";
import { Predicate, Record } from "effect";

//#region src/api/Spec.ts
var Spec_exports = /* @__PURE__ */ __export({
	TypeId: () => TypeId,
	isSpec: () => isSpec,
	make: () => make
});
const TypeId = "@rjdellecese/confect/api/Spec";
const isSpec = (u) => Predicate.hasProperty(u, TypeId);
const Proto = {
	[TypeId]: TypeId,
	add(group) {
		const group_ = group;
		return makeProto({ groups: Record.set(this.groups, group_.name, group_) });
	}
};
const makeProto = ({ groups }) => Object.assign(Object.create(Proto), { groups });
const make = () => makeProto({ groups: Record.empty() });

//#endregion
export { Spec_exports, TypeId, isSpec, make };
//# sourceMappingURL=Spec.js.map