import { Effect, Layer, Schema } from "effect";
import * as ConfectApiFunctionSpec from "../../src/api/FunctionSpec";
import * as ConfectApiGroupSpec from "../../src/api/GroupSpec";
import * as ConfectApiRefs from "../../src/api/Refs";
import * as ConfectApiSpec from "../../src/api/Spec";
import * as ConfectApi from "../../src/server/Api";
import * as ConfectDatabaseReader from "../../src/server/DatabaseReader";
import * as ConfectDatabaseWriter from "../../src/server/DatabaseWriter";
import * as ConfectApiFunctionImpl from "../../src/server/FunctionImpl";
import * as ConfectApiGroupImpl from "../../src/server/GroupImpl";
import * as ConfectImpl from "../../src/server/Impl";
import * as DatabaseSchema from "../../src/server/DatabaseSchema";
import * as ConfectApiServer from "../../src/server/Server";
import * as ConfectTable from "../../src/server/Table";

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

const confectSchema = DatabaseSchema.make().addTable(
  ConfectTable.make(
    "notes",
    Schema.Struct({
      content: Schema.String,
    }),
  ),
);

type MyConfectSchema = typeof confectSchema;

const Spec = ConfectApiSpec.make().add(GroupA).add(GroupB);

type Spec = typeof Spec;

type Groups = ConfectApiSpec.Spec.Groups<Spec>;
type GroupNames = ConfectApiGroupSpec.GroupSpec.Name<Groups>;

const Api = ConfectApi.make(confectSchema, Spec);

type GroupPath = ConfectApiGroupSpec.Path.All<ConfectApiSpec.Spec.Groups<Spec>>;

// GroupA function implementations
const MyFunction = ConfectApiFunctionImpl.make(
  Api,
  "groupA",
  "myFunction",
  (_args) =>
    Effect.gen(function* () {
      const _reader =
        yield* ConfectDatabaseReader.DatabaseReader<MyConfectSchema>();
      const _writer =
        yield* ConfectDatabaseWriter.DatabaseWriter<MyConfectSchema>();

      const _a = yield* _reader.table("notes").index("by_id", "asc").collect();

      return yield* Effect.succeed("test");
    }).pipe(Effect.orDie),
);

const MyFunction2 = ConfectApiFunctionImpl.make(
  Api,
  "groupA",
  "myFunction2",
  (args) => Effect.succeed(`foo: ${args.foo}`),
);

const GroupAImpl = ConfectApiGroupImpl.make(Api, "groupA").pipe(
  Layer.provide(MyFunction),
  Layer.provide(MyFunction2),
);

// GroupBC function implementations
const MyFunction3 = ConfectApiFunctionImpl.make(
  Api,
  "groupB.groupBC",
  "myFunction3",
  (args) => Effect.succeed(`foo: ${args.foo}`),
);

const GroupBCImpl = ConfectApiGroupImpl.make(Api, "groupB.groupBC").pipe(
  Layer.provide(MyFunction3),
);

// GroupBDE function implementations
const MyFunction5 = ConfectApiFunctionImpl.make(
  Api,
  "groupB.groupBD.groupBDE",
  "myFunction5",
  () => Effect.succeed("myFunction5"),
);

const GroupBDEImpl = ConfectApiGroupImpl.make(
  Api,
  "groupB.groupBD.groupBDE",
).pipe(Layer.provide(MyFunction5));

// GroupBD function implementations
const MyFunction4 = ConfectApiFunctionImpl.make(
  Api,
  "groupB.groupBD",
  "myFunction4",
  (args) => Effect.succeed(`foo: ${args.foo}`),
);

const GroupBDImpl = ConfectApiGroupImpl.make(Api, "groupB.groupBD").pipe(
  Layer.provide(MyFunction4),
  Layer.provide(GroupBDEImpl),
);

// GroupB implementation (no direct functions, just subgroups)
const GroupBImpl = ConfectApiGroupImpl.make(Api, "groupB").pipe(
  Layer.provide(GroupBCImpl),
  Layer.provide(GroupBDImpl),
);

const Impl = ConfectImpl.make(Api).pipe(
  Layer.provide(GroupAImpl),
  Layer.provide(GroupBImpl),
);

const _server = ConfectApiServer.make(Api)
  .pipe(Effect.provide(Impl), Effect.runPromise)
  .then((s) => {
    console.log(s);
  });

const refs = ConfectApiRefs.make(Spec);

console.dir(refs, { depth: null, colors: true });

const _a = refs.groupB.groupBC.myFunction3;
