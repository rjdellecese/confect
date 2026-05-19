import { Spec } from "@confect/core";
import { databaseReader } from "./databaseReader.spec";
import { groups } from "./groups.spec";

export default Spec.make().add(groups).add(databaseReader);
