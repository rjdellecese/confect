import { ConvexReactClient } from "convex/react";
import { Effect, Layer, Schema } from "effect";
import { defineConfectSchema, defineConfectTable } from "../server";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiClient from "./ConfectApiClient";
import * as ConfectApiFunction from "./ConfectApiFunction";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiServer from "./ConfectApiServer";
import * as ConfectApiWithDatabaseSchema from "./ConfectApiWithDatabaseSchema";

/*
api
├── groupA
│   ├── myFunction
│   └── myFunction2
└── groupB
    ├── groupBC
    │   └── myFunction3
    └── groupBD
        ├── myFunction4
        └── groupBDE
            └── myFunction5
*/

const GroupA = ConfectApiGroup.make("groupA")
  .addFunction(
    ConfectApiFunction.make("Query")({
      name: "myFunction",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    })
  )
  .addFunction(
    ConfectApiFunction.make("Query")({
      name: "myFunction2",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    })
  );

const GroupBC = ConfectApiGroup.make("groupBC").addFunction(
  ConfectApiFunction.make("Query")({
    name: "myFunction3",
    args: Schema.Struct({ foo: Schema.Number }),
    returns: Schema.String,
  })
);

const GroupBDE = ConfectApiGroup.make("groupBDE").addFunction(
  ConfectApiFunction.make("Query")({
    name: "myFunction5",
    args: Schema.Struct({}),
    returns: Schema.String,
  })
);

const GroupBD = ConfectApiGroup.make("groupBD")
  .addFunction(
    ConfectApiFunction.make("Query")({
      name: "myFunction4",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    })
  )
  .addGroup(GroupBDE);

const GroupB = ConfectApiGroup.make("groupB")
  .addGroup(GroupBC)
  .addGroup(GroupBD);

const confectSchemaDefinition = defineConfectSchema({
  notes: defineConfectTable(
    Schema.Struct({
      content: Schema.String,
    })
  ),
});

const Api = ConfectApi.make("api").add(GroupA).add(GroupB);

const ApiWithDatabaseSchema = ConfectApiWithDatabaseSchema.make(
  confectSchemaDefinition,
  Api
);

const GroupALive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "groupA",
  (handlers) =>
    handlers
      .handle("myFunction", (args) => Effect.succeed(`foo: ${args.foo}`))
      .handle("myFunction2", (args) => Effect.succeed(`foo: ${args.foo}`))
);

const GroupBCLive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "groupB.groupBC",
  (handlers) =>
    handlers.handle("myFunction3", (args) => Effect.succeed(`foo: ${args.foo}`))
);

const GroupBDELive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "groupB.groupBD.groupBDE",
  (handlers) =>
    handlers.handle("myFunction5", () => Effect.succeed("myFunction5"))
);

const GroupBDLive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "groupB.groupBD",
  (handlers) =>
    handlers.handle("myFunction4", (args) => Effect.succeed(`foo: ${args.foo}`))
).pipe(Layer.provide(GroupBDELive));

const GroupBLive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "groupB",
  (handlers) => handlers
).pipe(Layer.provide(GroupBCLive), Layer.provide(GroupBDLive));

const ApiLive = ConfectApiBuilder.api(ApiWithDatabaseSchema).pipe(
  Layer.provide(GroupALive),
  Layer.provide(GroupBLive)
);

const client = ConfectApiClient.make(
  Api,
  new ConvexReactClient("http://localhost:3000")
);

const myFunctionResult = client.groupA.myFunction({ foo: 1 });

const server = ConfectApiServer.make(ApiWithDatabaseSchema, ApiLive).pipe(
  Effect.runPromise
);
