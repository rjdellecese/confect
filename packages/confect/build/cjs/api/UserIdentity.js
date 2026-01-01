const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let effect = require("effect");

//#region src/api/UserIdentity.ts
var UserIdentity_exports = /* @__PURE__ */ require_rolldown_runtime.__export({ UserIdentity: () => UserIdentity });
const UserIdentity = (customClaimsFields) => effect.Schema.Struct({
	...customClaimsFields,
	tokenIdentifier: effect.Schema.String,
	subject: effect.Schema.String,
	issuer: effect.Schema.String,
	name: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	givenName: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	familyName: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	nickname: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	preferredUsername: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	profileUrl: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	pictureUrl: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	email: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	emailVerified: effect.Schema.optionalWith(effect.Schema.Boolean, { exact: true }),
	gender: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	birthday: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	timezone: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	language: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	phoneNumber: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	phoneNumberVerified: effect.Schema.optionalWith(effect.Schema.Boolean, { exact: true }),
	address: effect.Schema.optionalWith(effect.Schema.String, { exact: true }),
	updatedAt: effect.Schema.optionalWith(effect.Schema.String, { exact: true })
});

//#endregion
exports.UserIdentity = UserIdentity;
Object.defineProperty(exports, 'UserIdentity_exports', {
  enumerable: true,
  get: function () {
    return UserIdentity_exports;
  }
});
//# sourceMappingURL=UserIdentity.cjs.map