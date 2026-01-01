import { __export } from "../_virtual/rolldown_runtime.js";
import { Context, Effect, Layer } from "effect";

//#region src/server/GroupImpl.ts
var GroupImpl_exports = /* @__PURE__ */ __export({
	GroupImpl: () => GroupImpl,
	make: () => make
});
const GroupImpl = ({ groupPath }) => Context.GenericTag(`@rjdellecese/confect/server/GroupImpl/${groupPath}`);
const make = (_api, groupPath) => {
	return Layer.effect(GroupImpl({ groupPath }), Effect.gen(function* () {
		yield* Effect.void;
		return { groupPath };
	}));
};

//#endregion
export { GroupImpl, GroupImpl_exports, make };
//# sourceMappingURL=GroupImpl.js.map