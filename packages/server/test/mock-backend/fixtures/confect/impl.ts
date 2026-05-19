import { Impl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { databaseReader } from "./databaseReader.impl";
import { groups } from "./groups.impl";

export default Impl.make(api).pipe(
  Layer.provide(Layer.mergeAll(groups, databaseReader)),
  Impl.finalize,
);
