import { GroupSpec, Spec } from "@confect/core";
import cacheControl from "../groups/cacheControl.spec";
import cacheStubbed from "../groups/cacheStubbed.spec";

export default Spec.make().addAt("groups", GroupSpec.makeAt("groups").addGroupAt("cacheControl", cacheControl).addGroupAt("cacheStubbed", cacheStubbed));
