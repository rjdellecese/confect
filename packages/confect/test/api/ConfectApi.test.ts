import { Effect, Layer, Schema } from "effect";
import * as ConfectApiFunctionSpec from "../../src/api/ConfectApiFunctionSpec";
import * as ConfectApiGroupSpec from "../../src/api/ConfectApiGroupSpec";
import * as ConfectApiRefs from "../../src/api/ConfectApiRefs";
import * as ConfectApiSpec from "../../src/api/ConfectApiSpec";
import * as ConfectApi from "../../src/server/ConfectApi";
import * as ConfectApiGroupImpl from "../../src/server/ConfectApiGroupImpl";
import * as ConfectApiImpl from "../../src/server/ConfectApiImpl";
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
    ConfectApiFunctionSpec.mutation({
      name: "myFunction",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    }),
  )
  .addFunction(
    ConfectApiFunctionSpec.query({
      name: "myFunction2",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    }),
  );

const GroupBC = ConfectApiGroupSpec.make("groupBC").addFunction(
  ConfectApiFunctionSpec.query({
    name: "myFunction3",
    args: Schema.Struct({ foo: Schema.Number }),
    returns: Schema.String,
  }),
);

const GroupBDE = ConfectApiGroupSpec.make("groupBDE").addFunction(
  ConfectApiFunctionSpec.query({
    name: "myFunction5",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);

const GroupBD = ConfectApiGroupSpec.make("groupBD")
  .addFunction(
    ConfectApiFunctionSpec.query({
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

const GroupAImpl = ConfectApiGroupImpl.make(Api, "groupA", (handlers) =>
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

const GroupBCImpl = ConfectApiGroupImpl.make(
  Api,
  "groupB.groupBC",
  (handlers) =>
    handlers.handle("myFunction3", (args) =>
      Effect.succeed(`foo: ${args.foo}`),
    ),
);

const GroupBDEImpl = ConfectApiGroupImpl.make(
  Api,
  "groupB.groupBD.groupBDE",
  (handlers) =>
    handlers.handle("myFunction5", () => Effect.succeed("myFunction5")),
);

const GroupBDImpl = ConfectApiGroupImpl.make(
  Api,
  "groupB.groupBD",
  (handlers) =>
    handlers.handle("myFunction4", (args) =>
      Effect.succeed(`foo: ${args.foo}`),
    ),
).pipe(Layer.provide(GroupBDEImpl));

const GroupBImpl = ConfectApiGroupImpl.make(
  Api,
  "groupB",
  (handlers) => handlers,
).pipe(Layer.provide(GroupBCImpl), Layer.provide(GroupBDImpl));

const ApiImpl = ConfectApiImpl.make(Api).pipe(
  Layer.provide(GroupAImpl),
  Layer.provide(GroupBImpl),
);

const _server = ConfectApiServer.make(Api)
  .pipe(Effect.provide(ApiImpl), Effect.runPromise)
  .then((s) => {
    console.log(s);
  });

const refs = ConfectApiRefs.make(Spec);

console.dir(refs, { depth: null, colors: true });

const _a = refs.groupB.groupBC.myFunction3;
