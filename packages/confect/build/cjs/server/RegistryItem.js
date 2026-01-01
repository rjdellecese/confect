const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/RegistryItem.ts
var RegistryItem_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	RegistryItemTypeId: () => RegistryItemTypeId,
	isRegistryItem: () => isRegistryItem,
	make: () => make
});
const RegistryItemTypeId = "@rjdellecese/confect/server/RegistryItem";
const isRegistryItem = (value) => effect.Predicate.hasProperty(value, RegistryItemTypeId);
const RegistryItemProto = { [RegistryItemTypeId]: RegistryItemTypeId };
const make = ({ function_, handler }) => Object.assign(Object.create(RegistryItemProto), {
	function_,
	handler
});

//#endregion
exports.RegistryItemTypeId = RegistryItemTypeId;
Object.defineProperty(exports, 'RegistryItem_exports', {
  enumerable: true,
  get: function () {
    return RegistryItem_exports;
  }
});
exports.isRegistryItem = isRegistryItem;
exports.make = make;
//# sourceMappingURL=RegistryItem.cjs.map