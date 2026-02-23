import { Impl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { databaseReader } from "./impl/databaseReader";
import { groups } from "./impl/groups";

export default Impl.make(api).pipe(
  Layer.provide(Layer.mergeAll(groups, databaseReader)),
  Impl.finalize,
);
