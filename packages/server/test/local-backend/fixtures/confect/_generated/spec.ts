import { GroupSpec, Spec } from "@confect/core";
import groups_cacheControl from "../groups/cacheControl.spec";
import groups_cacheStubbed from "../groups/cacheStubbed.spec";

export default Spec.make().addPath(groups_cacheControl, "groups.cacheControl").addPath(groups_cacheStubbed, "groups.cacheStubbed").addAt("groups", GroupSpec.makeAt("groups").addGroupAt("cacheControl", groups_cacheControl).addGroupAt("cacheStubbed", groups_cacheStubbed));
