import { FunctionSpec, GroupSpec, MiddlewareSpec } from "@confect/core";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";

export class SignedToken extends Context.Service<
  SignedToken,
  { readonly token: string }
>()(
  "confect-local-backend-fixtures/confect/groups/authentication.spec/SignedToken",
) {}

export class SignInMiddleware extends MiddlewareSpec.MiddlewareSpec<
  SignInMiddleware,
  { provides: SignedToken }
>()("SignInMiddleware", {
  functionTypes: { query: false, mutation: true, action: false },
}) {}

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "sign",
      args: () => ({
        aud: Schema.Union([
          Schema.String,
          Schema.String.pipe(Schema.Array, Schema.mutable),
        ]),
        expiresInSeconds: Schema.Finite,
        extraClaims: Schema.optionalKey(
          Schema.Record(
            Schema.String,
            Schema.Union([
              Schema.String,
              Schema.Finite,
              Schema.Boolean,
              Schema.Null,
              Schema.Array(Schema.String).pipe(Schema.mutable),
              Schema.Struct({
                enabled: Schema.Boolean,
                count: Schema.Finite,
                optional: Schema.Null,
              }),
            ]),
          ),
        ),
      }),
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "signInMiddleware",
      returns: () => Schema.String,
    }).middleware(SignInMiddleware),
  );
