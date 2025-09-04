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

const Group = ConfectApiGroup.make("group")
  .add(
    ConfectApiFunction.make({
      name: "myFunction",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    })
  )
  .add(
    ConfectApiFunction.make({
      name: "myFunction2",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    })
  );

const Group2 = ConfectApiGroup.make("group2").add(
  ConfectApiFunction.make({
    name: "myFunction3",
    args: Schema.Struct({ foo: Schema.Number }),
    returns: Schema.String,
  })
);

const confectSchemaDefinition = defineConfectSchema({
  notes: defineConfectTable(
    Schema.Struct({
      content: Schema.String,
    })
  ),
});

const Api = ConfectApi.make("Api").add(Group).add(Group2);

const ApiWithDatabaseSchema = ConfectApiWithDatabaseSchema.make(
  confectSchemaDefinition,
  Api
);

const GroupLive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "group",
  (handlers) =>
    handlers
      .handle("myFunction", (args) => Effect.succeed(`foo: ${args.foo}`))
      .handle("myFunction2", (args) => Effect.succeed(`foo: ${args.foo}`))
);

const Group2Live = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "group2",
  (handlers) =>
    handlers.handle("myFunction3", (args) => Effect.succeed(`foo: ${args.foo}`))
);

const ApiLive = ConfectApiBuilder.api(ApiWithDatabaseSchema).pipe(
  Layer.provide(GroupLive),
  Layer.provide(Group2Live)
);

const client = ConfectApiClient.make(
  Api,
  new ConvexReactClient("http://localhost:3000")
);

const myFunctionResult = client.group.myFunction({ foo: 1 });

const server = ConfectApiServer.make(ApiWithDatabaseSchema, ApiLive);
