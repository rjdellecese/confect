const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/GroupImpl.ts
var GroupImpl_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	GroupImpl: () => GroupImpl,
	make: () => make
});
const GroupImpl = ({ groupPath }) => effect.Context.GenericTag(`@rjdellecese/confect/server/GroupImpl/${groupPath}`);
const make = (_api, groupPath) => {
	return effect.Layer.effect(GroupImpl({ groupPath }), effect.Effect.gen(function* () {
		yield* effect.Effect.void;
		return { groupPath };
	}));
};

//#endregion
exports.GroupImpl = GroupImpl;
Object.defineProperty(exports, 'GroupImpl_exports', {
  enumerable: true,
  get: function () {
    return GroupImpl_exports;
  }
});
exports.make = make;
//# sourceMappingURL=GroupImpl.cjs.map