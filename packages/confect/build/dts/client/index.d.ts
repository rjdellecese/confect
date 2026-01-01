import { Ref as Ref$1 } from "../api/Refs.js";
import { Effect, Option } from "effect";

//#region src/client/index.d.ts
declare const useQuery: <Query extends Ref$1.AnyPublicQuery>(ref: Query, args: Ref$1.Args<Query>["Type"]) => Option.Option<Ref$1.Returns<Query>["Type"]>;
declare const useMutation: <Mutation extends Ref$1.AnyPublicMutation>(ref: Mutation) => (args: Ref$1.Args<Mutation>["Type"]) => Effect.Effect<Ref$1.Returns<Mutation>["Type"]>;
declare const useAction: <Action extends Ref$1.AnyPublicAction>(ref: Action) => (args: Ref$1.Args<Action>["Type"]) => Effect.Effect<Ref$1.Returns<Action>["Type"]>;
//#endregion
export { useAction, useMutation, useQuery };
//# sourceMappingURL=index.d.ts.map