import { Effect, Layer, Schema } from "effect";
import * as ConfectApiFunction from "../../src/api/ConfectApiFunction";
import * as ConfectApiGroupSpec from "../../src/api/ConfectApiGroupSpec";
import * as ConfectApiRefs from "../../src/api/ConfectApiRefs";
import * as ConfectApiSpec from "../../src/api/ConfectApiSpec";
import * as ConfectApi from "../../src/server/ConfectApi";
import * as ConfectApiBuilder from "../../src/server/ConfectApiBuilder";
import * as ConfectApiServer from "../../src/server/ConfectApiServer";
import * as ConfectDatabaseReader from "../../src/server/ConfectDatabaseReader";
import * as ConfectDatabaseWriter from "../../src/server/ConfectDatabaseWriter";
import * as ConfectSchema from "../../src/server/ConfectSchema";
import * as ConfectTable from "../../src/server/ConfectTable";

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

const GroupA = ConfectApiGroupSpec.make("groupA")
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

const GroupBC = ConfectApiGroupSpec.make("groupBC").addFunction(
  ConfectApiFunction.query({
    name: "myFunction3",
    args: Schema.Struct({ foo: Schema.Number }),
    returns: Schema.String,
  }),
);

const GroupBDE = ConfectApiGroupSpec.make("groupBDE").addFunction(
  ConfectApiFunction.query({
    name: "myFunction5",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);

const GroupBD = ConfectApiGroupSpec.make("groupBD")
  .addFunction(
    ConfectApiFunction.query({
      name: "myFunction4",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    }),
  )
  .addGroup(GroupBDE);

const GroupB = ConfectApiGroupSpec.make("groupB")
  .addGroup(GroupBC)
  .addGroup(GroupBD);

const confectSchema = ConfectSchema.make().addTable(
  ConfectTable.make({
    name: "notes",
    fields: Schema.Struct({
      content: Schema.String,
    }),
  }),
);

type MyConfectSchema = typeof confectSchema;

const Spec = ConfectApiSpec.make().add(GroupA).add(GroupB);

type Spec = typeof Spec;

type Groups = ConfectApiSpec.ConfectApiSpec.Groups<Spec>;
type GroupNames = ConfectApiGroupSpec.ConfectApiGroupSpec.Name<Groups>;

const Api = ConfectApi.make(confectSchema, Spec);

type GroupPath = ConfectApiGroupSpec.Path.All<
  ConfectApiSpec.ConfectApiSpec.Groups<Spec>
>;

const GroupALive = ConfectApiBuilder.group(Api, "groupA", (handlers) =>
  handlers
    .handle("myFunction", (_args) =>
      Effect.gen(function* () {
        const _reader =
          yield* ConfectDatabaseReader.ConfectDatabaseReader<MyConfectSchema>();
        const _writer =
          yield* ConfectDatabaseWriter.ConfectDatabaseWriter<MyConfectSchema>();

        const _a = yield* _reader
          .table("notes")
          .index("by_id", "asc")
          .collect();

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

const _server = ConfectApiServer.make(Api)
  .pipe(Effect.provide(ApiLive), Effect.runPromise)
  .then((s) => {
    console.log(s);
  });

const refs = ConfectApiRefs.make(Spec);

console.dir(refs, { depth: null, colors: true });

const _a = refs.groupB.groupBC.myFunction3;
