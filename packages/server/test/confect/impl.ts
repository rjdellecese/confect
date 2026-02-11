import { Impl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { databaseReader } from "./impl/databaseReader";
import { groups } from "./impl/groups";
import { notes } from "./impl/groups/notes";
import { random } from "./impl/groups/random";

export default Impl.make(api).pipe(
  Layer.provide(
    Layer.mergeAll(
      groups.pipe(Layer.provide(notes), Layer.provide(random)),
      databaseReader,
    ),
  ),
  Impl.finalize,
);
