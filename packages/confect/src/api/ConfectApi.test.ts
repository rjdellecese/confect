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

const Group2 = ConfectApiGroup.make("group2").addFunction(
  ConfectApiFunction.make("Query")({
    name: "myFunction3",
    args: Schema.Struct({ foo: Schema.Number }),
    returns: Schema.String,
  })
);

const Group5 = ConfectApiGroup.make("group5");

const Group3 = ConfectApiGroup.make("group3")
  .addFunction(
    ConfectApiFunction.make("Query")({
      name: "myFunction4",
      args: Schema.Struct({ foo: Schema.Number }),
      returns: Schema.String,
    })
  )
  .addGroup(Group5);

const Group4 = ConfectApiGroup.make("group4").addGroup(Group2).addGroup(Group3);

const confectSchemaDefinition = defineConfectSchema({
  notes: defineConfectTable(
    Schema.Struct({
      content: Schema.String,
    })
  ),
});

const Api = ConfectApi.make("Api").add(Group).add(Group4);

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

type GroupLiveSuccess = Layer.Layer.Success<typeof GroupLive>;
type GroupLiveError = Layer.Layer.Error<typeof GroupLive>;
type GroupLiveContext = Layer.Layer.Context<typeof GroupLive>;

const Group2Live = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "group4.group2",
  (handlers) =>
    handlers.handle("myFunction3", (args) => Effect.succeed(`foo: ${args.foo}`))
);

type Group2LiveSuccess = Layer.Layer.Success<typeof Group2Live>;
type Group2LiveError = Layer.Layer.Error<typeof Group2Live>;
type Group2LiveContext = Layer.Layer.Context<typeof Group2Live>;

const Group5Live = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "group4.group3.group5",
  (handlers) => handlers
);

type Group5LiveSuccess = Layer.Layer.Success<typeof Group5Live>;
type Group5LiveError = Layer.Layer.Error<typeof Group5Live>;
type Group5LiveContext = Layer.Layer.Context<typeof Group5Live>;

const Group3Live = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "group4.group3",
  (handlers) =>
    handlers.handle("myFunction4", (args) => Effect.succeed(`foo: ${args.foo}`))
).pipe(Layer.provide(Group5Live));

type Group3LiveSuccess = Layer.Layer.Success<typeof Group3Live>;
type Group3LiveError = Layer.Layer.Error<typeof Group3Live>;
type Group3LiveContext = Layer.Layer.Context<typeof Group3Live>;

const Group4Live = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "group4",
  (handlers) => handlers
).pipe(Layer.provide(Group2Live), Layer.provide(Group3Live));

type Group4LiveSuccess = Layer.Layer.Success<typeof Group4Live>;
type Group4LiveError = Layer.Layer.Error<typeof Group4Live>;
type Group4LiveContext = Layer.Layer.Context<typeof Group4Live>;

const ApiLive = ConfectApiBuilder.api(ApiWithDatabaseSchema).pipe(
  Layer.provide(GroupLive),
  Layer.provide(Group4Live)
);

type ApiLiveSuccess = Layer.Layer.Success<typeof ApiLive>;
type ApiLiveError = Layer.Layer.Error<typeof ApiLive>;
type ApiLiveContext = Layer.Layer.Context<typeof ApiLive>;

const client = ConfectApiClient.make(
  Api,
  new ConvexReactClient("http://localhost:3000")
);

const myFunctionResult = client.group.myFunction({ foo: 1 });

const server = ConfectApiServer.make(ApiWithDatabaseSchema, ApiLive);
