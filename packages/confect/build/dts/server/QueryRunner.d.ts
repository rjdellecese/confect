import { Ref as Ref$1 } from "../api/Refs.js";
import { Context, Effect, Layer, ParseResult } from "effect";
import { GenericQueryCtx } from "convex/server";

//#region src/server/QueryRunner.d.ts
declare namespace QueryRunner_d_exports {
  export { QueryRunner, layer };
}
declare const QueryRunner: Context.Tag<(<Query extends Ref$1.AnyQuery>(query: Query, args: Ref$1.Args<Query>["Type"]) => Effect.Effect<Ref$1.Returns<Query>["Type"], ParseResult.ParseError>), <Query extends Ref$1.AnyQuery>(query: Query, args: Ref$1.Args<Query>["Type"]) => Effect.Effect<Ref$1.Returns<Query>["Type"], ParseResult.ParseError>>;
type QueryRunner = typeof QueryRunner.Identifier;
declare const layer: (runQuery: GenericQueryCtx<any>["runQuery"]) => Layer.Layer<(<Query extends Ref$1.AnyQuery>(query: Query, args: Ref$1.Args<Query>["Type"]) => Effect.Effect<Ref$1.Returns<Query>["Type"], ParseResult.ParseError>), never, never>;
//#endregion
export { QueryRunner, QueryRunner_d_exports, layer };
//# sourceMappingURL=QueryRunner.d.ts.map