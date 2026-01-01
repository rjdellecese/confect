const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/server/Auth.ts
var Auth_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	Auth: () => Auth,
	NoUserIdentityFoundError: () => NoUserIdentityFoundError,
	layer: () => layer
});
const make = (auth) => ({ getUserIdentity: effect.Effect.promise(() => auth.getUserIdentity()).pipe(effect.Effect.andThen((0, effect.flow)(effect.Option.fromNullable, effect.Option.match({
	onNone: () => effect.Effect.fail(new NoUserIdentityFoundError()),
	onSome: effect.Effect.succeed
})))) });
var Auth = class extends effect.Effect.Tag("@rjdellecese/confect/server/Auth")() {};
const layer = (auth) => effect.Layer.succeed(Auth, make(auth));
var NoUserIdentityFoundError = class extends effect.Schema.TaggedError("NoUserIdentityFoundError")("NoUserIdentityFoundError", {}) {
	get message() {
		return "No user identity found";
	}
};

//#endregion
exports.Auth = Auth;
Object.defineProperty(exports, 'Auth_exports', {
  enumerable: true,
  get: function () {
    return Auth_exports;
  }
});
exports.NoUserIdentityFoundError = NoUserIdentityFoundError;
exports.layer = layer;
//# sourceMappingURL=Auth.cjs.map