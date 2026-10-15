import { ConvexFunctionDefinitions } from "@confect/server";
import * as Match from "effect/Match";
import * as Record from "effect/Record";
import databaseSchema from "../../schema";
import middlewareOptions from "../../../groups/middlewareOptions.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const forwardHandlers = (definitions: ConvexFunctionDefinitions.Definitions): ConvexFunctionDefinitions.Definitions => Record.map(definitions, (value) =>
  ConvexFunctionDefinitions.isDefinition(value)
    ? Match.value(value).pipe(
        Match.tag("PublicQuery", "InternalQuery", (query) => ({ ...query, definition: { ...query.definition, handler: forward(query.definition.handler) } })),
        Match.tag("PublicMutation", "InternalMutation", (mutation) => ({ ...mutation, definition: { ...mutation.definition, handler: forward(mutation.definition.handler) } })),
        Match.tag("PublicAction", "InternalAction", (action) => ({ ...action, definition: { ...action.definition, handler: forward(action.definition.handler) } })),
        Match.tag("Registered", (registered) => registered),
        Match.exhaustive,
      )
    : forwardHandlers(value),
);

export default ConvexFunctionDefinitions.register<typeof import("../../../groups/middlewareOptions.spec")["default"]>(forwardHandlers(ConvexFunctionDefinitions.buildForGroup(databaseSchema, middlewareOptions)));
