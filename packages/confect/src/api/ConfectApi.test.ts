import { Effect, Layer, Schema } from "effect";
import * as ConfectDatabaseReader from "../server/ConfectDatabaseReader";
import * as ConfectDatabaseWriter from "../server/ConfectDatabaseWriter";
import * as ConfectSchema from "../server/ConfectSchema";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiFunction from "./ConfectApiFunction";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiRefs from "./ConfectApiRefs";
import * as ConfectApiServer from "./ConfectApiServer";
import * as ConfectApiSpec from "./ConfectApiSpec";

/*
 * api
 * ├── groupA
 * │   ├── myFunction
 * │   └── myFunction2
 * └── groupB
 *     ├── groupBC
 *     │   └── myFunction3
 *     └── groupBD
 *         ├── myFunction4
 *         └── groupBDE
 *             └── myFunction5
 */

const GroupA = ConfectApiGroup.make("groupA")
  .addFunction(
    ConfectApiFunction.mutation({
      name: "myFunction",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    }),
  )
  .addFunction(
    ConfectApiFunction.query({
      name: "myFunction2",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    }),
  );

const GroupBC = ConfectApiGroup.make("groupBC").addFunction(
  ConfectApiFunction.query({
    name: "myFunction3",
    args: Schema.Struct({ foo: Schema.Number }),
    returns: Schema.String,
  }),
);

const GroupBDE = ConfectApiGroup.make("groupBDE").addFunction(
  ConfectApiFunction.query({
    name: "myFunction5",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);

const GroupBD = ConfectApiGroup.make("groupBD")
  .addFunction(
    ConfectApiFunction.query({
      name: "myFunction4",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    }),
  )
  .addGroup(GroupBDE);

const GroupB = ConfectApiGroup.make("groupB")
  .addGroup(GroupBC)
  .addGroup(GroupBD);

const confectSchemaDefinition = ConfectSchema.defineConfectSchema(
  ConfectSchema.defineConfectTable({
    name: "notes",
    fields: Schema.Struct({
      content: Schema.String,
    }),
  }),
);

type ConfectSchemaDefinition = typeof confectSchemaDefinition;

const Spec = ConfectApiSpec.make("api").add(GroupA).add(GroupB);

const Api = ConfectApi.make(confectSchemaDefinition, Spec);

const GroupALive = ConfectApiBuilder.group(Api, "groupA", (handlers) =>
  handlers
    .handle("myFunction", (args) =>
      Effect.gen(function* () {
        const reader =
          yield* ConfectDatabaseReader.ConfectDatabaseReader<ConfectSchemaDefinition>();
        const writer =
          yield* ConfectDatabaseWriter.ConfectDatabaseWriter<ConfectSchemaDefinition>();

        const a = yield* reader.table("notes").index("by_id", "asc").collect();

        return yield* Effect.succeed("test");
      }).pipe(Effect.orDie),
    )
    .handle("myFunction2", (args) => Effect.succeed(`foo: ${args.foo}`)),
);

const GroupBCLive = ConfectApiBuilder.group(Api, "groupB.groupBC", (handlers) =>
  handlers.handle("myFunction3", (args) => Effect.succeed(`foo: ${args.foo}`)),
);

const GroupBDELive = ConfectApiBuilder.group(
  Api,
  "groupB.groupBD.groupBDE",
  (handlers) =>
    handlers.handle("myFunction5", () => Effect.succeed("myFunction5")),
);

const GroupBDLive = ConfectApiBuilder.group(Api, "groupB.groupBD", (handlers) =>
  handlers.handle("myFunction4", (args) => Effect.succeed(`foo: ${args.foo}`)),
).pipe(Layer.provide(GroupBDELive));

const GroupBLive = ConfectApiBuilder.group(
  Api,
  "groupB",
  (handlers) => handlers,
).pipe(Layer.provide(GroupBCLive), Layer.provide(GroupBDLive));

const ApiLive = ConfectApiBuilder.api(Api).pipe(
  Layer.provide(GroupALive),
  Layer.provide(GroupBLive),
);

const server = ConfectApiServer.make
  .pipe(Effect.provide(ApiLive), Effect.runPromise)
  .then((s) => {
    console.log(s);
  });

const refs = ConfectApiRefs.make(Spec);

console.dir(refs, { depth: null, colors: true });

const a = refs.groupB.groupBC.myFunction3;
