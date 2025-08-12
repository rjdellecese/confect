import { Layer, Schema } from "effect";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiFunction from "./ConfectApiFunction";
import * as ConfectApiGroup from "./ConfectApiGroup";

const Group = ConfectApiGroup.make("Group")
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

const Api = ConfectApi.make("Api").add(Group);

const GroupLive = ConfectApiBuilder.group(Api, "Group", (handlers) =>
  handlers
    .handle("myFunction", (args) => `foo: ${args.foo}`)
    .handle("myFunction2", (args) => `foo: ${args.foo}`)
);

const ApiLive = ConfectApiBuilder.api(Api).pipe(Layer.provide(GroupLive));
