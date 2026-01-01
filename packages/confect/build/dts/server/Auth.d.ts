import { Effect, Layer, Schema } from "effect";
import * as convex_server38 from "convex/server";
import { Auth as Auth$1 } from "convex/server";
import * as effect_Context2 from "effect/Context";
import * as effect_Cause2 from "effect/Cause";

//#region src/server/Auth.d.ts
declare namespace Auth_d_exports {
  export { Auth, NoUserIdentityFoundError, layer };
}
declare const Auth_base: effect_Context2.TagClass<Auth, "@rjdellecese/confect/server/Auth", {
  getUserIdentity: Effect.Effect<convex_server38.UserIdentity, NoUserIdentityFoundError, never>;
}> & Effect.Tag.Proxy<Auth, {
  getUserIdentity: Effect.Effect<convex_server38.UserIdentity, NoUserIdentityFoundError, never>;
}> & {
  use: <X>(body: (_: {
    getUserIdentity: Effect.Effect<convex_server38.UserIdentity, NoUserIdentityFoundError, never>;
  }) => X) => [X] extends [Effect.Effect<infer A, infer E, infer R>] ? Effect.Effect<A, E, Auth | R> : [X] extends [PromiseLike<infer A_1>] ? Effect.Effect<A_1, effect_Cause2.UnknownException, Auth> : Effect.Effect<X, never, Auth>;
};
declare class Auth extends Auth_base {}
declare const layer: (auth: Auth$1) => Layer.Layer<Auth, never, never>;
declare const NoUserIdentityFoundError_base: Schema.TaggedErrorClass<NoUserIdentityFoundError, "NoUserIdentityFoundError", {
  readonly _tag: Schema.tag<"NoUserIdentityFoundError">;
}>;
declare class NoUserIdentityFoundError extends NoUserIdentityFoundError_base {
  get message(): string;
}
//#endregion
export { Auth, Auth_d_exports, NoUserIdentityFoundError, layer };
//# sourceMappingURL=Auth.d.ts.map