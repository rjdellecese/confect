const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/api/Spec.ts
var Spec_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	TypeId: () => TypeId,
	isSpec: () => isSpec,
	make: () => make
});
const TypeId = "@rjdellecese/confect/api/Spec";
const isSpec = (u) => effect.Predicate.hasProperty(u, TypeId);
const Proto = {
	[TypeId]: TypeId,
	add(group) {
		const group_ = group;
		return makeProto({ groups: effect.Record.set(this.groups, group_.name, group_) });
	}
};
const makeProto = ({ groups }) => Object.assign(Object.create(Proto), { groups });
const make = () => makeProto({ groups: effect.Record.empty() });

//#endregion
Object.defineProperty(exports, 'Spec_exports', {
  enumerable: true,
  get: function () {
    return Spec_exports;
  }
});
exports.TypeId = TypeId;
exports.isSpec = isSpec;
exports.make = make;
//# sourceMappingURL=Spec.cjs.map