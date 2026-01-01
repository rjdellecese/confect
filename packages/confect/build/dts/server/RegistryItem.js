import { __export } from "../_virtual/rolldown_runtime.js";
import { Predicate } from "effect";

//#region src/server/RegistryItem.ts
var RegistryItem_exports = /* @__PURE__ */ __export({
	RegistryItemTypeId: () => RegistryItemTypeId,
	isRegistryItem: () => isRegistryItem,
	make: () => make
});
const RegistryItemTypeId = "@rjdellecese/confect/server/RegistryItem";
const isRegistryItem = (value) => Predicate.hasProperty(value, RegistryItemTypeId);
const RegistryItemProto = { [RegistryItemTypeId]: RegistryItemTypeId };
const make = ({ function_, handler }) => Object.assign(Object.create(RegistryItemProto), {
	function_,
	handler
});

//#endregion
export { RegistryItemTypeId, RegistryItem_exports, isRegistryItem, make };
//# sourceMappingURL=RegistryItem.js.map