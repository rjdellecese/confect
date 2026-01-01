import { RegistryItem } from "./RegistryItem.js";
import { Context, Ref } from "effect";

//#region src/server/Registry.d.ts
declare namespace Registry_d_exports {
  export { Registry, RegistryItems };
}
interface RegistryItems {
  readonly [key: string]: RegistryItem.AnyWithProps | RegistryItems;
}
declare const Registry_base: Context.ReferenceClass<Registry, "@rjdellecese/confect/server/Registry", Ref.Ref<RegistryItems>>;
declare class Registry extends Registry_base {}
//#endregion
export { Registry, RegistryItems, Registry_d_exports };
//# sourceMappingURL=Registry.d.ts.map