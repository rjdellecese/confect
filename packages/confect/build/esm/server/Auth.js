import { __export } from "../_virtual/rolldown_runtime.js";
import { Effect, Layer, Option, Schema, flow } from "effect";

//#region src/server/Auth.ts
var Auth_exports = /* @__PURE__ */ __export({
	Auth: () => Auth,
	NoUserIdentityFoundError: () => NoUserIdentityFoundError,
	layer: () => layer
});
const make = (auth) => ({ getUserIdentity: Effect.promise(() => auth.getUserIdentity()).pipe(Effect.andThen(flow(Option.fromNullable, Option.match({
	onNone: () => Effect.fail(new NoUserIdentityFoundError()),
	onSome: Effect.succeed
})))) });
var Auth = class extends Effect.Tag("@rjdellecese/confect/server/Auth")() {};
const layer = (auth) => Layer.succeed(Auth, make(auth));
var NoUserIdentityFoundError = class extends Schema.TaggedError("NoUserIdentityFoundError")("NoUserIdentityFoundError", {}) {
	get message() {
		return "No user identity found";
	}
};

//#endregion
export { Auth, Auth_exports, NoUserIdentityFoundError, layer };
//# sourceMappingURL=Auth.js.map